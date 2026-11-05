# LotoLab 5.0 — desenvolvimento

## Escopo aprovado

1. Layout e indicadores de análise para todas as modalidades suportadas, com diagnóstico inicialmente recolhido em Meus Jogos.
2. Indicadores objetivos: valor do jogo, faixa histórica por modalidade, status visual, amostra e limites estatísticos.
3. Últimas Conferências em Meus Jogos: quantidade de apostas premiadas, prêmio total **confirmado**, custo efetivo e saldo, agrupados por modalidade/concurso.
4. Resultados: o mesmo consolidado de prêmios, custos e saldo, sem misturar jogos virtuais e apostas efetivamente registradas.
5. Estratégias Lotofácil: comparações walk-forward com carteiras aleatórias de igual orçamento; nenhuma promessa de previsão.
6. Preservar jogos e conferências salvos; não apagar dados durante atualização.

## Regras financeiras obrigatórias

- A classificação de premiação é específica da modalidade, do tipo de aposta e dos complementos (trevos, mês, time e sorteios adicionais quando aplicáveis).
- Não calcular prêmio em reais apenas a partir do número de acertos quando a faixa depende de rateio ou do resultado oficial do concurso.
- Sem dados oficiais de premiação ou custo: mostrar **indisponível**, nunca R$ 0,00 inventado.
- Evitar dupla contagem: identificar aposta + concurso + extração; separar simulações, apostas salvas e apostas pagas.
- Saldo = prêmio confirmado menos custo confirmado, apenas quando ambos estão disponíveis.
- Diferenciar apostas premiadas de quantidade de faixas premiadas e considerar apostas ampliadas.

## Situação

A versão 5.0 é um **nome de desenvolvimento**. A versão Android e o APK somente receberão esse número após testes de regressão, sincronização web/Android e verificação da assinatura de atualização. Não alterar prematuramente `VERSION`, manifestos ou `versionCode`.

## Entregas incrementais

- [x] Diagnóstico recolhido em Meus Jogos.
- [x] Indicadores descritivos para modalidades com dezenas.
- [x] Faixa central de soma por histórico comparável (mínimo 30 concursos).
- [ ] Posicionar diagnóstico diretamente abaixo da cartela expandida.
- [ ] Consolidado financeiro de Últimas Conferências.
- [ ] Consolidado financeiro de Resultados.
- [ ] Validar modalidades e valores oficiais de premiação.
- [ ] Executar testes automatizados e de interface.
- [ ] Gerar APK de atualização instalável.
