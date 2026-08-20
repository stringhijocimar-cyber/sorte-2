import fs from 'node:fs';
import path from 'node:path';

const arquivo = path.join(process.cwd(), 'ferramentas', 'testar-motor.mjs');
let src = fs.readFileSync(arquivo, 'utf8');

const trocas = [
  [
    '  const agora = new Date(2026, 7, 16);',
    `  const agora = new Date();\n  agora.setHours(12, 0, 0, 0);\n  const isoDiasAtras = (dias) => {\n    const d = new Date(agora);\n    d.setDate(d.getDate() - dias);\n    return d.toISOString().slice(0, 10);\n  };`
  ],
  [
    '  S.resultados = serie(["2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-15"]);',
    '  S.resultados = serie([5,4,3,2,1].map(isoDiasAtras));'
  ],
  [
    '  S.resultados = serie(["2026-08-01","2026-08-02","2026-08-03","2026-08-04","2026-08-05"]);',
    '  S.resultados = serie([15,14,13,12,11].map(isoDiasAtras));'
  ],
  [
    '  S.resultados = serie(["2026-07-05","2026-07-12","2026-07-19","2026-07-26","2026-08-05"]);',
    '  S.resultados = serie([39,32,25,18,11].map(isoDiasAtras));'
  ]
];

for (const [antes, depois] of trocas) {
  if (src.includes(depois)) continue;
  if (!src.includes(antes)) throw new Error(`Trecho esperado não encontrado: ${antes}`);
  src = src.replace(antes, depois);
}

fs.writeFileSync(arquivo, src);
console.log('Teste de histórico atrasado estabilizado com datas relativas.');
