/**
 * Peças compartilhadas.
 *
 * `Aviso` existe porque o critério 14 do escopo pede que as limitações
 * estatísticas apareçam JUNTO do dado. Aviso em rodapé é aviso que ninguém lê,
 * então todo bloco que mostra número traz o seu ao lado — e o componente é
 * pequeno de propósito, para não haver desculpa para omiti-lo.
 */
import type { ReactNode } from "react";

export function Aviso({ tom = "neutro", children }: { tom?: "neutro" | "atencao"; children: ReactNode }) {
  const borda = tom === "atencao" ? "border-alerta" : "border-acaso";
  return (
    <p role="note" className={`border-l-4 ${borda} bg-slate-50 px-3 py-2 text-sm text-slate-600`}>
      {children}
    </p>
  );
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 font-mono text-xl tabular-nums text-tinta">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

export function Erro({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="rounded border border-alerta bg-rose-50 px-3 py-2 text-sm text-alerta">
      {mensagem}
    </p>
  );
}

export function Dezena({ n }: { n: number }) {
  return (
    <span className="inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-slate-50 font-mono text-sm font-semibold tabular-nums">
      {String(n).padStart(2, "0")}
    </span>
  );
}
