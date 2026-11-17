// Tarefas achadas na entrevista (2.93.0): a fala vai para a nuvem (falsa aqui), a tela mostra as prováveis marcadas
// e as vagas desmarcadas, cria só as marcadas, não oferece de novo no mesmo dia e, sem nada achado, segue direto.
// node testes/tarefas-entrevista.test.cjs [pasta para prints]   (PLAYWRIGHT_CORE aponta para o playwright-core)
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const PRINTS = process.argv[2] || null;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const NUVEM = 'https://nuvem-falsa.test';
const vigia = setTimeout(() => { console.log('FALHA tempo esgotado'); process.exit(3); }, 120000);

const RESPOSTA = { tarefas: [
  { titulo: 'Marcar o dentista', frase: 'Marcar o dentista', data: null, hora: null, projeto: null, etiquetas: [], importante: true, notas: null, provavel: true, trecho: 'Preciso marcar o dentista essa semana, não posso esquecer.' },
  { titulo: 'Ligar para o Lucas sobre a mudança', frase: 'Ligar para o Lucas amanhã', data: '2026-11-18', hora: null, projeto: null, etiquetas: [], importante: false, notas: 'Ver a mudança.', provavel: true, trecho: 'Amanhã tenho que ligar pro Lucas pra ver a mudança.' },
  { titulo: 'Voltar a ler antes de dormir', frase: 'Voltar a ler antes de dormir', data: null, hora: null, projeto: null, etiquetas: [], importante: false, notas: null, provavel: false, trecho: 'Queria voltar a ler antes de dormir, talvez.' },
] };

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
  const pedidos = [];
  let resposta = RESPOSTA;
  await ctx.route(NUVEM + '/**', async (rota) => {
    const corpo = JSON.parse(rota.request().postData() || '{}');
    pedidos.push({ url: rota.request().url(), corpo });
    await espera(700);
    await rota.fulfill({ json: rota.request().url().endsWith('/tarefas-da-entrevista') ? resposta : {} });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript((url) => localStorage.setItem('jj-nuvem', JSON.stringify({ url, segredo: 'x' })), NUVEM);
  await p.goto(`http://localhost:${srv.address().port}/index.html?demo`);
  await p.waitForFunction(() => typeof window.tarefasDaEntrevista === 'function');
  const print = async (nome) => { if (PRINTS) { fs.mkdirSync(PRINTS, { recursive: true }); await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); } };
  const titulos = () => p.evaluate(() => Object.values(JJ_TAREFAS().lista).filter((t) => !t.apagada).map((t) => t.titulo));
  const antes = await titulos();

  // 1. Procura, mostra 3, as 2 prováveis marcadas
  await p.evaluate(() => { window.__seguiu = 0; window.tarefasDaEntrevista('2026-11-17', 'Hoje fui na academia. Preciso marcar o dentista...', () => window.__seguiu++); });
  await p.waitForSelector('.tde-pensando');
  await print('1-procurando');
  await p.waitForSelector('.tde-item');
  await espera(900);
  await print('2-tarefas');
  assert.strictEqual(pedidos[0].corpo.hoje, '2026-11-17', 'manda o dia da entrevista');
  assert.strictEqual(await p.$$eval('.tde-item', (xs) => xs.length), 3);
  assert.deepStrictEqual(await p.$$eval('.tde-lista input[type=checkbox]', (xs) => xs.map((x) => x.checked)), [true, true, false]);
  assert.strictEqual((await p.textContent('#tde-criar')).trim(), 'Criar 2 tarefas');
  assert.match(await p.textContent('.tde-item:nth-child(2) .tde-quando'), /18 nov/);
  // 2. Marca a vaga, desmarca o dentista, cria
  await p.click('.tde-item:nth-child(3) .tde-marca');
  await p.click('.tde-item:nth-child(1) .tde-marca');
  assert.strictEqual((await p.textContent('#tde-criar')).trim(), 'Criar 2 tarefas');
  await print('3-marcadas');
  await p.click('#tde-criar');
  await espera(600);
  const novas = (await titulos()).filter((t) => !antes.includes(t));
  assert.deepStrictEqual(novas.sort(), ['Ligar para o Lucas sobre a mudança', 'Voltar a ler antes de dormir']);
  const lucas = await p.evaluate(() => Object.values(JJ_TAREFAS().lista).find((t) => t.titulo === 'Ligar para o Lucas sobre a mudança'));
  assert.strictEqual(lucas.data, '2026-11-18', 'a data da fala vale');
  assert.strictEqual(await p.evaluate(() => window.__seguiu), 1, 'depois de criar, segue (ilustração)');

  // 3. Rever a entrevista no mesmo dia: as mesmas tarefas não voltam, e segue direto
  await p.evaluate(() => window.tarefasDaEntrevista('2026-11-17', 'Hoje fui na academia. Preciso marcar o dentista...', () => window.__seguiu++));
  await p.waitForFunction(() => window.__seguiu === 2, null, { timeout: 5000 });
  assert.strictEqual(await p.isVisible('.tde-item'), false, 'não oferece de novo');

  // 4. Nada achado: segue direto, sem tela
  resposta = { tarefas: [] };
  await p.evaluate(() => window.tarefasDaEntrevista('2026-11-16', 'Dia tranquilo, nada demais.', () => window.__seguiu++));
  await p.waitForFunction(() => window.__seguiu === 3, null, { timeout: 5000 });
  // 5. "Agora não" fecha e segue; "Pular" na procura também
  resposta = RESPOSTA;
  await p.evaluate(() => window.tarefasDaEntrevista('2026-11-15', 'outra fala com tarefas', () => window.__seguiu++));
  await p.waitForSelector('.tde-item');
  await p.click('#tde-agora-nao');
  await p.waitForFunction(() => window.__seguiu === 4, null, { timeout: 5000 });
  await espera(800);
  await p.evaluate(() => { window.tarefasDaEntrevista('2026-11-14', 'mais uma fala', () => window.__seguiu++); });
  await p.click('#tde-pular');
  await p.waitForFunction(() => window.__seguiu === 5, null, { timeout: 5000 });
  await espera(1200);
  assert.strictEqual(await p.isVisible('.tde-item'), false, 'pulou: a lista não aparece depois');
  assert.deepStrictEqual(erros, []);
  console.log('OK tarefas da entrevista: 5 cenários');
  await nav.close(); srv.close(); clearTimeout(vigia);
})().catch((err) => { console.log('FALHA', err.message); process.exit(1); });
