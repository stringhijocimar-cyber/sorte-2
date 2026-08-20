/**
 * Gera a edição LotoLab Estatístico a partir da edição completa.
 *
 *     node ferramentas/gerar-edicao-estatistica.mjs
 *
 * O que ela é: o mesmo app, o mesmo motor, o mesmo visual V4.2 — sem os fluxos
 * que existem para operar aposta. Saem dinheiro, prêmio, custo, retorno e
 * qualquer anúncio de "faixa de prêmio". Fica tudo o que é medida: histórico,
 * estatística descritiva, Monte Carlo, backtesting de desempenho, comparação
 * com o acaso, independência, o motor de pesquisa e a conferência de conjuntos
 * contra concursos passados.
 *
 * REMOÇÃO DE VERDADE, e não CSS. O que este gerador tira não chega ao arquivo
 * publicado: não está escondido, não está atrás de display:none, não volta com
 * o inspetor aberto. É a diferença entre uma edição e um tema.
 *
 * Como funciona: a fonte marca esses trechos com /*<aposta>* / e /*</aposta>* /.
 * Dentro de template literal os marcadores são escritos ${...""}, que rende
 * string vazia, então a edição completa não muda em nada por carregá-los.
 *
 * Por que marcador em vez de dois arquivos: um fork do index.html divergiria
 * na primeira correção que alguém fizesse só de um lado. Com uma fonte só, a
 * correção chega nas duas edições — e o teste cobra que a edição estatística
 * de fato não contenha a superfície financeira.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTANDO_DIRETO = process.argv[1] &&
  process.argv[1].endsWith("gerar-edicao-estatistica.mjs");

/* Um marcador pode aparecer nu (JavaScript comum) ou embrulhado em ${...""}
   (dentro de template literal). O embrulho tem de sair junto: deixá-lo para
   trás produziria `${""}` órfão e, pior, um `${` sem fechamento. */
const ABRE  = String.raw`(?:\$\{)?/\*<aposta>\*/(?:""\})?`;
const FECHA = String.raw`(?:\$\{)?/\*</aposta>\*/(?:""\})?`;
const BLOCO = new RegExp(`${ABRE}[\\s\\S]*?${FECHA}`, "g");

export function removerAposta(html){
  const antes = (html.match(/\/\*<aposta>\*\//g) || []).length;
  const depois = html.replace(BLOCO, "");
  const sobrou = (depois.match(/\/\*<\/?aposta>\*\//g) || []).length;
  return { html: depois, blocos: antes, sobrou };
}

/* A identidade muda porque a edição é outra. Quem abre precisa saber qual das
   duas tem na mão sem ter de procurar num menu. */
export function renomear(html){
  return html
    .replace("<title>LotoLab — Laboratório Estatístico</title>",
             "<title>LotoLab Estatístico — Laboratório de Loterias</title>")
    .replace("<b>LotoLab</b><span>Laboratório Estatístico</span>",
             "<b>LotoLab Estatístico</b><span>Laboratório de Loterias</span>")
    .replace('titulo:"LotoLab",', 'titulo:"LotoLab Estatístico",')
    /* A Teimosinha continua nesta edição — repetir um conjunto por vários
       concursos e medir o desempenho é análise, não aposta. O que sai é o
       acompanhamento de custo, então a descrição da tela precisa parar de
       prometer o que ela não faz mais aqui. Texto que sobrevive à remoção do
       recurso é como a pessoa descobre que o app mente. */
    .replace(
      'sub:"Repete o mesmo jogo por vários concursos seguidos. O app acompanha o custo total e confere cada concurso sozinho."',
      'sub:"Repete o mesmo conjunto por vários concursos seguidos e confere cada um sozinho, medindo o desempenho contra o acaso."');
}

/* O guarda olha só o que pode chegar aos olhos de quem usa: comentário de
   código e nome de classe CSS não são interface. Sem tirar os comentários
   antes, a trava acusaria os próprios textos que explicam por que aquele
   trecho foi removido — e a saída correta seria reprovada. */
export function semComentarios(html){
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

function principal(){
  const origem = join(RAIZ, "index.html");
  if(!existsSync(origem)){ console.error("index.html não encontrado"); process.exit(1); }

  const bruto = readFileSync(origem, "utf8");
  const { html: semAposta, blocos, sobrou } = removerAposta(bruto);

  if(blocos === 0){
    console.error("Nenhum bloco marcado encontrado. A fonte perdeu os marcadores?");
    process.exit(1);
  }
  if(sobrou !== 0){
    console.error(`Sobraram ${sobrou} marcadores soltos — par desemparelhado na fonte.`);
    process.exit(1);
  }

  const html = renomear(semAposta);

  /* Trava de saída: se qualquer uma destas aparecer no arquivo publicado, a
     remoção não aconteceu e a edição estaria mentindo sobre o que é. */
  const proibidos = [
    [/\bbrl\s*\(/, "formatação de moeda"],
    [/faixa de prêmio/i, "anúncio de faixa de prêmio"],
    [/prêmio esperado/i, "prêmio esperado"],
    [/custo total/i, "custo total"],
    [/teria custado/i, "custo do retrospecto"],
    [/\bROI\b/, "retorno sobre investimento"],
    [/Prêmios hoje/i, "contador de prêmios"],
    [/foi premiado|jogos premiados/i, "aviso de prêmio"],
  ];
  const visivel = semComentarios(html);
  const achados = proibidos.filter(([re]) => re.test(visivel)).map(([, nome]) => nome);
  if(achados.length){
    console.error("A edição estatística ainda expõe: " + achados.join(", "));
    process.exit(1);
  }

  /* A saída AINDA É JAVASCRIPT? Esta trava existe porque a primeira geração
     produziu um arquivo quebrado e só a bateria do motor percebeu.

     O bloco removido era o operando de uma soma dentro de um ternário:

         ? `...automaticamente` +
           (r.premios ? ", N em faixa de prêmio." : "...")
         : "Nenhum jogo salvo cobria esses concursos.";

     Tirando só o operando, sobrou um "+" pendurado antes dos dois-pontos e o
     arquivo inteiro deixou de compilar. Recortar texto de dentro de código não
     é recortar texto: o pedaço tem vizinhos gramaticais, e o operador precisa
     sair junto com aquilo que ele soma.

     Compilar aqui transforma isso num erro do gerador, com nome e linha, em
     vez de um erro que aparece três passos depois com outra cara. */
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!script){ console.error("não achei o <script> do app na saída"); process.exit(1); }
  try {
    new vm.Script(script[1], {filename:"edicao-estatistica.js"});
  } catch (e) {
    console.error("A remoção quebrou o JavaScript da edição: " + e.message);
    console.error("Algum bloco marcado tem vizinho gramatical (operador, vírgula, ternário)");
    console.error("que precisa entrar no bloco junto.");
    process.exit(1);
  }

  writeFileSync(origem, html, "utf8");
  const www = join(RAIZ, "www");
  if(!existsSync(www)) mkdirSync(www, {recursive:true});
  writeFileSync(join(www, "index.html"), html, "utf8");

  /* O manifesto é o nome que aparece na tela inicial de quem instala. */
  for(const m of [join(RAIZ, "manifest.webmanifest"), join(www, "manifest.webmanifest")]){
    if(!existsSync(m)) continue;
    const j = JSON.parse(readFileSync(m, "utf8"));
    j.name = "LotoLab Estatístico — laboratório de loterias";
    j.short_name = "LotoLab Estat.";
    j.description = "Laboratório estatístico das loterias brasileiras: histórico, " +
      "análise descritiva, simulação e comparação com o acaso. Não opera apostas.";
    writeFileSync(m, JSON.stringify(j, null, 2) + "\n", "utf8");
  }

  const cap = join(RAIZ, "capacitor.config.json");
  if(existsSync(cap)){
    const j = JSON.parse(readFileSync(cap, "utf8"));
    j.appName = "LotoLab Estatístico";
    writeFileSync(cap, JSON.stringify(j, null, 2) + "\n", "utf8");
  }

  console.log(`Edição estatística gerada: ${blocos} blocos de aposta removidos, ` +
    `${(html.length/1024).toFixed(0)} KB.`);
}

if(EXECUTANDO_DIRETO) principal();
