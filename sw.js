// Guarda os arquivos no aparelho para o app abrir sem internet.
// Aumente a versÃ£o a cada publicaÃ§Ã£o para os celulares baixarem a nova.
// Desde a 2.32.0 o celular e o PC tÃªm o MESMO nÃºmero de versÃ£o (Ã© um app sÃ³): suba os dois juntos.
const VERSAO = '2.39.0';
const PUBLICADA = '2026-10-24'; // mude junto com a VERSAO: aparece em Ajustes
const CACHE = 'journal-' + VERSAO;
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'juntar.js',
  'habitos-lista.js',
  'novo.js',
  'datas.js',
  'astro.js',
  'icons/nav/inicio-ativo.svg', 'icons/nav/inicio-inativo.svg', 'icons/nav/tarefas-ativo.svg', 'icons/nav/tarefas-inativo.svg',
  'icons/nav/habitos-ativo.svg', 'icons/nav/habitos-inativo.svg', 'icons/nav/journal-ativo.svg', 'icons/nav/journal-inativo.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

// Ajustes pergunta qual versÃ£o estÃ¡ rodando neste celular.
self.addEventListener('message', (e) => {
  if (e.data === 'versao' && e.ports[0]) e.ports[0].postMessage({ versao: VERSAO, publicada: PUBLICADA });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return; // GitHub, serviÃ§o do Journal: sempre pela rede
  // o plano muda toda semana: busca na rede primeiro e usa a cÃ³pia guardada sÃ³ sem internet
  if (e.request.url.includes('plano.enc.json')) {
    e.respondWith(
      fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put('plano.enc.json', c)); return r; })
        .catch(() => caches.match('plano.enc.json')),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(e.request))
      // sem a pÃ¡gina no cache e sem internet: entrega o app guardado em vez de uma tela vazia
      .catch(() => (e.request.mode === 'navigate' ? caches.match('./') : Response.error())),
  );
});

// ---------- avisos (Web Push), mandados pelo serviÃ§o do Journal ----------
// O aviso chega com { titulo, corpo, url, tag, acoes: [{ acao, titulo, url }] }.
self.addEventListener('push', (e) => {
  let a = {};
  try { a = e.data ? e.data.json() : {}; } catch (err) { a = { titulo: e.data ? e.data.text() : 'Journal' }; }
  e.waitUntil(self.registration.showNotification(a.titulo || "Johnny's Journal", {
    body: a.corpo || '', tag: a.tag || undefined, renotify: !!a.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: { url: a.url || '#', acoes: a.acoes || [] },
    actions: (a.acoes || []).slice(0, 2).map((x) => ({ action: x.acao, title: x.titulo })),
  }));
});

self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  const acao = (d.acoes || []).find((x) => x.acao === e.action);
  if (acao) {
    // "Concluir" e "Adiar 1h" resolvem direto no serviÃ§o, sem abrir o app.
    e.waitUntil(fetch(acao.url, { method: 'POST' }).catch(() => {}));
    return;
  }
  const destino = new URL('./', self.registration.scope).href + (d.url && d.url !== '#' ? d.url : '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    const aberto = lista.find((c) => c.url.startsWith(self.registration.scope));
    if (aberto) { aberto.postMessage({ abrir: d.url }); return aberto.focus(); }
    return self.clients.openWindow(destino);
  }));
});
