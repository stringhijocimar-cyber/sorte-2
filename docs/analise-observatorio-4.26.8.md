# Diagnóstico 4.26.8: método e decisões

Base verificada: `60763bce175cfdd4410d9709f172440143c9df06` na branch `melhorias/inteligencia-pos-4.26.4`, PR #80 aberto. A main `5f3940e85976a61befe23caeed93709978857ba5` só acrescentava dados/aprendizado; integrada por merge na branch própria. Nenhum arquivo local prévio foi descartado. Próxima versão livre verificada em branches/tags: 4.26.8.

## Achados e implementação

| Prioridade | Estado na base | Mudança |
| --- | --- | --- |
| Faixas prospectivas | Histórico completo de faixas no laboratório; objetivo alto resumido no automático | Faixas predefinidas, denominadores por concurso, três escopos, complementos e teste separado |
| Redundância | `portfolio` e sobreposição de referência no plano | Diagnóstico de identidade completa/principal, pares e concentração com restrições |
| Proveniência | Origem declarada e cobertura; correções podiam substituir a versão anterior | Consulta/URL quando novas, confirmação direta separada e versões anteriores preservadas |
| Desempenho | Geração no worker, cancelamento e guardas de resposta existentes | Diagnóstico no mesmo worker, cache pequeno completo e carteira na identidade da preparação |
| Data ausente | Importação textual substituía data ausente por hoje | Data ausente permanece `null` |
| Cache PWA | Manifesto cache primeiro | Manifesto mutável passa a rede primeiro com reserva offline |
| Geração viável | Falha por pool curto dizia que as restrições eram impossíveis | Erro de amostragem separado da recusa combinatória prévia |

## Estatística definida antes da avaliação

Para concurso t e uma faixa h, X_t é a fração de jogos congelados daquele escopo que atingem exatamente h (ou pelo menos h). O concurso, e não o bilhete, é a unidade. A expectativa p_t é a média da distribuição combinatória de cada jogo. A dependência entre jogos no mesmo concurso é permitida: X_t continua limitado a [0,1].

Para dezenas, a referência individual é hipergeométrica; para colunas, é uma convolução das probabilidades de marcações por coluna. Trevos têm distribuição hipergeométrica própria; mês/time usam o universo definido nas regras do aplicativo. Complemento ausente exclui o concurso somente de seu denominador, não da análise de dezenas. Isso não calcula a probabilidade conjunta de premiação.

Hipótese de referência: sorteios uniformes independentes, com os jogos/formato congelados antes de cada resultado. Para a principal e o pacote virtual, a diferença média D_n entre observado e referência recebe um limite bilateral de Hoeffding com raio:

`sqrt(log(2 M n (n+1) / 0.05) / (2 n))`.

M reserva os dois tipos de faixas de dezenas/colunas e complementos, nos três escopos. A alocação 0,05/[M n(n+1)] controla a soma sobre n, pois a série 1/[n(n+1)] soma um. A união não exige independência entre faixas ou escopos. Os limites são conservadores e descrevem diferença sob a referência; não são intervalos de chance do prêmio. Consultar outros perfis/recortes ou selecionar o perfil mais favorável não está coberto por esta família. O painel não produz sinal de superioridade.

Na carteira local, a presença atual de um registro não fornece uma trilha imutável das exclusões passadas. Um usuário pode apagar um jogo depois de ver seu desempenho. Para não atribuir cobertura inferencial a uma amostra selecionável, esta carteira recebe somente descrição. Os snapshots novos comprovam o conteúdo declarado antes do resultado, dentro das limitações do relógio/arquivo local; não autenticam apostas reais ou arquivos importados.

## Integridade e identidade

Validação original de estado/protocolo/perfil, concurso-alvo e restrições reutilizada. Datas seguem a regra conservadora de dia estritamente anterior em Brasília. Conflitos continuam excluídos pelo núcleo original; resultados ausentes não são observações com zero. Não há protocolo novo para promover estratégias. Rodadas e decisões originais permanecem imutáveis durante o diagnóstico.

Correções são identificadas por conteúdo normalizado e preservam a versão anterior sem inventar origem. Atualizar somente consulta/fonte não conta como correção. A trilha conserva 20 revisões e 20 consultas recentes por concurso; a contagem total de revisões fica disponível. Backups existentes aceitam os campos adicionais sem mudar o esquema ou as chaves.

## Limitações e entrega

Não há enumeração adicional ou alteração da política de geração: a amostragem pode falhar mesmo num espaço viável. O diagnóstico não comprova vantagem preditiva, autenticidade do acervo, retorno financeiro ou atualização automática do site/APK. A hospedagem Manus é outro projeto e permanece fora do alvo deste PR.

Implementação nos módulos existentes, distribuição e testes em `ferramentas/`; sem migração de stack ou serviço novo. Notas: `docs/release-4.26.8.md`. Evidências novas de execução: `docs/validacao-4.26.8.md`.
