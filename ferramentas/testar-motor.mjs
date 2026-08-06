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

/* Math.random determinístico dentro da VM.

   Os testes de convergência comparam a média de acertos contra o acaso com
   tolerância de 3 erros-padrão, em cinco métodos. Com Math.random de verdade,
   alguns por cento das execuções falham sozinhas — e um teste que falha por
   acaso ensina a ignorar falha, que é o oposto do que ele existe para fazer.
   (Aconteceu: uma execução acusou o antirepeticao em 0,486 contra 0,600; com
   amostra dez vezes maior o mesmo método ficou em z = +1,35.)

   O Proxy troca só `random` e deixa o resto de Math intacto, sem tocar no
   Math do processo que roda o arnês. */
function mathSemeado(semente = 20260806) {
  let x = semente;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  return new Proxy(Math, { get: (alvo, prop) => (prop === "random" ? rnd : alvo[prop]) });
}

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
  Math: mathSemeado(), Date, JSON, Number, String, Array, Object, Map, Set, Error, isNaN,
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
  "vereditoAcertos", "SECOES", "T", "cartela", "faixaAtingida",
  "concursosDoJogo", "lerColagem", "normalizarCaixa", "guardarResultados",
  "dataBrParaIso", "SLUG_CAIXA",
  "auc", "logLoss", "sigmoide", "treinarLogistica", "permutarAuc",
  "atributosDezena", "dadosAprendizado", "aprender", "vereditoAprendizado",
  "MINIMO_CONCURSOS", "NOMES_ATRIBUTOS", "blocoDaModalidade",
  "fibonacciAte", "observacoes", "PESOS", "referencia",
  "porDezena", "contagemPorConcurso", "repeticoesAnterior", "somaDasDezenas",
  "calibrarPopularidade", "minimosQuadrados", "premioDoAcerto", "pesosVigentes",
  "proximoConcurso", "diasAte", "cartaoProximo", "INTERVALO_BUSCA",
  "MINIMO_CALIBRACAO", "ATRIBUTOS_POPULARIDADE",
  "sequencias", "ciclos", "linhasEColunas", "historicoDe", "TIPOS_ESTATISTICA",
  "assinaturaHistorico", "modalidadesPendentes", "analisarPendentes", "aplicarCorrecao",
  "aoMudarHistorico", "guardarResultados",
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
checar("aba bancada registrada",
  contexto.SECOES.some(s => s.telas.some(t => t.id === "bancada")));
checar("tela da bancada renderiza", typeof contexto.T.bancada === "function" &&
  contexto.T.bancada().includes("b-go"));

/* ==================================================================
   9. Aprendizado por modalidade
   ================================================================== */
secao("9. Aprendizado — AUC, permutação e ausência de vazamento");

const auc = contexto.auc;
checar("AUC de separacao perfeita é 1",
  auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]) === 1, `${auc([0.1,0.2,0.8,0.9],[0,0,1,1])}`);
checar("AUC de separacao invertida é 0",
  auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]) === 0);
checar("AUC de escores todos iguais é 0,5 (empate vale meio)",
  auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]) === 0.5);
checar("AUC ignora a escala do escore",
  Math.abs(auc([1, 2, 3, 4], [0, 0, 1, 1]) - auc([10, 20, 30, 40], [0, 0, 1, 1])) < 1e-12);
{
  // Mann-Whitney conferido à mão: escores 1,2,3 com rótulos 0,1,0
  // pares (pos,neg): (2>1) acerta, (2<3) erra -> AUC = 0.5
  checar("AUC conferido à mão num caso pequeno", auc([1, 2, 3], [0, 1, 0]) === 0.5,
    `${auc([1,2,3],[0,1,0])}`);
}

checar("logLoss pune confiança errada",
  contexto.logLoss([0.99], [0]) > contexto.logLoss([0.51], [0]));
checar("logLoss de previsão perfeita é ~0", contexto.logLoss([1, 0], [1, 0]) < 1e-9);

/* Regressão logística: precisa aprender um padrão que EXISTE. Sem este teste,
   um modelo quebrado passaria pelos testes de ausência de sinal — que é
   justamente o que ele produziria sempre. */
{
  const X = [], y = [];
  let semente = 7;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) {
    const x1 = rnd(), x2 = rnd();
    X.push([x1, x2, 0, 0, 0]);
    y.push(x1 > 0.5 ? 1 : 0);          // rótulo depende só de x1
  }
  const idx = X.map((_, i) => i);
  const modelo = contexto.treinarLogistica(X, y, idx, { epocas: 400, taxa: 1.2 });
  const escores = idx.map(i => modelo.prever(X[i]));
  const a = auc(escores, y);
  checar("logística aprende um padrão que existe", a > 0.9, `AUC treino = ${a.toFixed(4)}`);
  checar("o peso vai para a característica certa",
    Math.abs(modelo.w[0]) > Math.abs(modelo.w[1]) * 3,
    `w1=${modelo.w[0].toFixed(3)} w2=${modelo.w[1].toFixed(3)}`);
}

/* Nuvem de permutação: tem de cercar 0,5 e não conter quase nada. */
{
  let semente = 99;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const escores = Array.from({ length: 300 }, () => rnd());
  const rotulos = Array.from({ length: 300 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  const nulos = contexto.permutarAuc(escores, rotulos, 300, rnd);
  const media = nulos.reduce((a, b) => a + b, 0) / nulos.length;
  checar("a nuvem de permutação fica centrada em 0,5", Math.abs(media - 0.5) < 0.02,
    `média = ${media.toFixed(4)}`);
  checar("a nuvem tem largura, não é um ponto", nulos[299] - nulos[0] > 0.05,
    `de ${nulos[0].toFixed(3)} a ${nulos[299].toFixed(3)}`);
}

/* Vazamento: as características de um concurso não podem usar o próprio
   concurso. Se usassem, "saiu no anterior" viraria "saiu agora" e o AUC
   estouraria — é o defeito mais fácil de cometer e o mais invisível. */
{
  const c = M["lotofacil"];
  const anteriores = [{ dezenas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }];
  const dentro = contexto.atributosDezena(1, anteriores, c);
  const fora = contexto.atributosDezena(25, anteriores, c);
  checar("atributos vêm só do passado: saiu-no-anterior distingue",
    dentro[3] === 1 && fora[3] === 0);
  checar("atributos ficam todos em [0,1]",
    dentro.concat(fora).every(v => v >= 0 && v <= 1),
    `${dentro.map(v => v.toFixed(2)).join(",")}`);
}

/* Ponta a ponta com sorteios independentes: o veredito TEM de ser "sem sinal".
   Este é o teste que impede o app de virar uma máquina de prometer previsão. */
{
  const original = motor.S.resultados;
  let semente = 2026;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const hist = [];
  for (let i = 1; i <= 140; i++) {
    const pool = Array.from({ length: 25 }, (_, k) => k + 1);
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
    }
    hist.push({ concurso: i, data: "2025-01-01", modalidade: "lotofacil",
                dezenas: pool.slice(0, 15).sort((a, b) => a - b) });
  }
  motor.S.resultados = hist;
  const d = contexto.dadosAprendizado("lotofacil");
  checar("o corte temporal não sobrepõe treino e teste",
    Math.max(...d.treino) < Math.min(...d.teste));
  checar("o corte separa por concurso, não por linha",
    d.concursosTreino > 0 && d.concursosTeste > 0,
    `${d.concursosTreino} treino / ${d.concursosTeste} teste`);

  const r = contexto.aprender("lotofacil", { permutacoes: 200 });
  checar("sorteios independentes: o modelo NÃO aprende", r.aprendeu === false,
    `AUC=${r.auc.toFixed(4)} p=${r.p.toFixed(3)} faixa=[${r.faixaAcaso.map(v => v.toFixed(4)).join(", ")}]`);
  checar("AUC fica perto de 0,5", Math.abs(r.auc - 0.5) < 0.06, `${r.auc.toFixed(4)}`);
  checar("o veredito diz que é o resultado esperado",
    /resultado esperado/i.test(contexto.vereditoAprendizado(r)));
  checar("o veredito não promete previsão",
    !/prev[êe] o pr[óo]ximo|aumenta a chance/i.test(contexto.vereditoAprendizado(r)));
  checar("todos os pesos são nomeados",
    r.pesos.length === contexto.NOMES_ATRIBUTOS.length &&
    r.pesos.every(x => typeof x.nome === "string" && x.nome.length > 0));

  /* Reprodutibilidade: a primeira versão usava Math.random no teste de
     permutação, e o veredito podia mudar sem dado novo. Este teste é a trava. */
  {
    const a1 = contexto.aprender("lotofacil", { permutacoes: 200 });
    const a2 = contexto.aprender("lotofacil", { permutacoes: 200 });
    checar("o mesmo histórico dá exatamente o mesmo p-valor",
      a1.p === a2.p && a1.faixaAcaso[0] === a2.faixaAcaso[0] &&
      a1.faixaAcaso[1] === a2.faixaAcaso[1] && a1.aprendeu === a2.aprendeu,
      `p=${a1.p} vs ${a2.p}`);
    const a3 = contexto.aprender("lotofacil", { permutacoes: 200, semente: 12345 });
    checar("semente diferente muda a nuvem do acaso (a semente é usada)",
      a3.faixaAcaso[0] !== a1.faixaAcaso[0] || a3.faixaAcaso[1] !== a1.faixaAcaso[1]);
    checar("o AUC não depende da semente — só a nuvem depende", a3.auc === a1.auc);
    checar("a semente é reportada junto do resultado", a1.semente === 20260730);
  }

  checar("histórico curto é recusado com o número que falta",
    (() => { motor.S.resultados = hist.slice(0, 20);
             const x = contexto.dadosAprendizado("lotofacil");
             return !!x.erro && x.precisa === contexto.MINIMO_CONCURSOS && x.tem === 20; })());
  motor.S.resultados = original;
}

/* Um sorteio VICIADO tem de ser detectado. Sem este teste, "não aprendeu" seria
   indistinguível de um medidor cego. */
{
  const original = motor.S.resultados;
  let semente = 31337;
  const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const hist = [];
  for (let i = 1; i <= 140; i++) {
    // Dezenas 1..8 saem sempre; as outras 7 vagas são sorteadas entre 9..25.
    const resto = Array.from({ length: 17 }, (_, k) => k + 9);
    for (let k = resto.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = resto[k]; resto[k] = resto[j]; resto[j] = t;
    }
    hist.push({ concurso: i, data: "2025-01-01", modalidade: "lotofacil",
                dezenas: [1,2,3,4,5,6,7,8].concat(resto.slice(0, 7)).sort((a,b)=>a-b) });
  }
  motor.S.resultados = hist;
  const r = contexto.aprender("lotofacil", { permutacoes: 200 });
  checar("sorteio viciado É detectado (o medidor não é cego)", r.aprendeu === true,
    `AUC=${r.auc.toFixed(4)} p=${r.p.toFixed(3)}`);
  checar("mesmo detectando, o veredito não manda apostar",
    /não[\s\S]*é prova de sinal/i.test(contexto.vereditoAprendizado(r)));
  motor.S.resultados = original;
}

checar("tela de aprendizado renderiza", typeof contexto.T.aprendizado() === "string" &&
  contexto.T.aprendizado().length > 200);
checar("aba aprendizado registrada",
  contexto.SECOES.some(s => s.telas.some(t => t.id === "aprendizado")));

/* ==================================================================
   10. Placar separado por modalidade
   ================================================================== */
secao("10. Placar — cada loteria com o seu próprio placar");

{
  const original = { jogos: motor.S.jogos, teim: motor.S.teimosinhas };
  /* Mega-Sena e Lotofácil juntas. O acaso espera 0,6 acerto numa e 9,0 na
     outra: se o placar somasse as duas, a média sairia perto de 4,8 e não
     descreveria nem uma nem outra. */
  motor.S.jogos = [
    { id: "a", modalidade: "mega-sena", dezenas: [1,2,3,4,5,6], metodo: "uniforme",
      data: "2025-01-01", lote: "L1",
      conferencias: [{ concurso: 10, data: "2025-01-02", dezenas: [1,2,7,8,9,10], acertos: 2 }] },
    { id: "b", modalidade: "lotofacil",
      dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], metodo: "uniforme",
      data: "2025-01-01", lote: "L2",
      conferencias: [{ concurso: 20, data: "2025-01-02",
        dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,16,17], acertos: 13 }] },
  ];
  motor.S.teimosinhas = [];

  const tela = contexto.T.placar();
  checar("o placar nomeia as duas modalidades",
    /Mega-Sena/.test(tela) && /Lotofácil/.test(tela));
  checar("avisa que cada loteria tem o seu placar",
    /Cada loteria tem o seu placar/.test(tela));
  checar("a média conjunta 7,5 NÃO aparece — seria a soma indevida",
    !/7,500/.test(tela), "média de (2+13)/2 não pode existir na tela");

  /* Cada bloco compara contra o esperado da SUA modalidade. */
  const mega = contexto.blocoDaModalidade("mega-sena", [
    { concurso: 10, acertos: 2, tamanho: 6, metodo: "uniforme" }]);
  const facil = contexto.blocoDaModalidade("lotofacil", [
    { concurso: 20, acertos: 13, tamanho: 15, metodo: "uniforme" }]);
  const esperadoMega = contexto.esperadoAcertos("mega-sena", 6);
  const esperadoFacil = contexto.esperadoAcertos("lotofacil", 15);
  checar("Mega-Sena compara contra o acaso da Mega-Sena",
    mega.includes(esperadoMega.toLocaleString("pt-BR",
      { minimumFractionDigits: 3, maximumFractionDigits: 3 })),
    `esperado ${esperadoMega.toFixed(3)}`);
  checar("Lotofácil compara contra o acaso da Lotofácil",
    facil.includes(esperadoFacil.toLocaleString("pt-BR",
      { minimumFractionDigits: 3, maximumFractionDigits: 3 })),
    `esperado ${esperadoFacil.toFixed(3)}`);
  checar("os dois esperados são mesmo diferentes (senão o teste não prova nada)",
    Math.abs(esperadoMega - esperadoFacil) > 1,
    `${esperadoMega.toFixed(2)} vs ${esperadoFacil.toFixed(2)}`);

  /* 13 de 15 na Lotofácil é faixa de prêmio; 2 de 6 na Mega não é. */
  checar("conta faixa de prêmio pela regra da modalidade certa",
    /em faixa de pr/i.test(facil) && facil.includes(">1<"),
    "Lotofácil com 13 acertos premia");

  /* O dinheiro continua somado, porque real é real. */
  checar("o gasto somado aparece uma vez só",
    (tela.match(/gasto somado/g) || []).length === 1);

  /* Com uma modalidade só, o aviso de separação não faz sentido e some. */
  motor.S.jogos = [motor.S.jogos[0]];
  checar("com uma modalidade só, o app não explica separação à toa",
    !/Cada loteria tem o seu placar/.test(contexto.T.placar()));

  motor.S.jogos = []; motor.S.teimosinhas = [];
  checar("sem conferência, o placar convida em vez de mostrar zero",
    /Nenhuma conferência ainda/.test(contexto.T.placar()));

  motor.S.jogos = original.jogos; motor.S.teimosinhas = original.teim;
}

/* ==================================================================
   11. Análise automática a cada concurso novo
   ================================================================== */
secao("11. Análise automática por concurso");

function historicoFalso(modalidade, quantos, semente) {
  const cfg = M[modalidade];
  let s = semente;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const saida = [];
  for (let i = 1; i <= quantos; i++) {
    const pool = Array.from({ length: cfg.N }, (_, k) => k + cfg.base);
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
    }
    saida.push({ concurso: i, data: "2025-01-01", modalidade,
                 dezenas: pool.slice(0, cfg.k).sort((a, b) => a - b), origem: "colado" });
  }
  return saida;
}

await (async () => {
  const S = motor.S;
  const guardados = { r: S.resultados, a: S.aprendizado, av: S.avisos, auto: S.autoAnalise };
  const esperar = () => new Promise(res => contexto.analisarPendentes(res));

  S.resultados = []; S.aprendizado = {}; S.avisos = []; S.autoAnalise = true;

  checar("sem histórico, nada está pendente",
    contexto.modalidadesPendentes().length === 0);

  // Histórico curto demais: não entra na fila.
  S.resultados = historicoFalso("lotofacil", 30, 5);
  checar("modalidade com histórico curto não entra na fila",
    !contexto.modalidadesPendentes().includes("lotofacil"),
    `${30} < ${contexto.MINIMO_CONCURSOS}`);

  // Histórico suficiente: entra.
  S.resultados = historicoFalso("lotofacil", 120, 5);
  checar("modalidade com histórico suficiente entra na fila",
    contexto.modalidadesPendentes().includes("lotofacil"));
  checar("só a modalidade que tem histórico entra",
    contexto.modalidadesPendentes().length === 1,
    contexto.modalidadesPendentes().join(","));

  const prontas = await esperar();
  checar("a análise automática roda e produz resultado", prontas.length === 1);
  checar("o resultado fica guardado na modalidade certa",
    !!S.aprendizado["lotofacil"] && typeof S.aprendizado["lotofacil"].auc === "number",
    `AUC ${S.aprendizado["lotofacil"] && S.aprendizado["lotofacil"].auc.toFixed(4)}`);
  checar("fica marcado como automática e com carimbo de hora",
    S.aprendizado["lotofacil"].automatica === true && !!S.aprendizado["lotofacil"].quando);
  /* NÃO se afirma aqui que o modelo nunca acusa: com dados aleatórios ele
     acusa em torno de 10% das vezes, e um teste que exigisse "nunca" seria
     intermitente — o que de fato aconteceu na primeira escrita, com a semente 5.
     O que se exige é que o AUC fique perto de 0,5, que é a propriedade real. */
  checar("com sorteios independentes o AUC fica perto de 0,5",
    Math.abs(S.aprendizado["lotofacil"].auc - 0.5) < 0.12,
    `AUC ${S.aprendizado["lotofacil"].auc.toFixed(4)}`);

  const avisoAnalise = S.avisos.find(a => a.tipo === "analise");
  checar("sai um aviso de análise pronta", !!avisoAnalise,
    avisoAnalise && avisoAnalise.titulo);
  checar("o aviso descreve o achado sem prometer nada",
    !!avisoAnalise && /(nenhum sinal|revisar)/i.test(avisoAnalise.texto) &&
    !/aumenta|garant|vantagem/i.test(avisoAnalise.texto),
    avisoAnalise && avisoAnalise.texto.slice(0, 90));

  /* A trava que evita gastar bateria: sem concurso novo, não retreina. */
  checar("sem concurso novo, nada fica pendente",
    contexto.modalidadesPendentes().length === 0);
  const semNada = await esperar();
  checar("chamar de novo não refaz análise nenhuma", semNada.length === 0);
  const avisosAntes = S.avisos.length;
  await esperar();
  checar("e não gera aviso repetido", S.avisos.length === avisosAntes);

  /* Concurso novo na Lotofácil: só ela volta para a fila. */
  const antes = contexto.assinaturaHistorico("lotofacil");
  S.resultados = S.resultados.concat(historicoFalso("lotofacil", 121, 5).slice(120));
  checar("a assinatura do histórico muda quando entra concurso",
    contexto.assinaturaHistorico("lotofacil") !== antes,
    `${antes} -> ${contexto.assinaturaHistorico("lotofacil")}`);
  checar("a modalidade que recebeu concurso volta para a fila",
    contexto.modalidadesPendentes().includes("lotofacil"));

  /* Uma segunda modalidade não é arrastada junto sem motivo. */
  S.resultados = S.resultados.concat(historicoFalso("quina", 120, 9));
  const fila = contexto.modalidadesPendentes().sort();
  checar("as duas com histórico entram, e só elas",
    fila.length === 2 && fila[0] === "lotofacil" && fila[1] === "quina", fila.join(","));

  const duas = await esperar();
  checar("as duas são analisadas separadamente", duas.length === 2);
  checar("cada uma guarda o seu próprio AUC",
    S.aprendizado["lotofacil"].auc !== S.aprendizado["quina"].auc,
    `${S.aprendizado["lotofacil"].auc.toFixed(4)} vs ${S.aprendizado["quina"].auc.toFixed(4)}`);
  checar("modelos separados: cada um tem a sua assinatura",
    S.aprendizado["lotofacil"].assinatura !== S.aprendizado["quina"].assinatura);

  /* O interruptor desliga mesmo. */
  S.autoAnalise = false;
  S.resultados = S.resultados.concat(historicoFalso("lotofacil", 122, 5).slice(121));
  const antesDesligado = JSON.stringify(S.aprendizado["lotofacil"].assinatura);
  contexto.aoMudarHistorico(1, "teste");
  await new Promise(res => setTimeout(res, 60));
  checar("desligado, o concurso novo NÃO dispara análise",
    JSON.stringify(S.aprendizado["lotofacil"].assinatura) === antesDesligado);
  checar("mas continua pendente, esperando ligar ou o botão",
    contexto.modalidadesPendentes().includes("lotofacil"));

  S.resultados = guardados.r; S.aprendizado = guardados.a;
  S.avisos = guardados.av; S.autoAnalise = guardados.auto;
})();

/* ==================================================================
   12. Correção para múltiplos testes entre modalidades
   ================================================================== */
secao("12. Holm-Bonferroni entre as modalidades");

{
  const mk = (p, fora) => ({ p, foraDaFaixa: fora, auc: 0.5, aprendeu: fora });

  /* Com uma modalidade só, o limiar continua 0,05 e nada muda. */
  const um = { lotofacil: mk(0.04, true) };
  contexto.aplicarCorrecao(um);
  checar("família de 1: o limiar continua 0,05",
    um.lotofacil.limiteAplicado === 0.05 && um.lotofacil.aprendeu === true);

  /* Oito modalidades, uma com p = 0,04: sozinha passaria, na família não.
     0,04 > 0,05/8 = 0,00625. */
  const oito = {};
  ["a","b","c","d","e","f","g","h"].forEach((k, i) =>
    oito[k] = mk(i === 0 ? 0.04 : 0.4 + i * 0.05, i === 0));
  contexto.aplicarCorrecao(oito);
  checar("achado de p=0,04 NÃO sobrevive a 8 testes simultâneos",
    oito.a.aprendeu === false, `limiar ${oito.a.limiteAplicado.toFixed(5)}`);
  checar("o limiar do menor p-valor é alfa/m", 
    Math.abs(oito.a.limiteAplicado - 0.05 / 8) < 1e-12);
  checar("a família é registrada em todas", 
    Object.values(oito).every(r => r.familia === 8));

  /* Um efeito forte sobrevive mesmo com 8 testes. */
  const forte = {};
  ["a","b","c","d","e","f","g","h"].forEach((k, i) =>
    forte[k] = mk(i === 0 ? 0.0001 : 0.4 + i * 0.05, i === 0));
  contexto.aplicarCorrecao(forte);
  checar("um efeito forte sobrevive à correção", forte.a.aprendeu === true);

  /* Holm afrouxa depois de aceitar: dois achados fortes passam, e o segundo
     usa alfa/(m-1), que é mais permissivo que alfa/m. Com Bonferroni puro o
     segundo seria comparado ao mesmo alfa/m. */
  const dois = {};
  ["a","b","c","d","e","f","g","h"].forEach((k, i) =>
    dois[k] = mk(i < 2 ? 0.001 + i * 0.005 : 0.4 + i * 0.05, i < 2));
  contexto.aplicarCorrecao(dois);
  checar("Holm afrouxa o limiar após aceitar o primeiro",
    dois.b.limiteAplicado > dois.a.limiteAplicado,
    `${dois.a.limiteAplicado.toFixed(5)} -> ${dois.b.limiteAplicado.toFixed(5)}`);
  checar("os dois achados fortes sobrevivem",
    dois.a.aprendeu === true && dois.b.aprendeu === true);

  /* A trava do procedimento: ao primeiro que não passa, os maiores caem junto,
     mesmo que algum deles passasse no seu próprio limiar isolado. */
  const cascata = {};
  ["a","b","c"].forEach((k, i) => cascata[k] = mk([0.02, 0.03, 0.04][i], true));
  contexto.aplicarCorrecao(cascata);
  checar("ao primeiro que falha, os maiores caem junto (garantia de Holm)",
    cascata.a.aprendeu === false && cascata.b.aprendeu === false &&
    cascata.c.aprendeu === false,
    "0,020 falha em 0,05/3 = 0,01667 e derruba os outros dois");
  /* O 0,04 é o caso que dá sentido ao teste: no seu próprio passo o limiar
     seria 0,05 e ele passaria. Só não passa porque o procedimento já parou. */
  checar("o maior p-valor passaria no limiar do próprio passo, e mesmo assim cai",
    cascata.c.limiteAplicado === 0.05 && 0.04 <= cascata.c.limiteAplicado &&
    cascata.c.aprendeu === false,
    "0,04 ≤ 0,05 e ainda assim é rejeitado");

  /* Fora da faixa mas com p alto não vira sinal em nenhum cenário. */
  const incoerente = { x: { p: 0.9, foraDaFaixa: true, auc: 0.5, aprendeu: true } };
  contexto.aplicarCorrecao(incoerente);
  checar("p alto não vira sinal nem estando fora da faixa",
    incoerente.x.aprendeu === false);

  checar("mapa vazio não quebra",
    JSON.stringify(contexto.aplicarCorrecao({})) === "{}");
}

/* O veredito muda de texto quando houve correção, e nunca promete vantagem. */
{
  const r = { auc: 0.44, p: 0.03, faixaAcaso: [0.46, 0.54], foraDaFaixa: true,
              aprendeu: false, familia: 8, limiteAplicado: 0.00625 };
  const t = contexto.vereditoAprendizado(r);
  checar("o veredito explica que o achado morreu na correção",
    /não sobreviveu à correção/i.test(t));
  checar("o veredito cita o limiar aplicado e o tamanho da família",
    /8 modalidades/.test(t));
  checar("mesmo com achado, o veredito não promete vantagem",
    !/aumenta a chance|vantagem real|garantid/i.test(t));
}

/* ==================================================================
   13. Fibonacci como característica estrutural
   ================================================================== */
secao("13. Fibonacci");

{
  const fib = contexto.fibonacciAte;
  checar("a sequência é a correta até 25",
    [...fib(25)].sort((a, b) => a - b).join(",") === "1,2,3,5,8,13,21",
    [...fib(25)].sort((a, b) => a - b).join(","));
  checar("o 1 entra uma vez só, não duas", fib(25).size === 7);
  checar("até 60 inclui 34 e 55",
    fib(60).has(34) && fib(60).has(55) && !fib(60).has(89));
  checar("universo mínimo não quebra", fib(1).size === 1 && fib(0).size === 0);

  /* Normalização: é o que torna o número comparável entre modalidades. Um jogo
     "médio" tem de dar ~1,0 em qualquer loteria, senão a Lotofácil — onde 7 dos
     25 números são Fibonacci — pareceria sempre concentrada. */
  const cheio = contexto.caracteristicas([1, 2, 3, 5, 8, 13, 21], "lotofacil");
  const semNenhum = contexto.caracteristicas([4, 6, 9, 10, 11, 12, 14], "lotofacil");
  checar("jogo todo de Fibonacci fica bem acima de 1", cheio.fibonacci > 2.5,
    cheio.fibonacci.toFixed(2));
  checar("jogo sem Fibonacci nenhum dá 0", semNenhum.fibonacci === 0);

  /* O teste que dá sentido à normalização: modalidades com densidades de
     Fibonacci muito diferentes têm de produzir escalas comparáveis. */
  const densidade = (mod) => {
    const c = M[mod];
    const f = [...fib(c.N + c.base - 1)].filter(d => d >= c.base).length;
    return f / c.N;
  };
  checar("as densidades de Fibonacci são mesmo diferentes entre loterias",
    Math.abs(densidade("lotofacil") - densidade("quina")) > 0.1,
    `lotofácil ${(100*densidade("lotofacil")).toFixed(0)}% vs quina ${(100*densidade("quina")).toFixed(0)}%`);
  {
    /* Em cada modalidade, um jogo com exatamente a proporção esperada tem de
       dar perto de 1,0 — é a prova de que a escala é comparável. */
    const perto = [];
    for (const mod of ["lotofacil", "quina", "mega-sena"]) {
      const c = M[mod];
      const universo = Array.from({ length: c.N }, (_, i) => i + c.base);
      const f = fib(c.N + c.base - 1);
      const alvo = Math.round(densidade(mod) * c.k);
      const jogo = universo.filter(d => f.has(d)).slice(0, alvo)
        .concat(universo.filter(d => !f.has(d)).slice(0, c.k - alvo))
        .sort((a, b) => a - b);
      perto.push(contexto.caracteristicas(jogo, mod).fibonacci);
    }
    /* A tolerância não pode ser um número mágico: ela é a granularidade da
       própria modalidade. Na Quina o esperado é 0,56 dezena Fibonacci em 5, e
       não existe meia dezena — o valor alcançável mais próximo de 1,0 já fica
       em 1,78. Exigir 1,0±0,35 lá reprovaria uma métrica correta. O que se
       exige é que o desvio caiba em UM passo de discretização. */
    const passo = mod => 1 / (M[mod].k * densidade(mod));
    const mods = ["lotofacil", "quina", "mega-sena"];
    checar("proporção esperada fica dentro de um passo de 1,0 em cada modalidade",
      perto.every((v, i) => Math.abs(v - 1) <= passo(mods[i]) + 1e-9),
      mods.map((m2, i) => `${m2} ${perto[i].toFixed(2)} (passo ${passo(m2).toFixed(2)})`).join(" · "));
  }

  checar("a observação aparece quando o jogo concentra Fibonacci",
    contexto.observacoes([1, 2, 3, 5, 8, 13, 21], "lotofacil")
      .some(o => /fibonacci/i.test(o)));
  checar("e não aparece num jogo comum",
    !contexto.observacoes([4, 6, 9, 10, 11, 12, 14], "lotofacil")
      .some(o => /fibonacci/i.test(o)));

  checar("Fibonacci entra no escore de rateio, com peso baixo",
    typeof contexto.PESOS.fibonacci === "number" &&
    contexto.PESOS.fibonacci > 0 && contexto.PESOS.fibonacci < contexto.PESOS.ate31 / 5,
    `${contexto.PESOS.fibonacci} contra ${contexto.PESOS.ate31} de datas`);

  /* O ponto que mais importa: Fibonacci NÃO muda a chance. O texto do app não
     pode sugerir o contrário em lugar nenhum. */
  const textoFib = contexto.observacoes([1, 2, 3, 5, 8, 13, 21], "lotofacil").join(" ");
  checar("a observação descreve a forma, não promete acerto",
    !/chance|prov[áa]vel|sair|ganhar/i.test(textoFib), textoFib);
}

/* ==================================================================
   14. Estatísticas descritivas
   ================================================================== */
secao("14. Estatísticas do histórico");

{
  const S = motor.S;
  const guardado = S.resultados;

  /* Histórico construído à mão, para os valores serem conferíveis por conta.
     Lotofácil, 4 concursos. */
  S.resultados = [
    { concurso: 1, data: "2025-01-01", modalidade: "lotofacil",
      dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] },
    { concurso: 2, data: "2025-01-02", modalidade: "lotofacil",
      dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,16] },
    { concurso: 3, data: "2025-01-03", modalidade: "lotofacil",
      dezenas: [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25] },
    { concurso: 4, data: "2025-01-04", modalidade: "lotofacil",
      dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] },
  ];

  const d = contexto.porDezena("lotofacil");
  const dez1 = d.linhas.find(l => l.dezena === 1);
  const dez25 = d.linhas.find(l => l.dezena === 25);
  checar("contagem por dezena confere com a contagem à mão",
    dez1.vezes === 3 && dez25.vezes === 1, `1 saiu ${dez1.vezes}x, 25 saiu ${dez25.vezes}x`);
  checar("o esperado é n·k/N", Math.abs(d.esperado - 4 * 15 / 25) < 1e-12,
    `${d.esperado}`);
  checar("ausência conta concursos desde a última aparição",
    dez1.ausencia === 0 && dez25.ausencia === 1,
    `1 há ${dez1.ausencia}, 25 há ${dez25.ausencia}`);
  {
    /* Dezena que nunca saiu: ausência = n, e não infinito nem NaN. */
    S.resultados = S.resultados.map(r => ({...r,
      dezenas: r.dezenas.filter(x => x !== 25).concat(r.dezenas.includes(25) ? [24] : [])
        .slice(0,15) }));
    const d2 = contexto.porDezena("lotofacil");
    const nunca = d2.linhas.find(l => l.dezena === 25);
    checar("dezena que nunca saiu tem ausência = nº de concursos",
      nunca.vezes === 0 && nunca.ausencia === d2.n, `${nunca.ausencia} de ${d2.n}`);
  }

  /* Paridade: o esperado tem de vir da matemática, não do próprio código. */
  S.resultados = [
    { concurso: 1, data: "2025-01-01", modalidade: "megasena-inexistente", dezenas: [] },
  ];
  S.resultados = [];
  for (let i = 1; i <= 200; i++) {
    const pool = Array.from({ length: 60 }, (_, k) => k + 1);
    for (let k = 59; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
    S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
      dezenas: pool.slice(0, 6).sort((a, b) => a - b) });
  }
  const par = contexto.contagemPorConcurso("mega-sena", x => x % 2 === 0);
  /* Mega-Sena: 30 pares em 60, k=6 -> esperado 3,0 pares por concurso. */
  checar("o esperado de pares vem da hipergeométrica, não do observado",
    Math.abs(par.esperado - 3.0) < 1e-12, `${par.esperado}`);
  checar("com 200 sorteios honestos, os pares ficam dentro da faixa",
    par.dentro, `média ${par.media.toFixed(3)} vs ${par.esperado}`);
  checar("a distribuição soma o número de concursos",
    Object.values(par.dist).reduce((a, b) => a + b, 0) === par.n);

  /* Repetições: esperado = k²/N. Mega-Sena -> 36/60 = 0,6. */
  const rep = contexto.repeticoesAnterior("mega-sena");
  checar("o esperado de repetições é k²/N",
    Math.abs(rep.esperado - 36 / 60) < 1e-12, `${rep.esperado}`);
  checar("há n−1 comparações, não n", rep.n === 199, `${rep.n}`);

  /* Soma: esperado = k·(N+1)/2 para base 1. Mega-Sena -> 6·30,5 = 183. */
  const soma = contexto.somaDasDezenas("mega-sena");
  checar("o esperado da soma é k·(N+1)/2",
    Math.abs(soma.esperado - 183) < 1e-12, `${soma.esperado}`);
  checar("mínimo, mediana e máximo estão em ordem",
    soma.minimo <= soma.mediana && soma.mediana <= soma.maximo,
    `${soma.minimo} ≤ ${soma.mediana} ≤ ${soma.maximo}`);
  checar("a soma mínima possível não é violada",
    soma.minimo >= 1 + 2 + 3 + 4 + 5 + 6, `${soma.minimo}`);

  /* Sequências: pares consecutivos esperados = (N−1)·k(k−1)/(N(N−1)). */
  const seq = contexto.sequencias("mega-sena");
  checar("o esperado de pares consecutivos confere com a fórmula",
    Math.abs(seq.esperado - 59 * 6 * 5 / (60 * 59)) < 1e-12, `${seq.esperado.toFixed(4)}`);
  checar("a fração com sequência fica entre 0 e 1",
    seq.fracaoComSequencia >= 0 && seq.fracaoComSequencia <= 1);

  /* Linhas e colunas: a soma das contagens tem de fechar com o total. */
  const g = contexto.linhasEColunas("mega-sena");
  const somaLinhas = g.porLinha.reduce((a, x) => a + x.vezes, 0);
  const somaColunas = g.porColuna.reduce((a, x) => a + x.vezes, 0);
  checar("as linhas somam todas as dezenas sorteadas",
    somaLinhas === g.total, `${somaLinhas} de ${g.total}`);
  checar("as colunas somam o mesmo total", somaColunas === g.total);
  checar("os esperados das linhas somam o total",
    Math.abs(g.porLinha.reduce((a, x) => a + x.esperado, 0) - g.total) < 1e-6);

  /* Ciclos: com 200 concursos de Mega-Sena, o esperado é ~47 e alguns fecham. */
  const cic = contexto.ciclos("mega-sena");
  checar("o ciclo esperado vem do colecionador de figurinhas",
    cic.esperado > 40 && cic.esperado < 55, `${cic.esperado.toFixed(1)} concursos`);
  checar("as dezenas em aberto nunca passam do universo",
    cic.emAberto <= 60 && cic.faltam >= 0, `${cic.emAberto} vistas, faltam ${cic.faltam}`);

  /* A tela renderiza os nove tipos sem quebrar. */
  S.modalidade = "mega-sena";
  let quebrou = "";
  for (const t of contexto.TIPOS_ESTATISTICA) {
    S.tipoEstatistica = t.id;
    try {
      const html2 = contexto.T.estatisticas();
      if (typeof html2 !== "string" || html2.length < 200) quebrou += t.id + "(curto) ";
    } catch (e) { quebrou += `${t.id}(${e.message}) `; }
  }
  checar("os nove tipos de estatística renderizam", quebrou === "", quebrou);

  /* Histórico curto convida em vez de mentir com dois concursos. */
  S.resultados = S.resultados.slice(0, 3);
  S.tipoEstatistica = "dezenas";
  checar("com histórico curto, a tela pede mais dados em vez de calcular",
    /Traga histórico/.test(contexto.T.estatisticas()));

  /* O texto não pode sugerir que ausência prevê aparição. */
  S.resultados = guardado;
  S.modalidade = "lotofacil";
}

{
  /* A trava de linguagem desta tela, verificada no texto renderizado. */
  const S = motor.S;
  const guardado = S.resultados, guardadaMod = S.modalidade;
  S.modalidade = "lotofacil";
  S.resultados = [];
  for (let i = 1; i <= 60; i++) {
    const pool = Array.from({ length: 25 }, (_, k) => k + 1);
    for (let k = 24; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
    S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "lotofacil",
      dezenas: pool.slice(0, 15).sort((a, b) => a - b) });
  }
  S.tipoEstatistica = "dezenas";
  const texto = contexto.T.estatisticas();
  checar("a tela de dezenas nega explicitamente a falácia do apostador",
    /não<\/strong> torna a dezena mais nem menos provável/.test(texto) &&
    /independente/i.test(texto));
  checar("a tela declara a base de concursos usada",
    /Base: <strong>60 concursos/.test(texto));
  S.tipoEstatistica = "ciclos";
  /* O \s+ não é preciosismo: o texto do app quebra linha entre "têm" e
     "prioridade", e um espaço literal aqui produziria falso negativo — o teste
     reprovaria justamente o texto correto. */
  checar("a tela de ciclos nega prioridade para as dezenas que faltam",
    /não<\/strong>\s+têm\s+prioridade\s+nenhuma/.test(contexto.T.estatisticas()));
  S.resultados = guardado; S.modalidade = guardadaMod; S.tipoEstatistica = "dezenas";
}

/* ==================================================================
   15. Calibração de popularidade a partir dos ganhadores
   ================================================================== */
secao("15. Calibração pelos ganhadores");

{
  const S = motor.S;
  const guardado = { r: S.resultados, c: S.calibracao, m: S.modalidade };
  S.modalidade = "mega-sena";

  /* Mínimos quadrados: precisa recuperar um coeficiente que existe. Sem este
     teste, uma regressão quebrada devolveria pesos zerados e passaria por
     "não há sinal", que é o resultado que ela produz sempre. */
  {
    const X = [], y = [];
    let s2 = 3;
    const rnd = () => (s2 = (s2 * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 300; i++) {
      const a = rnd(), b = rnd();
      X.push([a, b]);
      y.push(5 + 3 * a + 0 * b + (rnd() - 0.5) * 0.2);   // só `a` importa
    }
    const m = contexto.minimosQuadrados(X, y);
    checar("a regressão recupera o coeficiente verdadeiro",
      Math.abs(m.coeficientes[0] - 3) < 0.4, `${m.coeficientes[0].toFixed(3)} (verdadeiro 3)`);
    checar("e zera o que não importa",
      Math.abs(m.coeficientes[1]) < 0.4, `${m.coeficientes[1].toFixed(3)}`);
    checar("R² alto quando o modelo explica", m.r2 > 0.95, m.r2.toFixed(4));
  }

  /* Histórico curto: recusa em vez de calibrar com o que não dá. */
  S.resultados = [];
  for (let i = 1; i <= 10; i++)
    S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
      dezenas: [1,2,3,4,5,6], rateio: [{faixa:1, ganhadores:1, premio:1000}] });
  {
    const r = contexto.calibrarPopularidade("mega-sena");
    checar("com poucos concursos, a calibração recusa e diz quanto falta",
      !!r.erro && r.precisa === contexto.MINIMO_CALIBRACAO && r.tem === 10,
      `${r.tem} de ${r.precisa}`);
  }

  /* Concursos sem rateio não entram na conta. */
  S.resultados = S.resultados.map(r => ({ ...r, rateio: undefined }));
  checar("concursos sem rateio são ignorados",
    contexto.calibrarPopularidade("mega-sena").tem === 0);

  /* O teste que dá sentido ao módulo: um público SIMULADO que marca datas.
     Se a calibração não detectar isso, ela não serve para nada. */
  {
    let s3 = 77;
    const rnd = () => (s3 = (s3 * 1103515245 + 12345) % 2147483648) / 2147483648;
    S.resultados = [];
    for (let i = 1; i <= 160; i++) {
      const pool = Array.from({ length: 60 }, (_, k) => k + 1);
      for (let k = 59; k > 0; k--) { const j = Math.floor(rnd() * (k + 1));
        const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
      const dezenas = pool.slice(0, 6).sort((a, b) => a - b);
      /* Público que marca aniversário: quanto mais dezenas ≤ 31 saírem, mais
         gente acerta. A relação é exponencial, como é na realidade. */
      const ate31 = dezenas.filter(d => d <= 31).length;
      const ganhadores = Math.round(Math.exp(0.9 * ate31) * (0.6 + rnd() * 0.8));
      S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
        dezenas, rateio: [{ faixa: 1, ganhadores, premio: 1e6 }] });
    }
    const r = contexto.calibrarPopularidade("mega-sena");
    checar("a calibração roda com histórico suficiente", !r.erro, r.erro || `n=${r.n}`);
    checar("detecta que o público marca datas (1–31)",
      r.pesos.ate31 > 0 && r.pesos.ate31 === Math.max(...Object.values(r.pesos)),
      `ate31=${r.pesos.ate31.toFixed(3)} contra ` +
      Object.entries(r.pesos).filter(([k]) => k !== "ate31")
        .map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" "));
    checar("o R² é reportado e reconhece o sinal", r.r2 > 0.3, r.r2.toFixed(3));
    checar("a calibração se declara útil", r.util === true);
    checar("nenhum peso é negativo",
      Object.values(r.pesos).every(v => v >= 0));

    /* E o gerador passa a usar a medida no lugar da suposição. */
    S.calibracao = { "mega-sena": r };
    const usados = contexto.pesosVigentes();
    checar("pesosVigentes prefere a calibração medida",
      usados.ate31 === r.pesos.ate31,
      `${usados.ate31.toFixed(3)} (PESOS declarava ${contexto.PESOS.ate31})`);
  }

  /* Público que NÃO tem padrão: a calibração não pode inventar um. */
  {
    let s4 = 991;
    const rnd = () => (s4 = (s4 * 1103515245 + 12345) % 2147483648) / 2147483648;
    S.resultados = [];
    for (let i = 1; i <= 160; i++) {
      const pool = Array.from({ length: 60 }, (_, k) => k + 1);
      for (let k = 59; k > 0; k--) { const j = Math.floor(rnd() * (k + 1));
        const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
      S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
        dezenas: pool.slice(0, 6).sort((a, b) => a - b),
        rateio: [{ faixa: 1, ganhadores: Math.floor(rnd() * 20), premio: 1e6 }] });
    }
    const r = contexto.calibrarPopularidade("mega-sena");
    checar("sem padrão no público, o R² fica baixo", r.r2 < 0.15, r.r2.toFixed(4));
    checar("e a calibração se declara NÃO útil", r.util === false);
    S.calibracao = { "mega-sena": r };
    checar("calibração inútil não substitui os pesos declarados",
      contexto.pesosVigentes().ate31 === contexto.PESOS.ate31);
  }

  /* Prêmio pelo rateio: liga o jogo ao dinheiro, e distingue "não ganhou" de
     "não sei quanto". */
  {
    const res = { concurso: 1, modalidade: "mega-sena", dezenas: [1,2,3,4,5,6],
      rateio: [{faixa:1, ganhadores:1, premio:50e6},
               {faixa:2, ganhadores:60, premio:50000},
               {faixa:3, ganhadores:4000, premio:900}] };
    checar("6 acertos paga a faixa 1",
      contexto.premioDoAcerto(res, 6, "mega-sena") === 50e6);
    checar("5 acertos paga a faixa 2",
      contexto.premioDoAcerto(res, 5, "mega-sena") === 50000);
    checar("3 acertos não está em faixa nenhuma e paga 0",
      contexto.premioDoAcerto(res, 3, "mega-sena") === 0);
    checar("sem rateio devolve null, e não 0",
      contexto.premioDoAcerto({concurso:1, modalidade:"mega-sena", dezenas:[]},
        6, "mega-sena") === null,
      "não saber quanto é diferente de saber que é zero");
  }

  S.resultados = guardado.r; S.calibracao = guardado.c; S.modalidade = guardado.m;
}

/* ==================================================================
   16. Próximo concurso e busca
   ================================================================== */
secao("16. Próximo concurso");

{
  const S = motor.S;
  const guardado = { r: S.resultados, m: S.modalidade };
  S.modalidade = "mega-sena";

  checar("dias até hoje é 0", contexto.diasAte(new Date().toISOString().slice(0,10)) === 0);
  checar("data inválida devolve null", contexto.diasAte("banana") === null);
  checar("sem data devolve null", contexto.diasAte(null) === null);
  {
    /* Fuso: um sorteio "amanhã" não pode virar 0 nem 2 por causa de hora. */
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    checar("amanhã é exatamente 1 dia, independentemente da hora",
      contexto.diasAte(amanha) === 1, `${contexto.diasAte(amanha)}`);
    checar("data com hora junto não confunde a conta",
      contexto.diasAte(amanha + "T23:59:00") === 1);
  }

  /* Sem informação do próximo, não se inventa cartão. */
  S.resultados = [{ concurso: 1, data: "2025-01-01", modalidade: "mega-sena",
    dezenas: [1,2,3,4,5,6] }];
  checar("sem dados do próximo concurso, não há cartão",
    contexto.proximoConcurso("mega-sena") === null &&
    contexto.cartaoProximo("mega-sena") === "");

  /* Com informação, o cartão mostra valor e data. */
  const daquiA3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10);
  S.resultados = [{ concurso: 100, data: "2025-01-01", modalidade: "mega-sena",
    dezenas: [1,2,3,4,5,6], dataProximo: daquiA3, estimativaProximo: 75000000,
    concursoProximo: 101, acumulou: true }];
  const p2 = contexto.proximoConcurso("mega-sena");
  checar("o próximo concurso é lido do último resultado",
    p2.concurso === 101 && p2.estimativa === 75000000 && p2.acumulou === true);
  const cartao = contexto.cartaoProximo("mega-sena");
  checar("o cartão mostra a estimativa formatada em reais",
    /75\.000\.000/.test(cartao), cartao.slice(0, 80));
  checar("o cartão conta os dias que faltam", /<b>3<\/b>/.test(cartao));
  checar("o cartão marca que acumulou", /acumulou/.test(cartao));

  /* Sem número do próximo, deduz do atual — e não some. */
  S.resultados = [{ concurso: 100, data: "2025-01-01", modalidade: "mega-sena",
    dezenas: [1,2,3,4,5,6], estimativaProximo: 1000 }];
  checar("sem numeroConcursoProximo, deduz concurso + 1",
    contexto.proximoConcurso("mega-sena").concurso === 101);

  /* Concurso já sorteado não vira contagem regressiva negativa na tela. */
  S.resultados = [{ concurso: 100, data: "2025-01-01", modalidade: "mega-sena",
    dezenas: [1,2,3,4,5,6], dataProximo: "2020-01-01", estimativaProximo: 1000 }];
  const antigo = contexto.cartaoProximo("mega-sena");
  checar("data no passado não mostra contagem regressiva",
    !/class="contagem"/.test(antigo) && /deve ter saído/.test(antigo));

  checar("o intervalo entre buscas automáticas é de 12 horas",
    contexto.INTERVALO_BUSCA === 12 * 60 * 60 * 1000);

  S.resultados = guardado.r; S.modalidade = guardado.m;
}







/* ---------- saída ---------- */
console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log("─".repeat(60));
process.exit(falhou === 0 ? 0 : 1);
