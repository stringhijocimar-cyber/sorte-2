# LotoLab — aplicativo

O app é uma página única sem dependência externa e sem etapa de build: o
`index.html` contém interface, lógica e estilos. O Capacitor apenas o embrulha
num app nativo Android.

Monta jogos das loterias brasileiras, guarda no aparelho e confere contra os
concursos — sempre mostrando o desempenho comparado ao acaso.

---

## Estrutura do repositório

```
index.html             ← EDITE AQUI. O app inteiro: interface, lógica, estilos
manifest.webmanifest   identidade para instalação no Android
sw.js                  service worker — faz funcionar sem internet
icone.svg              ícone vetorial (trevo de quatro folhas)
icone-192.png          ícone Android
icone-512.png          ícone Android
icone-maskable.png     ícone adaptativo (o Android recorta as bordas) — fonte
                       dos ícones gerados em android/app/src/main/res/
servir.py              servidor local para testar no computador e no celular
package.json           dependências e scripts do Capacitor
package-lock.json      versões travadas (reprodutibilidade)
capacitor.config.json  configuração do app nativo (appId, webDir)

www/                   ← RAIZ DE EMPACOTAMENTO do Capacitor (webDir)
android/               projeto Android gerado pelo Capacitor, com ajustes
ferramentas/           scripts de apoio (geração de ícones, testes)
capturas/              capturas de tela das cinco abas
APK.md                 como reconstruir o APK do zero
LOJA.md                textos e ficha de dados para a Play Store
```

### ⚠️ Atenção: `index.html` da raiz vs. `www/index.html`

Existem **dois** `index.html`, e eles não são idênticos:

| Caminho | Papel |
|---|---|
| `index.html` (raiz) | Onde o desenvolvimento acontece. **Edite este.** |
| `www/index.html` | Cópia que o Capacitor empacota (`webDir: "www"`). |

O APK publicado (`LotoLab-1.0.0-release.apk`) foi construído a partir de
`www/index.html`. O arquivo da raiz contém alterações **posteriores** ao
último build (logo de trevo e refino visual) que ainda **não** foram
compiladas.

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
| **Conferir** | Busca o resultado no serviço da Caixa ou você digita; marca os acertos de cada jogo |
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

### Busca de resultado oficial

A aba **Conferir** tem dois botões que consultam o serviço público de loterias
da Caixa (`servicebus2.caixa.gov.br`) e preenchem concurso, data e dezenas:
**Buscar resultado na Caixa** (pelo número digitado) e **Último concurso**.

| Aspecto | Como é |
|---|---|
| O que sai do aparelho | Modalidade e número do concurso, nada mais |
| O que **não** sai | Jogos, dezenas, histórico, identificador de aparelho |
| Servidor do LotoLab | Não existe — a chamada vai direto à Caixa, por HTTPS |
| Permissão Android | `INTERNET`, a única do app (permissão normal, sem diálogo) |
| Selo na tela | `oficial` quando veio da Caixa, `manual` quando falhou ou foi digitado |
| Tempo limite | 12 s, via `AbortController` — a tela nunca fica travada |
| Sem rede | O botão avisa e a digitação continua funcionando; o app é inteiro offline |
| Cache | O service worker **não** guarda resposta da API, só a casca do app |

A busca só preenche um sorteio **que já aconteceu**. Não há previsão de sorteio
futuro, nem sugestão de jogo a partir do histórico: o gerador não lê os
resultados buscados.

O `sw.js` ignora qualquer host que não seja o próprio app. Isso é deliberado —
se a resposta da Caixa fosse cacheada, o app poderia exibir um concurso antigo
com o selo `oficial`, inclusive offline.

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
node ferramentas/testar-motor.mjs                          # lógica
node --experimental-websocket ferramentas/testar-interface.mjs   # interface
```

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
