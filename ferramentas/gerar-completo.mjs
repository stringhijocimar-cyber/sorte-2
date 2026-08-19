/**
 * Gera lotolab-completo.html: o app inteiro com o histórico embutido.
 *
 * Existe porque toda outra via de entrega falhou para o usuário: o APK exige
 * compilar, a página servida exige um servidor com CORS, e uma cópia baixada
 * por terceiro congela na versão do dia em que foi baixada.
 *
 * Este arquivo não depende de nada. Baixa e abre — funciona de file://, sem
 * rede, sem instalar. É a versão que sempre dá para conferir.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(RAIZ, "index.html"), "utf8");

//: Concursos por modalidade no arquivo único.
const TETO_EMBUTIDO = 600;

const dados = {};
for (const f of readdirSync(join(RAIZ, "dados")).filter(x => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(RAIZ, "dados", f), "utf8"));
  /* Só os mais recentes. Não é economia gratuita: com o histórico inteiro o
     arquivo passa de 2,4 MB e o navegador engasga ao interpretar o JSON de uma
     linha só — medido, trava; com este teto, carrega limpo.

     E o corte não custa análise: o aprendizado precisa de 60 concursos, o
     perfil do jogo de 20, e a estatística fica mais fiel ao presente com o
     recorte recente do que com sorteios dos anos 1990. Quem quiser tudo puxa
     em Conferir › Resultados, que traz o histórico completo do repositório. */
  dados[d.modalidade] = d.concursos.slice(-TETO_EMBUTIDO);
}

const total = Object.values(dados).reduce((a, c) => a + c.length, 0);

/* Injetado logo depois de "use strict": o app encontra HISTORICO_EMBUTIDO já
   definido quando iniciar, e o usa em vez de buscar na rede. */
const injecao = `
/* ---- histórico embutido pelo ferramentas/gerar-completo.mjs ----
   ${total} concursos (os ${TETO_EMBUTIDO} mais recentes de cada
   modalidade). Este arquivo funciona sem rede e sem servidor: é a via
   de entrega que não depende de compilar, hospedar ou de terceiro nenhum. */
const HISTORICO_EMBUTIDO = ${JSON.stringify(dados)};
`;

html = html.replace('"use strict";', '"use strict";\n' + injecao);

/* O carregamento inicial passa a preferir o embutido. Sem isto o arquivo teria
   os dados e não os usaria. */
html = html.replace(
  '  S.resultados = Guardar.ler("resultados", []);',
  `  S.resultados = Guardar.ler("resultados", []);
  /* Semeia a partir do histórico embutido o que ainda não estiver guardado.
     Não sobrescreve o que o usuário já tem: concurso já conhecido fica como
     está, porque pode ter rateio que o embutido não traz. */
  if(typeof HISTORICO_EMBUTIDO !== "undefined"){
    const conhecidos = new Set(S.resultados.map(r => r.modalidade + ":" + r.concurso));
    Object.entries(HISTORICO_EMBUTIDO).forEach(([mod, lista]) =>
      lista.forEach(r => {
        if(!conhecidos.has(mod + ":" + r.concurso))
          S.resultados.push(Object.assign({}, r, {modalidade: mod}));
      }));
    Guardar.gravar("resultados", S.resultados);
  }`);

/* A camada visual da V4 entrou no app como folha EXTERNA. Aqui ela precisa
   virar folha embutida, senão este arquivo — que existe justamente para
   funcionar sozinho, de file://, sem nada ao lado — abriria sem o visual da
   V4: o <link> apontaria para uma pasta ui/ que não viajou junto.

   Foi assim que a V4 deixou de chegar nesta via de entrega sem ninguém
   perceber: a virada visual mexeu no index.html e o gerador continuou
   copiando o <link> como texto. */
const folha = join(RAIZ, "ui", "sorte2-ui-final.css");
if (!existsSync(folha)) {
  console.error("ui/sorte2-ui-final.css não encontrado: o arquivo único sairia sem o visual da V4.");
  process.exit(1);
}
const css = readFileSync(folha, "utf8");
const antes = html;
html = html.replace(/<link rel="stylesheet" href="ui\/sorte2-ui-final\.css[^"]*"[^>]*>/,
  `<style data-sorte2-visual-final="embutido">\n${css}\n</style>`);
if (html === antes) {
  console.error("não achei o <link> da folha da V4 no index.html — o arquivo único sairia sem o visual.");
  process.exit(1);
}

/* Sem service worker neste arquivo: de file:// ele não registra, e num
   servidor ele reintroduziria justamente o cache que congelou o app. */
html = html.replace(/if\("serviceWorker" in navigator\)\{[\s\S]*?\n  \}/,
  "/* service worker removido nesta versão: ver gerar-completo.mjs */");

writeFileSync(join(RAIZ, "lotolab-completo.html"), html, "utf8");
console.log(`lotolab-completo.html: ${(html.length/1048576).toFixed(2)} MB, ` +
  `${total} concursos embutidos`);

/* O .zip existe por um motivo bobo e decisivo: o GitHub serve .html como
   text/plain, e o navegador EXIBE o código em vez de baixar. O usuário tentou e
   viu código na tela. Um .zip baixa sempre, e o Android descompacta sozinho.

   Gerado por ferramentas/empacotar.sh, que roda depois deste script — mantido
   fora daqui porque Node não tem compactação zip na biblioteca padrão e não
   vale uma dependência só para isso. */
