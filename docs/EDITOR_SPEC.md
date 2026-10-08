# EDITOR_SPEC.md

# AutoClip — Especificação do Editor de Cortes

Versão: 1.0
Status: Em desenvolvimento

---

# 1. OBJETIVO

Adicionar ao AutoClip um editor visual de cortes que permita ao usuário
personalizar cada fatia/corte gerado pela IA antes da exportação.

O editor deve transformar um corte automático em um projeto de edição
visual, permitindo controlar:

- Formato do vídeo
- Enquadramento
- Redimensionamento
- Posicionamento
- Fundo
- Legendas
- Estilo das legendas
- Animações das legendas
- Destaque de palavras
- Fonte
- Camadas de vídeo
- Trechos adicionais do vídeo
- Upload de vídeos externos
- Layouts com múltiplos vídeos
- Preview em tempo real
- Exportação do resultado final

O objetivo é oferecer uma experiência de edição inspirada em ferramentas
como 2short.ai e Opus Clip, mantendo a estrutura e o fluxo já existentes
no AutoClip.

---

# 2. REGRA PRINCIPAL: PRESERVAR O AUTÓCLIP EXISTENTE

O AutoClip já possui um sistema funcional de geração automática de cortes.

O editor NÃO deve substituir, reescrever ou modificar desnecessariamente
o sistema existente de:

- Geração de projetos
- Upload de vídeos
- Processamento dos vídeos
- IA responsável pela identificação dos cortes
- Geração das fatias
- Sistema de legendas já existente
- Armazenamento dos projetos
- Sistema de exportação já funcional
- Sistema de filas/processamento
- Comunicação com servidores
- Autenticação
- Configurações existentes

Antes de modificar qualquer código, localizar os componentes, serviços e
funções atualmente responsáveis por essas funcionalidades.

O editor deve ser adicionado como uma nova camada de edição sobre o corte
existente.

Não reimplementar funcionalidades que já existem sem necessidade.

Não alterar arquivos não relacionados ao editor.

Não realizar refatorações gerais durante a implementação do editor.

---

# 3. AMBIENTE DE EXECUÇÃO

O AutoClip possui comportamento diferente entre Desktop e Web.

## Desktop

O aplicativo Desktop é o ambiente principal.

O Desktop atualmente possui o funcionamento completo da ferramenta,
incluindo os recursos que dependem de servidor/processamento.

O editor deve ser desenvolvido e validado prioritariamente no Desktop.

Todos os recursos de edição devem ser projetados considerando que o
Desktop é o ambiente principal de execução.

## Web

A versão Web não possui atualmente todas as funcionalidades disponíveis
no Desktop porque determinados recursos dependem do servidor/ambiente
desktop.

Não tentar tornar o AutoClip Web 100% funcional como parte deste trabalho.

O editor pode possuir sua interface na Web quando tecnicamente possível,
mas recursos que dependam do servidor, processamento local ou renderização
do Desktop não devem ser recriados artificialmente apenas para suportar a
Web.

Não modificar a arquitetura de backend/servidor exclusivamente para
resolver limitações da versão Web.

---

# 4. FLUXO ATUAL DO CORTE

O fluxo existente deve continuar funcionando.

Fluxo conceitual:

Projeto
↓
Processamento pela IA
↓
Geração das fatias/cortes
↓
Lista de cortes
↓
Usuário seleciona uma fatia
↓
Visualização do corte
↓
Novo Editor de Corte

Atualmente, ao selecionar uma fatia, o AutoClip apresenta um modal com:

- Nome/título do corte
- Tempo inicial
- Tempo final
- Pontuação/recomendação
- Preview do vídeo
- Controles de reprodução
- Opção de publicar/exportar
- Opção de baixar

Esse fluxo deve ser preservado.

A principal alteração será substituir/expandir a experiência de
visualização do corte por uma experiência de edição quando o usuário
escolher editar.

O preview simples atual não deve ser removido sem que exista uma
alternativa funcional.

---

# 5. NOVO FLUXO DE EDIÇÃO

Ao selecionar um corte, o usuário deverá poder abrir:

"Editar corte"

O fluxo deverá ser:

Projeto
↓
Cortes gerados pela IA
↓
Selecionar corte
↓
Editar
↓
Editor de Corte
↓
Personalização
↓
Preview
↓
Salvar edição
↓
Exportar/Publicar/Baixar

O corte original deve continuar preservado.

As alterações realizadas no editor devem representar uma configuração
de edição aplicada ao corte.

A edição não deve destruir ou modificar permanentemente o arquivo
original do corte.

---

# 6. PRINCÍPIO DO EDITOR

O editor deve separar três conceitos:

1. MÍDIA
2. CANVAS
3. PLAYER

## Mídia

Representa os vídeos/imagens utilizados na composição.

## Canvas

Representa o vídeo final que o usuário está construindo.

O canvas define:

- proporção
- tamanho
- posição dos elementos
- fundo
- camadas
- legendas

## Player

Responsável apenas pela reprodução e navegação temporal.

Os controles do player devem ficar FORA do vídeo/canvas.

Não utilizar os controles nativos do elemento de vídeo sobrepostos
permanentemente ao canvas como interface principal do editor.

---

# 7. ESTRUTURA VISUAL DO EDITOR

A interface deve ser organizada como um editor de vídeo simples,
priorizando o preview.

Estrutura conceitual:

┌───────────────────────────────────────────────────────────┐
│ ← Voltar        EDITAR CORTE                    Salvar   │
├──────────────┬───────────────────────────────┬────────────┤
│              │                               │            │
│ CONFIGURAÇÕES│            CANVAS             │  CAMADAS   │
│              │                               │            │
│ Formato      │                               │ 🎥 Vídeo   │
│ Legendas     │                               │ 🎥 Reação  │
│ Fundo        │                               │ 📝 Texto   │
│ etc.         │                               │            │
│              │                               │            │
├──────────────┴───────────────────────────────┴────────────┤
│                                                          │
│                 CONTROLES DO PLAYER                     │
│                                                          │
│ ▶    🔊       00:06 / 02:08                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                         TIMELINE                          │
└───────────────────────────────────────────────────────────┘

A estrutura exata da interface poderá ser adaptada à arquitetura atual
do AutoClip.

Não criar uma interface excessivamente complexa apenas para seguir este
mockup.

A prioridade é:

1. Preview
2. Edição visual
3. Controles simples
4. Configurações acessíveis
5. Performance

---

# 8. CANVAS

O canvas representa a área final do vídeo.

O usuário poderá escolher entre:

- Retrato — 9:16
- Paisagem — 16:9
- Quadrado — 1:1

O formato selecionado deve alterar a proporção visual do canvas.

O vídeo não deve simplesmente ser esticado para preencher o canvas.

A proporção original da mídia deve ser preservada.

O usuário poderá:

- mover
- redimensionar
- reposicionar
- aumentar
- diminuir

os elementos dentro do canvas.

---

# 9. REDIMENSIONAMENTO

Ao selecionar uma camada de vídeo, devem aparecer controles visuais
para redimensionamento.

Conceito:

┌──────────────────────────┐
│ ●                      ● │
│                          │
│                          │
│          VÍDEO           │
│                          │
│                          │
│ ●                      ● │
└──────────────────────────┘

O redimensionamento deve preservar a proporção do vídeo por padrão.

Caso futuramente seja necessário permitir distorção livre, isso deverá
ser uma opção explícita.

O usuário deve conseguir arrastar o elemento pelo canvas.

---

# 10. GUIAS DE CENTRALIZAÇÃO

O editor deve possuir guias visuais de alinhamento.

Durante o movimento ou redimensionamento de uma camada, apresentar
automaticamente linhas de referência quando o elemento estiver próximo
de posições importantes.

Guias mínimas:

- Centro horizontal
- Centro vertical
- Centro absoluto
- Limite superior
- Limite inferior
- Limite esquerdo
- Limite direito

Quando o elemento estiver próximo do centro, utilizar comportamento
de "snap", fazendo o elemento encaixar automaticamente na posição.

Exemplo:

                │
                │
        ┌───────┼───────┐
        │       │       │
        │ VIDEO │       │
        │       │       │
        └───────┼───────┘
                │

As linhas de guia devem ser temporárias e aparecer principalmente
durante movimentação/redimensionamento.

Não deixar as linhas permanentemente sobre o vídeo.

---

# 11. FUNDO DO CANVAS

Quando a mídia não ocupar completamente o canvas, o sistema deverá
preencher o espaço restante sem distorcer a mídia.

Opções iniciais:

## Fundo borrado

Utilizar o próprio vídeo como fundo ampliado e aplicar desfoque.

Conceito:

Vídeo original
↓
Duplicação visual
↓
Escala para preencher canvas
↓
Blur
↓
Vídeo principal sobreposto

## Cor sólida

Permitir escolher uma cor para o espaço restante.

Deve existir:

- Cores predefinidas
- Seletor de cor personalizado

A implementação deve evitar processamento desnecessário quando o fundo
for simplesmente uma cor sólida.

---

# 12. PREVIEW

O preview deve representar o mais próximo possível o resultado final.

Elementos como:

- vídeos
- legendas
- posições
- escalas
- fundos
- camadas

devem aparecer no canvas durante a edição.

O preview não precisa necessariamente renderizar um arquivo final a cada
alteração.

Preferir manipulação visual em tempo real e somente gerar o arquivo final
durante a exportação/renderização.

O preview deve priorizar desempenho.

---

# 13. PLAYER

Os controles de reprodução devem ficar fora do canvas.

Controles iniciais:

- Play
- Pause
- Barra de progresso
- Tempo atual
- Duração
- Volume
- Mute

O usuário deve conseguir clicar/arrastar na barra de progresso para
navegar pelo corte.

A reprodução deve permanecer sincronizada com as camadas e legendas.

O player deve controlar o tempo atual do editor.

O canvas deve reagir ao tempo atual do player.

---

# 14. PRINCÍPIO DE TEMPO

O editor deve possuir um tempo global referente ao corte.

Exemplo:

Corte:
00:32 → 00:48 do vídeo original

No editor:

00:00 → 00:16

O editor deve trabalhar preferencialmente com o tempo relativo do corte.

Uma camada adicional poderá possuir seu próprio:

- início
- fim

dentro da timeline do corte.

Isso permitirá futuramente criar múltiplas mídias sincronizadas.

---

# 15. PERFORMANCE

O editor não deve criar um novo arquivo de vídeo a cada alteração.

Alterações como:

- posição
- escala
- formato
- cor
- estilo de legenda
- fundo

devem ser mantidas como propriedades/configurações enquanto o usuário
edita.

A renderização definitiva deve acontecer somente durante o processo de
exportação.

Evitar processamento pesado desnecessário no preview.

---

# 16. REGRA DE IMPLEMENTAÇÃO

Antes de implementar qualquer recurso:

1. Localizar a implementação atual relacionada ao recurso.
2. Verificar como o Desktop utiliza essa implementação.
3. Reutilizar componentes e serviços existentes quando possível.
4. Criar somente o código necessário para o editor.
5. Não substituir sistemas funcionais sem necessidade.
6. Não modificar funcionalidades fora do escopo.
7. Testar o fluxo existente após cada alteração importante.

Não executar refatoração geral do projeto.

Não alterar arquitetura de backend sem necessidade direta para o editor.