# Parâmetros estatísticos integrados

A análise de Mega-Sena e Lotofácil reúne paridade, primos, Fibonacci, sequências, repetição do concurso anterior, linhas, colunas, ciclos de cobertura, frequência e atraso. O painel aparece junto da sugestão principal e na análise de qualquer combinação. Jogos salvos recebem um resumo de perfil nos dados da avaliação.

Os cálculos usam o acervo e o corte selecionados. Nenhum percentual das imagens de referência foi incorporado como regra fixa. Mega-Sena usa 60 dezenas e grade 6×10; Lotofácil usa 25 e grade 5×5. Mega da Virada permite perfis estáticos, mas não ciclos ou transições de concursos consecutivos. Outras modalidades mantêm seus diagnósticos existentes.

## Definições e denominadores

- **Paridade:** pares e ímpares são complementares; não recebem dois pesos.
- **Sequências:** 01–02–03 contém dois pares consecutivos e maior sequência de três. Sem adjacência, a maior sequência vale zero. Não se trata da quantidade de blocos.
- **Primos:** exclui 1. **Fibonacci:** conjunto sem duplicatas, limitado ao universo da modalidade.
- **Repetição:** histograma de interseções entre resultados adjacentes, excluindo lacunas. O denominador é o número de transições válidas. A comparação do jogo com o último registro fica indisponível quando faltam concursos até o corte.
- **Linhas/colunas:** ocorrências de dezenas, denominador `concursos × dezenas sorteadas`. Uma linha pode contribuir várias vezes no mesmo concurso.
- **Ciclos:** começa um novo ciclo após a cobertura integral do universo. Se o recorte começar depois do concurso 1, o primeiro trecho é parcial e não entra na média; sua primeira cobertura completa permite localizar o início seguinte. Lacunas reiniciam esse estado. O ciclo em andamento não entra na média dos concluídos. O painel exibe os dez últimos ciclos completos e a média sobre todos os ciclos válidos do recorte.
- **Atrasos:** zero significa presença no último concurso disponível; desconhecido não vira zero. Lacunas e limites temporais impedem extrapolação. Eventos anuais não têm atraso consecutivo.
- **Apostas ampliadas:** o perfil do volante é exibido, mas seu percentual histórico direto fica indisponível; as distribuições históricas continuam descrevendo resultados simples. As probabilidades matemáticas originais permanecem inalteradas.

Referências uniformes de paridade, primos, Fibonacci e repetição usam a distribuição hipergeométrica. Para `a` pares consecutivos em `k` dezenas entre `N`, há `r=k-a` blocos, e a massa é `C(k-1,r-1) × C(N-k+1,r) / C(N,k)`. A maior sequência não recebe probabilidade teórica aproximada.

## Estratégia de pesquisa

“Padrões combinados (experimental)” está disponível no gerador do laboratório. Combina a distância dos critérios existentes com quatro grupos novos: primos, Fibonacci, maior sequência e distribuição na grade. Cada grupo novo tem o mesmo peso inicial; linhas/colunas dividem um grupo. A média dos grupos novos e a distância existente dividem igualmente o escore. Esses pesos são uma hipótese fixa de pesquisa, não foram estimados para maximizar os resultados abaixo.

Ciclos e números faltantes não dão bônus às dezenas. A recomendação automática e as decisões de manter/retirar jogos não passam a usar o novo escore. Um diagnóstico histórico não demonstra vantagem preditiva.

O comitê inclui o método e quatro remoções individuais, com os mesmos tamanhos de apostas, orçamento, população candidata e semente das comparações. A família de correção Holm inclui todas as hipóteses avaliadas; a escolha é congelada antes do teste. Nenhum jogo salvo é alterado por esses indicadores.

## Avaliação reproduzível

Execute `npm run avaliar:padroes`. O relatório completo está em `docs/padroes-validacao.json`, com SHA-256 dos arquivos de entrada. Protocolo fixo: 120 concursos iniciais, 60 de validação, 60 de teste; um jogo simples por concurso; 60 candidatas por hipótese e 32 referências uniformes. A janela de treinamento cresce somente com resultados anteriores ao alvo.

| Modalidade | Teste reservado | Padrões: média de acertos | Semelhança existente | Diferença ao acaso (32 referências) | IC 95% individual da diferença |
|---|---|---:|---:|---:|---|
| Mega-Sena | 3015–3074 | 0,6167 | 0,6333 | +0,0521 | −0,0901 a +0,2083 |
| Lotofácil | 3754–3813 | 9,0167 | 8,9667 | +0,0161 | −0,2063 a +0,2484 |

O p-valor ajustado do método novo é 1 em ambas as modalidades. A seleção antes do teste permaneceu uniforme. Não houve evidência de vantagem; as diferenças observadas são compatíveis com o acaso. O teste mede média de acertos, não chance de prêmio ou lucro. Sessenta alvos não validam benefícios em premiações raras. É uma avaliação retrospectiva exploratória, sujeita a validação prospectiva independente.

A base usada termina no concurso 3074 da Mega-Sena e 3813 da Lotofácil. As imagens enviadas chegam ao 3075 da Mega-Sena; portanto, seus totais não devem ser apresentados como se fossem os totais deste recorte.

## Verificação e distribuição

Os testes cobrem contagens, massa probabilística, lacunas, conflitos, ciclos fechados/parciais, corte temporal, aposta ampliada, Mega da Virada, custo/reprodutibilidade, renderização e integração aos jogos salvos. O teste real de layout verifica o painel entregue pelo worker, abertura por toque e ausência de transbordamento no celular. `www/` acompanha os mesmos arquivos; o cache da aplicação foi incrementado.

Esta alteração de código parte da 4.26.10. Ela não contém um novo APK nem declara uma nova release Android.
