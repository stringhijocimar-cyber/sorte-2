# LotoLab 4.20 — implementação e critérios

## Recomendação

`ui/lab-recommendation.js` calibra quatro perfis predefinidos, incluindo o
neutro. Usa até 180 concursos do último trecho contínuo: pelo menos 60 para
treino, 30 para seleção e 30 para teste. Cada alvo é avaliado somente com
registros anteriores. A semente depende da modalidade e do formato, nunca
dos resultados futuros nem da semente escolhida para gerar novos jogos.

Uma candidata usa 80 jogos de referência para escolha e 32 jogos uniformes
independentes para comparação por concurso. Os perfis alternativos precisam
superar o neutro e o acaso: IC 95%, permutação em blocos, Holm em seis
comparações, três períodos positivos e estabilidade sem o melhor/pior alvo.
O perfil é congelado antes do teste; a etapa final confirma ou rejeita a
escolha. Pesos variam entre 0,8 e 1,2 e entram efetivamente na distância e na
explicação do jogo. Cache limitado por modalidade, assinatura e formato.

Com fixas/exclusões, menos de 120 concursos consecutivos ou dados especiais
insuficientes, o motor mantém pesos neutros. Uma base com menos de 30
concursos gera uma seleção aleatória explicitamente identificada.
Os resultados prospectivos das recomendações integradas podem suspender o
ranking após 60 observações, IC inteiramente negativo, p ajustado <0,05 e
três períodos negativos. Um concurso isolado não muda o método.

A calibração é exploratória e usa uma população menor que a geração final.
Não certifica o lote completo, complementos, retorno financeiro ou vantagem
futura. Monte Carlo descreve o acaso; não é fonte de sinal para alterar pesos.
O comitê antigo continua acessível como diagnóstico manual e não bloqueia
a fila do worker com avaliações automáticas de outro gerador.

## Uso, atualização e publicação

Super Sete e Mega da Virada mantêm controles adequados ao formato, mas usam
`recommend`, com uma principal, análise da mesma combinação e registro futuro.
Não se misturam concursos comuns da Mega-Sena com eventos especiais.

`buscaDiaria` impede execuções simultâneas duplicadas, usa até três consultas
concorrentes e confere cada modalidade antes de esperar as demais. Modalidade
aberta, jogos salvos e resultados pendentes têm intervalo de cinco minutos;
a tela visível verifica a necessidade a cada minuto. O WorkManager atualiza
o agendamento anterior para 15 minutos e enfileira uma verificação imediata.
Isso reduz esperas do app; a disponibilidade da CAIXA e o Android determinam
o momento efetivo da entrega.

`completar-lacunas.mjs` consulta números ausentes com três requisições no
máximo, timeout de 12 segundos e validação do número/formato recebido. A
manutenção diária repõe até 40 por modalidade. Falhas são registradas e
registros existentes são preservados.

A CI exige espelhos sincronizados, testes do motor, laboratório, recomendação,
interface e modo offline antes do build Android. Confere os assets dentro do
APK. A publicação final é feita somente após esses gates; versões existentes
não são sobrescritas.

## Base entregue

Foram recuperados 2.276 concursos pela API oficial, incluindo os 218 da
Mega-Sena. As oito modalidades da base principal ficaram sem lacunas de
numeração do concurso 1 até o último registro disponível em cada arquivo.
Isso não significa rateios, datas ou complementos integralmente preenchidos;
os indicadores da base continuam expondo campos ausentes.
