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
