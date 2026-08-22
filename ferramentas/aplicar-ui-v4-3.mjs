import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const wwwIndexPath = path.join(root, 'www', 'index.html');
const cssPath = path.join(root, 'ui', 'lotolab-ui-v4-3.css');
const wwwCssPath = path.join(root, 'www', 'ui', 'lotolab-ui-v4-3.css');
const swPath = path.join(root, 'sw.js');
const wwwSwPath = path.join(root, 'www', 'sw.js');

for (const p of [indexPath, cssPath, swPath]) {
  if (!fs.existsSync(p)) throw new Error(`arquivo obrigatório ausente: ${p}`);
}

const link = '<link rel="stylesheet" href="ui/lotolab-ui-v4-3.css?v=4.3.0" data-lotolab-ui="4.3.0">';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/\n?<link rel="stylesheet" href="ui\/lotolab-ui-v4-3\.css\?v=[^"]+" data-lotolab-ui="[^"]+">/g, '');
const base = /(<link rel="stylesheet" href="ui\/sorte2-ui-final\.css\?v=[^"]+"[^>]*>)/;
if (!base.test(html)) throw new Error('folha visual base não encontrada');
html = html.replace(base, `$1\n${link}`);

fs.writeFileSync(indexPath, html);
fs.mkdirSync(path.dirname(wwwIndexPath), { recursive: true });
fs.writeFileSync(wwwIndexPath, html);
fs.mkdirSync(path.dirname(wwwCssPath), { recursive: true });
fs.copyFileSync(cssPath, wwwCssPath);

let sw = fs.readFileSync(swPath, 'utf8');
const versao = sw.match(/const VERSAO = "(\d+)";/);
if (!versao) throw new Error('VERSAO do service worker não encontrada');
const atual = Number(versao[1]);
const alvo = Math.max(atual, 11);
sw = sw.replace(/const VERSAO = "\d+";/, `const VERSAO = "${alvo}";`);
const asset = '"./ui/lotolab-ui-v4-3.css"';
if (!sw.includes(asset)) {
  sw = sw.replace(/(const CASCA = \[[^\]]*)\]/, (all, inicio) => `${inicio}, ${asset}]`);
}
fs.writeFileSync(swPath, sw);
fs.writeFileSync(wwwSwPath, sw);

console.log(`LotoLab V4.3 integrada. Service worker ${atual} -> ${alvo}.`);
// Integration trigger: approved visual V4.3.
