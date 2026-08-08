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
>   sua keystore. Um APK gerado assim sai como versão 1.1.0 (`versionCode 2`).

---

## As telas

Cinco seções na barra inferior, cada uma com suas telas num controle segmentado.
A modalidade é escolhida uma vez no cabeçalho e vale em todas as telas.

| Seção | Telas |
|---|---|
| **Gerar** | *Automático* — seis métodos de montagem · *Manual* — marcação na cartela, com custo, validade e características do jogo |
| **Jogos** | *Meus jogos* — tudo o que foi salvo, com a cartela conferida · *Teimosinha* — repete o jogo por N concursos, com custo total e conferência de cada um |
| **Conferir** | *Conferir* — informa um resultado e confere os jogos · *Resultados* — histórico por modalidade, importado por colagem ou pelo serviço da Caixa |
| **Análise** | *Placar* — resultado acumulado contra o acaso · *Bancada* — todos os métodos contra o mesmo sorteio · *Aprendizado* — um modelo por modalidade, medido fora da amostra |
| **Entender** | o que o app faz, o que não faz, e por quê |

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

## Arquivo opcional: `pesos.json`

Pesos calibrados do modo "otimizado para rateio", gerados a partir dos
ganhadores publicados pela Caixa. **Não está neste repositório** e o app
funciona sem ele: usa as hipóteses declaradas na constante `PESOS` do
`index.html` e **avisa isso na tela**. A ausência do arquivo gera um 404 no
console, que é esperado e tratado.

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
| **Gerar** | Monta a quantidade de jogos que você escolher, por quatro métodos |
| **Meus jogos** | Guarda os lotes, permite copiar e apagar |
| **Conferir** | Você digita o resultado oficial; ele marca os acertos de cada jogo |
| **Placar** | Desempenho acumulado dos seus jogos contra o que o acaso produziria |
| **Entender** | O que cada método faz de verdade, e uso responsável |

Modalidades: Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Dia de Sorte,
Timemania e +Milionária.

### Os quatro métodos

**Sorteio uniforme** — cada combinação com a mesma chance. É a referência.

**Otimizado para rateio** — evita padrões que muita gente marca: concentração
em 1–31 (datas de nascimento), sequências, desenhos no volante, espaçamento
regular, soma na média. Mesma chance de acertar; menos gente para dividir se
acertar. É o único método com efeito mensurável, e o efeito é sobre o valor
recebido.

**Cobertura espalhada** — jogos que se repetem pouco entre si: 0,11 dezena de
sobreposição média, contra 1,00 do sorteio uniforme. Não muda a chance de
nenhum jogo isolado.

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
node ferramentas/testar-motor.mjs                          # lógica — 370 testes
node --experimental-websocket ferramentas/testar-interface.mjs   # interface — 42 testes
```

O executável do navegador é configurável, porque nem todo ambiente tem
`google-chrome` no PATH:

```bash
LOTOLAB_CHROME=/caminho/para/chromium node ferramentas/testar-interface.mjs
```

`testar-motor.mjs` não reimplementa nada: extrai o `<script>` do `index.html` e
o executa numa VM com um DOM mínimo. O que é testado é exatamente o código que
roda no aparelho.

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
