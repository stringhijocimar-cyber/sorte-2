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

A versão Android usa a numeração 5.0.0. O APK da versão anterior 4.26.15 usa o código Android 52 e o certificado permanente fixado no projeto. A 5.0.0 usa o código Android 53 e a mesma identidade de pacote.

## Entregas incrementais

- [x] Diagnóstico recolhido em Meus Jogos.
- [x] Indicadores descritivos para modalidades com dezenas.
- [x] Faixa central de soma por histórico comparável (mínimo 30 concursos).
- [x] Posicionar diagnóstico diretamente abaixo da cartela expandida.
- [x] Consolidado financeiro de Últimas Conferências.
- [x] Consolidado financeiro de Resultados.
- [x] Validar modalidades e valores oficiais de premiação.
- [ ] Executar testes automatizados e de interface.
- [ ] Gerar APK de atualização instalável.
