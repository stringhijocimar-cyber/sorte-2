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
   Math do processo que roda o arnês.

   O gerador é xorshift32 — o mesmo de `geradorSemeado` no app. A primeira
   versão usava o LCG clássico `x = (x·1103515245 + 12345) mod 2^31`, e ele
   estava quebrado aqui: em JavaScript, `x·1103515245` com x perto de 2^31 dá
   ~2,4·10^18, muito acima dos 2^53 que um double representa exatamente, então
   os dígitos baixos — justamente os que viram o resultado — eram lixo de
   arredondamento. O teste de uniformidade de `sortear` mediu χ² = 316 com 59
   graus de liberdade; com xorshift32 o mesmo teste dá χ² ≈ 53. O defeito
   passou despercebido porque nenhum teste olhava o gerador, só o que ele
   alimentava. Xorshift trabalha em inteiros de 32 bits com `>>> 0` e não tem
   como estourar a precisão. */
function mathSemeado(semente = 20260806) {
  let x = semente >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  return new Proxy(Math, { get: (alvo, prop) => (prop === "random" ? rnd : alvo[prop]) });
}

/* O mesmo argumento vale para os históricos sintéticos que os testes de
   estatística montam — só que esses são construídos aqui no arnês, fora da VM,
   onde o Math trocado não alcança. Um deles reprovou sozinho no CI: a média de
   pares saiu 2,795 contra 3,000 esperados, a 2,5 erros-padrão. A faixa do app é
   de 2 erros-padrão, então cerca de 5% das execuções reprovavam por construção
   — o defeito estava no teste, não na fórmula. */
function embaralhadorSemeado(semente) {
  let x = semente >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  return (pool) => {
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
    }
    return pool;
  };
}

/* Sorteios honestos de `quantos` concursos, reprodutíveis pela semente. */
function historicoSemeado(modalidade, N, k, quantos, semente, base = 1) {
  const embaralhar = embaralhadorSemeado(semente);
  const saida = [];
  for (let i = 1; i <= quantos; i++) {
    const pool = Array.from({ length: N }, (_, idx) => idx + base);
    saida.push({ concurso: i, data: "2025-01-01", modalidade,
      dezenas: embaralhar(pool).slice(0, k).sort((a, b) => a - b) });
  }
  return saida;
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
  "preverGanhadores",
  "proximoConcurso", "diasAte", "cartaoProximo", "INTERVALO_BUSCA",
  "perfilDoJogo", "lerTipicidade", "ehPrimo", "naMoldura", "medidasDoPerfil",
  "retrospectiva",
  "FONTES", "normalizarEspelho", "buscarNaCaixa", "normalizarRepositorio",
  "baixarHistoricoDoRepositorio", "REPO_DADOS",
  "MINIMO_CALIBRACAO", "ATRIBUTOS_POPULARIDADE",
  "sequencias", "ciclos", "linhasEColunas", "historicoDe", "TIPOS_ESTATISTICA",
  "assinaturaHistorico", "modalidadesPendentes", "analisarPendentes", "aplicarCorrecao",
  "aoMudarHistorico", "guardarResultados",
  "sugestaoDoSistema", "tabelaSugestao", "nomeDoMetodo", "distribuicoesDoHistorico",
  "aprendizadoNaSugestao",
  "ganhadoresDoConcurso", "seloGanhadores", "coberturaDeGanhadores", "resumoGanhadores",
  "Avisos", "momentoDoAviso", "reagendarLembretes", "notificarSistema", "conferenciaAutomatica",
  "matrizDePesquisa", "digitalDoHistorico", "hipoteseAleatoria", "escoreDaHipotese",
  "avaliarHipotese", "aptidao", "cruzar", "mutar", "chaveDaHipotese", "rodarGeracao",
  "concluirPesquisa", "descreverHipotese", "vereditoPesquisa", "pesquisasPendentes",
  "evoluirPendentes", "PRIMITIVOS", "TRANSFORMACOES", "caudaNormal", "MINIMO_PESQUISA",
  "POPULACAO_PESQUISA",
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
   0. O gerador do próprio arnês
   ==================================================================
   Dezenas de testes deste arquivo dizem "com sorteios honestos, tal medida
   converge para tal valor". Todos eles são medidos com o Math.random trocado
   por mathSemeado — e nenhum olhava para ele. O LCG que estava ali devolvia
   números enviesados havia meses (perdia dígitos por estourar 2^53), e a
   suíte inteira apoiava-se nisso sem saber. Um instrumento que ninguém afere
   não é evidência. */
secao("0. O gerador do próprio arnês");
{
  const rnd = mathSemeado(20260806).random;
  const N = 200000, caixas = 60, conta = new Array(caixas).fill(0);
  let foraDaFaixa = 0;
  for (let i = 0; i < N; i++) {
    const v = rnd();
    if (!(v >= 0 && v < 1)) foraDaFaixa++;
    else conta[Math.floor(v * caixas)]++;
  }
  checar("o gerador do arnês fica em [0,1)", foraDaFaixa === 0);
  const esperado = N / caixas;
  const qui = conta.reduce((s, v) => s + (v - esperado) ** 2 / esperado, 0);
  /* 59 graus de liberdade: acima de ~110 é viés, não azar. O LCG anterior
     dava χ² na casa das centenas neste mesmo teste. */
  checar("e distribui uniformemente", qui < 110, `χ² = ${qui.toFixed(1)} com 59 g.l.`);
  const a = mathSemeado(7), b = mathSemeado(7), c = mathSemeado(8);
  const dez = (g) => Array.from({ length: 10 }, () => g.random());
  const ga = dez(a), gb = dez(b), gc = dez(c);
  checar("a mesma semente dá a mesma sequência", ga.join() === gb.join());
  checar("sementes diferentes dão sequências diferentes", ga.join() !== gc.join());
  checar("não trava num valor só", new Set(dez(mathSemeado(1))).size === 10);
}

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

/* ------------------------------------------------------------------
   8b. As otimizações que fizeram a bancada caber no tempo de tela
   ------------------------------------------------------------------
   `sortear` passou a embaralhar só as dezenas de que precisa, e `universo`
   passou a devolver a cópia de um array guardado. As duas mudanças são
   invisíveis quando funcionam e desastrosas quando não: um sorteio enviesado
   não aparece na tela, e um universo compartilhado corrompido aparece três
   telas depois. Estes testes existem para que "só arrumei o desempenho" não
   passe sem prova. */
secao("8b. Sorteio e universo — desempenho não pode custar correção");
{
  const antes = contexto.universo("mega-sena");
  antes.length = 3; antes[0] = 999;                    /* quem chama estraga */
  const depois = contexto.universo("mega-sena");
  checar("universo devolve cópia: estragar uma não estraga a próxima",
    depois.length === 60 && depois[0] === 1 && depois[59] === 60,
    `${depois.length} dezenas, de ${depois[0]} a ${depois.at(-1)}`);
  const a = contexto.universo("lotomania"), b = contexto.universo("lotomania");
  checar("e duas chamadas não devolvem o MESMO array", a !== b && a.length === b.length);
}
{
  /* Uniformidade do Fisher–Yates parcial. Com 60 dezenas, 6 por sorteio e
     30.000 sorteios, cada dezena sai 3.000 vezes em média (dp ≈ 52). Uma
     dezena fora de ±5 desvios denunciaria o viés que um embaralhamento parcial
     mal escrito produz — tipicamente nas ÚLTIMAS posições da urna, que é
     justamente o que o teste vigia ao olhar todas as 60. */
  const VEZES = 30000, K = 6, N = 60;
  const conta = new Array(61).fill(0);
  let duplicadas = 0, foraDaFaixa = 0, desordenadas = 0;
  for (let i = 0; i < VEZES; i++) {
    const j = contexto.sortear("mega-sena", K);
    if (new Set(j).size !== K) duplicadas++;
    for (let q = 1; q < j.length; q++) if (j[q] <= j[q-1]) desordenadas++;
    for (const d of j) { if (d < 1 || d > 60) foraDaFaixa++; else conta[d]++; }
  }
  checar("sortear nunca repete dezena no mesmo jogo", duplicadas === 0);
  checar("sortear nunca sai da faixa da modalidade", foraDaFaixa === 0);
  checar("sortear devolve sempre ordenado", desordenadas === 0);
  const esperado = VEZES * K / N;
  const dp = Math.sqrt(VEZES * (K / N) * (1 - K / N));
  const usadas = conta.slice(1);
  const pior = usadas.reduce((p, v) =>
    Math.abs(v - esperado) > Math.abs(p - esperado) ? v : p, esperado);
  checar("nenhuma dezena é favorecida pelo embaralhamento parcial",
    Math.abs(pior - esperado) <= 5 * dp,
    `pior dezena a ${(Math.abs(pior - esperado) / dp).toFixed(2)} desvios de ${esperado}`);
  /* Qui-quadrado com 59 graus de liberdade: acima de ~110 seria viés real. */
  const qui = usadas.reduce((s, v) => s + (v - esperado) ** 2 / esperado, 0);
  checar("qui-quadrado das frequências fica em faixa aceitável",
    qui < 110, `χ² = ${qui.toFixed(1)} com 59 g.l.`);
  checar("a Lotomania continua começando no 0",
    Array.from({ length: 400 }, () => contexto.sortear("lotomania", 50))
      .some(j => j.includes(0)));
}
{
  /* caracteristicas() usa rascunhos reaproveitados entre chamadas. Se algum
     contador ficar sujo, a segunda chamada devolve o resultado da primeira
     somado ao dela — e o defeito só aparece quando duas modalidades de
     tamanhos diferentes se alternam, que é exatamente o que a bancada faz. */
  const jogoMega = [1, 2, 3, 4, 5, 6];
  const primeira = contexto.caracteristicas(jogoMega, "mega-sena");
  contexto.caracteristicas([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], "lotofacil");
  contexto.caracteristicas([0,1,2,3,4], "lotomania");
  const repetida = contexto.caracteristicas(jogoMega, "mega-sena");
  checar("caracteristicas não vaza estado entre chamadas",
    Object.keys(primeira).every(k => Object.is(primeira[k], repetida[k])),
    Object.keys(primeira).filter(k => !Object.is(primeira[k], repetida[k])).join(",") || "todas iguais");
  checar("e a ordem de entrada não muda o resultado",
    Object.keys(primeira).every(k =>
      Object.is(primeira[k], contexto.caracteristicas([6,3,1,5,2,4], "mega-sena")[k])));
}
{
  /* Referência dourada: a saída de caracteristicas() ANTES da otimização de
     desempenho, gravada em ferramentas/douradas.json por gerar-douradas.mjs.

     A comparação é exata (Object.is), e não "por aproximação". Uma diferença
     de 1e-13 não quebra nada visivelmente e muda, em silêncio, a ordem em que
     os jogos aparecem — foi por isso que a variância voltou a ser calculada em
     duas passadas, embora uma passada fosse mais rápida. Se este teste
     reprovar, a pergunta certa não é "como faço passar", e sim "eu queria
     mesmo mudar esses números?". */
  const douradas = JSON.parse(readFileSync(join(RAIZ, "ferramentas/douradas.json"), "utf8"));
  let comparados = 0, diferentes = [];
  for (const [id, casos] of Object.entries(douradas)) {
    for (const { jogo, c } of casos) {
      const agora = contexto.caracteristicas(jogo, id);
      for (const k of Object.keys(c)) {
        comparados++;
        if (!Object.is(c[k], agora[k])) diferentes.push(`${id}.${k}: ${c[k]} -> ${agora[k]}`);
      }
      for (const k of Object.keys(agora)) {
        if (!(k in c)) diferentes.push(`${id}.${k}: característica nova, não estava na referência`);
      }
    }
  }
  checar("caracteristicas bate dígito por dígito com a referência dourada",
    diferentes.length === 0,
    diferentes.length ? diferentes.slice(0, 3).join(" · ")
      : `${comparados} valores em ${Object.values(douradas).reduce((s, v) => s + v.length, 0)} jogos`);
  checar("a referência cobre as 8 modalidades",
    Object.keys(douradas).length === Object.keys(M).length,
    `${Object.keys(douradas).length} de ${Object.keys(M).length}`);
}


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
/* O metodo "rateio" saiu da lista oferecida, mas a funcao continua no arquivo
   como reserva — e a armadilha que ela ilustra continua real, entao o teste
   continua medindo direto na funcao em vez de pela bancada. */
const mediaContra = (gerar) => {
  const alvo = new Set(alvoHumano);
  let soma = 0, n = 0;
  for (let i = 0; i < 25; i++)
    for (const j of gerar("mega-sena", 3, 6)) {
      soma += j.filter((d) => alvo.has(d)).length; n++;
    }
  return soma / n;
};
const ratHumano = mediaContra(contexto.gerarRateio);
const uniHumano = mediaContra(contexto.gerarUniforme);
checar("com sorteio de cara humana, o rateio acerta menos — efeito estrutural",
  ratHumano < uniHumano,
  `rateio=${ratHumano.toFixed(3)} uniforme=${uniHumano.toFixed(3)}`);

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
  S.resultados = historicoSemeado("mega-sena", 60, 6, 200, 20260808);
  const par = contexto.contagemPorConcurso("mega-sena", x => x % 2 === 0);
  /* Mega-Sena: 30 pares em 60, k=6 -> esperado 3,0 pares por concurso. */
  checar("o esperado de pares vem da hipergeométrica, não do observado",
    Math.abs(par.esperado - 3.0) < 1e-12, `${par.esperado}`);
  checar("com 200 sorteios honestos, os pares ficam dentro da faixa",
    par.dentro, `média ${par.media.toFixed(3)} vs ${par.esperado}`);
  {
    /* Uma semente só não diz se a faixa está calibrada — diz se aquela semente
       deu sorte. Com 40 históricos independentes, uma faixa de 2 erros-padrão
       tem de acolher cerca de 95% deles; se acolhesse todos, estaria larga
       demais para acusar qualquer coisa. */
    const guardaPar = S.resultados;
    let dentro = 0;
    for (let s = 0; s < 40; s++) {
      S.resultados = historicoSemeado("mega-sena", 60, 6, 200, 900 + s * 7919);
      if (contexto.contagemPorConcurso("mega-sena", x => x % 2 === 0).dentro) dentro++;
    }
    checar("a faixa de 2 erros-padrão acolhe a grande maioria dos históricos honestos",
      dentro >= 34, `${dentro} de 40 dentro da faixa`);
    checar("e não é larga a ponto de nunca acusar nada",
      2 * Math.sqrt(6 * 0.5 * 0.5 * 54 / 59 / 200) < 0.2,
      `faixa de ±${(2 * Math.sqrt(6 * 0.5 * 0.5 * 54 / 59 / 200)).toFixed(3)} em torno de 3`);
    S.resultados = guardaPar;
  }
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
  S.resultados = historicoSemeado("lotofacil", 25, 15, 60, 20260808);
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
   21. Previsão de ganhadores (comportamento humano, não sorteio)
   ================================================================== */
secao("21. Com quantas pessoas você dividiria");

{
  const S = motor.S;
  const g0 = { r: S.resultados, c: S.calibracao, m: S.modalidade };
  S.modalidade = "mega-sena";

  checar("sem calibração, não há previsão",
    (S.calibracao = {}, contexto.preverGanhadores([1,2,3,4,5,6], "mega-sena") === null));

  /* Público simulado que marca datas: quanto mais dezenas ≤ 31, mais gente
     acerta junto. O modelo tem de reproduzir isso em cima de combinações que
     nunca viu. */
  let s7 = 4242;
  const rnd = () => (s7 = (s7 * 1103515245 + 12345) % 2147483648) / 2147483648;
  S.resultados = [];
  for (let i = 1; i <= 200; i++) {
    const pool = Array.from({ length: 60 }, (_, k) => k + 1);
    for (let k = 59; k > 0; k--) { const j = Math.floor(rnd() * (k + 1));
      const t2 = pool[k]; pool[k] = pool[j]; pool[j] = t2; }
    const dez = pool.slice(0, 6).sort((a, b) => a - b);
    const ate31 = dez.filter(d => d <= 31).length;
    S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
      dezenas: dez,
      rateio: [{ faixa: 1, ganhadores: Math.round(Math.exp(0.9 * ate31) * (0.6 + rnd() * 0.8)),
                 premio: 5e7 }] });
  }
  S.calibracao = { "mega-sena": contexto.calibrarPopularidade("mega-sena") };

  const aniversario = contexto.preverGanhadores([3, 7, 12, 19, 25, 31], "mega-sena");
  const espalhado  = contexto.preverGanhadores([4, 17, 33, 41, 52, 58], "mega-sena");

  checar("prevê MAIS ganhadores para jogo de datas",
    aniversario.ganhadores > espalhado.ganhadores,
    `datas ${aniversario.ganhadores.toFixed(1)} vs espalhado ${espalhado.ganhadores.toFixed(1)}`);
  checar("a diferença é grande, não marginal",
    aniversario.ganhadores > espalhado.ganhadores * 3,
    `${(aniversario.ganhadores / Math.max(espalhado.ganhadores, 0.01)).toFixed(1)}x`);
  checar("nunca prevê ganhador negativo",
    [aniversario, espalhado].every(x => x.ganhadores >= 0));
  checar("a mediana histórica é reportada como referência",
    typeof aniversario.mediana === "number" && aniversario.mediana >= 0,
    `mediana ${aniversario.mediana}`);
  checar("o jogo espalhado fica abaixo do típico e o de datas acima",
    espalhado.razao < 1 && aniversario.razao > 1,
    `${espalhado.razao.toFixed(2)} vs ${aniversario.razao.toFixed(2)}`);

  /* Calibração inútil não deve virar previsão exibida. */
  S.calibracao["mega-sena"].util = false;
  S.marcadas = { "mega-sena": [4, 17, 33, 41, 52, 58] };
  S.tela = "montar";
  checar("calibração declarada inútil não exibe a previsão",
    !/com quantas pessoas você dividiria/i.test(contexto.T.montar()));

  S.calibracao["mega-sena"].util = true;
  const html5 = contexto.T.montar();
  checar("com calibração útil, a previsão aparece",
    /com quantas pessoas você dividiria/i.test(html5));
  checar("a tela repete que a chance de acertar NÃO muda",
    /não\s+muda\s+sua\s+chance/i.test(html5));
  checar("e explica por que esta previsão é diferente de prever dezena",
    /comportamento\s+humano/i.test(html5));

  S.marcadas = {};
  S.resultados = g0.r; S.calibracao = g0.c; S.modalidade = g0.m;
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

/* ==================================================================
   17. Perfil do jogo contra o histórico
   ================================================================== */
secao("17. Perfil do jogo");

{
  const S = motor.S;
  const guardado = { r: S.resultados, m: S.modalidade };
  S.modalidade = "lotofacil";

  checar("primos: 2, 3, 5, 7 sim; 1, 4, 9 não",
    [2,3,5,7].every(contexto.ehPrimo) && ![1,4,9].some(contexto.ehPrimo));

  /* Moldura da Lotofácil: grade 5x5, borda são 16 das 25 dezenas. */
  {
    const naBorda = [];
    for (let d = 1; d <= 25; d++) if (contexto.naMoldura(d, "lotofacil")) naBorda.push(d);
    checar("a moldura da Lotofácil tem 16 dezenas", naBorda.length === 16,
      naBorda.join(","));
    checar("o centro (13) não está na moldura", !contexto.naMoldura(13, "lotofacil"));
    checar("os cantos estão na moldura",
      [1, 5, 21, 25].every(d => contexto.naMoldura(d, "lotofacil")));
  }

  /* Histórico curto: recusa em vez de comparar contra nada. */
  S.resultados = [{ concurso: 1, data: "2025-01-01", modalidade: "lotofacil",
    dezenas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] }];
  {
    const p2 = contexto.perfilDoJogo([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], "lotofacil");
    checar("com histórico curto, o perfil recusa e diz quanto falta",
      !!p2.erro && p2.tem === 1, p2.erro);
  }

  /* Histórico em que TODOS os concursos têm 8 pares: um jogo com 8 pares tem
     de dar 100%, e um com 7 tem de dar 0%. É a checagem que prova que a
     fração é medida no histórico, e não estimada. */
  {
    S.resultados = [];
    for (let i = 1; i <= 40; i++)
      S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "lotofacil",
        dezenas: [2,4,6,8,10,12,14,16,1,3,5,7,9,11,13].sort((a,b)=>a-b) });
    const p3 = contexto.perfilDoJogo([2,4,6,8,10,12,14,16,1,3,5,7,9,11,13], "lotofacil");
    const par = p3.linhas.find(l => l.id === "paridade");
    checar("configuração que ocorre em todo concurso dá 100%",
      Math.abs(par.fracao - 1) < 1e-9, `${(100*par.fracao).toFixed(1)}%`);
    const p4 = contexto.perfilDoJogo([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], "lotofacil");
    const par4 = p4.linhas.find(l => l.id === "paridade");
    checar("configuração que nunca ocorreu dá 0%", par4.fracao === 0,
      `${(100*par4.fracao).toFixed(1)}%`);
  }

  /* A leitura inverte o veredito do app de referência: comum é ALERTA. */
  checar("muito comum é sinalizado como alerta, não como ótimo",
    contexto.lerTipicidade(0.5).rotulo === "muito comum" &&
    contexto.lerTipicidade(0.5).cor === "var(--alerta)");
  checar("raro é sinalizado a favor, não contra",
    contexto.lerTipicidade(0.001).rotulo === "raro" &&
    contexto.lerTipicidade(0.001).cor === "var(--acaso)");
  checar("a leitura de muito comum fala em dividir com mais gente",
    /mais gente para dividir/.test(contexto.lerTipicidade(0.5).leitura));
  checar("a leitura de raro fala em dividir com menos gente",
    /menos gente para dividir/.test(contexto.lerTipicidade(0.001).leitura));
  checar("nenhuma leitura promete acerto",
    [0.5, 0.1, 0.03, 0.001].every(f =>
      !/chance|mais prov|melhor jogo|ganhar/i.test(contexto.lerTipicidade(f).leitura)));

  /* A tipicidade global usa média geométrica: uma característica raríssima não
     pode ser mascarada por várias comuns, porque é a rara que decide o rateio. */
  {
    S.resultados = [];
    let s5 = 13;
    const rnd = () => (s5 = (s5 * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 1; i <= 200; i++) {
      const pool = Array.from({ length: 25 }, (_, k) => k + 1);
      for (let k = 24; k > 0; k--) { const j = Math.floor(rnd() * (k + 1));
        const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
      S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "lotofacil",
        dezenas: pool.slice(0, 15).sort((a, b) => a - b) });
    }
    const comum = contexto.perfilDoJogo(
      S.resultados[100].dezenas, "lotofacil");
    const extremo = contexto.perfilDoJogo(
      [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], "lotofacil");
    checar("um jogo extremo é menos típico que um sorteio real",
      extremo.tipicidade < comum.tipicidade,
      `extremo ${extremo.tipicidade.toFixed(4)} vs real ${comum.tipicidade.toFixed(4)}`);
    checar("a tipicidade fica entre 0 e 1",
      extremo.tipicidade >= 0 && extremo.tipicidade <= 1 &&
      comum.tipicidade >= 0 && comum.tipicidade <= 1);
    checar("todas as medidas aparecem, e a de repetidas também",
      comum.linhas.length >= 10 && comum.linhas.some(l => l.id === "repetidas"),
      `${comum.linhas.length} linhas`);
  }

  /* O texto na tela precisa desmentir a leitura invertida, explicitamente. */
  {
    S.marcadas = { lotofacil: [1,3,5,7,9,11,13,15,17,19,21,23,25,2,4] };
    S.tela = "montar";
    const html3 = contexto.T.montar();
    checar("a tela avisa sobre a leitura invertida do 'ótimo'",
      /leitura invertida/i.test(html3) && /exatamente a mesma\s*<\/strong>?\s*chance|mesma\s+chance/i.test(html3));
    checar("a tela diz que 'raro' é a favor do bolso",
      /"raro" é a coluna a favor/.test(html3));
    S.marcadas = {};
  }

  S.resultados = guardado.r; S.modalidade = guardado.m;
}

/* ==================================================================
   20. Retrospectiva: o jogo contra todo o histórico
   ================================================================== */
secao("20. Retrospectiva do jogo");

{
  const S = motor.S;
  const guardado = { r: S.resultados, m: S.modalidade };
  S.modalidade = "mega-sena";

  S.resultados = [{ concurso: 1, data: "2025-01-01", modalidade: "mega-sena",
    dezenas: [1,2,3,4,5,6] }];
  checar("histórico curto é recusado com o número que falta",
    contexto.retrospectiva([1,2,3,4,5,6], "mega-sena").tem === 1);

  /* Histórico montado à mão: 20 concursos, o primeiro idêntico ao jogo.
     Os números têm de fechar na conta feita por fora. */
  {
    S.resultados = [];
    for (let i = 1; i <= 20; i++)
      S.resultados.push({ concurso: i, data: "2025-01-01", modalidade: "mega-sena",
        dezenas: i === 1 ? [1,2,3,4,5,6] : [10,20,30,40,50,60],
        rateio: [{ faixa: 1, ganhadores: 1, premio: 1000000 },
                 { faixa: 2, ganhadores: 50, premio: 40000 },
                 { faixa: 3, ganhadores: 3000, premio: 800 }] });

    const r = contexto.retrospectiva([1,2,3,4,5,6], "mega-sena");
    const preco = M["mega-sena"].preco;
    checar("o custo é preço × concursos", r.custo === preco * 20,
      `${r.custo} = ${preco} × 20`);
    checar("acertou 6 uma vez e 0 nas outras 19",
      r.distribuicao[6] === 1 && r.distribuicao[0] === 19,
      JSON.stringify(r.distribuicao));
    checar("o retorno usa o rateio real da faixa", r.retorno === 1000000);
    checar("o líquido é retorno menos custo",
      r.liquido === 1000000 - preco * 20);
    checar("o melhor momento é nomeado com concurso e valor",
      r.melhor && r.melhor.concurso === 1 && r.melhor.premio === 1000000);
    checar("nenhum concurso ficou sem rateio", r.semRateio === 0);
  }

  /* Concurso premiado SEM rateio: entra no histograma, fica fora do retorno, e
     é contado. Estimar o prêmio ausente inflaria o número com invenção. */
  {
    S.resultados = S.resultados.map((x, i) =>
      i === 0 ? { ...x, rateio: undefined } : x);
    const r = contexto.retrospectiva([1,2,3,4,5,6], "mega-sena");
    checar("premiado sem rateio não entra no retorno", r.retorno === 0);
    checar("mas é contado e reportado", r.semRateio === 1 && r.premiados === 1);
    checar("e continua no histograma de acertos", r.distribuicao[6] === 1);
  }

  /* Aposta ampliada custa C(n,k) apostas por concurso. */
  {
    S.resultados = S.resultados.map(x => ({ ...x,
      rateio: [{ faixa: 1, ganhadores: 1, premio: 0 }] }));
    const r7 = contexto.retrospectiva([1,2,3,4,5,6,7], "mega-sena");
    checar("aposta de 7 dezenas custa 7 apostas por concurso",
      r7.apostas === 7 && r7.custoPorConcurso === 7 * M["mega-sena"].preco,
      `${r7.apostas} apostas`);
  }

  /* O texto não pode virar promessa: é extrato do passado. */
  {
    S.marcadas = { "mega-sena": [1,2,3,4,5,6] };
    S.tela = "montar";
    const html4 = contexto.T.montar();
    checar("a tela mostra a retrospectiva",
      /se você tivesse jogado isto sempre/.test(html4));
    /* \s+ de novo, e pela segunda vez na mesma bateria: o texto do app quebra
       linha entre "não se" e "repete". Espaço literal em asserção sobre HTML
       formatado reprova o texto certo — é falso negativo, não defeito. */
    checar("e avisa que o passado não se repete",
      /passado\s+não\s+se\s+repete/.test(html4));
    checar("e não promete desempenho futuro",
      !/vai ganhar|vai render|melhor jogo para o próximo/i.test(html4));
    S.marcadas = {};
  }

  S.resultados = guardado.r; S.modalidade = guardado.m;
}


/* ==================================================================
   18. Fontes de resultado e conversão de formatos
   ================================================================== */
secao("18. Fontes de resultado");

{
  /* Buscar por id, e não por posição: indexar por número quebrou este teste
     quando a fonte do repositório entrou na frente, e o teste apontava para a
     fonte errada em vez de acusar o que importava. */
  const fonte = id => contexto.FONTES.find(f => f.id === id);

  checar("o repositório é a primeira fonte tentada",
    contexto.FONTES[0].id === "repositorio",
    contexto.FONTES.map(f => f.id).join(" -> "));
  checar("as fontes de rede continuam como reserva",
    ["caixa", "espelho-guidi", "proxy"].every(id => !!fonte(id)));
  checar("toda fonte tem url e conversor",
    contexto.FONTES.every(f => typeof f.url === "function" &&
      typeof f.converter === "function" && f.nome));
  checar("a url do repositório aponta para raw.githubusercontent",
    /raw\.githubusercontent\.com/.test(fonte("repositorio").url("megasena", null, "mega-sena")) &&
    /mega-sena\.json$/.test(fonte("repositorio").url("megasena", null, "mega-sena")),
    fonte("repositorio").url("megasena", null, "mega-sena"));
  checar("o proxy embute a url da Caixa codificada",
    /allorigins/.test(fonte("proxy").url("megasena", null)) &&
    /caixa\.gov\.br/.test(decodeURIComponent(fonte("proxy").url("megasena", null))));
  checar("a url oficial muda quando se pede um concurso específico",
    fonte("caixa").url("megasena", 2700).endsWith("/2700") &&
    !fonte("caixa").url("megasena", null).endsWith("/null"));

  /* Conversor do arquivo do repositório. */
  {
    const arquivo = { modalidade: "mega-sena", total: 2, concursos: [
      { concurso: 100, data: "2025-01-01", dezenas: [1,2,3,4,5,6] },
      { concurso: 101, data: "2025-01-04", dezenas: [7,8,9,10,11,12],
        rateio: [{faixa:1, ganhadores:0, premio:0}] }
    ]};
    const ultimo = contexto.normalizarRepositorio(arquivo, "mega-sena", null);
    checar("sem concurso pedido, o repositório devolve o mais recente",
      ultimo.concurso === 101 && ultimo.origem === "repositorio");
    const especifico = contexto.normalizarRepositorio(arquivo, "mega-sena", 100);
    checar("com concurso pedido, devolve o certo", especifico.concurso === 100);

    let faltou = "";
    try { contexto.normalizarRepositorio(arquivo, "mega-sena", 999); }
    catch (e) { faltou = e.message; }
    checar("concurso ausente do arquivo é erro, não silêncio",
      /ainda não está no arquivo/.test(faltou), faltou);

    let vazio = "";
    try { contexto.normalizarRepositorio({ concursos: [] }, "mega-sena", null); }
    catch (e) { vazio = e.message; }
    checar("arquivo vazio é recusado", /vazio/.test(vazio), vazio);

    let curto = "";
    try { contexto.normalizarRepositorio(
      { concursos: [{ concurso: 1, dezenas: [1,2,3] }] }, "mega-sena", null); }
    catch (e) { curto = e.message; }
    checar("concurso com dezenas faltando é recusado",
      /3 dezenas, esperava 6/.test(curto), curto);
  }


  /* Formato do espelho: nomes diferentes, mesmo resultado. */
  {
    const bruto = {
      concurso: 2750, data: "05/08/2026",
      dezenas: ["04", "11", "23", "38", "45", "52"],
      premiacoes: [
        { faixa: 1, descricao: "6 acertos", ganhadores: 2, valorPremio: 40000000 },
        { faixa: 2, descricao: "5 acertos", ganhadores: 55, valorPremio: 60000 }
      ],
      localGanhadores: [{ municipio: "Belo Horizonte", uf: "MG", ganhadores: 1 }],
      dataProximoConcurso: "08/08/2026", valorEstimadoProximoConcurso: 55000000,
      proximoConcurso: 2751, acumulou: false
    };
    const r = contexto.normalizarEspelho(bruto, "mega-sena");
    checar("o espelho converte dezenas, data e concurso",
      r.concurso === 2750 && r.data === "2026-08-05" &&
      r.dezenas.join(",") === "4,11,23,38,45,52",
      `${r.data} · ${r.dezenas.join(",")}`);
    checar("o espelho converte o rateio",
      r.rateio.length === 2 && r.rateio[0].ganhadores === 2 &&
      r.rateio[0].premio === 40000000);
    checar("o espelho converte as cidades",
      r.cidades.length === 1 && r.cidades[0].municipio === "Belo Horizonte");
    checar("o espelho traz o próximo concurso e a estimativa",
      r.concursoProximo === 2751 && r.estimativaProximo === 55000000 &&
      r.dataProximo === "2026-08-08");
    checar("o espelho marca a origem", r.origem === "espelho");
  }

  /* Recusa em vez de completar: dezenas a menos é erro, não resultado parcial. */
  {
    let recusou = false, msg = "";
    try { contexto.normalizarEspelho({ concurso: 1, dezenas: ["1","2","3"] }, "mega-sena"); }
    catch (e) { recusou = true; msg = e.message; }
    checar("o espelho recusa resposta com dezenas faltando", recusou, msg);

    let recusou2 = false;
    try { contexto.normalizarEspelho(
      { dezenas: ["1","2","3","4","5","6"] }, "mega-sena"); }
    catch (e) { recusou2 = true; }
    checar("o espelho recusa resposta sem número de concurso", recusou2);
  }

  /* Sem rede, a cadeia tenta todas e o erro nomeia cada uma. O fetch do arnês
     rejeita de propósito — é o mesmo caminho do "Failed to fetch" real. */
  await (async () => {
    let erro = null;
    try { await contexto.buscarNaCaixa("mega-sena", null); }
    catch (e) { erro = e; }
    checar("sem rede, a cadeia falha depois de tentar todas", !!erro && erro.todasFalharam);
    checar("o erro nomeia cada fonte tentada",
      contexto.FONTES.every(f => erro.message.includes(f.nome)),
      erro.message.slice(0, 110));
    checar("o erro não é só 'Failed to fetch' sem contexto",
      erro.message.length > 40);
  })();

  /* A função é async, então o try/catch síncrono não pega nada — a primeira
     versão deste teste tinha um `|| true` no fim e passava sempre, que é pior
     que não existir. Com await, ele testa de verdade. */
  await (async () => {
    let msg = "";
    try { await contexto.buscarNaCaixa("inexistente", null); }
    catch (e) { msg = e.message; }
    checar("modalidade sem serviço conhecido falha sem tentar rede",
      /sem serviço público/.test(msg), msg);
  })();
}

/* ==================================================================
   19. A tela de Conferir não pode mentir sobre o que o app faz
   ================================================================== */
secao("19. Conferir: texto e busca");

{
  const S = motor.S;
  const guardado = S.modalidade;
  S.modalidade = "mega-sena";
  const tela = contexto.T.conferir();

  /* O texto dizia "não busca nada sozinho". Passou a ser falso quando a busca
     entrou, e ficou na tela. Este teste impede que volte. */
  checar("a tela NÃO afirma que o app não busca nada sozinho",
    !/não busca nada sozinho/i.test(tela));
  checar("a tela continua afirmando que o app não inventa resultado",
    /não inventa[\s\S]{0,40}resultado/i.test(tela));
  checar("a tela oferece buscar o resultado",
    /id="c-buscar"/.test(tela) && /id="c-ultimo"/.test(tela));
  checar("a digitação continua oferecida como via válida",
    /digite o resultado/i.test(tela) && /c-dez/.test(tela));

  S.modalidade = guardado;
}










/* ==================================================================
   22. Sugestão do sistema, e a retirada do "otimizado para rateio"
   ==================================================================
   O dono do app tirou "Otimizado para rateio" por não acreditar nele, e a
   medida deu razão: `calibrarPopularidade` precisa de 30 concursos com
   ganhadores publicados e o histórico tem 26 somando as oito modalidades —
   nunca rodou. No lugar entrou uma sugestão que não pesa comportamento
   humano nenhum: só compara o jogo com a distribuição observada de cada
   estatística. */
secao("22. Sugestão do sistema e retirada do rateio");
{
  const S = motor.S;
  const guardado = S.resultados, guardadaMod = S.modalidade, guardadoTam = S.tamanho;

  checar("o rateio não é mais oferecido como estratégia",
    !motor.METODOS.some((m) => m.id === "rateio"),
    motor.METODOS.map((m) => m.id).join(", "));
  checar("nem o contraste, que era o mesmo mecanismo com outro nome",
    !motor.METODOS.some((m) => m.id === "contraste"));
  checar("e nenhuma descrição na tela ainda vende rateio esperado",
    !motor.METODOS.some((m) => /rateio/i.test(m.desc)),
    motor.METODOS.map((m) => m.nome).join(" · "));

  /* "Evita o concurso anterior" passou a fazer só o que o nome diz. O teste
     mede o efeito, e não a implementação: contra um concurso anterior
     conhecido, ele tem de repetir menos dezenas que o sorteio uniforme. */
  {
    const anterior = [1, 2, 3, 4, 5, 6];
    const conta = (jogos) => jogos.reduce(
      (soma, j) => soma + j.filter((d) => anterior.includes(d)).length, 0);
    const anti = conta(contexto.gerarAntirepeticao("mega-sena", 20, 6, anterior));
    const uni = conta(contexto.gerarUniforme("mega-sena", 20, 6));
    checar("evitar o anterior repete menos que o uniforme",
      anti < uni, `anti=${anti} uniforme=${uni} dezenas repetidas em 20 jogos`);
  }
  /* Sem `|| true`: um teste que passa de qualquer jeito é pior que nenhum.
     O método corrente tem de ser um dos que a lista realmente oferece. */
  checar("e o método corrente é um dos que a lista oferece",
    motor.METODOS.some((m) => m.id === S.metodo), S.metodo);

  /* Jogo salvo com um método retirado não pode derrubar a tela de ninguém. */
  checar("um jogo salvo no método retirado ainda tem nome",
    /rateio/i.test(motor.nomeDoMetodo("rateio")), motor.nomeDoMetodo("rateio"));
  checar("e um id nunca visto também não quebra",
    typeof motor.nomeDoMetodo("inventado-em-2031") === "string",
    motor.nomeDoMetodo("inventado-em-2031"));
  checar("método vigente continua com o nome da lista",
    motor.nomeDoMetodo("uniforme") === "Sorteio uniforme");

  /* Sem concurso anterior, "evita o anterior" caía no rateio — o método
     retirado entrando pela porta dos fundos. Agora cai no uniforme. */
  S.resultados = [];
  S.modalidade = "mega-sena";
  const semAnterior = contexto.gerarAntirepeticao("mega-sena", 3, 6, null);
  checar("sem concurso anterior, o antirepeticao gera assim mesmo",
    semAnterior.length === 3 && semAnterior.every((j) => j.length === 6));

  /* --- a sugestão --- */
  S.modalidade = "mega-sena";
  S.tamanho = null;
  S.resultados = historicoSemeado("mega-sena", 60, 6, 400, 20260809);

  const curto = { ...motor.S };
  S.resultados = historicoSemeado("mega-sena", 60, 6, 10, 1);
  const recusa = contexto.sugestaoDoSistema("mega-sena", 6);
  checar("com histórico curto, a sugestão recusa em vez de inventar",
    !!recusa.erro && /faltam 10/.test(recusa.erro), recusa.erro);
  void curto;

  S.resultados = historicoSemeado("mega-sena", 60, 6, 400, 20260809);
  const s1 = contexto.sugestaoDoSistema("mega-sena", 6, { semente: 777 });
  checar("a sugestão devolve um jogo válido",
    s1.dezenas.length === 6 && new Set(s1.dezenas).size === 6 &&
    s1.dezenas.every((d) => d >= 1 && d <= 60), s1.dezenas.join(" "));
  checar("ordenado", s1.dezenas.every((d, i) => i === 0 || d > s1.dezenas[i - 1]));
  checar("usa TODAS as medidas do perfil, mais as repetidas do anterior",
    s1.linhas.length === contexto.medidasDoPerfil("mega-sena").length + 1,
    `${s1.linhas.length} medidas`);

  /* O ponto do método: nenhuma medida num extremo. Comparado com o que uma
     candidata qualquer entrega, e não com um número escolhido a dedo. */
  checar("a medida mais rara da sugestão é mais comum que a de um jogo qualquer",
    s1.menor > s1.medianaDoAcaso,
    `sugestão ${(s1.menor * 100).toFixed(1)}% vs acaso ${(s1.medianaDoAcaso * 100).toFixed(1)}%`);
  checar("e nenhuma das medidas ficou abaixo desse mínimo",
    s1.linhas.every((l) => l.fracao >= s1.menor - 1e-12));
  checar("toda linha diz em quantos concursos aquilo apareceu",
    s1.linhas.every((l) => Number.isInteger(l.concursos) && l.concursos >= 0 &&
      l.fracao >= 0 && l.fracao <= 1));

  const s2 = contexto.sugestaoDoSistema("mega-sena", 6, { semente: 777 });
  checar("a mesma semente dá exatamente a mesma sugestão",
    s2.dezenas.join(",") === s1.dezenas.join(","), s2.dezenas.join(" "));
  const s3 = contexto.sugestaoDoSistema("mega-sena", 6, { semente: 778 });
  checar("semente diferente dá outra sugestão",
    s3.dezenas.join(",") !== s1.dezenas.join(","));

  /* Mais candidatas não pode piorar o mínimo: é uma busca por máximo. */
  const poucas = contexto.sugestaoDoSistema("mega-sena", 6, { semente: 5, candidatas: 20 });
  const muitas = contexto.sugestaoDoSistema("mega-sena", 6, { semente: 5, candidatas: 400 });
  checar("mais candidatas não pioram a escolha",
    muitas.menor >= poucas.menor,
    `20 -> ${(poucas.menor * 100).toFixed(1)}% · 400 -> ${(muitas.menor * 100).toFixed(1)}%`);

  /* Respeita o tamanho pedido, inclusive fora do mínimo da modalidade. */
  const grande = contexto.sugestaoDoSistema("mega-sena", 8, { semente: 3 });
  checar("respeita o tamanho pedido", grande.dezenas.length === 8);

  /* A tela: o aviso que não pode faltar, e a ausência do que não pode existir. */
  const html = contexto.tabelaSugestao(s1);
  /* A primeira versão deste teste aceitava, como alternativa, a frase
     "aumenta a sua chance" — que é exatamente a mentira que ele existe para
     impedir. Agora exige a negação, e reprova a afirmação. */
  checar("a tela diz que isto NÃO aumenta a chance",
    /Isto\s+não\s+aumenta\s+a\s+sua\s+chance/.test(html));
  checar("e em nenhum lugar afirma o contrário",
    !/(?<!não\s)aumenta(m)?\s+(a\s+sua|as\s+suas|sua)\s+chances?/i
      .test(html.replace(/Isto não aumenta a sua chance/g, "")));
  checar("a tela explica por que uma configuração é comum",
    /mais\s+combinações<\/em>\s+com\s+ela/.test(html));
  checar("a tela mostra a referência do acaso, não só o número da sugestão",
    /sem critério/.test(html));
  checar("a tela não promete previsão",
    !/prevê|previsão d[oa] próximo|vai sair/i.test(html.replace(/Não é previsão/g, "")));
  checar("a tela da sugestão renderiza as dez medidas",
    (html.match(/<tr>/g) || []).length === s1.linhas.length + 1,
    `${(html.match(/<tr>/g) || []).length} linhas de tabela`);
  /* --- o aprendizado NÃO entra na sugestão, e a tela diz isso --- */
  {
    const guardaAp = S.aprendizado;

    S.aprendizado = {};
    const semMedir = contexto.aprendizadoNaSugestao("mega-sena");
    checar("sem aprendizado rodado, a tela diz que não há o que usar",
      semMedir.usa === false && /ainda não rodou/.test(semMedir.texto));

    S.aprendizado = { "mega-sena": { auc: 0.5035, p: 0.368, aprendeu: false } };
    const semSinal = contexto.aprendizadoNaSugestao("mega-sena");
    checar("com o modelo sem achar nada, a sugestão NÃO usa o modelo",
      semSinal.usa === false, semSinal.estado);
    checar("e a tela mostra o AUC medido, para não ser 'confie em mim'",
      /0,5035/.test(semSinal.texto) && /0,5 é/.test(semSinal.texto), "");

    /* O caso que separa um app honesto de um vendedor: MESMO achando desvio,
       a sugestão continua sem usar o modelo. Achado é motivo para investigar,
       não para escolher dezena. */
    S.aprendizado = { "mega-sena": { auc: 0.755, p: 0.004, aprendeu: true } };
    const comSinal = contexto.aprendizadoNaSugestao("mega-sena");
    checar("MESMO com sinal, a sugestão continua sem usar o modelo",
      comSinal.usa === false, comSinal.estado);
    checar("mas a tela conta que houve achado, em vez de esconder",
      /0,7550/.test(comSinal.texto) && /sobreviveu à correção/.test(comSinal.texto), "");
    checar("nenhum dos três textos promete dezena mais provável",
      [semMedir, semSinal, comSinal].every(x =>
        !/mais provável|mais prováveis|vai sair|tende a sair/i.test(x.texto)));

    S.resultados = historicoSemeado("mega-sena", 60, 6, 400, 20260809);
    S.aprendizado = { "mega-sena": { auc: 0.5035, p: 0.368, aprendeu: false } };
    const comAviso = contexto.tabelaSugestao(
      contexto.sugestaoDoSistema("mega-sena", 6, { semente: 4 }));
    checar("a tela da sugestão responde 'o aprendizado entra aqui?'",
      /O aprendizado entra aqui\?/.test(comAviso));
    checar("e responde que não usa",
      /não usa<\/strong>/.test(comAviso), "");

    S.aprendizado = guardaAp;
  }

  const vazio = contexto.tabelaSugestao({ erro: "faltam 5 concursos" });
  checar("erro vira aviso na tela, não tabela vazia",
    /faltam 5 concursos/.test(vazio) && !/<table/.test(vazio));

  /* Lotofácil: o universo e a quantidade mudam, a sugestão tem de acompanhar. */
  S.resultados = historicoSemeado("lotofacil", 25, 15, 300, 4242);
  S.modalidade = "lotofacil";
  const lf = contexto.sugestaoDoSistema("lotofacil", 15, { semente: 9 });
  checar("funciona na Lotofácil também",
    lf.dezenas.length === 15 && lf.dezenas.every((d) => d >= 1 && d <= 25),
    lf.dezenas.join(" "));
  checar("e na Lotofácil a medida mais rara também bate o acaso",
    lf.menor > lf.medianaDoAcaso,
    `${(lf.menor * 100).toFixed(1)}% vs ${(lf.medianaDoAcaso * 100).toFixed(1)}%`);

  S.resultados = guardado; S.modalidade = guardadaMod; S.tamanho = guardadoTam;
}

/* ==================================================================
   23. Teve ganhador? — três estados, e o do meio é "não sei"
   ==================================================================
   A diferença entre "não teve ganhador" e "o app não sabe" é a mais fácil de
   apagar numa tela e uma das mais caras: quem lê "acumulou" acredita que o
   concurso acumulou. Só 26 dos 21.421 concursos importados trazem rateio, então
   o estado "não sei" é o mais comum — e precisa aparecer como tal. */
secao("23. Teve ganhador?");
{
  const S = motor.S;
  const guardado = S.resultados, guardadaMod = S.modalidade;

  const comGanhador = { concurso: 10, modalidade: "mega-sena", dezenas: [1,2,3,4,5,6],
    rateio: [{ faixa: 1, ganhadores: 3, premio: 1000 },
             { faixa: 2, ganhadores: 90, premio: 20 }],
    cidades: [{ municipio: "BELO HORIZONTE", uf: "MG", ganhadores: 2 },
              { municipio: "RECIFE", uf: "PE", ganhadores: 1 }] };
  const acumulado = { concurso: 11, modalidade: "mega-sena", dezenas: [1,2,3,4,5,7],
    rateio: [{ faixa: 1, ganhadores: 0, premio: 0 },
             { faixa: 2, ganhadores: 55, premio: 30 }] };
  const semDado = { concurso: 12, modalidade: "mega-sena", dezenas: [1,2,3,4,5,8] };
  const semFaixa1 = { concurso: 13, modalidade: "mega-sena", dezenas: [1,2,3,4,5,9],
    rateio: [{ faixa: 2, ganhadores: 40, premio: 25 }] };

  checar("concurso com ganhador é reconhecido",
    contexto.ganhadoresDoConcurso(comGanhador).estado === "ganhou");
  checar("concurso sem ganhador na faixa 1 é 'acumulou'",
    contexto.ganhadoresDoConcurso(acumulado).estado === "acumulou");
  checar("concurso SEM rateio é 'desconhecido', e não 'acumulou'",
    contexto.ganhadoresDoConcurso(semDado).estado === "desconhecido",
    contexto.ganhadoresDoConcurso(semDado).rotulo);
  checar("rateio sem a faixa 1 também é 'desconhecido'",
    contexto.ganhadoresDoConcurso(semFaixa1).estado === "desconhecido");
  checar("objeto vazio não quebra",
    contexto.ganhadoresDoConcurso({}).estado === "desconhecido");
  checar("nem null",
    contexto.ganhadoresDoConcurso(null).estado === "desconhecido");

  /* zero ganhadores é um DADO; ausência de dado não é zero. É a mesma regra
     que `premioDaFaixa` já seguia para o valor do prêmio. */
  checar("zero ganhadores conta como informação, não como falta dela",
    contexto.ganhadoresDoConcurso(acumulado).ganhadores === 0 &&
    contexto.ganhadoresDoConcurso(semDado).ganhadores === undefined);

  const selo1 = contexto.seloGanhadores(comGanhador);
  checar("o selo diz quantos ganhadores", /3 ganhadores/.test(selo1), "");
  checar("e o prêmio de cada um", /R\$/.test(selo1));
  checar("e as cidades, quando a Caixa informou",
    /BELO HORIZONTE\/MG \(2\)/.test(selo1) && /RECIFE\/PE/.test(selo1));
  checar("um ganhador só não vira 'ganhadores'",
    /\b1 ganhador</.test(contexto.seloGanhadores(
      { rateio: [{ faixa: 1, ganhadores: 1, premio: 5 }] })));

  const selo2 = contexto.seloGanhadores(acumulado);
  checar("o selo do acumulado diz que NÃO houve ganhador",
    /sem ganhador/i.test(selo2) && /acumulou/i.test(selo2), "");
  checar("e não inventa prêmio para quem não existiu", !/R\$/.test(selo2));

  const selo3 = contexto.seloGanhadores(semDado);
  checar("o selo do desconhecido diz 'não informado', e nunca 'acumulou'",
    /não informado/i.test(selo3) && !/acumulou/i.test(selo3), "");
  checar("e nunca afirma que houve ganhador", !/ganhador\b(?!es não)/i.test(
    selo3.replace(/ganhadores não informados/gi, "")));
  checar("os três estados saem com classes diferentes na tela",
    new Set([selo1, selo2, selo3].map(h =>
      (h.match(/selo-ganho (\w+)/) || [])[1])).size === 3);

  /* A cobertura: a tela precisa dizer o tamanho do buraco. */
  S.modalidade = "mega-sena";
  S.resultados = [comGanhador, acumulado, semDado, semFaixa1];
  const cob = contexto.coberturaDeGanhadores("mega-sena");
  checar("a cobertura conta quantos concursos têm a informação",
    cob.total === 4 && cob.com === 2, `${cob.com} de ${cob.total}`);
  checar("e a fração bate", Math.abs(cob.fracao - 0.5) < 1e-12);
  S.resultados = [];
  checar("sem histórico, a cobertura não divide por zero",
    contexto.coberturaDeGanhadores("mega-sena").fracao === 0);

  /* A tela de resultados: o aviso sobre o buraco, e a promessa de não mentir. */
  S.resultados = [comGanhador, acumulado, semDado];
  const tela = contexto.T.resultados();
  checar("a tela declara quantos concursos têm ganhador conhecido",
    /Ganhadores conhecidos em/.test(tela));
  checar("e explica que 'não informado' não quer dizer 'sem ganhador'",
    /não\s+sabe,\s+e\s+não\s+que\s+não\s+houve\s+ganhador/.test(tela), "");
  checar("os selos aparecem na lista",
    (tela.match(/selo-ganho/g) || []).length === 3,
    `${(tela.match(/selo-ganho/g) || []).length} selos`);

  /* --- verde e amarelo: a cor do concurso inteiro, em todas as buscas --- */
  S.resultados = [comGanhador, acumulado, semDado];
  const lista = contexto.T.resultados();
  checar("o concurso com ganhador sai VERDE (classe ganhou)",
    /class="item ganhou"/.test(lista));
  checar("o acumulado sai AMARELO (classe acumulou)",
    /class="item acumulou"/.test(lista));
  checar("o sem informação não recebe cor nenhuma das duas",
    /class="item desconhecido"/.test(lista));
  checar("as três classes aparecem, uma por concurso",
    ["ganhou","acumulou","desconhecido"].every(c =>
      (lista.match(new RegExp(`class="item ${c}"`, "g")) || []).length === 1));

  /* A cor nunca vai sozinha: quem não distingue verde de amarelo continua
     lendo a mesma informação em texto. */
  checar("a cor não é a única pista — o texto continua lá",
    /sem ganhador/i.test(lista) && /ganhadores não informados/i.test(lista));

  const res = contexto.resumoGanhadores([comGanhador, acumulado, semDado, acumulado]);
  checar("o resumo do lote conta cada estado",
    res.conta.ganhou === 1 && res.conta.acumulou === 2 && res.conta.desconhecido === 1,
    JSON.stringify(res.conta));
  checar("e escreve os plurais certos",
    /1 com ganhador/.test(res.texto) && /2 acumulados/.test(res.texto), res.texto);
  checar("um acumulado só não vira 'acumulados'",
    /1 acumulado</.test(contexto.resumoGanhadores([acumulado]).texto),
    contexto.resumoGanhadores([acumulado]).texto);
  checar("lote vazio não quebra", contexto.resumoGanhadores([]).texto === "");
  checar("lote nulo também não", contexto.resumoGanhadores(null).texto === "");
  checar("o resumo não cita estado que não ocorreu",
    !/acumulad/.test(contexto.resumoGanhadores([comGanhador]).texto),
    contexto.resumoGanhadores([comGanhador]).texto);

  S.resultados = guardado; S.modalidade = guardadaMod;
}

/* ==================================================================
   24. Avisos no celular
   ==================================================================
   O pedido: o celular avisar sobre concurso novo e sobre jogo conferido. O que
   torna isso possível com o app FECHADO é o alarme do próprio Android, e não
   JavaScript — nenhum código deste arquivo roda com o app fechado. Estes testes
   cobrem a lógica que decide QUANDO e SE agendar; o disparo em si é do sistema.

   O caso mais importante aqui não é o aviso chegar: é ele NÃO chegar quando não
   deve. Um app que avisa demais é desinstalado, e um que avisa o que a pessoa
   desligou é pior que um que não avisa. */
secao("24. Avisos no celular");
{
  const S = motor.S;
  const guardado = S.resultados, guardaJogos = S.jogos, guardaAvisar = S.avisarSorteio;

  /* --- o horário do lembrete --- */
  const q = contexto.momentoDoAviso("2026-08-12");
  checar("o lembrete cai no dia do sorteio", q.getFullYear() === 2026 &&
    q.getMonth() === 7 && q.getDate() === 12, q.toString().slice(0, 21));
  checar("e 90 minutos DEPOIS do sorteio, não na hora",
    q.getHours() === 21 && q.getMinutes() === 30,
    `${q.getHours()}h${String(q.getMinutes()).padStart(2,"0")}`);
  checar("data inválida não vira alarme", contexto.momentoDoAviso("12/08/2026") === null);
  checar("data vazia também não", contexto.momentoDoAviso("") === null);
  checar("nem undefined", contexto.momentoDoAviso(undefined) === null);

  /* --- id estável: reagendar substitui, não empilha --- */
  const a = contexto.Avisos.id("sorteio:mega-sena:2824");
  const b = contexto.Avisos.id("sorteio:mega-sena:2824");
  const c = contexto.Avisos.id("sorteio:mega-sena:2825");
  checar("a mesma chave dá sempre o mesmo id", a === b, String(a));
  checar("chaves diferentes dão ids diferentes", a !== c);
  checar("o id é inteiro positivo (o Android exige)",
    Number.isInteger(a) && a > 0 && a < 2147483647, String(a));
  const ids = new Set();
  for(let i = 0; i < 3000; i++) ids.add(contexto.Avisos.id(`sorteio:mega-sena:${i}`));
  checar("3000 chaves seguidas não colidem", ids.size === 3000, `${ids.size} ids`);

  /* --- fora do APK, nada é agendado, e o app diz isso em vez de fingir --- */
  checar("sem plugin nativo, não há plugin", contexto.Avisos.plugin() === null);
  checar("e o app declara a via disponível",
    ["nativo","navegador","indisponivel"].includes(contexto.Avisos.disponivel()),
    contexto.Avisos.disponivel());

  S.jogos = [{id:"j1", modalidade:"mega-sena", dezenas:[1,2,3,4,5,6],
    data:"2026-08-01", conferencias:[]}];
  S.resultados = [{concurso:2823, data:"2026-08-05", modalidade:"mega-sena",
    dezenas:[4,11,23,38,45,52], dataProximo:"2026-08-08", concursoProximo:2824}];
  S.avisarSorteio = true;
  const semPlugin = await contexto.reagendarLembretes();
  checar("fora do APK nenhum lembrete é agendado",
    semPlugin.agendados === 0, semPlugin.motivo || "");

  /* --- desligado é desligado, mesmo com tudo pronto para agendar --- */
  S.avisarSorteio = false;
  const desligado = await contexto.reagendarLembretes();
  checar("com o aviso desligado, nem tenta agendar",
    desligado.agendados === 0 && desligado.motivo === "desligado", desligado.motivo);
  S.avisarSorteio = true;

  /* --- a conferência automática informa QUANTO foi, e não só que houve --- */
  S.jogos = [{id:"j1", modalidade:"lotofacil",
    dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], data:"2026-08-01", conferencias:[]}];
  S.teimosinhas = [];
  S.resultados = [{concurso:900, data:"2026-08-05", modalidade:"lotofacil",
    dezenas:[1,2,3,4,5,6,7,8,9,10,11,12,13,16,17]}];
  const conf = contexto.conferenciaAutomatica();
  checar("a conferência automática acha o prêmio", conf.premios === 1, `${conf.premios}`);
  checar("e diz qual foi o melhor achado, para a notificação ter conteúdo",
    conf.melhor && conf.melhor.acertos === 13 && conf.melhor.concurso === 900,
    conf.melhor ? `${conf.melhor.acertos} acertos no ${conf.melhor.concurso}` : "sem melhor");
  checar("sem prêmio nenhum, não há 'melhor' para anunciar",
    (() => {
      S.jogos = [{id:"j2", modalidade:"mega-sena", dezenas:[1,2,3,4,5,6],
        data:"2026-08-01", conferencias:[]}];
      S.resultados = [{concurso:1, data:"2026-08-05", modalidade:"mega-sena",
        dezenas:[10,20,30,40,50,60]}];
      const r = contexto.conferenciaAutomatica();
      return r.premios === 0 && !r.melhor;
    })());

  /* --- a tela --- */
  S.jogos = []; S.resultados = [];
  const tela = contexto.T.resultados();
  checar("a tela oferece o aviso no celular", /Avisar no celular quando sair sorteio/.test(tela));
  checar("e explica que toca com o app fechado", /com o app fechado/.test(tela));
  checar("e diz que o aviso do prêmio informa de quanto",
    /premiado, e de quanto/.test(tela));
  checar("a tela não promete aviso que o app não sabe entregar",
    !/push|servidor (nos )?avisa|avisamos você/i.test(tela));

  S.resultados = guardado; S.jogos = guardaJogos; S.avisarSorteio = guardaAvisar;
}

function chaveDePopulacao(mem){
  return (mem.populacao || []).map(h => h.genes.map(g => g.primitivo).join(",")).join("|");
}

/* ==================================================================
   25. Motor autônomo de pesquisa estatística adaptativa
   ==================================================================
   Uma busca evolutiva que testa milhares de hipóteses SEMPRE acha uma que
   parece boa. O valor deste módulo não está em achar — está em não se deixar
   enganar pelo que acha. Por isso a maior parte destes testes cobre os
   mecanismos que DERRUBAM achados, e não os que produzem.

   O teste que dá sentido a todos os outros é o do sorteio viciado: um motor que
   nunca acha nada poderia estar simplesmente quebrado, e aí o silêncio dele não
   informaria coisa alguma. */
secao("25. Motor de pesquisa adaptativa");
{
  const S = motor.S;
  const guardado = S.resultados, guardadaMod = S.modalidade;
  const guardaPesq = S.pesquisaAdaptativa;

  /* Sorteio em que metade das dezenas repete o concurso anterior. Não é
     loteria — existe para provar que o medidor enxerga. */
  const historicoViciado = (quantos, forca, semente) => {
    const rnd = (s => () => { s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0;
      return s/4294967296; })(semente);
    const res = []; let anterior = [];
    for (let i = 1; i <= quantos; i++) {
      const dez = new Set();
      for (const d of anterior) if (dez.size < forca && rnd() < 0.9) dez.add(d);
      while (dez.size < 6) dez.add(1 + Math.floor(rnd() * 60));
      const arr = [...dez].sort((a,b)=>a-b);
      res.push({ concurso:i, data:"2025-01-01", modalidade:"mega-sena", dezenas:arr });
      anterior = arr;
    }
    return res;
  };

  /* ---- a matriz: sem vazamento, e partida por concurso ---- */
  S.pesquisaAdaptativa = {};
  S.modalidade = "mega-sena";
  S.resultados = historicoSemeado("mega-sena", 60, 6, 260, 20260810);
  const d = contexto.matrizDePesquisa("mega-sena");
  checar("a matriz sai com uma linha por dezena por concurso",
    d.X.length === d.y.length && d.X.length % 60 === 0, `${d.X.length} linhas`);
  checar("e um primitivo por coluna",
    d.X[0].length === contexto.PRIMITIVOS.length, `${d.X[0].length} colunas`);
  checar("todo primitivo fica em [0,1]",
    d.X.every(l => l.every(v => v >= 0 && v <= 1)));
  checar("desenvolvimento e validação não se cruzam",
    !d.desenvolvimento.some(i => d.validacao.includes(i)));
  checar("nenhum concurso fica partido entre os dois",
    (() => {
      const dev = new Set(d.desenvolvimento.map(i => d.concursoDe[i]));
      return !d.validacao.some(i => dev.has(d.concursoDe[i]));
    })());
  checar("a validação vem DEPOIS no tempo, sempre",
    Math.min(...d.validacao.map(i => d.concursoDe[i])) >
    Math.max(...d.desenvolvimento.map(i => d.concursoDe[i])));
  checar("há recortes de walk-forward dentro do desenvolvimento",
    d.recortes.length >= 2 && d.recortes.every(r => r.length > 0),
    `${d.recortes.length} recortes`);
  checar("histórico curto é recusado com o número que falta",
    (() => {
      S.resultados = historicoSemeado("mega-sena", 60, 6, 30, 7);
      const r = contexto.matrizDePesquisa("mega-sena");
      return !!r.erro && /faltam \d+ concursos/.test(r.erro);
    })());

  /* ---- o defeito que este teste existe para nunca voltar ---- */
  {
    /* `assinaturaHistorico` é "quantos:último concurso". Dois históricos
       diferentes com a mesma quantidade e o mesmo último número colidem. O
       motor devolvia a matriz do primeiro para o segundo, em silêncio, e o
       teste do sorteio viciado respondia — com cinco casas — o resultado do
       sorteio honesto rodado antes. */
    const a = historicoViciado(200, 0, 111);
    const b = historicoViciado(200, 3, 111);
    checar("dois históricos diferentes têm a mesma assinatura curta",
      `${a.length}:${a[a.length-1].concurso}` === `${b.length}:${b[b.length-1].concurso}`);
    checar("mas impressões digitais diferentes",
      contexto.digitalDoHistorico(a) !== contexto.digitalDoHistorico(b),
      `${contexto.digitalDoHistorico(a)} vs ${contexto.digitalDoHistorico(b)}`);
    S.resultados = a;
    const ma = contexto.matrizDePesquisa("mega-sena");
    S.resultados = b;
    const mb = contexto.matrizDePesquisa("mega-sena");
    checar("e a matriz não é reaproveitada entre eles",
      ma.assinatura !== mb.assinatura && ma.y.join("") !== mb.y.join(""));
    checar("o mesmo histórico continua reaproveitando o cache",
      contexto.matrizDePesquisa("mega-sena") === mb);
  }

  /* ---- as hipóteses ---- */
  {
    const rnd = contexto.geradorSemeado(4242);
    const hs = Array.from({length: 40}, () => contexto.hipoteseAleatoria(rnd, 1, "aleatória"));
    checar("toda hipótese tem ao menos um gene", hs.every(h => h.genes.length >= 1));
    checar("e no máximo cinco", hs.every(h => h.genes.length <= 5));
    checar("nenhuma repete o mesmo primitivo duas vezes",
      hs.every(h => new Set(h.genes.map(g => g.primitivo)).size === h.genes.length));
    checar("todo gene aponta para um primitivo que existe",
      hs.every(h => h.genes.every(g => contexto.PRIMITIVOS[g.primitivo])));
    checar("e usa uma transformação que existe",
      hs.every(h => h.genes.every(g => contexto.TRANSFORMACOES[g.transformacao])));

    const filho = contexto.cruzar(hs[0], hs[1], rnd, 2);
    checar("o cruzamento produz hipótese válida e não vazia",
      filho.genes.length >= 1 && filho.genes.length <= 5 && filho.origem === "cruzamento");
    checar("e não duplica primitivo",
      new Set(filho.genes.map(g => g.primitivo)).size === filho.genes.length);
    const mutante = contexto.mutar(hs[0], rnd, 2);
    checar("a mutação produz hipótese válida",
      mutante.genes.length >= 1 && mutante.origem === "mutação");
    checar("mutar não estraga o original",
      hs[0].genes.every((g, i) => g.peso === hs[0].genes[i].peso));

    checar("a hipótese se descreve em português, não em números soltos",
      /peso/.test(contexto.descreverHipotese(hs[0])) &&
      contexto.PRIMITIVOS.some(p => contexto.descreverHipotese(hs[0]).includes(p.nome)),
      contexto.descreverHipotese(hs[0]).slice(0, 70));
    checar("hipótese vazia não quebra a descrição",
      typeof contexto.descreverHipotese([]) === "string");
  }

  /* ---- aptidão: o PIOR recorte, não a média ---- */
  {
    S.resultados = historicoSemeado("mega-sena", 60, 6, 260, 20260810);
    const dd = contexto.matrizDePesquisa("mega-sena");
    const rnd = contexto.geradorSemeado(99);
    const h = contexto.hipoteseAleatoria(rnd, 1, "aleatória");
    const ap = contexto.aptidao(h, dd);
    const afast = ap.porRecorte.map(a => Math.abs(a - 0.5));
    checar("a aptidão parte do pior recorte, e não da média",
      Math.abs(ap.pior - Math.min(...afast)) < 1e-12,
      `pior ${ap.pior.toFixed(4)} · média seria ${(afast.reduce((a,b)=>a+b,0)/afast.length).toFixed(4)}`);
    checar("e desconta complexidade", ap.valor < ap.pior);
    const simples = {genes:[h.genes[0]], origem:"t", nascimento:1};
    const complexa = {genes:h.genes, origem:"t", nascimento:1};
    checar("entre duas iguais, a mais simples leva vantagem",
      contexto.aptidao(simples, dd).valor - contexto.aptidao(simples, dd).pior >
      contexto.aptidao(complexa, dd).valor - contexto.aptidao(complexa, dd).pior ||
      complexa.genes.length === 1);
  }

  /* ---- a evolução ---- */
  {
    S.pesquisaAdaptativa = {};
    S.resultados = historicoSemeado("mega-sena", 60, 6, 260, 20260810);
    const g1 = contexto.rodarGeracao("mega-sena");
    checar("a primeira geração é a 1", g1.geracao === 1);
    checar("a população fica no tamanho declarado",
      g1.populacao.length === contexto.POPULACAO_PESQUISA, `${g1.populacao.length}`);
    checar("hipóteses testadas começa a contar", g1.hipotesesTestadas > 0,
      `${g1.hipotesesTestadas}`);
    const g2 = contexto.rodarGeracao("mega-sena");
    checar("a geração seguinte incrementa", g2.geracao === 2);
    checar("e a busca acumula hipóteses novas",
      g2.hipotesesTestadas > g1.hipotesesTestadas,
      `${g1.hipotesesTestadas} -> ${g2.hipotesesTestadas}`);
    checar("cada geração traz imigrantes — hipóteses sem parentesco",
      g2.populacao.some(h => h.origem === "imigrante"));
    checar("e descendentes das que sobreviveram",
      g2.populacao.some(h => h.origem === "cruzamento" || h.origem === "mutação"));
    checar("o histórico de gerações é guardado",
      g2.historico.length === 2 && g2.historico[1].geracao === 2);
    checar("cada linha do histórico registra quantas foram descartadas",
      g2.historico.every(l => l.descartadas > 0));
    checar("a conclusão é invalidada quando a população muda",
      g2.conclusao === null);

    let ger = g2;
    for (let i = 0; i < 6; i++) ger = contexto.rodarGeracao("mega-sena");
    checar("a aptidão do melhor não piora ao longo das gerações (há elitismo)",
      ger.historico[ger.historico.length-1].melhorAptidao >=
      ger.historico[0].melhorAptidao - 1e-9,
      `${ger.historico[0].melhorAptidao.toFixed(4)} -> ${ger.historico[ger.historico.length-1].melhorAptidao.toFixed(4)}`);
  }

  /* ---- o julgamento fora da amostra ---- */
  {
    const c = contexto.concluirPesquisa("mega-sena");
    checar("o julgamento sai com AUC medido na validação",
      c.aucValidacao > 0 && c.aucValidacao < 1, (c.aucValidacao).toFixed(4));
    checar("o limiar é 0,05 dividido pelas hipóteses testadas, e não 0,05",
      Math.abs(c.limiar - 0.05 / c.familia) < 1e-15 && c.limiar < 0.05,
      `0,05/${c.familia} = ${c.limiar.toExponential(2)}`);
    checar("a família são as hipóteses distintas da busca inteira",
      c.familia === S.pesquisaAdaptativa["mega-sena"].hipotesesTestadas);
    checar("a nuvem de comparação é de hipóteses aleatórias, não de teoria",
      c.percentilNaNuvem >= 0 && c.percentilNaNuvem <= 1, (c.percentilNaNuvem).toFixed(3));
    checar("a degradação fora da amostra é reportada",
      Number.isFinite(c.degradacao));
    checar("com sorteios honestos, nada sobrevive", c.sobreviveu === false,
      `p ${c.p.toExponential(2)} contra limiar ${c.limiar.toExponential(2)}`);

    /* O p normal existe porque o empírico tem piso. Quando o empírico está
       longe do piso, os dois têm de concordar — se divergirem ali, a suposição
       de normalidade caiu e o número precisa ser revisto. */
    checar("o p empírico e o p normal concordam longe do piso",
      c.pEmpirico < 0.5 ? Math.abs(c.p - c.pEmpirico) < 0.25 : true,
      `empírico ${(c.pEmpirico).toFixed(4)} · normal ${(c.p).toFixed(4)}`);
    checar("o p normal desce abaixo do piso do empírico quando precisa",
      contexto.caudaNormal(5) * 2 < 2 / 201,
      `p(|z|>5) = ${(contexto.caudaNormal(5)*2).toExponential(1)}`);
    checar("a cauda normal bate com valores conhecidos",
      Math.abs(contexto.caudaNormal(1.959964) - 0.025) < 1e-4 &&
      Math.abs(contexto.caudaNormal(0) - 0.5) < 1e-9,
      `P(Z>1,96) = ${(contexto.caudaNormal(1.959964)).toFixed(5)}`);
    checar("julgar sem geração nenhuma é erro, e não um veredito inventado",
      (() => {
        const guarda = S.pesquisaAdaptativa["quina"];
        delete S.pesquisaAdaptativa["quina"];
        S.resultados = S.resultados.concat(
          historicoSemeado("quina", 80, 5, 200, 5).map(r => ({...r})));
        const r = contexto.concluirPesquisa("quina");
        S.pesquisaAdaptativa["quina"] = guarda;
        return !!r.erro;
      })());
  }

  /* ---- O TESTE QUE DÁ SENTIDO AOS OUTROS ---- */
  {
    S.pesquisaAdaptativa = {};
    S.modalidade = "mega-sena";
    S.resultados = historicoViciado(400, 3, 20260808);
    for (let g = 0; g < 15; g++) contexto.rodarGeracao("mega-sena");
    const viciado = contexto.concluirPesquisa("mega-sena");
    checar("com sorteio VICIADO, o motor ACHA — ele não é cego",
      viciado.sobreviveu === true,
      `AUC ${(viciado.aucValidacao).toFixed(4)} · p ${viciado.p.toExponential(1)} contra ${viciado.limiar.toExponential(1)}`);
    checar("e a hipótese vencedora nomeia o primitivo certo",
      /concurso anterior/.test(contexto.descreverHipotese(viciado.genes)),
      contexto.descreverHipotese(viciado.genes).slice(0, 60));
    checar("mesmo achando, o veredito NÃO manda apostar",
      /não<\/strong>\s+vira aposta/.test(contexto.vereditoPesquisa(viciado)) &&
      !/\baposte\b|vale a pena apostar|pode apostar/i.test(
        contexto.vereditoPesquisa(viciado)), "");
    checar("e diz que achado precisa se repetir para valer",
      /repetir com mais concursos/.test(contexto.vereditoPesquisa(viciado)));

    S.pesquisaAdaptativa = {};
    S.resultados = historicoViciado(400, 0, 20260808);
    for (let g = 0; g < 15; g++) contexto.rodarGeracao("mega-sena");
    const honesto = contexto.concluirPesquisa("mega-sena");
    checar("com o MESMO gerador sem vício, não acha",
      honesto.sobreviveu === false,
      `AUC ${(honesto.aucValidacao).toFixed(4)} · p ${honesto.p.toExponential(1)}`);
    checar("e o AUC do viciado é muito maior que o do honesto",
      Math.abs(viciado.aucValidacao - 0.5) > 3 * Math.abs(honesto.aucValidacao - 0.5),
      `${(viciado.aucValidacao).toFixed(4)} vs ${(honesto.aucValidacao).toFixed(4)}`);
  }

  /* ---- reprodutibilidade e memória por modalidade ---- */
  {
    const rodar = () => {
      S.pesquisaAdaptativa = {};
      S.resultados = historicoSemeado("mega-sena", 60, 6, 260, 20260810);
      for (let g = 0; g < 3; g++) contexto.rodarGeracao("mega-sena", { semente: 555 });
      return contexto.concluirPesquisa("mega-sena");
    };
    const um = rodar(), dois = rodar();
    checar("o mesmo histórico e a mesma semente dão o mesmo julgamento",
      um.aucValidacao === dois.aucValidacao && um.p === dois.p,
      `AUC ${(um.aucValidacao).toFixed(6)}`);

    S.pesquisaAdaptativa = {};
    S.resultados = historicoSemeado("mega-sena", 60, 6, 260, 1)
      .concat(historicoSemeado("lotofacil", 25, 15, 260, 2));
    contexto.rodarGeracao("mega-sena");
    contexto.rodarGeracao("lotofacil");
    /* A assinatura CURTA pode coincidir entre modalidades — as duas aqui têm
       260 concursos numerados de 1 a 260. Coincidir não é problema: ela é
       comparada dentro da própria modalidade. O que precisa estar separado é a
       memória, e é isso que se afere. */
    checar("cada modalidade guarda a própria memória",
      !!S.pesquisaAdaptativa["mega-sena"] && !!S.pesquisaAdaptativa["lotofacil"] &&
      S.pesquisaAdaptativa["mega-sena"] !== S.pesquisaAdaptativa["lotofacil"]);
    checar("e a matriz de uma não é a da outra",
      S.pesquisaAdaptativa["mega-sena"].assinaturaMatriz !==
      S.pesquisaAdaptativa["lotofacil"].assinaturaMatriz);
    checar("e a população de uma não vaza para a outra",
      chaveDePopulacao(S.pesquisaAdaptativa["mega-sena"]) !==
      chaveDePopulacao(S.pesquisaAdaptativa["lotofacil"]));
  }

  /* ---- autonomia ---- */
  {
    S.pesquisaAdaptativa = {};
    S.resultados = historicoSemeado("mega-sena", 60, 6, 200, 3);
    S.modalidade = "mega-sena";
    checar("modalidade com histórico e sem pesquisa entra na fila",
      contexto.pesquisasPendentes().includes("mega-sena"));
    const feitas = contexto.evoluirPendentes();
    checar("evoluir sozinho roda e julga", feitas.length === 1 &&
      feitas[0].modalidade === "mega-sena" && feitas[0].conclusao);
    checar("e sai da fila depois de rodar",
      !contexto.pesquisasPendentes().includes("mega-sena"));
    checar("concurso novo devolve a modalidade para a fila",
      (() => {
        S.resultados = S.resultados.concat([{concurso: 999, data:"2026-01-01",
          modalidade:"mega-sena", dezenas:[1,2,3,4,5,6]}]);
        return contexto.pesquisasPendentes().includes("mega-sena");
      })());
    checar("modalidade sem histórico suficiente nunca entra na fila",
      !contexto.pesquisasPendentes().includes("timemania"));
  }

  /* ---- a tela: é laboratório, e tem de se comportar como um ---- */
  {
    S.pesquisaAdaptativa = {};
    S.resultados = historicoSemeado("mega-sena", 60, 6, 200, 3);
    S.modalidade = "mega-sena";
    contexto.rodarGeracao("mega-sena");
    contexto.concluirPesquisa("mega-sena");
    const tela = contexto.T.pesquisa();

    checar("a tela declara que é laboratório, não gerador de jogos",
      /laboratório, não um gerador de jogos/i.test(tela));
    checar("e que não prevê resultado", /<strong>não<\/strong> prevê resultado/.test(tela));
    checar("e que não muda a chance de nenhuma dezena",
      /não<\/strong> muda a chance/.test(tela));

    /* As duas travas que definem o módulo. Um botão de copiar aqui
       transformaria um experimento em aposta com um toque. */
    checar("a tela NÃO tem botão de copiar nem de salvar",
      !/id="[^"]*(salvar|copiar)[^"]*"/i.test(tela) &&
      !/>\s*(Salvar|Copiar)[^<]*</i.test(tela), "");
    checar("a tela NÃO exibe dezena nenhuma",
      !/class="dz\b/.test(tela) && !/<span class="dezenas"/.test(tela) &&
      !/cartela\(/.test(tela), "");
    checar("nem promete vantagem",
      !/mais prováveis|aumenta|vantagem|melhor jogo/i.test(
        tela.replace(/leva vantagem/gi, "")), "");
    checar("a tela mostra quantas hipóteses foram testadas",
      /hipóteses testadas/.test(tela));
    checar("e o limiar corrigido, com a conta à vista",
      /0,05 ÷/.test(tela));
    checar("e avisa que subir a aptidão na busca é esperado",
      /a busca sempre encontra algo/.test(tela));

    S.pesquisaAdaptativa = {};
    S.resultados = historicoSemeado("mega-sena", 60, 6, 30, 3);
    checar("com histórico curto, a tela pede mais concursos em vez de rodar",
      /A pesquisa precisa de/.test(contexto.T.pesquisa()));
  }

  S.resultados = guardado; S.modalidade = guardadaMod;
  S.pesquisaAdaptativa = guardaPesq;
}

/* ---------- saída ---------- */
console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log("─".repeat(60));
process.exit(falhou === 0 ? 0 : 1);
