# LotoLab 4.26.6

**Versão de revisão, ainda não publicada.** Android `versionCode` 43. Reúne a inteligência analítica antes preparada no PR #80 com o hotfix remoto 4.26.5, sem substituir APKs publicados.

## Configuração mais inteligente

- Novo painel **Impacto das escolhas e viabilidade do lote**, antes da geração e nos resultados automático/integrado. Atualiza ao editar quantidade, tamanho, orçamento, fixas, exclusões ou complementos, sem rede e sem redesenhar a página inteira.
- Contagem combinatória **exata**, inclusive números superiores ao limite seguro de JavaScript, como `C(100,50)`. Strings serializáveis evitam arredondamento ou falha na exportação.
- Mostra quantas configurações principais e completas são possíveis, qual identidade de jogo cada motor aceita, quanto o lote custa e quando o orçamento reduz a quantidade.
- Explica a sobreposição de referência **sob as mesmas restrições**. A referência é para dois jogos uniformes independentes e admite repetição, não é chance de prêmio nem garantia da carteira.
- Lote combinatoriamente impossível é recusado antes de analisar histórico, calibrar ou criar rodada automática; informa o limite e opções de correção. Não aumenta orçamento nem afrouxa restrições automaticamente.
- O plano considera a quantidade de trevos escolhida no custo do motor integrado, inclusive formatos ampliados. Trevos não são aceitos em modalidades sem esse complemento.

## Inteligência analítica preservada

Mantém o diagnóstico de todas as dezenas com frequência esperada, IC Wilson individual, teste binomial e Fisher bilaterais exatos e Holm conjunto, incluindo janelas separadas sem atravessar lacunas. Os indicadores originais de integridade permanecem visíveis nas recomendações.

## Hotfix remoto incorporado

Preserva a primeira tela antes da conferência, migração assíncrona no IndexedDB, prioridade de alterações novas durante a migração, exclusão do dado antigo somente após gravação confirmada, conferência linear e empacotamento correto dos candidatos Android. As notas 4.26.5 da main foram preservadas como documento histórico.

## Compatibilidade e limites

Protocolos de rodadas, identidade dos perfis, certificado e armazenamento são mantidos. Configurações normais viáveis não recebem novos pesos nem sinais preditivos. O painel descreve o espaço permitido; viabilidade teórica não garante que o algoritmo tenha examinado todas as candidatas. No automático, complementos diferentes podem distinguir jogos de mesmas dezenas. No integrado, apenas dezenas/colunas diferentes criam adicionais.

Preços vêm das regras configuradas no app, não de consulta em tempo real. Salvar jogos não compra apostas. Não somamos chances de jogos sobrepostos nem anunciamos vantagem em sorteios independentes.

## Validação

Nova suíte `test:plano` cobre contagens conhecidas, enumeração independente em espaço pequeno, números gigantes, sobreposição, orçamento, complementos, validação, entrada imutável e falha rápida sem tocar estado/histórico. Suítes afetadas e CI devem aprovar o commit final antes de qualquer publicação permanente.
