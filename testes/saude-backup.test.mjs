// Teste do backup com problema no celular: o token recusado fica anotado e vai para a nuvem na troca de tarefas.
// Roda o app num navegador com GitHub e nuvem de mentira. Dados inventados.
// Uso, na pasta do app: python -m http.server 8790  (noutro terminal)  e  node testes/saude-backup.test.mjs
// Precisa do playwright-core: use o do Journal do PC (NODE_PATH para o node_modules de bloco-de-notas-2).
import { createRequire } from 'node:module'
const require = createRequire(process.env.PW_DE || import.meta.url)
const { chromium } = require('playwright-core')

const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) process.exitCode = 1 }
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
await ctx.addInitScript(() => {
  localStorage.setItem('jj-github-token', 'token-inventado')
  localStorage.setItem('jj-nuvem', JSON.stringify({ url: 'https://nuvem.invalid', segredo: 'x' }))
  if (!localStorage.getItem('jj-tarefas')) localStorage.setItem('jj-tarefas', JSON.stringify({
    desde: 0, quando: 0, pend: { c1: 1, c2: 1 },
    lista: { c1: { id: 'c1', titulo: 'Inventada ruim', mudou: 5, etiquetas: [] }, c2: { id: 'c2', titulo: 'Inventada boa', mudou: 5, etiquetas: [] } },
  }))
})
const page = await ctx.newPage()
const pedidos = []
let githubRecusa = true
await page.route('https://api.github.com/**', (r) => (githubRecusa
  ? r.fulfill({ status: 401, json: { message: 'Bad credentials' } })
  : r.fulfill({ status: 200, json: { sha: 'a', content: Buffer.from(JSON.stringify({ dias: {}, memorias: [] })).toString('base64') } })))
await page.route('https://nuvem.invalid/**', async (r) => {
  const u = new URL(r.request().url())
  const cabecalhos = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cabecalhos })
  if (u.pathname !== '/tarefas/sincronizar') return r.fulfill({ status: 200, headers: cabecalhos, json: {} })
  const corpo = r.request().postDataJSON()
  pedidos.push(corpo)
  return r.fulfill({ status: 200, headers: cabecalhos, json: { desde: 1000, tarefas: [], recusadas: corpo.mudancas.some((t) => t.id === 'c1') ? [{ id: 'c1', titulo: 'Inventada ruim', motivo: 'lembrete em formato errado' }] : [] } })
})
const erros = []
page.on('pageerror', (e) => erros.push(e.message))

try {
  await page.goto('http://127.0.0.1:8790/')
  await page.waitForTimeout(1500)
  await page.evaluate(() => sincronizar())
  const anotado = await page.evaluate(() => JSON.parse(localStorage.getItem('jj-saude-backup')))
  ok(/token/.test(anotado?.erro || '') && anotado.desde > 0, 'GitHub recusou o token: o problema fica anotado com a hora')

  await page.evaluate(() => sincronizar())
  const de2 = await page.evaluate(() => JSON.parse(localStorage.getItem('jj-saude-backup')))
  ok(de2.desde === anotado.desde, 'falhar de novo não reinicia o relógio')

  pedidos.length = 0
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(800)
  const pedido = pedidos.at(-1)
  ok(pedido?.aparelho === 'celular', 'o celular se identifica na troca de tarefas')
  ok(/token/.test(pedido?.relatos?.backup?.erro || ''), 'e conta o problema do backup à nuvem')

  const T = await page.evaluate(() => JSON.parse(localStorage.getItem('jj-tarefas')))
  ok(T.pend.c1 && !T.pend.c2, 'tarefa recusada continua pendente; a outra foi')

  await page.evaluate(() => { localStorage.setItem('jj-saude-backup', JSON.stringify({ desde: 1, erro: 'x' })) })
  githubRecusa = false
  await page.evaluate(() => sincronizar())
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => localStorage.getItem('jj-saude-backup'))
  ok(r === null, 'backup voltou a funcionar: a anotação some')

  ok(!erros.length, 'sem erros na página' + (erros.length ? ': ' + erros.join(' | ') : ''))
} finally {
  await browser.close()
}
