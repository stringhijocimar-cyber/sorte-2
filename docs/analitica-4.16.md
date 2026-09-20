# Análise ampliada e memória — LotoLab 4.16

A seleção básica escolhia o método pela diferença média em apenas 20 concursos. Um ganho concentrado em um período podia vencer essa seleção mesmo quando se invertia depois. A análise ampliada exige consistência anterior ao teste final e registra as tentativas recentes no aparelho.

## Protocolo ampliado

1. Validar a base e usar somente concursos consecutivos recentes. São necessários 160 concursos para um teste final de 30, ou 190 para um teste de 60.
2. Reservar 40 concursos para o treino inicial. Em cada passo seguinte, as características usam apenas resultados anteriores ao alvo.
3. Avaliar diversidade e perfil com diversidade em 90 concursos de seleção, divididos em três períodos contíguos de 30. A referência é a média de 32 lotes uniformes independentes, cada um com o mesmo número e tamanho de jogos.
4. Exigir diferença positiva nos três períodos. Também exigir limite inferior positivo em um intervalo aproximado de 97,5%, calculado com 2.000 reamostragens de blocos móveis de cinco concursos. O nível individual aplica Bonferroni aos dois métodos candidatos; a validade continua limitada pela aproximação do bootstrap.
5. Entre candidatos aptos, escolher o maior limite inferior. Empate entre candidatos conserva a ordem fixa; ausência de candidatos aptos mantém o uniforme.
6. Fixar esse método antes dos 30 ou 60 concursos finais. No teste, as características continuam se atualizando com resultados anteriores; o método escolhido não muda. O relatório final conserva o intervalo aproximado de 95% e os três recortes descritivos da 4.13.

Os três períodos de seleção pertencem a um único protocolo histórico. Não são três experimentos independentes nem uma validação prospectiva. O ajuste não cobre repetir outras sementes, métricas, períodos ou modalidades.

O app apresenta a análise ampliada por padrão quando há pelo menos 160 concursos consecutivos. A básica continua disponível com 90 concursos. Trocar para 60 concursos de teste atualiza o requisito e bloqueia a execução quando faltam dados, sem reduzir a profundidade em silêncio. Durante a execução, os controles da avaliação ficam fixos. Se a base mudar durante o cálculo, o resultado é identificado como pertencente à base anterior.

## Memória e explicação

- O painel explica por que cada candidato foi aceito ou recusado na seleção.
- Os últimos 40 resumos entre todas as modalidades são guardados no aparelho, incluindo decisões negativas e manutenção da referência uniforme. Não há envio desses dados a servidor.
- A mesma versão, modalidade, assinatura da base e configuração incrementa a contagem de repetição enquanto constar da memória. Não cria uma nova avaliação distinta. Outra semente ou configuração fica registrada como outra tentativa.
- Concursos de teste reutilizados são contados pela união dos intervalos anteriores da mesma modalidade, evitando somar duplicatas. O painel avisa que reutilização não confirma um resultado de forma independente.
- Se o mesmo método, tamanho de lote, métrica e profundidade antes apresentava diferença consistente e depois deixa de confirmar, o painel indica a perda de consistência. Isso é uma comparação descritiva, sem teste adicional de mudança de regime.
- A memória mantém resumos, não os jogos completos de todas as simulações. O relatório detalhado da avaliação atual continua exportável; a memória tem exportação própria em JSON. Em falha de armazenamento, o app informa que as novas entradas só estão na sessão.
- A memória é local, limitada e pode ser apagada com os dados do app. Não é registro imutável ou pré-registro científico. Os testes anteriores continuam sendo exploratórios.

## Escopo

Esta versão melhora a avaliação dos métodos. Não muda automaticamente o método de geração escolhido pela pessoa, não salva apostas e não aumenta o orçamento. As limitações de dezenas principais, primeiro sorteio da Dupla Sena, trevos, mês e time permanecem documentadas na [avaliação 4.13](analitica-4.13.md). Os filtros e a memória não demonstram previsão nem aumento de chance em sorteio uniforme.

O visual da [4.15](experiencia-4.15.md) permanece: seletor de oito modalidades nas 15 telas, acentos por modalidade, degradê discreto e resultados amarelos com números grafite.

## Referências e verificação

A separação temporal segue o princípio de não treinar com resultados futuros, descrito no [TimeSeriesSplit do scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html). O ajuste dos dois intervalos usa a [desigualdade de Bonferroni, descrita pelo NIST](https://www.itl.nist.gov/div898/handbook/prc/section4/prc473.htm). A implementação é própria; não instala essas bibliotecas nem reproduz exatamente os exemplos das fontes. Referências consultadas em 10/09/2026.

`node ferramentas/testar-analitica.mjs` verifica inversão temporal, ganho incerto, escolha anterior ao teste, alteração dos resultados futuros sem alterar a seleção, reprodução, custos e amostras nas oito modalidades, duplicação de tentativas, sobreposição de períodos, persistência serializada e estado corrompido. A suíte de interface verifica o caminho pelo botão, requisitos de dados, explicação, exportação Android simulada, largura de 320/412 px nos dois temas e memória após recarregar a página.
