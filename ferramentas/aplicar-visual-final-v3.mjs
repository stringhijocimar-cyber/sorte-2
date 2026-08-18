// LotoLab Visual Final V3 — deterministic CSS-only installer used by GitHub Actions.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const rootIndex = join(repo, "index.html");
const wwwIndex = join(repo, "www", "index.html");
const rootSw = join(repo, "sw.js");
const wwwSw = join(repo, "www", "sw.js");

function fail(message){
  console.error(`LOTO LAB VISUAL FINAL V3: ${message}`);
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

/* Idempotência: remove qualquer instalação anterior. A versão final não injeta
   JavaScript extra — o motor do app continua sendo o único script da página. */
html = html.replace(/\n?\s*<link[^>]+data-sorte2-visual-final="[^"]+"[^>]*>\s*/g,"\n");
html = html.replace(/\n?\s*<script[^>]+data-sorte2-visual-final="[^"]+"[^>]*><\/script>\s*/g,"\n");

const link = '<link rel="stylesheet" href="ui/sorte2-ui-final.css?v=3.0.0" data-sorte2-visual-final="3.0.0">';
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
  sw=sw.replace(/const VERSAO = "\d+";/,'const VERSAO = "6";');
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

console.log("LOTO LAB VISUAL FINAL V3: aplicado com sucesso (CSS-only)");