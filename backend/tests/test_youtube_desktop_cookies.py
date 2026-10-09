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


def test_bundled_deno_next_to_ffmpeg_is_used(monkeypatch, tmp_path):
    """O deno embutido fica junto do ffmpeg; sem ele o YouTube só entrega miniaturas."""
    exe = "deno.exe" if youtube.sys.platform.startswith("win") else "deno"
    (tmp_path / "ffmpeg").write_text("")
    (tmp_path / exe).write_text("")
    monkeypatch.delenv("AUTOCLIP_DENO_PATH", raising=False)
    monkeypatch.setenv("AUTOCLIP_FFMPEG_PATH", str(tmp_path / "ffmpeg"))
    monkeypatch.setattr(youtube.shutil, "which", lambda name: None)
    assert youtube._find_js_runtimes() == {"deno": {"path": str(tmp_path / exe)}}


def test_every_yt_dlp_flow_gets_js_runtime(monkeypatch, tmp_path):
    exe = "deno.exe" if youtube.sys.platform.startswith("win") else "deno"
    (tmp_path / exe).write_text("")
    monkeypatch.setenv("AUTOCLIP_DENO_PATH", str(tmp_path / exe))
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: None)
    opts = {}
    youtube._apply_cookies(opts, "chrome")
    assert opts["js_runtimes"]["deno"]["path"] == str(tmp_path / exe)
    assert "ejs:github" in opts["remote_components"]
    assert opts["cookiesfrombrowser"] == ("chrome",)


def test_format_unavailable_is_not_reported_as_bot_check(monkeypatch):
    monkeypatch.setenv("AUTOCLIP_DESKTOP_MODE", "true")
    monkeypatch.setattr(youtube, "get_cookies_file", lambda: None)
    msg = youtube._friendly_yt_error(Exception(
        "ERROR: [youtube] L0fUteXK4SI: Requested format is not available. Use --list-formats"))
    assert "feche o navegador" not in msg
    assert "servidor" not in msg
    assert "Requested format is not available" in msg
