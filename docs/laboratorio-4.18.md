# LotoLab 4.18 — entrega técnica

A evolução integra um laboratório analítico ao aplicativo existente. Preserva as 15 telas, as oito modalidades do seletor principal, o tema escuro, os acentos por modalidade, o degradê suave, os resultados amarelos com números grafite e as conferências verdes/vermelhas. O laboratório acrescenta Mega da Virada e Super Sete em seu seletor próprio.

O [diagnóstico anterior às alterações](diagnostico-4.18.md) registra arquitetura, acervo, funcionalidades existentes e lacunas. Este documento descreve a entrega e seus limites, sem afirmar capacidade de prever sorteios.

## Comparação das versões

| Área | 4.17 | 4.18 |
|---|---|---|
| Combinação | Recorrência e acertos nas oito modalidades | Perfil completo, percentuais, índices, dez formatos |
| Referência | Distribuição matemática | Matemática + 2.000 jogos uniformes independentes + resultados comparáveis |
| Subconjuntos | Até 2.000 grupos materializados | Todas as páginas indexáveis, com contagens exatas |
| Explicação | Critérios básicos | Perfil individual, aderência, cobertura, frequência e limitações |
| Estratégias | Avaliação ampliada anterior preservada | Dez hipóteses, oito ablações, duas perturbações de pesos |
| Acompanhamento | Conferência de jogos | Registro prospectivo e recomendação manter/ajustar/substituir |
| Simulação | Recursos dispersos | Monte Carlo unificado, semente e relatório |
| Execução | Cálculos na página | Novas tarefas pesadas em Web Worker cancelável |

## Funcionalidades implementadas

- Qualquer aposta válida do formato selecionado, incluindo marcações ampliadas; zero é válido na Lotomania. Super Sete mantém posições e permite repetições entre colunas.
- Distribuição **exatamente 0…k**, independente de **pelo menos h**. Percentuais, predominantes, faixas raras (<1%) e não observadas. Faixas impossíveis matematicamente têm chance zero; ausência na amostra não equivale a impossibilidade.
- Lista completa de concursos por faixa, paginada, com data disponível, resultado, coincidências, não coincidências e intervalo desde a ocorrência anterior.
- Frequência por dezena, janela recente de até 30, longo prazo, desvio em relação ao esperado, Wilson 95%, atraso e intervalos. Lacunas não são atravessadas para estimar períodos desconhecidos.
- Pares, trios, quartetos, quintetos e conjunto principal completo; frequência, ocorrências, datas, intervalos, repetições consecutivas e três períodos. A indexação combinatória permite acessar, por exemplo, os 2.118.760 quintetos de 50 marcações sem alocá-los simultaneamente.
- Repetições completas confirmadas separadas de coincidências apenas no campo principal. Complementos ausentes não confirmam repetição total.
- População de até 10.000 candidatas e lotes de 1–60 jogos, orçamento, novidade, restrição de sobreposição, repetição do último concurso e redução de pares/trios repetidos.
- Carteira: união de dezenas, pares e trios, sobreposição média/máxima, distância de Jaccard, duplicatas, somas, paridade e perfis. Pode propor substituições e salvar um novo lote, conservando os registros anteriores.
- Diagnóstico prospectivo e avaliação automática de alternativas quando chega um resultado de um concurso vinculado. Amostra insuficiente é explicitada.
- Monte Carlo de 1.000–100.000 sorteios uniformes, semente, distribuição e atrasos de grupos específicos. Dados simulados jamais entram no histórico real.
- Mudança de perfil com janelas disjuntas 120/60/30, 499 permutações e Holm. Estados: sinal estatístico, compatível com ruído, inconclusiva ou amostra insuficiente.
- Importação validada de JSON e consulta oficial, preservando a atualização existente. Origem declarada, conflitos, duplicidades, datas e complementos faltantes ficam visíveis.
- JSON exportável com parâmetros, semente, assinatura da base, resultados, trilhas do backtest e tentativas. No Android, a interface oferece texto completo e cópia, pois downloads de Blob não são suportados por toda WebView.

## Telas e acesso

Abra **Análise → Estatísticas**. Dentro do laboratório estão Analisar combinação, Pares e trios, Gerador inteligente, Carteira e desempenho, Estratégias e backtest, Monte Carlo e Dados e relatórios. Perfil histórico, histórico de acertos, repetição, explicações, remoção de critérios, finanças e relatórios aparecem como seções desses painéis. Os recursos anteriores continuam abaixo.

O laboratório sincroniza as oito modalidades comuns com a seleção do app. Virada e Super Sete permanecem no laboratório, com dados e jogos próprios. Jogos de formatos que as telas antigas não apresentam integralmente, incluindo trevos ampliados, ficam na nova carteira. Isso evita enviar formatos incompatíveis às conferências nativas anteriores.

## Algoritmos e significado dos números

**Acertos:** interseção de conjuntos, representados por quatro palavras de 32 bits. No Super Sete, cada token combina posição e dígito. A probabilidade de h acertos é hipergeométrica nos jogos de conjuntos; nas colunas, é a convolução das sete probabilidades de acerto por coluna.

**Aderência:** distância média padronizada, limitada a cinco desvios por característica, considerando soma/média, paridade, amplitude, consecutivos, dispersão, concentração, finais, frequência, atraso controlado, coocorrência média de pares/trios, repetição recente e distribuição de acertos. Os pesos iniciais são explícitos, iguais, sem aprendizado do futuro.

A referência usa 2.000 apostas uniformes do mesmo formato, 200 de calibração e todos os resultados historicamente comparáveis. Um resultado histórico é comparado ao restante da base, excluindo a própria ocorrência. Apostas de 50 marcações da Lotomania não são comparadas diretamente a resultados de 20; Timemania de 10 tampouco a resultados de sete. Nesses casos, a referência homogênea é uniforme.

Percentis usam posição relativa e meio dos empates. Há percentil de aderência, de cobertura e, quando possível, entre resultados históricos comparáveis. Os vizinhos semelhantes e três períodos são apresentados. O rótulo “comum” começa no percentil 25 por convenção descritiva documentada; não é um teste de hipótese. O índice e sua classificação são heurísticos, não um modelo físico do sorteio.

Mensagem obrigatória na interface: “Este índice mede semelhança com o histórico. Não representa a probabilidade matemática de a combinação ser sorteada no próximo concurso.”

**Geração:** uniforme; equilíbrio estrutural; diversificação; cobertura de pares/trios; frequência com suavização de 20 observações e influência limitada; atraso com influência limitada; subconjuntos; semelhança; popularidade hipotética; população evolutiva com três rodadas de mutação. Popularidade usa concentração em números de calendário e sequências como hipótese, sem atribuir retorno financeiro por menor divisão de prêmio. Nenhum exemplo do usuário entra em pesos, preferências ou sementes permanentes.

## Validação cronológica e comitê

O padrão utiliza 60 concursos de desenvolvimento, 30 de validação e 60 de teste. Mínimos: 40/30/30. Utiliza somente o último trecho contínuo anterior ao corte escolhido. Em cada alvo, o gerador recebe exclusivamente concursos anteriores; o treino se expande cronologicamente.

São 32 lotes uniformes por concurso, com igual formato, número de jogos e custo, sem duplicatas internas. A amostra estatística é o número de concursos, não o número de réplicas. A métrica principal é a média de dezenas/colunas; não incorpora trevos, mês ou time artificialmente nessa média. O backtest principal da Dupla utiliza a primeira extração; sua apuração financeira, se disponível, inclui ambas.

A seleção do método ocorre na validação e é congelada **antes** do primeiro concurso de teste. A comparação usa bootstrap circular e inversão de sinais por blocos de até cinco concursos, 1.000 réplicas, IC individual de 95%, efeito padronizado e p ajustado por Holm. A família inclui dez modelos, oito remoções, duas perturbações e comparações financeiras quando disponíveis.

Para um challenger ser qualificado: pelo menos 30 alvos, limite inferior positivo do IC, p ajustado <0,05, diferença positiva em três períodos e ainda positiva após remover o melhor e o pior diferencial. O resultado final precisa confirmar a escolha anterior. Caso contrário, o champion de referência permanece uniforme. A confirmação é exploratória; não constitui prova de vantagem geral.

As ablações retiram frequência, atraso, soma, paridade, consecutivos, pares/trios, repetição e diversificação do evolutivo. O uniforme é a referência sem critérios. Perturbações de ±20% avaliam sensibilidade de parte dos pesos. O índice de sobreajuste é uma síntese heurística do otimismo validação/teste e instabilidade, não uma probabilidade calibrada.

Tentativas são registradas para expor pesquisas repetidas. Reutilizar o mesmo período com novas configurações não cria evidência independente. A correção dentro de uma execução não elimina esse risco.

## Como ajusta a rota após um concurso

1. A atualização existente guarda o resultado; o laboratório recebe o evento.
2. Recalcula somente jogos vinculados ao alvo e registrados antes dele. Corrigir o resultado substitui sua observação, sem duplicar a amostra.
3. Compara acertos médios com 32 referências do mesmo formato e examina redundância.
4. Emite **MANTER** com amostra insuficiente ou desempenho estável; **AJUSTAR** para redundância ou queda em múltiplas janelas ainda compatível com o acaso; **SUBSTITUIR** apenas com pelo menos 60 concursos, três janelas negativas, IC inteiramente negativo e p ajustado <0,05.
5. Testa alternativas novamente quando a assinatura dos dados muda e há observações prospectivas, desde que exista base contínua suficiente. Guarda o diagnóstico e o champion sugerido.
6. A adoção de outro método e o salvamento de uma carteira substituta são explícitos. Não apaga jogos anteriores, não aumenta orçamento e não aposta automaticamente.

O monitor aplica um ajuste conservador para 20 consultas planejadas; monitoramento ilimitado continua exploratório. O comitê automático não usa um único novo concurso para justificar uma troca.

## Dados e finanças

Nenhum resultado, data, complemento ou prêmio foi criado para preencher lacunas. Os dados locais continuam com os problemas catalogados no diagnóstico. Super Sete e Virada exigem importar uma base identificada ou consultar resultados oficiais; não houve reclassificação automática de concursos comuns por data.

A importação aceita lista JSON ou `{ "concursos": [...] }`. Campos por registro:

| Campo | Regra |
|---|---|
| modalidade, concurso | Identificação válida e concurso inteiro positivo |
| data | ISO ou DD/MM/AAAA; ausência explícita aceita, data inválida recusada |
| dezenas | Resultado com quantidade e intervalo próprios da modalidade |
| colunas | Super Sete: sete arrays unitários em ordem; listaDezenas oficial também aceita |
| trevos | +Milionária: dois números distintos 1–6 |
| mes | Dia de Sorte: inteiro 1–12; nome oficial do mês também reconhecido |
| time | Timemania: código inteiro 1–80; nomes não são convertidos por adivinhação |
| dezenasSegundoSorteio | Dupla: seis números válidos, independentes do primeiro |
| especial | `mega-da-virada` para identificar explicitamente evento especial da Mega |
| origem | URL/identificação declarada da fonte, com data da importação |
| precoBase | Preço da aposta simples vigente naquele concurso, quando documentado |
| faixasDetalhadas | Lista com `acertos`, `premio`; `sorteio`, `extras` ou `complemento` quando necessários |

Na +Milionária, as faixas principais distinguem dois trevos de um/nenhum; faixas menores têm suas regras próprias. A apuração de volantes ampliados usa multiplicidades combinatórias. No Super Sete, usa produto e convolução por coluna. Dupla cobra uma vez e soma as duas extrações.

ROI, líquido, drawdown e sequências sem prêmio só são apresentados com cobertura financeira de 100% no recorte. Dia de Sorte ampliado exige multiplicidade documentada do prêmio do mês. Rateio publicado é aplicado como referência histórica: não é simulação da redistribuição contrafactual do prêmio entre novos vencedores. Não há promessa de lucro.

Os preços atuais servem para estimar o limite de geração; nunca são retroativamente aplicados como preço histórico. Regras consultadas nos portais oficiais em 19–20/09/2026.

## Pesquisa externa

O [artigo do canal GeraSorte](https://blog.gerasorte.com.br/lotofacil-3684-dicas-e-analise-canal-gerasorte/) descreve frequência recente, grupos de números, paridade, ciclos e filtros de volante. O vídeo incorporado foi localizado, mas não houve acesso completo à reprodução/transcrição. Não afirmamos ter assistido integralmente aos vídeos nem pesquisado “todas” as metodologias da internet. Palpites publicados não foram importados.

| Família | Tratamento técnico |
|---|---|
| Frequência e atraso | Hipóteses suavizadas/limitadas, testadas contra uniforme |
| Paridade, soma, concentração e sequências | Descritores e modelos de equilíbrio; sem alterar chances individuais |
| Pares, trios, matrizes e fechamentos | Cobertura/diversidade; fechamentos condicionais anteriores preservados |
| Repetição e ciclos | Descrição temporal; nunca “ficou menos provável porque já saiu” |
| Primos, Fibonacci e outros filtros | Não promovidos a mecanismo preditivo por falta de fundamento demonstrado |
| Popularidade | Hipótese não calibrada, sem dados de escolhas reais |

Referências primárias: [hipergeométrica — SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.hypergeom.html), [separação temporal — scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html), [Holm e comparações múltiplas — R](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/p.adjust.html), [Super Sete — CAIXA](https://loterias.caixa.gov.br/Paginas/Super-Sete.aspx), [+Milionária — CAIXA](https://loterias.caixa.gov.br/Paginas/Mais-Milionaria.aspx), [Mega-Sena — CAIXA](https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx). As demais regras e referências estão em [metodologias 4.10](metodologias-4.10.md).

## Arquivos e endpoints

Novos módulos: `ui/lab-core.js`, `lab-strategies.js`, `lab-worker.js`, `lab-ui.js`, `lab-v4-18.css`, espelhados em `www/ui/`. Integração e versão em `index.html`, `sw.js`, `VERSION`, `package*.json`, `android/app/build.gradle`. Empacotamento em `ferramentas/gerar-completo.mjs`, `lotolab-completo.html` e `LotoLab-app.zip`. Testes em `testar-laboratorio.mjs`, `testar-interface.mjs` e `testar-distribuicao.mjs`; CI em `.github/workflows/testes.yml`. Correções de controles da recorrência em sua folha CSS.

**Novos endpoints: nenhum.** O laboratório roda localmente. Usa a API pública da CAIXA e a atualização existente. O backend separado em `analytics/` não foi migrado nem teve seus preços antigos usados para a nova análise financeira.

## Executar

```sh
npm ci
npm start
npm run test:laboratorio
node ferramentas/testar-motor.mjs
node ferramentas/testar-inteligencia.mjs
node ferramentas/testar-analitica.mjs
node ferramentas/testar-recorrencia.mjs
node ferramentas/testar-metas.mjs
node ferramentas/testar-complementos.mjs
node ferramentas/testar-atualizador.mjs
```

Para a interface, sirva a raiz por HTTP na porta 8123 e execute `node ferramentas/testar-interface.mjs`, com Chrome disponível em `LOTOLAB_CHROME` quando fora do PATH. Para Android: `npx cap sync android`; na pasta `android`, `./gradlew testDebugUnitTest assembleDebug`. A CI confere a igualdade raiz/www e o conteúdo do APK.

`sh ferramentas/empacotar.sh` gera a versão de arquivo único, incluindo módulos e worker em Blob. Essa versão embute até 600 registros por modalidade (4.433 no acervo atual); sua interface informa o recorte e permite importação. O aplicativo HTTP/Android usa todo o histórico disponível no aparelho, sem esse teto de análise.

## Limitações e aceitação

O motor e a interface tratam os dez formatos, mas disponibilidade de dados completos é condição para conclusões históricas e financeiras. A base atual não satisfaz “histórico completo de todas as modalidades”. Nenhuma vantagem confiável foi presumida. Super Sete/Virada e trevos ampliados usam o acompanhamento do laboratório; as telas/notificações Java antigas não passaram a suportar esses novos formatos.

Os testes de Chrome incluem toques, Android simulado e layouts de 320, 412 e 1.024 px nos dois temas. Compilação e testes Java não substituem instalação em aparelho físico. O relatório de validação registra os resultados efetivamente obtidos; não declarar instalação física, disponibilidade total das fontes ou rentabilidade comprovada.

## Evidências de execução

[Resultados das suítes e limites da validação](validacao-4.18.md). O acompanhamento também reconcilia os resultados já persistidos quando o aplicativo é reaberto. A distribuição mantém chances positivas muito pequenas visíveis como menores que 0,00001%, sem arredondá-las para uma chance nula.
