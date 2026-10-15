"""Traduz erros técnicos do processamento em uma frase clara em português.

Usado pela API do projeto para que uma falha nunca apareça só como "Falha no
processamento" sem motivo.
"""
from typing import Optional

_RULES = [
    (("api key", "api_key", "apikey", "401", "unauthorized", "invalid_api_key", "incorrect api key", "chave"),
     "A chave da IA está faltando ou é inválida. Confira em Configurações → IA."),
    (("insufficient_quota", "quota", "billing", "402", "余额", "credit"),
     "A conta da IA está sem crédito. Adicione saldo no provedor e tente de novo."),
    (("429", "rate limit", "too many requests"),
     "A IA recebeu pedidos demais ao mesmo tempo. Espere um pouco e tente de novo."),
    (("resposta inválida", "jsondecodeerror", "json", "expecting value"),
     "A IA devolveu uma resposta inválida mesmo após várias tentativas. Tente processar de novo."),
    (("timeout", "timed out", "travad"),
     "Uma etapa demorou demais e foi interrompida. Tente de novo; vídeos muito longos levam mais tempo."),
    (("ffmpeg",),
     "Não foi possível recortar o vídeo. O arquivo pode estar corrompido ou em um formato não suportado."),
    (("no such file", "not found", "não encontrado", "filenotfound"),
     "Um arquivo do projeto não foi encontrado. Importe o vídeo novamente."),
    (("srt", "legenda", "subtitle", "transcri"),
     "Não foi possível obter a legenda/transcrição do vídeo."),
    (("connection", "network", "getaddrinfo", "ssl"),
     "Sem conexão com a IA. Verifique a internet e tente de novo."),
]


def friendly_error(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    text = str(raw)
    low = text.lower()
    for keys, message in _RULES:
        if any(k in low for k in keys):
            return f"{message} (Detalhe: {text[:200]})"
    return f"Falha no processamento: {text[:300]}"
