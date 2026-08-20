// LotoLab Mockup Fidelity V4 — deterministic CSS-only installer used by GitHub Actions.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const rootIndex = join(repo, "index.html");
const wwwIndex = join(repo, "www", "index.html");
const rootSw = join(repo, "sw.js");
const wwwSw = join(repo, "www", "sw.js");

function fail(message){
  console.error(`LOTOLAB MOCKUP FIDELITY V4: ${message}`);
  process.exit(1);
}

if(!existsSync(rootIndex)) fail("index.html não encontrado");
if(!existsSync(join(repo,"www"))) fail("www/ não encontrado");

let html = readFileSync(rootIndex,"utf8");
for(const marker of ["T.inicio = () =>","T.resultados = () =>","pintarAvisos","geracao-linha","hero-card"]){
  if(!html.includes(marker)) fail(`marcador ausente: ${marker}`);
}

html = html.replace(/<html lang="pt-BR" data-tema="(?:claro|escuro)">/, '<html lang="pt-BR" data-tema="escuro">');
html = html.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#061521">');
html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>LotoLab — Laboratório Estatístico</title>');

// A marca visível também precisa ser LotoLab. Antes só o <title> tinha mudado.
html = html.replace('<b>Sorte 2</b><span>Laboratório Estatístico</span>', '<b>LotoLab</b><span>Laboratório Estatístico</span>');
html = html.replace('titulo:"Sorte 2",\n      sub:"Laboratório Estatístico. O motor de pesquisa, seus jogos e os concursos."',
                    'titulo:"LotoLab",\n      sub:"Laboratório Estatístico. O motor de pesquisa, seus jogos e os concursos."');

/* Idempotência: uma única folha visual externa e nenhum JavaScript visual. */
html = html.replace(/\n?\s*<link[^>]+data-sorte2-visual-final="[^"]+"[^>]*>\s*/g,"\n");
html = html.replace(/\n?\s*<script[^>]+data-sorte2-visual-final="[^"]+"[^>]*><\/script>\s*/g,"\n");

/* A versão vem do arquivo VERSION, e não escrita aqui dentro.
   Com '4.0.0' cravado, o rótulo da folha ficou parado enquanto o produto
   chegava à 4.2.0: o app anunciava uma camada visual de duas versões atrás.
   Pior, o parâmetro ?v= é o que faz o navegador buscar a folha nova em vez da
   do cache — um número que não muda quando o CSS muda entrega estilo velho a
   quem já visitou. */
const versaoDoProduto = readFileSync(join(repo, "VERSION"), "utf8").trim();
const link = `<link rel="stylesheet" href="ui/sorte2-ui-final.css?v=${versaoDoProduto}" data-sorte2-visual-final="${versaoDoProduto}">`;
if(!html.includes("</head>")) fail("</head> ausente");
html = html.replace("</head>", `${link}\n</head>`);

writeFileSync(rootIndex,html);
writeFileSync(wwwIndex,html);

mkdirSync(join(repo,"www","ui"),{recursive:true});
for(const name of ["sorte2-ui-final.css","brain-network.svg"]){
  const src=join(repo,"ui",name), dst=join(repo,"www","ui",name);
  if(!existsSync(src)) fail(`asset ausente: ui/${name}`);
  copyFileSync(src,dst);
}

if(existsSync(rootSw)){
  let sw=readFileSync(rootSw,"utf8");
  /* NÃO mexe em VERSAO. Esta linha já fixava "7" e, com isso, desfazia em
     silêncio qualquer subida de versão feita depois — inclusive a que existe
     justamente para expulsar cache velho do aparelho de quem já instalou.
     Integrar CSS e versionar cache são duas decisões; só a primeira é deste
     instalador. */
  sw=sw.replace(/,\s*"\.\/ui\/sorte2-ui-final\.js"/g,"");
  if(!sw.includes("./ui/sorte2-ui-final.css")){
    sw=sw.replace(/const CASCA = \[([^\]]*)\];/,(all,inside)=>{
      const clean=inside.trim().replace(/,\s*$/,'');
      return `const CASCA = [${clean}, "./ui/sorte2-ui-final.css", "./ui/brain-network.svg"];`;
    });
  }
  writeFileSync(rootSw,sw);
  writeFileSync(wwwSw,sw);
}

const colors=join(repo,"android","app","src","main","res","values","colors.xml");
if(existsSync(colors)){
  let xml=readFileSync(colors,"utf8");
  xml=xml.replace(/#061522/g,"#061521");
  writeFileSync(colors,xml);
}

/* O manifesto também carrega a cor, e ficou de fora quando a V4 passou: o app
   já abria no tom novo enquanto a tela de partida do app instalado seguia no
   antigo. Normalizar num lugar só e esquecer o outro é como a divergência
   nasce, então os dois saem daqui juntos. */
for(const manifesto of [join(repo,"manifest.webmanifest"), join(repo,"www","manifest.webmanifest")]){
  if(!existsSync(manifesto)) continue;
  writeFileSync(manifesto, readFileSync(manifesto,"utf8").replace(/#061522/g,"#061521"));
}

console.log("LOTOLAB MOCKUP FIDELITY V4: aplicado com sucesso (CSS-only)");