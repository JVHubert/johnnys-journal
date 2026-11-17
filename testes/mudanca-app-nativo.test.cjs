// Mudança para o app nativo (casca 3): o app antigo (Chrome) prepara o arquivo cifrado com um código; o app novo
// (aqui com uma ponte JJNativo falsa) mostra as boas-vindas, recusa código errado e traz tudo com o certo.
// Também confere a trava com a digital nativa e o compartilhar pela ponte. Nada sai do PC (GitHub e nuvem bloqueados).
// node testes/mudanca-app-nativo.test.cjs [pasta para prints]   (PLAYWRIGHT_CORE aponta para o playwright-core)
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const PRINTS = process.argv[2] || null;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vigia = setTimeout(() => { console.log('FALHA tempo esgotado'); process.exit(3); }, 150000);

const PONTE_FALSA = () => {
  window.__chamadas = [];
  window.JJNativo = {
    casca: () => 3,
    temDigital: () => true,
    digital: (id, titulo) => { window.__chamadas.push(['digital', titulo]); setTimeout(() => window.__jjNativo(id, window.__digitalOk !== false, ''), 50); },
    telaAcesa: (v) => window.__chamadas.push(['telaAcesa', v]),
    compartilhar: (t) => window.__chamadas.push(['compartilhar', t]),
    abrirFora: (u) => window.__chamadas.push(['abrirFora', u]),
    avisosLigados: () => !!window.__avisos,
    ligarAvisos: (id, url, seg) => { window.__chamadas.push(['ligarAvisos', url, seg]); window.__avisos = true; setTimeout(() => window.__jjNativo(id, true, 'ok:3'), 20); },
    atualizarAvisos: () => window.__chamadas.push(['atualizarAvisos']),
    testarAviso: () => window.__chamadas.push(['testarAviso']),
    salvar: (id, nome) => { window.__chamadas.push(['salvar', nome]); setTimeout(() => window.__jjNativo(id, true, nome), 20); },
  };
};

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const URL_APP = `http://localhost:${srv.address().port}/index.html`;
  const nav = await chromium.launch({ channel: 'msedge', headless: true });
  const bloquear = async (ctx) => { await ctx.route(/api\.github\.com|workers\.dev|groq\.com/, (r) => r.abort()); };
  const print = async (p, nome) => { if (PRINTS) { fs.mkdirSync(PRINTS, { recursive: true }); await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); } };

  // 1. App antigo: dados de teste no "Chrome", prepara a mudança
  const velho = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: 'block' });
  await bloquear(velho);
  const a = await velho.newPage();
  await a.addInitScript(() => {
    if (sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('jj-github-token', 'github_pat_TESTE');
    localStorage.setItem('jj-groq-chave', 'gsk_TESTE');
    localStorage.setItem('jj-nuvem', JSON.stringify({ url: 'https://nuvem-falsa.invalid', segredo: 'seg-teste' }));
    localStorage.setItem('jj-teste-mudanca', 'á é í ó ú ç — ' + 'x'.repeat(200000));
  });
  await a.goto(URL_APP);
  // a trava antiga entra só depois de abrir: se estivesse lá ao abrir, o Windows pediria a chave de segurança de verdade
  await a.evaluate(() => localStorage.setItem('jj-trava', JSON.stringify({ id: 'webauthn-antigo' })));
  await a.waitForFunction(() => window.JJ_MUDANCA && typeof abrirAjustes === 'function' || !!document.getElementById('aj-mudanca'));
  await a.evaluate(() => { document.documentElement.classList.remove('trancado'); });
  await a.evaluate(() => { history.pushState({ tela: 'ajustes' }, ''); irPara('ajustes'); });
  await a.waitForFunction(() => window.JJ_MUDANCA);
  await a.evaluate(() => document.getElementById('aj-trava') && document.querySelector('#aj-mudanca') && 0);
  // abre os Ajustes pelo caminho normal para renderizar o cartão
  await a.evaluate(() => document.querySelector('#ini-ajustes') && document.querySelector('#ini-ajustes').click());
  await a.waitForSelector('#mud-preparar', { state: 'visible', timeout: 10000 });
  await a.evaluate(() => document.getElementById('mud-preparar').scrollIntoView({ block: 'center' }));
  const [baixado] = await Promise.all([a.waitForEvent('download'), a.click('#mud-preparar')]);
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mud-')), baixado.suggestedFilename());
  await baixado.saveAs(arq);
  await a.waitForSelector('.mud-codigo');
  const codigo = (await a.textContent('.mud-codigo')).replace(/\D/g, '');
  assert.strictEqual(codigo.length, 6, 'código de 6 números');
  await print(a, '1-app-antigo-codigo');
  const pacote = JSON.parse(fs.readFileSync(arq, 'utf8'));
  assert.strictEqual(pacote.journalMudanca, 1);
  assert.ok(!fs.readFileSync(arq, 'utf8').includes('github_pat_TESTE'), 'o token não aparece aberto no arquivo');

  // 2. App novo: ponte falsa, armazenamento vazio -> boas-vindas
  const novo = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await bloquear(novo);
  const b = await novo.newPage();
  const erros = [];
  b.on('pageerror', (e) => erros.push(e.message));
  await b.addInitScript(PONTE_FALSA);
  await b.goto(URL_APP + '?casca=3');
  await b.waitForSelector('.mud', { timeout: 10000 });
  await espera(700);
  await print(b, '2-boas-vindas');
  assert.ok(await b.isDisabled('#mud-trazer'), 'sem arquivo e código, o botão fica parado');
  await b.setInputFiles('#mud-input', arq);
  await b.fill('#mud-cod', codigo === '000000' ? '111111' : '000000');
  await b.click('#mud-trazer');
  await b.waitForFunction(() => /Código errado/.test(document.querySelector('.mud-erro').textContent));
  await print(b, '3-codigo-errado');
  await b.fill('#mud-cod', codigo.slice(0, 3) + ' ' + codigo.slice(3));
  await Promise.all([b.waitForNavigation(), b.click('#mud-trazer')]);
  await espera(800);
  const depois = await b.evaluate(() => ({ token: localStorage.getItem('jj-github-token'), groq: localStorage.getItem('jj-groq-chave'), trava: localStorage.getItem('jj-trava'), teste: (localStorage.getItem('jj-teste-mudanca') || '').slice(0, 14), mud: !!localStorage.getItem('jj-mudanca') }));
  assert.strictEqual(depois.token, 'github_pat_TESTE');
  assert.strictEqual(depois.groq, 'gsk_TESTE');
  assert.strictEqual(depois.trava, null, 'a trava antiga (WebAuthn) não vem junto');
  assert.strictEqual(depois.teste, 'á é í ó ú ç — ', 'acentos chegam inteiros');
  assert.ok(depois.mud);
  assert.strictEqual(await b.isVisible('.mud'), false, 'depois da mudança, as boas-vindas não voltam');

  // 2b. Avisos: o app novo liga sozinho com o endereço e a senha da nuvem que vieram na mudança
  await b.waitForFunction(() => window.__chamadas.some(([f]) => f === 'ligarAvisos'), null, { timeout: 8000 });
  const lig = (await b.evaluate(() => window.__chamadas)).find(([f]) => f === 'ligarAvisos');
  assert.deepStrictEqual(lig.slice(1), ['https://nuvem-falsa.invalid', 'seg-teste'], 'liga os avisos com a ligação da nuvem');

  // 3. Trava com a digital nativa e compartilhar pela ponte
  await b.evaluate(() => { history.pushState({ tela: 'ajustes' }, ''); irPara('ajustes'); });
  await b.evaluate(() => document.querySelector('#ini-ajustes') && document.querySelector('#ini-ajustes').click());
  await b.waitForSelector('#aj-trava .chave', { timeout: 10000 });
  assert.strictEqual(await b.isVisible('#aj-mudanca-box'), false, 'no app novo não aparece "Preparar a mudança"');
  await b.click('#aj-trava .chave');
  await b.waitForFunction(() => !!localStorage.getItem('jj-trava'));
  assert.deepStrictEqual(JSON.parse(await b.evaluate(() => localStorage.getItem('jj-trava'))).nativo, true);
  await b.evaluate(() => enviar('texto de teste'));
  const chamadas = await b.evaluate(() => window.__chamadas);
  assert.ok(chamadas.some(([f]) => f === 'digital'), 'pediu a digital do Android');
  assert.ok(chamadas.some(([f, t]) => f === 'compartilhar' && t === 'texto de teste'), 'compartilhou pela ponte');
  assert.match(await b.textContent('#aj-avisos'), /Avisos ligados neste celular/, 'Ajustes mostra os avisos ligados');
  await b.click('#aj-avisos .linha-chave button');
  assert.ok((await b.evaluate(() => window.__chamadas)).some(([f]) => f === 'testarAviso'), 'Testar manda um aviso pelo app');
  // reabrir com a trava: pede a digital e destrava
  await b.reload();
  await b.waitForFunction(() => !document.documentElement.classList.contains('trancado'), null, { timeout: 8000 });
  assert.ok((await b.evaluate(() => window.__chamadas)).some(([f, t]) => f === 'digital' && /Destravar/.test(t)), 'pediu a digital ao abrir');
  assert.deepStrictEqual(erros.filter((m) => !/Failed to fetch|NetworkError|net::/.test(m)), []);
  console.log('OK mudança para o app nativo, trava e compartilhar');
  await nav.close(); srv.close(); clearTimeout(vigia);
})().catch((err) => { console.log('FALHA', err.message); process.exit(1); });
