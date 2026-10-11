# LotoLab 4.26.7 — layout e clareza

**Versão de revisão, não publicada.** Android versionCode 44. Conserva a inteligência da 4.26.6 e as correções de abertura/armazenamento da main.

## Melhorias visuais

A sugestão principal, o custo real do lote, os jogos adicionais e as ações Salvar/Exportar aparecem antes dos detalhes analíticos. Opções de acompanhamento e validações de salvamento continuam no fluxo existente, sem IDs duplicados e sem barra fixa que encubra o teclado ou a navegação.

Novo resumo mostra a origem da evidência (descrição histórica, teste histórico separado ou acompanhamento prospectivo), concursos da base, conferidos neste perfil e quantidade de testes virtuais. A limitação “Histórico descreve; não prevê” permanece visível.

Pacote virtual, motivo da escolha, decisão e detalhes de qualidade operacional são recolhíveis. Avisos de falha de gravação, histórico alterado, ausência de base, conflitos e invalidade permanecem explícitos. A leitura específica da modalidade fica recolhida na sugestão, mas disponível completa no laboratório.

Tipografia explicativa ampliada, controles maiores e tabelas contidas. Na Lotofácil, dezenas da principal em cinco colunas, sem ocultar números. Temas claro e escuro preservados. Personalização pode ficar compacta após um lote válido; entrega automática não recolhe os campos durante a edição.

O laboratório apresenta uma conclusão retrospectiva antes das métricas e tabelas. Cálculos, pesos, sementes, protocolos de rodadas, armazenamento, certificado e resultados não foram modificados. Apenas a versão declarada do núcleo mudou.

## Validação

`ferramentas/testar-layout.mjs` usa Chromium, os últimos 180 resultados reais do acervo local e o fluxo de geração/salvamento da aplicação. Capturas são da interface executável, não mockups. O script verifica ordem das ações, custo, conteúdo preservado, fonte computada, foco durante entrega, toques, acompanhamento, avisos e largura em dois temas. Resultados locais: 145 testes de sete suítes analíticas, 513 verificações da interface completa (antes do ajuste final de anúncio acessível), 23 verificações finais do novo layout e 9 cenários de distribuição aprovados. A revisão independente não encontrou bloqueadores; o aviso de inviabilidade recebeu um status conciso para leitores de tela, validado na regressão final.

## Publicação

Revisão no PR #80; sem merge na main ou release final automática. Capturas e prévia temporária não equivalem a APK publicado.
