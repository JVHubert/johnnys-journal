// Widget do app nativo (casca 5): a água tocada no widget com o app fechado entra nos dados ao abrir; o widget recebe
// a água e as tarefas de hoje; o microfone (#ditar) abre o ditado de tarefas. Ponte JJNativo falsa; nada sai do PC.
// node testes/widget.test.cjs [pasta para prints]   (PLAYWRIGHT_CORE aponta para o playwright-core)
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vigia = setTimeout(() => { console.log('FALHA tempo esgotado'); process.exit(3); }, 120000);
const hojeK = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const nav = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', permissions: ['microphone'] });
  await ctx.route(/api\.github\.com|workers\.dev|groq\.com|\.invalid/, (r) => r.abort());
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const k = hojeK();
  await p.addInitScript((k) => {
    window.__w = { pend: JSON.stringify({ dia: k, agua: 2 }), enviados: [] };
    window.JJNativo = {
      casca: () => 5, temDigital: () => true, avisosLigados: () => true, atualizarAvisos() {}, testarAviso() {},
      digital: (id) => setTimeout(() => window.__jjNativo(id, true, ''), 10), telaAcesa() {}, compartilhar() {}, abrirFora() {},
      widgetAgua: () => window.__w.pend,
      widgetAguaAplicada: () => { window.__w.pend = ''; },
      atualizarWidget: (dia, agua, tarefas) => window.__w.enviados.push({ dia, agua, tarefas }),
    };
    if (!sessionStorage.getItem('ja')) { sessionStorage.setItem('ja', '1'); localStorage.setItem('jj-mudanca', JSON.stringify({ quando: 1, zero: true })); }
  }, k);
  await p.goto(`http://localhost:${srv.address().port}/index.html`);
  await p.waitForFunction(() => window.__w.enviados.length > 0, null, { timeout: 10000 });
  await espera(800);
  assert.strictEqual(await p.evaluate((k) => lerDia(k).agua, k), 2, 'as 2 garrafas do widget entraram nos dados');
  assert.strictEqual(await p.evaluate(() => window.__w.pend), '', 'e o pendente foi limpo');
  const ultimo = await p.evaluate(() => window.__w.enviados.at(-1));
  assert.deepStrictEqual([ultimo.dia, ultimo.agua], [k, 2], 'o widget recebe a água de hoje');
  assert.ok(Number.isInteger(ultimo.tarefas), 'e o número de tarefas de hoje');

  // marcar a 3ª garrafa dentro do app chega no widget
  await p.evaluate((k) => { atual = k; irPara('habitos'); renderHoje(); }, k);
  await p.click('.garrafa:nth-child(3)');
  await p.waitForFunction(() => window.__w.enviados.at(-1).agua === 3, null, { timeout: 5000 });

  // microfone do widget com o app aberto: o Android chama JJ_SEGUIR('#ditar')
  await p.evaluate(() => window.JJ_SEGUIR('#ditar'));
  await p.waitForSelector('.ditando', { timeout: 5000 });
  assert.ok(await p.isVisible('#dit-parar'), 'abre o ditado de tarefas já gravando');
  assert.deepStrictEqual(erros.filter((m) => !/Failed to fetch|NetworkError|net::/.test(m)), []);
  console.log('OK widget: água pendente, água e tarefas para o widget, #ditar');
  await nav.close(); srv.close(); clearTimeout(vigia);
})().catch((err) => { console.log('FALHA', err.message); process.exit(1); });
