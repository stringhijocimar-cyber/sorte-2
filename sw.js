/* LotoLab — service worker
   Estratégia: cache-first para a casca do app. O aplicativo funciona sem rede,
   porque nada aqui depende de rede: os jogos ficam no aparelho e os resultados
   dos concursos são digitados pelo usuário. */
const CACHE = "lotolab-v1";
const CASCA = ["./", "./index.html", "./manifest.webmanifest", "./icone.svg"];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", ev => {
  if (ev.request.method !== "GET") return;
  ev.respondWith(
    caches.match(ev.request).then(resposta => resposta || fetch(ev.request)
      .then(rede => {
        const copia = rede.clone();
        caches.open(CACHE).then(c => c.put(ev.request, copia)).catch(() => {});
        return rede;
      })
      .catch(() => caches.match("./index.html")))
  );
});
