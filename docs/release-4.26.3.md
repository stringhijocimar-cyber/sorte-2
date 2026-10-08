# LotoLab 4.26.3

Revisão concluída em 08/10/2026 sobre as alterações locais iniciadas em 07/10. Esta versão permanece **em preparação, não publicada**: `versionName` 4.26.3 e `versionCode` 40. Não foi compilado ou assinado um APK desta versão nesta sessão.

## Análise específica

A Mega-Sena apresenta dezenas baixas (1–30), altas (31–60), primos e soma. A Lotofácil apresenta moldura e miolo do volante 5×5, contagens por linha e coluna, linhas/colunas completas, primos e soma. As médias da grade são calculadas **por posição**, corrigindo o total indevido apresentado pelo resumo anterior.

As duas modalidades incluem médias do histórico e uma faixa central descritiva de 80% (percentis 10 e 90 interpolados). Ela não é intervalo de confiança, recomendação de filtro ou previsão. Volantes ampliados são identificados e não recebem percentis diretamente comparados a resultados menores.

A repetição do último resultado disponível é mostrada junto à referência combinatória uniforme do mesmo tamanho de jogo. O histórico de repetição considera apenas transições consecutivas válidas, sem atravessar lacunas. Essas métricas não alteram a seleção dos jogos.

## Qualidade operacional

O indicador é explicitamente **heurístico e não calibrado**, separado da probabilidade de prêmio e da confiança estatística. Sem histórico, a pontuação é zero; amostras curtas e ausência de validação recebem tetos. Lacunas internas, conflitos, registros inválidos e incompletude são apresentados; o recorte anterior ao primeiro concurso não é tratado como lacuna interna.

O painel aparece na recomendação automática realmente usada na tela principal e no fluxo integrado, com estado de validação e explicação dos descontos. Os jogos e rodadas congeladas são preservados. O identificador persistente dos bilhetes foi preservado. O protocolo de avaliação foi incrementado para reprocessar os critérios sem reescrever rodadas: pacotes criados no mesmo dia do sorteio ficam fora da evidência quando não há hora oficial verificável. Decisões antigas são revalidadas conservadoramente.

## Distribuição

A versão do núcleo, dos relatórios e da interface foi alinhada à versão do pacote. Os tokens dos assets alterados e o cache PWA foram atualizados. Uma instalação incompleta do service worker não assume o lugar da versão offline anterior, e a limpeza limita-se aos caches do LotoLab.

A sincronização fonte/`www/` agora usa Node, sem depender de comandos de cópia específicos do shell. A CI recebe as regressões da revisão e a trava de versão; os nomes dos APKs de revisão usam `VERSION`. O HTML único foi regenerado a partir do código atual.

## Validação e limites

Os testes da revisão, de laboratório, recomendação e automação foram reexecutados. A distribuição também foi testada no Chromium com servidor desligado e em HTML único `file://`. O relatório técnico registra os demais resultados e eventuais pendências.

A compatibilidade de atualização Android depende do certificado permanente na futura compilação, não apenas de `versionName` ou `versionCode`. Nenhum APK de revisão/debug deve ser apresentado como atualização assinada final.

O aplicativo não prevê dezenas, não garante prêmio e não aumenta a chance matemática de uma combinação válida do mesmo tamanho. Não foram atualizados resultados externos nem adicionadas fontes de dados nesta revisão.

## Navegação e legibilidade

O atalho **Avaliar estratégias**, que apontava para um painel legado inexistente, agora abre o **Comitê de estratégias** atual do laboratório, com foco acessível. A suíte de interface passa a verificar esse destino real; os testes dos cálculos legados continuam separados na suíte analítica.

Os títulos dos novos painéis usam a variável `--tinta` do tema atual, corrigindo o contraste insuficiente que a variável inexistente `--texto` provocava no modo claro.

As tabelas dos novos painéis também tiveram sua largura contida. O teste com toque real identificou que o conteúdo estava alargando o viewport móvel e deslocando o hit testing. A página agora conserva a largura do viewport visual e as tabelas extensas rolam dentro de seu próprio painel. O cenário isolado de duração fracionária, teimosinha e jogo fixo passou com eventos de toque reais no Chromium.

## Cobertura e atualização do acervo — continuação

O laboratório, a área de dados e as sugestões automática/integrada agora mostram **Cobertura e atualização do histórico**: limites do recorte, quantidade de concursos, cobertura somente entre esses limites, trecho consecutivo final, datas do primeiro/último concurso, fontes declaradas e inversões de data. O painel não modifica pesos, pontuação operacional ou jogos.

Sem data no último concurso, não usa a data de outro resultado nem de download. A idade é comparada ao calendário de Brasília e relógio do aparelho, sem inferir calendário de sorteios. Mais de sete dias gera somente um aviso de possível desatualização; recorte histórico explícito e eventos anuais da Mega da Virada não recebem esse aviso. Data futura exige conferir o resultado e o relógio. Fontes são escapadas e não apresentadas como autenticadas.

Foram incorporados os dados já atualizados pelo GitHub em `main` (`78f9611`), preservando as melhorias e as rodadas. Isso não equivale a uma nova consulta oficial em tempo real: os últimos registros do acervo incorporado são Mega-Sena 3067, em 06/10/2026, e Lotofácil 3799, em 07/10/2026. O HTML único foi regenerado com esse acervo.

As regressões da revisão passaram a 27 casos, todos aprovados. Laboratório, recomendação e automático também foram rechecados. Os sete cenários de distribuição offline passaram incluindo o painel novo, largura móvel e salvamento por toque. A homologação completa de 513 verificações pertence à etapa anterior da revisão; o workflow do pull request executará novamente a suíte completa sobre o código desta continuação.

O trabalho será disponibilizado por branch e pull request, sem merge nem publicação automática de release. A consulta aos nomes dos secrets de assinatura retornou 403; não houve troca de chave nem tentativa de contornar essa limitação. Um APK debug/de revisão, caso gerado pela CI, não substitui a atualização assinada permanente.
