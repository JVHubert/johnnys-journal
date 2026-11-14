// (Juntar a gravação)  Ogg Opus que toca, pedaços cifrados que sobem e voltam,
// transcrição -> recibo `audios` na memória, e a tela de leitura com o texto sincronizado. Nuvem e Groq de mentira.
// node testes/audio-tela.test.cjs [pasta para prints]
// PLAYWRIGHT_CORE aponta para o playwright-core.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const PRINTS = process.argv[2] || null;
if (PRINTS) fs.mkdirSync(PRINTS, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const REAL = process.env.AUDIO_REAL || 'C:/AI/99. Input Dump/Buenos Aires.m4a';
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

function wav(trechos) {
  const taxa = 16000;
  const n = trechos.reduce((s, [seg]) => s + seg * taxa, 0);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24); b.writeUInt32LE(taxa * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let i = 44;
  for (const [seg, som] of trechos) for (let k = 0; k < seg * taxa; k++, i += 2) b.writeInt16LE(som ? Math.round(9000 * Math.sin(k / 12) * (0.6 + 0.4 * Math.sin(k / 3000))) : 0, i);
  return b;
}

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const URL_APP = `http://localhost:${srv.address().port}/index.html`;

  const nav = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });

  // ---- nuvem de mentira (R2): guarda o que chega por PUT e devolve por GET ----
  const r2 = new Map();
  const puts = [];
  let nuvemFora = false;
  await ctx.route('https://nuvem-falsa.test/**', async (rota) => {
    if (nuvemFora) return rota.abort('internetdisconnected');
    const req = rota.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors });
    if (req.headers()['x-segredo'] !== 'segredo-falso') return rota.fulfill({ status: 403, headers: cors, json: { erro: 'sem permissão' } });
    const chave = u.searchParams.get('chave') || '';
    if (u.pathname !== '/dados/arquivo' || !/^aud\/[0-9a-f]{16}-\d{1,2}$/.test(chave)) return rota.fulfill({ status: 400, headers: cors, json: { erro: 'chave inválida' } });
    if (req.method() === 'PUT') {
      const corpo = req.postDataBuffer();
      if (corpo.length > 8 * 1024 * 1024) return rota.fulfill({ status: 413, headers: cors, json: { erro: 'grande demais' } });
      puts.push({ chave, tam: corpo.length, primeiro: corpo[0] });
      const ja = r2.has(chave); if (!ja) r2.set(chave, corpo);
      return rota.fulfill({ headers: cors, json: { ok: true, ja } });
    }
    if (!r2.has(chave)) return rota.fulfill({ status: 404, headers: cors, json: { erro: 'não existe' } });
    return rota.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body: r2.get(chave) });
  });
  // ---- Groq de mentira: devolve texto e segmentos com tempo (verbose_json) ----
  const pedidosGroq = [];
  await ctx.route('https://api.groq.com/**', async (rota) => {
    const corpo = (rota.request().postDataBuffer() || Buffer.alloc(0)).toString('latin1');
    const modelo = /name="model"\r\n\r\n([^\r]+)/.exec(corpo)?.[1];
    const formato = /name="response_format"\r\n\r\n([^\r]+)/.exec(corpo)?.[1];
    pedidosGroq.push({ modelo, formato });
    const n = pedidosGroq.length;
    await rota.fulfill({ json: { text: `Fala número ${n}, com acentuação. Segunda frase da parte ${n}.`, segments: [{ start: 0.5, end: 6.2, text: ` Fala número ${n}, com acentuação.` }, { start: 7, end: 14.8, text: ` Segunda frase da parte ${n}.` }] } });
  });

  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('jj-groq-chave', 'falsa');
    localStorage.setItem('jj-nuvem', JSON.stringify({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }));
  });
  const print = async (nome) => { if (PRINTS) await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); };
  await p.goto(URL_APP);
  await p.waitForFunction(() => window.JJG && window.JJAudio && typeof dia === 'function');
  await p.evaluate(async () => {
    const A = await import('/armazem.js');
    await A.gravarChave(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    dados.memorias.push({ modo: 'memoria', titulo: 'Buenos Aires', data: '2026-11-14', respostas: ['Texto que já existia e não pode mudar.'], t: 1 });
    salvar();
  });
  await p.evaluate(() => irPara('journal'));
  await p.waitForSelector('.cartao-j');
  await p.locator('.cartao-j', { hasText: 'Buenos Aires' }).first().click();
  await p.waitForSelector('[data-a="juntar"]');
  await print('juntar-1-botao');
  const t0 = Date.now();
  await p.setInputFiles('.na-juntar input', REAL);
  await p.waitForFunction(() => /Transcrevendo parte \d+ de \d+/.test(document.querySelector('.na-juntar .meta')?.textContent || ''), null, { timeout: 120000 });
  await print('juntar-2-progresso');
  await p.waitForSelector('.na-audio .aud', { timeout: 280000 });
  console.log('juntou em', Math.round((Date.now() - t0) / 1000), 's;', pedidosGroq.length, 'partes transcritas');
  const m = await p.evaluate(() => dados.memorias.find((x) => x.titulo === 'Buenos Aires'));
  assert.deepStrictEqual(m.respostas, ['Texto que já existia e não pode mudar.'], 'o texto não mudou');
  assert.strictEqual(m.audios.length, 1);
  const a = m.audios[0];
  assert.ok(a.duracao > 600, 'duração ' + a.duracao);
  assert.ok(a.segmentos.length >= pedidosGroq.length, 'segmentos: ' + a.segmentos.length);
  assert.ok(a.segmentos.every((s, i, l) => !i || s[0] >= l[i - 1][0]), 'segmentos em ordem do tempo');
  console.log('recibo:', a.partes, 'pedaço(s),', a.tipo, a.duracao + ' s,', a.segmentos.length, 'segmentos, último em', a.segmentos.at(-1)[0]);
  await p.click('[data-a="texto"]');
  await p.waitForSelector('.aud-seg');
  await espera(600);
  await print('juntar-3-pronto');
  await p.waitForFunction(() => window.JJAudio.estaNaNuvem(dados.memorias.find((x) => x.titulo === 'Buenos Aires').audios[0]).then((v) => v === true), null, { timeout: 60000 });
  assert.ok(puts.length >= 1 && puts.every((x) => x.primeiro === 1));
  assert.deepStrictEqual(erros, []);
  await nav.close(); srv.close();
  console.log('juntar gravação: ok');
})().catch((e) => { console.error(e); process.exit(1); });
