// Apagar entrevista à vista (2.94.0): lixeira no topo e botão no fim da leitura, e o link no cartão da entrevista em Hábitos.
// node testes/apagar-entrevista.test.cjs [pasta para prints]   (PLAYWRIGHT_CORE aponta para o playwright-core)
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

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
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
  await p.goto(`http://localhost:${srv.address().port}/index.html?demo`);
  await p.waitForFunction(() => typeof window.apagarEntrevistaDoDia === 'function');
  const print = async (nome) => { if (PRINTS) { fs.mkdirSync(PRINTS, { recursive: true }); await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); } };
  // um dia com entrevista no modo de demonstração
  const k = '2026-10-29';
  await p.evaluate((k) => { const r = dia(k); r.entrevista = { modo: 'dia', data: k, respostas: ['Entrevista de teste para apagar.'], t: Date.now() }; r.tweet = 'teste de apagar do dia 29'; salvar(); renderTudo(); }, k);
  assert.ok(k, 'o modo de demonstração tem entrevista');

  // 1. Hábitos: o cartão da entrevista feita tem "Apagar a entrevista deste dia"
  await p.evaluate((k) => { atual = k; irPara('habitos'); renderHoje(); }, k);
  await espera(400);
  assert.ok(await p.isVisible('#ent-hoje-apagar'), 'link de apagar no cartão da entrevista');
  await p.evaluate(() => document.getElementById('ent-hoje-apagar').scrollIntoView({ block: 'center' }));
  await print('1-habitos');

  // 2. Leitura: lixeira no topo e botão no fim
  await p.evaluate(() => irPara('journal'));
  await espera(600);
  const aberto = await p.evaluate((k) => { const c = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('teste de apagar do dia 29')); if (c) c.click(); return !!c; }, k);
  if (!aberto) await p.evaluate((k) => window.JJ_ABRIR_DIA && window.JJ_ABRIR_DIA(k), k);
  await p.waitForSelector('.nota-aberta', { timeout: 8000 }).catch(() => {});
  if (await p.isVisible('.nota-aberta')) {
    assert.ok(await p.isVisible('.na-lixo'), 'lixeira no topo');
    assert.strictEqual(await p.$$eval('.na-apagar', (xs) => xs.length), 1, 'botão no fim do texto');
    await print('2-leitura-topo');
    await p.evaluate(() => document.querySelector('.na-apagar').scrollIntoView({ block: 'center' }));
    await print('3-leitura-fim');
    await p.click('.na-apagar');
    await espera(600);
    assert.strictEqual(await p.evaluate((k) => dados.dias[k].tweet, k), undefined, 'o tweet sai junto');
  } else {
    assert.fail('o cartão do dia não abriu');
    console.log('  (cartão da entrevista não achado na aba Journal; apagando pelo cartão de Hábitos)');
    await p.evaluate((k) => { atual = k; irPara('habitos'); renderHoje(); }, k);
    await espera(300);
    await p.click('#ent-hoje-apagar');
    await espera(400);
  }
  const apagada = await p.evaluate((k) => { const e = dados.dias[k].entrevista; return !!(e && e.apagada && !e.respostas.length); }, k);
  assert.ok(apagada, 'a entrevista ficou apagada');
  assert.ok(await p.isVisible('#lanche'), 'aviso com Desfazer');
  await print('4-apagada');
  await p.click('#lanche-acao');
  await espera(300);
  assert.ok(await p.evaluate((k) => dados.dias[k].entrevista.respostas.some(Boolean), k), 'Desfazer devolve a entrevista');
  assert.deepStrictEqual(erros, []);
  console.log('OK apagar entrevista');
  await nav.close(); srv.close(); clearTimeout(vigia);
})().catch((err) => { console.log('FALHA', err.message); process.exit(1); });
