import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const wwwIndexPath = path.join(root, 'www', 'index.html');
const cssSrc = path.join(root, 'ui', 'lotolab-ui-polish-v4-2.css');
const cssDst = path.join(root, 'www', 'ui', 'lotolab-ui-polish-v4-2.css');
const swPath = path.join(root, 'sw.js');
const wwwSwPath = path.join(root, 'www', 'sw.js');

for (const p of [indexPath, cssSrc, swPath]) {
  if (!fs.existsSync(p)) throw new Error(`arquivo obrigatório ausente: ${p}`);
}

const link = '<link rel="stylesheet" href="ui/lotolab-ui-polish-v4-2.css?v=4.2.0" data-lotolab-ui-polish="4.2.0">';
let html = fs.readFileSync(indexPath, 'utf8');

/* Remove camadas de polish anteriores para existir uma única fonte de acabamento. */
html = html.replace(/\n?<link rel="stylesheet" href="ui\/lotolab-ui-polish-v4-[12]\.css\?v=[^"]+" data-lotolab-ui-polish="[^"]+">/g, '');

const base = /(<link rel="stylesheet" href="ui\/sorte2-ui-final\.css\?v=[^"]+"[^>]*>)/;
if (!base.test(html)) throw new Error('folha visual base V4 não encontrada no index.html');
html = html.replace(base, `$1\n${link}`);

fs.writeFileSync(indexPath, html);
fs.mkdirSync(path.dirname(wwwIndexPath), { recursive: true });
fs.writeFileSync(wwwIndexPath, html);
fs.mkdirSync(path.dirname(cssDst), { recursive: true });
fs.copyFileSync(cssSrc, cssDst);

let sw = fs.readFileSync(swPath, 'utf8');
const m = sw.match(/const VERSAO = "(\d+)";/);
if (!m) throw new Error('VERSAO do service worker não encontrada');
const atual = Number(m[1]);
const alvo = Math.max(atual, 10);
sw = sw.replace(/const VERSAO = "\d+";/, `const VERSAO = "${alvo}";`);

const asset = '"./ui/lotolab-ui-polish-v4-2.css"';
if (!sw.includes(asset)) {
  sw = sw.replace(/(const CASCA = \[[^\]]*)\]/, (all, inicio) => `${inicio}, ${asset}]`);
}

fs.writeFileSync(swPath, sw);
fs.writeFileSync(wwwSwPath, sw);

console.log(`LotoLab UI V4.2 integrada; service worker ${atual} -> ${alvo}.`);
