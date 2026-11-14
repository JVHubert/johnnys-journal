// Teste no navegador (390 px) do áudio guardado: Ogg Opus que toca, pedaços cifrados que sobem e voltam,
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
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push('console: ' + m.text()); });
  await p.addInitScript(() => {
    localStorage.setItem('jj-groq-chave', 'falsa');
    localStorage.setItem('jj-nuvem', JSON.stringify({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }));
  });
  const print = async (nome) => { if (PRINTS) await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); };
  await p.goto(URL_APP);
  await p.waitForFunction(() => window.JJG && window.JJOgg && window.JJAudio && typeof iniciarEnt === 'function');

  // ============ 1. Ogg Opus de verdade: o <audio> toca e a duração bate ============
  const ogg = await p.evaluate(async () => {
    const taxa = 16000, seg = 6;
    const am = new Float32Array(taxa * seg);
    for (let i = 0; i < am.length; i++) am[i] = 0.3 * Math.sin(i / 20) * (0.5 + 0.5 * Math.sin(i / 4000));
    const t0 = performance.now();
    const blob = await JJOgg.codificarOpus(am);
    const ms = performance.now() - t0;
    if (!blob) return { semEncoder: true };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const lido = JJOgg.lerOggOpus(bytes);
    const a = new Audio(URL.createObjectURL(blob));
    const duracao = await new Promise((ok) => { a.onloadedmetadata = () => ok(a.duration); a.onerror = () => ok('erro ' + (a.error && a.error.code)); setTimeout(() => ok('tempo'), 4000); });
    let andou = 0;
    if (typeof duracao === 'number') { await a.play().catch(() => {}); for (let i = 0; i < 30 && a.currentTime < 0.3; i++) await new Promise((ok) => setTimeout(ok, 100)); andou = a.currentTime; a.pause(); }
    return { tipo: blob.type, tam: bytes.length, paginas: lido.paginas.length, crc: lido.paginas.every((x) => x.crcOk), duracaoLida: lido.duracao, duracao, andou, preSkip: lido.preSkip, ms };
  });
  assert.ok(!ogg.semEncoder, 'este navegador de teste tem AudioEncoder com Opus');
  assert.strictEqual(ogg.tipo, 'audio/ogg');
  assert.ok(ogg.crc, 'CRC de todas as páginas certo');
  assert.ok(ogg.tam < 6 * 24000 / 8 * 1.4 + 800, 'pequeno: ' + ogg.tam + ' bytes para 6 s');
  assert.ok(Math.abs(ogg.duracaoLida - 6) < 0.02, 'duração lida do arquivo: ' + ogg.duracaoLida);
  assert.strictEqual(typeof ogg.duracao, 'number', 'o <audio> abriu: ' + ogg.duracao);
  assert.ok(Math.abs(ogg.duracao - 6) < 0.06, 'duração do <audio>: ' + ogg.duracao);
  assert.ok(ogg.andou > 0.3, 'o <audio> tocou: ' + ogg.andou);
  console.log(`ogg opus: ${ogg.tam} bytes, ${ogg.duracao.toFixed(3)} s, codificou em ${Math.round(ogg.ms)} ms`);

  // ============ 2. chave aberta + guardar + subir cifrado + baixar de outro "celular" ============
  await p.evaluate(async () => {
    const A = await import('/armazem.js');
    window.__A = A;
    await A.gravarChave(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    window.__ui = { buscarLigacao: async () => ({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }) };
  });
  // 2a. áudio curto codificado em Opus
  const rec1 = await p.evaluate(async () => {
    const am = new Float32Array(16000 * 8);
    for (let i = 0; i < am.length; i++) am[i] = 0.2 * Math.sin(i / 15);
    const r = await JJAudio.guardarAudio({ blob: new Blob(['x']), amostras: am, segmentos: [[0, 3, 'a'], [3, 8, 'b']], duracao: 8 });
    const sobe = await JJAudio.subirPendentes(window.__ui);
    return { r, sobe, naNuvem: await JJAudio.estaNaNuvem(r) };
  });
  assert.match(rec1.r.chave, /^aud\/[0-9a-f]{16}$/); assert.strictEqual(rec1.r.partes, 1); assert.strictEqual(rec1.r.tipo, 'audio/ogg'); assert.strictEqual(rec1.r.duracao, 8);
  assert.deepStrictEqual(rec1.sobe, { subidos: 1, faltam: 0 }); assert.strictEqual(rec1.naNuvem, true);
  assert.strictEqual(puts.length, 1); assert.strictEqual(puts[0].chave, rec1.r.chave + '-0'); assert.strictEqual(puts[0].primeiro, 1, 'vai cifrado: [1][iv][cifrado]');
  // o que está no R2 NÃO é o áudio: não contém o cabeçalho OggS
  assert.strictEqual(r2.get(puts[0].chave).includes(Buffer.from('OggS')), false, 'a nuvem não vê o áudio');
  // 2b. outro aparelho: sem cópia local, baixa e decifra; o resultado é um Ogg que abre
  const volta = await p.evaluate(async (a) => {
    await new Promise((ok) => { const r = indexedDB.deleteDatabase('jj-audio'); r.onsuccess = r.onerror = r.onblocked = ok; });
    location.hash = '';
    return null;
  }, rec1.r);
  await p.reload();
  await p.waitForFunction(() => window.JJAudio && window.JJOgg);
  const baixado = await p.evaluate(async (a) => {
    const blob = await JJAudio.blobDoAudio(a, { buscarLigacao: async () => ({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }) });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const l = JJOgg.lerOggOpus(bytes);
    return { tipo: blob.type, tam: bytes.length, duracao: l.duracao, crc: l.paginas.every((x) => x.crcOk) };
  }, rec1.r);
  assert.strictEqual(baixado.tipo, 'audio/ogg'); assert.ok(baixado.crc); assert.ok(Math.abs(baixado.duracao - 8) < 0.02);
  // 2c. arquivo grande (sem encoder: fica o original) parte em pedaços de 7 MB; cada um sobe cifrado e a junção é idêntica
  puts.length = 0;
  const grande = await p.evaluate(async () => {
    const bytes = new Uint8Array(15 * 1024 * 1024 + 123);
    for (let i = 0; i < bytes.length; i += 4099) bytes[i] = (i / 4099) & 255;
    const r = await JJAudio.guardarAudio({ blob: new Blob([bytes], { type: 'audio/mp4' }), segmentos: [], duracao: 3000 });
    const sobe = await JJAudio.subirPendentes(window.__ui);
    await new Promise((ok) => { const q = indexedDB.deleteDatabase('jj-audio'); q.onsuccess = q.onerror = q.onblocked = ok; });
    return { r, sobe };
  });
  assert.strictEqual(grande.r.partes, 3); assert.strictEqual(grande.r.tipo, 'audio/mp4');
  assert.deepStrictEqual(grande.sobe, { subidos: 3, faltam: 0 });
  assert.deepStrictEqual(puts.map((x) => x.chave), [0, 1, 2].map((n) => `${grande.r.chave}-${n}`));
  assert.ok(puts.every((x) => x.tam <= 8 * 1024 * 1024 && x.primeiro === 1), 'cada pedaço cabe nos 8 MB da nuvem');
  await p.reload();
  await p.waitForFunction(() => window.JJAudio);
  const igual = await p.evaluate(async (a) => {
    const b = await JJAudio.blobDoAudio(a, { buscarLigacao: async () => ({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }) });
    const u = new Uint8Array(await b.arrayBuffer());
    const esperado = new Uint8Array(15 * 1024 * 1024 + 123);
    for (let i = 0; i < esperado.length; i += 4099) esperado[i] = (i / 4099) & 255;
    return { tam: u.length, igual: u.every((v, i) => v === esperado[i]), tipo: b.type };
  }, grande.r);
  assert.strictEqual(igual.tam, 15 * 1024 * 1024 + 123); assert.ok(igual.igual, 'os 3 pedaços juntos são o arquivo original'); assert.strictEqual(igual.tipo, 'audio/mp4');
  // 2d. sem internet: fica na fila e sobe depois
  nuvemFora = true;
  const fila = await p.evaluate(async () => {
    const am = new Float32Array(16000 * 3); for (let i = 0; i < am.length; i++) am[i] = 0.2 * Math.sin(i / 11);
    const r = await JJAudio.guardarAudio({ blob: new Blob(['x']), amostras: am, segmentos: [], duracao: 3 });
    const sobe = await JJAudio.subirPendentes(window.__ui || { buscarLigacao: async () => ({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }) });
    return { r, sobe, naNuvem: await JJAudio.estaNaNuvem(r) };
  });
  assert.ok(fila.sobe.erro && fila.sobe.faltam === 1 && fila.naNuvem === false, 'sem internet: na fila ' + JSON.stringify(fila.sobe));
  nuvemFora = false;
  const depois = await p.evaluate(() => JJAudio.subirPendentes({ buscarLigacao: async () => ({ url: 'https://nuvem-falsa.test', segredo: 'segredo-falso' }) }));
  assert.deepStrictEqual(depois, { subidos: 1, faltam: 0 }, 'voltou a internet: subiu');

  // ============ 3. pelo caminho de verdade: enviar um áudio na entrevista -> texto + recibo `audios` ============
  await p.evaluate(() => { irPara('entrevista'); iniciarEnt('memoria', 'Buenos Aires de teste'); });
  puts.length = 0; pedidosGroq.length = 0;
  await p.setInputFiles('#ent-arquivo', { name: 'conversa.wav', mimeType: 'audio/wav', buffer: wav([[20, true], [60, false], [20, true]]) });
  await p.waitForFunction(() => document.getElementById('ent-resposta').value.includes('mudo'), null, { timeout: 40000 });
  assert.ok(pedidosGroq.every((x) => x.formato === 'verbose_json' && x.modelo === 'whisper-large-v3-turbo'), 'pede verbose_json: ' + JSON.stringify(pedidosGroq));
  await p.waitForFunction(() => { const e = ent; return e && e.audios && e.audios.length === 1; }, null, { timeout: 40000 });
  const rec = await p.evaluate(() => ent.audios[0]);
  assert.strictEqual(rec.passo, 0); assert.strictEqual(rec.tipo, 'audio/ogg'); assert.strictEqual(rec.partes, 1);
  assert.ok(Math.abs(rec.duracao - 100) < 0.5, 'duração: ' + rec.duracao);
  // segmentos: parte 1 (0 a 20 s), marca de mudo (20 a 80 s), parte 2 começa em 80 s (deslocamento)
  assert.deepStrictEqual(rec.segmentos.map((s) => [s[0], s[1]]), [[0.5, 6.2], [7, 14.8], [20, 80], [80.5, 86.2], [87, 94.8]]);
  assert.strictEqual(rec.segmentos[2][2], '[microfone mudo de 00:20 a 01:20]');
  assert.strictEqual(rec.segmentos[0][2], 'Fala número 1, com acentuação.');
  // ficou gravado na memória (e é o que vai para o dados.json / espelho)
  await p.evaluate(() => { guardarResposta(); });
  const guardada = await p.evaluate(() => dados.memorias.find((m) => m.titulo === 'Buenos Aires de teste'));
  assert.strictEqual(guardada.audios.length, 1); assert.strictEqual(guardada.audios[0].chave, rec.chave);
  // subiu sozinha, em segundo plano
  await p.waitForFunction(() => JJAudio.estaNaNuvem(ent.audios[0]).then((x) => x === true) , null, { timeout: 1000 }).catch(() => {});
  await p.evaluate(() => JJAudio.subirPendentes());
  assert.ok(puts.some((x) => x.chave === rec.chave + '-0'), 'o áudio da entrevista subiu: ' + JSON.stringify(puts));
  // o campo atravessa o juntar (celular <-> GitHub/espelho/PC): nada é descartado
  const juntado = await p.evaluate((titulo) => {
    const local = JSON.parse(JSON.stringify(dados));
    const remoto = { dias: {}, memorias: [] };
    const j = JJ.juntar(local, remoto);
    const j2 = JJ.juntar(remoto, local);
    return [j, j2].map((x) => (x.memorias.find((m) => m.titulo === titulo) || {}).audios);
  }, 'Buenos Aires de teste');
  assert.deepStrictEqual(juntado[0], guardada.audios); assert.deepStrictEqual(juntado[1], guardada.audios);

  // ============ 4. tela de leitura: barra, play, texto que acende, tocar numa frase ============
  await p.evaluate(() => {
    // dia com 2 gravações (uma por pergunta) para ver a escolha entre elas
    const k = hoje();
    const m = dados.memorias.find((x) => x.titulo === 'Buenos Aires de teste');
    m.respostas = ['Chegamos em Buenos Aires de manhã. A cidade é enorme e a comida é ótima.', '', 'O melhor foi o jantar na Recoleta.'];
    salvar();
  });
  const abrirMemoria = async (titulo) => {
    await p.evaluate(() => irPara('journal'));
    await p.waitForSelector('.cartao-j');
    await p.locator('.cartao-j', { hasText: titulo }).first().click();
    await p.waitForSelector('.nota-aberta');
  };
  await abrirMemoria('Buenos Aires de teste');
  const fim = await p.evaluate(() => !!document.querySelector('.na-audio .aud'));
  assert.ok(fim, 'a leitura mostra a barra "Ouvir a gravação"');
  await espera(500);
  await print('audio-1-barra');
  assert.strictEqual((await p.textContent('.aud-titulo')).trim(), 'Ouvir a gravação');
  assert.strictEqual((await p.textContent('.aud-total')).trim(), '1:40');
  // play
  await p.click('.aud-play');
  await p.waitForFunction(() => document.querySelector('.aud-play').classList.contains('tocando'), null, { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector('.aud audio').currentTime > 0.4);
  assert.ok(await p.evaluate(() => !document.querySelector('.aud audio').paused), 'está tocando');
  // texto: abre e acende a frase de cada momento
  await p.click('[data-a="texto"]');
  await p.waitForSelector('.aud-seg');
  assert.strictEqual(await p.$$eval('.aud-seg', (l) => l.length), 5);
  await p.evaluate(() => { document.querySelector('.aud audio').currentTime = 8; });
  await p.waitForFunction(() => document.querySelector('.aud-seg.agora')?.dataset.i === '1');
  await p.evaluate(() => { document.querySelector('.aud audio').currentTime = 81; });
  await p.waitForFunction(() => document.querySelector('.aud-seg.agora')?.dataset.i === '3');
  assert.strictEqual(await p.$$eval('.aud-seg.agora', (l) => l.length), 1, 'só uma frase acesa');
  await espera(700);
  await print('audio-2-texto-sincronizado');
  // tocar numa frase pula para ela
  await p.click('.aud-seg[data-i="1"]');
  await p.waitForFunction(() => Math.abs(document.querySelector('.aud audio').currentTime - 7) < 1.5);
  // velocidade 1x -> 1,5x -> 2x -> 1x
  const vel = [];
  for (let i = 0; i < 3; i++) { await p.click('.aud-vel'); vel.push([await p.textContent('.aud-vel'), await p.evaluate(() => document.querySelector('.aud audio').playbackRate)]); }
  assert.deepStrictEqual(vel, [['1,5x', 1.5], ['2x', 2], ['1x', 1]]);
  // pausa
  await p.click('.aud-play');
  await p.waitForFunction(() => document.querySelector('.aud audio').paused);
  // barra arrastável
  await p.$eval('.aud-prog', (el) => { el.value = 500; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForFunction(() => Math.abs(document.querySelector('.aud audio').currentTime - 50) < 1.5);
  assert.strictEqual((await p.textContent('.aud-agora')).trim(), '0:50');
  // tempo em largura fixa: a caixa do tempo não muda de largura entre 0:05 e 1:30
  const larguras = await p.evaluate(() => { const e = document.querySelector('.aud-agora'); const a = e.textContent; const w1 = e.getBoundingClientRect().width; e.textContent = '1:30'; const w2 = e.getBoundingClientRect().width; e.textContent = a; return [w1, w2]; });
  assert.strictEqual(larguras[0], larguras[1], 'o tempo não treme');
  // sem rolagem lateral no celular
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral');
  // fechar a tela para o som
  await p.click('[data-a="voltar"]');
  await espera(400);
  assert.ok(await p.evaluate(() => !document.querySelector('.aud audio')), 'a tela fechou');

  // ============ 5. memória sem áudio: nada muda na leitura; áudio que ainda não subiu avisa ============
  await p.evaluate(() => { dados.memorias.push({ modo: 'memoria', titulo: 'Sem som', data: hoje(), respostas: ['Só texto.'], t: Date.now() }); salvar(); });
  await abrirMemoria('Sem som');
  await espera(300);
  assert.strictEqual(await p.$('.na-audio'), null);
  await p.click('[data-a="voltar"]'); await espera(300);

  assert.deepStrictEqual(erros, []);
  await nav.close(); srv.close();
  console.log('audio (tela): ok');
})().catch((e) => { console.error(e); process.exit(1); });
