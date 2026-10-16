# LotoLab 4.26.9

## Sugestão principal

- Decisão de manter, trocar ou reavaliar a estratégia dentro do cartão principal, com ícone, motivo visível, método usado e contexto da revisão.
- Aviso quando a sequência já consta em Meus Jogos, com distinção entre jogo completo, dezenas iguais com complemento diferente e acompanhamento que não cobre o concurso da sugestão.
- Diagnóstico das dez estratégias e do controle logo abaixo: maior média observada, empate, melhor resultado da última conferência e comparação por estratégia.
- Uma média maior não recebe confirmação de melhora sem os critérios já utilizados pelo motor. O comparativo indica se usa teste histórico separado ou acompanhamento de jogos registrados antes dos resultados.
- Resultados ausentes aparecem como indisponíveis; a atualização de um histórico alterado fica sinalizada. Uma rodada congelada informa quando a decisão só será aplicada à próxima rodada.

## Validação

Testes de identidade de jogos, complementos, cobertura, ausência de amostra, empates e confirmação; regressões no navegador verificam os novos avisos, o retorno após salvar, os dois temas e a largura móvel. A cópia Android em `www/` é sincronizada com a raiz.

O critério prospectivo foi extraído para uma função compartilhada com a apresentação. Os cálculos, limiares, sementes, protocolos, rodadas e dados persistidos permanecem compatíveis. Android: versionCode 46. O código para revisão não altera o APK 4.26.8 já instalado; a nova distribuição exige compilação e assinatura.
