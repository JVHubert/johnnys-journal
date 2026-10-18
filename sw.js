// Guarda os arquivos no aparelho para o app abrir sem internet.
// Aumente a versão a cada publicação para os celulares baixarem a nova.
const VERSAO = 'journal-v10';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // o plano muda toda semana: busca na rede primeiro e usa a cópia guardada só sem internet
  if (e.request.url.includes('plano.enc.json')) {
    e.respondWith(
      fetch(e.request).then((r) => { const c = r.clone(); caches.open(VERSAO).then((k) => k.put('plano.enc.json', c)); return r; })
        .catch(() => caches.match('plano.enc.json')),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(e.request))
      // sem a página no cache e sem internet: entrega o app guardado em vez de uma tela vazia
      .catch(() => (e.request.mode === 'navigate' ? caches.match('./') : Response.error())),
  );
});
