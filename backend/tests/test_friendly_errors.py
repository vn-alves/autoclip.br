from backend.utils.friendly_errors import friendly_error

def test_missing_key():
    assert "chave da IA" in friendly_error("API key da IA não configurada ou inválida")

def test_invalid_ai_response():
    assert "resposta inválida" in friendly_error("A IA devolveu uma resposta inválida após 3 tentativas: x")

def test_empty_has_no_message():
    assert friendly_error(None) is None

def test_unknown_keeps_detail():
    assert "boom" in friendly_error("boom")
