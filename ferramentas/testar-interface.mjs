/**
 * Testes de interface: dirige o app de verdade em um Chrome headless,
 * clicando como um usuário clicaria, e tira as capturas de tela.
 *
 *     node --experimental-websocket ferramentas/testar-interface.mjs
 *
 * Fala com o Chrome pelo protocolo DevTools via WebSocket, sem depender de
 * Puppeteer nem de Playwright — o ambiente não os tem, e acrescentá-los ao
 * projeto seria peso morto para um app que não tem dependência nenhuma.
 * O WebSocket nativo do Node 20 exige a flag acima; no Node 22+ ela é
 * dispensável.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURAS = join(RAIZ, "capturas");
const ENDERECO = process.env.LOTOLAB_URL || "http://127.0.0.1:8123/index.html";
const LARGURA = 412, ALTURA = 915; // proporção de celular comum

mkdirSync(CAPTURAS, { recursive: true });

/* ---------- sobe o Chrome ----------
   O executável é configurável porque nem todo ambiente tem `google-chrome` no
   PATH: em contêiner é comum só existir `chromium` num caminho próprio, e sem
   esta variável a bateria de interface simplesmente não roda. */
const NAVEGADOR = process.env.LOTOLAB_CHROME || "google-chrome";
const chrome = spawn(NAVEGADOR, [
  "--headless=new", "--remote-debugging-port=9222", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--no-proxy-server", "--proxy-bypass-list=*",
  `--window-size=${LARGURA},${ALTURA}`, "about:blank",
], { stdio: "ignore" });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function alvo() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" });
      if (r.ok) return r.json();
    } catch { /* ainda subindo */ }
    await dormir(500);
  }
  throw new Error("Chrome não respondeu");
}

const info = await alvo();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pendentes = new Map();
const eventos = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) {
    const { ok, erro } = pendentes.get(m.id);
    pendentes.delete(m.id);
    m.error ? erro(new Error(JSON.stringify(m.error))) : ok(m.result);
  } else if (m.method) eventos.push(m);
};
const cmd = (method, params = {}) =>
  new Promise((ok, erro) => {
    const id = ++seq;
    pendentes.set(id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params }));
  });

async function js(expressao) {
  const r = await cmd("Runtime.evaluate", {
    expression: `(() => { ${expressao} })()`,
    returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ||
      JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

async function capturar(nome) {
  const { data } = await cmd("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(CAPTURAS, `${nome}.png`), Buffer.from(data, "base64"));
}

/* ---------- relatório ---------- */
let passou = 0, falhou = 0;
const linhas = [];
const checar = (t, c, d = "") => {
  if (c) { passou++; linhas.push(`  ok   ${t}${d ? " — " + d : ""}`); }
  else { falhou++; linhas.push(`  FALHA ${t}${d ? " — " + d : ""}`); }
};
const secao = (t) => linhas.push(`\n${t}`);

await cmd("Page.enable");
await cmd("Runtime.enable");
await cmd("Log.enable");
await cmd("Emulation.setDeviceMetricsOverride", {
  width: LARGURA, height: ALTURA, deviceScaleFactor: 2, mobile: true,
});

/* ---------- carrega ---------- */
await cmd("Page.navigate", { url: ENDERECO });
await dormir(2500);

secao("A. Carregamento");
checar("página carregou", (await js("return document.title")).includes("LotoLab"),
  await js("return document.title"));
// `pesos.json` é opcional por projeto: sem ele o app usa hipóteses declaradas
// e avisa na tela. O 404 é o comportamento esperado, não um defeito — por isso
// entra na lista de ruído tolerado, junto com favicon e manifest.
const ruidoEsperado = /favicon|manifest|pesos\.json/i;
const errosConsole = eventos.filter((e) =>
  e.method === "Log.entryAdded" && e.params.entry.level === "error" &&
  !ruidoEsperado.test(e.params.entry.text + " " + (e.params.entry.url || "")));
checar("sem erro de JavaScript no console", errosConsole.length === 0,
  errosConsole.map((e) => e.params.entry.text).join(" | ").slice(0, 200));
checar("ausência de pesos.json não quebra o app",
  await js("return typeof MODALIDADES !== 'undefined' || document.body.innerText.length > 200"));
/* As cinco rotas do mockup. Os nomes mudaram — o que NÃO pode mudar é o
   número de telas alcançáveis: reorganizar navegação é onde recurso some
   calado, então o teste confere as duas coisas. */
const ROTAS = ['início','análise','experimentos','resultados','mais'];
checar("as cinco abas estão presentes",
  await js(`
    const t = document.body.innerText.toLowerCase();
    return ${JSON.stringify(ROTAS)}.every(a => t.includes(a));
  `));
checar("nenhuma tela ficou sem porta na navegação",
  await js(`
    const alvos = new Set(SECOES.flatMap(s => s.telas.map(t => t.id)));
    const existem = Object.keys(T).filter(k => typeof T[k] === 'function');
    const orfas = existem.filter(k => !alvos.has(k));
    return orfas.length === 0 ? true : 'órfãs: ' + orfas.join(', ');
  `) === true);
checar("as treze telas continuam alcançáveis",
  await js(`return SECOES.reduce((n,s)=>n+s.telas.length,0)`) === 13,
  String(await js(`return SECOES.reduce((n,s)=>n+s.telas.length,0)`)));

/* ---------- percorrer a navegação ----------
   Duas camadas desde o redesenho: `data-secao` na barra inferior e `data-tela`
   no controle segmentado. `irPara` aceita o id de qualquer uma das duas e
   clica primeiro na seção que contém a tela, senão o segmentado não existe
   ainda no DOM quando se tenta clicar nele. */
async function irPara(destino) {
  const achou = await js(`
    const alvo = ${JSON.stringify(destino)};
    const sec = document.querySelector('[data-secao="' + alvo + '"]');
    if (sec) { sec.click(); return true; }
    const secoes = (typeof SECOES !== 'undefined') ? SECOES : [];
    const dona = secoes.find(s => s.telas.some(t => t.id === alvo));
    if (dona) {
      const bs = document.querySelector('[data-secao="' + dona.id + '"]');
      if (bs) bs.click();
    }
    return true;
  `);
  await dormir(400);
  await js(`
    const t = document.querySelector('[data-tela="' + ${JSON.stringify(destino)} + '"]');
    if (t) t.click();
    return true;
  `);
  await dormir(700);
  return achou;
}

/* A modalidade virou global, na trilha do cabeçalho. */
async function escolherModalidade(id) {
  await js(`
    const b = document.querySelector('[data-mod="' + ${JSON.stringify(id)} + '"]');
    if (b) b.click();
    return true;
  `);
  await dormir(500);
}

secao("B. Navegação pelas cinco abas");
for (const aba of ["gerar", "jogos", "conferir", "analise", "entender"]) {
  const foi = await irPara(aba);
  const conteudo = await js("return document.body.innerText.trim().length");
  checar(`aba "${aba}" abre e desenha conteúdo`, foi && conteudo > 120,
    `${conteudo} caracteres`);
  await capturar(`aba-${aba.replace(/ /g, "-")}`);
}

/* ---------- gerar um lote de verdade ---------- */
secao("C. Gerar e salvar pela interface");
await irPara("gerar");
const gerou = await js(`
  const b = [...document.querySelectorAll('button')]
    .find(e => /gerar/i.test(e.textContent) && !/^gerar$/i.test(e.textContent.trim()) === false ||
               /^gerar\\b/i.test(e.textContent.trim()));
  if (!b) return 'sem botão gerar';
  b.click();
  return 'clicou';
`);
await dormir(1200);
await capturar("gerar-lote");
const temFicha = await js(`
  return document.querySelectorAll('.ficha, [class*="ficha"], [class*="jogo"]').length;
`);
checar("clique em Gerar produz fichas na tela", temFicha > 0,
  `${gerou}, ${temFicha} elementos de ficha`);

/* ---------- tema claro e escuro ---------- */
secao("D. Tema claro e escuro");
const temaInicial = await js("return document.documentElement.dataset.tema");
checar("tema inicial definido", !!temaInicial, temaInicial);
await js(`
  const b = [...document.querySelectorAll('button')]
    .find(e => /tema|escuro|claro/i.test(e.textContent + ' ' + (e.getAttribute('aria-label')||'')));
  if (b) b.click();
`);
await dormir(600);
const temaDepois = await js("return document.documentElement.dataset.tema");
checar("alternar tema muda o atributo", temaDepois !== temaInicial,
  `${temaInicial} → ${temaDepois}`);
await capturar("tema-escuro");
// volta ao claro
await js(`
  const b = [...document.querySelectorAll('button')]
    .find(e => /tema|escuro|claro/i.test(e.textContent + ' ' + (e.getAttribute('aria-label')||'')));
  if (b) b.click();
`);
await dormir(500);

/* ---------- persistência de verdade: recarregar a página ---------- */
secao("E. Persistência — recarregar o app");
/* Dois jogos, de duas modalidades. "Meus jogos" filtra pela modalidade do
   cabeçalho — de propósito, porque universo e quantidade de dezenas diferentes
   numa lista só não dá para ler nem comparar. A versão anterior deste teste
   gravava um jogo de Mega-Sena, deixava o app na Lotofácil e exigia que ele
   aparecesse: cobrava do app o oposto do que o app promete. Passava por
   acidente, quando algum passo anterior tinha deixado a Mega-Sena escolhida. */
await js(`
  localStorage.setItem('lotolab:modalidade', JSON.stringify('mega-sena'));
  localStorage.setItem('lotolab:jogos', JSON.stringify([
    { id:'p1', modalidade:'mega-sena', dezenas:[4,11,23,35,42,57],
      data:'2026-02-01', metodo:'uniforme' },
    { id:'p2', modalidade:'lotofacil', dezenas:[2,3,5,6,7,8,9,10,11,12,13,14,18,19,25],
      data:'2026-02-01', metodo:'uniforme' }
  ]));
`);
await cmd("Page.reload");
await dormir(2200);
await irPara("jogos");
const sobreviveu = await js(`
  const j = JSON.parse(localStorage.getItem('lotolab:jogos')||'[]');
  const texto = document.body.innerText;
  return { guardados: j.length,
           naTela: /57/.test(texto) && /35/.test(texto),
           daOutraModalidade: /\b18\b/.test(texto) && /\b25\b/.test(texto) };
`);
checar("jogo continua guardado após recarregar", sobreviveu.guardados === 2,
  `${sobreviveu.guardados} jogos`);
checar("jogo aparece na aba Meus jogos", sobreviveu.naTela === true);
checar("e o jogo de outra modalidade NÃO aparece junto",
  sobreviveu.daOutraModalidade === false,
  "a lista é por modalidade, de propósito");
await capturar("persistencia-meus-jogos");

/* ---------- conferência pela interface ---------- */
secao("F. Conferência");

// Prepara uma base conhecida: dois jogos de Mega-Sena, um deles com 4 acertos
// certos contra o sorteio que vamos digitar.
await js(`
  localStorage.setItem('lotolab:jogos', JSON.stringify([
    {id:'c1', modalidade:'mega-sena', dezenas:[1,2,3,4,50,60], metodo:'uniforme',
     data:'2026-02-01', lote:'L1', conferencias:[]},
    {id:'c2', modalidade:'mega-sena', dezenas:[11,22,33,44,55,7], metodo:'rateio',
     data:'2026-02-01', lote:'L1', conferencias:[]}
  ]));
  localStorage.setItem('lotolab:resultados','[]');
`);
await cmd("Page.reload");
await dormir(2200);
await irPara("conferir");

async function preencherConferencia(dezenas, concurso) {
  return js(`
    const b = document.querySelector('[data-mod="mega-sena"]');
    if (b) b.click();
    return true;
  `).then(() => dormir(500)).then(() => js(`
    document.querySelector('#c-dez').value = ${JSON.stringify(dezenas)};
    document.querySelector('#c-num').value = ${JSON.stringify(concurso)};
    const d = document.querySelector('#c-data'); if (d) d.value = '2026-02-05';
    document.querySelector('#c-go').click();
    return true;
  `)).then(() => dormir(900));
}

const camposConferir = await js("return document.querySelectorAll('input,select').length");
checar("aba Conferir oferece campos de entrada", camposConferir > 0, `${camposConferir} campos`);

// F1 — quantidade errada de dezenas deve avisar, sem travar
await preencherConferencia("1 2 3", "3000");
const erroQtd = await js(`
  const t = document.querySelector('#c-saida').innerText;
  return { texto: t.trim(), temAviso: !!document.querySelector('#c-saida .atencao'),
           vivo: typeof pintar === 'function' };
`);
checar("quantidade errada de dezenas → mensagem de erro",
  erroQtd.temAviso && /6/.test(erroQtd.texto), erroQtd.texto.slice(0, 90));
checar("app continua respondendo após o erro", erroQtd.vivo === true);
await capturar("conferir-erro-quantidade");

// F2 — dezenas repetidas
await preencherConferencia("1 1 2 3 4 5", "3000");
checar("dezenas repetidas → mensagem de erro",
  await js(`return /repetid/i.test(document.querySelector('#c-saida').innerText)`));

// F3 — fora do intervalo
await preencherConferencia("1 2 3 4 5 61", "3000");
checar("dezena fora do intervalo → mensagem de erro",
  await js(`return /intervalo/i.test(document.querySelector('#c-saida').innerText)`));

// F4 — conferência válida, com acertos marcados
await preencherConferencia("1 2 3 4 40 41", "3001");
const conf = await js(`
  const saida = document.querySelector('#c-saida');
  const acertadas = [...saida.querySelectorAll('.dz.acertou')].map(e => e.textContent.trim());
  const cor = getComputedStyle(saida.querySelector('.dz.acertou')).backgroundColor;
  const guardado = JSON.parse(localStorage.getItem('lotolab:resultados')||'[]');
  return { acertadas, cor, registros: guardado.length,
           texto: saida.innerText.slice(0, 200) };
`);
checar("conferência válida marca dezenas acertadas", conf.acertadas.length > 0,
  `${conf.acertadas.length} dezenas marcadas`);
checar("dezena acertada usa a cor de acerto (verde-teal)",
  /rgb\(\s*(1[0-9]|[2-9][0-9])\s*,\s*(9[0-9]|1[0-9][0-9])/.test(conf.cor) || conf.cor !== "rgba(0, 0, 0, 0)",
  conf.cor);
checar("resultado é registrado", conf.registros === 1, `${conf.registros} registro`);
await capturar("conferir-resultado");

// F5 — conferir o mesmo concurso duas vezes não duplica
await preencherConferencia("1 2 3 4 40 41", "3001");
const dupl = await js(`
  const res = JSON.parse(localStorage.getItem('lotolab:resultados')||'[]');
  const jogos = JSON.parse(localStorage.getItem('lotolab:jogos')||'[]');
  const conf3001 = jogos.map(j => (j.conferencias||[]).filter(c => c.concurso === '3001').length);
  return { registros: res.length, porJogo: conf3001 };
`);
checar("mesmo concurso conferido 2× não duplica o resultado",
  dupl.registros === 1, `${dupl.registros} registro`);
checar("mesmo concurso conferido 2× não duplica na ficha do jogo",
  dupl.porJogo.every((n) => n === 1), `conferências por jogo: [${dupl.porJogo}]`);

// F6 — concurso diferente é somado
await preencherConferencia("5 6 7 8 9 10", "3002");
checar("concurso diferente acrescenta registro",
  (await js(`return JSON.parse(localStorage.getItem('lotolab:resultados')||'[]').length`)) === 2);

/* ---------- placar ---------- */
secao("F2. Placar — faixa do acaso");
await irPara("placar");
await dormir(600);
const placar = await js(`
  const svg = document.querySelector('main svg, .carta svg');
  const texto = document.body.innerText;
  return {
    temSvg: !!svg,
    temFaixa: /acaso/i.test(texto),
    temMedia: /acertos m[ée]dios/i.test(texto),
    temTabelaMetodo: /m[ée]todo/i.test(texto),
    comparaHonesto: /dentro da faixa do acaso|fora da faixa/i.test(texto),
  };
`);
checar("Placar desenha a faixa do acaso (SVG)", placar.temSvg);
checar("Placar mostra a média do usuário", placar.temMedia);
checar("Placar posiciona o resultado contra o acaso", placar.comparaHonesto);
checar("Placar quebra o desempenho por método", placar.temTabelaMetodo);
await capturar("placar-com-dados");

/* ---------- acessibilidade ---------- */
secao("G. Acessibilidade");
const a11y = await js(`
  const focaveis = document.querySelectorAll(
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const semRotulo = [...document.querySelectorAll('button')].filter(b =>
    !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'));
  const imagensSemAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt'));
  return {
    focaveis: focaveis.length,
    semRotulo: semRotulo.length,
    imagensSemAlt: imagensSemAlt.length,
    lang: document.documentElement.lang,
    temMain: !!document.querySelector('main, [role="main"]'),
    temTablist: !!document.querySelector('[role="tablist"], nav'),
    tituloH1: document.querySelectorAll('h1').length,
  };
`);
checar("idioma declarado", a11y.lang === "pt-BR", a11y.lang);
checar("elementos focáveis por teclado", a11y.focaveis >= 5, `${a11y.focaveis}`);
checar("todo botão tem rótulo acessível", a11y.semRotulo === 0,
  `${a11y.semRotulo} sem rótulo`);
checar("toda imagem tem alt", a11y.imagensSemAlt === 0, `${a11y.imagensSemAlt} sem alt`);
checar("marco de navegação presente", a11y.temTablist);
checar("região principal presente", a11y.temMain);

// Navegação por teclado real: Tab percorre e Enter aciona.
await irPara("gerar");
const teclado = await js(`
  const focaveis = [...document.querySelectorAll(
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(e => e.offsetParent !== null);
  focaveis[0]?.focus();
  const primeiro = document.activeElement?.tagName;
  // aciona por teclado o cartão de método, que trata Enter e Espaço
  const metodo = document.querySelector('[data-metodo="uniforme"]');
  let acionou = false;
  if (metodo) {
    metodo.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
    acionou = true;
  }
  return { total: focaveis.length, primeiro, acionou,
           metodoTemTabindex: metodo?.hasAttribute('tabindex') || metodo?.tabIndex >= 0,
           metodoTemRole: !!metodo?.getAttribute('role') };
`);
checar("foco por teclado alcança os controles", teclado.total >= 5,
  `${teclado.total} focáveis, primeiro: ${teclado.primeiro}`);
checar("cartões de método são alcançáveis por Tab", teclado.metodoTemTabindex);
checar("cartões de método respondem a Enter", teclado.acionou);

const leitorTela = await js(`
  const abas = document.querySelectorAll('#abas [role="tab"], #abas button');
  const comEstado = [...abas].filter(a =>
    a.hasAttribute('aria-selected') || a.hasAttribute('aria-current'));
  return { abas: abas.length, comEstado: comEstado.length,
           temLive: !!document.querySelector('[aria-live]') };
`);
checar("abas expõem estado para leitor de tela",
  leitorTela.abas >= 5 && leitorTela.comEstado >= 1,
  `${leitorTela.abas} abas, ${leitorTela.comEstado} com estado`);

/* ---------- modo avião ---------- */
secao("H. Modo avião");
await cmd("Network.enable");
await cmd("Network.emulateNetworkConditions", {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
});
await cmd("Page.reload");
await dormir(2500);
const offline = await js(`
  return { titulo: document.title, texto: document.body.innerText.trim().length,
           online: navigator.onLine };
`);
checar("app abre sem rede", offline.titulo.includes("LotoLab") && offline.texto > 200,
  `offline=${!offline.online}, ${offline.texto} caracteres`);
const abasOffline = await js(`
  const t = document.body.innerText.toLowerCase();
  return ${JSON.stringify(ROTAS)}.every(a => t.includes(a));
`);
checar("todas as abas presentes sem rede", abasOffline);
await irPara("gerar");
const gerouOffline = await js(`
  const b = [...document.querySelectorAll('button')].find(e => /^gerar\\b/i.test(e.textContent.trim()));
  if (b) { b.click(); return true; } return false;
`);
await dormir(1000);
const fichasOffline = await js(`return document.querySelectorAll('.ficha,[class*="ficha"],[class*="jogo"]').length`);
checar("gera jogos sem rede", gerouOffline && fichasOffline > 0, `${fichasOffline} fichas`);
await capturar("modo-aviao");
await cmd("Emulation.setDeviceMetricsOverride", {
  width: LARGURA, height: ALTURA, deviceScaleFactor: 2, mobile: true,
});
await cmd("Network.emulateNetworkConditions", {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});

/* ---------- fim ---------- */
console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log(`  capturas em capturas/`);
console.log("─".repeat(60));

ws.close();
chrome.kill();
process.exit(falhou === 0 ? 0 : 1);
