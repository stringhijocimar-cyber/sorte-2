# Fechamento Lotofácil 4-3-3-2-3

No laboratório da Lotofácil, a aba “Fechamento 4-3-3-2-3” oferece geração, orçamento, gravação dos jogos e avaliação histórica independente da sugestão principal.

As 25 dezenas são divididas em cinco grupos de cinco. Por padrão são as linhas do volante. O campo de ordem permite reorganizar as 25 dezenas, uma vez cada, em cinco grupos consecutivos. Cada grupo recebe duas opções distintas, escolhidas por semente reproduzível, com 4, 3, 3, 2 e 3 dezenas respectivamente. A segunda opção minimiza a sobreposição dentro do grupo. O produto cartesiano gera exatamente 32 jogos únicos de 15 dezenas. Não há descarte por filtros que poderia invalidar essa cobertura.

O orçamento precisa cobrir os 32 jogos; não existe geração parcial silenciosa. O custo usa o preço unitário cadastrado no app. É possível salvar o conjunto para um concurso futuro pela mesma gravação de lotes do laboratório e exportar geração, grupos, semente e avaliação no relatório JSON.

Os diagnósticos de soma (faixas 120–134 a 255–270), Fibonacci, paridade, linhas, colunas e ciclos são recalculados sobre os registros carregados, respeitando o corte informado. Não são copiados os números fixos das imagens. O diagnóstico detalhado de padrões identifica explicitamente o jogo 1; cada jogo apresenta sua própria soma, Fibonacci e pares.

A avaliação percorre até 60 concursos, com pelo menos 30 anteriores ao primeiro alvo. Em cada concurso define os jogos antes de observar o resultado e compara com 32 jogos uniformes distintos. Mostra média de acertos por jogo, média do melhor jogo, concursos com 11+ e total de jogos com 11+. A comparação é exploratória, baseada em uma referência reproduzível por concurso, sem inferir vantagem estatística. A tarifa mostrada é atual; não se calcula ROI usando preços atuais como se fossem históricos.

Os 15 pontos são cobertos apenas quando o resultado coincide exatamente com uma das duas opções de cada grupo, incluindo a distribuição 4-3-3-2-3. Não é um fechamento irrestrito das 25 dezenas e não há garantia geral de premiação. A escolha manual dos grupos após consultar resultados também torna a avaliação retrospectiva exploratória.

Validação: `npm run test:fechamento`, testes de padrões, sintaxe dos três scripts e sincronização de `www/`. Esta alteração de código não substitui o APK já publicado; a próxima compilação deve receber uma nova versão.

## Parâmetros da sugestão principal

As telas automática, integrada e clássica passam a reunir estratégia, parâmetros e distribuições históricas no painel “Parâmetros estatísticos encontrados”. O perfil atual é destacado nas categorias com ocorrência, porcentagem e último concurso. A soma ganha faixas fixas para Mega-Sena e Lotofácil. A leitura conjunta conta diretamente os concursos com mesma paridade, primos, Fibonacci, pares consecutivos e faixa de soma, sem multiplicar porcentagens marginais. Apostas ampliadas permanecem sem comparação direta com resultados de tamanho menor. Os indicadores descrevem o histórico e não alteram os pesos ou a estratégia por conta própria.
