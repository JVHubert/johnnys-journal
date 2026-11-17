// Fotos da galeria na entrevista (2.98.0): faixa durante a gravação, foto aberta marca o segundo do áudio, nota/lixo,
// revisão no fim (copia as da nota, apaga o lixo com uma confirmação) e miniaturas presas no tempo do player.
// Galeria e ponte JJNativo falsas; nada sai do PC.  node testes/fotos-entrevista.test.cjs [pasta para prints]
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const PRINTS = process.argv[2] || null;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vigia = setTimeout(() => { console.log('FALHA tempo esgotado'); process.exit(3); }, 120000);
const IMG = fs.readFileSync(path.join(RAIZ, 'icons', fs.readdirSync(path.join(RAIZ, 'icons')).find((f) => f.endsWith('.png'))));

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u.includes('/__galeria/')) { res.writeHead(200, { 'content-type': 'image/png' }); res.end(IMG); return; }
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const nav = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(() => {
    window.__ch = [];
    window.JJNativo = {
      casca: () => 6, temDigital: () => true, avisosLigados: () => true, atualizarAvisos() {}, telaAcesa() {},
      fotosDoPeriodo: (id, de, ate) => {
        window.__ch.push(['fotosDoPeriodo', Number(de), Number(ate)]);
        const lista = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, quando: Number(de) + (8 + i) * 3600000, w: 3000, h: 4000, pasta: 'Camera' }));
        setTimeout(() => window.__jjNativo(id, true, JSON.stringify(lista)), 30);
      },
      apagarFotos: (id, json) => { window.__ch.push(['apagarFotos', JSON.parse(json)]); setTimeout(() => window.__jjNativo(id, true, ''), 30); },
    };
  });
  const print = async (nome) => { if (PRINTS) { fs.mkdirSync(PRINTS, { recursive: true }); await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); } };
  await p.goto(`http://localhost:${srv.address().port}/index.html?demo`);
  await p.waitForFunction(() => window.JJFotos && window.fotosNaGravacao);

  // 1. Começa a faixa da entrevista do dia (o dia de onde foi aberta)
  await p.evaluate(() => { window.__seg = 75; window.fotosNaGravacao.comecar({ modo: 'dia', data: '2026-11-12' }, () => window.__seg); });
  await p.waitForSelector('.ff.entrou');
  await espera(600);
  const [, de, ate] = (await p.evaluate(() => window.__ch.find((c) => c[0] === 'fotosDoPeriodo')));
  assert.strictEqual(new Date(de).getDate(), 12, 'pede as fotos do dia 12 (o dia da entrevista)');
  assert.ok(ate - de > 86000000 && ate - de < 86400000, 'do início ao fim do dia');
  assert.strictEqual(await p.$$eval('.ff-mini', (xs) => xs.length), 12);
  assert.match(await p.textContent('.ff-topo b'), /12 fotos de 12\/11/);
  await print('1-faixa');

  // 2. Abre a 3ª foto: marca 01:15 do áudio; põe na nota; manda a seguinte para o lixo
  await p.click('.ff-mini:nth-child(3)', { force: true });
  await p.waitForSelector('.fv');
  await espera(400);
  assert.match(await p.textContent('.fv-toast'), /Foto marcada em 01:15 do áudio/);
  assert.match(await p.textContent('.fv-quando small'), /3 de 12/);
  await print('2-foto-aberta');
  await p.click('.fv-nota');
  await p.evaluate(() => { window.__seg = 130; });
  await p.click('.fv-lixo');   // marca a 3ª? não: a 3ª está na nota; o lixo vale para a foto aberta e passa para a 4ª
  await espera(300);
  assert.match(await p.textContent('.fv-quando small'), /4 de 12/, 'depois do lixo, passa para a seguinte');
  await p.click('.fv-nota');   // a 4ª vai para a nota (e marcou 02:10)
  await p.click('.fv-voltar');
  await espera(400);
  assert.strictEqual(await p.isVisible('.fv'), false);
  assert.strictEqual((await p.textContent('.ff-nota i')).trim(), '1', 'a 3ª foi para o lixo, a 4ª ficou na nota');
  await print('3-faixa-marcada');

  // 3. Terminar: revisão; salvar e apagar
  const fim = p.evaluate(() => window.fotosNaGravacao.terminar(300));
  await p.waitForSelector('.fr');
  await espera(500);
  await print('4-revisao');
  assert.strictEqual((await p.textContent('.fr-n.nota b')).trim(), '1');
  assert.strictEqual((await p.textContent('.fr-n.lixo b')).trim(), '1');
  assert.strictEqual((await p.textContent('.fr-n.sem b')).trim(), '10');
  assert.match(await p.textContent('.fr-salvar'), /Salvar e apagar 1 foto/);
  await p.click('.fr-salvar');
  const marcos = await fim;
  assert.deepStrictEqual((await p.evaluate(() => window.__ch.find((c) => c[0] === 'apagarFotos')))[1], [102], 'apaga a 3ª da galeria');
  assert.strictEqual(marcos.length, 1, 'um marco (a foto da nota)');
  assert.strictEqual(marcos[0].seg, 130);
  assert.match(marcos[0].foto, /^fotos\/galeria-2026-11-12-/);
  const dia12 = await p.evaluate(() => lerDia('2026-11-12'));
  assert.ok((dia12.ilustracao && dia12.ilustracao.foto === marcos[0].foto) || (dia12.imagens || []).some((x) => x.foto === marcos[0].foto), 'a foto virou imagem do dia');

  // 4. Player da nota: miniatura presa no segundo, destaque com a foto
  await p.evaluate((m) => {
    const box = document.createElement('div'); box.id = 'teste-player'; document.getElementById('app').prepend(box);
    window.__pl = window.JJAudio.montarPlayer(box, [{ chave: 'aud/teste', partes: 1, duracao: 300, segmentos: [], marcos: m }], { ui: {}, foto: (c, img) => { img.src = './__galeria/mini/1'; } });
    box.scrollIntoView();
  }, [{ foto: marcos[0].foto, seg: 130 }, { foto: marcos[0].foto, seg: 20 }]);
  await espera(500);
  assert.strictEqual(await p.$$eval('#teste-player .aud-marco', (xs) => xs.length), 2);
  const left = await p.$eval('#teste-player .aud-marco[data-i="1"]', (b) => b.style.left);
  assert.ok(Math.abs(parseFloat(left) - 130 / 300 * 100) < 0.01, 'presa em 130 s de 300');
  assert.ok(await p.isVisible('#teste-player .aud-destaque'));
  await print('5-player');
  assert.deepStrictEqual(erros, []);
  console.log('OK fotos na entrevista: faixa, foto aberta, revisão, apagar, marcos no player');
  await nav.close(); srv.close(); clearTimeout(vigia);
})().catch((err) => { console.log('FALHA', err.message); process.exit(1); });
