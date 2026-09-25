"""
Editor de Corte — Stage 4: persistência de configuração + render/export final.

Pipeline: EditConfig (salvo em clip.clip_metadata["edit_config"]) -> RenderSpec
(resolução de fontes de vídeo + coordenadas em pixels) -> ffmpeg (filter_complex
com overlay por layer + legenda queimada via .ass/libass) -> mp4 final.

Deliberadamente SEPARADO de services/publish_export.py: aquele pipeline é para
publicação rápida do corte "como está" (preset fixo, sem layers). Este pipeline
compõe o que o usuário efetivamente montou no Editor (múltiplas layers,
posição/tamanho livres, legenda com wordsPerCaption/estilo/karaokê). Reaproveita
o MESMO padrão de job em memória (thread + dict) já usado em publish_export.py
e subtitle_sync_service.py — é o padrão idiomático para jobs curtos deste
projeto (ver auditoria: Task/Celery é para os estágios pesados do pipeline
principal, não para isto).

IMPORTANTE — por que não duplicar `syncedWords` dentro do edit_config: os
timestamps por palavra já são persistidos de forma durável em
`clip.clip_metadata["subtitle_sync"]["words"]` (ver subtitle_sync_service.py).
O edit_config só guarda a CONFIGURAÇÃO (wordsPerCaption, estilo, posição) — o
render lê as palavras direto do mesmo lugar que o endpoint de leitura de
legendas já usa (reaproveitando `_get_clip_subtitles_from_srt`/
`_inject_synced_timestamps` de subtitle_editor.py, não uma cópia). Isso evita
guardar duas fontes de verdade para o mesmo dado e o risco de ficarem
desalinhadas.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.utils.ffmpeg_utils import get_ffmpeg_path, get_ffprobe_path

logger = logging.getLogger(__name__)

EDIT_CONFIG_VERSION = 1

# Espelha frontend/src/components/editor/types.ts CANVAS_DIMENSIONS — precisa
# ficar em sync manualmente (TypeScript e Python não compartilham código); se
# um formato for adicionado lá, adicionar aqui também.
CANVAS_DIMENSIONS: Dict[str, Dict[str, int]] = {
    "9:16": {"width": 1080, "height": 1920},
    "16:9": {"width": 1920, "height": 1080},
    "1:1": {"width": 1080, "height": 1080},
}

RENDER_FPS = 30  # decisão simples para a v1 — ver limitações no relatório.

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_active_by_clip: Dict[str, str] = {}


class EditorRenderError(Exception):
    """Erro de validação/composição antes de chamar o ffmpeg (nunca chega a rodar o processo)."""


# ------------------------------------------------------------ EditConfig (persistência) ---

def validate_edit_config(config: Dict[str, Any]) -> List[str]:
    """Validação estrutural mínima (seção 26) — não valida se os assets/arquivos existem
    (isso é feito em build_render_spec, que tem acesso ao banco/projeto)."""
    errors: List[str] = []
    if not isinstance(config, dict):
        return ["edit_config não é um objeto"]
    if config.get("version") != EDIT_CONFIG_VERSION:
        errors.append(f"versão de edit_config não suportada: {config.get('version')!r}")
    canvas = config.get("canvas") or {}
    if canvas.get("format") not in CANVAS_DIMENSIONS:
        errors.append(f"formato de canvas inválido: {canvas.get('format')!r}")
    layers = config.get("layers")
    if not isinstance(layers, list) or not layers:
        errors.append("edit_config sem layers")
        return errors
    if not any(l.get("isMain") for l in layers):
        errors.append("nenhuma layer principal (isMain=true) encontrada")
    for i, l in enumerate(layers):
        t = l.get("transform") or {}
        for k in ("x", "y", "width", "height"):
            if not isinstance(t.get(k), (int, float)):
                errors.append(f"layer {i} ({l.get('id')}): transform.{k} inválido")
        if not l.get("isMain") and not l.get("assetId"):
            errors.append(f"layer {i} ({l.get('id')}): vídeo secundário sem assetId (upload não concluído)")
        start = l.get("startTime")
        end = l.get("endTime")
        if isinstance(start, (int, float)) and isinstance(end, (int, float)) and end <= start:
            errors.append(f"layer {i} ({l.get('id')}): endTime deve ser > startTime")
    return errors


def merge_edit_config(clip_metadata: Optional[Dict[str, Any]], edit_config: Dict[str, Any]) -> Dict[str, Any]:
    """Read-merge-write — mesmo padrão de subtitle_sync_service.py (nunca substitui o
    clip_metadata inteiro, só a chave edit_config)."""
    metadata = dict(clip_metadata or {})
    metadata["edit_config"] = edit_config
    return metadata


# ------------------------------------------------------------------- Assets do Editor ---

def _editor_assets_dir(project_id: str) -> Path:
    from backend.core.path_utils import get_project_directory
    d = get_project_directory(project_id) / "editor_assets"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_editor_asset(project_id: str, filename: str, content: bytes) -> Dict[str, Any]:
    """Salva um vídeo secundário adicionado no Editor (upload real de arquivo — nunca um
    URL.createObjectURL do navegador, que o backend não tem acesso a). Guardado por
    projeto, fora de raw/output do pipeline principal, para nunca colidir com eles
    (seção 8/9). Retorna {asset_id, duration} — o path físico é interno, nunca
    devolvido ao frontend (seção 32)."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in (".mp4", ".mov", ".webm", ".mkv", ".m4v"):
        raise EditorRenderError(f"Formato de vídeo não suportado: {suffix or '(sem extensão)'}")
    asset_id = uuid.uuid4().hex
    path = _editor_assets_dir(project_id) / f"{asset_id}{suffix}"
    path.write_bytes(content)
    info = _probe(path)
    return {"asset_id": asset_id, "duration": info.get("duration") or 0.0}


def resolve_editor_asset_path(project_id: str, asset_id: str) -> Path:
    """Resolve um asset_id para um path físico, validando que ele fica dentro da pasta
    de assets do projeto (nunca aceita um path arbitrário do frontend — seção 32)."""
    if not re.fullmatch(r"[0-9a-f]{32}", asset_id or ""):
        raise EditorRenderError("asset_id inválido")
    base = _editor_assets_dir(project_id).resolve()
    matches = list(base.glob(f"{asset_id}.*"))
    if not matches:
        raise EditorRenderError(f"Asset não encontrado: {asset_id}")
    path = matches[0].resolve()
    if base not in path.parents and path.parent != base:
        raise EditorRenderError("Path de asset fora da área permitida")
    return path


# --------------------------------------------------------------- Fonte do vídeo principal ---

def resolve_main_clip_video_path(db: Session, project_id: str, clip_id: str) -> Path:
    """Mesma resolução usada por GET /projects/{project_id}/clips/{clip_id}
    (backend/api/v1/projects.py get_project_clip) — reaproveitada aqui em vez de
    duplicar a regra, para nunca divergir de qual arquivo é "o vídeo do clip"."""
    from backend.core.path_utils import get_project_directory
    from backend.models.clip import Clip

    project_dir = get_project_directory(project_id)
    clips_dir = project_dir / "output" / "clips"
    video_files = list(clips_dir.glob(f"{clip_id}_*.mp4")) if clips_dir.exists() else []
    if video_files:
        return video_files[0]

    clip = db.query(Clip).filter(Clip.id == clip_id).first()
    if clip and clip.video_path:
        p = Path(clip.video_path)
        if p.exists():
            return p
    raise EditorRenderError(f"Vídeo do corte não encontrado (clip_id={clip_id})")


# --------------------------------------------------------------------------- RenderSpec ---

@dataclass
class RenderLayerSpec:
    input_path: Path
    x: int
    y: int
    width: int
    height: int
    z_index: int
    start_time: float
    end_time: float
    has_audio: bool


@dataclass
class RenderSpec:
    canvas_width: int
    canvas_height: int
    fps: int
    duration: float
    background_color: str
    layers: List[RenderLayerSpec] = field(default_factory=list)
    subtitle_ass_path: Optional[Path] = None


def _even(n: int) -> int:
    n = max(2, int(round(n)))
    return n if n % 2 == 0 else n + 1


def build_render_spec(
    db: Session, project_id: str, clip_id: str, edit_config: Dict[str, Any], tmp_dir: Path,
) -> RenderSpec:
    errors = validate_edit_config(edit_config)
    if errors:
        raise EditorRenderError("edit_config inválido: " + "; ".join(errors))

    canvas = edit_config["canvas"]
    dims = CANVAS_DIMENSIONS[canvas["format"]]
    cw, ch = dims["width"], dims["height"]

    main_path = resolve_main_clip_video_path(db, project_id, clip_id)
    main_info = _probe(main_path)
    duration = float(main_info.get("duration") or 0.0)
    if duration <= 0:
        raise EditorRenderError("Não foi possível determinar a duração do vídeo principal")

    layers: List[RenderLayerSpec] = []
    for l in sorted(edit_config["layers"], key=lambda x: x.get("zIndex", 0)):
        if not l.get("visible", True):
            continue
        if l.get("isMain"):
            input_path = main_path
            start_time = 0.0
            end_time = duration
            has_audio = True
        else:
            input_path = resolve_editor_asset_path(project_id, l["assetId"])
            start_time = float(l.get("startTime") or 0.0)
            raw_end = l.get("endTime")
            end_time = min(float(raw_end), duration) if isinstance(raw_end, (int, float)) else duration
            if end_time <= start_time:
                continue
            has_audio = False  # decisão de política de áudio — ver seção 16 no relatório.
        t = l["transform"]
        layers.append(RenderLayerSpec(
            input_path=input_path,
            x=_even(t["x"] * cw), y=_even(t["y"] * ch),
            width=_even(t["width"] * cw), height=_even(t["height"] * ch),
            z_index=int(l.get("zIndex", 0)),
            start_time=start_time, end_time=end_time,
            has_audio=has_audio,
        ))

    if not layers:
        raise EditorRenderError("Nenhuma layer visível para renderizar")

    subtitle_cfg = edit_config.get("subtitle") or {}
    ass_path = _build_subtitle_ass(
        db=db, project_id=project_id, clip_id=clip_id,
        subtitle_cfg=subtitle_cfg, canvas_w=cw, canvas_h=ch, tmp_dir=tmp_dir,
    )

    bg_color = ((canvas.get("background") or {}).get("color")) or "#000000"
    return RenderSpec(
        canvas_width=cw, canvas_height=ch, fps=RENDER_FPS, duration=duration,
        background_color=bg_color, layers=layers, subtitle_ass_path=ass_path,
    )


# ---------------------------------------------------------- Agrupamento de legendas (Python) ---
# Porta EXATA de frontend/src/components/editor/types.ts groupWordsIntoSegments — mesmas
# constantes, mesma ordem de condições. Ver test_editor_render_service.py para o teste de
# equivalência (seção 19/44 item 5): qualquer mudança aqui OU lá precisa ser replicada nos
# dois lados, ou o render vai divergir do preview.
AUTO_MAX_WORDS = 8
AUTO_MAX_CHARS = 42
NATURAL_PAUSE_GAP_SECONDS = 0.6
_SENTENCE_END_RE = re.compile(r"[.!?;]$")


def group_words_into_segments(words: List[Dict[str, Any]], mode: Any) -> List[Dict[str, Any]]:
    if not words:
        return []
    max_words = AUTO_MAX_WORDS if mode == "auto" else int(mode)
    groups: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    current_chars = 0

    def flush():
        nonlocal current, current_chars
        if current:
            groups.append(current)
            current = []
            current_chars = 0

    n = len(words)
    for i, w in enumerate(words):
        current.append(w)
        current_chars += len(w["text"]) + 1
        nxt = words[i + 1] if i + 1 < n else None
        pause = (nxt["startTime"] - w["endTime"]) if nxt else float("inf")
        reached_limit = len(current) >= max_words or (mode == "auto" and current_chars >= AUTO_MAX_CHARS)
        sentence_end = mode == "auto" and bool(_SENTENCE_END_RE.search(w["text"]))
        if nxt is None or sentence_end or pause >= NATURAL_PAUSE_GAP_SECONDS or reached_limit:
            flush()
    flush()

    return [
        {
            "startTime": g[0]["startTime"],
            "endTime": g[-1]["endTime"],
            "words": g,
        }
        for g in groups
    ]


def enforce_monotonic_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Passada única que garante blocos de legenda estritamente não-sobrepostos e crescentes
    no tempo — necessário porque um clip com sincronização precisa (subtitle_sync_service.py)
    pode ter blocos vizinhos com sobreposição GRANDE, não só um empate de arredondamento (bug
    real encontrado testando o render: dois blocos apareciam desenhados um sobre o outro, texto
    ilegível — rastreado até palavras em clip_metadata.subtitle_sync.words fora de ordem
    cronológica entre os segmentos originais do SRT; ver limitação no relatório desta stage —
    a correção da causa raiz fica fora do escopo aqui, isso só protege o BURN da legenda).
    Blocos que ficariam com duração residual muito curta depois do ajuste são descartados
    (melhor sem legenda naquele instante do que uma legenda visualmente quebrada)."""
    cursor = 0.0
    kept: List[Dict[str, Any]] = []
    for seg in segments:
        start = max(seg["startTime"], cursor)
        end = seg["endTime"]
        if end - start < 0.05:
            continue
        kept.append({**seg, "startTime": start, "endTime": end})
        cursor = end
    return kept


def _load_flat_words_for_render(db: Session, project_id: str, clip_id: str) -> List[Dict[str, Any]]:
    """Mesma fonte usada por GET /subtitle-editor/{project_id}/clips/{clip_id}/subtitles —
    importa e chama as funções de lá em vez de duplicá-las (ver docstring do módulo)."""
    from backend.api.v1.subtitle_editor import _get_clip_subtitles_from_srt, _inject_synced_timestamps
    from backend.utils.subtitle_processor import SubtitleProcessor
    from backend.models.clip import Clip

    clip = db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
    if not clip:
        raise EditorRenderError(f"Corte não encontrado (clip_id={clip_id})")

    try:
        clip_subtitles = _get_clip_subtitles_from_srt(project_id, clip, SubtitleProcessor())
    except Exception:
        return []  # corte sem legenda disponível — render segue sem legenda (não é erro fatal).

    sync_meta = (clip.clip_metadata or {}).get("subtitle_sync")
    if isinstance(sync_meta, dict) and sync_meta.get("status") == "synced":
        synced_words = sync_meta.get("words") or []
        total_words = sum(len(seg["words"]) for seg in clip_subtitles)
        if synced_words and len(synced_words) == total_words:
            clip_subtitles = _inject_synced_timestamps(clip_subtitles, synced_words)

    return [w for seg in clip_subtitles for w in seg["words"]]


def _ass_color(hex_color: str) -> str:
    h = (hex_color or "#FFFFFF").lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


_CJK_RE = re.compile(r"[一-鿿぀-ヿ가-힣]")


def _resolve_ass_font(text_sample: str, requested_family: str) -> str:
    if _CJK_RE.search(text_sample or ""):
        from backend.services.publish_export import resolve_cjk_font
        font_path = resolve_cjk_font()
        if font_path:
            name = font_path.stem
            # Nomes de arquivo conhecidos -> nome de família real (o ffmpeg/libass
            # resolve por nome de família, não por caminho de arquivo).
            known = {"msyh": "Microsoft YaHei", "PingFang": "PingFang SC", "STHeiti Light": "STHeiti Light"}
            return known.get(name, name)
    first = (requested_family or "Inter").split(",")[0].strip().strip("'\"")
    return first or "Inter"


def _build_subtitle_ass(
    db: Session, project_id: str, clip_id: str, subtitle_cfg: Dict[str, Any],
    canvas_w: int, canvas_h: int, tmp_dir: Path,
) -> Optional[Path]:
    words = _load_flat_words_for_render(db, project_id, clip_id)
    if not words:
        return None

    mode = subtitle_cfg.get("wordsPerCaption", "auto")
    segments = group_words_into_segments(words, mode)
    if not segments:
        return None

    style = subtitle_cfg.get("style") or {}
    position = subtitle_cfg.get("position") or {}
    animation = style.get("animation", "none")
    outline = style.get("outline") or {}

    sample_text = " ".join(w["text"] for seg in segments for w in seg["words"][:3])
    font_name = _resolve_ass_font(sample_text, style.get("fontFamily", "Inter"))
    font_size = int(style.get("fontSize", 46))
    primary = _ass_color(style.get("color", "#FFFFFF"))
    highlight = _ass_color(style.get("highlightColor", "#2D6BFF"))
    outline_color = _ass_color(outline.get("color", "#000000")) if outline.get("enabled", True) else "&H00000000"
    outline_width = int(outline.get("width", 2)) if outline.get("enabled", True) else 0
    bold = -1 if int(style.get("fontWeight", 700)) >= 600 else 0

    x_px = float(position.get("x", 0.07)) * canvas_w
    y_px = float(position.get("y", 0.78)) * canvas_h
    width_px = float(position.get("width", 0.86)) * canvas_w
    center_x = x_px + width_px / 2

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {canvas_w}
PlayResY: {canvas_h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary},{highlight},{outline_color},&H00000000,{bold},0,0,0,100,100,0,0,1,{outline_width},0,8,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def _srt_ts(sec: float) -> str:
        # Arredonda pro centésimo mais próximo em INTEIRO de centésimos primeiro (nunca em
        # segundos fracionados) — evita "60.00s" virar "1:00.00" errado E evita cs=100
        # (segundo 59.996 arredondando pra ".100" em vez de carregar pro segundo seguinte).
        total_cs = int(round(max(0.0, sec) * 100))
        cs = total_cs % 100
        total_sec = total_cs // 100
        h, rem = divmod(total_sec, 3600)
        m, s = divmod(rem, 60)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    def _escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")

    segments = enforce_monotonic_segments(segments)
    if not segments:
        return None

    lines: List[str] = []
    pos_tag = f"{{\\an8\\pos({center_x:.1f},{y_px:.1f})}}"
    for seg in segments:
        if animation == "karaoke":
            parts = []
            for w in seg["words"]:
                cs = max(1, int(round((w["endTime"] - w["startTime"]) * 100)))
                parts.append(f"{{\\kf{cs}}}{_escape(w['text'])} ")
            text = pos_tag + "".join(parts).rstrip()
        else:
            text = pos_tag + _escape(" ".join(w["text"] for w in seg["words"]))
        lines.append(
            f"Dialogue: 0,{_srt_ts(seg['startTime'])},{_srt_ts(seg['endTime'])},Default,,0,0,0,,{text}"
        )

    ass_path = tmp_dir / f"{clip_id}_subs.ass"
    ass_path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    return ass_path


# ------------------------------------------------------------------------------- ffmpeg ---

def _escape_filter_path(p: Path) -> str:
    return str(p.resolve()).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")


def _build_ffmpeg_command(spec: RenderSpec, out_path: Path) -> List[str]:
    ffmpeg = get_ffmpeg_path()
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error"]

    cmd += ["-f", "lavfi", "-t", f"{spec.duration:.3f}",
            "-i", f"color=c={spec.background_color}:s={spec.canvas_width}x{spec.canvas_height}:r={spec.fps}"]

    input_offset = 1  # índice 0 é o color= de base
    audio_input_idx: Optional[int] = None
    for layer in spec.layers:
        cmd += ["-i", str(layer.input_path)]
        if layer.has_audio and audio_input_idx is None:
            audio_input_idx = input_offset
        input_offset += 1

    filter_parts: List[str] = []
    last = "0:v"
    for i, layer in enumerate(spec.layers):
        in_idx = i + 1
        vtag = f"scaled{i}"
        filter_parts.append(
            f"[{in_idx}:v]scale={layer.width}:{layer.height},setpts=PTS-STARTPTS+{layer.start_time:.3f}/TB[{vtag}]"
        )
        out_tag = f"comp{i}"
        enable = f"between(t,{layer.start_time:.3f},{layer.end_time:.3f})"
        filter_parts.append(
            f"[{last}][{vtag}]overlay=x={layer.x}:y={layer.y}:eof_action=repeat:enable='{enable}'[{out_tag}]"
        )
        last = out_tag

    if spec.subtitle_ass_path is not None:
        filter_parts.append(f"[{last}]ass='{_escape_filter_path(spec.subtitle_ass_path)}'[outv]")
        last = "outv"

    cmd += ["-filter_complex", ";".join(filter_parts), "-map", f"[{last}]"]
    if audio_input_idx is not None:
        cmd += ["-map", f"{audio_input_idx}:a?"]

    cmd += [
        "-r", str(spec.fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        "-y", str(out_path),
    ]
    return cmd


def _probe(path: Path) -> Dict[str, Any]:
    try:
        cmd = [get_ffprobe_path(), "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path)]
        raw = subprocess.check_output(cmd, text=True, encoding="utf-8", errors="ignore")
        data = json.loads(raw)
        stream = (data.get("streams") or [{}])[0]
        return {
            "width": stream.get("width"), "height": stream.get("height"),
            "duration": round(float((data.get("format") or {}).get("duration") or 0), 3),
        }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"ffprobe falhou: {e}")
        return {}


# --------------------------------------------------------------------------------- Jobs ---

def render_clip(db: Session, project_id: str, clip_id: str, edit_config: Dict[str, Any]) -> Dict[str, Any]:
    """Renderização síncrona — chamada de dentro do job em background (_run_render_job)."""
    from backend.core.path_utils import get_project_directory

    tmp_dir = Path(tempfile.mkdtemp(prefix="ac-editor-render-"))
    try:
        spec = build_render_spec(db, project_id, clip_id, edit_config, tmp_dir)

        out_dir = get_project_directory(project_id) / "output" / "editor_renders"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{clip_id}_{uuid.uuid4().hex[:8]}.mp4"

        cmd = _build_ffmpeg_command(spec, out_path)
        logger.info("Editor render: %s", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
            raise EditorRenderError((proc.stderr or proc.stdout or "ffmpeg falhou")[-1500:])

        info = _probe(out_path)
        return {
            "ok": True, "path": str(out_path),
            "width": info.get("width") or spec.canvas_width,
            "height": info.get("height") or spec.canvas_height,
            "duration_sec": info.get("duration") or spec.duration,
        }
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


def start_render(project_id: str, clip_id: str) -> Dict[str, Any]:
    with _jobs_lock:
        existing = _active_by_clip.get(clip_id)
        if existing and _jobs.get(existing, {}).get("status") in ("queued", "processing"):
            # Evita disparar dois renders em paralelo para o mesmo corte (seção 28).
            return {"ok": True, "job_id": existing, "status": _jobs[existing]["status"], "reused": True}
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {"job_id": job_id, "status": "queued", "progress": 0,
                          "project_id": project_id, "clip_id": clip_id}
        _active_by_clip[clip_id] = job_id
    t = threading.Thread(target=_run_render_job, args=(job_id, project_id, clip_id),
                          daemon=True, name=f"editor-render-{job_id[:8]}")
    t.start()
    return {"ok": True, "job_id": job_id, "status": "queued"}


def _run_render_job(job_id: str, project_id: str, clip_id: str) -> None:
    from backend.core.database import SessionLocal
    from backend.models.clip import Clip

    with _jobs_lock:
        _jobs[job_id].update(status="processing", progress=10)
    db = SessionLocal()
    try:
        clip = db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
        if not clip:
            raise EditorRenderError("Corte não encontrado")
        edit_config = (clip.clip_metadata or {}).get("edit_config")
        if not edit_config:
            raise EditorRenderError("Nenhuma edição salva para este corte (salve antes de exportar)")

        with _jobs_lock:
            _jobs[job_id].update(progress=25)
        result = render_clip(db, project_id, clip_id, edit_config)
        with _jobs_lock:
            _jobs[job_id].update(status="completed", progress=100, result=result,
                                  completed_at=datetime.now(timezone.utc).isoformat())
    except Exception as e:  # noqa: BLE001
        logger.exception("Falha no render do Editor (job %s, clip %s)", job_id, clip_id)
        with _jobs_lock:
            _jobs[job_id].update(status="failed", progress=100, error=str(e)[:800])
    finally:
        db.close()
        with _jobs_lock:
            if _active_by_clip.get(clip_id) == job_id:
                _active_by_clip.pop(clip_id, None)


def get_render_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None
