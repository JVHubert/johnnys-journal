// Etapa 2, Fase 4c: o ESPELHO cifrado dos dados do celular (dias, notas, memórias, contadores, hábitos e plano).
// Segundo canal, em paralelo ao backup do GitHub (dados.json), que continua igual. Este arquivo é só a lógica
// pura (sem tela, sem rede, sem armazenamento): o celular (espelho.js) e o PC (nuvem-tracker.js) usam esta mesma
// CÓPIA IDÊNTICA (mestre em etapa2-dados; os testes conferem byte a byte).
//
// Como converge sem depender de relógio certo:
//  - cada registro é o próprio objeto do dados.json (dia:AAAA-MM-DD, nota:<id>, memoria:<sha1[:12]>, contadores, habitos, plano);
//  - o juntar.js (por carimbo de campo) decide o conteúdo; a nuvem só guarda "o mais novo" por registro;
//  - se o conteúdo daqui é diferente do que a nuvem tem (porque juntou algo que a nuvem não tinha), manda de volta com
//    `mudou` = (o que a nuvem tinha) + 1, senão a versão juntada nunca subiria;
//  - a marca por registro { h: hash do conteúdo, mudou } guarda o que se sabe da nuvem; o eco do que mandei é ignorado
//    pelo conteúdo (mesmo `mudou` com conteúdo diferente = outro aparelho mandou junto: junta de novo).
// Apagar: o app apaga marcando o objeto (`apagada: true` em nota/memória, `entrevista.apagada` no dia): isso já é o
// "túmulo", vai dentro do registro. Ausência nunca vira apagado.

export const TIPOS_ESPELHO = new Set(['dia', 'nota', 'memoria', 'contadores', 'habitos', 'plano'])
export const VERSAO_ESTADO = 1
export const LOTE_BYTES = 1_800_000
export const LOTE_REGISTROS = 300
const MAX_VOLTAS = 6

// ---------------------------------------------------------------- utilidades puras
export function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
}
/** cyrb53 (o mesmo do nuvem-dados.js): só para perceber se o conteúdo mudou. */
export function hashDe(v) {
  const s = canon(v)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '.' + s.length
}

/** Mesmo id que o tracker.py usa para "tracker-mem-<id>": sha1("titulo|data")[:12], título sem espaços nas pontas. */
export async function idDaMemoria(m) {
  const titulo = String(m.titulo || 'Memória').trim()
  const data = m.data === undefined || m.data === null ? 'None' : String(m.data) // o Python escreve None
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${titulo}|${data}`))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
}

const DIA_OK = /^\d{4}-\d{2}-\d{2}$/
const NOTA_OK = /^[\w-]{1,80}$/
export function tipoDoId(id) {
  id = String(id)
  if (id === 'contadores' || id === 'habitos' || id === 'plano') return id
  const m = /^(dia|nota|memoria):(.+)$/.exec(id)
  if (!m) return null
  if (m[1] === 'dia' && !DIA_OK.test(m[2])) return null
  if (m[1] === 'nota' && !NOTA_OK.test(m[2])) return null
  if (m[1] === 'memoria' && !/^[0-9a-f]{12}$/.test(m[2])) return null
  return m[1]
}

// ---------------------------------------------------------------- dados.json -> registros
/** @returns Map id -> { id, tipo, base, obj }  (`base` = a data de edição própria do registro, em ms) */
export async function registrosDe(dados) {
  const m = new Map()
  const d = dados || {}
  for (const [k, dia] of Object.entries(d.dias || {})) {
    if (DIA_OK.test(k) && dia && typeof dia === 'object') m.set('dia:' + k, { id: 'dia:' + k, tipo: 'dia', base: Number(dia.t) || 0, obj: dia })
  }
  for (const n of d.notas || []) {
    if (n && typeof n === 'object' && NOTA_OK.test(String(n.id || ''))) m.set('nota:' + n.id, { id: 'nota:' + n.id, tipo: 'nota', base: Number(n.t) || 0, obj: n })
  }
  for (const mem of d.memorias || []) {
    if (!mem || typeof mem !== 'object') continue
    const id = 'memoria:' + (await idDaMemoria(mem))
    const velho = m.get(id)
    if (!velho || (Number(mem.t) || 0) >= velho.base) m.set(id, { id, tipo: 'memoria', base: Number(mem.t) || 0, obj: mem })
  }
  if (Array.isArray(d.contadores)) m.set('contadores', { id: 'contadores', tipo: 'contadores', base: Number(d.contadoresT) || 0, obj: { lista: d.contadores, contadoresT: Number(d.contadoresT) || 0 } })
  if (Array.isArray(d.habitos)) m.set('habitos', { id: 'habitos', tipo: 'habitos', base: Number(d.habitosT) || 0, obj: { lista: d.habitos, habitosT: Number(d.habitosT) || 0 } })
  const marcas = d.plano && typeof d.plano === 'object' ? d.plano : {}
  if (Number(d.planoT) || Object.keys(marcas).length) m.set('plano', { id: 'plano', tipo: 'plano', base: Number(d.planoT) || 0, obj: { marcas, planoT: Number(d.planoT) || 0 } })
  return m
}

/** `mudou` de um registro que mudou aqui: a data de edição dele, ou (se ela não andou, como numa junção) a da nuvem + 1. */
export function mudouPara(base, marca) {
  const b = base || 1
  if (!marca) return b
  return b > marca.mudou ? b : marca.mudou + 1
}

/** O que precisa subir: registros cujo conteúdo é diferente do que a marca diz que a nuvem tem. */
export function planejar(regs, marcas, ignorar = new Set()) {
  const pend = []
  for (const r of regs.values()) {
    if (ignorar.has(r.id)) continue
    const h = hashDe(r.obj)
    const marca = marcas[r.id]
    if (marca && marca.h === h) continue
    pend.push({ id: r.id, tipo: r.tipo, mudou: mudouPara(r.base, marca), obj: r.obj, h })
  }
  return pend
}

// ---------------------------------------------------------------- registros recebidos -> objeto no formato do dados.json
/** Só com o que chegou; é o "remoto" que o juntar() espera. */
export function montarRemoto(recebidos) {
  const r = { dias: {}, memorias: [] }
  const notas = []
  for (const { id, obj } of recebidos) {
    const tipo = tipoDoId(id)
    if (tipo === 'dia') r.dias[id.slice(4)] = obj
    else if (tipo === 'nota') notas.push(obj)
    else if (tipo === 'memoria') r.memorias.push(obj)
    else if (tipo === 'contadores' && Array.isArray(obj.lista)) { r.contadores = obj.lista; r.contadoresT = Number(obj.contadoresT) || 0 }
    else if (tipo === 'habitos' && Array.isArray(obj.lista)) { r.habitos = obj.lista; r.habitosT = Number(obj.habitosT) || 0 }
    else if (tipo === 'plano' && obj.marcas && typeof obj.marcas === 'object') { r.plano = obj.marcas; r.planoT = Number(obj.planoT) || 0 }
  }
  if (notas.length) r.notas = notas
  return r
}

export const estadoVazio = () => ({ v: VERSAO_ESTADO, desde: 0, continuar: false, marcas: {} })

// ---------------------------------------------------------------- uma troca
/**
 * @param chave        a chave dos dados (CryptoKey)
 * @param cifrar,decifrar   de cifra.mjs: cifrar(chave, id, valor), decifrar(chave, id, blob)
 * @param nuvem        (corpo) => resposta de POST /dados/sincronizar
 * @param estado       { v, desde, continuar, marcas }  (ou vazio)
 * @param salvarEstado (estado) => Promise  — chamado depois de cada passo que já valeu
 * @param lerDados     () => dados.json atual (objeto)
 * @param aplicar      (remoto) => Promise<boolean>  — junta no dados.json local e grava; true se algo mudou. Se lançar, nada avança.
 * @returns { estado, resumo }
 */
export async function trocar({ chave, cifrar, decifrar, nuvem, estado, salvarEstado = async () => {}, lerDados, aplicar }) {
  const est = { ...estadoVazio(), ...(estado || {}) }
  est.marcas = { ...(est.marcas || {}) }
  const resumo = { enviados: 0, recebidos: 0, aplicados: 0, ignorados: 0, ilegiveis: 0, recusados: [] }
  const tentados = new Set() // recusados (ou já mandados) nesta troca: não entram de novo no laço

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    // ---- o que mudou aqui
    const regs = await registrosDe(await lerDados())
    const pend = planejar(regs, est.marcas, tentados)
    const mudancas = [], enviados = new Map()
    let bytes = 0
    for (const p of pend) {
      const blob = await cifrar(chave, p.id, p.obj)
      if (mudancas.length && (bytes + blob.length > LOTE_BYTES || mudancas.length >= LOTE_REGISTROS)) break
      mudancas.push({ id: p.id, tipo: p.tipo, mudou: p.mudou, blob })
      enviados.set(p.id, p)
      bytes += blob.length
    }
    // ---- troca (e baixa tudo o que falta, em partes)
    let r = await nuvem({ desde: est.desde, mudancas, ...(est.continuar ? { continuar: true } : {}) })
    const fora = new Set((r.recusados || []).map((x) => x.id))
    for (const x of r.recusados || []) { resumo.recusados.push(x); tentados.add(x.id) }
    for (const [id, p] of enviados) {
      if (fora.has(id)) continue
      est.marcas[id] = { h: p.h, mudou: p.mudou }
      resumo.enviados++
    }
    const chegados = new Map() // id -> { id, obj, mudou }
    let falhas = 0, lidos = 0, desdeNovo = est.desde, maisNovo = false
    for (let pagina = 0; pagina < 200; pagina++) {
      for (const reg of r.registros || []) {
        const tipo = tipoDoId(reg.id)
        if (!tipo || reg.tipo !== tipo) { resumo.ignorados++; continue } // página, espaço, início... são de outro módulo
        if (reg.apagado) { resumo.ignorados++; continue } // o app nunca apaga o registro: apagar é marcar o objeto
        const marca = est.marcas[reg.id]
        if (marca && marca.mudou > reg.mudou) continue // versão velha
        let obj
        try { obj = await decifrar(chave, reg.id, reg.blob); lidos++ } catch { falhas++; continue }
        if (marca && marca.mudou === reg.mudou && marca.h === hashDe(obj)) continue // eco do que acabei de mandar
        const antigo = chegados.get(reg.id)
        if (!antigo || reg.mudou >= antigo.mudou) chegados.set(reg.id, { id: reg.id, obj, mudou: reg.mudou })
      }
      desdeNovo = r.desde; maisNovo = !!r.mais
      if (!r.mais) break
      r = await nuvem({ desde: r.desde, continuar: true })
    }
    // Tudo ilegível = a chave não serve para estes dados: não anda o cursor, para não pular nada.
    if (falhas > 0 && lidos === 0) { resumo.ilegiveis = falhas; await salvarEstado(est); throw new Error('A chave deste aparelho não abre os dados do espelho na nuvem.') }
    resumo.ilegiveis += falhas
    // ---- aplicar o que chegou (se falhar aqui, o cursor e as marcas dos recebidos NÃO andam: tenta de novo na próxima)
    let mudouAqui = false
    if (chegados.size) {
      mudouAqui = !!(await aplicar(montarRemoto([...chegados.values()])))
      resumo.recebidos += chegados.size
      if (mudouAqui) resumo.aplicados++
      for (const c of chegados.values()) est.marcas[c.id] = { h: hashDe(c.obj), mudou: c.mudou }
    }
    if (!falhas) { est.desde = desdeNovo; est.continuar = maisNovo }
    await salvarEstado(est)
    // Nada mais a mandar e nada mudou aqui por causa do que chegou: acabou.
    if (!mudancas.length && !mudouAqui) break
  }
  return { estado: est, resumo }
}
