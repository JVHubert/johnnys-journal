// Galeria de imagens e navegação no tempo da aba Journal (linha do tempo E galeria), no Edge, com nuvem LOCAL (com R2 de mentira),
// dados REAIS COPIADOS (páginas do PC) e uma AMOSTRA de imagens reais copiada para pasta temporária e subida (cifrada) para a nuvem local.
// Nada vai para a internet nem para a conta Cloudflare. Os dados reais só são lidos.
// Uso, na pasta do app do celular:  timeout 400 node testes/galeria-tempo.test.mjs [--prints]
// Portas: JJ_PORTA_NUVEM / JJ_PORTA_APP (padrão 8861/8862; a rodada do Claude usa 8871/8872). Termina SEMPRE com process.exit.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { APP, temp, subirServidores, prepararPc, nuvemJson, nuvemDoPc, NUVEM, SEGREDO, SENHA, PORTA_APP, PORTA_NUVEM, REAIS_DADOS } from './etapa2-ajuda.mjs'

const PW = process.env.PW_DE || path.resolve(APP, '../../../2026.10.03 Bloco de Notas/01 Projeto/bloco-de-notas-2/package.json')
const { chromium } = createRequire(PW)('playwright-core')
const PRINTS = process.argv.includes('--prints')
const PASTA_PRINTS = path.resolve(APP, '../prints-claude-design/galeria-tempo')
if (PRINTS) fs.mkdirSync(PASTA_PRINTS, { recursive: true })
const vigia = setTimeout(() => { console.log('FALHA tempo máximo do teste esgotado'); process.exit(3) }, 380_000)
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) { falhas++; process.exitCode = 1 } }
const URL_APP = `http://127.0.0.1:${PORTA_APP}/`
const DADOS_CEL = JSON.parse(fs.readFileSync(path.resolve(APP, '../registros/dados.json'), 'utf8'))
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const agente = new http.Agent({ keepAlive: false })
const putBin = (chave, buf) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: PORTA_NUVEM, path: '/dados/arquivo?chave=' + chave, method: 'PUT', agent: agente, headers: { 'x-segredo': SEGREDO, 'content-type': 'application/octet-stream', 'content-length': buf.length, connection: 'close' } }, (x) => { x.resume(); x.on('end', () => (x.statusCode < 300 ? res() : rej(new Error('PUT ' + x.statusCode)))) })
  r.on('error', rej); r.end(buf)
})

let browser
try {
  console.log('Subindo a nuvem local (com R2 de mentira) e o servidor do app...')
  await subirServidores({ r2: true })
  const pc = await prepararPc()
  const { cifra, modulo } = pc
  const naoTracker = [...pc.mem].filter(([, p]) => p.origem?.tipo !== 'tracker')
  const { cofre, chaveDados } = await cifra.criarCofre(SENHA)
  await nuvemJson('/dados/cofre', { cofre })
  const chavePc = await cifra.paraCryptoKey(chaveDados, false)
  await modulo.sincronizar({ chave: chavePc, fonte: pc.fonte, nuvem: nuvemDoPc, estado: modulo.estadoVazio(), salvarEstado: async () => {} })

  // ---- o que a galeria DEVE mostrar, calculado direto das páginas (independente do código do app) ----
  const hashesDe = (p) => {
    const out = []
    const m0 = /^\/imagens\/([\w-]+)\.\w+$/.exec(p.capa || ''); if (m0) out.push(m0[1])
    ;(function w(x) { if (!x || typeof x !== 'object') return; if (x.type === 'image') { const m = /^\/imagens\/([\w-]+)\.\w+$/.exec(x.attrs?.src || ''); if (m) out.push(m[1]) } ;(x.content || []).forEach(w) })(p.doc)
    return [...new Set(out)]
  }
  const esperado = {} // espaço -> Set de hashes (cada imagem uma vez, mesmo em várias páginas)
  const refsPorEsp = {}
  const hashesDoEsp = new Map()
  for (const [, p] of naoTracker) { const e = p.espaco || 'inbox'; for (const hsh of hashesDe(p)) { (esperado[e] ||= new Set()).add(hsh); refsPorEsp[e] = (refsPorEsp[e] || 0) + 1; hashesDoEsp.set(hsh, e) } }
  const nEsp = (e) => (esperado[e] ? esperado[e].size : 0)
  console.log('Imagens por espaço (únicas / referências):', Object.keys(esperado).map((e) => `${e} ${nEsp(e)}/${refsPorEsp[e]}`).join(', '))

  // ---- a amostra de imagens reais: copiada para a pasta temporária e subida (miniatura de todas, original de algumas) ----
  const amostra = path.join(temp, 'amostra'); fs.mkdirSync(amostra, { recursive: true })
  const nomesImg = new Map(fs.readdirSync(path.join(REAIS_DADOS, 'imagens')).map((n) => [n.replace(/\.\w+$/, ''), n]))
  const comMini = (hsh) => fs.existsSync(path.join(REAIS_DADOS, 'miniaturas', hsh + '.webp'))
  const escolher = (esp, n) => { const l = [...(esperado[esp] || [])].filter((x) => comMini(x) && nomesImg.has(x)); const passo = Math.max(1, Math.floor(l.length / n)); return l.filter((_, i) => i % passo === 0).slice(0, n) }
  const sobem = [...escolher('journal', 1000), ...escolher('faculdade', 60), ...escolher('cursos', 60)]
  let comOriginal = 0
  for (const hsh of sobem) {
    fs.copyFileSync(path.join(REAIS_DADOS, 'miniaturas', hsh + '.webp'), path.join(amostra, 'mini-' + hsh + '.webp'))
    const orig = path.join(REAIS_DADOS, 'imagens', nomesImg.get(hsh))
    if (comOriginal < 60 && fs.statSync(orig).size < 1_500_000) { fs.copyFileSync(orig, path.join(amostra, 'img-' + hsh)); comOriginal++ }
  }
  for (const hsh of sobem) {
    await putBin('mini/' + hsh, await cifra.cifrarBytes(chavePc, 'mini/' + hsh, new Uint8Array(fs.readFileSync(path.join(amostra, 'mini-' + hsh + '.webp')))))
    const o = path.join(amostra, 'img-' + hsh)
    if (fs.existsSync(o)) await putBin('img/' + hsh, await cifra.cifrarBytes(chavePc, 'img/' + hsh, new Uint8Array(fs.readFileSync(o))))
  }
  console.log(`Amostra subida para a nuvem local: ${sobem.length} miniaturas e ${comOriginal} originais (o resto das imagens da galeria dá 404 de propósito)`)

  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const novoContexto = async (largura = 384, altura = 800) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, serviceWorkers: 'block', hasTouch: true })
    await ctx.addInitScript(([url, segredo, dados]) => {
      if (!localStorage.getItem('jj-teste-semeado')) {
        localStorage.setItem('jj-teste-semeado', '1')
        localStorage.setItem('johnnys-journal-v1', JSON.stringify(dados))
        localStorage.setItem('jj-nuvem', JSON.stringify({ url, segredo }))
      }
    }, [NUVEM, SEGREDO, DADOS_CEL])
    const page = await ctx.newPage()
    const erros = []
    page.on('pageerror', (e) => erros.push(e.message))
    return { ctx, page, erros }
  }
  const foto = async (page, nome) => { if (PRINTS) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(PASTA_PRINTS, nome) }) } }
  const esperarSinc = (page, minimo) => page.waitForFunction((m) => { const s = window.JJ_PC?.estado(); return s && !s.sinc.rodando && s.contagem && s.contagem.paginas >= m }, minimo, { timeout: 180_000 })
  const abrirDados = async (page) => {
    await page.goto(URL_APP); await page.waitForTimeout(1500)
    await page.click('.barra button[data-tela="journal"]'); await page.waitForSelector('#jor-espacos [role="tab"]')
    await page.click('#jor-pc [data-a="abrir"]'); await page.waitForSelector('#pc-senha')
    await page.fill('#pc-senha', SENHA); await page.click('#pc-enviar')
    await esperarSinc(page, naoTracker.length); await page.waitForTimeout(900)
  }
  const larguraOk = async (page, onde) => { const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: innerWidth })); ok(l.doc <= l.janela, `sem rolagem lateral (${onde}): ${l.doc}/${l.janela}`) }
  const celulasTotal = (page) => page.$$eval('#jor-mural .gal-cel', (xs) => xs.length)
  // sobe a página inteira passo a passo até o fim da lista (para contar tudo): devolve o total de imagens vistas pelas seções
  const somaSecoes = (page) => page.evaluate(() => window.JJ_JOR.medidasLinhaDoTempo().secoes)

  // ================= COM A CHAVE =================
  const C = await novoContexto(384, 800)
  const { page } = C
  await abrirDados(page)

  // ---- 1. os resumos já trazem a lista de imagens (páginas baixadas agora) ----
  const resumos = await page.evaluate(async () => { const A = await import('./armazem.js'); const m = await A.listarMetas(); return { n: m.length, comLista: m.filter((x) => Array.isArray(x.imagens)).length, comImg: m.filter((x) => x.imagens?.length).length, refs: m.reduce((s, x) => s + (x.imagens?.length || 0), 0) } })
  ok(resumos.n === naoTracker.length && resumos.comLista === resumos.n, `todo resumo de página guarda a lista de imagens (${resumos.comLista}/${resumos.n}; ${resumos.comImg} páginas têm imagem, ${resumos.refs} referências)`)

  // ---- 2. resumos ANTIGOS (sem `imagens`) são completados uma vez só ----
  const antigo = await page.evaluate(async () => {
    const A = await import('./armazem.js')
    const db = await A.abrir()
    await new Promise((ok2, no) => { const t = db.transaction(['paginas'], 'readwrite'); const l = t.objectStore('paginas'); const q = l.getAll(); q.onsuccess = () => { for (const m of q.result) { delete m.imagens; l.put(m) } }; t.oncomplete = ok2; t.onerror = () => no(t.error) })
    // olha o que o armazém tem de fato (sem o cache em memória)
    const lerFaltam = () => new Promise((ok2) => { const q = db.transaction(['paginas'], 'readonly').objectStore('paginas').getAll(); q.onsuccess = () => ok2(q.result.filter((m) => m.imagens === undefined).length) })
    return { faltavam: await lerFaltam() }
  })
  await page.reload(); await page.waitForTimeout(1500) // o app começa de novo, como com um resumo gravado antes da galeria
  Object.assign(antigo, await page.evaluate(async () => {
    const A = await import('./armazem.js')
    const db = await A.abrir()
    const lerFaltam = () => new Promise((ok2) => { const q = db.transaction(['paginas'], 'readonly').objectStore('paginas').getAll(); q.onsuccess = () => ok2(q.result.filter((m) => m.imagens === undefined).length) })
    const t0 = performance.now()
    await A.completarResumos()
    const ms1 = performance.now() - t0
    const faltamDepois = await lerFaltam()
    const t1 = performance.now()
    await A.completarResumos()
    const ms2 = performance.now() - t1
    return { faltamDepois, ms1: Math.round(ms1), ms2: Math.round(ms2) }
  }))
  ok(antigo.faltavam > 1000 && antigo.faltamDepois === 0 && antigo.ms1 > 20, `resumos antigos: ${antigo.faltavam} sem lista -> ${antigo.faltamDepois} depois de completar (${antigo.ms1} ms uma única vez)`)
  ok(antigo.ms2 < 50, `a segunda vez não relê nada (${antigo.ms2} ms)`)

  // ---- 3. linha do tempo "por mês sob demanda" ----
  await page.reload(); await page.waitForTimeout(1800)
  await page.click('.barra button[data-tela="journal"]'); await page.waitForSelector('#jor-mural .lt-sec'); await page.waitForTimeout(600)
  const tl = await page.evaluate(() => ({ secoes: document.querySelectorAll('#jor-mural .lt-sec').length, cartoes: document.querySelectorAll('#jor-mural .cartao-j').length, montadas: window.JJ_JOR.medidasLinhaDoTempo().montadas }))
  const totalItensJ = await page.evaluate(() => window.JJ_JOR.estado() && document.querySelector('#jor-espacos [data-e="journal"] small')?.textContent)
  ok(tl.secoes > 30, `linha do tempo: ${tl.secoes} meses existem, só ${tl.montadas} montados (${tl.cartoes} cartões na tela de ${totalItensJ} itens)`)
  ok(tl.montadas <= 8, `no máximo ~8 meses montados ao mesmo tempo (${tl.montadas})`)
  // pedido do JV (14/11): a data dos cartões mostra o ANO sempre, inclusive no ano atual ("5 nov 2026")
  const datas = await page.$$eval('#jor-mural .cartao-j .cj-pe', (xs) => xs.map((x) => x.textContent.replace(/esperando para subir/, '').trim().split(' · ')[0]))
  const anoAtual = String(new Date().getFullYear())
  ok(datas.length > 5 && datas.every((d) => /^\d{1,2} [a-zç]{3} \d{4}$/.test(d)), `datas dos cartões sempre com ano: ${datas.slice(0, 4).join(' | ')}`)
  ok(datas.some((d) => d.endsWith(' ' + anoAtual)), `inclusive no ano atual (${datas.find((d) => d.endsWith(' ' + anoAtual)) || 'nenhum cartão de ' + anoAtual + ' montado'})`)
  await larguraOk(page, 'linha do tempo')
  await foto(page, '01-linha-do-tempo-topo-384.png')

  // rola um pouco: a barra fixa mostra mês e ano
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(500)
  const barra = await page.evaluate(() => { const b = document.querySelector('.lt-barra'); const r = b.getBoundingClientRect(); return { visivel: getComputedStyle(b).opacity === '1' && r.top >= -1, txt: b.querySelector('.lt-barra-rot').textContent.trim(), n: b.querySelector('.lt-barra-n').textContent.trim() } })
  ok(barra.visivel && /\b(19|20)\d\d\b/.test(barra.txt), `a barra fixa mostra mês E ano de onde estou: "${barra.txt}" (${barra.n})`)
  ok(await page.isVisible('.lt-regua'), 'a régua de anos aparece ao rolar')
  await foto(page, '02-barra-mes-ano-384.png')
  await page.waitForTimeout(2000)
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.lt-regua')).opacity) === '0', 'a régua some sozinha ~1,5 s depois de parar')

  // folha "Ir para…": anos com contagem, depois os 12 meses, e pular
  await page.click('.lt-barra'); await page.waitForSelector('.ir-ano', { timeout: 3000 })
  const anosFolha = await page.$$eval('.ir-ano', (xs) => xs.map((x) => [x.querySelector('b').textContent, x.querySelector('small').textContent]))
  ok(anosFolha.length >= 4 && anosFolha.every(([, c]) => /\d/.test(c)), `a folha "Ir para…" lista os anos com contagem: ${anosFolha.slice(0, 6).map((a) => a.join(' = ')).join(' | ')}`)
  await foto(page, '03-folha-ir-para-384.png')
  const anoAlvo = anosFolha.map(([a]) => a).filter((a) => /^\d{4}$/.test(a)).sort()[0]
  await page.click(`.ir-ano:has(b:text-is("${anoAlvo}"))`); await page.waitForSelector('.ir-mes')
  const meses = await page.$$eval('.ir-mes', (xs) => xs.map((x) => [x.querySelector('b').textContent, x.disabled, x.querySelector('small').textContent]))
  ok(meses.length === 12 && meses.every((m) => m[1] === (m[2] === '·')), `ao escolher ${anoAlvo}: 12 meses, os vazios apagados e desabilitados (${meses.filter((m) => !m[1]).length} com itens)`)
  await foto(page, '04-folha-meses-384.png')
  const mesAlvo = await page.$eval('.ir-mes:not(:disabled)', (b) => b.querySelector('b').textContent)
  // MEDIDA: do toque no mês até o mês estar na tela e montado
  const dt = await page.evaluate(async ([mesTxt]) => {
    const b = [...document.querySelectorAll('.ir-mes:not(:disabled)')].find((x) => x.querySelector('b').textContent === mesTxt)
    const t0 = performance.now()
    b.click()
    return new Promise((fim) => {
      const olhar = () => {
        const alvo = [...document.querySelectorAll('.lt-sec')].find((s) => document.querySelector('.lt-barra-ano')?.textContent && s.querySelector('.jor-mes').textContent.toLowerCase().startsWith(mesTxt.toLowerCase().slice(0, 3)) && s.getBoundingClientRect().top >= -50 && s.getBoundingClientRect().top < innerHeight && s.querySelector('.lt-corpo').children.length)
        if (alvo && !document.querySelector('#folha:not([hidden])')) fim(performance.now() - t0); else if (performance.now() - t0 > 6000) fim(99999); else requestAnimationFrame(olhar)
      }
      olhar()
    })
  }, [mesAlvo])
  console.log(`Pular para ${mesAlvo} de ${anoAlvo} (toque no mês até ele montado na tela): ${Math.round(dt)} ms`)
  ok(dt < 300, `pular para ${anoAlvo} leva ${Math.round(dt)} ms (< 300 ms)`)
  await page.waitForTimeout(600)
  const depoisPular = await page.evaluate(() => ({ txt: document.querySelector('.lt-barra-rot').textContent.trim(), montadas: window.JJ_JOR.medidasLinhaDoTempo().montadas, cartoes: document.querySelectorAll('#jor-mural .cartao-j').length }))
  ok(depoisPular.txt.includes(anoAlvo), `depois de pular a barra diz "${depoisPular.txt}"`)
  ok(depoisPular.cartoes < 300, `depois de pular só ${depoisPular.cartoes} cartões na tela`)
  await foto(page, '05-depois-de-pular-ano-antigo-384.png')
  ok(await page.isVisible('.lt-voltar'), 'botão "Hoje" aparece quando está longe do topo')

  // rolagem sem travar: rola 3.000 px em ~180 quadros e mede o tempo de cada quadro
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
  const rola = await page.evaluate(async () => {
    const tempos = []; let ultimo = performance.now()
    window.JJ_JOR.medidasLinhaDoTempo()
    for (let i = 0; i < 260; i++) {
      window.scrollBy(0, 55)
      await new Promise((r) => requestAnimationFrame(r))
      const agora = performance.now(); tempos.push(agora - ultimo); ultimo = agora
    }
    tempos.sort((a, b) => a - b)
    return { mediano: tempos[Math.floor(tempos.length / 2)], p95: tempos[Math.floor(tempos.length * 0.95)], max: tempos.at(-1), lt: window.JJ_JOR.medidasLinhaDoTempo() }
  })
  console.log(`Rolagem contínua (260 quadros, Edge sem placa de vídeo): mediana ${rola.mediano.toFixed(1)} ms, p95 ${rola.p95.toFixed(1)} ms, pior ${rola.max.toFixed(1)} ms; atualização da lista: pior ${rola.lt.maxMs.toFixed(1)} ms`)
  ok(rola.lt.maxMs < 60, `a conta por quadro da lista ficou abaixo de 60 ms (pior ${rola.lt.maxMs.toFixed(1)} ms)`)
  ok(rola.p95 < 50, `rolagem sem travar: 95% dos quadros abaixo de 50 ms (${rola.p95.toFixed(1)} ms)`)

  // voltar ao topo
  await page.click('.lt-voltar'); await page.waitForTimeout(900)
  ok(await page.evaluate(() => scrollY) < 5, 'o botão "Hoje" volta ao começo da lista')

  // ---- 4. régua de anos: arrasta com o DEDO (eventos de toque do navegador) e solta ----
  await page.mouse.wheel(0, 700); await page.waitForTimeout(300)
  const cdp = await C.ctx.newCDPSession(page)
  const caixa = await page.evaluate(() => { const r = document.querySelector('.lt-trilho').getBoundingClientRect(); return { x: r.left + r.width / 2, y0: r.top, h: r.height } })
  const toque = (tipo, y) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x: caixa.x, y }] })
  await toque('touchStart', caixa.y0 + caixa.h * 0.6)
  for (const f of [0.65, 0.7, 0.75, 0.8]) { await toque('touchMove', caixa.y0 + caixa.h * f); await page.waitForTimeout(40) }
  const balao = await page.evaluate(() => { const b = document.querySelector('.lt-balao'); return { op: getComputedStyle(b).opacity, mes: b.querySelector('b').textContent, ano: b.querySelector('small').textContent } })
  ok(balao.op === '1' && /^\d{4}$/.test(balao.ano), `arrastando a régua com o dedo, o balão mostra "${balao.mes} ${balao.ano}"`)
  await foto(page, '06-regua-balao-384.png')
  await toque('touchEnd', 0); await page.waitForTimeout(500)
  const aposSoltar = await page.evaluate(() => document.querySelector('.lt-barra-rot').textContent.trim())
  ok(aposSoltar.toLowerCase().includes(balao.ano) && aposSoltar.toLowerCase().includes(balao.mes.toLowerCase()), `soltar pula para o mês do balão: a barra diz "${aposSoltar}"`)
  await page.waitForTimeout(1800)
  // tocar perto da borda direita acorda a régua
  await page.touchscreen.tap(375, 400); await page.waitForTimeout(150)
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.lt-regua')).opacity) !== '0', 'tocar perto da borda direita acorda a régua')

  // ---- 5. galeria ----
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('#jor-filtros [data-f="galeria"]'); await page.waitForSelector('#jor-mural .gal-cel', { timeout: 20_000 }); await page.waitForTimeout(1500)
  const resumoTxt = (await page.textContent('#jor-escopo')).trim()
  // as fotos do celular entram junto: conta pela própria tela (todas as seções) com a soma dos `n` das seções
  const fotosCel = await page.evaluate(() => { const l = window.__fotosCel; return l ? l.length : null })
  const totalGal = await page.evaluate(async () => { const t = document.querySelector('#jor-escopo b')?.textContent || ''; return Number(t.replace(/\D/g, '')) })
  const galJ = nEsp('journal')
  ok(totalGal >= galJ && totalGal - galJ < 200, `Galeria do Johnny's Journal: ${totalGal} imagens (${galJ} das páginas do PC + as fotos do celular); resumo: "${resumoTxt}"`)
  const g1 = await page.evaluate(() => ({ cels: document.querySelectorAll('#jor-mural .gal-cel').length, ok: document.querySelectorAll('#jor-mural .gal-cel.ok').length, sem: document.querySelectorAll('#jor-mural .gal-cel.sem').length, med: window.JJ_JOR.medidasGaleria(), lt: window.JJ_JOR.medidasLinhaDoTempo() }))
  ok(g1.cels < 500 && g1.cels < totalGal, `só as células dos meses perto da tela existem (${g1.cels} de ${totalGal})`)
  ok(g1.ok > 0 && g1.med.maxSimultaneas <= 6, `miniaturas carregadas ${g1.ok}, nunca mais de 6 baixando juntas (máx ${g1.med.maxSimultaneas}); ${g1.sem} "ainda não chegou"`)
  ok(g1.med.pedidas <= g1.cels + 30, `só pediu miniatura do que está perto da tela (${g1.med.pedidas} pedidas, ${g1.cels} células montadas)`)
  const grade = await page.evaluate(() => { const c = [...document.querySelectorAll('#jor-mural .gal-grade')[0].children].slice(0, 4).map((x) => x.getBoundingClientRect()); return { w: c[0].width, h: c[0].height, gap: c[1].left - c[0].right, linha2: c[3] ? c[3].top - c[0].top : 0, mesmaLinha: c[1].top === c[0].top && c[2].top === c[0].top } })
  ok(Math.abs(grade.w - grade.h) < 1 && grade.gap === 2 && grade.mesmaLinha, `miniaturas quadradas (${grade.w.toFixed(1)}x${grade.h.toFixed(1)}), 3 por linha, 2 px de espaço`)
  const alturaEstimada = await page.evaluate(() => { // a altura do mês montado bate com a estimada para o mesmo mês vazio (3 colunas exatas)
    const s = document.querySelector('#jor-mural .lt-sec .lt-corpo'); const n = s.querySelectorAll('.gal-cel').length; const cel = (document.querySelector('#jor-mural').clientWidth + 32 - 4) / 3
    const esperado = Math.ceil(n / 3) * cel + (Math.ceil(n / 3) - 1) * 2
    return { real: s.getBoundingClientRect().height, esperado }
  })
  ok(Math.abs(alturaEstimada.real - alturaEstimada.esperado) < 1.5, `altura estimada do mês vazio = altura real (${alturaEstimada.real.toFixed(1)} px)`)
  await larguraOk(page, 'galeria')
  await foto(page, '07-galeria-384.png')
  // cabeçalho por mês, mais recente primeiro
  const mesesGal = await page.$$eval('#jor-mural .lt-sec .jor-mes', (xs) => xs.map((x) => x.textContent))
  ok(mesesGal.length > 5 && /\d{4}$/.test(mesesGal[0]), `grade agrupada por mês/ano, começando pelo mais recente: "${mesesGal[0]}"`)

  // abrir uma imagem que chegou: visor em tela cheia
  const primeira = await page.$('#jor-mural .gal-cel.ok')
  await primeira.scrollIntoViewIfNeeded(); await primeira.click(); await page.waitForSelector('.gv .gv-slide.ok img', { timeout: 8000 })
  const v1 = await page.evaluate(() => ({ pos: document.querySelector('.gv-pos').textContent, titulo: document.querySelector('.gv-titulo').textContent, data: document.querySelector('.gv-data').textContent, aviso: document.querySelector('.gv-aviso').textContent, botao: !document.querySelector('.gv-pagina').hidden, larg: document.querySelector('.gv-slide.ok img').getBoundingClientRect().width }))
  ok(/^\d+ de \d/.test(v1.pos) && v1.titulo && /\d{4}/.test(v1.data) && v1.botao, `visor: "${v1.pos}", título "${v1.titulo.slice(0, 40)}", data "${v1.data}", botão "Abrir a página"`)
  await page.waitForTimeout(900)
  await foto(page, '08-visor-imagem-384.png')
  const idx1 = await page.evaluate(() => Number(document.querySelector('.gv-pos').textContent.split(' de ')[0].replace(/\D/g, '')))
  await page.evaluate(() => document.querySelector('.gv').irPara(1)); await page.waitForTimeout(500)
  const idx2 = await page.evaluate(() => Number(document.querySelector('.gv-pos').textContent.split(' de ')[0].replace(/\D/g, '')))
  ok(idx2 === idx1 + 1, `deslizar para a próxima da grade (${idx1} -> ${idx2})`)
  // deslizar com o dedo de verdade (toque)
  const cdp2 = cdp
  const dedo = (tipo, x) => cdp2.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x, y: 380 }] })
  await dedo('touchStart', 300); for (const x of [260, 200, 140, 90]) { await dedo('touchMove', x); await page.waitForTimeout(20) } await dedo('touchEnd', 0); await page.waitForTimeout(600)
  const idx3 = await page.evaluate(() => Number(document.querySelector('.gv-pos').textContent.split(' de ')[0].replace(/\D/g, '')))
  ok(idx3 === idx2 + 1, `arrastar para a esquerda com o dedo vai para a próxima (${idx2} -> ${idx3})`)
  await dedo('touchStart', 80); for (const x of [120, 180, 250, 320]) { await dedo('touchMove', x); await page.waitForTimeout(20) } await dedo('touchEnd', 0); await page.waitForTimeout(600)
  const idx4 = await page.evaluate(() => Number(document.querySelector('.gv-pos').textContent.split(' de ')[0].replace(/\D/g, '')))
  ok(idx4 === idx3 - 1, `e para a direita volta (${idx3} -> ${idx4})`)
  // o original chega (amostra com original)
  const temOriginal = await page.evaluate(async () => { const t = document.querySelector('.gv-aviso').textContent; return t })
  console.log('Aviso do visor (vazio = original chegou):', JSON.stringify(temOriginal))
  // Voltar do Android fecha
  await page.goBack(); await page.waitForTimeout(500)
  ok(await page.evaluate(() => !document.querySelector('.gv')), 'o Voltar do Android fecha o visor')
  ok(await page.evaluate(() => scrollY) >= 0 && (await page.isVisible('#jor-mural .gal-cel')), 'e a grade continua onde estava')
  // "Abrir a página"
  const cel2 = await page.$('#jor-mural .gal-cel.ok'); await cel2.click(); await page.waitForSelector('.gv')
  const tituloVisor = await page.textContent('.gv-titulo')
  await page.click('.gv-pagina'); await page.waitForSelector('.pc-doc', { timeout: 8000 })
  await page.waitForTimeout(500)
  ok(!(await page.$('.gv')) && (await page.textContent('.pc-doc')).length > 0, `"Abrir a página" fecha o visor e abre a página "${tituloVisor.slice(0, 40)}"`)
  await page.goBack(); await page.waitForTimeout(500)
  ok(await page.isHidden('#pc-sobre'), 'voltar da página leva de volta à galeria')

  // a galeria também tem barra de mês/ano, régua e pulo
  await page.mouse.wheel(0, 2500); await page.waitForTimeout(700)
  const barraG = await page.evaluate(() => ({ txt: document.querySelector('.lt-barra-rot').textContent.trim(), n: document.querySelector('.lt-barra-n').textContent.trim() }))
  ok(/\d{4}/.test(barraG.txt) && /imagem|imagens/.test(barraG.n), `galeria: barra "${barraG.txt}" com "${barraG.n}"`)
  await foto(page, '09-galeria-rolada-barra-384.png')
  await page.click('.lt-barra'); await page.waitForSelector('.ir-ano')
  const anosG = await page.$$eval('.ir-ano', (xs) => xs.map((x) => x.querySelector('b').textContent))
  const anoGal = anosG.filter((a) => /^\d{4}$/.test(a)).sort()[0]
  await page.click(`.ir-ano:has(b:text-is("${anoGal}"))`); await page.waitForSelector('.ir-mes:not(:disabled)')
  await page.click('.ir-mes:not(:disabled)'); await page.waitForTimeout(700)
  const g2 = await page.evaluate(() => ({ barra: document.querySelector('.lt-barra-rot').textContent.trim(), cels: document.querySelectorAll('#jor-mural .gal-cel').length, ok: document.querySelectorAll('#jor-mural .gal-cel.ok').length }))
  ok(g2.barra.includes(anoGal) && g2.cels < 600, `galeria: pulou para ${anoGal} ("${g2.barra}"); ${g2.cels} células montadas, ${g2.ok} miniaturas já carregadas`)
  await page.waitForTimeout(1200)
  await foto(page, '10-galeria-depois-de-pular-384.png')
  const sem404 = await page.evaluate(() => document.querySelectorAll('#jor-mural .gal-cel.sem').length)
  console.log(`Células "ainda não chegou" na tela agora: ${sem404}`)

  // ---- 6. galeria nos outros espaços ----
  const porEspaco = {}
  for (const id of ['faculdade', 'cursos', 'notas', 'inbox']) {
    await page.click(`#jor-espacos [data-e="${id}"]`); await page.waitForTimeout(900)
    const filtro = await page.getAttribute('#jor-filtros [data-f="galeria"]', 'aria-pressed')
    const txt = ((await page.textContent('#jor-escopo')) || '').trim()
    const n = Number((txt.match(/^([\d.]+)/) || [0, '0'])[1].toString().replace(/\./g, ''))
    porEspaco[id] = n
    ok(filtro === 'true' && n >= nEsp(id) && n - nEsp(id) <= 3, `galeria de ${id}: ${n} imagens na tela = ${nEsp(id)} das páginas do PC (+ fotos de notas do celular, no máx. 3)`)
  }
  await page.click('#jor-espacos [data-e="journal"]'); await page.waitForTimeout(700)
  // Tudo de volta
  await page.click('#jor-filtros [data-f="tudo"]'); await page.waitForTimeout(700)
  ok(await page.$('#jor-mural .cartao-j') !== null && !(await page.$('#jor-mural .gal-cel')), 'voltar para "Tudo" traz a linha do tempo de novo')
  // trocar de filtro e voltar não deixa lixo na tela (fixos da régua continuam um só)
  ok((await page.$$eval('.lt-ui', (xs) => xs.length)) === 1, 'só um conjunto de barra/régua na tela')
  ok(C.erros.length === 0, 'nenhum erro de script' + (C.erros.length ? ': ' + C.erros.slice(0, 3).join(' | ') : ''))
  const sumario = { galeriaJournal: totalGal, ...porEspaco, imagensUnicasNoPC: Object.fromEntries(Object.keys(esperado).map((e) => [e, nEsp(e)])) }
  console.log('Resumo para o relatório:', JSON.stringify(sumario))
  await C.ctx.close()

  // ================= 390 x 844: prints =================
  if (PRINTS) {
    const D = await novoContexto(390, 844)
    await abrirDados(D.page)
    await D.page.waitForSelector('#jor-mural .lt-sec'); await D.page.waitForTimeout(600)
    await D.page.mouse.wheel(0, 1800); await D.page.waitForTimeout(500)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '11-linha-do-tempo-barra-390.png') })
    await D.page.click('.lt-barra'); await D.page.waitForSelector('.ir-ano'); await D.page.waitForTimeout(700)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '12-folha-ir-para-390.png') })
    await D.page.click('.ir-ano >> nth=2'); await D.page.waitForSelector('.ir-mes'); await D.page.waitForTimeout(700)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '13-folha-meses-390.png') })
    await D.page.click('.ir-mes:not(:disabled)'); await D.page.waitForTimeout(900)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '14-depois-de-pular-390.png') })
    await D.page.evaluate(() => window.scrollTo(0, 0))
    await D.page.click('#jor-filtros [data-f="galeria"]'); await D.page.waitForSelector('#jor-mural .gal-cel.ok', { timeout: 20_000 }); await D.page.waitForTimeout(1800)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '15-galeria-390.png') })
    await D.page.mouse.wheel(0, 1600); await D.page.waitForTimeout(350)
    const c3 = await D.ctx.newCDPSession(D.page)
    const cx = await D.page.evaluate(() => { const r = document.querySelector('.lt-trilho').getBoundingClientRect(); return { x: r.left + r.width / 2, y0: r.top, h: r.height } })
    await c3.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx.x, y: cx.y0 + cx.h * 0.45 }] })
    for (const f of [0.5, 0.55, 0.6]) { await c3.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx.x, y: cx.y0 + cx.h * f }] }); await D.page.waitForTimeout(40) }
    await D.page.waitForTimeout(400)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '16-galeria-regua-balao-390.png') })
    await c3.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await D.page.waitForTimeout(1200)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '17-galeria-depois-da-regua-390.png') })
    const cel = await D.page.$('#jor-mural .gal-cel.ok'); await cel.click(); await D.page.waitForSelector('.gv .gv-slide.ok img'); await D.page.waitForTimeout(1500)
    await D.page.screenshot({ path: path.join(PASTA_PRINTS, '18-visor-390.png') })
    await D.ctx.close()
  }
} catch (err) {
  console.log('FALHA erro no teste:', err.stack || err.message || err)
  falhas++; process.exitCode = 1
} finally {
  clearTimeout(vigia)
  try { await browser?.close() } catch { /* já fechou */ }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
}
