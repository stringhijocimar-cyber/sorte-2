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

Sem cadastro, sem login, sem anúncio, sem rastreador. O app não envia nada
para lugar nenhum e não pede nenhuma permissão do Android — nem internet.
Tudo é guardado no seu aparelho, e funciona inteiro em modo avião.

Os resultados dos concursos são digitados por você a partir da publicação
oficial da Caixa. O app não busca resultado sozinho e não inventa resultado.

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
| Criptografia em trânsito | Não se aplica — não há trânsito |
| Exclusão de dados | O usuário desinstala o app; nada fica em servidor |

Isto é verificável: o APK declara **zero permissões**, inclusive sem
`INTERNET`. Não há como enviar dado nenhum.

## Novidades desta versão (1.1.0 — versionCode 2)

Campo "O que há de novo" da Play Store, limite de 500 caracteres. Este texto
tem 463:

```
Volante de papel: marque as dezenas como na lotérica e confira o resultado
sobre a própria cartela.

Escolha manual, teimosinha e histórico de resultados.

Conferência automática: novos concursos conferem seus jogos sozinhos e avisam.

Aprendizado por modalidade: treina um modelo em cada loteria e mostra, fora da
amostra, se ele aprendeu algo. Com sorteios honestos, não aprende — e o app diz
isso, porque é a verdade.

Nenhum método aumenta a chance de acerto.
```

**Não altere a última linha.** Ela é o ponto em que a ficha da loja deixa de
poder ser lida como promessa, e é o que diferencia este app dos que prometem
número quente.

## Antes de enviar

* `versionCode` **precisa** subir a cada envio. Está em 2; o 1 foi gasto pelo
  APK 1.0.0 publicado em julho (removido do repositório, mas o código de versão
  continua gasto na loja). Enviar um código repetido é recusado pela Play Store.
* Sincronize o `www/` e reconstrua: veja `APK.md`.
* As capturas em `capturas/` são geradas pela bateria de interface e já mostram
  a versão nova — mas confira o tamanho exigido pela loja antes de subir.

## Classificação indicativa

Ao responder o questionário da Play Store, declare o conteúdo relacionado a
loteria com honestidade. Se a loja atribuir classificação etária maior por
causa disso, **aceite**. Não reformule a descrição para contornar.

## Aviso obrigatório na ficha

Se a loja pedir declaração sobre jogos de azar com dinheiro real: o app
**não** permite apostar, não movimenta dinheiro, não tem carteira, saldo,
depósito, saque nem link para casa de apostas.
