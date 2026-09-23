"""
Sincronização precisa de legendas — Editor de Corte (Etapa 2, evolução).

A geração inicial do SRT (ver utils/subtitle_processor.py) distribui o tempo
de cada palavra linearmente dentro do segmento — não tem nenhuma relação com
o áudio real. Este módulo faz uma segunda passada, sob demanda do usuário,
que roda o faster-whisper (o mesmo motor já usado pelo app para gerar o SRT
inicial, ver utils/speech_recognizer.py e services/whisper_runtime.py) com
`word_timestamps=True` sobre o arquivo de vídeo do PRÓPRIO clip.

Como esse arquivo já é o corte físico do vídeo original (0 = início do
clip), os timestamps que o Whisper devolve já nascem relativos ao clip —
não há nenhum offset para aplicar.

IMPORTANTE — por que por SEGMENTO e não o clip inteiro de uma vez: a primeira
versão rodava o Whisper sobre o clip inteiro (até ~2min) e comparava tudo
contra o texto original numa única correspondência global (difflib). Testado
com dados reais, isso falhava muito: assim que a transcrição do Whisper
divergia do texto original em um ponto (gíria, "né"/"tá"/"ó", palavra
composta), o alinhamento raramente recuperava depois — ~90% das palavras
caíam no fallback por interpolação, espalhado por dezenas de segundos, o que
não é melhor que a estimativa linear antiga. A correção: extrai e transcreve
o áudio de CADA segmento isoladamente (janela pequena, com uma margem de
folga), e alinha cada segmento contra seu próprio texto. Um erro de
transcrição fica contido a poucos segundos, nunca contamina o clip inteiro —
é o mesmo princípio usado por ferramentas como 2short.ai (refinar o
texto/tempo já existente por trecho, não re-transcrever tudo do zero de uma
vez).

O texto das legendas já existentes é preservado: os timestamps reais do
Whisper são alinhados de volta às palavras originais por correspondência de
sequência (difflib) DENTRO de cada segmento. Trechos sem correspondência
direta usam interpolação linear ANCORADA entre as correspondências reais
vizinhas mais próximas — nunca mais um span maior que o próprio segmento (+
a margem de folga).

Roda como job em memória (thread + dict protegido por lock), no mesmo
espírito do que já existe em services/publish_export.py — não é uma
operação de playback, só dispara quando o usuário pede.
"""
import difflib
import logging
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_jobs: Dict[str, dict] = {}
_jobs_lock = threading.Lock()
# clip_id -> job_id do job ativo (evita disparar duas sincronizações em paralelo para o mesmo corte)
_active_by_clip: Dict[str, str] = {}

_WORD_NORMALIZE_RE = re.compile(r"[^\w']+", re.UNICODE)

# "base" tem baixa acurácia para fala rápida/coloquial (giria, "né"/"tá"/"ó") — testado com
# dados reais neste projeto. "small" reconhece bem mais granularmente, à custa de mais
# tempo/download (~488MB). Como agora cada chamada só processa alguns segundos de áudio por
# vez (ver módulo acima), o custo extra por chamada é pequeno.
DEFAULT_MODEL = "small"

# Margem de folga em cada lado da janela de um segmento: absorve pequena imprecisão do tempo
# aproximado (estimativa linear) sem deixar a janela grande o bastante para reintroduzir o
# problema do alinhamento global (ver docstring do módulo).
WINDOW_PADDING_SECONDS = 1.2

# Depois de transcrever a janela (que inclui a margem acima para o Whisper ter contexto de
# áudio e não cortar uma palavra ao meio), descarta palavras reconhecidas fora do miolo do
# segmento antes de alinhar. Sem isso, um pedaço de fala "vazado" da margem (do segmento
# vizinho) entra na lista e descasa TODO o alinhamento da janela — numa lista curta (poucas
# palavras por segmento), uma palavra a mais na borda já é o suficiente para o difflib nunca
# mais recuperar o sincronismo pro resto da janela.
CORE_MATCH_TOLERANCE_SECONDS = 0.5


def _normalize(word: str) -> str:
    return _WORD_NORMALIZE_RE.sub('', word).lower()


def _set_job(job_id: str, **kw) -> None:
    with _jobs_lock:
        _jobs.setdefault(job_id, {}).update(kw)


def get_job(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def start_sync(project_id: str, clip_id: str, original_segments: List[dict]) -> str:
    """Inicia (ou reaproveita, se já houver uma em andamento) a sincronização
    deste corte. `original_segments` é a lista de segmentos já existentes (SRT
    original) na forma [{"startTime","endTime","words":[{"id","text"},...]}],
    usada tanto para as janelas de áudio a extrair quanto para preservar o
    texto durante o alinhamento."""
    with _jobs_lock:
        active = _active_by_clip.get(clip_id)
        if active and _jobs.get(active, {}).get("status") not in ("synced", "error"):
            return active
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {
            "status": "analyzing_audio", "progress": 5, "error": None,
            "project_id": project_id, "clip_id": clip_id,
        }
        _active_by_clip[clip_id] = job_id

    thread = threading.Thread(
        target=_run_sync, args=(job_id, project_id, clip_id, original_segments),
        name=f"subtitle-sync-{job_id[:8]}", daemon=True,
    )
    thread.start()
    return job_id


def _extract_window_audio(ffmpeg_bin: str, video_path: Path, start: float, duration: float, out_path: Path) -> None:
    """Corta só a janela [start, start+duration) do vídeo do clip para um WAV mono 16kHz —
    mesmo formato que o Whisper já espera (ver utils/speech_recognizer.py). `-ss` antes de
    `-i` é o mesmo padrão de seek rápido já usado no resto do projeto para extrair clipes."""
    cmd = [
        ffmpeg_bin, '-y',
        '-ss', f'{max(0.0, start):.3f}',
        '-i', str(video_path),
        '-t', f'{max(0.05, duration):.3f}',
        '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"Falha ao extrair áudio do trecho: {result.stderr[-300:] if result.stderr else 'erro desconhecido'}")


def _transcribe_words(model, audio_path: Path) -> List[dict]:
    """Transcreve um único arquivo de áudio (janela curta) e devolve as palavras
    reconhecidas, com timestamps relativos ao INÍCIO DESSE ARQUIVO (o chamador soma o
    offset da janela). Filtra palavras cujo tempo "volta atrás" em relação à anterior —
    o VAD do faster-whisper ocasionalmente reprocessa o fim de um trecho em mais de um
    chunk; isso é raro em janelas curtas, mas não custa nada manter a checagem."""
    seg_iter, _info = model.transcribe(str(audio_path), vad_filter=True, word_timestamps=True)
    words: List[dict] = []
    last_end = -1.0
    for seg in seg_iter:
        if not seg.words:
            continue
        for w in seg.words:
            text = (w.word or "").strip()
            if not text:
                continue
            start, end = float(w.start), float(w.end)
            if start < last_end:
                continue
            words.append({"text": text, "startTime": start, "endTime": end})
            last_end = end
    return words


def _linear_fallback_for_segment(seg: dict, seg_words: List[dict]) -> List[dict]:
    """Mesma divisão linear que a geração original do SRT já usava
    (subtitle_processor._split_text_to_words), mas só para ESTE segmento — usada quando não
    há áudio reconhecido na janela, ou quando o que foi reconhecido não corresponde ao texto
    esperado (ver MIN_ALIGNMENT_SIMILARITY em _align_words). "Menos preciso" é preferível a
    "precisamente errado"."""
    seg_duration = seg["endTime"] - seg["startTime"]
    each = seg_duration / len(seg_words)
    return [
        {
            "id": w["id"], "text": w["text"],
            "startTime": round(seg["startTime"] + k * each, 3),
            "endTime": round(seg["startTime"] + (k + 1) * each, 3),
        }
        for k, w in enumerate(seg_words)
    ]


def _run_sync(job_id: str, project_id: str, clip_id: str, original_segments: List[dict]) -> None:
    tmp_dir: Optional[Path] = None
    try:
        if not original_segments:
            raise RuntimeError("Este corte não possui legendas para sincronizar.")

        from ..core.database import SessionLocal
        from ..models.clip import Clip
        from . import whisper_runtime
        from ..utils.ffmpeg_utils import get_ffmpeg_path

        if not whisper_runtime.is_installed():
            raise RuntimeError(
                "O runtime do Whisper não está instalado. Vá em Configurações → "
                "Reconhecimento de voz, instale o Whisper e tente novamente."
            )

        ffmpeg_bin = get_ffmpeg_path()
        if not ffmpeg_bin:
            raise RuntimeError("ffmpeg não encontrado — não é possível extrair o áudio do corte.")

        db = SessionLocal()
        try:
            clip = db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
            if not clip:
                raise RuntimeError("Corte não encontrado.")
            video_path = Path(clip.video_path or "")
            if not video_path.exists():
                raise RuntimeError("Arquivo de vídeo deste corte não foi encontrado no disco.")

            _set_job(job_id, status="analyzing_audio", progress=10)

            whisper_runtime.ensure_on_path()
            from faster_whisper import WhisperModel

            models_dir = str(whisper_runtime.get_models_dir() / "hub")
            model = WhisperModel(DEFAULT_MODEL, device="auto", compute_type="int8", download_root=models_dir)

            tmp_dir = Path(tempfile.mkdtemp(prefix="autoclip-subsync-"))
            aligned_segments: List[List[dict]] = []
            total = len(original_segments)

            _set_job(job_id, status="aligning_words", progress=15)

            for i, seg in enumerate(original_segments):
                seg_words = seg.get("words") or []
                if not seg_words:
                    aligned_segments.append([])
                    continue

                window_start = max(0.0, seg["startTime"] - WINDOW_PADDING_SECONDS)
                window_duration = (seg["endTime"] - seg["startTime"]) + 2 * WINDOW_PADDING_SECONDS
                audio_path = tmp_dir / f"seg-{i}.wav"

                try:
                    _extract_window_audio(ffmpeg_bin, video_path, window_start, window_duration, audio_path)
                    whisper_words = _transcribe_words(model, audio_path)
                finally:
                    audio_path.unlink(missing_ok=True)

                if whisper_words:
                    # Os tempos vieram relativos ao INÍCIO DA JANELA extraída — soma de volta
                    # o offset da janela para ficarem relativos ao clip, como o resto do dado.
                    for w in whisper_words:
                        w["startTime"] += window_start
                        w["endTime"] += window_start
                    # Só o miolo do segmento entra no alinhamento — ver CORE_MATCH_TOLERANCE_SECONDS.
                    core_lo = seg["startTime"] - CORE_MATCH_TOLERANCE_SECONDS
                    core_hi = seg["endTime"] + CORE_MATCH_TOLERANCE_SECONDS
                    core_words = [w for w in whisper_words if core_lo <= (w["startTime"] + w["endTime"]) / 2 <= core_hi]
                    aligned, matched_any = _align_words(seg_words, core_words or whisper_words)
                    if matched_any:
                        aligned_segments.append(aligned)
                    else:
                        # Nada no áudio deste segmento bateu com o texto esperado (ver
                        # MIN_ALIGNMENT_SIMILARITY) — os limites do whisper_words não são
                        # confiáveis aqui (podem vir de conteúdo sem relação nenhuma com o
                        # segmento). Cai no mesmo fallback linear do caso "sem áudio" abaixo,
                        # em vez de usar um "resultado real" que na verdade é falso.
                        logger.warning(
                            f"Sincronização: segmento {i} do clip {clip_id} rejeitado por baixa "
                            f"similaridade (texto esperado não corresponde ao áudio reconhecido "
                            f"nesta janela) — usando estimativa linear só para este segmento."
                        )
                        aligned_segments.append(_linear_fallback_for_segment(seg, seg_words))
                else:
                    # Nenhuma palavra reconhecida nesta janela (raro): recai na mesma
                    # divisão linear que a geração original do SRT já usava, mas só para
                    # ESTE segmento (poucos segundos), em vez de falhar a sincronização
                    # inteira por causa de um trecho isolado (ex.: ruído, risada, silêncio).
                    aligned_segments.append(_linear_fallback_for_segment(seg, seg_words))

                _set_job(job_id, status="aligning_words", progress=15 + int(70 * (i + 1) / total))

            aligned = [w for seg in aligned_segments for w in seg]

            _set_job(job_id, status="aligning_words", progress=90)

            synced_at = datetime.now(timezone.utc).isoformat()
            sync_payload = {
                "version": 1,
                "status": "synced",
                "synced_at": synced_at,
                "model": DEFAULT_MODEL,
                "words": aligned,
            }
            metadata = dict(clip.clip_metadata or {})
            metadata["subtitle_sync"] = sync_payload
            clip.clip_metadata = metadata
            db.commit()

            _set_job(job_id, status="synced", progress=100, error=None, synced_at=synced_at, word_count=len(aligned))
        finally:
            db.close()
    except Exception as e:  # noqa: BLE001
        logger.error(f"Falha na sincronização de legendas (job {job_id}, clip {clip_id}): {e}", exc_info=True)
        _set_job(job_id, status="error", error=str(e))
    finally:
        if tmp_dir is not None:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        with _jobs_lock:
            if _active_by_clip.get(clip_id) == job_id:
                _active_by_clip.pop(clip_id, None)


# Blocos 'replace' de mesma contagem só são aceitos se o texto reconhecido pelo Whisper for
# realmente parecido com o texto esperado da legenda (não só do mesmo TAMANHO). Sem essa
# checagem, um segmento cujo áudio não tem nada a ver com o texto (ex.: legenda de outro
# vídeo, ver diagnóstico) ainda "casava" palavra por palavra só por coincidência de contagem,
# produzindo timestamps confiantes e completamente errados. Medido com difflib.ratio() sobre
# o texto normalizado do bloco inteiro: variações legítimas (maiúscula/pontuação/pausas) ficam
# em ~0.85-1.0; conteúdo de fato diferente cai pra ~0.1-0.3 (testado com dados reais — ver
# commit). 0.6 fica com folga confortável no meio desse vão.
MIN_ALIGNMENT_SIMILARITY = 0.6


def _block_similarity(orig_words: List[str], whisper_words: List[str]) -> float:
    a = ' '.join(orig_words)
    b = ' '.join(whisper_words)
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def _align_words(original_words: List[dict], whisper_words: List[dict]) -> Tuple[List[dict], bool]:
    """Alinha os timestamps reais do Whisper de volta ao texto original,
    preservando as palavras já existentes. Usa correspondência de sequência
    (difflib) sobre as formas normalizadas (minúsculas, sem pontuação) para
    casar a maior parte das palavras diretamente; trechos sem correspondência
    exata são preenchidos por interpolação linear ancorada entre as
    correspondências reais vizinhas (nunca span do segmento inteiro).

    Devolve (result, matched_any). matched_any=False significa que NADA no áudio
    reconhecido bateu com o texto esperado — o chamador deve descartar `result`
    (os limites usados pra interpolar não são confiáveis) e usar o fallback de
    segmento inteiro."""
    orig_norm = [_normalize(w["text"]) for w in original_words]
    whisper_norm = [_normalize(w["text"]) for w in whisper_words]

    matcher = difflib.SequenceMatcher(a=orig_norm, b=whisper_norm, autojunk=False)
    result: List[Optional[dict]] = [None] * len(original_words)
    matched_any = False

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            accept = True
        elif tag == 'replace' and (i2 - i1) == (j2 - j1):
            similarity = _block_similarity(orig_norm[i1:i2], whisper_norm[j1:j2])
            accept = similarity >= MIN_ALIGNMENT_SIMILARITY
            if not accept:
                logger.info(
                    f"Alinhamento rejeitado (similaridade {similarity:.2f} < "
                    f"{MIN_ALIGNMENT_SIMILARITY}): esperado {orig_norm[i1:i2]!r} vs "
                    f"reconhecido {whisper_norm[j1:j2]!r}"
                )
        else:
            accept = False
        if accept:
            matched_any = True
            for offset in range(i2 - i1):
                w = whisper_words[j1 + offset]
                orig = original_words[i1 + offset]
                result[i1 + offset] = {
                    "id": orig["id"], "text": orig["text"],
                    "startTime": w["startTime"], "endTime": w["endTime"],
                }
        # Rejeitado, ou 'delete' / 'insert' / 'replace' com contagens diferentes: preenchidos abaixo.

    if not matched_any:
        return result, False

    n = len(result)
    idx = 0
    while idx < n:
        if result[idx] is not None:
            idx += 1
            continue
        gap_start = idx
        while idx < n and result[idx] is None:
            idx += 1
        gap_end = idx  # exclusivo

        prev_end = result[gap_start - 1]["endTime"] if gap_start > 0 else (
            whisper_words[0]["startTime"] if whisper_words else 0.0
        )
        next_start = result[gap_end]["startTime"] if gap_end < n else (
            whisper_words[-1]["endTime"] if whisper_words else prev_end + 0.1
        )
        count = gap_end - gap_start
        if next_start <= prev_end:
            next_start = prev_end + 0.05 * count
        each = (next_start - prev_end) / count
        for k in range(gap_start, gap_end):
            w_start = prev_end + (k - gap_start) * each
            orig = original_words[k]
            result[k] = {"id": orig["id"], "text": orig["text"], "startTime": w_start, "endTime": w_start + each}

    for r in result:
        r["startTime"] = round(r["startTime"], 3)
        r["endTime"] = round(r["endTime"], 3)

    return result, True
