# LotoLab 4.17 — recorrência de combinações

A nova análise responde a perguntas sobre o histórico de uma combinação sugerida, de um jogo salvo ou de um resultado. Está em **Análise → Estatísticas**, no painel “Essa combinação já apareceu?”. Os três tipos de cartão também oferecem o botão “Histórico desta combinação”.

## Contagens diferentes, perguntas diferentes

Para o grupo **02 04 35 46 54 60**, a tela mostra:

| Medida | Significado |
| --- | --- |
| Exatamente 6, 5, 4, 3, 2, 1 ou 0 acertos | Quantos concursos tiveram essa interseção com o grupo. Um concurso pertence a uma única linha. |
| Pelo menos H acertos | Quantos concursos tiveram H ou mais dezenas do grupo. As linhas se sobrepõem. |
| Cada subconjunto específico | Ocorrências de cada um dos 6 quintetos, 15 quartetos, 20 trios e 15 pares. Um concurso pode conter vários subconjuntos. |
| Grupos observados 0, 1, 2 ou 3+ vezes | Quantidade de subconjuntos em cada categoria, incluindo os não observados. |
| Desde a última ocorrência | Diferença entre o último concurso consultado e a ocorrência mais recente, somente se o trecho estiver completo. |
| Intervalo médio e máximo | Distância entre ocorrências consecutivas, somente nos trechos sem lacunas. A ausência atual não entra na média. |
| Cobertura em vários concursos | Menor janela que termina no último concurso consultado e reúne as dezenas, mesmo que tenham aparecido separadas. Não é repetição conjunta. |

Em um sorteio que contém os seis números há seis quintetos contidos, mas **zero concursos com exatamente cinco acertos** naquele sorteio. Essa distinção impede inflar as contagens de cinco acertos.

O campo “Somente antes do concurso” exclui o próprio concurso e todos os posteriores antes de calcular qualquer medida. O atalho de um resultado preenche esse corte automaticamente. Sugestões sem concurso definido e jogos salvos usam toda a base disponível; isso é uma consulta descritiva, não uma avaliação de previsão.

## Exemplo calculado com a base do repositório

Na revisão que introduz a 4.17, `dados/mega-sena.json` contém **2.835 concursos válidos**: 1–2797 e 3016–3053. Faltam os 218 concursos de 2798 a 3015. O arquivo não representa o histórico completo nem garante a atualização até a data de consulta.

Para 02 04 35 46 54 60:

| Acertos exatos | Concursos observados |
| --- | ---: |
| 6 | 0 |
| 5 | 0 |
| 4 | 4 |
| 3 | 23 |
| 2 | 283 |
| 1 | 1.084 |
| 0 | 1.441 |

Os quatro concursos com quatro acertos são 91, 1525, 1861 e 2669. Nos quartetos específicos, 12 nunca foram observados na base, 2 apareceram uma vez e 1 apareceu duas vezes. Nos trios: 6 não observados, 2 uma vez, 4 duas vezes e 8 três vezes ou mais. Os 15 pares apareceram pelo menos três vezes cada. “Não observado” sempre se refere à base consultada.

## Integridade e limites

- Registros inválidos são excluídos; concursos duplicados conflitantes não são escolhidos arbitrariamente. Duplicatas iguais não aumentam a contagem.
- Intervalos que atravessam lacunas ficam indeterminados. Um corte futuro também pode incluir concursos ainda não realizados: falta de registro não prova que o sorteio aconteceu.
- Há suporte às oito modalidades, à dezena 00 da Lotomania e a grupos ampliados. Na Dupla Sena, primeiro e segundo sorteios são consultados separadamente; segundo sorteio ausente não vira zero acertos.
- A análise considera apenas as dezenas principais, sem trevos, mês ou time. Contagem de coincidências não é confirmação de prêmio.
- Os subconjuntos são enumerados exatamente, com limite de 2.000 grupos por tamanho para não travar o aparelho. Tamanhos maiores ficam indisponíveis, sem substituir a enumeração por uma amostra apresentada como completa. As contagens por concurso continuam disponíveis.
- Consultar não modifica o jogo nem registra apostas. Resultados e configurações de recorrência são separados por modalidade na sessão; a alteração da base sinaliza a necessidade de recalcular.
- O arquivo HTML independente inclui até 600 concursos por modalidade. Sua consulta inicial será menor do que a do exemplo acima; a tela sempre informa a base usada.

## Probabilidade e avaliação de métodos

Uma combinação que já apareceu não fica menos provável no próximo sorteio independente. Tampouco a ausência cria uma obrigação de sair. Não acrescentamos uma penalidade automática para combinações repetidas nem um bônus por atraso.

Para N dezenas possíveis, K sorteadas e um grupo de n dezenas, a referência para exatamente h coincidências é:

`P(H=h) = C(n,h) C(N−n,K−h) / C(N,K)`.

O valor esperado em B concursos consultados é `B × P(H=h)`. Isso não fornece a data do próximo acerto. Uma aposta simples da Mega-Sena tem chance de 1 em 50.063.860 para seis acertos, conforme a tabela da CAIXA.

As novas medidas são descritivas. A avaliação de estratégias continua seguindo o [protocolo da 4.16](analitica-4.16.md): seleção em períodos anteriores, teste posterior separado, comparação com lotes aleatórios e registro das tentativas. Encontrar muitos filtros retrospectivos aumenta a oportunidade de coincidências; não é evidência de vantagem futura.

## Pesquisa de metodologias — 17/09/2026

Foi feita uma pesquisa direcionada, incluindo resultados do YouTube e publicações dos próprios criadores. Não foi uma revisão de todos os vídeos existentes. As páginas dos vídeos não forneceram transcrições nesta consulta; títulos e descrições indexados foram usados para localizar temas, sem alegar que os vídeos foram assistidos integralmente.

| Tema encontrado | Fonte primária consultada | Uso no LotoLab |
| --- | --- | --- |
| Frequências, ciclos, pares/ímpares, primos, regiões do volante e Fibonacci | [Artigo do Gerasorte, de Ricardo Ramalho](https://blog.gerasorte.com.br/lotofacil-3684-dicas-e-analise-canal-gerasorte/) e seu [canal no YouTube](https://www.youtube.com/user/gerasorte) | São descrições e hipóteses para avaliação; popularidade e alegações de acerto não validam poder preditivo. |
| Duques, ternos, quadras e matrizes | [Histórico de publicações do próprio Gerasorte](https://www.gerasorteonline.com.br/conteudo/novidades.php?pagina=13) | A 4.17 enumera os subconjuntos e suas ocorrências. Não importa promessas de garantia de matrizes sem verificar suas condições. |
| Comparar ChatGPT com planilhas e filtros | [Vídeo indexado sobre essa comparação](https://www.youtube.com/watch?v=twjkXb7u7yY) | Motivação para comparação reproduzível; metadados não comprovam desempenho. |
| Probabilidades da Mega-Sena | [CAIXA](https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx) | Referência oficial para a aposta simples e as faixas premiadas. Dois ou três acertos não são faixas de prêmio da Mega-Sena. |
| Distribuição hipergeométrica | [Documentação matemática do SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.hypergeom.html) | Referência para a fórmula de coincidências usada no código, sem adicionar dependência ao app. |

## Verificação

`node ferramentas/testar-recorrencia.mjs` verifica contagens exatas/acumuladas, enumeração contra contagem bruta independente, identidade combinatória, corte temporal, lacunas, duplicatas, probabilidade, oito modalidades, Dupla Sena, limite de grupos e cobertura por união.

A seção T de `ferramentas/testar-interface.mjs` verifica os atalhos por toque, erros de entrada, mudança de base e modalidade, os dois temas e larguras 320/412/1024. Também compara a base real com uma contagem independente e gera capturas das telas. A integração contínua inclui a nova suíte antes de compilar o APK de revisão.
