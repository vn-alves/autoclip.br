# Vídeo principal editável na timeline, corte estendível e volume por camada

## O que muda para você
- **Vídeo principal na timeline**: a barra dele passa a ser arrastável e esticável, igual às cópias e aos vídeos enviados.
- **Aumentar ou diminuir o corte**: esticar o fim da barra para a direita traz mais do vídeo original (ex.: de 50 s para 60 s). Puxar para a esquerda encurta. O mesmo vale para o início da barra, que pode mostrar trechos anteriores ao corte. Vale para o principal e para as cópias. O limite é o começo e o fim do vídeo original importado.
- **Duração do vídeo final**: passa a ir até o fim da camada que termina por último. O playhead, o tempo mostrado e a exportação acompanham.
- **Áudio nas cópias**: cada cópia toca o próprio áudio, no próprio intervalo.
- **Volume por camada**: ao selecionar uma camada, o painel mostra um controle de volume (0% a 200%) e um botão de mudo. Vale para o principal, para as cópias e para os vídeos enviados. Isso aparece na prévia e no vídeo exportado.
- O design atual do editor, as legendas sempre por cima, o zoom e o desfazer/refazer continuam iguais.

## Limitação
- Na versão Web (sem o aplicativo), o vídeo original não fica disponível depois do corte. Lá, o principal pode ser movido e encurtado, mas não estendido além do corte. O volume funciona normalmente.

## Detalhes técnicos
- `VideoLayer` / `EditConfigLayer` ganham `sourceStart` (segundos dentro da fonte), `volume` (0–2) e `muted`. Configs antigas assumem `volume=1` e `muted=false`. As cópias antigas, que eram mudas, passam a ter áudio.
- Camadas principal e duplicada passam a usar como fonte o vídeo original do projeto, por um novo endpoint com suporte a range: `GET /projects/{id}/clips/{clip_id}/source`, que devolve o vídeo original e o offset do corte (`clip.start_time`). Quando a fonte original não existe, elas continuam usando o arquivo do corte, com limite igual à duração dele.
- O relógio do editor deixa de ser o `<video>` principal. Passa a ser um relógio próprio (requestAnimationFrame), com todas as camadas como seguidoras. A sincronização já existente das secundárias (`currentTime - startTime + sourceStart`) é generalizada. A duração total vira `max(endTime)`.
- Os limites de resize vêm de um helper puro em `layerTimelineMath.ts`, compartilhado entre a timeline e os testes: o início não pode ir antes do começo da fonte, e o fim não pode passar do fim da fonte.
- No render (`editor_render_service.py`), cada camada usa `-ss sourceStart -t (end-start)` sobre a fonte. O áudio passa a ser misto: `adelay` + `volume` por camada com áudio não mudo, e depois `amix`. O vídeo de fundo é `color=` com a duração total. As legendas continuam sendo compostas por último.
- Testes: limites de extensão e encurtamento no helper da timeline, e no backend o mix de áudio com volume e mudo e a duração total igual ao maior `endTime`.
- Versão desktop sobe para 2.0.8, junto com as correções de importação anteriores.
