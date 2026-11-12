// Páginas do PC no celular, parte "sem tela" (Etapa 2): abrir o cofre, trocar registros cifrados com a nuvem e imagens.
// Segue o mesmo formato e as mesmas regras do PC (bloco-de-notas-2/src/nuvem-dados.js; FORMATO.md em etapa2-dados):
// vale o `mudou` mais novo; a versão que perde vira uma página nova "(conflito DD/MM)"; nada some em silêncio.
// Este arquivo NÃO mexe em localStorage nem nas tarefas.
import { abrirCofre, abrirComRecuperacao, paraCryptoKey, cifrar, decifrar, decifrarBytes } from './cifra.mjs'
import * as A from './armazem.js'

export const TIPOS_DO_CELULAR = new Set(['pagina', 'espaco', 'inicio'])
export const LOTE_BYTES = 1_800_000
export const LOTE_REGISTROS = 300
const dois = (n) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- utilidades (mesmas do PC)
export function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
}
export const tipoDoId = (id) => (id === 'inicio' ? 'inicio' : String(id).startsWith('espaco:') ? 'espaco' : 'pagina')
export const rotuloConflito = (agora) => { const d = new Date(agora); return `(conflito ${dois(d.getDate())}/${dois(d.getMonth() + 1)})` }
function docComSufixo(doc, sufixo) {
  const novo = JSON.parse(JSON.stringify(doc && doc.type === 'doc' ? doc : { type: 'doc', content: [] }))
  let feito = false
  ;(function andar(n) {
    if (feito || !n) return
    if (n.type === 'text' && n.text && n.text.trim()) { n.text = n.text.replace(/\s+$/, '') + ' ' + sufixo; feito = true; return }
    n.content?.forEach(andar)
  })(novo)
  if (!feito) novo.content = [{ type: 'paragraph', content: [{ type: 'text', text: sufixo }] }, ...(novo.content || [])]
  return novo
}
export const tituloDe = (doc) => {
  let t = ''
  ;(function andar(n) { if (t || !n) return; if (n.type === 'text' && n.text?.trim()) { t = n.text.trim(); return } n.content?.forEach(andar) })(doc)
  return !t ? 'Sem título' : t.length > 60 ? t.slice(0, 59).trimEnd() + '…' : t
}
export function copiaDeConflito(pg, agora, novoId) {
  const doc = docComSufixo(pg.doc, rotuloConflito(agora))
  return { id: novoId, pagina: { ...pg, doc, titulo: tituloDe(doc), criada: agora, atualizada: agora, pai: pg.pai ?? null } }
}
const novoIdDeCopia = (agora) => `c${agora.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ---------------------------------------------------------------- texto e resumo de uma página
const BLOCOS = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'callout', 'tableRow', 'codeBlock', 'coluna', 'secao', 'detailsSummary', 'detailsContent'])
export function textoDoDoc(doc) {
  const partes = []
  ;(function andar(n) {
    if (!n || typeof n !== 'object') return
    if (typeof n.text === 'string') { partes.push(n.text); return }
    if (n.type === 'hardBreak') { partes.push(' '); return }
    if (n.type === 'linkPagina') { partes.push(n.attrs?.titulo || ''); return }
    for (const f of Array.isArray(n.content) ? n.content : []) andar(f)
    if (BLOCOS.has(n.type)) partes.push(' ')
  })(doc)
  return partes.join('').replace(/\s+/g, ' ').trim()
}
const dataParaMs = (d) => { const t = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? Date.parse(d.slice(0, 10) + 'T12:00:00') : NaN; return Number.isFinite(t) ? t : 0 }

/** Resumo leve de uma página (o que a lista mostra). */
export function metaDe(id, pg, mudou, extra = {}) {
  const texto = textoDoDoc(pg.doc)
  const titulo = String(pg.titulo || tituloDe(pg.doc) || 'Sem título')
  const semTitulo = texto.startsWith(titulo.replace(/…$/, '')) ? texto.slice(titulo.replace(/…$/, '').length).trim() : texto
  return {
    meta: {
      id, titulo, espaco: pg.espaco || null, data: pg.data || null, quando: dataParaMs(pg.data) || pg.criada || pg.atualizada || 0,
      criada: pg.criada || 0, atualizada: pg.atualizada || 0, mudou, previa: semTitulo.slice(0, 160),
      origem: typeof pg.origem === 'string' ? pg.origem : pg.origem?.tipo || null, ...extra,
    },
    conteudo: { id, pg }, texto: { id, texto },
  }
}

// ---------------------------------------------------------------- cofre: abrir os dados
/**
 * @param ui  { nuvem(rota, corpo, metodo) }  (o `nuvem` do novo.js: já leva o endereço e a senha da ligação)
 * @returns { ok: true } ou { erro: 'senha' | 'codigo' | 'sem-cofre' | 'sem-ligacao' | 'sem-rede' }
 */
export async function abrirDados({ senha, codigo }, ui) {
  let cofre = null
  try { cofre = (await ui.nuvem('/dados/cofre', null, 'GET')).cofre || null } catch (err) {
    if (err.message === 'sem-ligacao') return { erro: 'sem-ligacao' }
    cofre = (await A.lerEstado()).cofre // sem internet: usa a cópia do cofre da última vez
    if (!cofre) return { erro: 'sem-rede' }
  }
  if (!cofre) return { erro: 'sem-cofre' }
  const crua = senha != null ? await abrirCofre(cofre, senha) : await abrirComRecuperacao(cofre, codigo)
  if (!crua) return { erro: senha != null ? 'senha' : 'codigo' }
  await A.gravarChave(await paraCryptoKey(crua, false)) // CryptoKey NÃO extraível: nem este app consegue ler a chave de volta
  const est = await A.lerEstado()
  await A.gravarEstado({ ...est, cofre })
  try { await navigator.storage?.persist?.() } catch { /* o aparelho decide */ }
  return { ok: true }
}
export const estaAberto = async () => !!(await A.lerChave())
export const bloquear = () => A.esquecerChave()

// ---------------------------------------------------------------- uma troca com a nuvem
let rodando = null
/** Nunca lança: devolve { semChave } | { erro, offline? } | { ok, resumo }. Só uma troca por vez. */
export function sincronizar(ui, aoProgresso = () => {}) {
  if (rodando) return rodando
  rodando = trocar(ui, aoProgresso).finally(() => { rodando = null })
  return rodando
}
export const sincronizando = () => !!rodando

async function trocar(ui, aoProgresso) {
  const chave = await A.lerChave()
  if (!chave) return { semChave: true }
  const resumo = { recebidos: 0, apagados: 0, enviados: 0, conflitos: 0, ilegiveis: 0, recusados: [], ignorados: 0 }
  let est = await A.lerEstado()
  const jaTentados = new Set() // recusados nesta troca não entram de novo no laço
  try {
    for (let volta = 0; volta < 30; volta++) {
      // ---- o que foi editado aqui e ainda não subiu
      const pend = (await A.pendentes()).filter((m) => !jaTentados.has(m.id))
      const mudancas = [], enviadas = new Map()
      let bytes = 0
      for (const m of pend) {
        const reg = await A.lerPagina(m.id)
        if (!reg) continue
        const blob = await cifrar(chave, m.id, reg.pg)
        if (mudancas.length && (bytes + blob.length > LOTE_BYTES || mudancas.length >= LOTE_REGISTROS)) break
        mudancas.push({ id: m.id, tipo: 'pagina', mudou: m.mudou, blob })
        enviadas.set(m.id, { mudou: m.mudou, pg: reg.pg })
        bytes += blob.length
      }
      // `continuar`: uma baixada que caiu no meio retoma exatamente do cursor (sem reler os últimos 10 s, que só servem a quem está em dia)
      let r = await ui.nuvem('/dados/sincronizar', { desde: est.desde, mudancas, ...(est.continuar ? { continuar: true } : {}) })
      const fora = new Set((r.recusados || []).map((x) => x.id))
      for (const x of r.recusados || []) { resumo.recusados.push(x); jaTentados.add(x.id) }
      for (const [id, env] of enviadas) {
        if (fora.has(id)) continue
        const m = await A.lerMeta(id)
        if (m && m.mudou === env.mudou) await A.gravarLote({ metas: [{ ...m, pendente: false }] }) // se mudou de novo enquanto subia, continua pendente
        resumo.enviados++
      }
      for (const id of enviadas.keys()) jaTentados.add(id) // já foi: se ainda estiver pendente (editou durante o envio), a próxima troca leva
      for (;;) {
        est = await aplicar(r, enviadas, chave, resumo, est, aoProgresso)
        if (!r.mais) break
        r = await ui.nuvem('/dados/sincronizar', { desde: r.desde, continuar: true })
      }
      if (!(await A.pendentes()).some((m) => !jaTentados.has(m.id))) break // nada mais a mandar
    }
    est = await A.lerEstado()
    const contagem = await A.contar()
    est.ultima = Date.now(); est.total = contagem.paginas
    await A.gravarEstado(est)
    return { ok: true, resumo, contagem }
  } catch (err) {
    const offline = err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message || '')
    if (!offline) await avisarProblema(err.message || String(err))
    return { erro: err.message || String(err), offline }
  }
}

/** Guarda um aviso na própria seção (os 5 últimos). */
export async function avisarProblema(texto) {
  const est = await A.lerEstado()
  const avisos = [{ quando: Date.now(), texto }, ...(est.avisos || []).filter((a) => a.texto !== texto)].slice(0, 5)
  await A.gravarEstado({ ...est, avisos })
}
export async function limparAvisos() { const est = await A.lerEstado(); await A.gravarEstado({ ...est, avisos: [] }) }

/** Aplica uma resposta da nuvem e anda o cursor (`desde`) na mesma transação. Devolve o estado novo. */
async function aplicar(r, enviadas, chave, resumo, est, aoProgresso) {
  const lote = { metas: [], conteudos: [], textos: [], apagarIds: [], espacos: [], inicio: null }
  const agora = Date.now()
  const regs = r.registros || []
  let falhas = 0, lidos = 0
  const ilegiveis = new Set(est.ilegiveis || [])
  const emLote = new Map() // páginas já decididas nesta resposta (a mesma não aparece duas vezes, mas por segurança)

  for (const reg of regs) {
    const tipo = tipoDoId(reg.id)
    if (!TIPOS_DO_CELULAR.has(reg.tipo) || reg.tipo !== tipo) { resumo.ignorados++; continue }
    if (tipo === 'espaco' || tipo === 'inicio') {
      const loja = tipo === 'inicio' ? await lerSimples('inicio', 'inicio') : await lerSimples('espacos', reg.id)
      if (loja && loja.mudou >= reg.mudou) continue
      let obj = null
      if (!reg.apagado) { try { obj = await decifrar(chave, reg.id, reg.blob); lidos++ } catch { falhas++; ilegiveis.add(reg.id); continue } }
      if (tipo === 'inicio') lote.inicio = { id: 'inicio', obj, mudou: reg.mudou }
      else lote.espacos.push({ id: reg.id, obj: obj || loja?.obj, mudou: reg.mudou, ...(reg.apagado ? { apagado: true } : {}) })
      resumo.recebidos++
      continue
    }
    // ---- página
    const l = emLote.get(reg.id) || (await A.lerMeta(reg.id))
    const env = enviadas.get(reg.id)
    if (env && reg.mudou <= env.mudou) continue // eco do que acabei de mandar
    if (!env && l && !l.pendente && l.mudou >= reg.mudou) continue // já tenho essa versão ou uma mais nova
    let dados = null
    if (!reg.apagado) { try { dados = await decifrar(chave, reg.id, reg.blob); lidos++; ilegiveis.delete(reg.id) } catch { falhas++; ilegiveis.add(reg.id); continue } }
    // minha versão ainda não resolvida: edição pendente, ou a que acabei de mandar
    let minha = null
    if (l?.pendente) { const c = await A.lerPagina(reg.id); if (c) minha = { mudou: l.mudou, pg: c.pg, pendente: true } }
    else if (env) minha = { mudou: env.mudou, pg: env.pg, pendente: false }
    if (minha) {
      if (minha.pendente && minha.mudou > reg.mudou) continue // a minha é mais nova: fica, e sobe na próxima
      if (reg.apagado || canon(minha.pg) !== canon(dados)) {
        // perdi: guardo a minha como página nova, para o texto nunca sumir
        resumo.conflitos++
        const c = copiaDeConflito(minha.pg, agora + resumo.conflitos, novoIdDeCopia(agora + resumo.conflitos))
        const nova = metaDe(c.id, c.pagina, c.pagina.atualizada, { pendente: true })
        lote.metas.push(nova.meta); lote.conteudos.push(nova.conteudo); lote.textos.push(nova.texto)
        emLote.set(c.id, nova.meta)
      }
    }
    if (reg.apagado) {
      lote.metas.push({ ...(l || { id: reg.id, titulo: '', espaco: null, quando: 0 }), id: reg.id, mudou: reg.mudou, apagado: true, pendente: false })
      lote.apagarIds.push(reg.id); resumo.apagados++
    } else {
      const m = metaDe(reg.id, dados, reg.mudou, { pendente: false })
      lote.metas.push(m.meta); lote.conteudos.push(m.conteudo); lote.textos.push(m.texto)
      emLote.set(reg.id, m.meta); resumo.recebidos++
    }
  }
  // Tudo ilegível = a chave não serve para estes dados: não anda o cursor, para não pular nada.
  const tudoIlegivel = falhas > 0 && lidos === 0
  const novo = { ...est, ilegiveis: [...ilegiveis].slice(0, 50) }
  if (!tudoIlegivel) { novo.desde = r.desde; novo.continuar = !!r.mais }
  lote.estado = novo
  await A.gravarLote(lote)
  if (tudoIlegivel) throw new Error('A chave deste aparelho não abre os dados da nuvem. Abra os dados de novo, com a senha.')
  resumo.ilegiveis = ilegiveis.size
  aoProgresso({ feitos: resumo.recebidos + resumo.apagados, total: est.total || null, mais: !!r.mais, resumo })
  return novo
}
const lerSimples = async (loja, id) => {
  const db = await A.abrir()
  return new Promise((ok, falha) => { const q = db.transaction([loja], 'readonly').objectStore(loja).get(id); q.onsuccess = () => ok(q.result); q.onerror = () => falha(q.error) })
}

// ---------------------------------------------------------------- salvar uma edição (a troca com a nuvem vem depois)
/** `doc` já é o documento novo. Mantém todos os outros campos da página; atualizada/mudou = agora (sempre maior que o anterior). */
export async function salvarEdicao(id, doc, agora = Date.now()) {
  const reg = await A.lerPagina(id)
  if (!reg) throw new Error('página não encontrada')
  const mudou = Math.max(agora, (reg.meta.mudou || 0) + 1)
  const pg = { ...reg.pg, doc, titulo: tituloDe(doc), atualizada: mudou }
  const m = metaDe(id, pg, mudou, { pendente: true })
  await A.gravarLote({ metas: [m.meta], conteudos: [m.conteudo], textos: [m.texto] })
  return m.meta
}

// ---------------------------------------------------------------- imagens
const MIME = (u8) => {
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png'
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg'
  if (u8[0] === 0x47 && u8[1] === 0x49) return 'image/gif'
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57) return 'image/webp'
  return 'application/octet-stream'
}
/** "/imagens/<hash>.png" -> "<hash>" (o hash é o nome sem extensão); outra coisa -> null. */
export const hashDaImagem = (src) => { const m = /^\/imagens\/([\w-]+)(?:\.\w+)?$/.exec(String(src || '')); return m ? m[1] : null }

const urls = new Map()      // chave -> blob URL
const faltando = new Map()  // chave -> quando deu 404 (não pergunta de novo por 1 minuto)
async function baixar(chaveArq, ui) {
  const guardado = await A.lerArquivo(chaveArq)
  if (guardado) return new Blob([guardado.bytes], { type: guardado.mime })
  if (Date.now() - (faltando.get(chaveArq) || 0) < 60_000) return null
  const chave = await A.lerChave()
  const l = await ui.buscarLigacao()
  if (!chave || !l) return null
  let r
  try { r = await fetch(`${l.url}/dados/arquivo?chave=${chaveArq}`, { headers: { 'x-segredo': l.segredo } }) } catch { return null }
  if (!r.ok) { faltando.set(chaveArq, Date.now()); return null }
  const claro = await decifrarBytes(chave, chaveArq, new Uint8Array(await r.arrayBuffer()))
  const mime = MIME(claro)
  await A.gravarArquivo(chaveArq, claro.buffer.slice(claro.byteOffset, claro.byteOffset + claro.byteLength), mime)
  return new Blob([claro], { type: mime })
}
/** tipo: 'mini' (miniatura) ou 'img' (original). Devolve um blob URL, ou null se a imagem ainda não chegou. */
export async function imagemSrc(hash, tipo, ui) {
  for (const t of tipo === 'img' ? ['img'] : ['mini', 'img']) { // sem miniatura, tenta o original
    const k = `${t}/${hash}`
    if (urls.has(k)) return urls.get(k)
    try {
      const b = await baixar(k, ui)
      if (b) { const u = URL.createObjectURL(b); urls.set(k, u); return u }
    } catch { /* decifrou errado ou o armazém falhou: trata como "não chegou" */ }
  }
  return null
}
export const esquecerFaltantes = () => faltando.clear()
