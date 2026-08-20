import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const wwwIndexPath = path.join(root, 'www', 'index.html');
const cssSrc = path.join(root, 'ui', 'lotolab-ui-polish-v4-1.css');
const cssDst = path.join(root, 'www', 'ui', 'lotolab-ui-polish-v4-1.css');
const swPath = path.join(root, 'sw.js');
const wwwSwPath = path.join(root, 'www', 'sw.js');

if (!fs.existsSync(indexPath)) throw new Error('index.html não encontrado');
if (!fs.existsSync(cssSrc)) throw new Error('CSS de polish não encontrado');
if (!fs.existsSync(swPath)) throw new Error('sw.js não encontrado');

/* A V4 tem uma trava visual explícita para o botão de menu em 40 px.
   O polish aumenta outros alvos de toque, mas preserva essa dimensão canônica. */
let polish = fs.readFileSync(cssSrc, 'utf8');
const grupo42 = `.menu,.sino,.voltar,.acao-tela,.back,.filter-btn{\n  min-width:42px!important;\n  min-height:42px!important;\n}`;
const grupoCorrigido = `.menu{\n  min-width:40px!important;\n  min-height:40px!important;\n  width:40px!important;\n  height:40px!important;\n}\n.sino,.voltar,.acao-tela,.back,.filter-btn{\n  min-width:42px!important;\n  min-height:42px!important;\n}`;
if (polish.includes(grupo42)) polish = polish.replace(grupo42, grupoCorrigido);
else if (!polish.includes('.menu{\n  min-width:40px!important;')) {
  throw new Error('regra do botão de menu não encontrada no CSS V4.1');
}
fs.writeFileSync(cssSrc, polish);

const polishLink = '<link rel="stylesheet" href="ui/lotolab-ui-polish-v4-1.css?v=4.1.0" data-lotolab-ui-polish="4.1.0">';

let html = fs.readFileSync(indexPath, 'utf8');
const oldPolish = /\n?<link rel="stylesheet" href="ui\/lotolab-ui-polish-v4-1\.css\?v=[^"]+" data-lotolab-ui-polish="[^"]+">/g;
html = html.replace(oldPolish, '');

const baseCss = /(<link rel="stylesheet" href="ui\/sorte2-ui-final\.css\?v=[^"]+"[^>]*>)/;
if (!baseCss.test(html)) {
  throw new Error('link da camada visual V4 não encontrado no index.html');
}
html = html.replace(baseCss, `$1\n${polishLink}`);

fs.writeFileSync(indexPath, html);
fs.mkdirSync(path.dirname(wwwIndexPath), { recursive: true });
fs.writeFileSync(wwwIndexPath, html);
fs.mkdirSync(path.dirname(cssDst), { recursive: true });
fs.copyFileSync(cssSrc, cssDst);

let sw = fs.readFileSync(swPath, 'utf8');
const versionMatch = sw.match(/const VERSAO = "(\d+)";/);
if (!versionMatch) throw new Error('VERSAO do service worker não encontrada');
const currentVersion = Number(versionMatch[1]);
const targetVersion = 10;
const nextVersion = Math.max(currentVersion, targetVersion);
sw = sw.replace(/const VERSAO = "\d+";/, `const VERSAO = "${nextVersion}";`);

const polishAsset = '"./ui/lotolab-ui-polish-v4-1.css"';
if (!sw.includes(polishAsset)) {
  sw = sw.replace(
    /(const CASCA = \[[^\]]*)\]/,
    (full, start) => `${start}, ${polishAsset}]`
  );
}

fs.writeFileSync(swPath, sw);
fs.writeFileSync(wwwSwPath, sw);

console.log(`UI polish V4.1 aplicado; service worker ${currentVersion} -> ${nextVersion}.`);
