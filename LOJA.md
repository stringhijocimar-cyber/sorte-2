# Texto para a Play Store

Escrito a partir da aba **Entender**, como pedido. Descreve o que o app faz
sem prometer o que ele não faz.

---

## Título

```
LotoLab — jogos e conferência
```

## Descrição curta (até 80 caracteres)

```
Monta jogos das loterias, confere concursos e compara seu desempenho ao acaso.
```

(78 caracteres)

## Descrição completa

```
LotoLab monta jogos das loterias brasileiras, guarda no seu aparelho e confere
contra os concursos — mostrando sempre como o seu desempenho se compara ao de
uma escolha aleatória.

O QUE O APP NÃO FAZ

Ele não aumenta a sua chance de acertar. Nenhum app faz isso. Em um sorteio
honesto cada concurso é independente do anterior: as bolas não têm memória, e
o histórico não carrega informação sobre o próximo resultado. Na Mega-Sena, a
chance de uma aposta simples é de 1 em 50.063.860, e esse número não se move
com frequência, atraso, primos ou inteligência artificial.

Aqui não há previsão, número quente, número frio nem sugestão de jogo.

MODALIDADES

Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Dia de Sorte, Timemania
e +Milionária.

QUATRO MÉTODOS DE MONTAGEM

Sorteio uniforme — cada combinação com a mesma chance. É a referência, e é tão
boa quanto qualquer outra.

Otimizado para rateio — evita padrões que muita gente marca: datas de
nascimento, sequências, desenhos no volante. Não muda a chance de acertar;
muda quanta gente dividiria o prêmio com você se acertasse.

Cobertura espalhada — distribui os jogos pelo volante para que se repitam
pouco entre si.

Fechamento com garantia verificada — a partir das dezenas que você marcar,
monta jogos com piso de acertos comprovado por enumeração. O app testa todos
os cenários e recusa mostrar qualquer garantia que não conseguiu provar.

CINCO ABAS

Gerar — monta a quantidade de jogos que você escolher.
Meus jogos — guarda os lotes, permite copiar e apagar.
Conferir — você digita o resultado oficial; o app marca os acertos.
Placar — desempenho acumulado dos seus jogos contra a linha do acaso.
Entender — o que cada método faz de verdade, e uso responsável.

O PLACAR

A aba mais honesta do app. Ela compara os seus acertos reais com o que uma
escolha aleatória produziria, inclusive quando o resultado é desfavorável a
você. Se algum método tivesse vantagem real, a diferença cresceria de forma
consistente conforme os concursos passam. O que se observa, com amostra
suficiente, é oscilação em torno de zero.

SEUS DADOS FICAM COM VOCÊ

Sem cadastro, sem login, sem anúncio, sem rastreador. Seus jogos ficam no seu
aparelho e não são enviados para lugar nenhum.

O app pede uma única permissão: internet. Ela serve para um botão opcional na
aba Conferir, que busca as dezenas de um concurso já sorteado no serviço
público de loterias da Caixa. Nessa consulta vai só a modalidade e o número do
concurso — nenhum jogo seu, nenhum identificador.

Você pode nunca tocar nesse botão: digitando o resultado à mão, o app funciona
inteiro em modo avião. O app não inventa resultado e não prevê sorteio futuro.

USO RESPONSÁVEL

Loteria é gasto de entretenimento, não investimento. Jogue apenas o que puder
perder sem falta nenhuma, e não tente compensar perdas anteriores.

Se o jogo deixou de ser diversão para você ou para alguém próximo, procure
apoio gratuito e confidencial:

Jogadores Anônimos — jogadoresanonimos.org.br
CVV — 188, ligação gratuita, 24 horas

O app monta jogos para você marcar no volante da lotérica. Ele não aposta por
ninguém, não movimenta dinheiro e não tem ligação com a Caixa Econômica
Federal.
```

## Categorização

| Campo | Valor |
|---|---|
| Categoria | **Ferramentas** (alternativa: Educação) |
| **Não** usar | Jogos, Cassino, Jogos de azar |
| Tags | loteria, conferência, estatística, ferramentas |

## Ficha de segurança de dados

| Pergunta | Resposta |
|---|---|
| Coleta algum dado? | **Não** |
| Compartilha algum dado? | **Não** |
| Dados sensíveis? | **Nenhum** |
| Criptografia em trânsito | **Sim** — a consulta à Caixa é HTTPS |
| Exclusão de dados | O usuário desinstala o app; nada fica em servidor |

O APK declara **uma única permissão**, `INTERNET`, usada apenas para a busca
opcional de resultado em `servicebus2.caixa.gov.br`. É permissão normal: não
gera diálogo em tempo de execução.

O que **sai** do aparelho nessa consulta: modalidade e número do concurso.
O que **não** sai: jogos, dezenas escolhidas, histórico de conferências,
identificador de aparelho ou de usuário. Não há servidor do LotoLab — a
requisição vai direto ao serviço público da Caixa. O app não registra login,
não possui conta e não tem como associar uma consulta a uma pessoa.

## Classificação indicativa

Ao responder o questionário da Play Store, declare o conteúdo relacionado a
loteria com honestidade. Se a loja atribuir classificação etária maior por
causa disso, **aceite**. Não reformule a descrição para contornar.

## Aviso obrigatório na ficha

Se a loja pedir declaração sobre jogos de azar com dinheiro real: o app
**não** permite apostar, não movimenta dinheiro, não tem carteira, saldo,
depósito, saque nem link para casa de apostas.
