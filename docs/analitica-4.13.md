# Avaliação analítica 4.13

O comparador anterior avaliava três estratégias no mesmo recorte e usava um único lote aleatório por concurso. A nova avaliação separa a escolha do método de sua medição final e reduz a variabilidade da referência. O comparador anterior continua disponível.

## Protocolo

1. Validar quantidade, intervalo das dezenas, concursos duplicados e conflitos. Usar somente o sufixo recente de concursos consecutivos, sem preencher sorteios ausentes.
2. Reservar 40 concursos iniciais para treino, 20 seguintes para seleção e 30 ou 60 posteriores para teste. Total: 90 ou 120.
3. Nos concursos de seleção, gerar três jogos por método, usando apenas os resultados anteriores a cada alvo. Os métodos candidatos são diversidade e perfil com diversidade. O critério, definido antes do teste, é acertos médios ou a maior contagem de acertos de um jogo do lote.
4. Selecionar o método com maior diferença positiva perante a referência na seleção. Em empate ou ausência de diferença positiva, manter o uniforme. Não selecionar novamente com os resultados do teste.
5. No teste final, continuar atualizando as características exclusivamente com os resultados já anteriores ao alvo. Este é um teste sequencial de um método fixo, não um modelo de parâmetros congelados. As outras estratégias aparecem somente para comparação descritiva.
6. Comparar cada concurso com a média de 32 lotes uniformes independentes, cada um com a mesma quantidade e tamanho de jogos. Remover duplicatas dentro de cada lote, mantendo a amostragem uniforme de combinações distintas. As réplicas são simulações de referência, não compras adicionais nem novas observações.
7. Calcular a diferença por concurso e um intervalo aproximado de 95% por bootstrap móvel de blocos de cinco concursos, com 2.000 reamostragens. Mostrar a diferença em três recortes contíguos do teste. O rótulo de diferença consistente exige média positiva, limite inferior acima de zero e diferença positiva nos três recortes.

A formulação preserva a ordem temporal e separa seleção e avaliação. Referências metodológicas primárias: [TimeSeriesSplit, documentação scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) e [seleção versus avaliação externa](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html). A implementação é própria em JavaScript; não instala scikit-learn e não afirma reproduzir um experimento desses exemplos.

## Interpretação e limites

- O resultado é exploratório. Repetir com outras sementes, métricas, períodos ou modalidades reutiliza o histórico; o intervalo não corrige essa seleção adicional. Não equivale a validação prospectiva ou prova de previsão.
- O intervalo depende da aproximação por blocos; 30 ou 60 concursos continuam sendo amostras pequenas para prêmios raros. Zero observações de uma faixa nunca é convertido em chance zero.
- A referência estima o desempenho de lotes uniformes com precisão Monte Carlo finita. Suas 32 réplicas não elevam o tamanho da amostra de 30 para 960 concursos.
- As faixas contam o melhor jogo do lote em cada concurso. Não somam dezenas de jogos diferentes.
- A avaliação mede somente dezenas principais; usa o primeiro sorteio da Dupla Sena e não testa trevos, mês ou time. As conferências operacionais da 4.12 continuam separadas e incluem os campos já suportados.
- Custos são equivalentes a preços atuais. O painel não calcula lucro histórico ou valor de prêmio.
- O teste padrão não utiliza as restrições do formulário de sugestões; isso aparece ao lado do botão. O tamanho do volante selecionado é respeitado, inclusive no custo de apostas ampliadas.
- A execução não salva apostas nem altera o critério de geração do usuário. O relatório pode ser exportado em JSON com parâmetros, assinatura da base, escolha, períodos, séries e referências.
- Relatórios ficam na sessão e podem ser exportados; não são apresentados como memória permanente de tentativas. Ao mudar o histórico, uma avaliação antiga é identificada.

## Correção na pesquisa adaptativa

A aptidão antiga usava o menor afastamento absoluto de AUC 0,5. Uma hipótese direta em um recorte e inversa em outro podia parecer robusta. A 4.13 fixa a direção pelos recortes de desenvolvimento e usa a menor margem nessa direção, descontando complexidade. Direção alternante produz margem negativa. A conclusão exige também direção compatível no teste final; diferença estatística isolada não classifica a hipótese como estável. A atualização invalida as conclusões antigas em cache e agenda nova avaliação, preservando população e histórico. A correção não transforma a pesquisa em gerador de apostas.

## Validação

`ferramentas/testar-analitica.mjs` cobre separação temporal, alteração dos alvos sem alterar a escolha, reprodução, tamanho real da amostra, custos ampliados, histórico incompleto ou conflitante, ausência de efeito, reversão temporal e exportação. A suíte de interface cobre execução pelo botão, dados insuficientes, troca de modalidade, alteração do histórico, exportação Android simulada e largura em temas claro e escuro. As suítes anteriores e a compilação Android continuam como exigências de CI.
