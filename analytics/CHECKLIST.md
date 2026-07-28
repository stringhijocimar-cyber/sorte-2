# Checklist de validação

Os 20 critérios de aceitação do §30, mapeados ao estado real. "Atendido" só
aparece quando existe teste automatizado que prova o critério — a coluna
*Evidência* nomeia o teste, para que qualquer um possa conferir em vez de
acreditar.

**Conclusão geral: o sistema NÃO está pronto.** 10 dos 20 critérios estão
atendidos, 4 parcialmente, 6 pendentes. O detalhamento está abaixo.

Reproduzir: `cd backend && python3 -m pytest -q` (172 testes, sem rede).

---

## Critérios

| # | Critério (§30) | Estado | Evidência |
|---|---|---|---|
| 1 | Importar corretamente o histórico de todas as modalidades | ⚠️ parcial | Conversão, validação e recusa testadas com respostas controladas (`test_ingestao.py`, 22 testes). **Nunca executado contra a API real da CAIXA** — sem isso o critério não pode ser dado por cumprido. |
| 2 | Atualizar novos concursos sem duplicidade | ✅ | `test_importa_apenas_o_que_falta`, `test_deduplica_contra_o_banco_e_dentro_do_lote`, `test_nada_a_fazer_quando_esta_em_dia`; e `UNIQUE(lottery_id, contest_number)` no schema |
| 3 | Gerar apenas jogos válidos | ✅ | `Modalidade.validar_aposta()` em toda aposta; `test_gera_jogos_validos`, `test_obrigatorios_aparecem_em_todos_os_jogos`, `test_excluidos_nao_aparecem`, `test_filtro_apertado_entrega_menos_e_nao_mente` (o gerador nunca completa o lote violando filtros) |
| 4 | Calcular corretamente combinações e probabilidades | ✅ | `test_probabilidade_da_sena_e_a_oficial` (1 em 50.063.860), `test_probabilidade_da_lotofacil_e_a_oficial` (1 em 3.268.760), `test_probabilidades_de_uma_modalidade_somam_um` |
| 5 | Executar backtests reproduzíveis | ✅ | `test_avaliacao_e_reproduzivel_com_a_mesma_semente`; semente gravada em `Avaliacao.semente` e `backtests.seed NOT NULL` |
| 6 | Separar desenvolvimento, validação e teste | ✅ | `test_particao_e_cronologica_e_nao_se_sobrepoe`, `test_particao_embaralhada_e_recusada`, `test_particao_sem_teste_e_recusada` |
| 7 | Comparar estratégias com milhares de jogos aleatórios | ✅ | `avaliar_periodo(n_simulacoes=10_000)` por padrão; `test_avaliacao_compara_com_aleatorio_e_registra_semente`, `test_aleatorio_fica_perto_do_meio_da_propria_distribuicao` |
| 8 | Calcular custos, prêmios, resultado líquido e ROI | ✅ | `test_metricas_de_carteira_conhecida`, `test_custo_usa_o_preco_do_concurso_nao_o_de_hoje`, `test_preco_respeita_a_data_do_concurso` |
| 9 | Aplicar intervalos de confiança | ✅ | Todo `Resultado` carrega IC; `test_nenhum_resultado_sai_sem_ic_e_efeito`, `test_wilson_bate_com_scipy`, `test_wilson_nunca_sai_do_intervalo_valido` |
| 10 | Corrigir múltiplos testes | ✅ | Bonferroni, Holm e BH conferidos contra `statsmodels` (`test_holm_e_bh_batem_com_statsmodels`); `test_relata_quem_perdeu_a_significancia` |
| 11 | Identificar risco de overfitting | ✅ | `overfitting.calcular()`; `test_degradacao_grande_eleva_o_risco`, `test_instabilidade_entre_janelas_eleva_o_risco`, `test_sem_janelas_cobra_metade_do_peso_e_avisa`. **É heurística declarada, não medida oficial.** |
| 12 | Repetir testes em diferentes períodos | ✅ | Walk-forward expansiva e móvel: `test_walk_forward_expansiva_avanca_sem_sobrepor`, `test_walk_forward_movel_esquece_o_comeco`. ⚠️ Falta a *matriz de estabilidade* do §17 (acumulado vs. regular, janelas curtas vs. longas). |
| 13 | Exportar resultados | ❌ | Não implementado. CSV, Excel e PDF pendentes. |
| 14 | Exibir avisos de limitações estatísticas | ⚠️ parcial | Todo `Resultado` traz `leitura` em português e o índice de overfitting se declara não-oficial. Falta a **interface** que exibe isso junto ao dado. |
| 15 | Não prometer capacidade de prever sorteios | ✅ | Nenhuma função de previsão existe; README e docstrings afirmam o contrário explicitamente. ⚠️ Falta o teste automatizado de vocabulário proibido (existe no LotoLab; deve ser portado). |
| 16 | Funcionar em celular e computador | ❌ | Sem frontend. |
| 17 | Possuir documentação técnica | ✅ | `README.md`, `ARQUITETURA.md`, `banco/schema.sql` comentado, docstrings em todos os módulos |
| 18 | Possuir testes automatizados | ✅ | 97 testes, 1,4 s, sem rede. ⚠️ Faltam testes de API, de banco, de interface e end-to-end (não há o que testar ainda). |
| 19 | Permitir auditoria dos parâmetros utilizados | ✅ | `test_salva_backtest_com_semente_e_particao`, `test_backtest_sem_semente_e_recusado_pelo_banco`, `test_alteracao_cria_nova_versao_sem_apagar_a_anterior`, `test_auditoria_nao_expoe_alteracao_nem_remocao` |
| 20 | Atender segurança e jogo responsável | ⚠️ parcial | Modelo de dados atende LGPD e é testado (`test_usuario_guarda_o_minimo_necessario`, `test_consentimentos_sao_datados`, `test_auditoria_guarda_hash_do_ip_e_nao_o_ip`, `test_apagar_usuario_leva_estrategias_e_jogos`). **Falta o código de autenticação, rate limiting e as telas.** |

---

## Validações específicas exigidas pelo §29

| Item | Estado | Evidência |
|---|---|---|
| Probabilidades | ✅ | valores oficiais conferidos; soma das probabilidades = 1 |
| Combinações | ✅ | `combinacoes_possiveis()` e `apostas_equivalentes()` testados |
| Custos | ✅ | preço pela data do concurso, aposta ampliada = C(n,k) apostas simples |
| Apuração dos prêmios | ⚠️ | apuração por interseção testada; **depende de rateio histórico completo**, que a fonte nem sempre traz. Ausência devolve 0 e é reportada, nunca estimada. |
| Separação temporal | ✅ | `test_particao_*` |
| Ausência de vazamento de dados | ✅ | `test_estrategia_nao_ve_o_futuro` — estratégia trapaceira instalada de propósito |
| Reprodutibilidade dos backtests | ✅ | `test_avaliacao_e_reproduzivel_com_a_mesma_semente` |

---

## Cobertura de testes por tipo (§29)

| Tipo | Estado |
|---|---|
| Unitários | ✅ 172 |
| Estatísticos | ✅ conferidos contra SciPy e statsmodels |
| Regras de cada modalidade | ✅ 9 modalidades |
| Geração de combinações | ✅ validade, faixa, ordem, não-duplicidade, obrigatórios/excluídos, orçamento, filtros |
| Não duplicidade | ✅ importação e geração |
| Atualização de concursos | ✅ incremental, falha isolada, fallback, CSV |
| Integração | ✅ histórico do banco alimentando o motor de backtest |
| API | ❌ sem API |
| Banco de dados | ✅ 35 testes em SQLite; restrições, cascatas e versionamento |
| Interface | ❌ sem frontend |
| End-to-end | ❌ |

---

## O que impede declarar o sistema pronto

Em ordem de impacto:

1. **Nenhuma execução contra a API real da CAIXA.** Toda a importação foi
   exercitada com respostas controladas. O formato real pode divergir do que
   assumi, e isso só se descobre executando.
2. **Sem migrações nem execução em PostgreSQL real.** A persistência é testada
   em SQLite; os tipos são portáteis por variante, mas nada rodou ainda contra
   um PostgreSQL de verdade.
3. **Sem interface.** O critério nº 14 (avisos de limitação) depende de tela, e
   é justamente o que protege o usuário de interpretar mal um resultado.
4. **Sem segurança implementada.** Autenticação, LGPD e jogo responsável estão
   modelados e não construídos.
5. **Preços e faixas conferidos apenas contra fontes públicas.** Um preço
   histórico errado contamina o ROI de todo o período. Precisa de conferência
   contra o portal oficial antes de qualquer uso sério.

---

## Regra permanente

> Sempre que uma metodologia apresentar resultado aparentemente superior,
> executar validação fora da amostra, Monte Carlo e correção para múltiplos
> testes. *(§33)*

Isto já é o comportamento padrão de `avaliar_periodo()`: a comparação contra
carteiras aleatórias e o teste de permutação não são opcionais, e o resultado
sai com IC e tamanho de efeito ao lado.

A demonstração de ponta a ponta existe para exercitar exatamente esse caso: uma
carteira com **ROI +28,57%** no **percentil 95,8** — e o veredito *"diferença
compatível com acaso"*, porque o ganho inteiro veio de uma única quadra, com
seca de 25 concursos e queda acumulada de R$ 437,50.
