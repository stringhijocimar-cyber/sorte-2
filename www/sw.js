/* LotoLab — service worker

   Estratégia por tipo de recurso:
   * app e dados -> REDE PRIMEIRO, cache como reserva;
   * ícones e manifesto -> cache primeiro;
   * CSS principal -> V4 base + camada visual V4.1, compostas pelo worker.

   O nome do cache carrega a versão. Trocar VERSAO invalida a casca anterior. */

/* 9: adiciona a camada visual neutra V4.1 e força renovação do CSS. */
const VERSAO = "9";
const CACHE = `lotolab-v${VERSAO}`;
const POLISH_CSS = "./ui/lotolab-ui-polish-v4-1.css";

// Casca mínima para o app abrir offline.
const CASCA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icone.svg",
  "./ui/sorte2-ui-final.css",
  POLISH_CSS,
  "./ui/brain-network.svg"
];

// Recursos que praticamente não mudam. Ícone novo sai com versão nova.
const IMUTAVEIS = /\.(png|svg|webmanifest)$/i;

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CASCA))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro, cache como rede de segurança.
async function redePrimeiro(req){
  try{
    const rede = await fetch(req);
    if(rede && rede.ok){
      const copia = rede.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return rede;
  }catch(e){
    const guardado = await caches.match(req);
    if(guardado) return guardado;
    if(req.mode === "navigate"){
      const casca = await caches.match("./index.html");
      if(casca) return casca;
    }
    throw e;
  }
}

async function cachePrimeiro(req){
  const guardado = await caches.match(req);
  if(guardado) return guardado;
  const rede = await fetch(req);
  if(rede && rede.ok){
    const copia = rede.clone();
    caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
  }
  return rede;
}

function respostaCss(texto, headersOriginais){
  const headers = new Headers(headersOriginais || {});
  headers.set("content-type", "text/css; charset=utf-8");
  headers.delete("content-length");
  return new Response(texto, { status: 200, headers });
}

/* Mantém a V4 como base e aplica o polish V4.1 depois dela. O HTML não precisa
   ser reescrito e o motor do aplicativo permanece intocado. */
async function cssPrincipalComPolish(req){
  let base = null;
  let polish = null;

  try{
    [base, polish] = await Promise.all([
      fetch(req),
      fetch(POLISH_CSS, { cache: "no-store" })
    ]);
  }catch(e){
    // O fallback offline é tratado logo abaixo.
  }

  if(!base || !base.ok) base = await caches.match(req);
  if(!polish || !polish.ok) polish = await caches.match(POLISH_CSS);

  if(base && polish){
    const [baseTexto, polishTexto] = await Promise.all([base.text(), polish.text()]);
    const composto = baseTexto.includes("LotoLab — LAB UI POLISH V4.1")
      ? baseTexto
      : `${baseTexto}\n\n${polishTexto}`;
    const resposta = respostaCss(composto, base.headers);
    caches.open(CACHE).then(c => c.put(req, resposta.clone())).catch(() => {});
    return resposta;
  }

  return redePrimeiro(req);
}

self.addEventListener("fetch", ev => {
  if(ev.request.method !== "GET") return;
  const url = new URL(ev.request.url);

  // Recursos de outro domínio passam direto.
  if(url.origin !== self.location.origin) return;

  // A apresentação V4.1 é composta somente para o CSS principal.
  if(url.pathname.endsWith("/ui/sorte2-ui-final.css")){
    ev.respondWith(cssPrincipalComPolish(ev.request));
    return;
  }

  ev.respondWith(IMUTAVEIS.test(url.pathname)
    ? cachePrimeiro(ev.request)
    : redePrimeiro(ev.request));
});

self.addEventListener("message", ev => {
  if(ev.data === "atualizar-agora") self.skipWaiting();
});
