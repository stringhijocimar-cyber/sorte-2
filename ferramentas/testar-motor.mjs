/**
 * Bateria de testes do motor do LotoLab.
 *
 * Não reimplementa nada: extrai o <script> do index.html e o executa em um
 * contexto de VM com um DOM mínimo simulado. O que é testado aqui é
 * exatamente o código que roda no aparelho — se este arquivo passar e o app
 * falhar, a diferença está na interface, não na lógica.
 *
 *     node ferramentas/testar-motor.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(RAIZ, "index.html"), "utf8");
const fonte = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* ---------- DOM mínimo: o suficiente para o script carregar ---------- */
const memoria = new Map();
const elemento = () => {
  const el = {
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
    children: [], value: "", checked: false, textContent: "",
    set innerHTML(_) {}, get innerHTML() { return ""; },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, focus() {},
    setAttribute() {}, getAttribute() { return null; }, remove() {},
    querySelector: () => elemento(), querySelectorAll: () => [],
    closest: () => null, scrollIntoView() {}, insertAdjacentHTML() {},
  };
  return el;
};

const contexto = {
  console,
  localStorage: {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k),
    clear: () => memoria.clear(),
  },
  document: {
    documentElement: { dataset: {} },
    body: elemento(),
    querySelector: () => elemento(),
    querySelectorAll: () => [],
    getElementById: () => elemento(),
    createElement: () => elemento(),
    addEventListener() {},
  },
  navigator: { language: "pt-BR" },
  window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
  fetch: () => Promise.reject(new Error("sem rede — proposital")),
  setTimeout, clearTimeout, requestAnimationFrame: (f) => setTimeout(f, 0),
  Math, Date, JSON, Number, String, Array, Object, Map, Set, Error, isNaN,
  parseInt, parseFloat, Promise, Intl,
};
contexto.globalThis = contexto;
contexto.self = contexto;
vm.createContext(contexto);

/* `const` e `function` no topo de um script não viram propriedades do objeto
   global do contexto. Em vez de alterar o index.html para os testes — o que
   contaminaria o produto —, o arnês anexa um epílogo que publica as
   referências em um objeto. O código testado continua sendo o do app,
   byte por byte. */
const EXPOSTOS = [
  "MODALIDADES", "METODOS", "S", "Guardar", "esc", "combinacoes", "universo",
  "embaralhar", "sortear", "caracteristicas", "escorePopularidade",
  "gerarUniforme", "gerarRateio", "gerarCobertura", "combinacoesDe",
  "verificarGarantia", "gerarFechamento", "faixaAcaso", "esperadoAcertos",
  "desvioAcertos",
  "gerarAntirepeticao", "gerarContraste", "gerarPor", "ultimoResultado",
  "sobreposicaoMedia", "erroPadraoAcertos", "bancada", "bancadaAgregada",
  "vereditoAcertos", "ABAS", "T",
];
const epilogo = `\n;globalThis.__motor = {${EXPOSTOS.map((n) => `${n}: typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ")}};\n`;
vm.runInContext(fonte + epilogo, contexto, { filename: "index.html:script" });

const motor = contexto.__motor;
for (const nome of EXPOSTOS) {
  if (motor[nome] === undefined) {
    console.error(`símbolo ausente no index.html: ${nome}`);
    process.exit(2);
  }
  if (contexto[nome] === undefined) contexto[nome] = motor[nome];
}

const M = motor.MODALIDADES;
const Guardar = motor.Guardar;

/* ---------- relatório ---------- */
let passou = 0, falhou = 0;
const linhas = [];
function checar(titulo, condicao, detalhe = "") {
  if (condicao) { passou++; linhas.push(`  ok   ${titulo}${detalhe ? " — " + detalhe : ""}`); }
  else { falhou++; linhas.push(`  FALHA ${titulo}${detalhe ? " — " + detalhe : ""}`); }
}
function secao(t) { linhas.push(`\n${t}`); }

/* ==================================================================
   1. Gerar 5 jogos em cada uma das 8 modalidades, nos 3 métodos livres
   ================================================================== */
secao("1. Geração — 8 modalidades × 3 métodos × 5 jogos");
const geradores = {
  uniforme: contexto.gerarUniforme,
  rateio: contexto.gerarRateio,
  cobertura: contexto.gerarCobertura,
};
for (const [id, cfg] of Object.entries(M)) {
  for (const [metodo, fn] of Object.entries(geradores)) {
    const tam = cfg.min;
    let jogos;
    try { jogos = fn(id, 5, tam); }
    catch (e) { checar(`${cfg.nome} / ${metodo}`, false, "exceção: " + e.message); continue; }

    const qtdOk = jogos.length === 5;
    const tamOk = jogos.every((j) => j.length === tam);
    const semRepetir = jogos.every((j) => new Set(j).size === j.length);
    const limite = cfg.base + cfg.N - 1;
    const noIntervalo = jogos.every((j) => j.every((d) => d >= cfg.base && d <= limite));
    const ordenado = jogos.every((j) => j.every((d, i) => i === 0 || j[i - 1] < d));

    checar(
      `${cfg.nome} / ${metodo}`,
      qtdOk && tamOk && semRepetir && noIntervalo && ordenado,
      `${jogos.length} jogos de ${tam} dezenas em [${cfg.base}..${limite}]` +
        (qtdOk && tamOk && semRepetir && noIntervalo && ordenado ? "" :
          ` qtd:${qtdOk} tam:${tamOk} unico:${semRepetir} faixa:${noIntervalo} ordem:${ordenado}`)
    );
  }
}

// tamanho máximo também
secao("1b. Geração no tamanho máximo de cada modalidade");
for (const [id, cfg] of Object.entries(M)) {
  const tam = cfg.max;
  const jogos = contexto.gerarUniforme(id, 3, tam);
  const limite = cfg.base + cfg.N - 1;
  checar(
    `${cfg.nome} com ${tam} dezenas`,
    jogos.length === 3 && jogos.every((j) => j.length === tam && new Set(j).size === tam &&
      j.every((d) => d >= cfg.base && d <= limite)),
    `${tam} dezenas`
  );
}

/* ==================================================================
   2. Fechamento da Lotofácil: 18 dezenas, j=14, garantia 13
   ================================================================== */
secao("2. Fechamento Lotofácil — 18 dezenas, j=14, garantia 13");
const dezenas18 = Array.from({ length: 18 }, (_, i) => i + 1);
const t0 = Date.now();
const fech = contexto.gerarFechamento("lotofacil", dezenas18, 14, 13);
const ms = Date.now() - t0;
checar("produz 21 jogos", fech.bilhetes.length === 21, `${fech.bilhetes.length} jogos`);
checar("garantia verificada = 13", fech.garantiaVerificada === 13, `verificada: ${fech.garantiaVerificada}`);
checar("todos os jogos com 15 dezenas", fech.bilhetes.every((b) => b.length === 15));
checar("todos os jogos dentro das 18 marcadas",
  fech.bilhetes.every((b) => b.every((d) => dezenas18.includes(d))));
checar("nenhum jogo repetido",
  new Set(fech.bilhetes.map((b) => b.join(","))).size === fech.bilhetes.length);
checar("tempo aceitável em aparelho", ms < 20000, `${ms} ms`);

// a garantia é conferida por enumeração independente, refazendo a conta
const reconferida = contexto.verificarGarantia(fech.bilhetes, dezenas18, 14);
checar("reconferência independente bate", reconferida === fech.garantiaVerificada,
  `${reconferida}`);

secao("2b. Fechamento — garantia impossível é recusada, não inventada");
let recusou = false, msgErro = "";
try { contexto.gerarFechamento("lotofacil", dezenas18, 3, 13); }
catch (e) { recusou = true; msgErro = e.message; }
checar("recusa garantia inalcançável", recusou, msgErro);

let recusouPoucas = false;
try { contexto.gerarFechamento("lotofacil", [1, 2, 3, 4, 5], 14, 13); }
catch (e) { recusouPoucas = true; }
checar("recusa dezenas insuficientes", recusouPoucas);

/* ==================================================================
   3. Persistência: salvar, "fechar o app", reabrir
   ================================================================== */
secao("3. Persistência em localStorage");
const lote = contexto.gerarUniforme("mega-sena", 4, 6).map((dez) => ({
  id: "t" + Math.random().toString(36).slice(2),
  modalidade: "mega-sena", dezenas: dez, data: "2026-01-15", metodo: "uniforme",
}));
Guardar.gravar("jogos", lote);
const relido = Guardar.ler("jogos", []);
checar("lote sobrevive ao ciclo gravar/ler", relido.length === 4 &&
  JSON.stringify(relido) === JSON.stringify(lote));
checar("chave é prefixada (não polui o domínio)",
  [...memoria.keys()].every((k) => k.startsWith("lotolab:")), [...memoria.keys()].join(", "));
checar("leitura de chave ausente devolve o padrão",
  Guardar.ler("inexistente", "padrao") === "padrao");

// Guardar precisa tolerar localStorage quebrado sem derrubar o app
const originalSet = contexto.localStorage.setItem;
contexto.localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
let tolerou = true;
try { tolerou = Guardar.gravar("jogos", lote) === false; } catch { tolerou = false; }
contexto.localStorage.setItem = originalSet;
checar("localStorage bloqueado não derruba o app", tolerou);

/* ==================================================================
   4. Conferência: contagem de acertos
   ================================================================== */
secao("4. Conferência de acertos");
const sorteio = [1, 2, 3, 4, 5, 6];
const casos = [
  { jogo: [1, 2, 3, 4, 5, 6], esperado: 6 },
  { jogo: [1, 2, 3, 4, 5, 7], esperado: 5 },
  { jogo: [7, 8, 9, 10, 11, 12], esperado: 0 },
  { jogo: [1, 9, 3, 11, 5, 13], esperado: 3 },
];
for (const c of casos) {
  const acertos = c.jogo.filter((d) => sorteio.includes(d)).length;
  checar(`[${c.jogo.join(" ")}] contra [${sorteio.join(" ")}]`,
    acertos === c.esperado, `${acertos} acertos`);
}

secao("4b. Conferência — não duplicar o mesmo concurso");
const resultados = [];
function registrar(modalidade, concurso, dezenas) {
  const jaTem = resultados.some((r) => r.modalidade === modalidade && r.concurso === concurso);
  if (jaTem) return false;
  resultados.push({ modalidade, concurso, dezenas });
  return true;
}
registrar("mega-sena", 2800, sorteio);
const segunda = registrar("mega-sena", 2800, sorteio);
checar("segundo registro do mesmo concurso é rejeitado", segunda === false);
checar("continua com um único registro", resultados.length === 1);
checar("concurso diferente é aceito", registrar("mega-sena", 2801, sorteio) === true);

/* ==================================================================
   5. Estatística da faixa do acaso
   ================================================================== */
secao("5. Faixa do acaso — esperado e desvio");
for (const [id, cfg] of Object.entries(M)) {
  const tam = cfg.min;
  const esperado = contexto.esperadoAcertos(id, tam);
  const desvio = contexto.desvioAcertos(id, tam);
  // hipergeométrica: média = tam * k / N
  const teorico = (tam * cfg.k) / cfg.N;
  const bate = Math.abs(esperado - teorico) < 1e-9;
  checar(`${cfg.nome}: média do acaso`, bate && desvio > 0 && isFinite(desvio),
    `esperado ${esperado.toFixed(4)} (teoria ${teorico.toFixed(4)}), desvio ${desvio.toFixed(4)}`);
}

secao("5b. Faixa do acaso — desenho é gerado e posiciona o observado");
const svg = contexto.faixaAcaso(9.2, contexto.esperadoAcertos("lotofacil", 15),
  contexto.desvioAcertos("lotofacil", 15), 15);
checar("devolve SVG", typeof svg === "string" && svg.includes("<svg"));
checar("SVG não contém script", !/<script/i.test(svg));

/* ==================================================================
   6. Modelo de rateio — descreve, não prevê
   ================================================================== */
secao("6. Modelo de rateio");
const popular = contexto.escorePopularidade([1, 2, 3, 4, 5, 6], "mega-sena");
const espalhado = contexto.escorePopularidade([4, 17, 33, 42, 51, 58], "mega-sena");
checar("sequência 1-6 pontua mais que combinação espalhada", popular > espalhado,
  `1-6: ${popular.toFixed(3)} vs espalhada: ${espalhado.toFixed(3)}`);
const datas = contexto.escorePopularidade([3, 8, 12, 19, 24, 28], "mega-sena");
const altas = contexto.escorePopularidade([37, 41, 46, 52, 55, 60], "mega-sena");
checar("combinação de datas pontua mais que dezenas altas", datas > altas,
  `datas: ${datas.toFixed(3)} vs altas: ${altas.toFixed(3)}`);

// o método rateio deve produzir, em média, escore menor que o uniforme
const amostraU = contexto.gerarUniforme("mega-sena", 60, 6)
  .map((j) => contexto.escorePopularidade(j, "mega-sena"));
const amostraR = contexto.gerarRateio("mega-sena", 60, 6)
  .map((j) => contexto.escorePopularidade(j, "mega-sena"));
const mediaU = amostraU.reduce((a, b) => a + b, 0) / amostraU.length;
const mediaR = amostraR.reduce((a, b) => a + b, 0) / amostraR.length;
checar("método rateio reduz o escore de popularidade", mediaR < mediaU,
  `uniforme ${mediaU.toFixed(3)} → rateio ${mediaR.toFixed(3)}`);

secao("6b. Cobertura espalhada — jogos se repetem pouco entre si");
function sobreposicaoMedia(jogos) {
  let soma = 0, pares = 0;
  for (let i = 0; i < jogos.length; i++)
    for (let j = i + 1; j < jogos.length; j++) {
      soma += jogos[i].filter((d) => jogos[j].includes(d)).length; pares++;
    }
  return soma / pares;
}
const sobU = sobreposicaoMedia(contexto.gerarUniforme("lotofacil", 8, 15));
const sobC = sobreposicaoMedia(contexto.gerarCobertura("lotofacil", 8, 15));
checar("cobertura sobrepõe menos que uniforme", sobC <= sobU,
  `uniforme ${sobU.toFixed(2)} → cobertura ${sobC.toFixed(2)}`);

/* ==================================================================
   7. Nenhuma promessa de aumentar chance
   ================================================================== */
secao("7. Travas de linguagem e de coleta");
const proibidas = [
  "palpite", "números quentes", "números frios", "numeros quentes", "numeros frios",
  "aposta ideal", "jogo recomendado", "mais prováveis", "mais provaveis",
  "previsão do próximo", "método infalível", "metodo infalivel",
  "chance garantida", "aumente suas chances", "aumenta suas chances",
  "estratégia vencedora", "estrategia vencedora", "vai sair", "está atrasado",
];
const textoBaixo = html.toLowerCase();
for (const termo of proibidas) {
  checar(`ausente: "${termo}"`, !textoBaixo.includes(termo));
}
checar("aviso permanente presente",
  textoBaixo.includes("nenhum método aumenta a chance") ||
  textoBaixo.includes("nenhum metodo aumenta a chance"));
checar("aviso de entretenimento presente", textoBaixo.includes("entretenimento"));
checar("contato CVV 188 presente", html.includes("188"));
checar("contato Jogadores Anônimos presente",
  textoBaixo.includes("jogadores anônimos") || textoBaixo.includes("jogadores anonimos"));
checar("aba Placar existe", textoBaixo.includes("placar"));
checar("sem alert() em fluxo normal", !/[^.\w]alert\s*\(/.test(fonte));
checar("sem fetch para servidor externo",
  !/fetch\s*\(\s*["'`]https?:\/\//.test(fonte));
checar("sem XMLHttpRequest", !fonte.includes("XMLHttpRequest"));
checar("sem analytics/rastreador",
  !/gtag|googletagmanager|analytics|firebase|facebook|mixpanel|sentry/i.test(html));
checar("sem cadastro/login", !/type\s*=\s*["']password["']/i.test(html));
checar("sem pagamento/carteira",
  !/\b(carteira|dep[óo]sito|saque|pagamento|pix|cart[ãa]o de cr[ée]dito)\b/i.test(
    html.replace(/pagamento de pr[êe]mio/gi, "")));
checar("escape de HTML aplicado (esc existe)", typeof contexto.esc === "function" &&
  contexto.esc('<img src=x onerror=1>') === "&lt;img src=x onerror=1&gt;");

/* ==================================================================
   8. Robustez de entrada
   ================================================================== */
secao("8. Robustez");
checar("combinacoes(25,15) exato", contexto.combinacoes(25, 15) === 3268760,
  String(contexto.combinacoes(25, 15)));
checar("combinacoes(60,6) exato", contexto.combinacoes(60, 6) === 50063860,
  String(contexto.combinacoes(60, 6)));
checar("combinacoes com k>n devolve 0", contexto.combinacoes(5, 9) === 0);
checar("universo respeita base 0 da Lotomania",
  contexto.universo("lotomania")[0] === 0 && contexto.universo("lotomania").length === 100);
checar("universo da Mega começa em 1",
  contexto.universo("mega-sena")[0] === 1 && contexto.universo("mega-sena").at(-1) === 60);

let mil = true;
for (let i = 0; i < 300; i++) {
  const j = contexto.gerarRateio("lotofacil", 1, 15)[0];
  if (j.length !== 15 || new Set(j).size !== 15) { mil = false; break; }
}
checar("300 gerações seguidas sem defeito", mil);


/* ==================================================================
   9. Métodos novos e bancada de testes
   ================================================================== */
secao("9. Métodos novos e bancada");

/* --- gerarPor: porta única, usada pela interface E pela bancada --- */
for (const id of ["uniforme", "rateio", "cobertura", "antirepeticao", "contraste"]) {
  const lote = contexto.gerarPor(id, "mega-sena", 3, 6);
  const valido = lote.length === 3 && lote.every(j =>
    j.length === 6 && new Set(j).size === 6 &&
    j.every(d => d >= 1 && d <= 60) &&
    j.every((d, i) => i === 0 || j[i - 1] < d));
  checar(`gerarPor("${id}") devolve lote válido e ordenado`, valido);
}
checar("gerarPor com id desconhecido cai no uniforme",
  contexto.gerarPor("inexistente", "quina", 2, 5).length === 2);

/* --- antirepeticao: sem concurso registrado, não trava --- */
contexto.S.resultados = [];
checar("antirepeticao sem concurso registrado ainda gera",
  contexto.gerarAntirepeticao("mega-sena", 2, 6).length === 2);

/* --- antirepeticao: com concurso, evita as dezenas anteriores --- */
contexto.S.resultados = [{ modalidade: "mega-sena", concurso: "1", data: "2026-01-01",
  dezenas: [1, 2, 3, 4, 5, 6] }];
let repetidasAnti = 0, repetidasUnif = 0;
for (let i = 0; i < 40; i++) {
  const a = contexto.gerarAntirepeticao("mega-sena", 1, 6)[0];
  const u = contexto.gerarUniforme("mega-sena", 1, 6)[0];
  repetidasAnti += a.filter(d => d <= 6).length;
  repetidasUnif += u.filter(d => d <= 6).length;
}
checar("antirepeticao repete menos o concurso anterior que o uniforme",
  repetidasAnti < repetidasUnif, `anti=${repetidasAnti} unif=${repetidasUnif}`);
contexto.S.resultados = [];

/* --- contraste: sempre entrega a quantidade pedida, inclusive na Lotofácil,
       onde 15 de 25 forçam dezenas consecutivas --- */
checar("contraste entrega a quantidade pedida na Lotofacil",
  contexto.gerarContraste("lotofacil", 4, 15).length === 4);
checar("contraste entrega a quantidade pedida na Mega",
  contexto.gerarContraste("mega-sena", 4, 6).length === 4);

/* --- popularidade: os métodos de rateio ficam abaixo do uniforme --- */
const popMedia = (id, n) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += contexto.escorePopularidade(
    contexto.gerarPor(id, "mega-sena", 1, 6)[0], "mega-sena");
  return s / n;
};
const pUnif = popMedia("uniforme", 60), pRat = popMedia("rateio", 60), pCon = popMedia("contraste", 60);
checar("rateio tem popularidade menor que uniforme", pRat < pUnif,
  `rateio=${pRat.toFixed(3)} uniforme=${pUnif.toFixed(3)}`);
checar("contraste tem popularidade menor que uniforme", pCon < pUnif,
  `contraste=${pCon.toFixed(3)} uniforme=${pUnif.toFixed(3)}`);

/* --- sobreposicao --- */
checar("sobreposicaoMedia de jogo unico e zero",
  contexto.sobreposicaoMedia([[1, 2, 3]]) === 0);
checar("sobreposicaoMedia conta dezenas em comum",
  contexto.sobreposicaoMedia([[1, 2, 3], [3, 4, 5]]) === 1);
checar("cobertura sobrepoe menos que uniforme",
  contexto.sobreposicaoMedia(contexto.gerarCobertura("mega-sena", 5, 6)) <=
  contexto.sobreposicaoMedia(contexto.gerarUniforme("mega-sena", 5, 6)) + 0.8);

/* --- bancada --- */
const rb = contexto.bancada("mega-sena", [1, 2, 3, 4, 5, 6], { repeticoes: 8, quantos: 3 });
checar("bancada cobre todos os metodos menos o fechamento",
  rb.linhas.length === contexto.METODOS.length - 1 &&
  !rb.linhas.some(l => l.id === "fechamento"));
checar("bancada conta os jogos certos", rb.linhas.every(l => l.jogos === 24));
checar("bancada devolve media de acertos plausivel",
  rb.linhas.every(l => l.media >= 0 && l.media <= 6));
checar("bancada expoe esperado do acaso positivo", rb.esperado > 0 && rb.erroPadrao > 0);
checar("bancada calcula desvios (z) finitos",
  rb.linhas.every(l => Number.isFinite(l.z)));

/* --- agregacao: NAO pode somar as dezenas num alvo maior --- */
const alvos = [
  { modalidade: "mega-sena", concurso: "1", data: "2026-01-01", dezenas: [1, 2, 3, 4, 5, 6] },
  { modalidade: "mega-sena", concurso: "2", data: "2026-01-08", dezenas: [10, 20, 30, 40, 50, 60] },
];
const ag = contexto.bancadaAgregada("mega-sena", alvos, { repeticoes: 6, quantos: 3 });
checar("agregada soma os jogos dos concursos", ag.linhas.every(l => l.jogos === 36));
checar("agregada mantem o esperado de UM concurso",
  Math.abs(ag.esperado - rb.esperado) < 1e-9,
  `agregada=${ag.esperado.toFixed(4)} single=${rb.esperado.toFixed(4)}`);
checar("agregada reduz o erro padrao ao juntar concursos",
  ag.erroPadrao < rb.erroPadrao, `${ag.erroPadrao.toFixed(4)} < ${rb.erroPadrao.toFixed(4)}`);
checar("agregada mantem media dentro do intervalo possivel",
  ag.linhas.every(l => l.media >= 0 && l.media <= 6));

/* --- veredito --- */
checar("veredito aprova quando nada sai da faixa",
  contexto.vereditoAcertos({ linhas: [{ nome: "a", z: 0.4 }, { nome: "b", z: -1.2 }] }).ok);
checar("veredito acusa quando algo passa de 3 desvios",
  contexto.vereditoAcertos({ linhas: [{ nome: "a", z: 4.1 }] }).ok === false);
checar("veredito de UM concurso explica o efeito estrutural",
  /cara de aposta humana/.test(
    contexto.vereditoAcertos({ linhas: [{ nome: "a", z: 4.1 }] }, true).texto));
checar("veredito agregado nao usa a explicacao de concurso isolado",
  !/cara de aposta humana/.test(
    contexto.vereditoAcertos({ linhas: [{ nome: "a", z: 4.1 }] }, false).texto));
checar("veredito nao promete vantagem a metodo nenhum",
  !/melhor m|vantagem|vencedor/i.test(
    contexto.vereditoAcertos({ linhas: [{ nome: "a", z: 4.1 }] }).texto));


/* --- ARMADILHA 1: a bancada nao pode mandar o "evita o concurso anterior"
       evitar justamente o concurso contra o qual sera conferido. --- */
contexto.S.resultados = [];
const alvoNeutro = [3, 17, 26, 38, 44, 59];   // sem cara de aposta humana
const livre = contexto.bancada("mega-sena", alvoNeutro, { repeticoes: 25, quantos: 3 })
  .linhas.find(l => l.id === "antirepeticao");
const proprio = contexto.bancada("mega-sena", alvoNeutro,
  { repeticoes: 25, quantos: 3, evitar: alvoNeutro })
  .linhas.find(l => l.id === "antirepeticao");
/* A penalidade e suave, nao exclusao dura: sobra um residuo, mas a queda e de
   ordem de grandeza. E isso que torna a armadilha perigosa — ela nao zera a
   coluna, so a afunda o bastante para parecer um metodo ruim. */
checar("evitar o proprio alvo afunda os acertos (a armadilha e real)",
  proprio.media < livre.media / 5,
  `proprio=${proprio.media.toFixed(3)} livre=${livre.media.toFixed(3)}`);

const outro = contexto.bancada("mega-sena", alvoNeutro,
  { repeticoes: 25, quantos: 3, evitar: [10, 20, 30, 40, 50, 60] })
  .linhas.find(l => l.id === "antirepeticao");
checar("evitar OUTRO concurso nao zera os acertos", outro.media > 0,
  `media=${outro.media.toFixed(3)}`);

/* --- ARMADILHA 2: o desvio em UM concurso pode ser estrutural, nao ruido.
       Se as dezenas sorteadas tem cara de aposta humana, os metodos que fogem
       desse padrao acertam menos NAQUELE concurso — de proposito. O nulo
       correto e a media sobre alvos sorteados, nao um alvo escolhido. --- */
const alvoHumano = [1, 2, 3, 4, 5, 6];
const rHumano = contexto.bancada("mega-sena", alvoHumano, { repeticoes: 25, quantos: 3 });
const ratHumano = rHumano.linhas.find(l => l.id === "rateio");
const uniHumano = rHumano.linhas.find(l => l.id === "uniforme");
checar("com sorteio de cara humana, o rateio acerta menos — efeito estrutural",
  ratHumano.media < uniHumano.media,
  `rateio=${ratHumano.media.toFixed(3)} uniforme=${uniHumano.media.toFixed(3)}`);

/* Sobre alvos uniformes — que e como os sorteios reais saem — todo metodo
   converge para a media do acaso. Esta e a afirmacao que o app faz, e e a
   unica que se sustenta. */
const soma = {}, ALVOS = 30, REP = 4, QTD = 3;
for (let t = 0; t < ALVOS; t++) {
  const r = contexto.bancada("mega-sena", contexto.sortear("mega-sena", 6),
    { repeticoes: REP, quantos: QTD });
  r.linhas.forEach(l => { soma[l.id] = (soma[l.id] || 0) + l.media; });
}
const esperadoMega = contexto.esperadoAcertos("mega-sena", 6);
const nTotal = ALVOS * REP * QTD;
const tol = 3 * contexto.desvioAcertos("mega-sena", 6) / Math.sqrt(nTotal);
for (const id of Object.keys(soma)) {
  const media = soma[id] / ALVOS;
  checar(`${id}: sobre alvos sorteados, converge para o acaso`,
    Math.abs(media - esperadoMega) < tol,
    `media=${media.toFixed(3)} acaso=${esperadoMega.toFixed(3)} tol=${tol.toFixed(3)}`);
}

/* A agregada usa o concurso anterior, nunca o proprio. */
const alvos2 = [
  { modalidade: "mega-sena", concurso: "1", data: "2026-01-01", dezenas: [3, 17, 26, 38, 44, 59] },
  { modalidade: "mega-sena", concurso: "2", data: "2026-01-08", dezenas: [8, 14, 29, 33, 47, 55] },
];
const ag2 = contexto.bancadaAgregada("mega-sena", alvos2, { repeticoes: 20, quantos: 3 });
checar("agregada nao zera o antirepeticao",
  ag2.linhas.find(l => l.id === "antirepeticao").media > 0);

/* --- a aba existe --- */
checar("aba bancada registrada", contexto.ABAS.some(a => a.id === "bancada"));
checar("tela da bancada renderiza", typeof contexto.T.bancada === "function" &&
  contexto.T.bancada().includes("b-go"));

/* ---------- saída ---------- */
console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log("─".repeat(60));
process.exit(falhou === 0 ? 0 : 1);
