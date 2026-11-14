// 2.90.0: pastas nos espaços (Faculdade, Cursos, Notas) e a aba News (todas as edições do JV11).
// Mesma base do journal-4d (nuvem local, dados reais COPIADOS, nada vai para a internet; o JV11 é simulado).
// Uso, na pasta do app do celular:  timeout 400 node testes/pastas-news.test.mjs [--prints]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { APP, subirServidores, prepararPc, nuvemJson, nuvemDoPc, NUVEM, SEGREDO, SENHA, PORTA_APP } from './etapa2-ajuda.mjs'

const PW = process.env.PW_DE || path.resolve(APP, '../../../2026.10.03 Bloco de Notas/01 Projeto/bloco-de-notas-2/package.json')
const { chromium } = createRequire(PW)('playwright-core')
const PRINTS = process.argv.includes('--prints')
const PASTA_PRINTS = path.resolve(APP, '../prints-claude-design/pastas-news')
fs.mkdirSync(PASTA_PRINTS, { recursive: true })
const vigia = setTimeout(() => { console.log('FALHA tempo máximo do teste esgotado'); process.exit(3) }, 360_000)
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) { falhas++; process.exitCode = 1 } }
const URL_APP = `http://127.0.0.1:${PORTA_APP}/`
const DADOS_CEL = JSON.parse(fs.readFileSync(path.resolve(APP, '../registros/dados.json'), 'utf8'))
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()

let browser
try {
  await subirServidores()
  const pc = await prepararPc()
  const { cifra, modulo } = pc
  const naoTracker = [...pc.mem].filter(([, p]) => p.origem?.tipo !== 'tracker')
  const fac = naoTracker.filter(([, p]) => p.espaco === 'faculdade')
  console.log(`Faculdade: ${fac.length} páginas, ${fac.filter(([, p]) => p.pai).length} com pai, ${fac.filter(([, p]) => p.pasta).length} com pasta`)
  const { cofre, chaveDados } = await cifra.criarCofre(SENHA)
  await nuvemJson('/dados/cofre', { cofre })
  await modulo.sincronizar({ chave: await cifra.paraCryptoKey(chaveDados, false), fonte: pc.fonte, nuvem: nuvemDoPc, estado: modulo.estadoVazio(), salvarEstado: async () => {} })

  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.addInitScript(([url, segredo, dados]) => {
    if (!localStorage.getItem('jj-teste-semeado')) {
      localStorage.setItem('jj-teste-semeado', '1')
      localStorage.setItem('johnnys-journal-v1', JSON.stringify(dados))
      localStorage.setItem('jj-nuvem', JSON.stringify({ url, segredo }))
      localStorage.setItem('jj-jv11', JSON.stringify({ k: 'chave-teste' }))
      localStorage.setItem('jj-jv11-lidos', JSON.stringify(['2026-11-12']))
    }
  }, [NUVEM, SEGREDO, DADOS_CEL])
  // JV11 simulado: lista de edições e uma página de boletim
  const datas = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  await ctx.route('https://jv11-news.jvhubert.workers.dev/**', (r) => {
    const u = new URL(r.request().url())
    if (u.pathname === '/b/lista.json') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ edicoes: datas.map((d, i) => ({ data: d, minutos: 5 + (i % 3), manchete: i % 4 ? `Manchete do dia ${d}: o mundo segue girando e alguém decide alguma coisa` : null })) }) })
    if (u.pathname === '/b/hoje.json') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: datas[0], minutos: 5, manchete: 'Manchete de hoje' }) })
    return r.fulfill({ status: 200, contentType: 'text/html', body: `<body style="background:#16191F;color:#eee;font:20px sans-serif;padding:20px">Boletim ${u.pathname}</body>` })
  })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto(URL_APP); await page.waitForTimeout(1500)

  // ---- aba News ----
  ok((await page.$$('.barra button')).length === 4, 'a barra continua com 4 botões')
  await page.click('.barra button[data-tela="journal"]'); await page.waitForSelector('#jor-espacos [data-e="@news"]')
  await page.click('#jor-espacos [data-e="@news"]'); await page.waitForSelector('.news-destaque')
  await page.waitForTimeout(800)
  ok((await page.$$('.news-item')).length === 29, 'News: a edição mais nova em destaque + as outras 29 em lista')
  ok(/30 edições guardadas · 29 sem ler/.test(await page.textContent('#news-resumo')), 'resumo conta as guardadas e as sem ler: ' + await page.textContent('#news-resumo'))
  ok((await page.$$eval('.news-mes', (x) => x.length)) >= 1, 'separada por mês')
  const larg = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  ok(larg[0] <= larg[1], 'sem rolagem lateral na News')
  await page.screenshot({ path: path.join(PASTA_PRINTS, '01-news-390.png') })
  await page.screenshot({ path: path.join(PASTA_PRINTS, '02-news-inteira-390.png'), fullPage: true })
  await page.click('.news-item >> nth=4'); await page.waitForSelector('.boletim iframe')
  ok((await page.getAttribute('.boletim iframe', 'src')).includes('/b/' + datas[5]), 'tocar numa edição antiga abre aquele boletim')
  await page.goBack(); await page.waitForTimeout(500)

  // ---- pastas ----
  await page.click('#jor-espacos [data-e="journal"]'); await page.waitForTimeout(600)
  await page.click('#jor-pc [data-a="abrir"]'); await page.waitForSelector('#pc-senha')
  await page.fill('#pc-senha', SENHA); await page.click('#pc-enviar')
  await page.waitForFunction((m) => { const s = window.JJ_PC?.estado(); return s && !s.sinc.rodando && s.contagem && s.contagem.paginas >= m }, naoTracker.length, { timeout: 180_000 })
  await page.waitForTimeout(800)
  const abas = await page.$$eval('#jor-espacos [role="tab"]', (xs) => xs.map((x) => x.dataset.e))
  ok(abas.slice(-2).join() === '@news,@pessoas', 'News fica logo antes de Pessoas e lugares: ' + abas.join(', '))
  for (const esp of ['faculdade', 'cursos', 'notas']) {
    await page.click(`#jor-espacos [data-e="${esp}"]`); await page.waitForTimeout(1200)
    const chips = await page.$$eval('#jor-filtros button', (xs) => xs.map((x) => x.textContent))
    ok(chips.join() === 'Pastas,Por data,Galeria', `${esp}: chips ${chips.join(', ')}`)
    const pastas = await page.$$eval('.pasta-linha b', (xs) => xs.map((x) => x.textContent))
    console.log(`     ${esp}: ${pastas.length} pastas no topo: ${pastas.slice(0, 8).join(' | ')}`)
    await page.screenshot({ path: path.join(PASTA_PRINTS, `10-${esp}-topo.png`) })
    // desce até uma nota: entra na primeira pasta enquanto houver pasta
    let nivel = 0
    while ((await page.$('.pasta-linha')) && nivel < 6) {
      await page.click('.pasta-linha >> nth=0'); await page.waitForTimeout(700); nivel++
      await page.screenshot({ path: path.join(PASTA_PRINTS, `11-${esp}-nivel${nivel}.png`) })
    }
    if (nivel) {
      const migalhas = await page.$$eval('.pastas-migalha', (xs) => xs.map((x) => x.textContent))
      console.log(`     ${esp}: desceu ${nivel} níveis: ${migalhas.join(' › ')}; ${(await page.$$('#jor-mural .cartao-j')).length} notas ali`)
      ok(migalhas.length === nivel + 1, `${esp}: o caminho mostra onde está`)
      await page.click('.pastas-migalha >> nth=0'); await page.waitForTimeout(600)
      ok(!(await page.$('.pastas-caminho')), `${esp}: tocar no nome do espaço volta ao topo`)
    }
  }
  ok(erros.length === 0, 'nenhum erro de script' + (erros.length ? ': ' + erros[0] : ''))
} catch (err) {
  console.log('FALHA erro no teste:', err.stack || err.message || err)
  falhas++; process.exitCode = 1
} finally {
  clearTimeout(vigia)
  try { await browser?.close() } catch { /* já fechou */ }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
}
