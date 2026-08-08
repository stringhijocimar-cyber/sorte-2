/**
 * Gera a referência dourada de `caracteristicas()`.
 *
 *     node ferramentas/gerar-douradas.mjs [index.html] > ferramentas/douradas.json
 *
 * Por que existe: `caracteristicas()` alimenta o escore de popularidade, que
 * alimenta três dos cinco métodos e a leitura de tipicidade do jogo. É também
 * a função mais chamada do app — dezenas de milhares de vezes por rodada da
 * bancada — e por isso a mais tentadora de otimizar. Uma otimização que muda
 * o 13º dígito não quebra teste nenhum e muda, em silêncio, qual jogo o app
 * mostra primeiro.
 *
 * O arquivo gravado é a saída da versão que estava no ar antes da otimização
 * de desempenho de agosto/2026. Regravá-lo é uma decisão consciente de mudar
 * o comportamento — não algo que se faz para "fazer o teste passar".
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO = process.argv[2] || join(RAIZ, "index.html");
const html = readFileSync(ARQUIVO, "utf8");
const fonte = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

const el = () => ({
  style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  children: [], value: "", textContent: "", innerHTML: "", checked: false, disabled: false,
  appendChild(){}, setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
  addEventListener(){}, removeEventListener(){}, querySelector(){ return el(); },
  querySelectorAll(){ return []; }, focus(){}, blur(){}, click(){}, remove(){},
  closest(){ return null; }, scrollIntoView(){}, insertAdjacentHTML(){},
});
const memoria = new Map();
const contexto = {
  console,
  localStorage: { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k),
    clear: () => memoria.clear() },
  document: { documentElement: { dataset: {} }, body: el(), querySelector: () => el(),
    querySelectorAll: () => [], getElementById: () => el(), createElement: () => el(),
    addEventListener(){}, removeEventListener(){} },
  window: { addEventListener(){}, matchMedia: () => ({ matches: false, addEventListener(){} }) },
  navigator: { userAgent: "node", onLine: true },
  location: { href: "file:///index.html", origin: "file://", pathname: "/index.html" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (f) => setTimeout(f, 0),
  fetch: async () => { throw new Error("sem rede"); },
  Math, Date, JSON, Number, String, Array, Object, Map, Set, Error, isNaN,
  parseInt, parseFloat, Promise, Intl,
};
contexto.globalThis = contexto; contexto.self = contexto;
vm.createContext(contexto);
vm.runInContext(fonte + "\n;globalThis.__m = {caracteristicas, MODALIDADES};\n",
  contexto, { filename: "index.html:script" });
const { caracteristicas, MODALIDADES } = contexto.__m;

/* xorshift32: inteiros de 32 bits, sem estourar a precisão dos doubles. */
let x = 424242;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };

const saida = {};
for (const [id, cfg] of Object.entries(MODALIDADES)) {
  const casos = [];
  for (let t = 0; t < 20; t++) {
    const pool = Array.from({ length: cfg.N }, (_, k) => k + cfg.base);
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const q = pool[k]; pool[k] = pool[j]; pool[j] = q;
    }
    /* Tamanhos variados: o mínimo da modalidade e alguns acima dele. */
    const teto = Math.min(cfg.max, cfg.min + 3);
    const tam = cfg.min + Math.floor(rnd() * (teto - cfg.min + 1));
    casos.push({ jogo: pool.slice(0, tam).sort((a, b) => a - b) });
  }
  /* Casos de borda em toda modalidade: as primeiras dezenas seguidas (máximo
     de consecutivos e de "mesma linha") e as últimas (nenhuma data). */
  const seguidas = Array.from({ length: cfg.min }, (_, i) => i + cfg.base);
  const altas = Array.from({ length: cfg.min }, (_, i) => cfg.N + cfg.base - 1 - i)
    .sort((a, b) => a - b);
  casos.push({ jogo: seguidas }, { jogo: altas });
  saida[id] = casos.map((c) => ({ jogo: c.jogo, c: caracteristicas(c.jogo, id) }));
}
process.stdout.write(JSON.stringify(saida, null, 1) + "\n");
