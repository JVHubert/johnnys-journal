// As cópias dentro do app (cifra.mjs, tiptap-html.mjs, tiptap-md.mjs) têm de ser IDÊNTICAS, byte a byte, às mestras em
// etapa2-dados (como o PC faz com src/cifra.mjs). Também confere que o sw.js guarda no cache todos os arquivos novos e que
// a cópia de conflito do celular dá o mesmo resultado da do PC (nuvem-dados.js). Uso: node testes/copias-etapa2.test.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(aqui, '..')
const MESTRAS = path.resolve(aqui, '../../etapa2-dados')
const PC_SRC = path.resolve(aqui, "../../../../2026.10.03 Bloco de Notas/01 Projeto/bloco-de-notas-2/src")
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALHA') + ' ' + msg); if (!cond) { falhas++; process.exitCode = 1 } }

for (const f of ['cifra.mjs', 'tiptap-html.mjs', 'tiptap-md.mjs']) {
  const a = fs.readFileSync(path.join(APP, f)), b = fs.readFileSync(path.join(MESTRAS, f))
  ok(a.equals(b), `${f}: a cópia do app é idêntica à mestra (${a.length} bytes)`)
}
const pcCifra = path.join(PC_SRC, 'cifra.mjs')
if (fs.existsSync(pcCifra)) ok(fs.readFileSync(pcCifra).equals(fs.readFileSync(path.join(MESTRAS, 'cifra.mjs'))), 'cifra.mjs do PC também é idêntica à mestra')

// sw.js: tudo o que a seção nova usa está no cache e existe no disco
const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8')
const lista = [...sw.slice(sw.indexOf('const ARQUIVOS'), sw.indexOf('];', sw.indexOf('const ARQUIVOS'))).matchAll(/'([^']+)'/g)].map((m) => m[1])
for (const f of ['armazem.js', 'pc-sync.js', 'paginas.js', 'cifra.mjs', 'tiptap-html.mjs', 'tiptap-md.mjs']) ok(lista.includes(f), `sw.js guarda ${f} no cache`)
const faltam = lista.filter((f) => f !== './' && !fs.existsSync(path.join(APP, f)))
ok(!faltam.length, 'todo arquivo listado em ARQUIVOS existe (um 404 derrubaria a instalação do cache)' + (faltam.length ? ': ' + faltam.join(', ') : ''))
ok(/const VERSAO = '2\.86\.0'/.test(sw) && /const PUBLICADA = '2026-11-12T\d\d:\d\d'/.test(sw), 'sw.js: VERSAO 2.86.0 e PUBLICADA preenchidas')

// a cópia de conflito do celular = a do PC
const pc = await import(pathToFileURL(path.join(PC_SRC, 'nuvem-dados.js')).href)
const sync = await import(pathToFileURL(path.join(APP, 'pc-sync.js')).href)
const casos = [
  { doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meu título' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'corpo' }] }] }, espaco: 'journal', criada: 1, atualizada: 2, pai: 'x' },
  { doc: { type: 'doc', content: [] }, espaco: null, criada: 1 },
  { doc: null, titulo: 'x', criada: 1 },
]
const agora = Date.UTC(2026, 10, 12, 15)
for (const [i, pg] of casos.entries()) {
  const a = pc.copiaDeConflito(pg, agora, 'id-fixo'), b = sync.copiaDeConflito(pg, agora, 'id-fixo')
  ok(JSON.stringify(a) === JSON.stringify(b), `cópia de conflito do celular = a do PC (caso ${i + 1}): ${b.pagina.titulo}`)
}
ok(pc.rotuloConflito(agora) === sync.rotuloConflito(agora), 'rótulo "(conflito DD/MM)" igual')
ok(pc.tituloDe(casos[0].doc) === sync.tituloDe(casos[0].doc), 'título derivado igual')
for (const v of [{ b: 1, a: [1, { z: 1, y: undefined }] }, 'x', null]) ok(pc.canon(v) === sync.canon(v), 'canon igual: ' + sync.canon(v))
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
