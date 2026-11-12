// Montagem dos testes das páginas do PC no celular (Etapa 2). NADA vai para a internet nem para a conta Cloudflare:
//   - nuvem de mentira: `wrangler dev --local` na porta 8799 (banco numa pasta temporária);
//   - "PC" de mentira: o módulo nuvem-dados.js do Journal do PC, lendo UMA CÓPIA dos dados (pasta temporária);
//   - o app: `python -m http.server` na pasta do app.
// Os dados reais só são LIDOS (copiados). Usado por paginas-pc.test.mjs.
import { spawn, execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const APP = path.resolve(aqui, '..')
export const ETAPA2 = path.resolve(aqui, '../../etapa2-dados')
const BLOCO = path.resolve(aqui, '../../../../2026.10.03 Bloco de Notas/01 Projeto')
export const PC_SRC = path.join(BLOCO, 'bloco-de-notas-2/src')
const NUVEM_PASTA = path.join(BLOCO, 'ditado-nuvem')
const REAIS = process.env.BLOCO_DADOS_REAIS || path.join(BLOCO, 'dados')
export const PORTA_NUVEM = 8841
export const PORTA_APP = 8842
export const NUVEM = `http://127.0.0.1:${PORTA_NUVEM}`
export const SEGREDO = 'teste'
export const SENHA = 'senha-de-teste-123'
export const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-celular-etapa2-'))
const filhos = []
export let logWr = ''

export function limpar() {
  for (const f of filhos) { try { execSync(`taskkill /PID ${f.pid} /T /F`, { stdio: 'ignore' }) } catch { /* já saiu */ } }
  // o wrangler deixa o workerd solto: derruba só quem escuta nas portas deste teste
  try { execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORTA_NUVEM},${PORTA_APP} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }) } catch { /* nada a derrubar */ }
  if (!process.argv.includes('--manter')) { try { fs.rmSync(temp, { recursive: true, force: true }) } catch { /* fica no temp */ } }
}
process.on('exit', limpar)
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

async function esperar(sonda, quanto = 180_000) {
  const fim = Date.now() + quanto
  for (;;) {
    try { await sonda(); return } catch { /* ainda subindo */ }
    if (Date.now() > fim) throw new Error('não subiu')
    await dorme(700)
  }
}
const pegar = (url) => new Promise((ok, falha) => { http.get(url, { agent: agente }, (r) => { r.resume(); r.on('end', () => (r.statusCode < 500 ? ok() : falha(new Error('status ' + r.statusCode)))) }).on('error', falha) })

export async function subirServidores() {
  const toml = path.join(temp, 'wrangler-teste.toml')
  fs.writeFileSync(toml, `name = "jv-ditado-teste"\nmain = "${path.join(NUVEM_PASTA, 'index.js').replace(/\\/g, '/')}"\ncompatibility_date = "2026-09-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "jv-journal"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n[vars]\nURL_PUBLICA = "${NUVEM}"\nSEGREDO = "${SEGREDO}"\n`)
  const wr = spawn('npx', ['--yes', 'wrangler@latest', 'dev', '--local', '--config', toml, '--port', String(PORTA_NUVEM), '--persist-to', path.join(temp, 'estado-nuvem')], { cwd: NUVEM_PASTA, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  filhos.push(wr)
  wr.stdout.on('data', (d) => { logWr += d }); wr.stderr.on('data', (d) => { logWr += d })
  const py = spawn('python', ['-m', 'http.server', String(PORTA_APP), '--bind', '127.0.0.1'], { cwd: APP, stdio: 'ignore' })
  filhos.push(py)
  try { await esperar(() => nuvemJson('/dados/cofre')) } catch (e) { console.log(logWr.slice(-1500)); throw e }
  await esperar(() => pegar(`http://127.0.0.1:${PORTA_APP}/index.html`))
}

// http direto, sem reaproveitar conexão (o fetch do Node 24 travou numa conexão que o wrangler local fechou).
const agente = new http.Agent({ keepAlive: false })
export const nuvemJson = (rota, corpo, metodo) => new Promise((ok, falha) => {
  const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo))
  const req = http.request({ host: '127.0.0.1', port: PORTA_NUVEM, path: rota, agent: agente, method: metodo || (dados ? 'POST' : 'GET'),
    headers: { 'x-segredo': SEGREDO, 'content-type': 'application/json', ...(dados ? { 'content-length': dados.length } : {}), connection: 'close' } }, (res) => {
    const partes = []
    res.on('data', (d) => partes.push(d))
    res.on('end', () => {
      let j = {}
      try { j = JSON.parse(Buffer.concat(partes).toString('utf8')) } catch { /* sem corpo */ }
      if (res.statusCode >= 400) falha(Object.assign(new Error(j.erro || 'erro ' + res.statusCode), { status: res.statusCode })); else ok(j)
    })
  })
  req.on('error', falha)
  if (dados) req.write(dados)
  req.end()
})

/** Cópia (só leitura do real) das páginas, espaços e Início; "PC de mentira" em memória sobre ela. */
export async function prepararPc() {
  const copia = path.join(temp, 'dados')
  fs.mkdirSync(copia, { recursive: true })
  for (const n of ['paginas', 'espacos.json', 'inicio.json']) fs.cpSync(path.join(REAIS, n), path.join(copia, n), { recursive: true })
  const mem = new Map()
  for (const f of fs.readdirSync(path.join(copia, 'paginas')).filter((x) => x.endsWith('.json'))) mem.set(f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(copia, 'paginas', f), 'utf8')))
  let espacos = JSON.parse(fs.readFileSync(path.join(copia, 'espacos.json'), 'utf8'))
  let inicio = JSON.parse(fs.readFileSync(path.join(copia, 'inicio.json'), 'utf8'))
  const marcas = new Map([...mem.keys()].map((id) => [id, '1']))
  const gravadas = []
  const fonte = {
    listar: async () => ({ paginas: Object.fromEntries(marcas), lixeira: [], espacos, inicio }),
    paginas: async (ids) => Object.fromEntries(ids.filter((id) => mem.has(id)).map((id) => [id, mem.get(id)])),
    gravarPagina: async (id, pg) => { mem.set(id, pg); marcas.set(id, String(Date.now()) + Math.random()); gravadas.push(id) },
    apagarPagina: async (id) => { mem.delete(id); marcas.delete(id) },
    lerEspacos: async () => espacos, gravarEspacos: async (e) => { espacos = e },
    lerInicio: async () => inicio, gravarInicio: async (i) => { inicio = i },
  }
  const modulo = await import(pathToFileURL(path.join(PC_SRC, 'nuvem-dados.js')).href)
  const cifra = await import(pathToFileURL(path.join(ETAPA2, 'cifra.mjs')).href)
  const md = await import(pathToFileURL(path.join(ETAPA2, 'tiptap-md.mjs')).href)
  return { mem, fonte, gravadas, modulo, cifra, md, espacos: () => espacos, inicio: () => inicio }
}

export const nuvemDoPc = (corpo) => nuvemJson('/dados/sincronizar', corpo)
