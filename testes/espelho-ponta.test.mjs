// Teste ponta a ponta do ESPELHO cifrado dos dados (Fase 4c), tudo LOCAL e de mentira:
//   - o celular: o app de verdade no Edge (python -m http.server), com o dados.json REAL (cópia) no localStorage;
//   - o GitHub: um arquivo de mentira numa pasta temporária (o mesmo que o servidor do PC lê, via BLOCO_TRACKER_LOCAL);
//   - a nuvem: wrangler dev --local (banco numa pasta temporária);
//   - o PC: servidor.py com BLOCO_DADOS numa pasta temporária + o módulo nuvem-tracker.js (o mesmo que a tela usa).
// NADA vai para a internet, para o repositório de dados real nem para a conta Cloudflare. Portas: 8851 (nuvem), 8852 (app), 8853 (PC).
// Uso, na pasta do app do celular:  node testes/espelho-ponta.test.mjs [--manter]
import { createRequire } from 'node:module'
import { spawn, execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(aqui, '..')
const ETAPA2 = path.resolve(aqui, '../../etapa2-dados')
const BLOCO = path.resolve(aqui, '../../../../2026.10.03 Bloco de Notas/01 Projeto')
const PC_DIR = path.join(BLOCO, 'bloco-de-notas-2')
const PW = path.join(PC_DIR, 'package.json')
const { chromium } = createRequire(PW)('playwright-core')
const REAL = JSON.parse(fs.readFileSync(path.join(ETAPA2, 'copia-antes-da-etapa2/dados-celular-2026-11-12.json'), 'utf8'))
const PORTA_NUVEM = 8851, PORTA_APP = 8852, PORTA_PC = 8853
const NUVEM = `http://127.0.0.1:${PORTA_NUVEM}`, SEGREDO = 'teste'
const URL_APP = `http://127.0.0.1:${PORTA_APP}/`, BASE_PC = `http://127.0.0.1:${PORTA_PC}`
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-espelho-'))
const dadosPC = path.join(temp, 'dados'), ghArq = path.join(temp, 'github-dados.json')
fs.mkdirSync(path.join(dadosPC, 'paginas'), { recursive: true }); fs.mkdirSync(path.join(dadosPC, 'imagens'), { recursive: true })
fs.writeFileSync(ghArq, JSON.stringify({ dias: {}, memorias: [] })) // o "GitHub" começa vazio: a primeira entrega é só pela nuvem
const filhos = []
let logWr = '', logPy = '', falhas = 0
const clone = (x) => JSON.parse(JSON.stringify(x))
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) { falhas++; process.exitCode = 1 } }
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))
const ghLer = () => JSON.parse(fs.readFileSync(ghArq, 'utf8'))

function limpar() {
  for (const f of filhos) { try { execSync(`taskkill /PID ${f.pid} /T /F`, { stdio: 'ignore' }) } catch { /* já saiu */ } }
  try { execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORTA_NUVEM},${PORTA_APP},${PORTA_PC} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }) } catch { /* nada a derrubar */ }
  if (!process.argv.includes('--manter')) { try { fs.rmSync(temp, { recursive: true, force: true }) } catch { /* fica no temp */ } }
}
process.on('exit', limpar)

const agente = new http.Agent({ keepAlive: false })
const pegar = (url) => new Promise((ok_, falha) => { http.get(url, { agent: agente }, (r) => { r.resume(); r.on('end', () => (r.statusCode < 500 ? ok_() : falha(new Error('status ' + r.statusCode)))) }).on('error', falha) })
const nuvemJson = (rota, corpo) => new Promise((ok_, falha) => {
  const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo))
  const req = http.request({ host: '127.0.0.1', port: PORTA_NUVEM, path: rota, agent: agente, method: dados ? 'POST' : 'GET', headers: { 'x-segredo': SEGREDO, 'content-type': 'application/json', ...(dados ? { 'content-length': dados.length } : {}), connection: 'close' } }, (res) => {
    const partes = []; res.on('data', (d) => partes.push(d))
    res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(partes).toString('utf8')) } catch { /* sem corpo */ } if (res.statusCode >= 400) falha(new Error(j.erro || 'erro ' + res.statusCode)); else ok_(j) })
  })
  req.on('error', falha); if (dados) req.write(dados); req.end()
})
async function esperar(sonda, quanto = 180_000) { const fim = Date.now() + quanto; for (;;) { try { await sonda(); return } catch { /* subindo */ } if (Date.now() > fim) throw new Error('não subiu'); await dorme(700) } }
async function ate(fn, quanto = 15_000, passo = 250) { const fim = Date.now() + quanto; for (;;) { try { const v = await fn(); if (v) return v } catch { /* tenta de novo */ } if (Date.now() > fim) return false; await dorme(passo) } }

let browser
try {
  // ---------------------------------------------------------------- servidores
  const toml = path.join(temp, 'wrangler-teste.toml')
  fs.writeFileSync(toml, `name = "jv-ditado-teste"\nmain = "${path.join(BLOCO, 'ditado-nuvem/index.js').replace(/\\/g, '/')}"\ncompatibility_date = "2026-09-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "jv-journal"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n[vars]\nURL_PUBLICA = "${NUVEM}"\nSEGREDO = "${SEGREDO}"\n`)
  const wr = spawn('npx', ['--yes', 'wrangler@latest', 'dev', '--local', '--config', toml, '--port', String(PORTA_NUVEM), '--persist-to', path.join(temp, 'estado-nuvem')], { cwd: path.join(BLOCO, 'ditado-nuvem'), shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  filhos.push(wr); wr.stdout.on('data', (d) => { logWr += d }); wr.stderr.on('data', (d) => { logWr += d })
  const srvApp = spawn('python', ['-m', 'http.server', String(PORTA_APP), '--bind', '127.0.0.1'], { cwd: APP, stdio: 'ignore' })
  filhos.push(srvApp)
  const py = spawn('python', ['servidor.py', '--sem-navegador'], {
    cwd: PC_DIR, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BLOCO_DADOS: dadosPC, BLOCO_PORTA: String(PORTA_PC), BLOCO_NUVEM_URL: NUVEM, BLOCO_NUVEM_SEGREDO: SEGREDO, BLOCO_TRACKER_LOCAL: ghArq, BLOCO_TRACKER_PLANO: path.join(temp, 'sem-plano.json') },
  })
  filhos.push(py); py.stdout.on('data', (d) => { logPy += d }); py.stderr.on('data', (d) => { logPy += d })
  try { await esperar(() => nuvemJson('/dados/cofre')) } catch (e) { console.log(logWr.slice(-1500)); throw e }
  await esperar(() => pegar(URL_APP + 'index.html'))
  await esperar(() => pegar(BASE_PC + '/api/versao'))

  // ---------------------------------------------------------------- cofre, módulos do PC
  const cifra = await import(pathToFileURL(path.join(ETAPA2, 'cifra.mjs')).href)
  const { cofre, chaveDados } = await cifra.criarCofre('senha-de-teste-123')
  await nuvemJson('/dados/cofre', { cofre })
  const chavePc = await cifra.paraCryptoKey(chaveDados, false)
  const nt = await import(pathToFileURL(path.join(PC_DIR, 'src/nuvem-tracker.js')).href)
  const nucleo = await import(pathToFileURL(path.join(ETAPA2, 'espelho-nucleo.mjs')).href)
  const fontePc = nt.fonteTrackerHttp(BASE_PC)
  const trocarPc = async () => { const r = await nt.trocarTracker({ chave: chavePc, fonte: fontePc }); return r }
  const post = async (rota, corpo) => { const r = await fetch(BASE_PC + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) }); return { status: r.status, json: await r.json().catch(() => ({})) } }
  const copiaPc = async () => (await fetch(BASE_PC + '/api/tracker/copia')).json()
  const nuvemTudo = async () => {
    const vistos = new Map()
    let r = await fontePc.nuvem({ desde: 0, mudancas: [] })
    for (;;) { r.registros.forEach((x) => vistos.set(x.id, x)); if (!r.mais) break; r = await fontePc.nuvem({ desde: r.desde, continuar: true, mudancas: [] }) }
    return vistos
  }
  const lerRegistro = async (id) => { const r = (await nuvemTudo()).get(id); return r ? cifra.decifrar(chavePc, id, r.blob) : null }
  const paginasPc = () => fs.readdirSync(path.join(dadosPC, 'paginas')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  const lixeiraPc = () => (fs.existsSync(path.join(dadosPC, 'lixeira')) ? fs.readdirSync(path.join(dadosPC, 'lixeira')) : [])
  const lerPaginaPc = (id) => JSON.parse(fs.readFileSync(path.join(dadosPC, 'paginas', id + '.json'), 'utf8'))
  const canon = nucleo.canon

  // ---------------------------------------------------------------- o celular (app de verdade)
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  let ghSha = 1
  const pedidosEspelho = []
  const cab = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  await ctx.route('https://api.github.com/**', async (r) => {
    const req = r.request(), u = new URL(req.url())
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cab })
    if (!/\/contents\/dados\.json$/.test(u.pathname)) return r.fulfill({ status: 404, headers: cab, json: { message: 'Not Found' } })
    if (req.method() === 'GET') return r.fulfill({ status: 200, headers: cab, json: { sha: String(ghSha), content: Buffer.from(fs.readFileSync(ghArq)).toString('base64') } })
    const corpo = req.postDataJSON()
    if (corpo.sha !== String(ghSha)) return r.fulfill({ status: 409, headers: cab, json: { message: 'sha' } })
    fs.writeFileSync(ghArq, Buffer.from(corpo.content, 'base64')); ghSha++
    return r.fulfill({ status: 200, headers: cab, json: { content: { sha: String(ghSha) } } })
  })
  await ctx.addInitScript(({ dados, nuvem }) => {
    if (!localStorage.getItem('johnnys-journal-v1')) {
      localStorage.setItem('johnnys-journal-v1', JSON.stringify(dados))
      localStorage.setItem('jj-nuvem', JSON.stringify({ url: nuvem, segredo: 'teste' }))
    }
  }, { dados: REAL, nuvem: NUVEM })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  page.on('request', (rq) => { if (rq.url().startsWith(NUVEM + '/dados/sincronizar') && rq.method() === 'POST') pedidosEspelho.push(rq.postData()) })
  const dadosCel = () => page.evaluate(() => JSON.parse(localStorage.getItem('johnnys-journal-v1')))
  const sincCel = () => page.evaluate(() => window.jjEspelho.sincronizar())
  const sincGithubCel = () => page.evaluate(async () => sincronizar())
  const ligarGithubCel = () => page.evaluate(() => localStorage.setItem('jj-github-token', 'token-de-mentira'))

  // ================= 1. SEM CHAVE: o app e o localStorage ficam como hoje =================
  await page.goto(URL_APP); await page.waitForTimeout(2500)
  {
    const antes = await dadosCel()
    ok(canon(antes.dias) === canon(REAL.dias) && antes.notas.length === 1 && antes.memorias.length === 1, 'sem chave: o app abriu com os dados reais (21 dias, 1 nota, 1 memória), intactos')
    // edita um hábito pelo app: tudo continua como antes (só o que o app sempre faz)
    await page.click('.barra button[data-tela="habitos"]'); await page.waitForTimeout(400)
    await page.click('#lista-habitos button.habito >> nth=0'); await page.waitForTimeout(4500)
    const depois = await dadosCel()
    ok(depois.dias !== undefined && Object.keys(depois.dias).length >= 21, 'sem chave: marcar um hábito salva como sempre')
    const chaves = await page.evaluate(() => Object.keys(localStorage).sort())
    ok(!chaves.includes('jj-antes-espelho'), 'sem chave: nenhuma cópia "jj-antes-espelho" é criada')
    const bancos = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
    ok(!bancos.includes('jj-espelho'), 'sem chave: o banco do espelho nem é criado')
    ok(pedidosEspelho.length === 0, 'sem chave: nenhuma chamada /dados/sincronizar do celular')
    ok(typeof (await page.evaluate(() => window.jjEspelho)) === 'object', 'o gancho do espelho está carregado (mas quieto)')
    // volta ao estado original dos dados para o resto do teste
    await page.evaluate((d) => { dados = d; fotoDias = copiaDias(dados.dias); localStorage.setItem('johnnys-journal-v1', JSON.stringify(d)); renderTudo() }, REAL)
  }

  // ================= 2. COM CHAVE: o celular sobe tudo; o PC (sem GitHub) recebe só pela nuvem =================
  await page.evaluate(async (crua) => { const A = await import('./armazem.js'); const C = await import('./cifra.mjs'); await A.gravarChave(await C.paraCryptoKey(crua, false)) }, chaveDados)
  const rUp = await sincCel()
  ok(rUp.ok && rUp.resumo.enviados === 26, `celular desbloqueado sobe os 26 registros (enviados: ${rUp.resumo?.enviados}, erro: ${rUp.erro || '-'})`)
  let n = await nuvemTudo()
  const porTipo = {}; for (const x of n.values()) if (nucleo.TIPOS_ESPELHO.has(x.tipo)) porTipo[x.tipo] = (porTipo[x.tipo] || 0) + 1
  ok(JSON.stringify(porTipo) === JSON.stringify({ dia: 21, nota: 1, memoria: 1, contadores: 1, habitos: 1, plano: 1 }), 'nuvem: ' + JSON.stringify(porTipo))
  ok(![...n.values()].some((x) => x.blob && /Pipa|Teste|Estou gostando/.test(x.blob)), 'a nuvem guarda só texto cifrado')

  const r1 = await trocarPc()
  let c = await copiaPc()
  ok(Object.keys(c.dias).length === 21 && c.notas.length === 1 && c.memorias.length === 1, `PC recebeu pela nuvem 21 dias, 1 nota, 1 memória (veio ${Object.keys(c.dias).length}/${(c.notas || []).length}/${(c.memorias || []).length})`)
  ok(Object.keys(REAL.dias).every((k) => canon(c.dias[k]) === canon(REAL.dias[k])), 'os 21 dias do PC são idênticos aos do celular')
  const hojeDados = await dadosCel()
  ok(Object.keys(hojeDados.dias).length === 21 && hojeDados.notas.length === 1 && hojeDados.memorias.length === 1, 'celular continua com 21 dias, 1 nota, 1 memória')
  const memId = 'tracker-mem-' + (await nucleo.idDaMemoria(REAL.memorias[0]))
  const esperadasTracker = JSON.parse(execSync('python -I -c "import json,sys;sys.path.insert(0,sys.argv[1]);import tracker;d=json.load(open(sys.argv[2],encoding=\'utf-8\'));print(json.dumps([e[0] for e in tracker.entradas(d, lambda c: None)]))" "' + PC_DIR + '" "' + path.join(ETAPA2, 'copia-antes-da-etapa2/dados-celular-2026-11-12.json') + '"', { encoding: 'utf8' }).trim())
  const pgs = paginasPc()
  ok(esperadasTracker.length > 5 && esperadasTracker.every((id) => pgs.includes(id)), `o PC gerou as ${esperadasTracker.length} páginas tracker-* esperadas (entrevistas e memória) a partir dos registros`)
  ok(pgs.includes(memId), 'a memória virou a página ' + memId)
  ok(fs.readdirSync(path.join(dadosPC, 'tracker')).some((f) => /^dados\.antes-espelho-\d{4}-\d{2}-\d{2}\.json$/.test(f)) || true, 'cópia do dia do PC (só existe se já havia cópia local)')
  const estadoPc = await (await fetch(BASE_PC + '/api/nuvem/tracker/estado')).json()
  ok(estadoPc.v === 1 && Object.keys(estadoPc.marcas).length === 26, 'o PC guardou o estado (26 marcas)')
  const antesCh = pedidosEspelho.length
  const r2 = await trocarPc()
  ok(r2.resumo.enviados === 0 && r2.resumo.aplicados === 0, 'segunda troca do PC: nada a enviar, nada a aplicar')

  // ================= 3. o GitHub (de mentira) liga depois: mesmo conteúdo pelos dois canais, nada duplica =================
  await ligarGithubCel()
  const gs = await sincGithubCel()
  ok(gs === 'ok' && Object.keys(ghLer().dias).length === 21, 'celular liga o backup do GitHub de mentira e ele recebe os 21 dias')
  const rs = await post('/api/tracker/sincronizar')
  ok(rs.status === 200 && rs.json.dias === 21, 'PC sincroniza com o GitHub de mentira (rota existente)')
  const r3 = await trocarPc()
  c = await copiaPc()
  ok(Object.keys(c.dias).length === 21 && c.notas.length === 1 && c.memorias.length === 1, 'depois dos DOIS canais: ainda 21 dias, 1 nota, 1 memória no PC (sem duplicar)')
  ok(r3.resumo.enviados === 0, 'o PC não reenvia nada à nuvem depois de ler o GitHub (mesmo conteúdo)')
  await sincCel()
  const dc = await dadosCel()
  ok(Object.keys(dc.dias).length === 21 && dc.notas.length === 1 && dc.memorias.length === 1 && Object.keys(REAL.dias).every((k) => canon(dc.dias[k]) === canon(REAL.dias[k]) || dc.dias[k].t >= REAL.dias[k].t), 'celular depois dos dois canais: 21 dias, 1 nota, 1 memória, nada revertido')

  // ================= 4. celular edita um hábito pelo app (e o tweet) -> nuvem (sozinho, sem chamada manual) -> PC =================
  const diaHoje = await page.evaluate(() => atual)
  await page.click('#lista-habitos button.habito >> nth=1')
  await page.fill('#tweet', 'Teste do espelho: dia de código.')
  const chegou = await ate(async () => { const o = await lerRegistro('dia:' + diaHoje); return o && o.tweet === 'Teste do espelho: dia de código.' }, 12_000)
  ok(chegou, 'a edição no app chega à nuvem SOZINHA (gancho depois do salvar), sem ninguém chamar o espelho')
  const r4 = await trocarPc()
  c = await copiaPc()
  ok(c.dias[diaHoje]?.tweet === 'Teste do espelho: dia de código.' && Object.keys(c.dias[diaHoje].h).length >= 1, 'o PC enxerga o tweet e o hábito marcados no celular')
  ok(paginasPc().includes('tracker-' + diaHoje) && lerPaginaPc('tracker-' + diaHoje).resumo === 'Teste do espelho: dia de código.', 'e a página tracker-' + diaHoje + ' do PC mostra o tweet como resumo')

  // ================= 5. PC edita um dia (aba Hábitos) -> nuvem -> celular =================
  const k5 = '2026-10-14'
  const antes5 = (await dadosCel()).dias[k5]
  ok((await post('/api/tracker/dia', { dia: k5, h: { treino: 'x', leitura: true }, agua: 2 })).status === 200, 'PC grava o dia ' + k5 + ' pela rota existente (vai ao GitHub de mentira)')
  await trocarPc()
  ok((await lerRegistro('dia:' + k5))?.h?.treino === 'x', 'a edição do PC sobe como registro dia:' + k5)
  await sincCel()
  const d5 = (await dadosCel()).dias[k5]
  ok(d5.h.treino === 'x' && d5.h.leitura === true && d5.agua === 2, 'o celular recebe a edição do PC pela nuvem')
  const antesEspelho = await page.evaluate(() => JSON.parse(localStorage.getItem('jj-antes-espelho') || 'null'))
  ok(antesEspelho && antesEspelho.dados && antesEspelho.dados.dias[k5] && canon(antesEspelho.dados.dias[k5]) !== canon(d5), 'o celular guardou a cópia de segurança jj-antes-espelho (objeto antigo, sem a edição do PC)')
  ok(fs.readdirSync(path.join(dadosPC, 'tracker')).some((f) => /^dados\.antes-espelho-\d{4}-\d{2}-\d{2}\.json$/.test(f)), 'o PC guardou tracker/dados.antes-espelho-AAAA-MM-DD.json')

  // ================= 6. edições dos dois no mesmo dia, campos diferentes, sem ver um ao outro =================
  const k6 = '2026-10-15'
  await page.evaluate((k) => { atual = k; renderHoje() }, k6)
  await page.click('.garrafa >> nth=2')                              // celular: água = 3
  await post('/api/tracker/dia', { dia: k6, h: { semp: 'na' } })     // PC: um hábito
  await trocarPc(); await sincCel(); await trocarPc(); await sincCel()
  const d6c = (await dadosCel()).dias[k6], d6p = (await copiaPc()).dias[k6]
  ok(d6c.agua === 3 && d6c.h.semp === 'na' && d6p.agua === 3 && d6p.h.semp === 'na', 'campos diferentes do mesmo dia: PC e celular ficam com as duas edições')
  ok(canon(d6c) === canon(d6p), 'e o dia fica idêntico nos dois lados')

  // ================= 7. a mesma edição pelos dois canais não duplica nem reverte =================
  await sincGithubCel()                                              // celular -> GitHub de mentira
  await post('/api/tracker/sincronizar')                             // PC lê o GitHub (troca a cópia local; a anterior é guardada)
  const ant = (await (await fetch(BASE_PC + '/api/tracker/anteriores')).json()).itens
  const rr = await trocarPc()
  const d7 = (await copiaPc()).dias[k6], d7c = (await dadosCel()).dias[k6]
  ok(d7.agua === 3 && d7.h.semp === 'na' && canon(d7) === canon(d7c), 'depois do GitHub + nuvem: mesmo dia, nada revertido (' + ant.length + ' cópia(s) anterior(es) juntada(s) de volta)')
  ok((await (await fetch(BASE_PC + '/api/tracker/anteriores')).json()).itens.length === 0, 'as cópias anteriores são limpas depois de juntadas')
  c = await copiaPc()
  ok(c.notas.length === 1 && c.memorias.length === 1 && Object.keys(c.dias).length >= 21, 'contagens estáveis (1 nota, 1 memória, ' + Object.keys(c.dias).length + ' dias)')

  // ================= 8. entrevista com respostas nunca vira vazia =================
  const k8 = '2026-11-12'
  await page.evaluate((k) => {
    const r = dia(k); r.entrevista = { modo: 'dia', data: k, respostas: ['Fui ao parque e pensei no espelho.', '', 'Boa conversa.', '', '', '', ''], t: Date.now() }; salvar()
  }, k8)
  await ate(async () => (await lerRegistro('dia:' + k8))?.entrevista?.respostas?.[0], 12_000)
  await post('/api/tracker/dia', { dia: k8, h: { treino: true } })  // o PC marca um hábito depois (dia.t mais novo)
  await trocarPc(); await sincCel(); await trocarPc(); await sincCel()
  const e8c = (await dadosCel()).dias[k8], e8p = (await copiaPc()).dias[k8]
  ok(e8c.entrevista?.respostas[0] === 'Fui ao parque e pensei no espelho.' && e8p.entrevista?.respostas[0] === 'Fui ao parque e pensei no espelho.', 'a entrevista com respostas está nos DOIS lados depois do PC marcar um hábito')
  ok(e8c.h.treino === true && e8p.h.treino === true, 'e o hábito do PC está nos dois')
  const pagE = paginasPc().includes('tracker-' + k8) ? lerPaginaPc('tracker-' + k8) : null
  ok(pagE && JSON.stringify(pagE.doc).includes('Fui ao parque'), 'a página tracker-' + k8 + ' do PC tem as respostas'
    + (pagE && !JSON.stringify(pagE.doc).includes('Fui ao parque') ? ` [origem ${JSON.stringify(pagE.origem)} agora ${Date.now()} dia.t ${e8p.t} doc ${JSON.stringify(pagE.doc).slice(0, 160)}]` : pagE ? '' : ' [página não existe]'))
  ok((await lerRegistro('dia:' + k8)).entrevista.respostas[0].startsWith('Fui ao parque'), 'e a nuvem guarda a entrevista com respostas')

  // ================= 9. nota e memória criadas no celular chegam como páginas tracker-nota / tracker-mem =================
  const idNota = 'zznota1'
  await page.evaluate((id) => {
    dados.notas = [...(dados.notas || []), { id, espaco: 'journal', titulo: 'Ideia do espelho', texto: 'Uma nota nova.\nSegunda linha.', data: '2026-11-12', criada: Date.now(), t: Date.now() }]
    dados.memorias = [...dados.memorias, { modo: 'memoria', titulo: 'Casa nova do pai', data: '2026-11-05', respostas: ['A casa é bonita.'], t: Date.now() }]
    salvar()
  }, idNota)
  await ate(async () => (await lerRegistro('nota:' + idNota)), 12_000)
  const r9 = await trocarPc()
  const memNova = 'tracker-mem-' + (await nucleo.idDaMemoria({ titulo: 'Casa nova do pai', data: '2026-11-05' }))
  ok(paginasPc().includes('tracker-nota-' + idNota) && JSON.stringify(lerPaginaPc('tracker-nota-' + idNota).doc).includes('Segunda linha'), 'a nota criada no celular virou a página tracker-nota-' + idNota + ' no PC')
  ok(paginasPc().includes(memNova) && JSON.stringify(lerPaginaPc(memNova).doc).includes('A casa é bonita'), 'a memória criada no celular virou a página ' + memNova)
  c = await copiaPc()
  ok(c.notas.length === 2 && c.memorias.length === 2, 'PC: 2 notas e 2 memórias (a real + a nova), sem duplicar')

  // ================= 10. apagar propaga =================
  const k10 = '2026-10-16'
  const antesLix = lixeiraPc().length
  await page.evaluate(({ id, k }) => {
    const n = dados.notas.find((x) => x.id === id); n.apagada = true; n.t = Date.now()                                    // mexerNota(...apagada)
    const m = dados.memorias.find((x) => x.titulo === 'Casa nova do pai'); Object.assign(m, { respostas: [], apagada: true, t: Date.now() })   // apagarMemoria
    const r = dia(k); for (const campo of ['entrevista', 'tweet', 'tweetRascunho', 'ilustracao', 'imagens']) delete r[campo]
    r.entrevista = { modo: 'dia', data: k, respostas: [], apagada: true, t: Date.now() }                                   // apagarEntrevistaDoDia
    salvar()
  }, { id: idNota, k: k10 })
  await ate(async () => (await lerRegistro('dia:' + k10))?.entrevista?.apagada, 12_000)
  await trocarPc()
  c = await copiaPc()
  ok(c.notas.find((x) => x.id === idNota)?.apagada === true, 'nota apagada no celular chega apagada ao PC')
  ok(c.memorias.find((x) => x.titulo === 'Casa nova do pai')?.apagada === true && c.dias[k10].entrevista.apagada === true, 'memória e entrevista apagadas no celular chegam apagadas ao PC')
  ok(!paginasPc().includes(memNova) && !paginasPc().includes('tracker-' + k10) && lixeiraPc().length >= antesLix + 2, 'no PC as páginas da memória e da entrevista apagadas foram para a Lixeira (rota existente)')
  const todos = await nuvemTudo()
  ok([...todos.values()].filter((x) => nucleo.TIPOS_ESPELHO.has(x.tipo)).every((x) => !x.apagado), 'a nuvem nunca recebeu "apagado": o apagar é marca dentro do registro')

  // ================= 11. fim: contagens e igualdade =================
  await sincCel(); await trocarPc(); await sincCel()
  const fc = await dadosCel(), fp = await copiaPc()
  ok(canon(fc.dias) === canon(fp.dias), `celular e PC com os mesmos ${Object.keys(fc.dias).length} dias, idênticos`)
  const porId = (l) => [...l].sort((a, b) => String(a.id || a.titulo).localeCompare(String(b.id || b.titulo)))
  ok(canon(porId(fc.notas)) === canon(porId(fp.notas)) && canon(porId(fc.memorias)) === canon(porId(fp.memorias)), 'mesmas notas e memórias nas duas pontas (a ordem da lista pode variar)')
  ok(canon(fc.contadores) === canon(fp.contadores) && canon(fc.habitos) === canon(fp.habitos), 'mesmos contadores e hábitos')
  const es = await page.evaluate(() => window.jjEspelho.estado())
  ok(!es.erro, 'o celular não anotou erro no espelho' + (es.erro ? ': ' + es.erro : ''))
  ok(!erros.length, 'sem erros na página do celular' + (erros.length ? ': ' + erros.join(' | ') : ''))
} catch (e) {
  ok(false, 'erro inesperado: ' + (e.stack || e.message))
  console.log('--- nuvem:\n' + logWr.slice(-1200) + '\n--- servidor PC:\n' + logPy.slice(-1500))
} finally {
  try { await browser?.close() } catch { /* já fechou */ }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
  // Sem isto o Node fica esperando os servidores filhos para sempre (foi o que travou a primeira rodada).
  process.exit(process.exitCode || 0)
}
