# Revisão LotoLab 4.26.3 — 08/10/2026

## Escopo
Revisar e corrigir o trabalho local da 4.26.3, ainda sem APK, commit remoto ou publicação. Preservar rodadas congeladas, protocolos de avaliação e armazenamento existentes. Não alterar pesos ou sugerir vantagem preditiva com métricas descritivas.

## Implementação
- Corrigir médias da grade por posição; acrescentar referência histórica com intervalo central e tratamento explícito de volantes ampliados.
- Explicar repetição do último resultado contra a distribuição combinatória e descrever somente transições consecutivas válidas no histórico.
- Corrigir o indicador heurístico: separar disponibilidade/qualidade operacional e estado de validação; mostrar nos fluxos automático e integrado.
- Alinhar versões de relatórios, interface, cache e manifesto de release. Não renomear protocolos persistidos nem regravar apostas/rodadas.
- Manter trava de distribuição e acrescentar regressões à CI.

## Estrutura
- `index.html`: aplicação e ponte com os módulos.
- `ui/lab-core.js`: análise pura e resumos específicos.
- `ui/lab-recommendation.js`: recomendação integrada e indicador operacional.
- `ui/lab-auto.js` e `ui/lab-auto-ui.js`: ciclo automático congelado e sua apresentação.
- `ui/lab-ui.js`: laboratório e renderizadores compartilhados.
- `www/`: cópia distribuída no Capacitor; `sw.js`: cache PWA.
- `ferramentas/`: testes e geração do HTML único; `.github/workflows/`: travas de CI.

## Interface
Preservar o design existente, cores por modalidade e tipografia do aplicativo. Reutilizar tabelas roláveis e detalhes acessíveis; não introduzir assets decorativos nem mudanças de navegação. Texto distingue descrição histórica, referência matemática, recorte e ausência de validação.

## Achados adicionais e decisões
A segunda revisão reproduziu o aceite de pacotes do mesmo dia na avaliação prospectiva. Corrigido com regra conservadora de data local estritamente anterior; protocolo de avaliação `objetivo-426-3`, mantendo o protocolo dos bilhetes e a identidade dos perfis. Decisões anteriores permanecem no histórico e são revalidadas sem alterar as rodadas originais. A referência de semelhança é retrospectiva e foi rotulada como tal, sem alterar seus pesos.

A interface revelou atalhos remanescentes para o painel 4.13/4.16 que já havia sido retirado. O atalho Avaliar estratégias agora abre o comitê atual do laboratório com foco acessível. Os testes de UI deixam de exigir o painel removido; os cálculos legados continuam na suíte analítica específica. Os títulos dos novos painéis utilizam `--tinta`, preservando contraste nos dois temas.

## Continuação — cobertura do acervo e entrega para revisão

Acrescentar um diagnóstico objetivo da base, sem mudar pesos, geração ou a pontuação heurística: quantidade de concursos, limites do recorte, cobertura somente dentro desses limites, maior trecho consecutivo final, data do último concurso, datas fora de ordem e fontes declaradas. Ausência de data não pode ser suprida pela data de download nem pela data de outro concurso. O painel não deve afirmar que a base é a última oficial sem consulta verificável. Comparação com o relógio será feita na apresentação, em Brasília, sem alterar assinaturas ou registros persistidos; recortes históricos e a Mega da Virada não receberão alerta artificial de atraso.

Usar o mesmo painel no laboratório, nos dados e na sugestão automática/integrada, mantendo a largura contida e detalhes acessíveis. Incorporar os dados novos de `origin/main` sem reescrever rodadas. Reunir o trabalho na branch `melhorias/lotolab-4.26.3-revisao` e em um pull request, sem merge automático nem release pública. A leitura dos nomes de secrets da assinatura retornou 403; não contornar essa limitação, não trocar certificado nem afirmar disponibilidade da chave. O APK de revisão poderá ser compilado pelo workflow do PR se a integração permitir.

## Inteligência analítica após a 4.26.4 — 10/10/2026

Base real: main `2ea9105`, release 4.26.4 já publicada. Preparar melhorias na branch `melhorias/inteligencia-pos-4.26.4`, sem merge nem release automática. A correção IndexedDB da 4.26.4 deve ser preservada.

Implementar um diagnóstico compartilhado, descritivo e determinístico de frequência para todas as dezenas/posições, não apenas para o jogo escolhido. Cada item traz observação, referência uniforme, intervalo Wilson e teste bilateral exato; corrigir conjuntamente as comparações de frequência total e de mudança recente com Holm, sem interpretar IC individual como teste conjunto. A comparação recente usa últimos 30 concursos contra até 120 anteriores, sem sobreposição, somente no trecho consecutivo final com pelo menos 60 anteriores. Base curta, recorte temporal, lacunas e eventos anuais ficam explicitamente identificados. Nenhum resultado altera pesos, seleção, protocolo de rodadas, certificado ou assinaturas da base. O relatório não valida autenticidade nem independência do acervo e exige confirmação futura antes de qualquer uso de seleção.

Apresentar o mesmo diagnóstico no laboratório e nas sugestões automática/integrada, em detalhes responsivos: resumo útil, método e tabela ordenada por dezena, não uma lista de números para apostar. Corrigir a perda de metadados de integridade quando os fluxos de recomendação reanalisam a base normalizada. Preparar 4.26.5 como versão de desenvolvimento não publicada, mantendo 4.26.4 e seus APKs intactos. Validar com testes matemáticos independentes, cortes, lacunas, regressões e dados reais do repositório; preservar custo previsível com cache pequeno e nenhuma chamada de IA externa.

## Continuação — configuração inteligente 4.26.6 (10/10/2026, noite)

A main avançou para `b954c04`, com hotfix 4.26.5 de migração assíncrona e abertura/conferência linear. Essas correções foram integradas por merge, sem reescrever a main. A inteligência anterior continua no PR #80 aberto. Não reutilizar 4.26.5 para uma mudança funcional diferente: preparar 4.26.6 (versionCode 43), sem merge ou publicação final.

Adicionar `recommendationPlan` puro no módulo `ui/lab-recommendation.js`: valida formato, fixas/exclusões, trevos, quantidade e orçamento; conta exatamente com BigInt as configurações principais e completas; distingue a identidade usada pelo motor integrado (dezenas/colunas) da automática (jogo completo). Explicar custo efetivo, truncamento pelo limite, saturação do universo, redução de variedade e sobreposição de referência sob as mesmas restrições. A referência é matemática para dois jogos amostrados independentemente (pode haver repetição), não teste de vantagem ou chance do lote. Não somar chances nem aumentar orçamento automaticamente.

Usar um pré-diagnóstico leve antes dos cálculos pesados nos dois motores, devolvendo erro acionável sem criar/apurar rodada ao pedir lote impossível. Anexar o plano ao resultado sem alterar sementes, pesos, protocolos, perfis ou combinações de configurações viáveis. `lab-ui.js` apresenta o mesmo painel nos dois fluxos; `index.html` usa o contrato comum para atualizar o painel ao editar campos, sem redesenhar a página ou buscar rede. Mostrar diagnóstico também antes da geração no laboratório especial, com fallback para campo incompleto. Reutilizar cores, tipografia e detalhes/tabelas contidos do app.

Estrutura e design seguem o plano existente: `ui/` contém funções puras e renderizadores compartilhados, `index.html` os eventos, `ferramentas/` regressões, `www/` cópia sincronizada e HTML único gerado pela ferramenta. Nenhum novo asset, serviço, modelo externo, armazenamento ou permissão.
