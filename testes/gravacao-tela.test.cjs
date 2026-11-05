// Teste de ponta a ponta da gravação, no navegador, com microfone falso e transcrição falsa (nada sai do PC).
// node testes/gravacao-tela.test.cjs [pasta para prints]
// PLAYWRIGHT_CORE aponta para o playwright-core; AUDIO_LONGO (opcional) é um áudio longo qualquer do PC.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const RAIZ = path.resolve(__dirname, '..');
const PRINTS = process.argv[2] || null;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
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
  const URL_APP = `http://localhost:${srv.address().port}/index.html?demo`;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grav-'));
  const microfone = path.join(pasta, 'mic.wav');
  fs.writeFileSync(microfone, wav([[20, true]]));

  const nav = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${microfone}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['microphone'], serviceWorkers: 'block' });
  const envios = [];
  await ctx.route('https://api.groq.com/**', async (rota) => {
    const corpo = rota.request().postDataBuffer() || Buffer.alloc(0);
    const nome = /filename="([^"]+)"/.exec(corpo.toString('latin1')) || [];
    envios.push({ nome: nome[1], tam: corpo.length });
    await rota.fulfill({ json: { text: `fala ${envios.length}` } });
  });
  const pagina = async () => {
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    p.erros = erros;
    await p.addInitScript(() => localStorage.setItem('jj-groq-chave', 'falsa'));
    await p.goto(URL_APP);
    await p.waitForFunction(() => window.JJG && typeof iniciarEnt === 'function');
    return p;
  };
  const entrevista = (p) => p.evaluate(() => { irPara('entrevista'); iniciarEnt('memoria', 'Teste'); });
  const print = async (p, nome) => { if (PRINTS) await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); };
  const metas = (p) => p.evaluate(() => JJG.listar());

  // 1. Gravar: aviso na tela, áudio guardado enquanto grava, tela escura e texto no fim
  let p = await pagina();
  await entrevista(p);
  await p.click('#ent-gravar');
  await p.waitForSelector('.grav-faixa');
  await espera(6500);
  await print(p, '1-gravando');
  let m = await metas(p);
  assert.strictEqual(m[0].estado, 'gravando');
  assert.ok((await p.evaluate((id) => JJG.audioDe(id).then((b) => b.size), m[0].id)) > 1000, 'guardou áudio enquanto gravava');
  await p.click('.gf-escurecer');
  await espera(1500);
  assert.ok(await p.isVisible('.grav-escuro'));
  const linha = await p.evaluate(() => document.querySelector('.ge-linha').style.transform);
  assert.ok(/scaleX/.test(linha), 'linha reage ao som: ' + linha);
  await print(p, '2-escuro');
  await p.click('.grav-escuro');
  assert.strictEqual(await p.isVisible('.grav-escuro'), false);

  // a tela apagou no meio (simulado): avisa na volta
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' }); window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  await espera(3500);
  await p.evaluate(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  assert.ok((await p.textContent('.grav-faixa')).includes('A tela apagou'), 'avisou que a tela apagou');
  await print(p, '3-alerta');

  await p.click('#ent-gravar');
  await p.waitForFunction(() => document.getElementById('ent-resposta').value.includes('fala'), null, { timeout: 15000 });
  assert.strictEqual(envios.length, 1);
  assert.ok(/\.webm$|\.ogg$/.test(envios[0].nome), 'sem mudo e curto vai o áudio original: ' + envios[0].nome);
  assert.strictEqual(await p.$('.grav-faixa'), null, 'aviso sai ao parar');
  await espera(300);
  m = await metas(p);
  assert.strictEqual(m[0].estado, 'transcrita');
  assert.deepStrictEqual(p.erros, []);

  // 2. Enviar um áudio com microfone mudo no meio: tira o mudo e marca no texto
  envios.length = 0;
  await entrevista(p);
  await p.setInputFiles('#ent-arquivo', { name: 'conversa.wav', mimeType: 'audio/wav', buffer: wav([[20, true], [60, false], [20, true]]) });
  await p.waitForFunction(() => document.getElementById('ent-resposta').value.includes('mudo'), null, { timeout: 30000 });
  const texto = await p.inputValue('#ent-resposta');
  assert.strictEqual(texto, 'fala 1\n[microfone mudo de 00:20 a 01:20]\nfala 2');
  assert.strictEqual(envios.length, 2);
  assert.ok(envios.every((x) => x.nome === 'trecho.wav' && x.tam < 1024 * 1024));
  await print(p, '4-marca');

  // 3. Áudio longo vira partes, mostrando o andamento
  if (process.env.AUDIO_LONGO) {
    envios.length = 0;
    await entrevista(p);
    await p.setInputFiles('#ent-arquivo', process.env.AUDIO_LONGO);
    await p.waitForFunction(() => /Transcrevendo parte|fala/.test(document.getElementById('ent-gravar-txt').textContent + document.getElementById('ent-resposta').value), null, { timeout: 60000 });
    await p.waitForFunction(() => document.getElementById('ent-resposta').value.includes('fala'), null, { timeout: 120000 });
    console.log('áudio longo:', envios.length, 'partes;', envios.map((x) => Math.round(x.tam / 1048576) + ' MB').join(', '));
    assert.ok(envios.length >= 2 && envios.every((x) => x.tam < 25 * 1048576));
  }

  // 4. A página morre no meio da gravação: o áudio fica e aparece em Ajustes
  envios.length = 0;
  await entrevista(p);
  await p.click('#ent-gravar');
  await p.waitForSelector('.grav-faixa');
  await espera(6500);
  await p.close({ runBeforeUnload: false });
  p = await pagina();
  await espera(800);
  m = await metas(p);
  const interrompida = m.find((x) => x.estado === 'interrompida');
  assert.ok(interrompida, 'gravação ficou como interrompida: ' + JSON.stringify(m.map((x) => x.estado)));
  assert.ok((await p.evaluate((id) => JJG.audioDe(id).then((b) => b.size), interrompida.id)) > 1000);
  await p.click('#ini-ajustes');
  await p.waitForSelector('.grav-item');
  await p.locator('#aj-gravacoes').scrollIntoViewIfNeeded();
  await espera(200);
  await print(p, '5-ajustes');
  assert.ok((await p.textContent('#aj-gravacoes')).includes('Interrompida'));
  await p.locator('.grav-item', { hasText: 'Interrompida' }).locator('[data-a="transcrever"]').click();
  await p.waitForSelector('.editor-nota');
  assert.ok((await p.inputValue('.en-texto')).includes('fala'));
  assert.strictEqual(envios.length, 1);
  await print(p, '6-nota');
  await p.click('[data-a="cancelar"]');
  assert.deepStrictEqual(p.erros, []);

  // 5. Um minuto sem tocar na tela: escurece sozinha
  await p.evaluate(() => { irPara('entrevista'); iniciarEnt('memoria', 'Teste'); });
  await p.click('#ent-gravar');
  await p.waitForSelector('.grav-faixa');
  await espera(63000);
  assert.ok(await p.isVisible('.grav-escuro'), 'escureceu sozinha');
  await p.click('.grav-escuro');
  await p.click('#ent-gravar');
  await p.waitForFunction(() => !document.querySelector('.grav-faixa'));
  await espera(500);

  await nav.close();
  srv.close();
  fs.rmSync(pasta, { recursive: true, force: true });
  console.log('gravação na tela: ok');
})().catch((e) => { console.error(e); process.exit(1); });
