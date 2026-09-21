# LotoLab 4.19 — recomendação conectada ao laboratório

A tela Sugestões usava `intGerarLote`, com seis medidas estruturais, enquanto
o laboratório possuía análises de frequência, atraso, subconjuntos e perfil
de acertos em um gerador separado. O usuário precisava escolher entre métodos
sem uma decisão principal que reunisse esses dados.

## Comportamento

- Um jogo principal e todo o histórico disponível são os padrões.
- A tela não pede a escolha de um método. Jogos adicionais são opcionais.
- O novo motor usa diretamente `history`, `vector`, `center`, `distance`,
  `analyze`, `reference` e `portfolio` do núcleo do laboratório.
- Entre pelo menos 600 candidatas (ou todas, se as restrições produzirem um
  espaço menor), a principal minimiza a distância conjunta ao perfil de
  referência. A geração avalia mais candidatas em lotes grandes.
- Os critérios incluem soma, paridade, amplitude, consecutivos, dispersão,
  concentração, finais, frequência, atrasos observáveis, pares/trios,
  repetição do último concurso e distribuição de acertos.
- As referências históricas retiram a coincidência do próprio resultado.
  Volantes ampliados são comparados com combinações do mesmo tamanho.
- Os adicionais penalizam sobreposição de dezenas, pares e trios. Não há
  duplicatas de dezenas/colunas dentro do lote.
- Tamanho, fixas, exclusões, trevos fixos, orçamento e semente são preservados.
  Mês/time/trevos não fixados são uniformes, sem alegação de previsão.
- Com menos de 30 concursos válidos, o app informa a seleção aleatória e a
  insuficiência para um ranking histórico. Lacunas/conflitos não são ocultados.

## Rastreabilidade e uso

O cartão principal aparece uma única vez. A explicação apresenta as parcelas
da distância efetivamente usada no ranking, a distribuição exata de acertos,
a base, sua assinatura e as limitações. Percentil de semelhança é comparado
com 1.000 referências e nunca rotulado como probabilidade de ganhar.

“Ver análise usada na escolha” abre a mesma combinação e o retrato do recorte
usado. Reanalisar no laboratório usa o histórico atual. A mudança de base
durante o cálculo descarta o resultado; após o cálculo, sinaliza a seleção
antiga e impede salvá-la como atualizada. Alterar o formulário não reescreve
o lote que já foi calculado.

O cálculo roda no worker. Falhas são visíveis; nenhuma sugestão substituta é
inventada silenciosamente. Trocar de tela/modalidade invalida a renderização
pendente. Experimentos com métodos individuais ficam recolhidos no laboratório,
com um acesso à recomendação principal nas oito modalidades da navegação.
Super Sete e Mega da Virada conservam seus controles específicos no laboratório.

Ao salvar, o app registra semente, corte, assinatura, critérios e papel
principal/adicional. Jogos destinados a um concurso futuro passam também ao
monitor prospectivo do laboratório. Somente registros anteriores ao alvo
participam dessa conferência. Salvar não registra aposta.

## Limites estatísticos

Esta é uma seleção descritiva por semelhança, com critérios fixos. Aderência,
frequência ou atraso não demonstram maior probabilidade futura. O mesmo acervo
participa da seleção e da explicação: o perfil exibido não é um teste fora da
amostra. As comparações antigas são identificadas como diagnóstico dos métodos
anteriores e não certificam o motor integrado. O monitor futuro não modifica
pesos automaticamente. Não foi demonstrada vantagem preditiva.

## Arquivos e verificações

`ui/lab-recommendation.js` contém o motor puro e o recorte compartilhado;
`ui/lab-worker.js` executa o cálculo; `index.html` adapta, exibe e salva;
`ui/lab-ui.js` recebe a combinação e integra o acompanhamento. Os espelhos em
`www/`, o service worker e o gerador de HTML único incluem o módulo novo.

- `node --test ferramentas/testar-recomendacao.mjs`: dados alterando a escolha,
  corte sem acesso ao futuro, contagem independente, determinismo, restrições,
  orçamento, conflitos, base escassa e dez formatos.
- `node ferramentas/testar-interface.mjs`: fluxo real de gerar/analisar/salvar,
  seis combinações de tema/largura, falha visível, dados alterados e navegação
  durante o cálculo, além das regressões anteriores.
- `node ferramentas/testar-distribuicao.mjs`: worker e recomendação sem rede,
  reabertura com conferência e HTML único com worker embutido.
- A CI repete as suítes, compila o Android, verifica os plugins e compara
  `index.html` e `lab-recommendation.js` dentro do APK com os fontes testados.

Versão Android 4.19.0, código 28. Instalação em aparelho físico não foi
executada nesta alteração.
