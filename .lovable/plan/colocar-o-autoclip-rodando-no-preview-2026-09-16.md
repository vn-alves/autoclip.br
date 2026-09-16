# Colocar o AutoClip rodando no preview

## O que existe hoje

O projeto é o AutoClip completo: uma interface em React dentro da pasta `frontend/` e um servidor
em Python (FastAPI) dentro de `backend/`, mais os arquivos de empacotamento desktop (Tauri) e a
documentação. Nada disso está sendo iniciado no preview.

Motivo confirmado: o `package.json` da raiz só declara a ferramenta do Tauri e não tem o comando
`dev`. O log do servidor de preview repete `Script not found "dev"`, então a tela nunca sobe.
A interface também está configurada para a porta 3000, e o preview só enxerga a 8080.

## O que vamos fazer

1. **Ligar a interface no preview**
   - Criar um comando `dev` na raiz que inicia a interface da pasta `frontend` na porta 8080.
   - Instalar as dependências da interface (ela ainda não tem suas bibliotecas instaladas).
   - Ajustar a interface para conversar com o servidor Python local.

2. **Ligar o servidor local (Python)**
   - Instalar as dependências Python do arquivo de requisitos.
   - Subir o servidor em modo local (banco em arquivo SQLite, sem Redis), na porta 8000, e
     confirmar que ele responde no endereço de verificação de saúde.
   - Deixar o servidor e a interface subindo juntos com um único comando.

3. **Chave de IA**
   - Guardar sua chave com segurança (pedirei em um formulário próprio, sem colar no chat) e
     apontar o servidor para ela, para o recorte automático funcionar.

4. **Verificação final**
   - Abrir a tela no navegador, confirmar que ela carrega sem erros e que a lista de projetos e as
     categorias vêm do servidor.

## Limites conhecidos

- O ambiente aqui não tem Redis, então a fila de tarefas roda em modo local/direto. Processar
  vídeos longos pode ser lento e depende de quanto tempo o ambiente permite.
- Reconhecimento de fala (Whisper) e envio para Bilibili/YouTube exigem componentes ou contas
  extras; ficam fora deste passo e eu aviso se algo depender disso.
- Gerar o aplicativo instalável (macOS/Windows) exige Rust e assinatura; não faz parte disto.

## Detalhes técnicos

- Raiz: `package.json` com `"dev": "npm --prefix frontend run dev -- --port 8080 --host"` (ou
  script equivalente que também suba o backend), e `frontend/vite.config.ts` com
  `server.port` vindo de env / 8080 e proxy `/api` para `http://127.0.0.1:8000`.
- Backend: `pip install -r requirements.txt`, `.env` a partir de `env.example` com
  `DATABASE_URL=sqlite:///./data/autoclip.db`, `AUTOCLIP_DESKTOP_MODE=1` (broker de arquivo,
  sem Redis), inicialização via `python init_database.py` + `uvicorn` sobre `backend.app_factory`.
- Chave LLM lida de variável de ambiente (`API_DASHSCOPE_API_KEY` / `API_OPENAI_API_KEY` /
  `API_GEMINI_API_KEY`) conforme `LLM_PROVIDER`.
- Validação: `GET /health` e `GET /api/v1/video-categories` (mesmas checagens de
  `scripts/verify_desktop.sh`), depois carregamento da tela via Playwright em `localhost:8080`.
