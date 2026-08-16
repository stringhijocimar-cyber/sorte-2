# LotoLab — aplicativo

O app é uma página única sem dependência externa e sem etapa de build: o
`index.html` contém interface, lógica e estilos. O Capacitor apenas o embrulha
num app nativo Android.

Monta jogos das loterias brasileiras, guarda no aparelho e confere contra os
concursos — sempre mostrando o desempenho comparado ao acaso.

**O app não prevê resultados e não aumenta a chance de acerto.** Sorteios
honestos são eventos independentes: nenhuma análise muda a probabilidade de uma
dezena sair. O que ele faz é medir, comparar contra o acaso, e dizer quando um
"achado" é ruído.

---

> ### Não há `.apk` neste repositório, e é de propósito
>
> Havia um `LotoLab-1.0.0-release.apk` de julho. Ele foi removido: era um build
> antigo que não acompanhava o código, e existir um binário desencontrado ao lado
> do fonte fazia parecer que havia **duas versões** do app. Quem baixava aquele
> arquivo instalava a versão anterior e concluía, com razão, que nada tinha
> mudado.
>
> Agora há **uma versão só**: o `index.html`. Ele é o app inteiro, e
> `www/index.html` é cópia idêntica dele.
>
> (O arquivo continua recuperável no histórico do git, no commit `d0facef`, para
> quem precisar do build publicado.)
>
> Para rodar no celular, escolha um:
>
> * **Sem compilar:** `python3 servir.py` e abra o endereço no navegador do
>   celular. É a mesma página que roda dentro de um APK.
> * **Compilando:** siga o `APK.md` — precisa de Android SDK, `npm install` e da
>   sua keystore. Um APK gerado assim sai como versão 1.2.0 (`versionCode 3`).

---

## As telas

Cinco seções na barra inferior, cada uma com suas telas num controle segmentado.
A modalidade é escolhida uma vez no cabeçalho e vale em todas as telas.

| Seção | Telas |
|---|---|
| **Gerar** | *Automático* — a sugestão do sistema e quatro métodos de montagem · *Manual* — marcação na cartela, com custo, validade e características do jogo |
| **Jogos** | *Meus jogos* — tudo o que foi salvo, com a cartela conferida · *Teimosinha* — repete o jogo por N concursos, com custo total e conferência de cada um |
| **Conferir** | *Conferir* — o último sorteio confrontado com os jogos salvos, sem clique, mais a digitação à mão para um concurso avulso · *Resultados* — histórico por modalidade, importado por colagem ou pelo serviço da Caixa |
| **Análise** | *Placar* — resultado acumulado contra o acaso · *Bancada* — todos os métodos contra o mesmo sorteio · *Aprendizado* — um modelo por modalidade, medido fora da amostra · *Pesquisa* — o motor que inventa e derruba hipóteses sozinho |
| **Entender** | o que o app faz, o que não faz, e por quê |

### A cara do app

Azul-marinho e teal, com cartões escuros e barra de navegação inferior — a
direção visual do pacote `sorte2_premium_full`, aplicada às dez telas.

O **escuro é o tema padrão**: é ele que dá a identidade. O claro continua
inteiro para quem usa o celular no sol, e a escolha fica guardada.

Não foi um redesenho tela a tela: a aparência mora nos **tokens**
(`--fundo`, `--carta`, `--acaso`, `--linha`, `--r`) e em meia dúzia de
componentes — barra inferior, pílulas de modalidade, KPIs e botão de ação.
Retunar os tokens levou a direção para todas as telas de uma vez, e é o que
mantém o app coerente quando uma tela nova aparece.

| Token | Escuro | Claro |
|---|---|---|
| `--fundo` | `#061522` | `#EEF5F6` |
| `--carta` | `#0A2030` | `#FFFFFF` |
| `--acaso` (teal) | `#2BE0C1` | `#0B8B78` |
| `--linha` | `#173A4D` | `#D7E4E6` |

O teal do pacote (`#2BE0C1`) vira texto ilegível sobre branco, então no claro
ele desce para `#0B8B78` — mesma família, contraste que passa. Os valores do
escuro são os do pacote, sem retoque.

**A cor da splash do Android acompanhou o app** (`#061522`), senão ele abriria
num azul e trocaria para outro meio segundo depois. **O fundo do ícone ficou
onde estava** (`#0F1E2E`): a arte do trevo foi desenhada e conferida sobre
aquele tom, e mudá-lo junto alteraria o ícone na tela inicial de quem já
instalou, sem ninguém ter pedido. Cor de app e cor de ícone são duas decisões.

### A cartela

A peça de escolha e de conferência é o volante de papel: grade impressa, marca
de caneta dentro da casa, e a conferência empilhando as duas camadas — casa
sorteada pintada, caneta por cima, acerto sendo os dois juntos.

Ela **não** reproduz a identidade da Caixa: nada de logo, nome de marca ou
paleta oficial. Imitar a forma ajuda a reconhecer o gesto; imitar a marca seria
se passar por eles.

### Conferência automática e avisos

O motor roda a cada mudança do histórico e na abertura do app: percorre jogos e
teimosinhas, confere o que falta, e registra um aviso por faixa de prêmio
atingida. É idempotente — a chave é (jogo, concurso).

Um jogo sem concurso-alvo declarado vale para os concursos **a partir da data em
que foi salvo**, nunca para trás. Conferir contra um sorteio anterior à criação
do jogo produziria "acertos" que ninguém poderia ter apostado.

O sino no cabeçalho é a via garantida, porque não depende de permissão. A
notificação do sistema é adicional e só depois de autorizada.

#### A central de atividades

A lista era corrida: quarenta avisos em ordem, sem separação e sem filtro.
Funciona com cinco; com quarenta, achar "o que aconteceu hoje" vira rolagem.

Duas divisões, as do mockup:

* **Por dia** — Hoje, Ontem, e depois a data. O agrupamento é por **dia de
  calendário**, e não por "24 horas atrás": às 00h30, o que aconteceu às 23h é
  ontem, e é assim que a pessoa pensa. O rótulo do dia gruda no topo ao rolar.
* **Por assunto** — Todas · Conferências · Análises · Sistema, cada chip com a
  sua contagem. Um chip sem número obrigaria a tocar para descobrir que está
  vazio.

`tipo` continua mandando na **cor** do item (prêmio verde, erro âmbar) e ganhou
um **grupo** separado para o filtro. São duas perguntas diferentes — "que
gravidade tem" e "de que assunto é" — e um campo só obrigaria a responder uma
delas errado. Um tipo que ninguém previu cai em Sistema em vez de sumir da tela:
perder aviso por esquecer de atualizar uma tabela é o pior desfecho possível.

O filtro **não é gravado**. Voltar dias depois e encontrar a lista filtrada por
um assunto que já se esqueceu de ter escolhido esconde aviso novo sem dizer que
está escondendo.

### Voltar

O app **não tinha nenhum tratamento de voltar**. No APK isso significa que o
botão do Android fechava o app: quem entrasse em Meus jogos por um atalho da
tela inicial e apertasse voltar era jogado para fora.

A pilha guarda de onde se veio, e só quando "de onde" faz sentido:

* Atalho ou salto interno **empilha** — foi um mergulho, e há para onde voltar.
* Barra inferior e abas do segmento **limpam** — são movimentos laterais entre
  telas irmãs, e voltar de um deles não quer dizer nada.

Por isso a seta aparece e some. Uma seta sempre visível que às vezes não tem
destino é pior que não ter seta; aqui, se ela está na tela, leva a um lugar de
onde a pessoa de fato veio — e o rótulo diz qual, porque quem chega por
notificação não veio de lugar nenhum que se lembre.

Com seta, o título vai para o centro (o cabeçalho de subtela do mockup). A grade
tem uma terceira coluna vazia do tamanho da seta: sem ela o título centraria no
espaço que sobra e ficaria visivelmente fora do meio.

O botão físico do Android segue a ordem que o sistema ensina: fecha a folha de
atividades, senão volta uma tela, senão sai do app. **Sair na primeira tela é
deliberado** — prender a pessoa dentro do app é o defeito oposto, e pior.

A pilha não é lida do armazenamento: abrir o app e encontrar uma seta apontando
para uma tela da semana passada não é memória útil, é confusão.

#### A tela Conferir mostrava o contrário do que o app fazia

Tudo acima já funcionava — e a tela Conferir abria com um formulário vazio
pedindo o número do concurso e as quinze dezenas à mão. O app **já** tinha o
concurso guardado e **já** havia conferido todos os jogos contra ele na
abertura. Um jogo com 14 acertos na Lotofácil ficava invisível ali: para
descobrir, era preciso ir até Meus jogos e procurar.

Pedir para digitar um resultado que o app conhece não é só trabalho repetido —
é dizer que não sabe. Hoje a tela abre com o painel do último concurso: qual
sorteio, se teve ganhador, e cada jogo salvo com os acertos marcados, do melhor
para o pior. Sem clique nenhum.

Três travas separam informação de conto:

* Quem manda é `conferencias`, preenchida por `conferenciaAutomatica()` — nunca
  uma recontagem feita no painel. Aquela função respeita a regra da data acima.
  Recontar por conta própria produziria acertos em sorteios anteriores ao dia em
  que o jogo existiu: o número mais fácil de exibir e o mais desonesto. Há teste
  com um jogo salvo **depois** do sorteio e com as dezenas **idênticas** às
  sorteadas — ele não pode aparecer com acerto nenhum.
* Jogo não coberto aparece dizendo **por que** ficou de fora, em vez de sumir da
  lista ou aparecer com zero. Zero é uma afirmação; ausência de conferência é
  outra coisa.
* O painel diz o que o app **guardou**, não o que existe no mundo. Pode haver
  concurso mais novo que ninguém buscou, e o texto diz isso com essas palavras.

O botão de atualizar tem três desfechos e cada um fala diferente — concurso
novo, já conhecido, ou nenhuma fonte respondeu. Um botão que responde sempre a
mesma coisa ensina a pessoa a não ler o que ele diz.

#### Coincidência, e não prêmio

A conferência dos seus jogos conta **dezenas coincidentes** e mostra quais. Ela
não diz "faixa de prêmio", não calcula valor, não carimba "premiado".

A conta da faixa é fácil de fazer e a afirmação é difícil de sustentar: quem
decide se um bilhete pagou é a Caixa, contra o volante registrado — e o app está
comparando duas listas guardadas no aparelho, que podem estar erradas de várias
formas (concurso trocado, modalidade trocada, dezena digitada errado). Entre
"você acertou 14 dezenas" e "seu jogo está em faixa de prêmio", só a primeira é
verificável aqui.

Duas coisas que **continuam**, e a distinção é o ponto:

* O estado do **concurso** — "2 ganhadores", "acumulou", com o valor do prêmio.
  É fato publicado pela Caixa sobre o sorteio, não leitura do bilhete de
  ninguém.
* A **notificação** de que um jogo salvo cruzou uma faixa. Ela é o motivo de a
  pessoa abrir o app, e continua saindo.

#### Concurso opcional por jogo

Um jogo salvo pode declarar **um** concurso. Aí ele vale só para aquele — útil
para transcrever um bilhete que já se tem na mão. Sem declaração, continua
valendo a regra da data.

O campo aparece só na cartela (montagem manual), porque é ali que existe um
bilhete de verdade. Nos jogos que o app gera não existe bilhete nenhum, e um
campo pedindo concurso ali sugeriria que existe.

Alvo declarado é respeitado mesmo que o jogo entre depois do sorteio: quem
digita "3401" está dizendo que jogou nele, e o app não confere bilhete. É o
mesmo tratamento que a teimosinha já recebia. A trava da data continua onde
ninguém declarou nada — que é o caso automático, e o único onde o app estaria
inventando cobertura.

### Aprendizado por modalidade

Um modelo **por modalidade**, treinado e avaliado separadamente. Juntar
modalidades num modelo só seria mais fácil e estaria errado: universo,
quantidade sorteada e calendário são diferentes, e o modelo aprenderia a
distinguir modalidade em vez de aprender algo sobre dezenas.

Regressão logística implementada no próprio arquivo, sem biblioteca. Treino e
teste separados no tempo, corte por concurso (nunca no meio de um concurso, cujas
linhas são dependentes), características calculadas só com os concursos
anteriores, e os 50 primeiros concursos usados como aquecimento.

A medida é AUC, não acerto — com 15 de 25 dezenas sorteadas, responder "sai"
para tudo acerta 60% e não aprendeu nada. O p-valor sai de um teste de
permutação com semente fixa, então **rodar de novo dá o mesmo resultado**.

Com sorteios independentes o veredito é "não há sinal, e este é o resultado
esperado". A bateria de testes prova que o medidor não é cego: com um sorteio
deliberadamente viciado, ele detecta (AUC 0,755, p = 0,010).

### Motor autônomo de pesquisa estatística adaptativa

Uma camada **sobre** o aprendizado, não no lugar dele. O modelo logístico
continua onde estava; o motor é outra coisa: um laboratório que inventa
hipóteses, testa, descarta, cruza as que sobram, muta, injeta hipóteses novas a
cada geração e guarda memória separada por loteria. Roda sozinho quando entra
concurso novo.

**O que ele não é**, e isto é desenho e não ressalva: não prevê sorteio, não
muda probabilidade de nada, não produz dezenas para apostar. A tela **não tem
botão de copiar nem de salvar**, e há um teste que reprova se algum aparecer —
uma hipótese experimental que vira aposta com um toque seria a mentira mais
fácil de contar aqui. A tela também não exibe dezena nenhuma, pelo mesmo motivo.

#### Uma hipótese

Uma combinação de até cinco **primitivos** — perguntas sobre uma dezena
respondidas só com os concursos anteriores — cada um com peso e uma
transformação (`direto`, `ao contrário`, `reforçando o alto`, `só acima da
média`). São 14 primitivos: frequências em três janelas, ausência, presença nos
concursos anteriores, posição, paridade, primo, Fibonacci, terminação, linha,
coluna e vizinhança.

O motor descreve o campeão em português — *"está na sequência de Fibonacci (só
acima da média, a favor, peso 1,84) · vizinha de dezena do concurso anterior
(direto, a favor, peso 1,40)"*. Uma afirmação que não se consegue ler não se
consegue contestar.

#### Por que uma busca evolutiva precisa de MAIS rigor, e não de menos

Uma busca que testa milhares de hipóteses **sempre** acha uma com AUC 0,58 em
algum recorte. Isso não é descoberta, é dragagem de dados. Três mecanismos
existem contra isso, e são a parte mais importante do módulo:

| Mecanismo | O que impede |
|---|---|
| **Separação estrita** — a evolução vive nos primeiros 70% dos concursos; os 30% finais são território proibido e o campeão só é medido lá uma vez | a busca decorar o conjunto que deveria julgá-la |
| **Família real** — o limiar é 0,05 ÷ nº de hipóteses **distintas** já testadas, acumulado desde a primeira geração | reportar p = 0,01 da melhor de 3.000 como se valesse alguma coisa |
| **Nulo construído igual** — a nuvem de comparação é uma população de hipóteses aleatórias com a mesma estrutura, medida na mesma validação | confundir o afastamento que a própria forma da hipótese produz com achado |

A aptidão usa o **pior** recorte de walk-forward, não a média: com a média, uma
hipótese que acerta muito num recorte e erra nos outros ganha da consistente — e
é a primeira que não se sustenta fora da amostra.

#### O que ele encontra nos dados reais

Quinze gerações em cada uma das oito loterias, com o histórico de verdade:

| Loteria | AUC na busca | AUC fora da amostra | Sumiu | Veredito |
|---|---:|---:|---:|---|
| Mega-Sena | 0,5182 | 0,5083 | 54% | nada |
| Lotofácil | 0,5174 | 0,4893 | 39% | nada |
| Quina | 0,5260 | 0,5061 | 76% | nada |
| Lotomania | 0,5110 | 0,4911 | 19% | nada |
| Dupla Sena | 0,5175 | 0,5221 | 0% | nada |
| Dia de Sorte | 0,5221 | 0,4877 | 44% | nada |
| Timemania | 0,5093 | 0,5041 | 57% | nada |
| +Milionária | 0,5352 | 0,5128 | 64% | nada |

**Oito de oito.** A busca sempre encontra uma vantagem aparente; boa parte dela
evapora fora da amostra; e nenhuma chega perto do limiar corrigido. É o retrato
de dragagem de dados sendo pega no ato.

#### Como se sabe que o silêncio dele significa algo

Um motor que nunca acha nada poderia estar quebrado. Um teste alimenta um
sorteio **deliberadamente viciado** — metade das dezenas repete o concurso
anterior — e exige que ele ache. Ele acha: AUC 0,737, e a hipótese vencedora
nomeia o primitivo certo (*"apareceu no concurso anterior"*). O mesmo gerador
sem o vício dá 0,4755 e nada sobrevive.

Esse teste também expôs dois defeitos que só apareceriam em produção:

**O cache colidia.** A chave era `quantos:último concurso` — dois históricos
diferentes com a mesma quantidade e o mesmo último número devolviam a mesma
matriz, em silêncio. O teste do sorteio viciado respondeu, com cinco casas de
precisão, o resultado do sorteio honesto rodado antes. Agora a chave inclui uma
impressão digital do conteúdo.

**O p-valor tinha piso.** Com 200 permutações o menor p possível é 0,00995, e o
limiar honesto de uma busca com centenas de hipóteses fica em 1e-4 — abaixo do
piso. Do jeito ingênuo o motor nunca poderia declarar achado nenhum, **nem um
verdadeiro**: contra o sorteio viciado ele encontrou AUC 0,737 e mesmo assim
reprovou. A saída não foi afrouxar o limiar: as permutações passaram a estimar a
média e o desvio do nulo — preservando a dependência dentro de cada concurso — e
o p sai da cauda normal desse nulo. O p empírico continua reportado ao lado, e
um teste exige que os dois concordem quando o empírico está longe do piso.

#### Custo

187 ms por geração e 690 ms para o julgamento, na Mega-Sena. Usa os 300
concursos mais recentes: com o histórico inteiro cada geração varreria 170 mil
linhas num celular, e o motor deixaria de rodar sozinho por ser insuportável.

### Busca de resultados na Caixa

A importação por **colagem** (planilha ou JSON) funciona sem rede e é a via
verificada. A **busca online** no serviço público do Portal de Loterias segue o
formato que ele publica, mas **não pôde ser testada**: a rede do ambiente onde
foi escrita bloqueia o domínio da Caixa. A tela declara isso, e em caso de erro
mostra a falha em vez de inventar um resultado.

---

## Estrutura do repositório

```
index.html             ← EDITE AQUI. O app inteiro: interface, lógica, estilos
manifest.webmanifest   identidade para instalação no Android
sw.js                  service worker — faz funcionar sem internet
icone.svg              ← A FONTE DA MARCA. Todo o resto é gerado daqui
icone-192.png          gerado — ícone do navegador
icone-512.png          gerado — ícone do navegador e base dos ícones legados
icone-maskable.png     gerado — ícone adaptativo do manifesto (purpose maskable)
icone-frente.png       gerado — camada da frente do ícone adaptativo do Android,
                       fundo transparente (o monocromático usa o canal alfa)
servir.py              servidor local para testar no computador e no celular
package.json           dependências e scripts do Capacitor
package-lock.json      versões travadas (reprodutibilidade)
capacitor.config.json  configuração do app nativo (appId, webDir)

www/                   ← RAIZ DE EMPACOTAMENTO do Capacitor (webDir)
android/               projeto Android gerado pelo Capacitor, com ajustes
ferramentas/           scripts de apoio (geração de ícones, testes)
capturas/              capturas de tela, geradas por ferramentas/testar-interface.mjs
APK.md                 como reconstruir o APK do zero
LOJA.md                textos e ficha de dados para a Play Store
```

### Trocar o ícone do app

`icone.svg` é a única arte desenhada à mão. Tudo o mais — os PNGs do navegador
e os quinze arquivos do Android — sai dele:

```bash
python3 ferramentas/gerar-pngs-do-icone.py   # icone.svg  -> PNGs
python3 ferramentas/gerar-icones.py          # PNGs       -> android/.../res/
python3 ferramentas/conferir-icones.py       # confere o que quebra no aparelho
cp icone-192.png icone-512.png icone-maskable.png icone.svg www/
```

A rasterização é feita pelo Chromium headless, o mesmo motor que desenha o
ícone dentro do app — o PNG sai igual ao que aparece no cabeçalho.

**Ao trocar o ícone, suba `VERSAO` em `sw.js`.** Os PNGs são servidos pelo
cache primeiro, e cache primeiro nunca confere se mudou: sem trocar a versão,
quem já instalou continuaria vendo o ícone antigo para sempre.

Isso já aconteceu de outra forma: em agosto o trevo novo entrou no `icone.svg`,
mas nada ligava o SVG aos PNGs, então o ícone do celular continuou o antigo. A
ligação existe agora, e `conferir-icones.py` roda na integração contínua.

O que ele confere não é semelhança de imagem — é o que quebra de verdade:

| Conferência | O que evita |
|---|---|
| Camada da frente com transparência | o ícone monocromático do Android 13 virar um quadrado chapado |
| Desenho dentro do círculo central de 72dp | o recorte do fabricante comer as pontas das folhas |
| Ícones legados opacos e sem buraco no meio | furo na tela em Android 7 e anteriores |
| Todas as cinco densidades presentes | ícone borrado justo em quem tem a melhor tela |

### `index.html` da raiz vs. `www/index.html`

Existem **dois** `index.html`, e hoje eles são **idênticos** — mas não por
mágica, e sim porque foram sincronizados à mão:

| Caminho | Papel |
|---|---|
| `index.html` (raiz) | Onde o desenvolvimento acontece. **Edite este.** |
| `www/index.html` | Cópia que o Capacitor empacota (`webDir: "www"`). |

Editar a raiz e esquecer de copiar é o erro clássico deste projeto: os testes
continuam passando (rodam sobre a raiz) e o APK sai sem a mudança. Confira
quando estiver em dúvida:

```bash
cmp index.html www/index.html && echo "sincronizados"
```

Antes de gerar um APK novo, sincronize:

```bash
cp index.html manifest.webmanifest sw.js icone*.png icone.svg www/
npx cap sync android
```

Não há build automatizado que faça isso — é uma cópia manual, de propósito,
para que a pasta empacotada seja sempre explícita.

## Dois métodos retirados, e por quê

**"Otimizado para rateio"** e **"Contraste por restrição"** saíram da lista a
pedido do dono do app, que não acreditava no primeiro. A medida deu razão a ele.

Os dois pesavam padrões humanos — datas, sequências, desenho no volante — com
números **supostos**, declarados na constante `PESOS`. O app tem a máquina para
medir esses pesos de verdade (`calibrarPopularidade`, regressão sobre os
ganhadores publicados), e ela exige 30 concursos com rateio por modalidade.
O histórico deste repositório traz **26 no total, somando as oito
modalidades**. A calibração nunca rodou uma vez sequer.

O fenômeno de fundo é real e conhecido: gente marca data de nascimento, e quem
foge disso divide com menos gente. O que não existia era o número. Um método
que se anuncia "otimizado" apoiado em peso que ninguém conferiu é exatamente a
promessa que este app existe para não fazer.

As funções `gerarRateio` e `gerarContraste` continuam no arquivo — outras
partes as usam como reserva, e `nomeDoMetodo()` garante que jogos salvos por
elas continuem abrindo. Se um dia entrar histórico com rateio suficiente, a
calibração roda sozinha e a conversa recomeça com número medido.

## Arquivo opcional: `pesos.json`

Pesos calibrados, gerados a partir dos ganhadores publicados pela Caixa.
**Não está neste repositório** e o app funciona sem ele. A ausência do arquivo
gera um 404 no console, que é esperado e tratado.

O comando abaixo pertence à plataforma LotoLab, um projeto **separado** que
não faz parte deste repositório:

```bash
python manage.py calibrar --modalidade mega-sena --preco 5.00 --exportar pesos.json
```

## O que este repositório NÃO contém

O `index.html` referencia dois artefatos Python que vivem na plataforma
LotoLab, um projeto separado:

| Referência no código | Onde aparece | Situação |
|---|---|---|
| `premio/impopularidade.py` | comentário na linha ~336 | **ausente** |
| `manage.py calibrar` | comentário na linha ~380 e este README | **ausente** |
| `pesos.json` | `fetch()` na linha ~1001 | **ausente** (opcional) |

Esses arquivos nunca fizeram parte do app e **não foram recriados**: um
arquivo reconstruído por engenharia reversa pareceria original e induziria a
erro quem fosse evoluí-lo. O modelo de rateio está implementado de forma
autônoma em JavaScript no próprio `index.html` — constante `PESOS` e função
`caracteristicas()` — e funciona sem a plataforma.

Também não são versionados, por decisão: `node_modules/`, artefatos de build
(`android/build/`, `android/app/build/`, `android/.gradle/`), APK/AAB gerados
e **todos os segredos de assinatura** (`*.jks`, `chave.properties`,
`local.properties`).

---

## O que o app faz

| Aba | Função |
|---|---|
| **Gerar** | A sugestão do sistema, e a montagem por método |
| **Meus jogos** | Guarda os lotes, permite copiar e apagar |
| **Conferir** | Você digita o resultado oficial; ele marca os acertos de cada jogo |
| **Placar** | Desempenho acumulado dos seus jogos contra o que o acaso produziria |
| **Entender** | O que cada método faz de verdade, e uso responsável |

Modalidades: Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Dia de Sorte,
Timemania e +Milionária.

### A sugestão do sistema

Um jogo montado com **todas** as estatísticas do histórico e **sem estratégia
nenhuma** por trás. Sorteia candidatas uniformemente e fica com aquela cuja
medida mais rara ainda é comum: nenhuma das dez medidas — pares/ímpares, soma,
moldura, múltiplos de 3, primos, Fibonacci, menor e maior dezena, consecutivos
e repetidas do último concurso — cai num extremo.

O critério é o **mínimo**, não a média: numa média, uma medida raríssima passa
escondida atrás de nove comuns, e é justamente a rara que define o caráter do
jogo. E a comparação é com a **distribuição observada**, não com a fórmula — a
teoria diz quanto deveria dar, o histórico diz quanto deu.

A tela mostra, ao lado do resultado, o que uma candidata qualquer entrega. Sem
essa referência, "a medida mais rara aparece em 9% dos concursos" não significa
nada. Medido na Mega-Sena com 2.823 concursos: 9,5% contra 3,4% de um jogo
sorteado sem critério.

**Isto não aumenta a chance de acertar**, e a tela diz isso com todas as
letras. Toda combinação tem a mesma probabilidade; o próximo sorteio pode ser o
mais atípico possível. O que a sugestão entrega é parecença com o retrato médio
dos sorteios que já saíram — que é exatamente o que foi pedido, e nada além.

### Os métodos

**Sorteio uniforme** — cada combinação com a mesma chance. É a referência.

**Cobertura espalhada** — jogos que se repetem pouco entre si: 0,11 dezena de
sobreposição média, contra 1,00 do sorteio uniforme. Não muda a chance de
nenhum jogo isolado.

**Evita o concurso anterior** — entre candidatas uniformes, fica com as que
menos repetem o último resultado. Faz só isso: o desempate entre candidatas com
o mesmo número de repetidas é a ordem em que saíram da urna, ou seja, o acaso.

**Fechamento com garantia verificada** — na Lotofácil. Com 18 dezenas
marcadas: 21 jogos garantem 13 acertos se 14 das suas saírem, contra 816 do
volante completo — 97,4% de economia. A garantia é verificada testando todos
os cenários; se não puder ser provada, o app avisa em vez de prometer.

### O que o app não faz

Não aumenta a chance de você ganhar. Nenhum app faz isso. Em um sorteio
honesto cada concurso é independente do anterior, então o histórico não carrega
informação sobre o próximo resultado. Mega-Sena: 1 em 50.063.860 por aposta
simples, com qualquer método.

A aba **Placar** existe para você não precisar acreditar em ninguém: acompanha
seus acertos reais ao longo dos concursos, com a linha do acaso ao lado.

---

## Rodar agora

### No computador

```bash
python3 servir.py
```

Abra `http://127.0.0.1:8080`. Só isso.

### No celular, pela rede local

Rode `python3 servir.py` e abra no Chrome do Android o endereço que ele mostrar
(algo como `http://192.168.0.15:8080`). Depois: **Menu ⋮ → Adicionar à tela
inicial**.

### Publicado em HTTPS (recomendado)

Suba esta pasta em qualquer hospedagem estática — GitHub Pages, Netlify,
Vercel, Cloudflare Pages. Com HTTPS o Chrome oferece **Instalar aplicativo**
sozinho, e ele passa a abrir em tela cheia, sem barra de navegador.

Pelo GitHub Pages: `Settings → Pages → Source: main → /(root)`.

---

## Gerar o APK

A pasta `android/` **já está no repositório**, com ajustes manuais que o
Capacitor não gera sozinho (ícone adaptativo, splash, orientação retrato,
remoção de permissões). **Não rode `npx cap add android`** — ele recria a
pasta e descarta esses ajustes. O passo a passo completo está em `APK.md`.

```bash
npm install

# 1. sincronize a pasta empacotada (veja o aviso sobre index.html acima)
cp index.html manifest.webmanifest sw.js icone*.png icone.svg www/
npx cap sync android

# 2. compile
cd android
./gradlew assembleDebug        # APK de teste
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

### Release assinado

A keystore **não está no repositório** e não deve estar. Gere a sua:

```bash
keytool -genkeypair -v -keystore android/minha-chave.jks \
  -keyalg RSA -keysize 4096 -validity 10950 -alias lotolab
```

Crie `android/chave.properties` (ignorado pelo git):

```properties
storeFile=minha-chave.jks
storePassword=SUA_SENHA
keyAlias=lotolab
keyPassword=SUA_SENHA
```

Então:

```bash
cd android
./gradlew assembleRelease     # APK assinado
./gradlew bundleRelease       # AAB para a Play Store
```

**Guarde a keystore e as senhas.** Se você perdê-las, não será mais possível
publicar atualizações do app na Play Store — só um app novo, com outro
identificador.

### Testes

```bash
node ferramentas/testar-motor.mjs             # lógica — 620 testes
python3 ferramentas/conferir-icones.py        # ícones — 34 conferências
python3 ferramentas/conferir-xml-android.py   # XML do projeto nativo

# A interface precisa de um servidor HTTP: em file:// o service worker não
# registra, e o teste do modo avião passaria medindo outra coisa.
python3 -m http.server 8123 &
node --experimental-websocket ferramentas/testar-interface.mjs   # interface — 71 testes
```

O executável do navegador é configurável, porque nem todo ambiente tem
`google-chrome` no PATH:

```bash
LOTOLAB_CHROME=/caminho/para/chromium node ferramentas/testar-interface.mjs
```

`testar-motor.mjs` não reimplementa nada: extrai o `<script>` do `index.html` e
o executa numa VM com um DOM mínimo. O que é testado é exatamente o código que
roda no aparelho.

#### Duas lições que custaram uma compilação

A v26 falhou com **625 verificações verdes**. As duas causas valem registro,
porque a forma delas se repete:

**O que ninguém olha, ninguém testa.** O defeito era um `--` dentro de um
comentário XML em `colors.xml` — proibido pela norma, e erro fatal para o
Android. Nenhuma das baterias lia o projeto nativo, então a primeira coisa a
reclamar foi o Gradle, no meio de uma compilação de release. Hoje
`conferir-xml-android.py` roda a cada push e custa milissegundos. No mesmo
espírito: `testar-interface.mjs` existia mas não rodava em workflow nenhum, o
que na prática é igual a não existir. Agora roda.

**Um teste verde não é prova de que ele testa algo.** O teste "sem erro de
JavaScript no console" lia apenas `Log.entryAdded`. Exceção de JavaScript não
chega por esse canal — vai para `Runtime.exceptionThrown`, e `console.error`
para `Runtime.consoleAPICalled`. Ele vigiava o canal errado: uma função
inexistente chamada no carregamento passava como "ok". Descoberto ao quebrar o
app de propósito para ver se acusava. Hoje escuta os três canais, ignora falha
de rede pela origem que o Chrome atribui (e não por lista de textos), e há
teste negativo confirmando que exceção e `console.error` derrubam a bateria.

### Quanto tempo a bancada leva

Medido com os 2.823 concursos da Mega-Sena carregados, no ajuste padrão
(10 concursos, 20 lotes de 3 jogos). Um aparelho é bem mais lento que a máquina
onde isto foi medido — o número serve para comparar versões, não para prometer
tempo de tela:

| Versão | Tempo |
|---|---|
| Antes do teto (todos os 2.823 concursos, lotes de 40) | ~16 minutos |
| Com teto de 10 concursos e lotes de 20 | 6,8 s |
| `caracteristicas()` sem alocar a cada jogo | 4,6 s |
| `sortear()` com Fisher–Yates parcial | **1,9 s** |

O ganho grande não veio de calcular menos, e sim de parar de desperdiçar:
`sortear` embaralhava as 60 dezenas inteiras para ficar com 6, e trocava cada
par alocando um array. A bancada faz isso dezenas de milhares de vezes por
rodada. Os valores na tela não mudaram — há um teste que compara as
características de 176 jogos, em todas as modalidades, dígito por dígito.

O teste de interface precisa de um Chrome/Chromium e de um servidor local
servindo `www/` (a porta 5060 **não** funciona: o Chrome bloqueia por ser
porta de SIP).

### Bubblewrap (alternativa, exige o app publicado em HTTPS)

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://SEU-DOMINIO/manifest.webmanifest
bubblewrap build
```

Produz um APK assinado como Trusted Web Activity. Mais leve que o Capacitor,
mas depende da URL pública.

---

## Antes de publicar

**Confirme regras e preços** na fonte oficial. Os valores estão no topo do
`index.html`, no objeto `MODALIDADES` — em um lugar só, de propósito. Regras e
preços mudam.

**Não anuncie o app como algo que aumenta a chance de ganhar.** Além de falso,
no Brasil isso configura publicidade enganosa (CDC, arts. 36 e 37), e as lojas
removem aplicativos de loteria com esse tipo de promessa. O texto da aba
**Entender** foi escrito para servir como descrição na loja: diz o que o app
faz sem prometer o que ele não faz.

**Privacidade.** O app não coleta nada, não pede cadastro, não envia dados e
não usa rastreadores. Tudo fica em `localStorage` no aparelho. Isso simplifica
a ficha de privacidade da Play Store: nenhuma coleta de dados.

## Design

A peça de identidade é a **faixa do acaso**: marcador âmbar para o seu
resultado, traço tracejado teal para o que a aleatoriedade produziria, faixa
clara para a variação normal. Aparece na conferência e no placar.

Sem verde-feltro, sem moeda, sem contagem regressiva, sem animação de
celebração. É uma ficha de conferência, não uma mesa de cassino.

**Sobre o trevo do ícone.** O símbolo é um trevo de quatro folhas geométrico,
adotado por ser mecânica real de loteria — a +Milionária sorteia trevos junto
com as dezenas. É desenhado de forma sóbria, sem brilho, estrela ou faísca, e
**nenhum texto do app associa o trevo a sorte, sortudo ou amuleto**. A
distinção importa: um ícone que promete sorte contradiz o próprio conteúdo do
app e o expõe ao risco de remoção da loja.

## Uso responsável

Loteria é gasto de entretenimento, não investimento. Se o jogo deixou de ser
diversão para você ou alguém próximo: Jogadores Anônimos
(jogadoresanonimos.org.br) e CVV (188, gratuito, 24h).
