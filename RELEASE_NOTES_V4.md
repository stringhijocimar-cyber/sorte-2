# LotoLab — notas das versões V4

**Versão atual:** 4.3.1 · **Android:** versionCode 8 / versionName 4.3.1
**Fonte da verdade:** branch `main` · **Manifesto:** `RELEASE_MANIFEST_V4.json`

---

# 4.3.1 — o lembrete passa a ler o calendário

Versão de correção, com três defeitos relatados por quem usa.

## O lembrete caía em dia sem sorteio

O app projetava os próximos sorteios pela **mediana dos intervalos**. Numa
loteria que sorteia de segunda a sexta e no domingo, a mediana é 1 dia — então
ele agendava lembrete para o **sábado**, dia em que não há sorteio. Alarme em
dia vazio ensina a ignorar o alarme, que é o oposto do que a fila existe para
fazer.

O calendário da Caixa mudou em meados de julho de 2026: o último sábado da
Mega-Sena foi o concurso 3030, em 11/07. Depois disso, domingo. O app seguiu
projetando sábado por mais de um mês.

Agora os dias de sorteio são lidos do **próprio histórico**, por modalidade, e
a fila anda dia a dia aceitando só os dias em que aquela loteria de fato
sorteia. Nenhuma tabela escrita à mão: quando o calendário mudar de novo, o app
acompanha sozinho.

A janela é de seis semanas, e o número foi medido: com oito, ela ainda
alcançava três sábados de julho e os dava como dia de sorteio — e aí o próximo
concurso saía numerado um a mais, porque a fila contava um sorteio que não
existiu.

Conferido nas oito modalidades, sem nenhum sábado:

| Modalidade | Dias |
|---|---|
| Dia de Sorte · Lotofácil · Quina | seg a sex, e dom |
| Dupla Sena · Lotomania | seg, qua, sex |
| +Milionária | qua, dom |
| Mega-Sena · Timemania | ter, qui, dom |

## Não havia como sair das atividades

A folha de notificações tinha apenas o fundo clicável — a faixa escura acima do
painel. No navegador não existe botão de voltar do sistema, e ninguém adivinha
que precisa tocar no escuro. A gaveta do menu sempre teve um "fechar" visível;
esta não tinha. Agora tem.

A bateria cobria **abrir** a folha e o que ela mostra; nunca cobriu **sair** — e
é por isso que um beco sem saída sobreviveu a tantas versões.

## A notificação de coincidência voltou à edição estatística

Ela tinha sido removida por engano junto com os fluxos de aposta. "Seu conjunto
coincidiu em 13 dezenas no concurso 3765" é medida, não prêmio.

O texto também deixou de dizer "premiado" na edição completa: o app compara
conjuntos guardados com concursos publicados, e não sabe se o bilhete foi
comprado.

## Sonda para a frente no atualizador

Quando a fonte devolve como "último" um concurso já conhecido, o atualizador
passa a perguntar pelos próximos, um a um, parando no primeiro que não existir.
Ele confere que o número devolvido é o pedido — a Caixa responde com o último
quando perguntam por um que não existe.

Nota honesta: esta sonda foi escrita durante um diagnóstico que se revelou
errado (eu havia concluído que faltava um concurso de sábado, quando não houve
sorteio no sábado). Ela fica porque o modo de falha que cobre já aconteceu de
verdade em agosto, mas não era a causa deste relato.

## Testes

| Bateria | Resultado |
|---|---|
| Motor | 675/675 |
| Interface, Chrome de verdade | 111/111 |
| Atualizador | 18/18 |
| Referência dourada | idêntica — motor intacto |

---

# 4.2.0 — identidade por modalidade e a edição estatística

## Camada visual V4.2

**Cor por modalidade.** Cada loteria passa a ter um acento próprio, aplicado ao
seletor e ao acento global da tela quando ela está selecionada:

| Modalidade | Cor | |
|---|---|---|
| Mega-Sena | verde | `#35B86B` |
| Lotofácil | lilás | `#C06BE3` |
| Quina | azul | `#5B91FF` |
| Lotomania | laranja | `#FF8B4D` |
| Dupla Sena | coral | `#FF6876` |
| Dia de Sorte | dourado | `#E7B64C` |
| Timemania | verde-amarelado | `#B9CF45` |
| +Milionária | violeta | `#8C76FF` |

**As duas escalas de cor continuam separadas, e isso é deliberado.** A cor da
modalidade diz apenas de que loteria se trata. O estado do concurso tem a sua
própria escala e não se confunde com ela:

- **verde** — concurso com ganhador;
- **amarelo** — concurso sem ganhador, acumulado.

Misturar as duas faria a Mega-Sena parecer premiada por ser verde. Por isso o
estado do concurso nunca é comunicado só pela cor: o selo também traz o texto
("teve ganhador" / "acumulou"), que é o que sobrevive a daltonismo, tela ruim e
luz do sol.

**Hierarquia e legibilidade.** Corpo em 14px com entrelinha 1.42, títulos com
peso maior, cartões com profundidade discreta, seletor de modalidade com ponto
colorido e estado selecionado mais firme, e barra de rolagem fina. O acento não
é o único sinal de seleção — `aria-pressed` acompanha, para quem navega por
leitor de tela.

## Edição LotoLab Estatístico

Uma segunda edição, gerada do mesmo código, **sem os fluxos que existem para
operar aposta**: dinheiro, prêmio, custo, retorno, ROI, faixa de prêmio e
qualquer anúncio de prêmio de concurso futuro.

**A remoção é real, não cosmética.** O conteúdo não chega ao arquivo publicado:
não está escondido por CSS, não volta com o inspetor aberto, e a própria função
de formatar moeda não existe nessa edição. Isso é cobrado por teste que varre o
texto renderizado das treze telas e, além disso, procura conteúdo financeiro em
elementos ocultos no DOM — porque `display:none` passaria por qualquer
varredura de código-fonte.

O que a edição estatística preserva, inteiro: layout V4.2, histórico de
concursos e sua atualização, dashboards, gráficos, estatística descritiva,
simulações, Monte Carlo, backtesting de desempenho, comparação com o acaso,
análises de independência, evolução do motor, IA/análises, comparação neutra de
conjuntos de números com concursos históricos, PWA e Android, identidade visual
por modalidade, e as atividades e notificações técnicas.

O motor estatístico **não foi tocado** para acomodar nada disso: a referência
dourada de `caracteristicas()` continua batendo dígito por dígito.

## Correções desde a 4.0.1

- **Rótulo da folha visual parado em 4.0.0.** O `<link>` anunciava
  `?v=4.0.0` num produto em 4.2.0. Não é só etiqueta errada: esse parâmetro é o
  que faz o navegador buscar a folha nova em vez da do cache. Passou a ser lido
  do arquivo `VERSION`.
- **`ui/` e `www/ui/` haviam divergido.** As regras eram equivalentes e o visual
  não quebrou, mas por sorte. A conferência de sincronia cobria só o
  `index.html`; agora cobre `sw.js`, o manifesto e a pasta `ui/` inteira.
- **Um workflow podia reverter a versão** — trazia o número cravado e empurra
  direto para o `main`. Passou a ler o `VERSION`.
- **Um check de CI dava veredito sobre código que não lia** — testava um branch
  fixo e mesmo assim carimbava resultado nos PRs. Deixou de rodar em pull
  request.

## Testes

| Bateria | Edição completa | Edição estatística |
|---|---|---|
| Motor | 668/668 | 668/668 |
| Interface, Chrome de verdade | 95/95 | 96/96 |
| Atualizador | 18/18 | 18/18 |
| XML do Android | 11 ok | 11 ok |
| Ícones | 34 ok | 34 ok |
| Referência dourada | idêntica | idêntica |
| Paridade `index.html` / `www/` | ok | ok |
| Paridade `ui/` / `www/ui/` | ok | ok |

As cinco asserções que cobram indicadores financeiros rodam **nas duas
edições com o sinal trocado**: presença na completa, ausência na estatística.
Afrouxá-las para aceitar os dois casos teria desligado as duas verificações ao
mesmo tempo.

---

# 4.0.1 — a conferência para de duplicar

Versão de correção. Um defeito relatado por quem usa, e dois que apareceram no
caminho de investigá-lo.

## O defeito relatado

**A conferência dos jogos já criados duplicava o mesmo concurso.**

O formulário de conferir à mão é um `<input>`, e input devolve **texto**. O
resto do app trata concurso como **número** — é assim que ele chega dos
arquivos de dados — e todas as comparações são estritas. `"3765"` nunca casava
com `3765`.

Na prática: você conferia um concurso à mão, depois a busca trazia o mesmo
concurso, e a conferência automática não reconhecia que aquele sorteio já
tinha sido conferido. Ele entrava de novo na ficha do jogo. Daí em diante
"jogos conferidos" contava dobrado e a média do placar era puxada por
conferências repetidas do mesmo sorteio.

Corrigido em duas frentes, porque arrumar só o formulário não desfaria o
estrago de quem já tinha usado o app:

- o formulário passa a guardar número, e a validação recusa o que não for
  número em vez de aceitar texto que nunca vai casar;
- a abertura do app normaliza o que já está gravado e junta as duplicatas,
  ficando a conferência mais recente de cada concurso — a que carrega rateio e
  cidades, porque a busca costuma chegar depois da digitação. A junção é por
  modalidade **mais** concurso, então o mesmo número em loterias diferentes
  continua sendo dois. É idempotente: rodar de novo não mexe em nada.

## Os dois que apareceram no caminho

**O cron diário de resultados caía sozinho.** Um teste do motor comparava datas
fixas com o relógio real. Enquanto o dia corrente esteve perto das datas
semeadas o cenário continuou válido; quando passou do limite, o teste caiu sem
ninguém ter tocado no código — e levou junto o cron, que roda a bateria antes
de gravar. Data fixa comparada com "agora" não é determinismo, é pavio. As
datas passaram a ser ancoradas no dia corrente.

**Um check de CI dava veredito sobre código que não lia.** O job `apply` baixa
um branch fixo e testa aquele branch, mas rodava em todo PR para o `main`.
Errou nas duas direções: verde num PR sem relação com ele, e vermelho no PR
que consertava justamente o teste que estava falhando. Deixou de rodar em
pull request; segue rodando no próprio branch e à mão.

**Um workflow podia reverter a versão.** O sincronizador de metadados trazia
`4.0.0` cravado no código e **empurra direto para o `main`**: dispará-lo depois
de uma entrega nova reescreveria tudo de volta, sem revisão. Agora ele lê o
arquivo `VERSION` em vez de impor um número morto, e não reescreve mais o
`versionCode`, que é um inteiro que só cresce.

## Testes

| Bateria | Resultado |
|---|---|
| Motor | 668/668 |
| Interface, Chrome de verdade | 92/92 |
| Atualizador | 18/18 |
| XML do Android | 11 ok |
| Referência dourada | idêntica — motor intacto |

Um teste de interface estava escrito **em cima do defeito**: procurava o
concurso como texto entre aspas e por isso passava junto com o bug, dando a
impressão de cobri-lo. Agora cobra o tipo explicitamente.

---

# 4.0.0 — a virada de identidade

A V4 é a virada de identidade: o app passou a se chamar **LotoLab**, o tema
escuro virou o padrão e a camada visual do mockup entrou por uma folha de
estilo própria, sem tocar no motor estatístico.

---

## O que mudou para quem usa

### Nome e aparência
O app se chama LotoLab. O nome aparece no título da janela, no cabeçalho, no
manifesto e no ícone da tela inicial — todos conferidos por teste, para que a
troca não fique pela metade em alguma tela.

O tema escuro passou a ser o padrão, e a cor de fundo é a mesma em todos os
lugares onde ela aparece: no app, na barra do navegador, na tela de partida do
app instalado e na splash do Android. Antes havia divergência entre eles, e o
resultado era um salto de cor meio segundo depois de abrir.

### Camada visual do mockup
A fidelidade ao mockup entrou como folha de estilo externa
(`ui/sorte2-ui-final.css`, 145 regras) em vez de reescrita do HTML. A escolha
tem consequência prática: a camada pode ser conferida, desligada e comparada
isoladamente, e nenhuma linha do motor foi tocada para acomodá-la.

### O que NÃO mudou
O motor estatístico está intacto. A referência dourada de `caracteristicas()` —
1760 valores em 176 jogos, gravada antes da otimização de desempenho — continua
batendo dígito por dígito. Nenhum método de geração, nenhum cálculo de
desempenho contra o acaso e nenhuma regra de conferência foi alterado nesta
versão.

E segue valendo o que sempre valeu: **o app não aumenta a chance de acertar.**
Ele monta jogos, guarda no aparelho, confere contra os concursos e mostra o
desempenho comparado ao acaso. Quando o desempenho não se separa do acaso, é
isso que ele mostra.

---

## Correções desta entrega

- **Cor do manifesto.** O app abria em `#061521` e a tela de partida do app
  instalado seguia em `#061522`. Como o manifesto é servido do cache sem
  revalidação, a divergência sobreviveria a qualquer atualização; por isso a
  versão do service worker subiu de 7 para 8, para que a correção chegue a quem
  já tem o app instalado.

- **Instalador de fidelidade visual.** Ele fixava a versão do service worker em
  `"7"` e, rodando de novo, desfazia em silêncio qualquer subida de versão
  posterior — inclusive as que existem para expulsar cache velho. Deixou de
  mexer nesse número. Também passou a normalizar a cor no manifesto, e não só
  no `colors.xml` do Android: era exatamente por essa fresta que o manifesto
  escapava.

- **Testes que passavam sem testar.** Três casos, todos conferidos ao contrário
  (quebrando o app de propósito para ver o teste falhar):
  - duas asserções de identidade aceitavam a marca antiga como resposta válida,
    ficando verdes no único caso que existiam para pegar;
  - a varredura da marca antiga e a checagem de "jogo de outra modalidade não
    aparece junto" usavam expressões regulares escritas dentro de um template
    literal, onde `\s` e `\b` viram letras comuns — as duas procuravam algo que
    não existe e passavam sempre. A segunda era anterior a esta auditoria.

- **Falso positivo no teste de erros de JavaScript.** O Chrome aborta sozinho a
  busca do ícone do manifesto em cerca de uma execução a cada três, e arquiva a
  mensagem fora do canal de rede. Medido: `icone.svg` responde 200 com
  `image/svg+xml` em toda tentativa. Só essa mensagem passou a ser ignorada;
  qualquer outro erro continua derrubando a bateria.

---

## Como esta versão foi verificada

| Bateria | Resultado |
|---|---|
| Motor (`testar-motor.mjs`) | 657/657 |
| Interface, Chrome de verdade (`testar-interface.mjs`) | 91/91, em três execuções seguidas |
| Atualizador de resultados (`testar-atualizador.mjs`) | 18/18 |
| XML do Android (`conferir-xml-android.py`) | 11 arquivos, todos bem-formados |
| Ícones (`conferir-icones.py`) | 34 conferências, nenhum problema |
| Referência dourada de `caracteristicas()` | idêntica |

Além das baterias, três verificações específicas da V4:

1. `index.html` e `www/index.html` são **idênticos byte a byte** — é o que o
   Capacitor empacota, e divergência ali significa app publicado diferente do
   testado.
2. A folha da V4 carrega com **HTTP 200**, tem 145 regras legíveis, e os valores
   computados no elemento vivo batem com o que ela pede. Desligada a folha, o
   fundo deixa de ser o da V4 — prova de que é ela que pinta, e não o CSS
   embutido.
3. O instalador de fidelidade roda sobre o `main` e **não muda nenhum arquivo**,
   o que é a prova mais forte disponível de que a V4 está integrada por inteiro,
   e não pela metade.

---

## Nota sobre o binário

Este repositório contém o **código-fonte** da 4.0.0, verificado. A geração e a
distribuição do APK não são feitas aqui. Nenhuma versão deste projeto foi
testada em aparelho real — a verificação é feita em Chrome headless e abrindo o
APK gerado para conferir o conteúdo.

## Nota sobre as tags

A tag mais recente do repositório, `v38-visual-final`, corresponde à **Visual
Final V3** e **não** deve ser usada como base para continuação. A fonte da
verdade da V4 é o branch `main`.
