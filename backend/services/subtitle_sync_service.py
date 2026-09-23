"""
Sincronização precisa de legendas — Editor de Corte (Etapa 2, evolução).

A geração inicial do SRT (ver utils/subtitle_processor.py) distribui o tempo
de cada palavra linearmente dentro do segmento — não tem nenhuma relação com
o áudio real. Este módulo faz uma segunda passada, sob demanda do usuário,
que roda o faster-whisper (o mesmo motor já usado pelo app para gerar o SRT
inicial, ver utils/speech_recognizer.py e services/whisper_runtime.py) com
`word_timestamps=True` diretamente sobre o arquivo de vídeo do PRÓPRIO clip.

Como esse arquivo já é o corte físico do vídeo original (0 = início do
clip), os timestamps que o Whisper devolve já nascem relativos ao clip —
não há nenhum offset para aplicar.

O texto das legendas já existentes é preservado: em vez de substituir a
transcrição por completo pela nova saída do Whisper (que pode diferir em
pontuação/capitalização), alinhamos os timestamps reais de volta às
palavras originais por correspondência de sequência (difflib). Trechos sem
correspondência direta (uma palavra a mais/a menos, pontuação diferente)
usam interpolação linear ANCORADA entre as correspondências reais
vizinhas — nunca mais uma estimativa linear ao longo do segmento inteiro.

Roda como job em memória (thread + dict protegido por lock), no mesmo
espírito do que já existe em services/publish_export.py — não é uma
operação de playback, só dispara quando o usuário pede.
"""
import difflib
import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_jobs: Dict[str, dict] = {}
_jobs_lock = threading.Lock()
# clip_id -> job_id do job ativo (evita disparar duas sincronizações em paralelo para o mesmo corte)
_active_by_clip: Dict[str, str] = {}

_WORD_NORMALIZE_RE = re.compile(r"[^\w']+", re.UNICODE)

# Mesmo padrão usado pela geração inicial do SRT (SpeechRecognitionConfig.model default).
DEFAULT_MODEL = "base"


def _normalize(word: str) -> str:
    return _WORD_NORMALIZE_RE.sub('', word).lower()


def _set_job(job_id: str, **kw) -> None:
    with _jobs_lock:
        _jobs.setdefault(job_id, {}).update(kw)


def get_job(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def start_sync(project_id: str, clip_id: str, original_words: List[dict]) -> str:
    """Inicia (ou reaproveita, se já houver uma em andamento) a sincronização
    deste corte. `original_words` é a lista de {"id","text"} na ordem em que
    aparecem no clip — vem dos segmentos já existentes (SRT original), usada
    para preservar o texto durante o alinhamento."""
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
        target=_run_sync, args=(job_id, project_id, clip_id, original_words),
        name=f"subtitle-sync-{job_id[:8]}", daemon=True,
    )
    thread.start()
    return job_id


def _run_sync(job_id: str, project_id: str, clip_id: str, original_words: List[dict]) -> None:
    try:
        if not original_words:
            raise RuntimeError("Este corte não possui legendas para sincronizar.")

        from ..core.database import SessionLocal
        from ..models.clip import Clip
        from . import whisper_runtime

        if not whisper_runtime.is_installed():
            raise RuntimeError(
                "O runtime do Whisper não está instalado. Vá em Configurações → "
                "Reconhecimento de voz, instale o Whisper e tente novamente."
            )

        db = SessionLocal()
        try:
            clip = db.query(Clip).filter(Clip.id == clip_id, Clip.project_id == project_id).first()
            if not clip:
                raise RuntimeError("Corte não encontrado.")
            video_path = Path(clip.video_path or "")
            if not video_path.exists():
                raise RuntimeError("Arquivo de vídeo deste corte não foi encontrado no disco.")

            _set_job(job_id, status="analyzing_audio", progress=15)

            whisper_runtime.ensure_on_path()
            from faster_whisper import WhisperModel

            models_dir = str(whisper_runtime.get_models_dir() / "hub")
            model = WhisperModel(DEFAULT_MODEL, device="auto", compute_type="int8", download_root=models_dir)

            _set_job(job_id, status="aligning_words", progress=40)

            seg_iter, _info = model.transcribe(str(video_path), vad_filter=True, word_timestamps=True)
            whisper_words: List[dict] = []
            for seg in seg_iter:
                if not seg.words:
                    continue
                for w in seg.words:
                    text = (w.word or "").strip()
                    if not text:
                        continue
                    whisper_words.append({"text": text, "startTime": float(w.start), "endTime": float(w.end)})

            if not whisper_words:
                raise RuntimeError("Não foi possível identificar palavras faladas no áudio deste corte.")

            aligned = _align_words(original_words, whisper_words)

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
        with _jobs_lock:
            if _active_by_clip.get(clip_id) == job_id:
                _active_by_clip.pop(clip_id, None)


def _align_words(original_words: List[dict], whisper_words: List[dict]) -> List[dict]:
    """Alinha os timestamps reais do Whisper de volta ao texto original,
    preservando as palavras já existentes. Usa correspondência de sequência
    (difflib) sobre as formas normalizadas (minúsculas, sem pontuação) para
    casar a maior parte das palavras diretamente; trechos sem correspondência
    exata são preenchidos por interpolação linear ancorada entre as
    correspondências reais vizinhas (nunca span do segmento inteiro)."""
    orig_norm = [_normalize(w["text"]) for w in original_words]
    whisper_norm = [_normalize(w["text"]) for w in whisper_words]

    matcher = difflib.SequenceMatcher(a=orig_norm, b=whisper_norm, autojunk=False)
    result: List[Optional[dict]] = [None] * len(original_words)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and (i2 - i1) == (j2 - j1)):
            for offset in range(i2 - i1):
                w = whisper_words[j1 + offset]
                orig = original_words[i1 + offset]
                result[i1 + offset] = {
                    "id": orig["id"], "text": orig["text"],
                    "startTime": w["startTime"], "endTime": w["endTime"],
                }
        # 'delete' / 'insert' / 'replace' com contagens diferentes: preenchidos abaixo.

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

    return result
