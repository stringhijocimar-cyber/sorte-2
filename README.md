# LotoLab — aplicativo

Esta pasta é o aplicativo inteiro. Não falta nada, não tem dependência
externa, não precisa de build para funcionar.

Monta jogos das loterias brasileiras, guarda no aparelho e confere contra os
concursos — sempre mostrando o desempenho comparado ao acaso.

---

## Arquivos

```
index.html             o aplicativo inteiro: interface, lógica e estilos
manifest.webmanifest   identidade para instalação no Android
sw.js                  service worker — faz funcionar sem internet
icone.svg              ícone vetorial
icone-192.png          ícone Android
icone-512.png          ícone Android
icone-maskable.png     ícone adaptativo (o Android recorta as bordas)
servir.py              servidor local para testar no celular
package.json           scripts do Capacitor, para gerar o APK
capacitor.config.json  configuração do APK
```

Nada mais. Se algum arquivo sumir, o app degrada com elegância: sem `sw.js`
ele deixa de funcionar offline, sem os PNGs o Android usa o SVG.

## Arquivo opcional

`pesos.json` — pesos calibrados do modo "otimizado para rateio", gerados a
partir dos ganhadores publicados pela Caixa. Sem ele, o app usa hipóteses
declaradas e **avisa isso na tela**. Se você tiver a plataforma LotoLab:

```bash
python manage.py calibrar --modalidade mega-sena --preco 5.00 --exportar pesos.json
```

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

### Capacitor (embrulha esta pasta num app nativo)

```bash
npm install
npx cap init LotoLab app.lotolab.jogos --web-dir=.
npx cap add android
npx cap sync android
npx cap open android          # abre no Android Studio
```

Ou direto pela linha de comando, sem abrir o Android Studio:

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

Para publicar na Play Store, gere um APK assinado (`assembleRelease` com sua
keystore) ou um bundle (`bundleRelease`).

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
clara para a variação normal. Aparece na conferência, no placar e no ícone.

Sem verde-feltro, sem moeda, sem trevo, sem contagem regressiva, sem animação
de celebração. É uma ficha de conferência, não uma mesa de cassino.

## Uso responsável

Loteria é gasto de entretenimento, não investimento. Se o jogo deixou de ser
diversão para você ou alguém próximo: Jogadores Anônimos
(jogadoresanonimos.org.br) e CVV (188, gratuito, 24h).
