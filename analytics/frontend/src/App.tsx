import { useState } from "react";
import { api } from "./api";
import { Aviso, Erro } from "./componentes";
import { TelaGerador } from "./TelaGerador";
import { TelaBacktest } from "./TelaBacktest";

type Aba = "gerador" | "backtest";

export function App() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("gerador");

  async function entrar(novo: boolean) {
    setErro("");
    try {
      if (novo) await api.registrar(email, senha);
      setToken((await api.login(email, senha)).token);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-xl font-semibold text-tinta">Loteria Analytics Brasil</h1>
        <Aviso tom="atencao">
          Exclusivo para <strong>maiores de 18 anos</strong>. O sistema não prevê resultados,
          não garante prêmios e não encontra combinações vencedoras.
        </Aviso>
        <input className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e-mail"
          value={email} onChange={(e) => setEmail(e.target.value)} data-teste="email" />
        <input className="w-full rounded-md border border-slate-300 px-3 py-2" type="password"
          placeholder="senha (mín. 10 caracteres)" value={senha}
          onChange={(e) => setSenha(e.target.value)} data-teste="senha" />
        <div className="flex gap-2">
          <button className="flex-1 rounded-md bg-tinta py-2 font-semibold text-white"
            onClick={() => entrar(false)} data-teste="entrar">Entrar</button>
          <button className="flex-1 rounded-md border border-tinta py-2 font-semibold text-tinta"
            onClick={() => entrar(true)} data-teste="criar">Criar conta</button>
        </div>
        {erro && <Erro mensagem={erro} />}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-mono font-semibold text-tinta">
            loteria<span className="text-acaso">analytics</span>
          </span>
          <nav className="flex gap-1">
            {(["gerador", "backtest"] as Aba[]).map((a) => (
              <button key={a} onClick={() => setAba(a)} data-teste={`aba-${a}`}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  aba === a ? "bg-tinta text-white" : "text-slate-600 hover:bg-slate-100"
                }`}>
                {a}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {aba === "gerador" ? <TelaGerador token={token} /> : <TelaBacktest token={token} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-500">
        Loteria é gasto de entretenimento, não investimento. Maiores de 18 anos.
        Se o jogo deixou de ser diversão: CVV 188 · jogadoresanonimos.com.br
      </footer>
    </div>
  );
}
