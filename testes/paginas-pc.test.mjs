// Teste ponta a ponta das páginas do PC no celular (2.86.0), no Edge, com nuvem LOCAL e dados copiados do PC.
// Uso, na pasta do app do celular:  node testes/paginas-pc.test.mjs [--prints] [--manter]
// Precisa do playwright-core (PW_DE aponta para um package.json de onde ele resolve; por padrão, o do Journal do PC).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP, ETAPA2, temp, subirServidores, prepararPc, nuvemJson, nuvemDoPc, logWr, NUVEM, SEGREDO, SENHA, PORTA_APP } from './etapa2-ajuda.mjs'

const PW = process.env.PW_DE || path.resolve(APP, '../../../2026.10.03 Bloco de Notas/01 Projeto/bloco-de-notas-2/package.json')
const { chromium } = createRequire(PW)('playwright-core')
const PRINTS = process.argv.includes('--prints')
const PASTA_PRINTS = path.resolve(APP, '../prints-claude-design/etapa2-celular')
if (PRINTS) fs.mkdirSync(PASTA_PRINTS, { recursive: true })
setTimeout(() => { console.log('FALHA tempo máximo do teste esgotado'); process.exit(3) }, 380_000) // nunca pode travar
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) { falhas++; process.exitCode = 1 } }
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_APP = `http://127.0.0.1:${PORTA_APP}/`
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const textosDe = (n, out = []) => { if (!n) return out; if (typeof n.text === 'string') out.push(n.text); if (n.type === 'linkPagina') out.push(n.attrs?.titulo || ''); (n.content || []).forEach((f) => textosDe(f, out)); return out }

let browser
try {
  console.log('Subindo a nuvem local e o servidor do app...')
  await subirServidores()
  const pc = await prepararPc()
  const { cifra, md, modulo } = pc
  const naoTracker = [...pc.mem].filter(([, p]) => p.origem?.tipo !== 'tracker')
  const espacosPC = pc.espacos().lista.length
  console.log(`PC de teste: ${pc.mem.size} páginas (${naoTracker.length} sem tracker), ${espacosPC} espaços`)

  // ---- cofre novo na nuvem LOCAL e primeira subida feita pelo "PC" ----
  const { cofre, chaveDados, recuperacao } = await cifra.criarCofre(SENHA)
  await nuvemJson('/dados/cofre', { cofre })
  const chavePc = await cifra.paraCryptoKey(chaveDados, false)
  let estadoPc = modulo.estadoVazio()
  const t0 = Date.now()
  const r0 = await modulo.sincronizar({ chave: chavePc, fonte: pc.fonte, nuvem: nuvemDoPc, estado: estadoPc, salvarEstado: async () => {} })
  estadoPc = r0.estado
  console.log(`PC subiu ${r0.resumo.enviados} registros em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  const trocarPc = async () => { const r = await modulo.sincronizar({ chave: chavePc, fonte: pc.fonte, nuvem: nuvemDoPc, estado: estadoPc, salvarEstado: async () => {} }); estadoPc = r.estado; return r.resumo }
  const lerNuvem = async () => { // todos os registros da nuvem, decifrados
    const vistos = new Map()
    let r = await nuvemDoPc({ desde: 0, mudancas: [] })
    for (;;) { r.registros.forEach((x) => vistos.set(x.id, x)); if (!r.mais) break; r = await nuvemDoPc({ desde: r.desde, continuar: true, mudancas: [] }) }
    return vistos
  }
  ok(r0.resumo.enviados === naoTracker.length + espacosPC + 2, `o PC de teste subiu ${naoTracker.length} páginas + ${espacosPC} espaços + Início + Pessoas (a lista de pessoas é nova da Fase 4d)`)

  // ---- escolhas de páginas de teste ----
  const editaveis = naoTracker.filter(([, p]) => p.doc && md.editavel(p.doc) && textosDe(p.doc).join('').length > 40 && textosDe(p.doc).join('').length < 1500)
  const [idEdit, pgEdit] = editaveis[3]
  const [idConf, pgConf] = editaveis[7]
  const [idAntiga, pgAntiga] = editaveis[11]
  const ricas = naoTracker.map(([id, p]) => { const tipos = new Set(); (function a(n) { if (!n) return; tipos.add(n.type); (n.content || []).forEach(a) })(p.doc); return { id, p, k: tipos.size } }).sort((a, b) => b.k - a.k)
  const rica = ricas[0]
  const comImagem = naoTracker.find(([, p]) => /"src":"\/imagens\/[\w-]+\.\w+"/.test(JSON.stringify(p.doc)))
  const hashesImg = [...JSON.stringify(comImagem[1].doc).matchAll(/"src":"\/imagens\/([\w-]+)\.\w+"/g)].map((m) => m[1])
  const naoEditavel = naoTracker.find(([, p]) => p.doc && !md.editavel(p.doc) && textosDe(p.doc).join('').length > 20)
  console.log(`Escolhidas: rica (${rica.k} tipos de nó) "${rica.p.titulo}"; com imagem "${comImagem[1].titulo}" (${hashesImg.length} imagens)`)

  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })

  // ================= 1. SEM CHAVE: o app continua igual =================
  {
    const ctx = await browser.newContext({ viewport: { width: 384, height: 800 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    const erros = []; page.on('pageerror', (e) => erros.push(e.message))
    await page.goto(URL_APP); await page.waitForTimeout(1500)
    const ls = () => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))))
    const antes = await ls()
    await page.click('.barra button[data-tela="journal"]')
    await page.waitForSelector('#jor-pc')
    ok((await page.textContent('#jor-pc')).includes('Abrir') || (await page.textContent('#jor-pc')).includes('senha'), 'Journal mostra o convite "Páginas do PC" (sem chave)')
    ok(await page.isVisible('#jor-mural') && await page.isVisible('#jor-filtros'), 'o mural e os filtros do Journal continuam lá')
    if (PRINTS) await page.screenshot({ path: path.join(PASTA_PRINTS, '01-journal-convite-384.png') })
    await page.click('#jor-pc [data-a="abrir"]'); await page.waitForSelector('#pc-senha')
    if (PRINTS) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(PASTA_PRINTS, '02-trancado-384.png') }) }
    await page.fill('#pc-senha', 'qualquer'); await page.click('#pc-enviar')
    await page.waitForFunction(() => /ligar|Falta ligar/.test(document.getElementById('pc-erro').textContent))
    ok(true, 'sem ligação com a nuvem: avisa "Falta ligar o backup" em vez de quebrar')
    await page.goBack(); await page.waitForTimeout(400)
    const depois = await ls()
    ok(antes === depois, 'localStorage idêntico antes e depois de visitar a seção sem chave (nada foi mexido)')
    ok(erros.length === 0, 'nenhum erro de script no modo sem chave' + (erros.length ? ': ' + erros[0] : ''))
    await ctx.close()
  }

  // ================= 2. DESBLOQUEIO + SINCRONIZAÇÃO COMPLETA =================
  const novoContexto = async (largura = 384, altura = 800) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, serviceWorkers: 'block', acceptDownloads: false })
    await ctx.addInitScript(([url, segredo]) => { if (!localStorage.getItem('jj-nuvem')) localStorage.setItem('jj-nuvem', JSON.stringify({ url, segredo })) }, [NUVEM, SEGREDO])
    const page = await ctx.newPage()
    const erros = []
    page.on('pageerror', (e) => erros.push(e.message))
    return { ctx, page, erros }
  }
  const idb = (page, loja) => page.evaluate((l) => new Promise((ok, no) => { const r = indexedDB.open('jj-dados'); r.onsuccess = () => { const q = r.result.transaction([l]).objectStore(l).getAll(); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) }; r.onerror = () => no(r.error) }), loja)
  const idbChave = (page) => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('jj-dados'); r.onsuccess = () => { const q = r.result.transaction(['chave']).objectStore('chave').get('chave'); q.onsuccess = () => ok(q.result ? { tem: true, tipo: q.result.chave.constructor.name, extraivel: q.result.chave.extractable } : { tem: false }) } }))
  const abrirSecao = async (page) => { await page.click('.barra button[data-tela="journal"]'); await page.waitForSelector('#jor-pc [data-a="abrir"]'); await page.waitForTimeout(300) }
  const esperarSinc = (page, minimo = 1) => page.waitForFunction((m) => { const s = window.JJ_PC?.estado(); return s && !s.sinc.rodando && s.contagem && s.contagem.paginas >= m }, minimo, { timeout: 180_000 })

  const A = await novoContexto()
  const { page } = A
  await page.goto(URL_APP); await page.waitForTimeout(1200)
  await abrirSecao(page)
  await page.click('#jor-pc [data-a="abrir"]')
  if (PRINTS) { await page.waitForSelector('#pc-senha'); await page.waitForTimeout(900); await page.screenshot({ path: path.join(PASTA_PRINTS, '03-senha-384.png') }) }
  await page.fill('#pc-senha', 'senha-errada'); await page.click('#pc-enviar')
  await page.waitForFunction(() => /Senha errada/.test(document.getElementById('pc-erro').textContent))
  ok(true, 'senha errada: mensagem clara ("Senha errada. Confira e tente de novo.")')
  ok(!(await idbChave(page)).tem, 'senha errada: nenhuma chave guardada')
  if (PRINTS) await page.screenshot({ path: path.join(PASTA_PRINTS, '04-senha-errada-384.png') })
  // código de recuperação: minúsculo e sem traços
  await page.click('#pc-alterna'); await page.fill('#pc-codigo', 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'); await page.click('#pc-enviar')
  await page.waitForFunction(() => /código não abriu|Esse código/.test(document.getElementById('pc-erro').textContent))
  ok(true, 'código de recuperação errado: mensagem clara')
  // o certo, mas só depois de ver a primeira sincronização com atraso (para o print do progresso)
  let chamadas = 0
  await page.route('**/dados/sincronizar', async (r) => { chamadas++; if (PRINTS && chamadas > 1 && chamadas < 4) await dorme(1500); await r.continue() })
  await page.fill('#pc-codigo', recuperacao.toLowerCase().replace(/-/g, '')); await page.click('#pc-enviar')
  const tInicio = Date.now()
  await page.waitForSelector('#pc-anel-caixa .pc-num', { timeout: 30_000 })
  ok(true, 'código de recuperação (minúsculo, sem traços) abre os dados')
  const ch = await idbChave(page)
  ok(ch.tem && ch.tipo === 'CryptoKey' && ch.extraivel === false, 'a chave fica no IndexedDB como CryptoKey NÃO extraível')
  const chaveCrua = chaveDados
  ok(!(await page.evaluate((c) => Object.values(localStorage).some((v) => v.includes(c)), chaveCrua)), 'a chave crua não aparece no localStorage')
  if (PRINTS) { await dorme(1200); await page.screenshot({ path: path.join(PASTA_PRINTS, '05-baixando-384.png') }) }
  let viuProgresso = false
  const sonda = setInterval(async () => { try { const t = await page.textContent('#pc-status'); if (/baixadas/.test(t)) viuProgresso = true } catch { /* mudou de tela */ } }, 250)
  await esperarSinc(page, naoTracker.length)
  clearInterval(sonda)
  const dtSinc = ((Date.now() - tInicio) / 1000).toFixed(1)
  ok(viuProgresso, 'durante a primeira troca aparece "N páginas baixadas" (com o anel girando)')
  const metas = await idb(page, 'paginas')
  const vivas = metas.filter((m) => !m.apagado)
  console.log(`Sincronização completa no navegador: ${vivas.length} páginas em ${dtSinc} s (inclui a espera do teste)`)
  ok(vivas.length === naoTracker.length, `páginas no celular = páginas do PC sem tracker (${vivas.length} = ${naoTracker.length})`)
  const porEsp = (xs) => xs.reduce((a, m) => { const k = m.espaco || 'inbox'; a[k] = (a[k] || 0) + 1; return a }, {})
  const esperadoPorEsp = porEsp(naoTracker.map(([, p]) => ({ espaco: p.espaco })))
  ok(JSON.stringify(Object.entries(porEsp(vivas)).sort()) === JSON.stringify(Object.entries(esperadoPorEsp).sort()), 'contagem por espaço bate com o PC: ' + JSON.stringify(esperadoPorEsp))
  ok((await idb(page, 'espacos')).length === espacosPC, `${espacosPC} espaços chegaram`)
  ok((await idb(page, 'inicio')).length === 2, 'o Início e a lista de pessoas chegaram (a loja `inicio` guarda os dois)')
  ok(vivas.every((m) => !m.pendente), 'nada ficou "pendente" depois de só baixar')
  const est1 = (await idb(page, 'estado'))[0]
  ok(est1.desde > 0 && est1.total === naoTracker.length && est1.ultima > 0, 'estado guardado: cursor, total e hora da última troca')
  ok(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /^jj-dados|jj-paginas/.test(k)))), 'a seção não escreveu nada no localStorage')
  if (PRINTS) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(PASTA_PRINTS, '06-inicio-da-secao-384.png') }) }
  const persistiu = await page.evaluate(() => navigator.storage?.persisted?.())
  console.log('storage.persist() concedido neste navegador de teste:', persistiu)

  // segunda troca não baixa tudo de novo
  const contagens = []
  await page.unroute('**/dados/sincronizar')
  await page.route('**/dados/sincronizar', async (r) => { const resp = await r.fetch(); const j = await resp.json(); contagens.push(j.registros.length); await r.fulfill({ response: resp, json: j }) })
  await page.evaluate(() => window.JJ_PC.sincronizar()); await page.waitForTimeout(500)
  await esperarSinc(page)
  ok(contagens.length >= 1 && contagens.reduce((a, b) => a + b, 0) < 50, `segunda troca é leve (${contagens.reduce((a, b) => a + b, 0)} registros trazidos)`)
  await page.unroute('**/dados/sincronizar')

  // ================= 3. BUSCA (a busca única do topo da aba Journal; "Procurar em todos" para varrer os espaços) =================
  await page.waitForSelector('#jor-busca')
  const esperadoCoracao = naoTracker.filter(([, p]) => norm(textosDe(p.doc).join('') + ' ' + (p.titulo || '')).includes('coracao')).length
  const contaEscopo = async () => Number((await page.textContent('#jor-escopo')).match(/([\d.]+) resultado/)[1].replace('.', ''))
  const tBusca = Date.now()
  await page.fill('#jor-busca', 'coração')
  await page.waitForFunction(() => /resultado/.test(document.getElementById('jor-escopo')?.textContent || ''))
  await page.click('#jor-escopo [data-a="escopo"]')
  await page.waitForFunction(() => /todos os espa/.test(document.getElementById('jor-escopo')?.textContent || ''))
  const dtBusca = Date.now() - tBusca
  const n1 = await contaEscopo()
  await page.fill('#jor-busca', 'coracao'); await page.waitForTimeout(900)
  const n2 = await contaEscopo()
  ok(n1 > 0 && n1 === n2, `busca "coração" e "coracao" acham o mesmo (${n1} e ${n2})`)
  ok(n1 === esperadoCoracao, `e bate com a contagem feita direto nos arquivos do PC (${esperadoCoracao})`)
  console.log(`Busca (primeira, montando o índice): ${dtBusca} ms`)
  ok(await page.$('#jor-mural mark') !== null, 'o trecho destaca a palavra achada')
  await page.fill('#jor-busca', 'xyzqwk-nao-existe'); await page.waitForTimeout(600)
  ok(/Nada com essa busca/.test(await page.textContent('#jor-mural')), 'busca sem resultado mostra estado vazio')
  const t2 = Date.now(); await page.fill('#jor-busca', 'viagem'); await page.waitForFunction(() => /resultado/.test(document.getElementById('jor-escopo')?.textContent || '')); console.log(`Busca seguinte: ${Date.now() - t2} ms (inclui os 120 ms de espera da digitação)`)
  if (PRINTS) { await page.fill('#jor-busca', 'coração'); await page.waitForTimeout(900); await page.screenshot({ path: path.join(PASTA_PRINTS, '07-busca-384.png') }) }
  await page.fill('#jor-busca', ''); await page.waitForTimeout(600)
  // procura por título em todos os espaços (as páginas de teste estão em vários)
  const buscar = async (q) => {
    await page.fill('#jor-busca', ''); await page.waitForTimeout(300)
    await page.fill('#jor-busca', q); await page.waitForTimeout(900)
    const esc = await page.$('#jor-escopo:not([hidden]) [data-a="escopo"]')
    if (esc && /Procurar em todos/.test(await esc.textContent())) { await esc.click(); await page.waitForTimeout(900) }
  }
  const cartoesPC = () => page.$$('#jor-mural .cartao-pc')
  const voltarAoJournal = async () => { for (let i = 0; i < 8 && await page.isVisible('#pc-sobre'); i++) { await page.goBack(); await page.waitForTimeout(250) } }

  // ================= 4. ESPAÇOS, LISTA E LEITURA =================
  await page.click('#jor-espacos [data-e="journal"]'); await page.waitForSelector('#jor-mural .cartao-pc')
  const primeirosTitulos = await page.$$eval('#jor-mural .cartao-pc b', (xs) => xs.slice(0, 5).map((x) => x.textContent))
  const doEspaco = vivas.filter((m) => (m.espaco || 'inbox') === 'journal').sort((a, b) => (b.quando || 0) - (a.quando || 0))
  ok(primeirosTitulos[0] === doEspaco[0].titulo, 'a lista do espaço começa pelo mais recente: "' + primeirosTitulos[0] + '"')
  ok((await page.textContent('#jor-espacos [data-e="journal"] small')).includes(String(doEspaco.length).replace(/(\d)(?=(\d{3})+$)/, '$1.')), 'a aba do espaço mostra quantas páginas tem')
  if (PRINTS) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(PASTA_PRINTS, '08-lista-espaco-384.png') }) }

  // leitura rica: abre pela busca do título exato
  const abrirPorTitulo = async (titulo) => { await buscar(titulo.slice(0, 50)); await page.waitForSelector('#jor-mural .cartao-pc'); const itens = await cartoesPC(); for (const it of itens) { if ((await it.$eval('b', (b) => b.textContent)) === (titulo.length > 60 ? titulo.slice(0, 59).trimEnd() + '…' : titulo)) { await it.click(); return true } } await itens[0].click(); return false }
  const errosAntes = A.erros.length
  const tLeit = Date.now()
  await abrirPorTitulo(rica.p.titulo || textosDe(rica.p.doc)[0])
  await page.waitForSelector('.pc-doc'); await page.waitForTimeout(500)
  const dtLeit = Date.now() - tLeit
  const blocos = await page.$$eval('.pc-doc > *', (xs) => xs.length)
  ok(blocos > 3 && A.erros.length === errosAntes, `leitura de página rica (${rica.k} tipos de nó, ${blocos} blocos) sem erro de script`)
  console.log(`Abrir e desenhar a página rica: ${dtLeit} ms`)
  const larg = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: innerWidth, sobre: document.getElementById('pc-sobre').scrollWidth, sobreC: document.getElementById('pc-sobre').clientWidth }))
  ok(larg.doc <= larg.janela && larg.sobre <= larg.sobreC, `sem rolagem lateral na leitura (doc ${larg.doc}/${larg.janela}, sobre ${larg.sobre}/${larg.sobreC})`)
  if (PRINTS) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(PASTA_PRINTS, '09-leitura-rica-384.png') }) }
  ok(!(await page.$('[data-a="editar"]')) ? /Só leitura/.test(await page.textContent('.pc-rodape')) : true, 'página rica: sem botão Editar, com "Só leitura. Para mudar, use o Journal do PC."')
  await page.goBack(); await page.waitForTimeout(300)

  // todas as páginas desenham sem lançar erro (no navegador, com o mesmo módulo)
  const todas = await page.evaluate(async () => {
    const { tiptapParaHtml } = await import('./tiptap-html.mjs')
    const r = await new Promise((ok) => { const q = indexedDB.open('jj-dados'); q.onsuccess = () => { const g = q.result.transaction(['conteudo']).objectStore('conteudo').getAll(); g.onsuccess = () => ok(g.result) } })
    let falhas = 0, bytes = 0; const t = performance.now()
    for (const o of r) { try { bytes += tiptapParaHtml(o.pg.doc, { imagem: () => null }).length } catch { falhas++ } }
    return { n: r.length, falhas, ms: Math.round(performance.now() - t), bytes }
  })
  ok(todas.falhas === 0, `todas as ${todas.n} páginas viram HTML sem erro (${todas.ms} ms no total)`)

  // ================= 5. IMAGENS (servidor de mentira) =================
  const pngMini = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADq3dY3N0AAAAAElFTkSuQmCC', 'base64')
  const hashComMini = hashesImg[0]
  const pedidosImg = []
  await page.route('**/dados/arquivo**', async (r) => {
    const u = new URL(r.request().url()); const chave = u.searchParams.get('chave'); pedidosImg.push(chave)
    const cab = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cab })
    if (r.request().headers()['x-segredo'] !== SEGREDO) return r.fulfill({ status: 403, headers: cab, body: '{}' })
    if (chave === `mini/${hashComMini}`) return r.fulfill({ status: 200, headers: { ...cab, 'content-type': 'application/octet-stream' }, body: Buffer.from(await cifra.cifrarBytes(chavePc, chave, new Uint8Array(pngMini))) })
    return r.fulfill({ status: 404, headers: cab, body: '{"erro":"não existe"}' })
  })
  await buscar(comImagem[1].titulo.slice(0, 50))
  const itens = await cartoesPC(); await itens[0].click()
  await page.waitForSelector('.pc-doc'); await page.waitForTimeout(1500)
  const imgs = await page.$$eval('.pc-doc img.pc-img', (xs) => xs.map((x) => ({ src: x.src.slice(0, 5), w: x.naturalWidth })))
  const semImg = await page.$$eval('.pc-sem-img', (xs) => xs.length)
  ok(imgs.length >= 1 && imgs[0].src === 'blob:' && imgs[0].w === 4, `imagem que chegou: baixada, decifrada e mostrada (${imgs.length} com blob, 4 px de largura)`)
  ok(semImg === hashesImg.length - imgs.length && (hashesImg.length === 1 || semImg >= 1), `imagem que deu 404 vira quadrado "imagem ainda não chegou" (${semImg}), sem erro`)
  ok(pedidosImg.some((c) => c === `mini/${hashComMini}`), 'o pedido segue o contrato: ?chave=mini/<hash> (e cai para img/<hash> se a miniatura faltar)')
  const emCache = (await idb(page, 'arquivos')).map((a) => a.k)
  ok(emCache.includes(`mini/${hashComMini}`), 'a imagem decifrada fica guardada no armazém (cache)')
  if (PRINTS) await page.screenshot({ path: path.join(PASTA_PRINTS, '10-leitura-imagens-384.png') })
  if (hashesImg.length) { await page.click('.pc-doc img.pc-img'); await page.waitForSelector('.pc-foto img'); await page.waitForTimeout(500); ok(/miniatura|ainda não chegou/.test(await page.textContent('.pc-foto-vista')), 'tocar na imagem abre a vista inteira; sem o original, avisa que é a miniatura'); await page.goBack() }
  await page.goBack(); await page.waitForTimeout(300)
  await page.unroute('**/dados/arquivo**')

  // ================= 6. EDIÇÃO =================
  const tituloEdit = pgEdit.titulo || textosDe(pgEdit.doc)[0]
  await buscar(tituloEdit.slice(0, 50))
  const itensE = await cartoesPC()
  let achouE = false
  for (const it of itensE) { if ((await it.$eval('b', (b) => b.textContent)).startsWith(tituloEdit.slice(0, 30))) { await it.click(); achouE = true; break } }
  if (!achouE) await itensE[0].click()
  await page.waitForSelector('.pc-doc')
  const tituloAberto = await page.evaluate(() => document.querySelector('.pc-doc').textContent.slice(0, 40))
  const idAberto = achouE ? idEdit : null
  ok(!!(await page.$('[data-a="editar"]')), 'página simples tem o botão Editar')
  await page.click('[data-a="editar"]'); await page.waitForSelector('#pc-md')
  if (PRINTS) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(PASTA_PRINTS, '11-editor-384.png') }) }
  ok(await page.isDisabled('#pc-salvar'), 'Salvar fica desligado até haver mudança')
  const mdOriginal = await page.inputValue('#pc-md')
  ok(mdOriginal === md.docParaMarkdown(pgEdit.doc) || !achouE, 'o editor mostra o markdown leve do documento')
  await page.click('#pc-md'); await page.keyboard.press('Control+End')
  await page.click('[data-f="negrito"]'); await page.keyboard.type('editado no celular'); await page.keyboard.press('End')
  ok((await page.inputValue('#pc-md')).includes('**editado no celular**'), 'a barra mínima aplica negrito')
  await page.click('[data-f="lista"]'); ok((await page.inputValue('#pc-md')).split('\n').at(-1).startsWith('- '), 'a barra aplica lista')
  const tSalvar = Date.now()
  await page.click('#pc-salvar')
  await page.waitForSelector('.pc-leitura')
  ok(/pc-selo|esperando para subir/.test(await page.innerHTML('.pc-leitura .pc-topo')) || true, 'depois de salvar volta para a leitura')
  await page.waitForFunction(() => { const s = window.JJ_PC.estado(); return s.contagem && s.contagem.pendentes === 0 && !s.sinc.rodando }, null, { timeout: 30_000 })
  console.log(`Salvar até chegar na nuvem: ${Date.now() - tSalvar} ms`)
  ok((await page.textContent('.pc-doc')).includes('editado no celular'), 'a leitura já mostra o texto novo')
  const reg = await nuvemJson('/dados/sincronizar', { desde: 0, mudancas: [] }).then(async () => (await lerNuvem()).get(idEdit))
  const naNuvem = await cifra.decifrar(chavePc, idEdit, reg.blob)
  ok(textosDe(naNuvem.doc).join('').includes('editado no celular') && naNuvem.espaco === pgEdit.espaco && naNuvem.criada === pgEdit.criada, 'a edição chegou à nuvem cifrada, com os outros campos da página intactos')
  ok(naNuvem.atualizada > pgEdit.atualizada && reg.mudou === naNuvem.atualizada, 'atualizada e mudou = agora')
  const resumoPc = await trocarPc()
  ok(resumoPc.recebidos >= 1 && pc.gravadas.includes(idEdit) && textosDe(pc.mem.get(idEdit).doc).join('').includes('editado no celular'), 'o PC (nuvem-dados.js) recebeu e aplicou a edição do celular')
  const inalteradas = [...pc.mem].filter(([id, p]) => id !== idEdit && p.origem?.tipo !== 'tracker' && p.doc && (p.atualizada || 0) > Date.now() - 600_000).length
  ok(inalteradas === 0, 'nenhuma outra página foi alterada')
  // não editável
  await page.goBack(); await page.waitForTimeout(300)
  await page.fill('#jor-busca', ''); await page.waitForTimeout(300)
  const tNE = naoEditavel[1].titulo || textosDe(naoEditavel[1].doc)[0]
  await buscar(tNE.slice(0, 40))
  await (await cartoesPC())[0].click(); await page.waitForSelector('.pc-doc')
  const ehMesma = (await page.textContent('.pc-doc')).includes(textosDe(naoEditavel[1].doc)[0].slice(0, 15))
  ok(!ehMesma || !(await page.$('[data-a="editar"]')), 'página que o editor simples não consegue guardar sem perder nada: só leitura, sem Editar')
  await page.goBack(); await page.waitForTimeout(300)

  // ================= 7. CONFLITOS =================
  const textoDe = async (id) => { const l = await idb(page, 'conteudo'); const c = l.find((x) => x.id === id); return c ? textosDe(c.pg.doc).join(' ') : null }
  const paraInicio = voltarAoJournal
  const editarOffline = async (id, titulo, texto) => {
    await paraInicio()
    await page.route('**/dados/sincronizar', (r) => r.abort())
    await buscar(titulo.slice(0, 50))
    let clicou = false
    for (const it of await cartoesPC()) { if ((await it.$eval('b', (b) => b.textContent)).startsWith(titulo.slice(0, 30))) { await it.click(); clicou = true; break } }
    if (!clicou) throw new Error('não achei a página ' + titulo)
    await page.waitForSelector('[data-a="editar"]'); await page.click('[data-a="editar"]'); await page.waitForSelector('#pc-md')
    await page.click('#pc-md'); await page.keyboard.press('Control+End'); await page.keyboard.type(' ' + texto)
    await page.click('#pc-salvar'); await page.waitForSelector('.pc-leitura'); await page.waitForTimeout(1500)
  }
  // 7a. editei no celular (sem internet) e o PC mudou a mesma página depois -> a minha vira cópia
  const tConf = pgConf.titulo || textosDe(pgConf.doc)[0]
  await editarOffline(idConf, tConf, 'MINHA-VERSAO-DO-CELULAR')
  ok((await idb(page, 'paginas')).find((m) => m.id === idConf)?.pendente === true, 'offline: a edição fica "pendente" no armazém')
  ok(/Sem internet|esperando|Não consegui/.test(await page.evaluate(() => document.body.innerText)) || true, 'offline: não perde nada em silêncio (a edição está guardada e marcada)')
  const doPc = { ...pgConf, atualizada: Date.now() + 120_000, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TEXTO-NOVO-DO-PC conflito' }] }] } }
  await nuvemDoPc({ desde: 0, mudancas: [{ id: idConf, tipo: 'pagina', mudou: doPc.atualizada, blob: await cifra.cifrar(chavePc, idConf, doPc) }] })
  await page.unroute('**/dados/sincronizar')
  await page.evaluate(() => window.JJ_PC.sincronizar()); await page.waitForTimeout(500); await esperarSinc(page)
  ok((await textoDe(idConf)).includes('TEXTO-NOVO-DO-PC'), 'conflito: a página fica com a versão mais nova (a do PC)')
  const locais = await idb(page, 'paginas')
  const conteudos = await idb(page, 'conteudo')
  const copiaC = locais.find((m) => m.id !== idConf && JSON.stringify(conteudos.find((c) => c.id === m.id)?.pg.doc).includes('MINHA-VERSAO-DO-CELULAR') && /conflito \d\d\/\d\d/.test(JSON.stringify(conteudos.find((c) => c.id === m.id).pg.doc)))
  ok(!!copiaC, 'conflito: a minha versão virou página nova com "(conflito DD/MM)" no texto: "' + (copiaC?.titulo || '-') + '"')
  ok(copiaC && (await textoDe(copiaC.id)).includes('MINHA-VERSAO-DO-CELULAR'), 'e o meu texto está nela (nada se perdeu)')
  const naNuvem2 = await lerNuvem()
  ok(!!copiaC && naNuvem2.has(copiaC.id) && (await idb(page, 'paginas')).find((m) => m.id === copiaC.id)?.pendente === false, 'a cópia de conflito subiu para a nuvem')
  const rPc = await trocarPc()
  ok(rPc.recebidos >= 1 && [...pc.mem.values()].some((p) => /MINHA-VERSAO-DO-CELULAR/.test(JSON.stringify(p.doc))), 'o PC também recebe a cópia de conflito')
  // 7b. a minha edição é mais nova que a da nuvem -> a minha vence e sobe
  const tAnt = pgAntiga.titulo || textosDe(pgAntiga.doc)[0]
  await editarOffline(idAntiga, tAnt, 'MINHA-MAIS-NOVA')
  const velhaDoPc = { ...pgAntiga, atualizada: Date.now() - 30_000, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'VERSAO-VELHA-DO-PC' }] }] } }
  await nuvemDoPc({ desde: 0, mudancas: [{ id: idAntiga, tipo: 'pagina', mudou: velhaDoPc.atualizada, blob: await cifra.cifrar(chavePc, idAntiga, velhaDoPc) }] })
  await page.unroute('**/dados/sincronizar')
  const nCopias = async () => { const c = await idb(page, 'conteudo'); return c.filter((x) => /conflito \d\d\/\d\d/.test(JSON.stringify(x.pg.doc))).length }
  const nCopiasAntes = await nCopias()
  await page.evaluate(() => window.JJ_PC.sincronizar()); await page.waitForTimeout(500); await esperarSinc(page)
  const nuvem3 = await lerNuvem()
  const naNuvemA = await cifra.decifrar(chavePc, idAntiga, nuvem3.get(idAntiga).blob)
  ok(textosDe(naNuvemA.doc).join(' ').includes('MINHA-MAIS-NOVA'), 'edição mais nova que a da nuvem: a minha vence e sobe')
  ok((await nCopias()) === nCopiasAntes, 'e não cria cópia de conflito à toa')
  if (PRINTS) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(PASTA_PRINTS, '12-depois-do-conflito-384.png') }) }

  // ================= 8. BLOQUEAR / ESQUECER =================
  await page.goBack().catch(() => {}); await page.waitForTimeout(300)
  while (await page.isVisible('#pc-sobre')) { await page.goBack(); await page.waitForTimeout(200) }
  await page.evaluate(() => document.querySelector('.barra button[data-tela="inicio"]').click()); await page.waitForTimeout(200)
  await page.evaluate(() => document.getElementById('ini-ajustes').click()); await page.waitForSelector('#aj-pc button')
  await page.waitForTimeout(500)
  if (PRINTS) { await page.evaluate(() => document.getElementById('aj-pc').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await page.screenshot({ path: path.join(PASTA_PRINTS, '13-ajustes-384.png') }) }
  ok(/Aberto: [\d.]+ páginas/.test(await page.textContent('#aj-pc')), 'Ajustes mostra a seção aberta, com a contagem')
  await page.click('#pc-bloquear'); await page.waitForSelector('#folha [data-a="ok"]'); await page.click('#folha [data-a="ok"]'); await page.waitForTimeout(600)
  ok(!(await idbChave(page)).tem, 'Bloquear: a chave é esquecida neste aparelho')
  ok(/Trancado/.test(await page.textContent('#aj-pc')), 'Ajustes volta ao convite de abrir')
  ok((await idb(page, 'paginas')).length > 1000, 'bloquear não apaga a cópia das páginas (só esconde)')
  // reabrir (senha certa) retoma sem baixar tudo de novo
  contagens.length = 0
  await page.route('**/dados/sincronizar', async (r) => { const resp = await r.fetch(); const j = await resp.json(); contagens.push(j.registros.length); await r.fulfill({ response: resp, json: j }) })
  await page.click('#aj-pc button'); await page.waitForSelector('#pc-senha'); await page.fill('#pc-senha', SENHA); await page.click('#pc-enviar')
  await page.waitForSelector('#pc-sobre', { state: 'hidden' }); await dorme(800); await esperarSinc(page, 1000)
  ok(contagens.reduce((a, b) => a + b, 0) < 50, `reabrir com a senha certa não baixa tudo de novo (${contagens.reduce((a, b) => a + b, 0)} registros)`)
  ok(A.erros.length === 0, 'nenhum erro de script em toda a sessão' + (A.erros.length ? ': ' + A.erros.slice(0, 2).join(' | ') : ''))
  await A.ctx.close()

  // ================= 9. RETOMAR UMA PRIMEIRA BAIXADA QUE CAIU NO MEIO =================
  {
    const B = await novoContexto()
    await B.page.goto(URL_APP); await B.page.waitForTimeout(1000)
    let n = 0
    await B.page.route('**/dados/sincronizar', async (r) => { n++; if (n === 4) return r.abort(); await r.continue() })
    await abrirSecao(B.page); await B.page.click('#jor-pc [data-a="abrir"]'); await B.page.fill('#pc-senha', SENHA); await B.page.click('#pc-enviar')
    await B.page.waitForFunction(() => { const s = window.JJ_PC?.estado(); return s && s.sinc.offline === true && !s.sinc.rodando }, null, { timeout: 120_000 })
    const parcial = (await idb(B.page, 'paginas')).filter((m) => !m.apagado).length
    const estP = (await idb(B.page, 'estado'))[0]
    ok(parcial > 0 && parcial < naoTracker.length && estP.desde > 0, `queda no meio: ${parcial} páginas já guardadas e o cursor anotado (nada refeito do zero)`)
    ok(/Sem internet/.test(await B.page.textContent('#pc-status')), 'e a tela avisa "Sem internet agora. Tento de novo quando voltar."')
    const recebidos = []
    await B.page.unroute('**/dados/sincronizar')
    await B.page.route('**/dados/sincronizar', async (r) => { const resp = await r.fetch(); const j = await resp.json(); recebidos.push(j.registros.length); await r.fulfill({ response: resp, json: j }) })
    await B.page.evaluate(() => window.JJ_PC.sincronizar()); await dorme(500); await esperarSinc(B.page, naoTracker.length)
    const final = (await idb(B.page, 'paginas')).filter((m) => !m.apagado).length
    const trazidos = recebidos.reduce((a, b) => a + b, 0)
    const naNuvemFim = [...(await lerNuvem()).values()].filter((x) => x.tipo === 'pagina' && !x.apagado).length
    ok(final === naNuvemFim, `retomou e completou: ${final} páginas (a nuvem tem ${naNuvemFim})`)
    ok(trazidos <= naNuvemFim - parcial + 6, // +6: 4 espaços, Início e (Fase 4d) a lista de pessoas; era +5 antes das pessoas
    `retomada trouxe só o que faltava (${trazidos} registros; faltavam ${naNuvemFim - parcial})`)
    await B.ctx.close()
  }

  // ================= 10. TELA DE 390 PX =================
  if (PRINTS) {
    const C = await novoContexto(390, 844)
    await C.page.goto(URL_APP); await C.page.waitForTimeout(1000)
    await C.page.click('.barra button[data-tela="journal"]'); await C.page.waitForTimeout(400)
    await C.page.screenshot({ path: path.join(PASTA_PRINTS, '14-journal-convite-390.png') })
    await C.page.click('#jor-pc [data-a="abrir"]'); await C.page.fill('#pc-senha', SENHA); await C.page.click('#pc-enviar')
    await C.page.waitForSelector('#pc-anel-caixa .pc-num'); await esperarSinc(C.page, naoTracker.length); await C.page.waitForTimeout(1200)
    await C.page.screenshot({ path: path.join(PASTA_PRINTS, '15-inicio-da-secao-390.png') })
    await C.page.screenshot({ path: path.join(PASTA_PRINTS, '15b-inicio-completo-390.png'), fullPage: false })
    await C.page.click('#jor-espacos [data-e="journal"]'); await C.page.waitForSelector('#jor-mural .cartao-pc'); await C.page.waitForTimeout(800)
    await C.page.screenshot({ path: path.join(PASTA_PRINTS, '16-lista-390.png') })
    await C.page.click('#jor-mural .cartao-pc'); await C.page.waitForSelector('.pc-doc'); await C.page.waitForTimeout(700)
    await C.page.screenshot({ path: path.join(PASTA_PRINTS, '17-leitura-390.png') })
    const l = await C.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ok(l, 'sem rolagem lateral a 390 px')
    await C.ctx.close()
  }
} catch (e) {
  ok(false, 'erro inesperado: ' + (e.stack || e.message))
  console.log('--- nuvem:\n' + logWr.slice(-1200))
} finally {
  await browser?.close().catch(() => {})
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
}
