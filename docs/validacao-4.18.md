# Validação do LotoLab 4.18.0

Data: 20/09/2026. Código de Android: 27; cache PWA: 23.

## Resultados locais

| Bateria | Resultado |
|---|---:|
| Motor existente | 808 aprovados, 0 falhas |
| Inteligência de sugestões | 25 aprovados, 0 falhas |
| Análise temporal anterior | 21 aprovados, 0 falhas |
| Recorrência anterior | 12 aprovados, 0 falhas |
| Laboratório 4.18 | 23 aprovados, 0 falhas |
| Metas e cobertura | 22 aprovados, 0 falhas |
| Complementos | 10 aprovados, 0 falhas |
| Atualização de resultados | 18 aprovados, 0 falhas |
| Interface completa no Chrome | 458 aprovados, 0 falhas |
| PWA offline, reabertura e HTML único | 3 aprovados, 0 falhas |
| XML Android | 11 arquivos válidos |
| Ícones | 34 verificações, 0 falhas |
| Referências douradas do motor | Sem alteração |

As 458 verificações incluem 82 do laboratório: worker real, 2.000 referências, histórico de 2.835 registros, acertos exatos e acumulados, consultas de concursos, quartetos, geração explicada, orçamento, lotes prospectivos, comitê cronológico, Monte Carlo e exportação Android. Os dez formatos foram exercitados nos temas claro e escuro, em 320, 412 e 1.024 pixels. Menu e sino preservam os testes por toque com ponte Android simulada.

A suíte adicional `node ferramentas/testar-distribuicao.mjs` desliga seu servidor HTTP antes da primeira análise para verificar o PWA offline, reconcilia lotes ao reabrir o app e executa o worker Blob do arquivo único em `file://`. O empacotamento incorpora 4.433 registros recentes, até 600 por modalidade.

## Critérios estatísticos testados

Interseções independentes; soma das faixas exatas; acumulados distintos; repetição e novidade; enumeração de subconjuntos contra força bruta; última página dos 2.118.760 quintetos da Lotomania; intervalos que não atravessam lacunas; percentuais; percentis com empates; sementes reproduzíveis; validação dos dez formatos; separação dos dois sorteios e dos complementos; carteira sem duplicidade; limites de sobreposição e custo; seleção anterior ao teste final, mesmo quando os dados futuros são alterados; acompanhamento idempotente; nenhum ajuste definitivo por um concurso isolado.

O backtest testado inclui dez hipóteses, oito ablações e duas perturbações de pesos. A comparação usa a unidade concurso e referências do mesmo tamanho/custo. Ausência de dados financeiros produz indisponibilidade, nunca ROI zero inventado.

## Android e reprodução na CI

O [PR 62](https://github.com/stringhijocimar-cyber/sorte-2/pull/62) executa novamente as suítes na versão publicada. O trabalho **APK para revisão**, condicionado ao sucesso dos testes, sincroniza Capacitor, executa `testDebugUnitTest assembleDebug`, confere os plugins/assets no APK e compara o HTML empacotado com a fonte. O artefato de revisão recebe o nome `LotoLab-4.18.0-preview.apk`.

Consulte os checks do commit e a pré-release correspondente para o estado da compilação. Este documento não substitui a evidência do workflow. Não foi realizada instalação em aparelho físico nesta sessão; a assinatura é de depuração.

## Limitações observadas

A base fornecida possui lacunas, datas e complementos ausentes. Super Sete e Mega da Virada não têm base completa incluída. Não foi comprovada vantagem preditiva. ROI só fica disponível com preço histórico e rateio completos. Os formatos novos permanecem no acompanhamento do laboratório, sem ampliar as notificações Java legadas. Os vídeos externos não foram assistidos integralmente; métodos públicos foram tratados como hipóteses, sem copiar palpites.

[Diagnóstico inicial](diagnostico-4.18.md) · [Implementação e instruções](laboratorio-4.18.md)
