"""No aplicativo desktop, a verificação do YouTube deve usar a sessão dos navegadores locais."""

from backend.api.v1 import youtube


def test_desktop_tries_local_browsers(monkeypatch):
    monkeypatch.setenv("AUTOCLIP_DESKTOP_MODE", "true")
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: None)
    candidates = youtube._local_browser_candidates()
    assert "chrome" in candidates
    assert "firefox" in candidates


def test_server_never_tries_local_browsers(monkeypatch):
    monkeypatch.delenv("AUTOCLIP_DESKTOP_MODE", raising=False)
    monkeypatch.delenv("AUTOCLIP_MODE", raising=False)
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: None)
    assert youtube._local_browser_candidates() == []


def test_uploaded_cookies_take_priority(monkeypatch):
    monkeypatch.setenv("AUTOCLIP_DESKTOP_MODE", "true")
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: "/tmp/cookies.txt")
    assert youtube._local_browser_candidates() == []


def test_desktop_message_does_not_mention_server(monkeypatch):
    monkeypatch.setenv("AUTOCLIP_DESKTOP_MODE", "true")
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: None)
    msg = youtube._friendly_yt_error(Exception("ERROR: [youtube] abc: Sign in to confirm you're not a bot"))
    assert "servidor" not in msg
    assert "Sign in to confirm" in msg
