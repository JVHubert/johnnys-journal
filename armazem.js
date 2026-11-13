// Armazém das páginas do PC no celular (Etapa 2). IndexedDB "jj-dados", FORA do localStorage:
// nada do que o app já guarda (hábitos, notas, tarefas...) passa por aqui.
//
// Lojas:
//   paginas   {id, titulo, espaco, data, quando, criada, atualizada, mudou, previa, origem, pendente?, apagado?}  (só o resumo: listar é rápido)
//   conteudo  {id, pg}      a página inteira como veio do PC (doc e todos os outros campos; é daqui que a edição sai)
//   textos    {id, texto}   texto puro da página (busca e trecho)
//   espacos   {id: 'espaco:xxx', obj, mudou, apagado?}
//   inicio    {id: 'inicio', obj, mudou}   (também guarda {id: 'pessoas', obj: {lista}, mudou}: a lista de pessoas do PC)
//   estado    {k: 'estado', desde, cofre, total, ultima, avisos, ilegiveis}
//   chave     {k: 'chave', chave: CryptoKey NÃO extraível}   <- a chave dos dados nunca vai para localStorage nem para a nuvem
//   arquivos  {k: 'img/<hash>' | 'mini/<hash>', bytes, mime}  cache das imagens já decifradas

const NOME = 'jj-dados'
const VERSAO = 1
let abrindo = null

export function abrir() {
  if (abrindo) return abrindo
  abrindo = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, VERSAO)
    r.onupgradeneeded = () => {
      const db = r.result
      const p = db.createObjectStore('paginas', { keyPath: 'id' })
      p.createIndex('espaco', 'espaco')
      db.createObjectStore('conteudo', { keyPath: 'id' })
      db.createObjectStore('textos', { keyPath: 'id' })
      db.createObjectStore('espacos', { keyPath: 'id' })
      db.createObjectStore('inicio', { keyPath: 'id' })
      db.createObjectStore('estado', { keyPath: 'k' })
      db.createObjectStore('chave', { keyPath: 'k' })
      db.createObjectStore('arquivos', { keyPath: 'k' })
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => { abrindo = null; falha(r.error) }
    r.onblocked = () => { abrindo = null; falha(new Error('o armazém está aberto em outra aba')) }
  })
  return abrindo
}

const pedido = (req) => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error) })
async function transacao(lojas, modo, fn) {
  const db = await abrir()
  return new Promise((ok, falha) => {
    const t = db.transaction(lojas, modo)
    let saida
    t.oncomplete = () => ok(saida)
    t.onerror = () => falha(t.error)
    t.onabort = () => falha(t.error || new Error('transação cancelada'))
    Promise.resolve(fn(t)).then((v) => { saida = v }, (e) => { try { t.abort() } catch { /* já fechou */ } falha(e) })
  })
}
const ler = (loja, chave) => transacao([loja], 'readonly', (t) => pedido(t.objectStore(loja).get(chave)))
const lerTudo = (loja) => transacao([loja], 'readonly', (t) => pedido(t.objectStore(loja).getAll()))

// ---------------------------------------------------------------- chave e estado
export const lerChave = async () => (await ler('chave', 'chave'))?.chave || null
export const gravarChave = (chave) => transacao(['chave'], 'readwrite', (t) => { t.objectStore('chave').put({ k: 'chave', chave }) })
export const esquecerChave = () => transacao(['chave'], 'readwrite', (t) => { t.objectStore('chave').clear() })

const ESTADO_VAZIO = () => ({ k: 'estado', desde: 0, cofre: null, total: null, ultima: 0, avisos: [], ilegiveis: [] })
export const lerEstado = async () => ({ ...ESTADO_VAZIO(), ...((await ler('estado', 'estado')) || {}) })
/** Resultado guardado de uma conta cara (ex.: as menções do diário), na loja `estado` com a chave `k`. */
export const lerGuardado = async (k) => (await ler('estado', k)) || null
export const gravarGuardado = (k, valor) => transacao(['estado'], 'readwrite', (t) => { t.objectStore('estado').put({ ...valor, k }) })
export const gravarEstado = (est) => transacao(['estado'], 'readwrite', (t) => { t.objectStore('estado').put({ ...est, k: 'estado' }) })

// ---------------------------------------------------------------- índice de busca (em memória, montado na 1ª busca)
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
let indice = null // Map id -> { t: título normalizado, c: texto normalizado }
let cacheMetas = null

// ---------------------------------------------------------------- gravação em lote (uma transação só: ou entra tudo, ou nada)
/** lote: { metas, conteudos, textos, apagarIds, espacos, inicio, estado }. `estado` entra junto: o cursor só anda se os registros entraram. */
export async function gravarLote(lote) {
  await transacao(['paginas', 'conteudo', 'textos', 'espacos', 'inicio', 'estado'], 'readwrite', (t) => {
    const p = t.objectStore('paginas'), c = t.objectStore('conteudo'), x = t.objectStore('textos')
    for (const m of lote.metas || []) p.put(m)
    for (const o of lote.conteudos || []) c.put(o)
    for (const o of lote.textos || []) x.put(o)
    for (const id of lote.apagarIds || []) { c.delete(id); x.delete(id) }
    for (const e of lote.espacos || []) t.objectStore('espacos').put(e)
    if (lote.inicio) t.objectStore('inicio').put(lote.inicio)
    if (lote.pessoas) t.objectStore('inicio').put(lote.pessoas)
    if (lote.estado) t.objectStore('estado').put({ ...lote.estado, k: 'estado' })
  })
  cacheMetas = null
  if (indice) {
    for (const o of lote.textos || []) { const m = (lote.metas || []).find((q) => q.id === o.id); indice.set(o.id, { t: normalizar(m?.titulo), c: normalizar(o.texto) }) }
    for (const id of lote.apagarIds || []) indice.delete(id)
  }
}

// ---------------------------------------------------------------- leitura
export const lerMeta = (id) => ler('paginas', id)
export async function lerPagina(id) {
  const [meta, conteudo, texto] = await Promise.all([ler('paginas', id), ler('conteudo', id), ler('textos', id)])
  return meta && !meta.apagado && conteudo ? { meta, pg: conteudo.pg, texto: texto?.texto || '' } : null
}
/** Resumo de todas as páginas vivas, mais recentes primeiro (data da página; sem data, a criação). */
export async function listarMetas() {
  if (cacheMetas) return cacheMetas
  const todas = (await lerTudo('paginas')).filter((m) => !m.apagado)
  todas.sort((a, b) => (b.quando || 0) - (a.quando || 0) || (b.atualizada || 0) - (a.atualizada || 0))
  return (cacheMetas = todas)
}
export const idDoEspaco = (m) => m.espaco || 'inbox'
export async function listarPorEspaco(espaco) { return (await listarMetas()).filter((m) => idDoEspaco(m) === espaco) }
export async function listarEspacos() { return (await lerTudo('espacos')).filter((e) => !e.apagado).map((e) => e.obj) }
export async function lerInicio() { return (await ler('inicio', 'inicio'))?.obj || null }
/** A lista de pessoas que o PC mandou ({ lista: [{id, nome, apelidos, nascimento}] }), ou null se ainda não veio. */
export async function lerPessoas() { const r = await ler('inicio', 'pessoas'); return r && !r.apagado ? { obj: r.obj, mudou: r.mudou } : null }
export const pendentes = async () => (await lerTudo('paginas')).filter((m) => m.pendente && !m.apagado)
export async function contar() {
  const metas = await listarMetas()
  const por = {}
  for (const m of metas) por[idDoEspaco(m)] = (por[idDoEspaco(m)] || 0) + 1
  return { paginas: metas.length, porEspaco: por, espacos: (await listarEspacos()).length, pendentes: metas.filter((m) => m.pendente).length }
}

/**
 * As páginas no formato que o mencoes.js (cópia do PC) espera: { id, titulo, previa, etiquetas, lugar, espaco, data }.
 * A `previa` é montada como a do PC (título, quebra de linha e o começo do texto, 240 caracteres), a partir da loja `textos`:
 * não precisa abrir as páginas inteiras. Só as do diário (`espacoDiario` e com data) levam prévia.
 * Resumos gravados antes da 2.88 não têm `etiquetas`/`lugar`: completa uma vez, lendo só esses de `conteudo`.
 */
export async function paginasParaMencoes(espacoDiario) {
  let metas = await listarMetas()
  const faltam = metas.filter((m) => m.lugar === undefined)
  if (faltam.length) {
    const novas = []
    await transacao(['conteudo'], 'readonly', async (t) => {
      for (const m of faltam) {
        const c = await pedido(t.objectStore('conteudo').get(m.id))
        novas.push({ ...m, etiquetas: c?.pg?.etiquetas || [], lugar: c?.pg?.lugar || null })
      }
    })
    await gravarLote({ metas: novas })
    metas = await listarMetas()
  }
  const doDiario = (m) => m.espaco === espacoDiario && m.data
  // só os textos das páginas do diário (as outras nem precisam de prévia): leituras em paralelo, numa transação só
  const textos = new Map()
  await transacao(['textos'], 'readonly', async (t) => {
    const loja = t.objectStore('textos')
    await Promise.all(metas.filter(doDiario).map(async (m) => { const o = await pedido(loja.get(m.id)); if (o) textos.set(m.id, o.texto || '') }))
  })
  return metas.map((m) => {
    let previa = ''
    if (doDiario(m)) {
      const titulo = String(m.titulo || '')
      const texto = textos.get(m.id) || ''
      const corpo = titulo && texto.startsWith(titulo) ? texto.slice(titulo.length).trim() : texto
      previa = (titulo + (corpo ? '\n' + corpo : '')).slice(0, 240)
    }
    return { id: m.id, titulo: m.titulo, previa, etiquetas: m.etiquetas || [], lugar: m.lugar || null, espaco: m.espaco, data: m.data }
  })
}

async function montarIndice() {
  if (indice) return indice
  const textos = await lerTudo('textos')
  const metas = new Map((await listarMetas()).map((m) => [m.id, m]))
  indice = new Map()
  for (const o of textos) { const m = metas.get(o.id); if (m) indice.set(o.id, { t: normalizar(m.titulo), c: normalizar(o.texto) }) }
  return indice
}

/** Procura no título e no conteúdo, sem acento e sem maiúscula; todas as palavras têm de aparecer. Título pesa mais. */
export async function buscar(texto, limite = 200) {
  const palavras = normalizar(texto).split(/\s+/).filter(Boolean)
  if (!palavras.length) return []
  const idx = await montarIndice()
  const metas = new Map((await listarMetas()).map((m) => [m.id, m]))
  const achados = []
  for (const [id, r] of idx) {
    let pontos = 0, ok = true
    for (const p of palavras) {
      const noTitulo = r.t.includes(p), noTexto = r.c.includes(p)
      if (!noTitulo && !noTexto) { ok = false; break }
      pontos += noTitulo ? 3 : 1
    }
    if (ok) achados.push({ id, pontos, primeira: palavras[0], onde: r.c.indexOf(palavras[0]) })
  }
  achados.sort((a, b) => b.pontos - a.pontos || (metas.get(b.id).quando || 0) - (metas.get(a.id).quando || 0))
  return achados.slice(0, limite).map((a) => ({ meta: metas.get(a.id), onde: a.onde }))
}

// ---------------------------------------------------------------- imagens (cache)
export const lerArquivo = (k) => ler('arquivos', k)
export const gravarArquivo = (k, bytes, mime) => transacao(['arquivos'], 'readwrite', (t) => { t.objectStore('arquivos').put({ k, bytes, mime }) })

// ---------------------------------------------------------------- apagar a cópia deste aparelho (a nuvem e o PC não são tocados)
export async function limparPaginas() {
  await transacao(['paginas', 'conteudo', 'textos', 'espacos', 'inicio', 'arquivos', 'estado'], 'readwrite', (t) => {
    for (const l of ['paginas', 'conteudo', 'textos', 'espacos', 'inicio', 'arquivos']) t.objectStore(l).clear()
    t.objectStore('estado').delete('mencoes')
  })
  const est = await lerEstado()
  await gravarEstado({ ...ESTADO_VAZIO(), cofre: est.cofre })
  cacheMetas = null; indice = null
}
