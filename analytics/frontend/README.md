# Frontend — Loteria Analytics Brasil

**Duas telas, funcionando de verdade contra a API.** O §24 lista catorze;
preferimos duas que executam o código real a catorze que parecem executar. As
demais estão pendentes, e isso está declarado no CHECKLIST em vez de
disfarçado com telas vazias.

| Tela | O que faz |
|---|---|
| **Gerador** | Gera jogos com filtros de paridade e consecutivos, respeita orçamento, mostra custo, chance por jogo, sobreposição e semente |
| **Backtest** | Roda o backtest com separação temporal e exibe ROI, percentil contra carteiras aleatórias e o veredito estatístico completo |

## Duas regras de interface

**O aviso fica junto do dado, não no rodapé.** O aviso sobre filtros está
colado aos controles de filtro; o veredito estatístico fica no mesmo bloco do
ROI. Aviso em rodapé é aviso que ninguém lê — e o critério 14 do escopo existe
justamente para proteger quem lê um resultado.

**Erro da API chega inteiro ao usuário.** Quando o backend diz "orçamento de
20,00 comporta 4 jogos" ou "máximo de 500 simulações por requisição", é isso
que aparece na tela. Trocar por "algo deu errado" jogaria fora a parte útil.

## Rodar

```bash
# 1. a API, em outro terminal
cd ../backend
APP_SECRET=troque-isto python3 -m uvicorn lab.api:criar_app --factory

# 2. o frontend
npm install
npm run dev        # proxy de /api para a API
npm run build      # produção em dist/
```

`VITE_API_BASE` muda a base da API; sem ela, `/api` — o proxy do Vite em
desenvolvimento, ou um reverse proxy em produção.

## Verificado

Playwright contra a API real, com dados semeados:

- login e criação de conta;
- geração com filtro de paridade e de consecutivos — conferido que **todos** os
  jogos respeitam os filtros;
- orçamento cortando a quantidade e exibindo o aviso vindo do backend;
- backtest com partição cronológica e veredito Monte Carlo;
- **sem overflow horizontal a 390px** (critério 16);
- erro da API exibido literalmente;
- sem erros de console.
