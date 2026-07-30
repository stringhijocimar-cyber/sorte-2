/* LotoLab — service worker
   Estratégia: cache-first para a CASCA do app (HTML, manifest, ícones), que é
   o que permite abrir sem rede. Os jogos ficam no aparelho e o resultado do
   concurso pode ser digitado à mão, então o app segue inteiro offline.

   A consulta de resultado na Caixa é a única coisa que depende de rede e
   NUNCA passa por aqui — ver a lista de exceções no evento fetch. */
const CACHE = "lotolab-v2";
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

  /* Resultado de concurso jamais sai do cache. Se guardássemos, o app poderia
     mostrar um sorteio velho como se fosse o atual — e, offline, mostraria um
     resultado "oficial" que na verdade veio da memória. Fora do cache, o erro
     de rede aparece de forma honesta e o usuário digita à mão. */
  const url = new URL(ev.request.url);
  if (url.hostname !== self.location.hostname) return;

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
