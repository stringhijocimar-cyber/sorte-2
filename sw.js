/* LotoLab — service worker

   ATENÇÃO ao histórico deste arquivo, porque o defeito custou caro: a versão
   anterior era cache-first para TUDO, com um nome de cache fixo em "lotolab-v1".
   O resultado é que o app, uma vez instalado, servia para sempre o mesmo
   index.html — nenhuma atualização chegava a quem já tinha aberto. E como a
   regra valia para toda requisição GET, ela também congelava os dados/*.json,
   então os resultados dos concursos parariam no tempo junto com o app.

   A estratégia agora é por tipo de recurso, porque uma só não serve para os
   três casos:

   * app e dados  -> REDE PRIMEIRO, cache como reserva. Atualização chega
     sempre que houver rede; sem rede, o app abre com a última versão boa.
   * ícones e manifesto -> cache primeiro. São imutáveis na prática e não vale
     gastar rede com eles.

   O nome do cache carrega a versão. Trocar VERSAO invalida tudo o que ficou
   para trás — é a única forma de expulsar um cache envenenado do aparelho de
   quem já instalou.                                                        */

/* 5: trevo novo nos ícones. Sem subir esta versão, quem já tem o app instalado
   continuaria vendo o ícone antigo para sempre — os PNGs são servidos pelo
   cache primeiro, e cache primeiro nunca vai conferir se mudou.

   8: o manifesto passou a declarar o fundo da V4 (#061521). O manifesto casa
   com IMUTAVEIS, ou seja, é servido do cache sem nunca perguntar se mudou:
   sem subir a versão aqui, quem já instalou continuaria abrindo a tela de
   partida no azul antigo para sempre, enquanto o app já abre no novo. */
/* 9: a conferência passou a guardar o número do concurso como número, e a
   abertura junta as duplicatas que a versão anterior deixou gravadas. Quem
   usa pelo navegador precisa receber o index.html novo, não o do cache. */
const VERSAO = "11";
const CACHE = `lotolab-v${VERSAO}`;

//: A casca mínima para o app abrir offline.
const CASCA = ["./", "./index.html", "./manifest.webmanifest", "./icone.svg", "./ui/sorte2-ui-final.css", "./ui/brain-network.svg", "./ui/lotolab-ui-v4-3.css"];

//: Recursos que praticamente não mudam. Ícone novo sai com versão nova.
const IMUTAVEIS = /\.(png|svg|webmanifest)$/i;

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CASCA))
      /* skipWaiting sem esperar a aba fechar: sem isso, a versão nova só
         assumiria depois que a pessoa fechasse TODAS as abas do app, o que
         quase nunca acontece num celular. */
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

/* Rede primeiro, cache como rede de segurança. Grava a resposta boa para o
   próximo carregamento offline. */
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
    /* Navegação sem rede e sem cache do endereço exato: devolve a casca, para
       o app abrir em vez de mostrar erro do navegador. */
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

self.addEventListener("fetch", ev => {
  if(ev.request.method !== "GET") return;
  const url = new URL(ev.request.url);

  /* Requisição para outro domínio — os dados/*.json vindos do GitHub, por
     exemplo — passa direto, sem o worker no meio.

     Motivo: o worker interceptando uma busca entre domínios acrescenta uma
     camada que só pode atrapalhar. Se ele erra o CORS, ou guarda uma resposta
     opaca, ou fica com um JSON velho, o app quebra de um jeito que ninguém
     consegue depurar de fora — e este arquivo já congelou o app inteiro uma
     vez por excesso de zelo com cache. Deixar passar é mais previsível, e o
     custo é nenhum: o app já guarda os resultados no aparelho por conta
     própria, então não é o worker que dá o funcionamento offline deles. */
  if(url.origin !== self.location.origin) return;

  /* Ícones e manifesto podem vir do cache; o app tenta a rede antes, senão
     volta o congelamento que este arquivo causou. */
  ev.respondWith(IMUTAVEIS.test(url.pathname)
    ? cachePrimeiro(ev.request)
    : redePrimeiro(ev.request));
});

/* Permite a página forçar a troca imediata, sem esperar o ciclo do navegador. */
self.addEventListener("message", ev => {
  if(ev.data === "atualizar-agora") self.skipWaiting();
});
