# LotoLab 4.26.8 - acompanhamento e transparência

A 4.26.8 reúne as melhorias da 4.26.7 com acompanhamento por faixa de acertos, diagnóstico de redundância e proveniência dos resultados. Android versionCode 45; cache PWA 41.

Para atualizar uma instalação com a assinatura permanente do LotoLab, instale `LotoLab-4.26.8.apk` por cima do aplicativo existente. O identificador `app.lotolab.jogos` e o certificado permanente são preservados. Jogos, histórico e configurações continuam no aparelho. O APK `transferencia` é destinado somente à migração documentada em `docs/atualizacoes-android.md`.

## Acompanhamento por faixa de acertos

O painel da Sugestões mantém três escopos: principal congelada, carteira salva no aparelho e pacote virtual. Exibe todas as faixas de zero até o máximo da modalidade, com “exatamente h” e “pelo menos h” separados, formato, período, protocolo e concursos elegíveis. Dezenas/colunas e complementos têm denominadores próprios. Na Dupla Sena, o painel identifica a primeira extração.

Cada concurso contribui com uma observação: a fração de bilhetes daquele concurso na faixa. Bilhetes sobrepostos não inflam a amostra. A referência é a média das probabilidades combinatórias individuais; não é uma fórmula para a chance de algum prêmio da carteira. A coluna de concursos com algum jogo na faixa descreve ocorrências recebidas, sem assumir independência entre bilhetes.

A principal e o pacote virtual recebem limites de Hoeffding para a diferença, com controle conjunto das faixas e consultas sucessivas deste perfil. O painel é diagnóstico: não sinaliza superioridade nem participa de pesos, promoção de estratégias, sementes ou decisões. O teste histórico separado do consenso é identificado em uma seção própria; a descrição histórica de cada combinação permanece no laboratório.

Resultado ausente permanece pendente. Pacotes sem data de apuração ou registrados no mesmo dia do resultado ficam fora da avaliação, inclusive quando o instante UTC pertence ao dia seguinte mas ainda é o mesmo dia em Brasília.

## Carteira e preservação dos jogos

Novos jogos salvos pela Sugestões ou pelo laboratório recebem um snapshot prospectivo opcional, dentro do registro existente: combinação, data de criação, corte conhecido e período de acompanhamento. Único, fixo e teimosinha conservam suas regras. Não há migração, mudança de chave de armazenamento ou regravação dos jogos antigos.

Jogos legados sem snapshot e snapshots inválidos/alterados continuam salvos e conferíveis, mas ficam fora desta nova avaliação. A carteira contém somente os jogos que continuam salvos; uma exclusão posterior pode selecionar os resultados. Por isso seus números são descritivos, sem limites inferenciais, até existir uma trilha imutável de alterações/exclusões. Salvar não comprova compra de apostas.

O diagnóstico explica duplicados completos, mesmas dezenas/colunas com complementos diferentes, sobreposição e contribuição das fixas. A referência usa os mesmos tamanhos e as restrições declaradas. Na Lotofácil simples livre, a coincidência média natural de dois jogos independentes é nove. Não há garantia ou substituição automática; propostas do laboratório continuam dependendo da adoção explícita do usuário.

## Proveniência e correções

Consultas novas registram fonte, URL e horário informado pelo aparelho. O painel distingue último recebido, resultado salvo, consulta registrada e último confirmado numa consulta direta ao endpoint oficial. Respostas de espelhos/proxies não recebem confirmação direta. Registros antigos sem metadados permanecem sem horário inventado.

Uma correção conserva a versão anterior do resultado e uma trilha das últimas 20 alterações por concurso, com contagem total. Até 20 consultas recentes por concurso conservam a última confirmação direta quando uma consulta posterior utiliza outra fonte. A assinatura FNV local identifica conteúdo e não autentica origem. Falha imediata de gravação restaura a base em memória anterior e informa o erro.

Importação por texto sem data passa a manter `null`, em vez de atribuir a data atual. O manifesto PWA utiliza rede primeiro e cache de reserva, como os recursos mutáveis. Recursos offline e worker continuam próprios do app.

## Desempenho e limites

Os diagnósticos da Sugestões são calculados no worker e usam um cache de três entradas com chave completa. O cache da preparação inclui a carteira; respostas calculadas com uma carteira anterior não são entregues. A distinção entre lote combinatoriamente impossível e amostragem insuficiente passa a ser explícita. A política de geração anterior é preservada, sem enumeração ou protocolo de geração novo.

O diagnóstico do lote aceita até 200 jogos e apresenta os 20 pares de maior excesso sobre a referência, informando o total comparado. Carteiras salvas com mais de 200 jogos são sinalizadas como não avaliadas, sem truncamento silencioso e sem bloquear principal/pacote virtual. O cálculo prospectivo da carteira exige data válida; não estima calendários ou intervalos que atravessam lacunas.

## Validação

Regressões novas em `test:observatorio`: matemática por enumeração independente em universos pequenos, faixas acumuladas, denominadores por concurso, falta de dados, cortes, conflitos, eventos anuais, formatos ampliados, complementos, snapshots, falhas de gravação, cache completo, worker real e escape na apresentação.

`test:layout` inclui os novos painéis abertos nos dois temas, 360/390/412/768/1280 px, texto ampliado, salvamento com snapshot e nove capturas reais. A distribuição `www/` e o HTML único são sincronizados pelas ferramentas existentes. A validação local registrou 172 regressões analíticas, 808 verificações do motor, 513 da interface e 28 de layout, todas aprovadas. A CI do PR #81 também aprovou os testes e a compilação Android. Os detalhes estão em `docs/validacao-4.26.8.md`.

## Compatibilidade

`auto-421-1`, `objetivo-426-3`, identidades de perfil, pesos, sementes, armazenamento/backup, identificador e certificado Android preservados. Os protocolos novos pertencem somente ao diagnóstico e ao snapshot opcional da carteira. Preços permanecem os configurados no app; não há IA externa, login, telemetria, envio de jogos ou banco remoto.
