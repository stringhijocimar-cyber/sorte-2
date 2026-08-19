# LotoLab 4.0.0 — notas da versão

**Versão:** 4.0.0 · **Rótulo:** V4 · **Android:** versionCode 4 / versionName 4.0.0
**Fonte da verdade:** branch `main` · **Manifesto:** `RELEASE_MANIFEST_V4.json`

A V4 é a virada de identidade: o app passou a se chamar **LotoLab**, o tema
escuro virou o padrão e a camada visual do mockup entrou por uma folha de
estilo própria, sem tocar no motor estatístico.

---

## O que mudou para quem usa

### Nome e aparência
O app se chama LotoLab. O nome aparece no título da janela, no cabeçalho, no
manifesto e no ícone da tela inicial — todos conferidos por teste, para que a
troca não fique pela metade em alguma tela.

O tema escuro passou a ser o padrão, e a cor de fundo é a mesma em todos os
lugares onde ela aparece: no app, na barra do navegador, na tela de partida do
app instalado e na splash do Android. Antes havia divergência entre eles, e o
resultado era um salto de cor meio segundo depois de abrir.

### Camada visual do mockup
A fidelidade ao mockup entrou como folha de estilo externa
(`ui/sorte2-ui-final.css`, 145 regras) em vez de reescrita do HTML. A escolha
tem consequência prática: a camada pode ser conferida, desligada e comparada
isoladamente, e nenhuma linha do motor foi tocada para acomodá-la.

### O que NÃO mudou
O motor estatístico está intacto. A referência dourada de `caracteristicas()` —
1760 valores em 176 jogos, gravada antes da otimização de desempenho — continua
batendo dígito por dígito. Nenhum método de geração, nenhum cálculo de
desempenho contra o acaso e nenhuma regra de conferência foi alterado nesta
versão.

E segue valendo o que sempre valeu: **o app não aumenta a chance de acertar.**
Ele monta jogos, guarda no aparelho, confere contra os concursos e mostra o
desempenho comparado ao acaso. Quando o desempenho não se separa do acaso, é
isso que ele mostra.

---

## Correções desta entrega

- **Cor do manifesto.** O app abria em `#061521` e a tela de partida do app
  instalado seguia em `#061522`. Como o manifesto é servido do cache sem
  revalidação, a divergência sobreviveria a qualquer atualização; por isso a
  versão do service worker subiu de 7 para 8, para que a correção chegue a quem
  já tem o app instalado.

- **Instalador de fidelidade visual.** Ele fixava a versão do service worker em
  `"7"` e, rodando de novo, desfazia em silêncio qualquer subida de versão
  posterior — inclusive as que existem para expulsar cache velho. Deixou de
  mexer nesse número. Também passou a normalizar a cor no manifesto, e não só
  no `colors.xml` do Android: era exatamente por essa fresta que o manifesto
  escapava.

- **Testes que passavam sem testar.** Três casos, todos conferidos ao contrário
  (quebrando o app de propósito para ver o teste falhar):
  - duas asserções de identidade aceitavam a marca antiga como resposta válida,
    ficando verdes no único caso que existiam para pegar;
  - a varredura da marca antiga e a checagem de "jogo de outra modalidade não
    aparece junto" usavam expressões regulares escritas dentro de um template
    literal, onde `\s` e `\b` viram letras comuns — as duas procuravam algo que
    não existe e passavam sempre. A segunda era anterior a esta auditoria.

- **Falso positivo no teste de erros de JavaScript.** O Chrome aborta sozinho a
  busca do ícone do manifesto em cerca de uma execução a cada três, e arquiva a
  mensagem fora do canal de rede. Medido: `icone.svg` responde 200 com
  `image/svg+xml` em toda tentativa. Só essa mensagem passou a ser ignorada;
  qualquer outro erro continua derrubando a bateria.

---

## Como esta versão foi verificada

| Bateria | Resultado |
|---|---|
| Motor (`testar-motor.mjs`) | 657/657 |
| Interface, Chrome de verdade (`testar-interface.mjs`) | 91/91, em três execuções seguidas |
| Atualizador de resultados (`testar-atualizador.mjs`) | 18/18 |
| XML do Android (`conferir-xml-android.py`) | 11 arquivos, todos bem-formados |
| Ícones (`conferir-icones.py`) | 34 conferências, nenhum problema |
| Referência dourada de `caracteristicas()` | idêntica |

Além das baterias, três verificações específicas da V4:

1. `index.html` e `www/index.html` são **idênticos byte a byte** — é o que o
   Capacitor empacota, e divergência ali significa app publicado diferente do
   testado.
2. A folha da V4 carrega com **HTTP 200**, tem 145 regras legíveis, e os valores
   computados no elemento vivo batem com o que ela pede. Desligada a folha, o
   fundo deixa de ser o da V4 — prova de que é ela que pinta, e não o CSS
   embutido.
3. O instalador de fidelidade roda sobre o `main` e **não muda nenhum arquivo**,
   o que é a prova mais forte disponível de que a V4 está integrada por inteiro,
   e não pela metade.

---

## Nota sobre o binário

Este repositório contém o **código-fonte** da 4.0.0, verificado. A geração e a
distribuição do APK não são feitas aqui. Nenhuma versão deste projeto foi
testada em aparelho real — a verificação é feita em Chrome headless e abrindo o
APK gerado para conferir o conteúdo.

## Nota sobre as tags

A tag mais recente do repositório, `v38-visual-final`, corresponde à **Visual
Final V3** e **não** deve ser usada como base para continuação. A fonte da
verdade da V4 é o branch `main`.
