/* Service worker: guarda o app no aparelho para abrir sem internet.
 *
 * Responde do cache na hora e, em paralelo, busca a versao nova na rede
 * para a proxima abertura. Ao publicar mudancas, suba VERSAO.
 */
const VERSAO = "bomdia-v1";
const ARQUIVOS = [
  "./",
  "index.html",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      // ignora o #importar=... e qualquer ?query: a pagina e sempre a mesma
      const guardada = await cache.match(req, { ignoreSearch: true });
      const daRede = fetch(req)
        .then((resp) => {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => guardada);
      return guardada || daRede;
    }),
  );
});
