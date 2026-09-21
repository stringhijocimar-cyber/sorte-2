# Diagnóstico anterior à evolução 4.18

Inspeção em 19/09/2026, reconferida em 20/09/2026. Base: PR 62, commit remoto `a02e286b98f3be550a91a39ce3ff0071b8bcd31c`, versão 4.17.0. A árvore local tem correções de dimensões dos controles de recorrência ainda não publicadas. Não há AGENTS.md.

## Arquitetura

- Aplicativo principal: `index.html`, CSS em `ui/`, 15 telas, estado `S` e `Guardar` em localStorage. PWA com service worker; Android Capacitor 6 com cópia em `www/`, notificações e WorkManager Java.
- Atualização existente: CAIXA, repositório e espelhos identificados; busca incremental e importação manual. Preservar esses fluxos.
- Backend separado em `analytics/`: FastAPI, SQLAlchemy/Alembic, SQLite/PostgreSQL, núcleo Python e frontend React/Vite. Tem APIs de saúde, modalidades/probabilidades, autenticação, jogos, conferência, backtests, exportação, relatórios e tarefas. Não está integrado ao APK. Suas funcionalidades não devem ser apresentadas como já disponíveis no aplicativo principal.
- Testes: motor, inteligência, análise cronológica, recorrência, metas, complementos, atualizador, Chrome/CDP, Java e backend Python. O PR 4.17 falhou na dimensão de controles novos; as correções locais precisam passar novamente.

## Requisitos comparados ao estado encontrado

| Requisito | Estado inicial | Lacuna |
|---|---|---|
| Interseção, exatos e acumulados | Existente em oito modalidades | Não trata colunas do Super Sete |
| Percentuais, perfis, raridade | Parcial | Consolidar por combinação |
| Aderência e percentil contra milhares de jogos | Ausente no app | Criar índice descritivo reproduzível |
| Frequência, atrasos, intervalos | Parcial | Consolidar, sem atravessar lacunas |
| Concursos por faixa | Parcial | Mostrar lista completa paginada |
| Subconjuntos | Parcial | Limite de 2.000 grupos; substituir por páginas exatas |
| Geração, restrições e explicações | Parcial | Ampliar modelos, perfis e referências |
| Carteira e substituição | Parcial | Trios, distâncias e redução de redundância |
| Comitê e decisões adaptativas | Parcial | Acompanhamento prospectivo e comparação integrada |
| Backtest financeiro | Separado/parcial | Exigir preço e rateio históricos completos |
| Monte Carlo, mudança de perfil, ablação | Parcial | Integrar e exportar resultados |
| Dez modalidades solicitadas | Parcial | Virada com identificação explícita; Super Sete ordenado |
| Complementos | Parcial | Mês, time, trevos e segunda extração incompletos na base |
| Dados e atualização | Parcial | Mostrar lacunas, origem e completude |
| Navegador, Android, cores e navegação | Existente | Preservar e testar |

## Acervo disponível

| Modalidade | Registros | Último concurso | Ausentes entre extremos |
|---|---:|---:|---:|
| Mega-Sena | 2.835 | 3053 | 218 |
| Lotofácil | 3.295 | 3779 | 484 |
| Quina | 6.634 | 7110 | 476 |
| Lotomania | 2.737 | 2972 | 235 |
| Dupla Sena | 2.777 | 3005 | 228 |
| Timemania | 2.206 | 2437 | 231 |
| Dia de Sorte | 1.039 | 1290 | 251 |
| +Milionária | 233 | 386 | 153 |

Na Mega-Sena, 2.797 registros não têm data. Os arquivos locais não incluem complementos completos, base do Super Sete nem identificação dos concursos da Virada. Não chamar esse acervo de histórico completo, preencher datas, inferir complementos ou tratar prêmio ausente como zero.

## Decisões

Núcleo JavaScript puro, cálculos pesados em worker, integração à área de Estatísticas e exportação JSON. Referências de mesmo tamanho e custo, seleção cronológica anterior ao teste, correção de comparações e registro de tentativas. Sem novos endpoints necessários. Exemplos apenas demonstrativos e nos testes, nunca parâmetros de preferência.
