"""Armazenamento dos cookies do YouTube (formato Netscape / cookies.txt).

Em servidor sem navegador logado, `--cookies-from-browser` nunca funciona.
Aqui guardamos um arquivo cookies.txt enviado pelo usuário, que é a forma
confiável de passar pelo bloqueio "sign in to confirm you're not a bot".

Ordem de resolução:
1. `AUTOCLIP_YT_COOKIES_FILE` (caminho explícito)
2. arquivo enviado pela interface: `<data>/cookies/youtube_cookies.txt`
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

COOKIES_FILENAME = 'youtube_cookies.txt'
# Cookies que realmente indicam sessão logada do YouTube
SESSION_COOKIE_NAMES = ('SID', 'SAPISID', 'SSID', 'HSID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO')


def _data_dir() -> Path:
    try:
        from ..core.config import get_data_directory
        return Path(get_data_directory())
    except Exception:  # pragma: no cover - fallback simples
        return Path('data')


def get_cookies_dir() -> Path:
    path = _data_dir() / 'cookies'
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_stored_cookies_path() -> Path:
    return get_cookies_dir() / COOKIES_FILENAME


def get_cookies_file() -> Optional[str]:
    """Caminho do cookies.txt utilizável, ou None."""
    env_path = os.getenv('AUTOCLIP_YT_COOKIES_FILE', '').strip()
    if env_path and os.path.isfile(env_path):
        return env_path

    stored = get_stored_cookies_path()
    if stored.is_file() and stored.stat().st_size > 0:
        return str(stored)
    return None


def validate_cookies_text(text: str) -> tuple[bool, str]:
    """Valida superficialmente um cookies.txt no formato Netscape."""
    if not text or not text.strip():
        return False, "O arquivo de cookies está vazio."

    lines = [line for line in text.splitlines() if line.strip()]
    data_lines = [line for line in lines if not line.lstrip().startswith('#')]
    if not data_lines:
        return False, "O arquivo não tem nenhuma linha de cookie."

    valid_rows = [line for line in data_lines if len(line.split('\t')) >= 7]
    if not valid_rows:
        return False, (
            "O formato não é o esperado. Exporte os cookies no formato Netscape "
            "(cookies.txt), com as colunas separadas por tabulação."
        )

    if not any('youtube.com' in row or 'google.com' in row for row in valid_rows):
        return False, "Não encontrei cookies do youtube.com neste arquivo."

    has_session = any(name in text for name in SESSION_COOKIE_NAMES)
    if not has_session:
        return True, (
            "Cookies salvos, mas não encontrei os cookies de sessão do YouTube. "
            "Confirme que você estava logado ao exportar."
        )

    return True, "Cookies do YouTube salvos."


def save_cookies_text(text: str) -> tuple[bool, str]:
    ok, detail = validate_cookies_text(text)
    if not ok:
        return False, detail

    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    if not normalized.endswith('\n'):
        normalized += '\n'

    path = get_stored_cookies_path()
    path.write_text(normalized, encoding='utf-8')
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass
    logger.info(f"Cookies do YouTube atualizados: {path}")
    return True, detail


def delete_cookies() -> bool:
    path = get_stored_cookies_path()
    if path.is_file():
        path.unlink()
        logger.info("Cookies do YouTube removidos")
        return True
    return False


def cookies_status() -> dict:
    env_path = os.getenv('AUTOCLIP_YT_COOKIES_FILE', '').strip()
    stored = get_stored_cookies_path()
    active = get_cookies_file()

    info: dict = {
        "configured": bool(active),
        "source": None,
        "updated_at": None,
        "cookie_count": 0,
        "has_session_cookie": False,
    }

    if not active:
        return info

    info["source"] = "env" if env_path and active == env_path else "upload"
    try:
        path = Path(active)
        info["updated_at"] = datetime.fromtimestamp(path.stat().st_mtime).isoformat()
        text = path.read_text(encoding='utf-8', errors='ignore')
        info["cookie_count"] = len([
            line for line in text.splitlines()
            if line.strip() and not line.lstrip().startswith('#')
        ])
        info["has_session_cookie"] = any(name in text for name in SESSION_COOKIE_NAMES)
    except Exception as e:
        logger.warning(f"Não foi possível ler os cookies do YouTube: {e}")

    if active != str(stored) and stored.is_file():
        info["stored_also_present"] = True

    return info
