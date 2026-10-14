# LotoLab — continuação de inteligência 4.26.6

**Data:** 10/10/2026. **Estado:** desenvolvimento/revisão, sem publicação final. O PR #80 reúne a inteligência anterior e esta continuação. A main `b954c04` contém o hotfix 4.26.5 de abertura/migração; ele foi integrado preservando o histórico remoto.

## O avanço funcional

O app passa a explicar **o efeito das escolhas antes de calcular**: quantidade possível de jogos, custo efetivo, impacto de fixas/exclusões, tamanho dos complementos e distinção entre teoria e candidatas avaliadas. Não é um modelo preditivo; é inteligência de configuração, transparência e prevenção de erros.

### Painel “Impacto das escolhas e viabilidade do lote”

Está disponível na configuração da tela Sugestões, nos resultados automáticos/integrados e no gerador especial do laboratório. Na tela Sugestões, a prévia atualiza ao editar os campos, sem consulta externa e sem redesenhar toda a tela.

| Indicador | O que significa |
| --- | --- |
| Configurações principais | Quantas escolhas de dezenas/colunas cabem no formato, nas fixas e nas exclusões |
| Configurações completas | Inclui as possibilidades dos complementos, quando existentes |
| Limite do motor | Automático distingue jogo completo; integrado exige principais diferentes |
| Quantidade efetiva | Número solicitado reduzido apenas pelo orçamento informado |
| Custo unitário e previsto | Usa os preços configurados no app e o formato, inclusive trevos ampliados |
| Sobreposição de referência | Coincidência média de dois jogos uniformes independentes sob as mesmas restrições |

**Contagens são exatas**, com BigInt internamente e texto serializável na saída. A Lotomania, por exemplo, possui `100891344545564193334812497256` escolhas principais de 50 entre 100; esse inteiro não pode ser armazenado com precisão em um Number comum.

## Exemplos matemáticos, não recomendações de aposta

- Mega-Sena simples sem restrições: `C(60,6) = 50.063.860` escolhas; sobreposição uniforme média de 0,6 dezena entre dois jogos independentes.
- Lotofácil simples sem restrições: `C(25,15) = 3.268.760`; sobreposição uniforme média de 9 dezenas.
- Um formato Mega-Sena com quatro fixas e apenas quatro dezenas livres para completar duas posições permite `C(4,2) = 6` jogos. A sobreposição uniforme média passa a cinco, por causa das fixas e do universo reduzido. Isso não aumenta a chance de uma combinação específica.
- Com seis fixas na Mega-Sena simples, há apenas uma escolha principal. Pedir dois jogos é identificado como impossível antes de analisar o acervo.
- Na +Milionária com todas as seis dezenas fixas e trevos livres, o automático pode distinguir 15 escolhas dos dois trevos. O integrado não trata mudar somente os trevos como outro adicional. O painel informa essa diferença de identidade.

A referência independente admite que dois jogos se repitam; não é a média prometida de um lote otimizado. O espaço combinatório não é uma estimativa de chance do lote, prêmio ou lucro. Não se somam probabilidades de jogos sobrepostos.

## Prevenção de trabalho inútil

Os motores recusam lotes combinatoriamente impossíveis **antes** de ler histórico, calibrar ou criar/apurar rodadas. O erro informa o limite e pede reduzir a quantidade ou revisar restrições. O app não aumenta orçamento nem afrouxa fixas/exclusões sozinho.

A viabilidade teórica continua separada do sucesso do algoritmo: o espaço pode comportar o lote, mas o pool de candidatas ainda precisa conter jogos suficientes. Não é anunciado que todo o espaço foi avaliado. A geração conserva seus limites e suas sementes para configurações normais viáveis.

## Preservação do trabalho anterior

- Diagnóstico de frequência/estabilidade, janelas sem sobreposição, IC individual, Fisher/binomial exatos e Holm conjunto permanecem.
- Metadados originais de conflitos e inválidos continuam visíveis.
- Hotfix de abertura 4.26.5: tela antes da conferência, migração assíncrona, prioridade de gravações novas, descarte do legado só após confirmação e conferência linear preservados.
- Certificado, protocolos de avaliação, identidade dos perfis e módulos de armazenamento não foram alterados nesta continuação.
- A 4.26.6 possui `versionCode` 43 e cache novo; não substitui a 4.26.5 com outro conteúdo sob o mesmo número.

## Limites restantes

A inteligência atual explica escolhas e evita inferências enganosas. Não transforma sorteios independentes em previsíveis. As fontes históricas são declaradas, não autenticadas por este painel. Preços são os configurados no app, não uma consulta em tempo real.

Próximo avanço recomendado: diagnóstico por faixa de acertos no acompanhamento prospectivo com denominadores, controles e incerteza pré-declarados. Isso exige protocolo próprio para evitar selecionar a faixa mais favorável depois de ver os resultados; não foi implementado nesta continuação.

## Entrega e validação

Nova suíte `test:plano` cobre contagens conhecidas, enumeração independente, grandes inteiros, complementos, orçamento, sobreposição, imutabilidade, serialização e recusa antes do processamento. A distribuição adiciona o cenário de atualização da prévia offline. Resultados finais e CI devem ser confirmados para o commit efetivamente entregue.

Publicação permanece separada: esta revisão não faz merge na main nem publica APK final. APK de revisão não é atualização com certificado permanente.

## Evidências locais desta continuação

- Plano: 16 regressões aprovadas (inclui o dispatcher real do worker sem leitura de histórico ou monitor em lote impossível).
- Diagnóstico 18, revisão 27, laboratório 25, recomendação 21, automático 32 e backup 6 aprovados.
- Assinatura: 23 aprovados; 11 XML Android conferidos; sintaxe e distribuição verificadas.
- Comparação contra `ed48bc5` em 100 resultados reais de Mega-Sena/Lotofácil, lotes de três jogos, uma fixa e uma excluída: mesmas apostas, custos, sementes e calibração nos dois motores; estado/rodadas do automático idênticos. Apenas etiquetas da versão mudaram. Referências douradas inalteradas.
- Motor integrado com sete dezenas e três trevos: custo real de dois jogos igual ao plano, R$ 252,00 sob os preços do app.

A revisão independente identificou e corrigimos duas falhas de integração: o worker agora faz a validação antes do acompanhamento; o laboratório especial atualiza a prévia durante a edição, mantendo o foco e exibindo a mensagem de campo inválido. As regressões cobrem ambos.

Distribuição final em Chromium: **9 cenários offline aprovados**, incluindo atualização da prévia normal/especial, salvamento por toque, worker, reabertura e HTML único.
