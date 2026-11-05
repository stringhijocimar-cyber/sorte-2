# LotoLab — plano de pesquisa 4.26.15 (proposta)

> Estado: proposta de evolução, não é APK publicado nem validação de ganho preditivo. A versão identificada em `main` na abertura deste trabalho é 4.26.13. Não atualizar identificadores para 4.26.15 antes de localizar e integrar a fonte efetiva dessa versão.

## Objetivo

Permitir que o usuário estude estratégias da Lotofácil sem apostar regularmente, interprete resultados com rigor e compare carteiras de igual custo com a referência aleatória.

## Funcionalidades e critérios de aceite

1. **Painel na Sugestão Principal:** apresentar perfil 4-3-3-2-3 (contagem por linha do volante 5×5), paridade, soma, primos, Fibonacci, repetição com concurso anterior, pares consecutivos e grau de sobreposição com os jogos salvos. Exibir a justificativa e o estado *manter / ajustar / substituir*; não alterar automaticamente jogos salvos.
2. **Fechamento:** permitir selecionar fechamento no mesmo fluxo da sugestão, com quantidade de dezenas-base, jogos gerados, orçamento estimado e garantia *somente se matematicamente demonstrada*. Sem garantia, rotular como cobertura experimental. Incluir ação explícita de salvar o lote e conferir depois.
3. **Laboratório de estratégias:** selecionar uniforme (baseline), equilíbrio, padrões combinados, frequência/atraso e diversificação; executar em janelas cronológicas 100, 500 ou 1000 concursos quando houver dados contínuos suficientes. Exibir quantos concursos efetivamente foram avaliados e lacunas.
4. **Backtest sem vazamento:** cada previsão para o concurso N deve usar exclusivamente resultados com identificador menor que N. Congelar critérios antes da janela final. Não otimizar pesos com base no próprio período de teste.
5. **Comparação justa:** confrontar cada estratégia com ao menos 32 carteiras uniformes de igual quantidade de jogos e custo, com semente reprodutível; apresentar média de acertos, distribuição de 11 a 15 acertos, custo, duplicatas e cobertura. Quando a amostra não sustentar inferência, marcar *inconclusivo*.
6. **Meus Jogos:** conservar IDs e histórico existentes; detectar combinações duplicadas e exibir diagnóstico individual sem excluir, substituir ou apostar automaticamente. Persistência precisa sobreviver ao fechamento e à atualização do aplicativo.
7. **Relatório de estudo:** exportar parâmetros, recorte histórico, data/versão da base, semente, resultados, limites e comparação com acaso. Não confundir resultados simulados com sorteios reais.

## Protocolo mínimo de validação

- Testes unitários: distribuição 4-3-3-2-3, contagem de interseções, deduplicação, persistência e ausência de leitura do resultado futuro.
- Testes de integração: sugestão → fechamento → salvar → Meus Jogos → conferir, inclusive após reiniciar a aplicação.
- Testes de regressão: modalidades existentes, interface Android, `www/` sincronizada, manifestos, armazenamento e acessibilidade móvel.
- Execução sugerida: `npm run test:fechamento`, `npm run test:padroes`, `npm run test:laboratorio`, `npm run test:jogos-salvos`, `npm run check:distribution`, `npm run check:version`.
- Compilar e verificar APK em pipeline com Android SDK e assinatura compatível antes de oferecer instalação; nunca disponibilizar artefato inexistente.

## Interpretação correta

A probabilidade de acertar as 15 dezenas em um jogo simples de Lotofácil é 1 / 3.268.760. Padrões, frequências, atrasos e redes neurais não demonstram, por si só, maior probabilidade de prever o próximo sorteio. Um fechamento pode aumentar a cobertura mediante mais jogos e maior custo; comparações devem manter o mesmo orçamento.

## Dependências para concluir a versão

- Identificar onde está o código da 4.26.15, pois `VERSION`, `package.json` e o manifesto da branch `main` indicam 4.26.13.
- Revisar as implementações existentes em `ui/lab-strategies.js`, `ui/lab-auto.js`, `ui/lab-saved-review.js` e as rotinas de fechamento antes de modificar a interface.
- Implementar somente lacunas comprovadas por testes; preservar as funcionalidades já existentes.
