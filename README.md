# sorte-2

Repositório do **LotoLab** — gerador e conferidor de jogos das loterias
brasileiras, empacotado como app Android via Capacitor (`app.lotolab.jogos`).

## Conteúdo

| Caminho                        | O que é                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `www/`                         | Interface do app (HTML/CSS/JS em arquivo único)                 |
| `LotoLab-1.0.0-release.apk`    | Build Android 1.0.0                                            |
| `index.html`, `styles.css`, `app.js` | Gerador web separado — **superado**, ver nota abaixo      |

### Sobre `www/`

O `www/` foi **extraído de `LotoLab-1.0.0-release.apk`** (`assets/public/`),
porque o repositório tinha só o APK compilado. É o `webDir` que o
`capacitor.config.json` do build aponta.

Se o projeto Capacitor completo existe em outro lugar, ele é a fonte de
verdade: aplique lá o mesmo delta de CSS descrito abaixo, em vez de adotar
esta pasta — senão o próximo build sobrescreve os ajustes.

Os stubs `cordova.js` e `cordova_plugins.js` (0 byte) não foram trazidos:
são injetados pelo empacotamento, não fazem parte da fonte.

## Rodando a interface

```bash
cd www && npx http-server -p 8080
```

O 404 de `pesos.json` no console é esperado: é o arquivo opcional de pesos
calibrados que o app menciona na aba "gerar". Sem ele, o app usa as hipóteses
declaradas.

## Ajustes de layout aplicados

Três mudanças no CSS de `www/index.html`, sem tocar na direção visual nem no
comportamento:

1. **Cabeçalho alinhado à coluna de conteúdo.** `.cabeca` ganhou
   `max-width:var(--coluna)` e centralização. Antes, a 1024px, a marca ficava
   colada na borda esquerda enquanto o conteúdo começava a 152px.
2. **Barra de abas acompanha a coluna** acima de 760px — largura da coluna,
   centrada, com bordas laterais, cantos superiores arredondados e sombra.
   Antes atravessava a página inteira, desprendida do conteúdo. No celular
   segue de borda a borda, como deve ser.
3. **Respiro do fim do `main` derivado da barra**, via
   `calc(var(--barra) + 40px + var(--base))` em vez do `96px` fixo — o valor
   passa a acompanhar a altura da barra em vez de ser um número solto.

Dois tokens novos em `:root`: `--coluna` (720px, a largura que já existia
espalhada) e `--barra` (53px).

Medido em Chromium a 320, 412 e 1024px: cabeçalho, conteúdo e abas coincidem
em 152→872 a 1024px; sem overflow horizontal; o último bloco do `main` fica
acima da barra em todos os tamanhos.

## Nota sobre o gerador na raiz

`index.html`, `styles.css` e `app.js` são um gerador web escrito antes de o
LotoLab estar no repositório, quando havia apenas o README. O LotoLab cobre o
mesmo terreno com muito mais profundidade — 8 modalidades, fechamento com
garantia verificada, modelo de rateio, conferência. Esses três arquivos podem
ser removidos.
