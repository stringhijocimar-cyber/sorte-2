# sorte-2

Gerador de jogos das loterias brasileiras. Página única, sem dependências e sem
etapa de build — abra o `index.html` ou sirva a pasta com qualquer servidor estático.

```bash
npx http-server -p 8080
# ou
python3 -m http.server 8080
```

## Modalidades

| Loteria    | Dezenas por jogo | Universo |
| ---------- | ---------------- | -------- |
| Mega-Sena  | 6 a 15           | 1–60     |
| Quina      | 5 a 15           | 1–80     |
| Lotofácil  | 15 a 20          | 1–25     |
| Lotomania  | 50               | 1–100    |
| Dupla Sena | 6 a 15           | 1–50     |
| Timemania  | 10               | 1–80     |

## Layout

- Duas colunas no desktop (controles fixos à esquerda, resultados à direita) que
  colapsam para uma coluna abaixo de 60rem.
- Tema claro/escuro seguindo o sistema, com alternância manual persistida em
  `localStorage`.
- Cada modalidade tem uma cor que percorre o cartão selecionado, o slider, o
  contador e as bolas dos jogos.
- Navegável por teclado, com `skip link`, `radiogroup` rotulado, região
  `aria-live` para os resultados e respeito a `prefers-reduced-motion`.

## Arquivos

- `index.html` — estrutura e marcação acessível
- `styles.css` — tokens de design, temas e layout responsivo
- `app.js` — sorteio (via `crypto.getRandomValues`, sem viés de módulo) e renderização
