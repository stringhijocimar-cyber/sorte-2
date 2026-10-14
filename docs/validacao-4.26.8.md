# Validação executada - LotoLab 4.26.8

Execução local de 13/10/2026, na branch `codex/lotolab-diagnostico-4-26-8`. Node 24.19.0 e Chromium 133.0.6943.0 em modo headless real. Os números abaixo são desta execução; não reproduzem contagens do PR #80. Perfis/carteiras dos testes são locais e não comprovam apostas reais.

## Resultados

| Verificação | Resultado executado |
| --- | --- |
| Referência antes das mudanças: diagnóstico, plano, revisão, laboratório, recomendação, automático e backup | 145 aprovados |
| Mesmas suítes e novo observatório, após as mudanças | 172 aprovados, zero falhas; 27 são regressões novas |
| Motor legado | 808 aprovados, zero falhas |
| Interface completa | 513 aprovados, zero falhas |
| Layout final, incluindo painéis abertos | 28 verificações aprovadas; nove capturas reais |
| Distribuição, worker offline e HTML único | Nove cenários aprovados |
| IndexedDB, migração, quota, backup, restauração e reabertura | Sete cenários aprovados |
| Proteção/assinatura e ferramentas de backup Android | 23 testes aprovados; somente fixtures temporárias, sem chave ou APK final substituto |
| XML Android | 11 arquivos bem-formados |
| `check:version` | 4.26.8 e Android versionCode 45 coerentes |
| `check:distribution` | Raiz e `www/` idênticos |
| Referências douradas | Arquivo gerado idêntico ao versionado |
| Sintaxe e whitespace | Verificados; `git diff --check` sem erros |

O teste de armazenamento utilizou 24.186 resultados reais, com 10.051.817 caracteres. Depois da correção final da transação de resultados, a execução mediu 45 ms de mesclagem neste ambiente; esse tempo não é promessa de desempenho no aparelho do usuário. Confirmou gravação fora da quota antiga, preservação dos bytes no backup/restauração e reabertura com o pacote original.

O fluxo em navegador cobre geração, navegação, cancelamento, resposta tardia, salvar/reabrir, exportar/importar, falha de quota/transação, ausência de histórico e operação offline. Os testes finais de layout abriram os painéis novos em temas claro/escuro e em 360, 390, 412, 768 e 1280 px. Texto ampliado em 150% não produziu overflow da página; tabelas extensas utilizam rolagem interna. O salvamento preservou a teimosinha e criou o snapshot prospectivo.

## Compatibilidade da geração

`node ferramentas/comparar-geracao-4.26.8.mjs` carregou a fonte original de `60763bce175cfdd4410d9709f172440143c9df06` em um contexto isolado e comparou a saída serializável completa com a implementação atual, ignorando somente etiquetas de versão.

As oito modalidades do acervo (Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Timemania, Dia de Sorte e +Milionária) utilizaram os mesmos últimos 100 resultados reais, três jogos, uma fixa e uma excluída. Jogos, custos, sementes, perfis, calibração, decisões e rodadas coincidiram em todas. Executar o observatório também preservou os bytes do estado automático. Essa comparação verifica compatibilidade de implementação e não vantagem preditiva.

Super Sete e Mega da Virada foram cobertos nas regressões de formato/evento anual e nos fluxos reais da interface integrada; não foram incluídos na comparação do acervo das oito modalidades.

## Reproduzir

```bash
npm run check:version
npm run check:distribution
node --test ferramentas/testar-{diagnostico,plano,revisao,laboratorio,recomendacao,automatico,backup,observatorio}.mjs
node ferramentas/testar-motor.mjs
node ferramentas/comparar-geracao-4.26.8.mjs
python3 ferramentas/conferir-xml-android.py
python3 ferramentas/testar-assinatura.py
```

Para os testes de navegador, definir `LOTOLAB_CHROME` se necessário. Layout, distribuição e armazenamento sobem seu próprio servidor. A interface completa exige servir o checkout em `http://127.0.0.1:8123/` ou definir `LOTOLAB_URL`. A comparação de geração exige que o commit de referência exista no checkout. Os testes de assinatura utilizam arquivos temporários de teste; não executam publicação de release.

## Capturas e arquivos

Nove PNGs e o resumo produzido pelo teste estão em `docs/capturas-4.26.8/`. Incluem principal da Mega-Sena/Lotofácil, configurações, análise, perfil, faixas e proveniência. Foram inspecionados visualmente após o ajuste final; tabelas mantêm palavras inteiras e a proveniência cabe em duas colunas no celular. As capturas históricas da pasta `capturas/` foram preservadas.

Mudanças de aplicação: `index.html`, `sw.js`, núcleo, automático, renderizadores, dispatcher worker, rótulo ativo do backup e folha proprietária da experiência. Cópias sincronizadas em `www/` e `lotolab-completo.html` regenerado pela ferramenta. Metadados ativos: VERSION, package/lock, Gradle e manifesto de release. Acrescentados teste/compare, notas, metodologia, capturas e a regressão nova na CI. Módulos de armazenamento, regras de conferência, protocolos de promoção, identificador e certificado Android não foram modificados.

## Estados de entrega

- Implementação: concluída e validada localmente.
- Código: PR #81 direcionado à main, incluindo a fonte da 4.26.7 do PR #80. A CI de testes aprovou o commit `3eb3016818314148845bc1dccac25b8910b8b135` em 14/10/2026, execução `38615859021`.
- Site Manus: não atualizado nesta tarefa.
- APKs finais: compilados na execução `38615859054`, com testes nativos aprovados, e assinados localmente com o certificado permanente. Versão 4.26.8, versionCode 45 e identificador `app.lotolab.jogos` conferidos; fontes comparadas byte a byte com o checkout. O APK final desativa a depuração; a edição de transferência mantém a permissão somente para migração.
- Compatibilidade: o certificado dos dois APKs coincide com o pino do projeto e com o APK 4.26.4 publicado, cujo versionCode é 41. A chave privada foi recuperada do backup existente e não foi enviada ao repositório. Não foi criada uma assinatura substituta.
- Distribuição: APKs, hashes e proveniência em `distribuicao/4.26.8/`. A publicação da release `v4.26.8` utiliza o workflow de APKs pré-assinados, que repete as verificações antes de disponibilizar os downloads.

Uma branch/PR ou um APK de revisão não atualiza o aplicativo instalado. Limites pendentes: fonte oficial em rede não foi validada de ponta a ponta neste ambiente; a carteira restante permanece descritiva por falta de trilha imutável de exclusões; não há política nova de enumeração ou prova de vantagem preditiva. Detalhes em `analise-observatorio-4.26.8.md` e `release-4.26.8.md`.
