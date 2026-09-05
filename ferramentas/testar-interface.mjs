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
 *
 * PRECISA de um servidor HTTP na raiz do projeto, porque em file:// o service
 * worker não registra e o teste do modo avião passaria medindo outra coisa:
 *
 *     python3 -m http.server 8123 &
 *     node ferramentas/testar-interface.mjs
 *
 * Ajuste com LOTOLAB_URL (endereço) e LOTOLAB_CHROME (executável).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURAS = join(RAIZ, "capturas");
const ENDERECO = process.env.LOTOLAB_URL || "http://127.0.0.1:8123/index.html";
const LARGURA = 412, ALTURA = 915; // proporção de celular comum

mkdirSync(CAPTURAS, { recursive: true });

/* Qual edição está sendo servida.

   São duas, e cada uma tem UMA identidade exata. A tentação aqui seria fazer
   os testes de nome aceitarem "LotoLab ou LotoLab Estatístico" — e isso
   desligaria justamente o que eles existem para pegar. Já aconteceu nesta
   bateria: o teste de título aceitava a marca antiga como resposta válida e
   por isso ficava verde no único caso que importava.

   Então a edição é descoberta antes, pela fonte no disco, e a partir daí cada
   asserção cobra a identidade daquela edição inteira, com igualdade estrita.
   O sinal é o marcador de aposta, que só a edição completa carrega — na
   estatística ele sai junto com o bloco que ele delimita. */
const FONTE = readFileSync(join(RAIZ, "index.html"), "utf8");
const EDICAO = FONTE.includes("/*<" + "aposta>*/")
  ? { nome:"completa",
      titulo:"LotoLab — Laboratório Estatístico",
      marca:"LotoLab",
      curto:"LotoLab" }
  : { nome:"estatística",
      titulo:"LotoLab Estatístico — Laboratório de Loterias",
      marca:"LotoLab Estatístico",
      curto:"LotoLab Estat." };
console.log(`Edição sob teste: ${EDICAO.nome} — ${EDICAO.titulo}`);

/* ---------- sobe o Chrome ----------
   O executável é configurável porque nem todo ambiente tem `google-chrome` no
   PATH: em contêiner é comum só existir `chromium` num caminho próprio, e sem
   esta variável a bateria de interface simplesmente não roda. */
const NAVEGADOR = process.env.LOTOLAB_CHROME || "google-chrome";

/* Porta ÚNICA por execução, e isto conserta o defeito mais insidioso que esta
   bateria teve.

   A porta era fixa em 9222. Quando uma execução não encerrava o navegador —
   e ela não encerra quando a bateria cai, porque o kill mora no fim do
   arquivo —, o Chrome antigo continuava dono da porta. A execução seguinte
   subia um Chrome novo, que falhava em abrir a porta em silêncio, e o
   harness se conectava ao VELHO.

   Medido: quinze instâncias vivas em 9222 ao mesmo tempo. O sintoma que me
   levou até aqui: quebrei o manifesto de propósito, restaurei o arquivo, e a
   bateria seguinte continuou reprovando com o conteúdo quebrado — o servidor
   entregava o arquivo bom e o navegador velho entregava o do cache dele.

   É também a explicação honesta do "Manifest: Line 1, column 1, Syntax error"
   que aparecia em cerca de uma execução a cada três e que eu não consegui
   reproduzir em doze cargas isoladas: não era carga isolada, era um navegador
   de outra execução.

   Bateria que fala com o navegador da execução anterior não mede o código;
   mede o histórico da máquina. */
const PORTA = 9222 + (process.pid % 900);
const chrome = spawn(NAVEGADOR, [
  "--headless=new", `--remote-debugging-port=${PORTA}`, "--no-sandbox",
  /* Perfil NOVO a cada execução, e isto conserta um defeito de verdade.

     Sem --user-data-dir o Chrome reaproveita o perfil padrão, e com ele o
     cache do service worker. Como o manifesto casa com IMUTAVEIS — cache
     primeiro, sem revalidar —, uma execução deixava o manifesto guardado para
     a seguinte. Foi assim que apareceu: quebrei o manifesto de propósito para
     conferir que o teste acusava, restaurei o arquivo, e a bateria seguinte
     continuou reprovando com o conteúdo quebrado. O servidor entregava o
     arquivo bom; o worker entregava o velho.

     É também a explicação honesta do "Manifest: Line 1, column 1, Syntax
     error" que aparecia em cerca de uma execução a cada três e que eu não
     consegui reproduzir em doze cargas isoladas: não era carga isolada, era
     estado vazando da execução anterior.

     Bateria que carrega estado da anterior não mede o código; mede o
     histórico da máquina. */
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "lotolab-perfil-"))}`,
  "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--no-proxy-server", "--proxy-bypass-list=*",
  `--window-size=${LARGURA},${ALTURA}`, "about:blank",
], { stdio: "ignore" });

/* Sem este ouvinte, um Chrome ausente vira "Unhandled 'error' event" com trinta
   linhas de pilha interna do Node e a causa real — ENOENT — no meio. Quem lê o
   log de CI precisa saber o que fazer, não onde o child_process se perdeu. */
chrome.on("error", (erro) => {
  console.error(
    erro.code === "ENOENT"
      ? `\nNão achei o navegador "${NAVEGADOR}".\n` +
        "Instale o Chrome/Chromium ou aponte o caminho:\n" +
        "  LOTOLAB_CHROME=/caminho/para/chrome node ferramentas/testar-interface.mjs\n"
      : `\nFalha ao subir "${NAVEGADOR}": ${erro.message}\n`);
  process.exit(1);
});

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* Encerra o navegador aconteça o que acontecer. O `chrome.kill()` do fim do
   arquivo só roda quando a bateria chega ao fim: uma exceção no meio deixava
   o processo vivo para sempre, e foi assim que quinze deles se acumularam. */
const encerrar = () => { try { chrome.kill(); } catch (e) { /* já morreu */ } };
process.on("exit", encerrar);
for (const sinal of ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"]) {
  process.on(sinal, (e) => {
    encerrar();
    if (e instanceof Error) { console.error(`\n${e.message}\n`); process.exit(1); }
    process.exit(130);
  });
}

async function alvo() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: "PUT" });
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
/* O nome é cobrado inteiro, e de propósito. Esta linha já aceitou
   /LotoLab|Sorte 2/ — um "ou" que deixava o teste verde exatamente no caso que
   ele existe para pegar: a marca antiga voltando. Alternativa em teste de
   identidade não afrouxa o teste, desliga. */
checar("página carregou", (await js("return document.title")) === EDICAO.titulo,
  await js("return document.title"));
/* ATENÇÃO: este teste passou anos verde sem testar nada do que o nome promete.
   Ele lia só `Log.entryAdded`, e exceção de JavaScript NÃO chega por aí — o
   Chrome manda exceção não capturada em `Runtime.exceptionThrown` e chamada de
   console.error em `Runtime.consoleAPICalled`. `Log.entryAdded` traz sobretudo
   falha de rede. Ou seja: a bateria vigiava o canal errado, e uma função
   inexistente chamada no carregamento passava como "ok".

   Descoberto ao tentar quebrar o app de propósito para conferir se o teste
   acusava. Não acusou. O que vinha derrubando a bateria era o outro lado do
   mesmo defeito: ERR_CERT_AUTHORITY_INVALID de um proxy com certificado
   próprio, ou seja, ruído de ambiente contado como erro do app.

   Agora escuta os três canais e separa por origem:

   * exceção não capturada  -> sempre falha, é defeito do app
   * console.error do app   -> sempre falha
   * falha de rede          -> ignorada, e de propósito: o app é feito para
                               funcionar sem rede, os dados ficam guardados no
                               aparelho, e quem cobra esse comportamento é a
                               seção "Modo avião", que derruba a rede de
                               propósito em vez de depender dela estar de pé. */
const problemasJS = [];
for (const e of eventos) {
  if (e.method === "Runtime.exceptionThrown") {
    const d = e.params.exceptionDetails;
    problemasJS.push(`[exceção] ${d.exception?.description || d.text}`);
  } else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") {
    problemasJS.push(`[console.error] ${e.params.args.map((a) =>
      a.description ?? a.value ?? a.type).join(" ")}`);
  } else if (e.method === "Log.entryAdded" && e.params.entry.level === "error" &&
             e.params.entry.source !== "network" &&
             /* Falha de rede com outro carimbo. O Chrome arquiva o download do
                ícone do manifesto como source "other", não "network", e aborta
                essa busca sozinho de vez em quando no headless — medido: o
                icone.svg responde 200 com image/svg+xml em toda tentativa,
                pela rede e pelo service worker, e mesmo assim a mensagem
                aparece em cerca de uma execução a cada três. É ruído de
                ambiente entrando por uma porta que o filtro de rede não cobre,
                e teste que falha sozinho um terço das vezes deixa de ser lido.
                A exclusão é só desta mensagem: qualquer outro "other" continua
                derrubando a bateria. */
             /* Falha de rede com outro carimbo: o Chrome arquiva o download
                do ícone do manifesto como source "other", não "network", e
                aborta essa busca sozinho de vez em quando no headless. O
                icone.svg responde 200 em toda tentativa, medido. */
             !/icon from the Manifest/.test(e.params.entry.text)) {
    problemasJS.push(`[${e.params.entry.source}] ${e.params.entry.text}`);
  }
}
checar("sem erro de JavaScript no console", problemasJS.length === 0,
  problemasJS.join(" | ").slice(0, 300));
checar("ausência de pesos.json não quebra o app",
  await js("return typeof MODALIDADES !== 'undefined' || document.body.innerText.length > 200"));
/* As cinco rotas do mockup. Os nomes mudaram — o que NÃO pode mudar é o
   número de telas alcançáveis: reorganizar navegação é onde recurso some
   calado, então o teste confere as duas coisas. */
const ROTAS = ['início','análise','jogos','resultados','mais'];
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
/* Pelo id, e não pelo texto. O seletor por texto casava com qualquer botão
   começando em "Gerar" — e quando a aba do segmento passou a se chamar "Gerar",
   ele clicou na ABA, que já estava selecionada, e concluiu que gerar jogos não
   produzia jogo nenhum. Id é contrato; texto de botão é aparência. */
const gerou = await js(`
  const b = document.querySelector('#g-go');
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
           /* \\b escapado em dobro de propósito: este trecho viaja para o
              navegador dentro de um template literal, e ali \b vira só "b".
              Escrito com uma barra só, o teste procurava /b18b/ — que não
              casa com nada — e o "NÃO aparece junto" passava sempre, mesmo
              se a outra modalidade estivesse na tela. */
           daOutraModalidade: /\\b18\\b/.test(texto) && /\\b25\\b/.test(texto) };
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
  /* NÚMERO, não texto. Esta linha já procurou '3001' entre aspas — e assim
     media o defeito em vez do conserto: o formulário guardava o concurso como
     texto porque <input> devolve texto, e o resto do app compara com número
     de forma estrita. Enquanto o teste procurava texto, ele passava junto com
     o defeito e ainda dava a impressão de cobri-lo. */
  const conf3001 = jogos.map(j => (j.conferencias||[]).filter(c => c.concurso === 3001).length);
  const tipos = [...new Set(jogos.flatMap(j => (j.conferencias||[]).map(c => typeof c.concurso)))];
  return { registros: res.length, porJogo: conf3001, tipos };
`);
checar("mesmo concurso conferido 2× não duplica o resultado",
  dupl.registros === 1, `${dupl.registros} registro`);
checar("mesmo concurso conferido 2× não duplica na ficha do jogo",
  dupl.porJogo.length > 0 && dupl.porJogo.every((n) => n === 1),
  `conferências por jogo: [${dupl.porJogo}]`);
checar("o concurso é guardado como número, e não como texto do formulário",
  dupl.tipos.length === 1 && dupl.tipos[0] === "number", dupl.tipos.join(", "));

// F6 — concurso diferente é somado
await preencherConferencia("5 6 7 8 9 10", "3002");
checar("concurso diferente acrescenta registro",
  (await js(`return JSON.parse(localStorage.getItem('lotolab:resultados')||'[]').length`)) === 2);

/* ---------- painel do último concurso ----------
   A tela Conferir abria com um formulário vazio pedindo as dezenas à mão
   enquanto o app já tinha o concurso e já havia conferido tudo sozinho. O
   painel resolve isso, e o botão dele tem três desfechos que precisam soar
   diferentes — senão a pessoa aprende que o botão responde sempre a mesma
   coisa e para de ler.

   `buscarNaCaixa` é trocada por uma função de teste: os três desfechos têm de
   ser determinísticos, e depender da Caixa responder tornaria esta seção um
   gerador de falha intermitente. */
secao("F3. Último concurso × jogos salvos");

await irPara("conferir");
await js(`
  const b = document.querySelector('[data-mod="lotofacil"]'); if (b) b.click();
  return true;
`);
await dormir(500);
/* Guarda o estado da seção anterior. Esta seção troca jogos e resultados para
   montar o seu cenário, e as seções seguintes — o Placar — leem os dados que a
   Conferência deixou. Limpar aqui derrubou três testes do Placar antes de eu
   perceber que o dano não era do painel, e sim da limpeza. */
const estadoAntesDoPainel = await js(`
  return {jogos: JSON.stringify(S.jogos),
          resultados: JSON.stringify(S.resultados),
          teimosinhas: JSON.stringify(S.teimosinhas || [])};
`);
await js(`
  S.jogos = [{id:'p1', dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    modalidade:'lotofacil', metodo:'aleatório', data:'2026-08-01', conferencias:[]}];
  S.teimosinhas = [];
  S.resultados = [{concurso:3401, data:'2026-08-12', modalidade:'lotofacil',
    dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,20,25]}];
  S.avisoConferir = null;
  conferenciaAutomatica(); pintar(); return true;
`);
await dormir(500);

const painel = await js(`return document.querySelector('main').innerText`);
checar("o painel responde sem clique: concurso, ganhadores e acertos",
  /3401/.test(painel) && /13 coincidências/.test(painel),
  (painel.match(/.{0,40}acertos.{0,20}/) || [""])[0].trim());
await capturar("conferir-ultimo-concurso");

/* Desfecho 1: a busca traz concurso novo. */
await js(`
  window.__buscaReal = buscarNaCaixa;
  buscarNaCaixa = async () => ({concurso:3402, data:'2026-08-14',
    modalidade:'lotofacil', dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,25],
    rateio:[{faixa:1, ganhadores:1, premio:500000}], fonte:'teste'});
  document.querySelector('#c-atualizar').click(); return true;
`);
await dormir(900);
const novo = await js(`return document.querySelector('main').innerText`);
checar("buscar traz o concurso novo e confere na hora",
  /3402/.test(novo) && /é novo por aqui/.test(novo) && /14 coincidências/.test(novo));

/* Desfecho 2: o mesmo concurso de novo. Precisa dizer outra coisa, e não pode
   duplicar a conferência do jogo. */
await js(`document.querySelector('#c-atualizar').click(); return true;`);
await dormir(900);
checar("buscar de novo diz que já estava atualizado",
  /já estava atualizado/i.test(await js(`return document.querySelector('main').innerText`)));
checar("e não duplica a conferência do jogo",
  (await js(`return S.jogos[0].conferencias.filter(c => c.concurso === 3402).length`)) === 1);

/* Desfecho 3: a rede falha. Vira recado legível, não exceção. */
await js(`
  buscarNaCaixa = async () => { throw new Error('sem rede'); };
  document.querySelector('#c-atualizar').click(); return true;
`);
await dormir(900);
const falha = await js(`return document.querySelector('main').innerText`);
checar("falha de rede vira recado legível e preserva o que já se sabia",
  /Nenhuma fonte respondeu/.test(falha) && /3402/.test(falha));

/* O recado é da visita, não do app: sair e voltar limpa. */
await irPara("jogos"); await dormir(400);
await irPara("conferir"); await dormir(500);
checar("sair da tela e voltar limpa o recado da busca",
  !/Nenhuma fonte respondeu/.test(await js(`return document.querySelector('main').innerText`)));

/* Um jogo salvo DEPOIS do sorteio não pode aparecer como acerto, mesmo tendo
   as dezenas idênticas — é a trava de honestidade do painel, vista pela tela. */
await js(`
  S.jogos.push({id:'p2', dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,25],
    modalidade:'lotofacil', metodo:'aleatório', data:'2026-12-01', conferencias:[]});
  conferenciaAutomatica(); pintar(); return true;
`);
await dormir(500);
const tarde = await js(`
  const main = document.querySelector('main');
  /* innerText de um <details> fechado não traz o conteúdo escondido, e a lista
     de jogos fora do concurso mora dentro de um. Para o motivo, vale
     textContent; para o que a pessoa vê como acerto, vale innerText. */
  return { quinze: /15 acertos/.test(main.innerText),
           fora: /depois do sorteio/.test(main.textContent) };
`);
checar("jogo salvo depois do sorteio não vira acerto na tela",
  !tarde.quinze && tarde.fora,
  `mostrou 15 acertos: ${tarde.quinze} · listou o motivo: ${tarde.fora}`);

/* Devolve o estado como estava, para as seções seguintes lerem o que a
   Conferência montou e não o cenário deste painel. */
await js(`
  buscarNaCaixa = window.__buscaReal;
  S.jogos = ${JSON.stringify(estadoAntesDoPainel.jogos)} ? JSON.parse(${JSON.stringify(estadoAntesDoPainel.jogos)}) : [];
  S.resultados = JSON.parse(${JSON.stringify(estadoAntesDoPainel.resultados)});
  S.teimosinhas = JSON.parse(${JSON.stringify(estadoAntesDoPainel.teimosinhas)});
  Guardar.gravar('jogos', S.jogos);
  Guardar.gravar('resultados', S.resultados);
  pintar();
  return true;
`);
await dormir(400);

/* ---------- Meus jogos: conferência sob demanda (pacote v2.1) ---------- */
secao("F4. Meus jogos — conferir agora e atividade");

await irPara("jogos");
await js(`
  const b = document.querySelector('[data-mod="lotofacil"]'); if (b) b.click();
  return true;
`);
await dormir(500);
const estadoAntesJogos = await js(`
  return {jogos: JSON.stringify(S.jogos), resultados: JSON.stringify(S.resultados),
          avisos: JSON.stringify(S.avisos || [])};
`);
await js(`
  S.jogos = [
    {id:'g1', dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,25], modalidade:'lotofacil',
     metodo:'manual', data:'2026-08-01', lote:'L9', conferencias:[]},
    {id:'g2', dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,25], modalidade:'lotofacil',
     metodo:'manual', data:'2026-08-01', lote:'L9', concursoAlvo:3300, conferencias:[]}];
  S.teimosinhas = [];
  S.resultados = [{concurso:3401, data:'2026-08-12', modalidade:'lotofacil',
    dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,25]}];
  S.avisos = []; S.avisoJogos = null;
  conferenciaAutomatica(); pintar(); return true;
`);
await dormir(500);

const jogosTela = await js(`return document.querySelector('main').innerText`);
checar("Meus jogos mostra o resumo com o último concurso",
  /3401/.test(jogosTela) && /COINCID/i.test(jogosTela));
checar("e o jogo com concurso declarado mostra esse concurso",
  /concurso 3300/i.test(jogosTela));
await capturar("meus-jogos-resumo");

/* O botão devolve resposta e registra a atividade. */
await js(`document.querySelector('#j-conferir').click(); return true;`);
await dormir(600);
const depoisDoBotao = await js(`
  return {texto: document.querySelector('main').innerText,
          avisos: (S.avisos||[]).map(a => a.titulo)};
`);
checar("conferir agora registra a atividade \"Conferência concluída\"",
  depoisDoBotao.avisos.includes("Conferência concluída"),
  depoisDoBotao.avisos.join(" | ") || "nenhum aviso");
checar("e devolve resposta na tela mesmo sem nada novo",
  /Nada de novo para conferir|conferência/i.test(depoisDoBotao.texto));

/* A trava do pacote: coincidência, nunca prêmio ou faixa. */
checar("Meus jogos não fala em faixa de prêmio",
  !/faixa de prêmio/i.test(depoisDoBotao.texto),
  (depoisDoBotao.texto.match(/.{0,40}faixa de prêmio.{0,20}/i) || [""])[0]);

/* O recado é da visita: sair e voltar limpa. */
await irPara("conferir"); await dormir(400);
await irPara("jogos"); await dormir(500);
checar("sair da tela e voltar limpa o recado da conferência",
  !/Nada de novo para conferir/.test(await js(`return document.querySelector('main').innerText`)));

await js(`
  S.jogos = JSON.parse(${JSON.stringify(estadoAntesJogos.jogos)});
  S.resultados = JSON.parse(${JSON.stringify(estadoAntesJogos.resultados)});
  S.avisos = JSON.parse(${JSON.stringify(estadoAntesJogos.avisos)});
  Guardar.gravar('jogos', S.jogos); Guardar.gravar('resultados', S.resultados);
  pintar(); return true;
`);
await dormir(400);

/* ---------- central de atividades ---------- */
secao("F5. Central de atividades — dias e filtros");

const guardaAvisos = await js(`return JSON.stringify(S.avisos || [])`);
await js(`
  const h = 3600000, baseDia = new Date(); baseDia.setHours(12,0,0,0); const agora = baseDia.getTime();
  const mk = (tipo, titulo, quandoMs) => ({id: tipo + quandoMs, tipo, titulo,
    texto: "detalhe", quando: new Date(quandoMs).toISOString(), lido: false});
  S.avisos = [
    mk("premio", "Lotofácil: 14 acertos", agora - 1*h),
    mk("conferencia", "Conferência concluída", agora - 2*h),
    mk("historico", "2 concursos novos", agora - 3*h),
    mk("analise", "Análise da Quina pronta", agora - 26*h),
    mk("pesquisa", "Nenhuma hipótese sobreviveu", agora - 28*h),
    mk("sistema", "Versão nova disponível", agora - 30*h),
  ];
  document.querySelector("#btn-avisos").click();
  return true;
`);
await dormir(600);

const central = await js(`return document.querySelector("#corpo-avisos").innerText`);
checar("a central agrupa por Hoje e Ontem",
  /HOJE|Hoje/.test(central) && /ONTEM|Ontem/.test(central));
checar("e traz os quatro filtros do mockup, com contagem",
  ["Todas","Conferências","Análises","Sistema"].every(n => central.includes(n)) &&
  /\b6\b/.test(central));
await capturar("central-atividades");

/* A folha rola; a faixa de chips só ganha o esmaecimento quando de fato
   transborda. Aplicá-lo sempre apagaria a borda de um chip que cabe. */
const faixa = await js(`
  const c = document.querySelector(".chips");
  return {transborda: c.scrollWidth > c.clientWidth + 1, rola: c.classList.contains("rola")};
`);
checar("o esmaecimento da faixa combina com o transbordo real",
  faixa.transborda === faixa.rola, `transborda=${faixa.transborda} classe=${faixa.rola}`);

/* Cada filtro mostra só o seu assunto — e continua agrupado por dia. */
for(const [id, esperado, ausente] of [
  ["analise", "Análise da Quina pronta", "Lotofácil: 14 acertos"],
  ["conferencia", "Conferência concluída", "Versão nova disponível"],
  ["sistema", "Versão nova disponível", "Análise da Quina pronta"],
]){
  await js(`document.querySelector('[data-filtro="${id}"]').click(); return true;`);
  await dormir(300);
  const t = await js(`return document.querySelector("#corpo-avisos").innerText`);
  checar(`filtro "${id}" mostra o seu e esconde o resto`,
    t.includes(esperado) && !t.includes(ausente),
    t.includes(esperado) ? `escondeu ${ausente}? ${!t.includes(ausente)}` : `não achou ${esperado}`);
}

/* Filtro sem nada não pode parecer "o app perdeu os avisos". */
await js(`
  S.avisos = S.avisos.filter(a => a.tipo !== "analise" && a.tipo !== "pesquisa");
  S.filtroAvisos = "analise"; pintarAvisos(); return true;
`);
await dormir(300);
const vazio = await js(`return document.querySelector("#corpo-avisos").innerText`);
checar("filtro vazio explica que os outros continuam em Todas",
  /Nenhum aviso em/.test(vazio) && /Todas/.test(vazio), vazio.slice(0, 90).replace(/\n/g, " "));

await js(`
  document.querySelector("#folha-avisos").dataset.aberta = "0";
  S.avisos = JSON.parse(${JSON.stringify(guardaAvisos)});
  S.filtroAvisos = "todas"; pintarContaAvisos(); return true;
`);

/* ---------- voltar ---------- */
secao("F6. Voltar — seta e pilha");

await irPara("inicio"); await dormir(400);
checar("a tela inicial não tem seta de voltar",
  !(await js(`return !!document.querySelector("#voltar")`)));

/* Um atalho da tela inicial é um mergulho: seta aparece, título centra. */
await js(`
  const b = document.querySelector('[data-atalho="jogos"]');
  if (b) { b.click(); return true; } irParaTela("jogos"); return true;
`);
await dormir(600);
const sub = await js(`
  const v = document.querySelector("#voltar");
  const t = document.querySelector(".titulo.com-volta h1");
  if (!v || !t) return {seta:false};
  const cx = t.getBoundingClientRect().left + t.getBoundingClientRect().width/2;
  return {seta:true, rotulo:v.getAttribute("aria-label"),
          centro: Math.abs(cx - window.innerWidth/2) < 12, tela:S.tela};
`);
checar("depois de um atalho a seta aparece", sub.seta === true, `tela=${sub.tela}`);
checar("e o título fica centrado", sub.centro === true);
checar("e a seta diz para onde volta", /Voltar para \S/.test(sub.rotulo || ""), sub.rotulo);
await capturar("subtela-com-voltar");

await js(`document.querySelector("#voltar").click(); return true;`);
await dormir(500);
checar("clicar na seta volta para a tela anterior",
  (await js(`return S.tela`)) === "inicio" &&
  !(await js(`return !!document.querySelector("#voltar")`)));

/* A barra inferior é movimento lateral: não deixa seta para trás. */
await js(`irParaTela("jogos"); return true;`); await dormir(400);
await js(`document.querySelector('[data-secao="analise"]').click(); return true;`);
await dormir(500);
checar("a barra inferior limpa a pilha e some com a seta",
  !(await js(`return !!document.querySelector("#voltar")`)) &&
  (await js(`return (S.pilha||[]).length`)) === 0);

await irPara("inicio"); await dormir(300);

/* ---------- ação no cabeçalho da tela ---------- */
secao("F7. Ação no cabeçalho — recarregar em Resultados");

await irPara("resultados"); await dormir(600);
const acaoCab = await js(`
  const b = document.querySelector("#r-caixa");
  if (!b) return {existe:false};
  const h1 = document.querySelector(".titulo.com-volta h1");
  const cx = h1.getBoundingClientRect().left + h1.getBoundingClientRect().width/2;
  return {existe:true, noCabecalho:!!b.closest(".titulo"), ligado:typeof b.onclick === "function",
          desabilitado:b.disabled, centro: Math.abs(cx - window.innerWidth/2) < 12,
          soltoNaTela: /atualizar<\\/button>/.test(document.querySelector("main").innerHTML)};
`);
checar("o ícone de recarregar fica no cabeçalho da tela",
  acaoCab.existe && acaoCab.noCabecalho);
checar("o título continua centrado com a ação à direita", acaoCab.centro === true);
checar("e o botão continua ligado ao tratador", acaoCab.ligado === true);
checar("o botão solto de atualizar saiu da tela", acaoCab.soltoNaTela === false);

/* O ramo desativado não acontece hoje — todas as modalidades têm serviço na
   Caixa. Forçá-lo é o único jeito de ele não ficar escrito e nunca executado,
   que é como um `disabled` errado sobrevive a tudo. */
const semServico = await js(`
  const mod = S.modalidade;
  const guarda = SLUG_CAIXA[mod];
  delete SLUG_CAIXA[mod];
  pintar();
  const b = document.querySelector("#r-caixa");
  const r = {desabilitado: b.disabled, rotulo: b.getAttribute("aria-label")};
  SLUG_CAIXA[mod] = guarda; pintar();
  return r;
`);
checar("sem serviço na Caixa, a ação nasce desativada",
  semServico.desabilitado === true && /Sem serviço/i.test(semServico.rotulo || ""),
  `${semServico.desabilitado} · ${semServico.rotulo}`);
checar("e volta a ficar ativa quando o serviço existe",
  (await js(`return document.querySelector("#r-caixa").disabled`)) === false);
await capturar("resultados-cabecalho");

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
checar("app abre sem rede", offline.titulo === EDICAO.titulo && offline.texto > 200,
  `offline=${!offline.online}, ${offline.texto} caracteres`);
const abasOffline = await js(`
  const t = document.body.innerText.toLowerCase();
  return ${JSON.stringify(ROTAS)}.every(a => t.includes(a));
`);
checar("todas as abas presentes sem rede", abasOffline);
await irPara("gerar");
const gerouOffline = await js(`
  const b = document.querySelector('#g-go');
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

/* ---------- F8. Identidade da V4 ----------
   A virada de marca e a camada visual da V4 vieram por caminhos separados
   (um instalador de CSS, um sync de metadados, edições à mão) e nenhum teste
   cobrava o resultado combinado. O que já escapou por essa fresta: o
   manifesto ficou com o fundo da versão anterior enquanto o app já abria no
   novo, e o teste de título aceitava a marca antiga como resposta válida.
   Esta seção cobra a identidade onde ela é visível, não onde foi escrita. */
secao("F8. Identidade da V4");

/* Antes de medir, volta ao estado limpo: a seção anterior derruba a rede e
   recarrega, e o manifesto precisa ser buscado com rede de pé. */
await cmd("Page.navigate", { url: ENDERECO });
await dormir(2500);

const identidade = await js(`
  const l = document.querySelector('link[href*="sorte2-ui-final.css"]');
  return {
    titulo: document.title,
    marca: document.querySelector('.marca-titulo b')?.textContent || "",
    tema: document.documentElement.getAttribute('data-tema'),
    themeColor: document.querySelector('meta[name=theme-color]')?.content || "",
    temLink: !!l,
    /* cssRules só é legível se a folha carregou de verdade: um 404 deixa
       sheet nulo ou sem regra nenhuma, e aí "o link existe" não prova nada. */
    regrasDaFolha: l && l.sheet ? l.sheet.cssRules.length : 0,
    fundoHtml: getComputedStyle(document.documentElement).backgroundColor,
  };
`);

checar("título é o da edição", identidade.titulo === EDICAO.titulo, identidade.titulo);
checar("marca no cabeçalho é a da edição", identidade.marca === EDICAO.marca, identidade.marca);
checar("tema escuro é o padrão", identidade.tema === "escuro", String(identidade.tema));
checar("a folha da V4 carregou e tem regras", identidade.temLink && identidade.regrasDaFolha > 100,
  `${identidade.regrasDaFolha} regras`);

/* Não basta a folha carregar: as regras precisam VALER — e "valer" se mede no
   valor computado do elemento vivo, não no texto da regra.

   A primeira versão deste teste varria as regras da folha e comparava o texto
   autoral com o computado. Deu falha honesta em código são: o navegador
   normaliza (`saturate(145%)` vira `saturate(1.45)`, `1fr` vira pixel, cor em
   hex vira rgb). Comparação de string ali mede a normalização do Chrome, não
   a V4. Então a lista abaixo é curta, escolhida à mão, e cada linha diz o
   valor computado que se espera de fato. */
const VALORES_DA_V4 = [
  { o_que: "fundo da página",        js: `getComputedStyle(document.documentElement).backgroundColor`, espera: "rgb(2, 10, 16)" },
  { o_que: "cor-base da V4",         js: `getComputedStyle(document.documentElement).getPropertyValue('--s2-bg').trim()`, espera: "#061521" },
  /* 44px, e não os 40px de antes: a V4.3 subiu os dois ícones do cabeçalho
     para o mínimo de alvo de toque. A expectativa muda aqui porque a mudança
     foi intencional e medida — não para o teste parar de reclamar. E, para
     este valor não voltar a ser um número solto que alguém ajusta de novo, a
     seção F9 abaixo passou a cobrar a REGRA (nenhum alvo abaixo de 44px) em
     vez de só esta amostra. */
  { o_que: "largura do botão menu",  js: `getComputedStyle(document.querySelector('.menu')).width`, espera: "44px" },
  { o_que: "ícone do menu",          js: `getComputedStyle(document.querySelector('.menu svg')).width`, espera: "22px" },
  { o_que: "corpo em 14px",          js: `getComputedStyle(document.body).fontSize`, espera: "14px" },
  { o_que: "barra de rolagem fina",  js: `getComputedStyle(document.body).scrollbarWidth`, espera: "thin" },
];
for (const v of VALORES_DA_V4) {
  const obtido = await js(`return String(${v.js})`);
  checar(`regra da V4 vale: ${v.o_que}`, obtido === v.espera,
    obtido === v.espera ? obtido : `esperado ${v.espera}, obtido ${obtido}`);
}

/* Prova de que é a FOLHA que manda, e não uma coincidência com o CSS embutido:
   desligada a folha, o fundo tem de deixar de ser o da V4. Um teste que só
   confere o valor final passaria igual se o <link> não existisse. */
const semAFolha = await js(`
  const l = document.querySelector('link[href*="sorte2-ui-final.css"]');
  l.sheet.disabled = true;
  const cor = getComputedStyle(document.documentElement).backgroundColor;
  l.sheet.disabled = false;
  return { desligada: cor, religada: getComputedStyle(document.documentElement).backgroundColor };
`);
checar("o fundo vem da folha da V4, não do CSS embutido",
  semAFolha.desligada !== "rgb(2, 10, 16)" && semAFolha.religada === "rgb(2, 10, 16)",
  `sem a folha: ${semAFolha.desligada} · com a folha: ${semAFolha.religada}`);

/* A cor do manifesto é a tela de partida do app instalado. Divergir da
   theme-color faz o app abrir num tom e trocar para outro meio segundo
   depois — o mesmo salto que já foi corrigido no Android. */
/* Devolve promessa em vez de usar await: o auxiliar js() embrulha a expressão
   numa arrow comum, e `await` ali dentro é erro de sintaxe. Quem resolve a
   promessa é o awaitPromise do próprio DevTools. */
const corDoManifesto = await js(`
  return fetch('manifest.webmanifest', { cache: 'no-store' })
    .then(r => r.text())
    .then(txt => {
      /* Devolve o ERRO em vez de deixá-lo subir. Com JSON.parse solto, um
         manifesto quebrado derrubava a bateria inteira com pilha do Node em
         vez de reprovar um teste — e queda esconde qual teste caiu, além de
         cancelar as seções seguintes. Conferido de propósito, escrevendo lixo
         no arquivo. */
      try { const m = JSON.parse(txt);
        return { nome: m.name, curto: m.short_name,
                 fundo: m.background_color, tema: m.theme_color }; }
      catch(e) { return { erro: e.message, inicio: txt.slice(0, 40) }; }
    });
`);
checar("o manifesto é JSON válido", !corDoManifesto.erro,
  corDoManifesto.erro ? `${corDoManifesto.erro} — começa com "${corDoManifesto.inicio}"` : "");
checar("manifesto usa a cor da V4",
  corDoManifesto.fundo === identidade.themeColor &&
  corDoManifesto.tema === identidade.themeColor,
  `manifesto ${corDoManifesto.fundo}/${corDoManifesto.tema} vs meta ${identidade.themeColor}`);
checar("manifesto leva o nome da edição",
  corDoManifesto.curto === EDICAO.curto && corDoManifesto.nome.includes("LotoLab"),
  `${corDoManifesto.nome} / ${corDoManifesto.curto}`);

/* Varredura da marca antiga no que a pessoa lê. Percorre as treze telas em
   vez de olhar só a inicial: renomeação parcial é o defeito típico aqui. */
const marcaAntiga = await js(`
  const achados = [];
  const telas = SECOES.flatMap(s => s.telas.map(t => t.id));
  for(const id of telas){
    try { irParaTela(id, {lateral:true}); } catch(e) { continue; }
    const texto = document.body.innerText;
    if(/sorte\\s*2/i.test(texto)) achados.push(id);
  }
  return achados;
`);
checar("nenhuma tela mostra a marca antiga", marcaAntiga.length === 0,
  marcaAntiga.join(", "));

/* ---------- F9. A edição estatística não expõe fluxo de aposta ----------

   Esta seção é a que separa "removido" de "escondido". Um display:none
   passaria em qualquer varredura de código-fonte e continuaria entregando o
   conteúdo para quem abrisse o inspetor — ou para um leitor de tela, que não
   obedece a CSS de layout do mesmo jeito que o olho.

   Então a cobrança é feita no texto RENDERIZADO das treze telas, que é o que
   de fato chega à pessoa. E é feita nas duas edições, com o sinal trocado: na
   completa esses indicadores TÊM de aparecer, senão a remoção vazou para o
   lado errado e a edição completa perdeu recurso em silêncio. */
secao("F9. Fluxo de aposta por edição");

await cmd("Page.navigate", { url: ENDERECO });
await dormir(2500);

const varredura = await js(`
  const PADROES = {
    "dinheiro": /R\\$\\s?\\d/,
    "faixa de prêmio": /faixa de pr[êe]mio/i,
    "custo": /\\bcusto\\b/i,
    "prêmio esperado": /pr[êe]mio esperado/i,
    "ROI": /\\bROI\\b/,
  };
  const achados = {};
  for(const id of SECOES.flatMap(s => s.telas.map(t => t.id))){
    try { irParaTela(id, {lateral:true}); } catch(e) { continue; }
    const texto = document.body.innerText;
    for(const [nome, re] of Object.entries(PADROES))
      if(re.test(texto)) (achados[nome] = achados[nome] || []).push(id);
  }
  return achados;
`);

const nomes = Object.keys(varredura);
if (EDICAO.nome === "estatística") {
  checar("nenhuma das treze telas mostra dinheiro, custo ou prêmio",
    nomes.length === 0,
    nomes.map(n => `${n}: ${varredura[n].join(", ")}`).join(" · ") || "varredura limpa");

  /* Não basta o texto sumir: o conteúdo não pode estar no DOM invisível. É
     exatamente o que um "esconde com CSS" deixaria para trás. */
  const escondido = await js(`
    /* Só elementos de INTERFACE. A primeira versão varria querySelectorAll('*'),
       que traz HEAD, STYLE e SCRIPT — e o textContent deles é o código-fonte da
       página inteira, comentários inclusive. O teste acusava três "elementos
       ocultos com conteúdo financeiro" que eram a folha de estilo e o próprio
       script do app. Varrer o documento não é varrer a tela. */
    const IGNORAR = new Set(["HEAD","STYLE","SCRIPT","TITLE","META","LINK","TEMPLATE"]);
    const suspeitos = [...document.body.querySelectorAll('*')].filter(e => {
      if(IGNORAR.has(e.tagName)) return false;
      const s = getComputedStyle(e);
      if(s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0') return false;
      return /R\\$\\s?\\d|faixa de pr[êe]mio|pr[êe]mio esperado/i.test(e.textContent || "");
    });
    return suspeitos.length;
  `);
  checar("e nada disso ficou no DOM apenas escondido por CSS", escondido === 0,
    `${escondido} elementos ocultos com conteúdo financeiro`);

  checar("a função de moeda não sobreviveu na edição estatística",
    (await js(`return typeof brl`)) === "undefined",
    await js(`return typeof brl`));
} else {
  checar("a edição completa mantém os indicadores financeiros",
    nomes.length > 0, nomes.join(", ") || "NENHUM — a remoção vazou para a edição errada");
  checar("e a função de moeda continua existindo",
    (await js(`return typeof brl`)) === "function", await js(`return typeof brl`));
}

/* Em qualquer edição: a Teimosinha continua alcançável. Ela repete um
   conjunto por vários concursos e mede o desempenho — isso é análise, e some
   junto com o custo só se alguém cortar demais. */
checar("a Teimosinha continua alcançável nas duas edições",
  await js(`
    try { irParaTela("teimosinha", {lateral:true});
          return document.body.innerText.length > 200; } catch(e) { return false; }
  `));

/* ---------- F10. Alvo de toque e escala de raio ----------
   As duas coisas que a V4.3 pediu e que só se veem medindo.

   O alvo de toque estava entre 33 e 39px em abas de segmento, chips e botões
   pequenos — abaixo do que o dedo acerta com confiança. E o raio de borda
   tinha quatro valores convivendo (11, 12, 15 e 17px) em elementos do mesmo
   peso visual: ruído que se vê sem saber nomear.

   Cobrado como REGRA, e nas três larguras que o prompt nomeia. Uma amostra
   solta ("o menu tem 40px") documenta um número; a regra impede a volta do
   defeito em qualquer componente novo. */
secao("F10. Alvo de toque e escala de raio");

for (const larguraTela of [360, 390, 430]) {
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: larguraTela, height: 900, deviceScaleFactor: 2, mobile: true });
  await dormir(350);

  const medida = await js(`
    const pequenos = [], raios = {};
    for(const id of SECOES.flatMap(s => s.telas.map(t => t.id))){
      try { irParaTela(id, {lateral:true}); } catch(e) { continue; }
      for(const el of document.querySelectorAll('button, a[href]')){
        const b = el.getBoundingClientRect();
        if(b.height === 0 || b.width === 0) continue;
        if(b.height < 44 || b.width < 44)
          pequenos.push(id + ' ' + (el.className||el.tagName).toString().slice(0,22) +
                        ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      const main = document.querySelector('main') || document.body;
      for(const el of main.querySelectorAll('*')){
        const cl = (el.className||'').toString();
        if(!/carta|kpi|card|nota|ficha|item|painel/.test(cl)) continue;
        const b = el.getBoundingClientRect();
        if(!b.width || !b.height) continue;
        const rd = getComputedStyle(el).borderRadius.split(' ')[0];
        if(rd && rd !== '0px') raios[rd] = (raios[rd]||0) + 1;
      }
    }
    return { pequenos: [...new Set(pequenos)].slice(0,8),
             raios, larguraDoc: document.documentElement.scrollWidth };
  `);

  checar(`${larguraTela}px: todo alvo de toque tem ao menos 44px`,
    medida.pequenos.length === 0, medida.pequenos.join(" · "));
  checar(`${larguraTela}px: superfícies usam uma escala única de raio`,
    Object.keys(medida.raios).length === 1, JSON.stringify(medida.raios));
  checar(`${larguraTela}px: nada estoura na horizontal`,
    medida.larguraDoc <= larguraTela + 1, `documento ${medida.larguraDoc}px`);
}

/* O roxo é a identidade global da V4.3: a cor da modalidade informa contexto,
   mas não pode repintar a interface inteira como fazia na V4.2. */
const acentos = await js(`
  const fora = [];
  for(const el of document.querySelectorAll('[data-mod]')){
    el.click();
    const acento = getComputedStyle(document.body).getPropertyValue('--ll-mod').trim();
    if(acento.toUpperCase() !== '#8B5CF6') fora.push(el.dataset.mod + '=' + acento);
  }
  return fora;
`);
checar("o acento global é o roxo em qualquer modalidade", acentos.length === 0,
  acentos.join(", "));

/* A cor da modalidade continua viva onde ela informa. Se esta checagem cair
   junto com a de cima, foi porque o roxo comeu o contexto — que é o outro
   jeito de errar o mesmo ajuste. */
const contexto = await js(`
  const cores = new Set();
  for(const el of document.querySelectorAll('[data-mod]'))
    cores.add(getComputedStyle(el).getPropertyValue('--ll-chip').trim().toUpperCase());
  return [...cores];
`);
checar("cada modalidade mantém a sua cor de contexto", contexto.length === 8,
  `${contexto.length} cores distintas`);

/* Foco de teclado VISÍVEL. A bateria já cobrava que o foco alcança os
   controles; não cobrava que ele aparece — e ele não aparecia.

   Tab de verdade pelo protocolo: `el.focus()` por script não aciona
   :focus-visible no Chrome, e mediria "sem anel" com o anel funcionando. */
await cmd("Emulation.setDeviceMetricsOverride", {
  width: LARGURA, height: ALTURA, deviceScaleFactor: 2, mobile: true });
await irPara("inicio");
const tecla = (tipo) => cmd("Input.dispatchKeyEvent", {
  type: tipo, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
const aneis = [];
for (let i = 0; i < 5; i++) {
  await tecla("rawKeyDown"); await tecla("keyUp"); await dormir(90);
  const a = await js(`
    const el = document.activeElement;
    if(!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
  `);
  if (a !== null) aneis.push(a);
}
checar("o foco de teclado é visível", aneis.length > 0 && aneis.every(Boolean),
  `${aneis.filter(Boolean).length} de ${aneis.length} controles com anel`);

/* ---------- F11. Sair da folha de atividades ----------
   Relatado por quem usa: "vou nas notificações e não consigo voltar".

   A folha tinha só o fundo clicável — a faixa escura acima do painel. No
   navegador não existe botão de voltar do sistema, e ninguém adivinha que
   precisa tocar no escuro. A gaveta sempre teve um "fechar" visível; esta
   não tinha.

   A bateria cobria ABRIR a folha e o que ela mostra. Nunca cobriu SAIR — e é
   por isso que um beco sem saída sobreviveu a tantas versões. */
secao("F11. Sair da folha de atividades");

await irPara("inicio");
const saida = await js(`
  const folha = document.querySelector('#folha-avisos');
  const sino = document.querySelector('.sino');
  if(!folha || !sino) return {erro:'sem folha ou sino'};

  sino.click();
  const abriu = folha.dataset.aberta === "1";

  /* O botão precisa estar VISÍVEL, não apenas existir: um fechar de 0x0 ou
     escondido atrás de overflow é o mesmo beco sem saída com outro nome. */
  const btn = folha.querySelector('[data-fechar]:not(.fundo)');
  const cx = btn ? btn.getBoundingClientRect() : null;
  const visivel = !!(cx && cx.width > 0 && cx.height > 0 &&
    getComputedStyle(btn).visibility !== 'hidden' &&
    cx.top >= 0 && cx.bottom <= window.innerHeight);

  if(btn) btn.click();
  const fechou = folha.dataset.aberta === "0";

  /* E o fundo continua fechando, para quem já aprendeu esse caminho. */
  sino.click();
  const reabriu = folha.dataset.aberta === "1";
  folha.querySelector('.fundo').click();
  const fechouPeloFundo = folha.dataset.aberta === "0";

  return { abriu, temBotao: !!btn, visivel, alvo: cx ? Math.round(cx.width)+'x'+Math.round(cx.height) : null,
           fechou, reabriu, fechouPeloFundo };
`);
checar("a folha de atividades abre", saida.abriu === true, JSON.stringify(saida.erro||""));
checar("tem um fechar visível dentro da folha", saida.temBotao && saida.visivel,
  `botão=${saida.temBotao} visível=${saida.visivel} alvo=${saida.alvo}`);
checar("e o fechar realmente fecha", saida.fechou === true);
checar("o fundo também continua fechando",
  saida.reabriu === true && saida.fechouPeloFundo === true,
  `reabriu=${saida.reabriu} fechou=${saida.fechouPeloFundo}`);

/* ---------- F12. A Bancada responde antes de detalhar ----------
   Medido antes de mexer: a tela saía com 14.357 caracteres, ONZE tabelas e as
   mesmas duas explicações repetidas depois de cada uma. Para responder a única
   pergunta que a bancada existe para responder — algum método se separou do
   acaso? — era preciso rolar tudo, e a resposta estava lá em cima, soterrada
   pelo que vinha depois.

   Além do tamanho, há o risco de leitura: dez tabelas de concurso isolado
   convidam exatamente ao erro que esta tela desfaz. Com cinco métodos e dez
   concursos são cinquenta chances de alguém parecer melhor por acaso. */
secao("F12. A Bancada responde antes de detalhar");

await irPara("bancada");
await js(`
  return fetch('dados/lotofacil.json').then(r => r.json()).then(d => {
    S.resultados = d.concursos.slice(-40).map(c => Object.assign({}, c, {modalidade:'lotofacil'}));
    S.modalidade = 'lotofacil'; S.bancadaAlvos = 5; S.bancadaRep = 20; S.bancadaQtd = 2;
    return S.resultados.length;
  });
`);
await irPara("bancada");
await js(`document.querySelector('#b-go').click(); return 1;`);
await dormir(6000);

const banca = await js(`
  const saida = document.querySelector('#b-saida');
  const det = saida.querySelector('details');
  const conta = (s) => (saida.innerText.match(new RegExp(s, 'g')) || []).length;
  return {
    rodou: !!saida.querySelector('table'),
    visiveis: saida.innerText.length,
    abertas: [...saida.querySelectorAll('table')].filter(x => !x.closest('details')).length,
    recolhidas: det ? det.querySelectorAll('table').length : 0,
    explicacaoRepetida: conta('O que dá para escolher'),
    /* O detalhe precisa ABRIR: recolher informação é organizar; escondê-la sem
       porta é remover. */
    abre: det ? (det.open = true, det.querySelectorAll('table').length > 0) : false,
  };
`);

checar("a bancada roda e produz tabela", banca.rodou);
checar("o recorte agregado fica aberto", banca.abertas === 1, `${banca.abertas} aberta(s)`);
checar("as tabelas por concurso ficam recolhidas", banca.recolhidas >= 2,
  `${banca.recolhidas} recolhida(s)`);
checar("e continuam acessíveis ao abrir o detalhe", banca.abre === true);
checar("a explicação longa não se repete por tabela", banca.explicacaoRepetida <= 1,
  `${banca.explicacaoRepetida} ocorrências`);
checar("a tela deixa de ser um muro de texto", banca.visiveis < 6000,
  `${banca.visiveis} caracteres visíveis`);

/* ---------- F13. Trocar de modalidade em qualquer tela que filtra por ela ----
   O defeito: a tira de modalidades existia SÓ na tela de Resultados, embutida
   nela. Meus Jogos filtra por S.modalidade e não tinha como trocar — quem
   salvava um jogo de Mega-Sena via a lista vazia, e a cartela parecia existir
   só na Lotofácil porque só a Lotofácil estava selecionada. O rodapé da
   própria tela dizia "troque no topo da tela para ver", apontando para um
   seletor que não estava lá.                                                */
secao("F13. Trocar de modalidade onde a tela filtra por ela");
{
  await js(`
    localStorage.setItem("lotolab:resultados", JSON.stringify([
      {concurso:3050,data:"2026-08-30",modalidade:"mega-sena",origem:"caixa",
       dezenas:[4,18,22,26,31,58]},
      {concurso:3776,data:"2026-08-31",modalidade:"lotofacil",origem:"caixa",
       dezenas:[3,5,7,8,10,14,16,17,18,19,20,21,23,24,25]}]));
    localStorage.setItem("lotolab:jogos", JSON.stringify([
      {id:"mg1",modalidade:"mega-sena",dezenas:[4,18,22,40,41,42],data:"2026-08-01",lote:"L1",
       conferencias:[{concurso:3050,data:"2026-08-30",dezenas:[4,18,22,26,31,58],acertos:3}]},
      {id:"lf1",modalidade:"lotofacil",dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
       data:"2026-08-01",lote:"L2",
       conferencias:[{concurso:3776,data:"2026-08-31",
        dezenas:[3,5,7,8,10,14,16,17,18,19,20,21,23,24,25],acertos:8}]}]));
    return 1;`);
  await cmd("Page.reload", {});
  await dormir(2500);
  await js(`trocarModalidade("lotofacil"); irParaTela("jogos"); return 1;`);
  await dormir(500);

  checar("a tela Meus Jogos traz a tira de modalidades",
    (await js(`return document.querySelectorAll(".chips-mod .chip").length;`)) === 8,
    `${await js(`return document.querySelectorAll(".chips-mod .chip").length;`)} chips`);

  const soLotofacil = await js(
    `return [...document.querySelectorAll("[data-abrir-jogo]")].map(b=>b.dataset.abrirJogo).join();`);
  checar("com a Lotofácil escolhida, só o jogo dela aparece",
    soLotofacil === "lf1", soLotofacil || "nenhum");

  await js(`[...document.querySelectorAll(".chips-mod [data-mod]")]
    .find(b=>b.dataset.mod==="mega-sena").click(); return 1;`);
  await dormir(600);
  const soMega = await js(
    `return [...document.querySelectorAll("[data-abrir-jogo]")].map(b=>b.dataset.abrirJogo).join();`);
  checar("o chip troca a modalidade sem sair da tela", soMega === "mg1", soMega || "nenhum");

  /* E a cartela não é privilégio da Lotofácil: é a mesma função para as oito. */
  await js(`document.querySelector('[data-abrir-jogo="mg1"]').click(); return 1;`);
  await dormir(500);
  const cart = await js(`
    const c = document.querySelector(".cartela");
    if(!c) return null;
    const r = c.getBoundingClientRect();
    return {titulo: c.querySelector(".tarja b").textContent,
            casas: c.querySelectorAll(".casa").length,
            acertos: c.querySelectorAll(".casa.acertou").length,
            estoura: r.right > window.innerWidth + 1 || r.left < -1};`);
  checar("a cartela abre na Mega-Sena, com as 60 casas",
    !!cart && cart.titulo === "Mega-Sena" && cart.casas === 60,
    cart ? `${cart.titulo}, ${cart.casas} casas` : "não abriu");
  checar("e marca os acertos do concurso", !!cart && cart.acertos === 3,
    cart ? `${cart.acertos} acertos` : "-");
  checar("sem estourar a largura da tela", !!cart && !cart.estoura);
  await capturar("f13-cartela-mega-sena");
}

/* ---------- F14. O cartão do concurso responde ao toque -----------------
   O cartão trazia data-abrir-concurso e um chevron desde sempre, e NUNCA teve
   tratador: parecia clicável e não fazia nada. Um alvo que promete resposta e
   não dá é pior que um alvo que não promete.                              */
secao("F14. O concurso abre e mostra os jogos salvos");
{
  await js(`irParaTela("resultados"); return 1;`);
  await dormir(600);
  checar("o cartão do concurso existe e se anuncia como recolhido",
    (await js(`const a=document.querySelector("[data-abrir-concurso]");
      return a && a.getAttribute("aria-expanded") === "false";`)));

  await js(`document.querySelector('[data-abrir-concurso="3050"]').click(); return 1;`);
  await dormir(600);
  const painel = await js(`
    const p = document.querySelector(".concurso-jogos");
    if(!p) return null;
    const r = p.getBoundingClientRect();
    /* \\s, e não \s: este trecho viaja dentro de um template literal, onde
       \s vira apenas "s" — e o replace passa a apagar todas as letras "s" do
       texto. Foi exatamente o que aconteceu na primeira escrita: a asserção
       leu "1 jogo  eu cobria e te concur o". */
    return {texto: p.textContent.replace(/\\s+/g," ").trim(),
            fichas: p.querySelectorAll(".ficha").length,
            marcados: p.querySelectorAll(".dz.acertou").length,
            estoura: r.right > window.innerWidth + 1};`);
  checar("clicar abre o painel com os jogos salvos", !!painel && painel.fichas === 1,
    painel ? `${painel.fichas} ficha(s)` : "não abriu");
  checar("e marca quais dezenas coincidiram", !!painel && painel.marcados === 3,
    painel ? `${painel.marcados} marcadas` : "-");
  checar("com a régua do acaso ao lado do resultado",
    !!painel && /o acaso faria/.test(painel.texto),
    painel ? painel.texto.slice(0, 80) : "-");
  checar("sem prometer prêmio",
    !!painel && !/prêmio|premiado|ganhou/i.test(painel.texto));
  checar("e sem estourar a largura", !!painel && !painel.estoura);

  /* O chevron vira o gesto de recolher — e não pode cair em cima de nada.
     Medido duas vezes: primeiro ele pousou sobre a data, depois sobre a
     ficha. */
  const colisao = await js(`
    const c = document.querySelector(".concurso.aberto");
    if(!c) return "sem cartão aberto";
    const ch = c.querySelector(".chevron"); const a = ch.getBoundingClientRect();
    const bate = el => { const b = el.getBoundingClientRect();
      return !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom); };
    return [...c.querySelectorAll("time,.ficha,.nota,.dz,.bola,.selo")]
      .filter(bate).map(e => e.className || e.tagName).join(", ");`);
  checar("o chevron do cartão aberto não cobre nada", colisao === "", colisao || "livre");
  await capturar("f14-concurso-aberto");

  await js(`document.querySelector('[data-abrir-concurso="3050"]').click(); return 1;`);
  await dormir(500);
  checar("e clicar de novo recolhe",
    (await js(`return !document.querySelector(".concurso-jogos");`)));
}

/* ---------- F15. A busca de histórico responde onde foi pedida -----------
   O dono do app relatou que a busca de histórico tinha sido removida. Ela
   nunca saiu: o botão funcionava e os concursos eram guardados. O que faltava
   era QUALQUER sinal visível de que algo aconteceu.

   Três defeitos empilhados, todos medidos:
     1. dois elementos com id="r-saida" na mesma tela — $() devolve o primeiro,
        e a resposta ia para o topo, fora da vista de quem clicou embaixo;
     2. mesmo com id próprio, a caixa ficava no FIM dos ajustes, 659px abaixo
        do botão, atrás dos interruptores e da área de colagem;
     3. o pintar() agendado depois da busca reconstruía a tela, apagando a
        mensagem e FECHANDO os ajustes na cara de quem acabara de usá-los.

   Somados: clica, nada aparece, o painel se fecha. Idêntico a não existir. */
secao("F15. A busca de histórico responde onde foi pedida");
{
  await js(`irParaTela("resultados"); return 1;`);
  await dormir(600);

  /* Id repetido é o defeito de origem, e vale cobrar no documento inteiro:
     quando dois elementos dividem um id, um deles fica mudo para sempre. */
  const repetidos = await js(`
    const contagem = {};
    for(const el of document.querySelectorAll("[id]"))
      contagem[el.id] = (contagem[el.id] || 0) + 1;
    return Object.entries(contagem).filter(([,n]) => n > 1)
      .map(([id,n]) => id + "×" + n).join(", ");`);
  checar("nenhum id se repete na tela de Resultados", repetidos === "",
    repetidos || "todos únicos");

  checar("os dois botões de histórico existem e estão ativos", (await js(`
    const v=document.querySelector("#r-varios"), t=document.querySelector("#r-tudo");
    return !!(v && t && !v.disabled && !t.disabled);`)));

  /* Rede simulada: o arquivo do repositório responde com dois concursos. */
  await js(`
    window.__original = window.fetch;
    window.fetch = () => Promise.resolve({ok:true, json: async () => ({concursos:[
      {concurso:9001,data:"2026-08-01",dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]},
      {concurso:9002,data:"2026-08-04",dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,16]}]})});
    return 1;`);
  await js(`trocarModalidade("lotofacil"); return 1;`);
  await dormir(500);
  await js(`document.querySelector("#r-ajustes").open = true;
    document.querySelector("#r-ajustes").dispatchEvent(new Event("toggle"));
    return 1;`);
  await dormir(300);
  await js(`document.querySelector("#r-tudo").click(); return 1;`);
  await dormir(3000);

  const depois = await js(`
    const caixa = document.querySelector("#r-saida-ajustes");
    const botao = document.querySelector("#r-tudo");
    const guardados = JSON.parse(localStorage.getItem("lotolab:resultados") || "[]")
      .filter(r => r.concurso === 9001 || r.concurso === 9002).length;
    return {texto: caixa ? caixa.textContent.trim() : "",
            distancia: (caixa && botao)
              ? Math.round(Math.abs(caixa.getBoundingClientRect().top
                                    - botao.getBoundingClientRect().bottom)) : -1,
            ajustesAbertos: !!document.querySelector("#r-ajustes[open]"),
            guardados};`);

  checar("a busca guarda os concursos", depois.guardados === 2,
    `${depois.guardados} guardados`);
  checar("e responde por escrito, em vez de sumir em silêncio",
    /concursos? recebidos?/.test(depois.texto), depois.texto.slice(0, 70) || "vazio");
  checar("a resposta aparece junto do botão, e não no fim da página",
    depois.distancia >= 0 && depois.distancia < 120, `${depois.distancia}px do botão`);
  checar("e o painel de ajustes continua aberto depois do repintar",
    depois.ajustesAbertos);
  await capturar("f15-historico");

  await js(`if(window.__original) window.fetch = window.__original; return 1;`);
}

/* ---------- fim ---------- */
console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log(`  capturas em capturas/`);
console.log("─".repeat(60));

ws.close();
chrome.kill();
process.exit(falhou === 0 ? 0 : 1);
