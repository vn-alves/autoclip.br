"""
Registro local do consumo das chaves de API (tokens por chamada).

Cada chamada ao modelo grava uma linha em `<data>/llm_usage.jsonl` com o projeto em
processamento, o provedor, o modelo e os tokens que a própria API devolveu. O preço NÃO é
calculado aqui: a tabela de preços fica só no frontend (utils/llmPricing.ts), para que
reajuste de preço recalcule o histórico inteiro sem migrar arquivos.
"""
import contextvars
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_current_project: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("usage_project", default=None)
# Fallback para etapas que rodam em threads de executor (contextvars não atravessam run_in_executor).
_last_project: Optional[str] = None
_lock = threading.Lock()


def set_usage_project(project_id: Optional[str]) -> None:
    global _last_project
    _current_project.set(project_id)
    _last_project = project_id


def current_usage_project() -> Optional[str]:
    return _current_project.get() or _last_project


def usage_file() -> Path:
    from .path_utils import get_data_directory
    return get_data_directory() / "llm_usage.jsonl"


def record_usage(provider: str, model: str, usage: Optional[Dict[str, Any]], path: Optional[Path] = None) -> None:
    if not usage:
        return
    try:
        prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        cached = int(usage.get("cached_tokens") or (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        if prompt == 0 and completion == 0:
            return
        entry = {
            "ts": time.time(),
            "project_id": current_usage_project(),
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "cached_tokens": cached,
        }
        target = path or usage_file()
        target.parent.mkdir(parents=True, exist_ok=True)
        with _lock, open(target, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:  # noqa: BLE001 — contar gasto nunca pode derrubar o processamento
        logger.warning(f"Falha ao registrar uso da API: {e}")


def read_usage(path: Optional[Path] = None) -> List[Dict[str, Any]]:
    target = path or usage_file()
    if not target.exists():
        return []
    out: List[Dict[str, Any]] = []
    with open(target, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def clear_usage(path: Optional[Path] = None) -> None:
    target = path or usage_file()
    with _lock:
        if target.exists():
            target.unlink()
