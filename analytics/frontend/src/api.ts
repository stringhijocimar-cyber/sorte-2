/**
 * Cliente da API.
 *
 * Uma decisão que percorre o arquivo: quando a API devolve erro, a mensagem
 * exibida é a que ela mandou (`detail`), nunca um "algo deu errado" genérico.
 * O backend explica por que a restrição é impossível ou o orçamento não cobre
 * a aposta; engolir isso e mostrar texto genérico jogaria fora a parte útil.
 */

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ErroDaApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...(opcoes.headers ?? {}) },
  });
  if (!resposta.ok) {
    let detalhe = `HTTP ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (typeof corpo?.detail === "string") detalhe = corpo.detail;
      else if (Array.isArray(corpo?.detail)) detalhe = corpo.detail.map((d: any) => d.msg).join("; ");
    } catch {
      /* corpo não era JSON; fica o status */
    }
    throw new ErroDaApi(resposta.status, detalhe);
  }
  return resposta.json() as Promise<T>;
}

export interface Modalidade {
  codigo: string;
  nome: string;
  universo: [number, number];
  dezenas_sorteadas: number;
  aposta: [number, number];
  preco_hoje: number;
  combinacoes: number;
}

export interface Faixa {
  acertos: number;
  descricao: string;
  probabilidade: number;
  uma_em: number | null;
}

export interface Probabilidades {
  modalidade: string;
  dezenas_por_jogo: number;
  custo: number;
  faixas: Faixa[];
  aviso: string;
}

export interface LoteGerado {
  modalidade: string;
  jogos: number[][];
  solicitados: number;
  completo: boolean;
  custo_total: number;
  probabilidade_por_jogo: number;
  distintos: number;
  sobreposicao_media: number;
  cobertura_pares: number;
  tentativas: number;
  semente: number;
  avisos: string[];
  aviso_filtros: string;
}

export interface Teste {
  nome: string;
  estimativa: number;
  ic: [number, number];
  p_valor: number;
  tamanho_efeito: number;
  nome_efeito: string;
  n: number;
  leitura: string;
}

export interface Backtest {
  particao: string;
  custo_total: number;
  premio_bruto: number;
  resultado_liquido: number;
  roi: number;
  perda_maxima: number;
  maior_sequencia_sem_premio: number;
  percentil_vs_aleatorio: number;
  simulacoes: number;
  semente: number;
  teste: Teste;
  aviso: string;
}

export const api = {
  modalidades: () => pedir<Modalidade[]>("/modalidades"),
  probabilidades: (codigo: string, dezenas?: number) =>
    pedir<Probabilidades>(`/modalidades/${codigo}/probabilidades${dezenas ? `?dezenas=${dezenas}` : ""}`),
  registrar: (email: string, senha: string) =>
    pedir<{ id: string }>("/auth/registro", {
      method: "POST",
      body: JSON.stringify({ email, senha, maior_de_idade: true, aceita_privacidade: true }),
    }),
  login: (email: string, senha: string) =>
    pedir<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    }),
  gerar: (token: string, corpo: Record<string, unknown>) =>
    pedir<LoteGerado>("/jogos/gerar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
    }),
  backtest: (token: string, corpo: Record<string, unknown>) =>
    pedir<Backtest>("/backtests", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
    }),
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const inteiro = (v: number) => v.toLocaleString("pt-BR");

export const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
