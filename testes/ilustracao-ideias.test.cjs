// Teste da tela "O que eu desenharia" no navegador (390 px), com o serviço do Journal de mentira: nada sai do PC.
// node testes/ilustracao-ideias.test.cjs [pasta para prints]
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

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const URL_APP = `http://localhost:${srv.address().port}/index.html?demo`;

  const nav = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(() => localStorage.setItem('jj-nuvem', JSON.stringify({ url: 'https://nuvem-falsa.test', segredo: 'x' })));

  // Um desenho de mentira que parece um rabisco a lápis (para o print).
  await p.goto(URL_APP);
  const PNG = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
    const x = c.getContext('2d'); x.fillStyle = '#e9e4d8'; x.fillRect(0, 0, 1024, 576);
    x.strokeStyle = '#3a3a3a'; x.lineWidth = 1.2;
    for (let i = 0; i < 160; i++) { x.beginPath(); x.moveTo(300 + i * 3, 380); x.bezierCurveTo(320 + i * 3, 150, 480 + i * 2, 100, 520 + i, 380 - (i % 9)); x.stroke(); }
    x.beginPath(); x.ellipse(512, 400, 260, 40, 0, 0, 7); x.stroke();
    return c.toDataURL('image/png').split(',')[1];
  });

  // ---- nuvem de mentira ----
  const chamadas = { ideias: [], desenho: [], instrucoesGet: 0, instrucoesPost: [] };
  const LOTES = [
    ['Meu pai escolhendo a picanha com calma, no balcão do açougue', 'Nós dois andando entre as prateleiras do mercado, conversando sobre a casa nova', 'A mesa do churrasco de domingo posta, com a família chegando'],
    ['Eu trabalhando de casa de manhã, com o café ao lado do computador', 'O carrinho do mercado cheio de coisas para o churrasco', 'Meu pai rindo de uma piada na fila do caixa'],
  ];
  let guardado = { escolha: 'Escolha a cena mais afetiva do dia.', estilo: 'A pencil sketch, graphite, paper.', padrao: { escolha: 'Escolha a cena mais afetiva do dia.', estilo: 'A pencil sketch, graphite, paper.' } };
  await ctx.route('https://nuvem-falsa.test/**', async (rota) => {
    const req = rota.request();
    const caminho = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors });
    const corpo = req.postData() ? JSON.parse(req.postData()) : {};
    if (caminho === '/ilustracao/ideias') {
      chamadas.ideias.push(corpo);
      await espera(700);
      const lote = LOTES[(chamadas.ideias.length - 1) % LOTES.length];
      return rota.fulfill({ headers: cors, json: { ideias: lote.map((c, i) => ({ cena: c, cenaEn: `English scene ${chamadas.ideias.length}.${i}` })), ms: 700 } });
    }
    if (caminho === '/ilustracao-do-dia') {
      chamadas.desenho.push(corpo);
      await espera(1500);
      return rota.fulfill({ headers: cors, json: { imagem: PNG, fonte: 'teste', cena: corpo.cena || 'Pai e filho no mercado, de longe', cenaEn: corpo.cenaEn || 'Father and son, far away.', ms: 1500 } });
    }
    if (caminho === '/ilustracao/instrucoes') {
      if (req.method() === 'GET') { chamadas.instrucoesGet++; return rota.fulfill({ headers: cors, json: guardado }); }
      chamadas.instrucoesPost.push(corpo);
      if (corpo.padrao) guardado = { ...guardado, ...guardado.padrao };
      else guardado = { ...guardado, ...(corpo.escolha !== undefined ? { escolha: corpo.escolha } : {}), ...(corpo.estilo !== undefined ? { estilo: corpo.estilo } : {}) };
      return rota.fulfill({ headers: cors, json: guardado });
    }
    return rota.fulfill({ status: 404, headers: cors, json: { erro: 'não encontrado' } });
  });

  const print = async (nome) => { if (PRINTS) await p.screenshot({ path: path.join(PRINTS, nome + '.png') }); };
  const cartoes = () => p.$$eval('.il-ideia:not(.esqueleto) .il-ideia-txt', (l) => l.map((x) => x.textContent));

  await p.goto(URL_APP);
  await p.waitForFunction(() => typeof abrirIlustracao === 'function' && typeof dia === 'function');
  const K = await p.evaluate(() => {
    const k = hoje();
    dia(k).entrevista = { modo: 'dia', data: k, respostas: ['Fui ao mercado com meu pai.', 'Fiquei feliz.', '', '', '', 'Ele escolhendo a picanha.'], t: Date.now() };
    return k;
  });

  // 1. Abre SEM desenhar: mostra o carregando e depois 3 ideias
  await p.evaluate((k) => abrirIlustracao(k), K);
  await p.waitForSelector('.il-ideia.esqueleto');
  await print('1-pensando');
  await p.waitForSelector('.il-ideia:not(.esqueleto)');
  await espera(900);   // deixa a entrada animada terminar
  assert.deepStrictEqual(await cartoes(), LOTES[0]);
  assert.strictEqual(chamadas.ideias.length, 1);
  assert.strictEqual(chamadas.desenho.length, 0, 'não desenhou ao abrir');
  assert.match(chamadas.ideias[0].texto, /picanha/);
  assert.deepStrictEqual(chamadas.ideias[0].anteriores, []);
  assert.strictEqual(await p.textContent('.il-titulo'), 'O que eu desenharia');
  await print('2-tres-ideias');

  // 2. Outras 3 ideias: manda as já mostradas
  await p.click('[data-a="mais"]');
  await p.waitForFunction(() => document.querySelector('.il-ideia-txt')?.textContent.startsWith('Eu trabalhando'));
  await espera(900);
  assert.deepStrictEqual(chamadas.ideias[1].anteriores, LOTES[0]);
  assert.deepStrictEqual(await cartoes(), LOTES[1]);
  assert.strictEqual(chamadas.desenho.length, 0);
  await print('3-outras-tres');

  // 3. Tocar numa ideia desenha aquela ideia (cena pronta, sem reler a entrevista)
  await p.click('.il-ideia:nth-child(2)');
  await p.waitForSelector('.il-quadro.desenhando');
  await print('4-desenhando');
  await p.waitForFunction(() => !document.querySelector('.il-quadro.desenhando') && !document.querySelector('.il-quadro img').hidden);
  assert.strictEqual(chamadas.desenho.length, 1);
  assert.deepStrictEqual(chamadas.desenho[0], { cena: LOTES[1][1], cenaEn: 'English scene 2.1' });
  assert.strictEqual(await p.textContent('.il-titulo'), 'Ilustração do dia');
  assert.strictEqual(await p.textContent('.il-cena'), LOTES[1][1]);
  await print('5-desenho');

  // 4. Fazer outra sem pedido = mesma ideia (semente nova); com pedido = a IA refaz a cena
  await p.click('[data-a="outra"]');
  await p.waitForFunction(() => document.querySelector('.il-espera').hidden);
  assert.deepStrictEqual(chamadas.desenho[1], chamadas.desenho[0], 'mesma ideia');
  await p.fill('.il-ajuste input', 'só a mesa, de longe');
  await p.click('[data-a="outra"]');
  await p.waitForFunction(() => document.querySelector('.il-espera').hidden);
  assert.strictEqual(chamadas.desenho[2].ajuste, 'só a mesa, de longe');
  assert.match(chamadas.desenho[2].texto, /picanha/);
  assert.strictEqual(chamadas.desenho[2].cenaAnterior, 'English scene 2.1');

  // 5. Voltar às ideias não pede nada; fechar e abrir de novo também não
  await p.click('[data-a="ideias"]');
  assert.deepStrictEqual(await cartoes(), LOTES[1]);
  await p.click('[data-a="fechar"]');
  await espera(300);
  await p.evaluate((k) => abrirIlustracao(k), K);
  await espera(300);
  assert.deepStrictEqual(await cartoes(), LOTES[1], 'lembra as ideias');
  assert.strictEqual(chamadas.ideias.length, 2, 'não pediu ideias de novo');
  assert.strictEqual(chamadas.desenho.length, 3);

  // 6. Instruções da IA: ver, mudar, salvar, voltar ao padrão
  await p.click('[data-a="instr"]');
  await p.waitForFunction(() => document.querySelector('.il-instr-escolha').value.length > 0);
  assert.strictEqual(await p.inputValue('.il-instr-escolha'), 'Escolha a cena mais afetiva do dia.');
  assert.strictEqual(await p.textContent('.il-titulo'), 'Instruções da IA');
  await print('6-instrucoes');
  await p.fill('.il-instr-estilo', 'Watercolor, soft light.');
  await p.click('[data-a="salvar-instr"]');
  await p.waitForFunction(() => /Salvo/.test(document.querySelector('.il-instr-msg').textContent));
  assert.deepStrictEqual(chamadas.instrucoesPost[0], { escolha: 'Escolha a cena mais afetiva do dia.', estilo: 'Watercolor, soft light.' });
  await p.click('[data-a="padrao-instr"]');
  await p.waitForFunction(() => /padrão/.test(document.querySelector('.il-instr-msg').textContent));
  assert.deepStrictEqual(chamadas.instrucoesPost[1], { padrao: true });
  assert.strictEqual(await p.inputValue('.il-instr-estilo'), 'A pencil sketch, graphite, paper.');
  await p.click('[data-a="atras"]');   // volta para as ideias, não fecha a tela
  assert.deepStrictEqual(await cartoes(), LOTES[1]);

  // 7. A minha cena: botão só aparece com texto; manda o pedido para a IA escolher/ajustar
  assert.strictEqual(await p.isVisible('[data-a="propria"]'), false);
  await p.fill('.il-propria input', 'o cachorro do vizinho latindo');
  assert.strictEqual(await p.isVisible('[data-a="propria"]'), true);
  await p.click('[data-a="propria"]');
  await p.waitForFunction(() => document.querySelector('.il-espera').hidden && !document.querySelector('.il-quadro img').hidden);
  assert.strictEqual(chamadas.desenho[3].ajuste, 'o cachorro do vizinho latindo');
  assert.match(chamadas.desenho[3].texto, /picanha/);

  // 8. Usar esta: vira a ilustração do dia
  await p.click('[data-a="usar"]');
  await p.waitForFunction((k) => (lerDia(k).ilustracao || {}).foto, K, { timeout: 10000 });
  assert.ok(await p.evaluate((k) => lerDia(k).ilustracao.foto, K));
  assert.deepStrictEqual(erros, []);

  // 9. Sem conexão com a nuvem: mensagem simples
  await ctx.unroute('https://nuvem-falsa.test/**');
  await ctx.route('https://nuvem-falsa.test/**', (rota) => rota.abort());
  await p.evaluate((k) => { dia(k).entrevista.respostas[0] = 'Outra coisa.'; abrirIlustracao(k); }, K);
  await p.waitForSelector('.il-erro');
  assert.match(await p.textContent('.il-erro'), /Sem conexão/);
  await print('7-sem-conexao');

  await nav.close(); srv.close();
  console.log('ilustracao-ideias (tela): ok');
})().catch((e) => { console.error(e); process.exit(1); });
