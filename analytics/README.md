# Loteria Analytics Brasil

Plataforma de análise estatística, geração, simulação e validação de jogos das
loterias oficiais brasileiras.

O sistema **não prevê resultados**, **não garante prêmios** e **não encontra
combinações vencedoras**. Sorteios honestos são eventos independentes: nenhuma
análise deste repositório muda a probabilidade de um número sair. O que ele faz
é permitir comparar metodologias com rigor, medir custo e retorno histórico, e
tornar visível quando um "achado" é apenas acaso.

---

## ⚠️ Estado real deste repositório

A especificação que originou este projeto descreve uma plataforma de vários
meses de trabalho para uma equipe. Este diretório contém **o núcleo estatístico
completo e testado**, e não a plataforma inteira. A tabela abaixo é honesta
sobre a diferença — leia antes de assumir qualquer coisa.

| Área | Situação |
|---|---|
| Registro das 9 modalidades, com preços históricos | ✅ pronto, testado |
| Probabilidades por faixa (hipergeométrica) | ✅ pronto, testado |
| Testes estatísticos (binomial, qui², permutação, bootstrap, Wilson) | ✅ pronto, conferido contra SciPy |
| Correção de múltiplos testes (Bonferroni, Holm, BH/FDR) | ✅ pronto, conferido contra statsmodels |
| Métricas financeiras (ROI, drawdown, seca, volatilidade) | ✅ pronto, testado |
| Backtest com separação temporal e trava anti-vazamento | ✅ pronto, testado |
| Walk-forward (janela expansiva e móvel) | ✅ pronto, testado |
| Comparação contra carteiras aleatórias + percentil | ✅ pronto, testado |
| Índice de Risco de Sobreajuste | ✅ pronto, testado (heurística, ver abaixo) |
| Importação incremental CAIXA + CSV, com validação e fallback | ✅ pronto, testado sem rede |
| Gerador configurável com filtros (§8, §9.6–9.13) | ✅ pronto, testado |
| Estratégias compostas do §9.15/9.16 (cobertura otimizada, híbrida) | ❌ pendente |
| API REST (auth, modalidades, gerador, conferência, backtest) | ✅ pronta, testada |
| Persistência (modelos, repositórios, versionamento, auditoria) | ✅ pronto, testado em SQLite/PostgreSQL |
| Migrações (Alembic) | ❌ pendente |
| Frontend Next.js, 14 telas, 17 gráficos | ❌ **não** implementado |
| Segurança: senhas, tokens, CSRF, limite de taxa, LGPD | ✅ pronto, testado |
| Monte Carlo paralelo + fila de tarefas | ✅ pronta, testada |
| Fila distribuída (Redis) para vários processos | ❌ pendente |
| Machine learning | ❌ **não** implementado |
| Exportação CSV, Excel e PDF | ✅ pronta, XLSX validado com openpyxl |
| Simulador Monte Carlo dedicado (§20) | ❌ **não** implementado |
| Docker / CI-CD | ⚠️ compose de desenvolvimento apenas |

Nada marcado ❌ foi simulado com implementação vazia. Preferi um núcleo em que
se pode confiar a uma casca completa que parece funcionar.

---

## Por que o núcleo estatístico veio primeiro

Num sistema deste tipo, o erro caro não é um botão fora do lugar — é um
backtest que vaza dados. Uma estratégia que enxerga o concurso que vai prever
parece excelente e não vale nada, e o defeito é invisível na tela. Três
mecanismos existem contra isso:

**1. A estratégia não recebe o concurso-alvo.** Não é uma convenção; é a
assinatura da função. `backtest.Estrategia` recebe `(modalidade, histórico
anterior, quantidade, rng)`. Não há como espiar o futuro por descuido. O teste
`test_estrategia_nao_ve_o_futuro` instala uma estratégia que *tenta* trapacear
e verifica que ela não consegue.

**2. Partição cronológica verificada.** `Particao` recusa, no construtor, uma
divisão fora de ordem — embaralhar concursos invalida o backtest, então isso
levanta `VazamentoDeDados` em vez de produzir um número bonito.

**3. Preço pela data do concurso.** Aplicar o preço de hoje a um concurso de
2021 infla o custo e afunda o ROI. A tabela de preços é histórica.

---

## O que a camada estatística garante

**Nenhuma função devolve um p-valor sozinho.** Todo resultado carrega
estimativa, intervalo de confiança, tamanho de efeito, tamanho de amostra e uma
leitura em português. P-valor solto é o principal produtor de conclusão errada
em análise de loteria.

**Correção para múltiplos testes é primeira classe.** Um sistema com dezenas de
filtros combináveis testa centenas de hipóteses; a 5%, uma em vinte
"descobertas" é falsa por construção. `Ajuste.perdidos` reporta exatamente
quais achados desapareceram após a correção — é a informação mais importante do
módulo, e a que um sistema desonesto omitiria.

**Implementação própria, conferida contra referência.** O núcleo é Python puro,
sem dependência científica obrigatória. Os testes comparam cada distribuição
com SciPy e cada correção com statsmodels. Uma implementação própria só merece
confiança se bater com uma referência independente.

---

## Índice de Risco de Sobreajuste

**Não é uma medida científica reconhecida.** É uma heurística composta criada
para este sistema, com a fórmula inteiramente aberta em `lab/overfitting.py`.
Serve para ordenar estratégias por suspeita, nunca para aprovar ou reprovar.

Pesos (somam 100, e ficam num único dicionário para que alterá-los seja uma
decisão visível):

| Componente | Peso | O que captura |
|---|---|---|
| Degradação | 35 | quanto do desempenho sumiu fora da amostra |
| Complexidade | 20 | parâmetros e filtros demais para o histórico |
| Instabilidade | 20 | variação entre janelas temporais |
| Sensibilidade | 15 | o resultado some ao perturbar os parâmetros |
| Concentração | 10 | o retorno depende de pouquíssimos concursos |

Quando não há janelas suficientes, a instabilidade é cobrada pela metade e o
sistema avisa: "não medido" não é o mesmo que "estável".

Faixas: 0–25 baixo · 26–50 moderado · 51–75 alto · 76–100 crítico.

---

## Rodar

```bash
cd backend
python3 -m pytest -q          # 312 testes, sem rede

# Confere a importação contra a API real da CAIXA (precisa de rede):
python3 ferramentas/verificar_caixa.py
```

O núcleo não exige dependências. SciPy e statsmodels são usados **apenas** nos
testes de conferência; sem eles, esses testes são pulados e o resto continua
valendo.

```bash
pip install -r requirements-dev.txt   # scipy, statsmodels, sqlalchemy, pytest
docker compose up                     # postgres + redis para desenvolvimento
```

---

## Estrutura

```
backend/
  lab/
    loterias.py      registro das 9 modalidades, preços históricos, probabilidades
    estatistica.py   testes, ICs, tamanhos de efeito — nunca p-valor sozinho
    multiplos.py     Bonferroni, Holm, Benjamini-Hochberg
    financeiro.py    ROI, drawdown, seca, volatilidade
    backtest.py      partição, walk-forward, comparação com aleatório
    overfitting.py   índice de risco (heurística documentada)
    ingestao.py      importação CAIXA incremental, CSV, validação, fallback
    filtros.py       filtros estruturais, cada um com aviso obrigatório
    gerador.py       geração com filtros, obrigatórios/excluídos, orçamento
    persistencia.py  modelos + repositórios; trava contra divergir do schema.sql
    seguranca.py     senhas, tokens, CSRF, limite de taxa, LGPD
    api.py           API REST: auth, geração, conferência, backtest
    exportacao.py    CSV, XLSX e PDF sem dependência de runtime
    simulacao.py     Monte Carlo paralelo, reprodutível sob qualquer nº de processos
    tarefas.py       fila em segundo plano para backtests longos
  ferramentas/
    verificar_caixa.py  confere a ingestão contra a API real (manual, usa rede)
  tests/             312 testes
```

## Acrescentar uma modalidade

Uma entrada em `loterias.MODALIDADES`. Não há código a mudar — as três
estruturas (`dezenas`, `composta`, `colunas`) já cobrem Super Sete,
+Milionária e Dia de Sorte.

---

## Jogo responsável

Loteria é gasto de entretenimento, não investimento. O valor esperado de
qualquer aposta é negativo, por desenho — é assim que a modalidade financia
prêmios e repasses.

Exclusivo para maiores de 18 anos. Se o jogo deixou de ser diversão:
**CVV — 188** (24h, gratuito) · **Jogadores Anônimos** —
jogadoresanonimos.com.br

Este repositório não contém, e não deve conter, mensagens do tipo "aposte
agora", "chance imperdível", "número vencedor", "número atrasado" ou "número
quente".
