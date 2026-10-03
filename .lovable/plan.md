# Contorno da alça preso ao frame

## Objetivo
Manter o zoom livre acima de 100%, mas impedir que as linhas visíveis da seleção ultrapassem o frame.

## Implementação
- Manter o retângulo real do vídeo e os cálculos atuais do zoom sem limites.
- Ocultar somente as linhas visuais originais que saem do frame.
- Desenhar um contorno visual sincronizado entre os pontos já presos às bordas.
- Atualizar esse contorno durante seleção, arraste e redimensionamento.

## Validação
- Confirmar que pontos e linhas permanecem juntos nas quatro bordas.
- Confirmar que arrastar além da borda ainda amplia o vídeo normalmente.
- Verificar a tela do editor e o estado da compilação.
