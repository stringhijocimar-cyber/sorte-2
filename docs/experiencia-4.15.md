# Aparência por modalidade — 4.15

A seleção de loteria agora fica no topo de todas as 15 telas. O mesmo menu em
duas linhas mostra as oito modalidades, sem rolagem horizontal. Trocar de
modalidade mantém a escolha global e atualiza os indicadores, botões, abas e
destaques. A base escura volta ao tom anterior, com um degradê discreto da cor
selecionada de baixo para cima. O tema claro usa tons ajustados para leitura.

| Modalidade | Cor de referência |
| --- | --- |
| Mega-Sena | Verde — `#35b86b` |
| Lotofácil | Roxo — `#a451d1` |
| Quina | Azul — `#446be3` |
| Lotomania | Laranja — `#ef7617` |
| Dupla Sena | Vermelho — `#d83b37` |
| Dia de Sorte | Dourado — `#d7a108` |
| Timemania | Verde-lima — `#85b92f` |
| +Milionária | Violeta — `#6f35c7` |

Os resultados publicados usam bolinhas amarelas, com degradê de `#ffe99a` a
`#f3c64c` e números grafite `#26200f`, em vez de roxo. A mesma regra vale no
último resultado da tela inicial. Os indicadores de acerto e erro conservam
verde e vermelho suave. O estado do concurso continua identificado pelo
cartão e pelo texto “com ganhador” ou “acumulou”.

O seletor foi centralizado na composição da página, eliminando cópias e
seletores diferentes nas telas. A seleção por teclado recupera o foco após
a atualização. Não há mudança nos cálculos de sugestões ou nas probabilidades.

## Verificação

A suíte de interface confere as 15 telas com as oito modalidades e ambos os
temas em 412 px. Em 320 e 1024 px, verifica o seletor e a tela de resultados.
São cobrados alvos de toque de pelo menos 44 px, rótulos sem corte, duas linhas,
ausência de transbordamento e contraste de pelo menos 4,5:1 nos controles.
Os números amarelos precisam de contraste mínimo de 7:1.

As capturas `LotoLab-4.15-*.png` vêm da interface executada pelo teste, com a
base incluída no repositório. O jogo e as notificações demonstrativas são
criados somente no perfil descartável do teste; não representam jogos do usuário.
A compilação e os testes Android são executados pela CI. A instalação em
aparelho físico continua sendo uma verificação separada.
