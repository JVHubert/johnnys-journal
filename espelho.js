// Espelho cifrado dos dados do celular (Etapa 2, Fase 4c): dias, notas, memórias, contadores, hábitos e plano
// passam TAMBÉM pela nuvem (cifrados), em paralelo ao backup do GitHub, que continua igual.
// Nada aqui substitui o localStorage, o juntar.js ou o GitHub: este é um segundo canal que converge com o primeiro
// porque o juntar.js é por carimbo e idempotente. Lógica pura em espelho-nucleo.mjs (cópia idêntica da mestra).
//
// Só roda com a chave dos dados aberta (a mesma de "Páginas do PC", em armazem.js). Sem chave, não faz nada.
// Guarda o seu estado (cursor próprio e marcas por registro) num banco separado do das páginas: "jj-espelho".
import { cifrar, decifrar } from './cifra.mjs'
import * as A from './armazem.js'
import { trocar, estadoVazio, VERSAO_ESTADO, canon } from './espelho-nucleo.mjs'

export const CHAVE_ANTES = 'jj-antes-espelho'
const dois = (n) => String(n).padStart(2, '0')
export const diaDe = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}` }

// ---------------------------------------------------------------- estado (IndexedDB "jj-espelho")
const NOME = 'jj-espelho'
let abrindo = null
function abrir() {
  if (abrindo) return abrindo
  abrindo = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('estado', { keyPath: 'k' }); r.result.createObjectStore('antes', { keyPath: 'k' }) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => { abrindo = null; falha(r.error) }
    r.onblocked = () => { abrindo = null; falha(new Error('o espelho está aberto em outra aba')) }
  })
  return abrindo
}
async function com(loja, modo, fazer) {
  const db = await abrir()
  return new Promise((ok, falha) => {
    const t = db.transaction([loja], modo)
    const q = fazer(t.objectStore(loja))
    t.oncomplete = () => ok(q?.result)
    t.onerror = t.onabort = () => falha(t.error)
  })
}
export const lerEstadoIdb = async () => { const e = await com('estado', 'readonly', (l) => l.get('estado')); return e && e.v === VERSAO_ESTADO ? e : { ...estadoVazio(), k: 'estado' } }
export const gravarEstadoIdb = (est) => com('estado', 'readwrite', (l) => l.put({ ...est, k: 'estado' }))

// ---------------------------------------------------------------- cópia de segurança antes de aplicar o que veio da nuvem
/** Uma vez por dia: guarda o objeto antigo em localStorage `jj-antes-espelho` (se não couber, no IndexedDB). Síncrono de propósito. */
export function guardarAntes(dados, agora = Date.now(), ls = globalThis.localStorage) {
  const hoje = diaDe(agora)
  try {
    const atual = JSON.parse(ls.getItem(CHAVE_ANTES) || 'null')
    if (atual && atual.dia === hoje) return 'ja-tinha'
  } catch { /* cópia ilegível: refaz */ }
  const copia = { dia: hoje, quando: agora, dados }
  try { ls.setItem(CHAVE_ANTES, JSON.stringify(copia)); return 'localStorage' } catch { /* cheio: tenta o IndexedDB */ }
  com('antes', 'readwrite', (l) => l.put({ k: 'antes', ...copia })).catch(() => {}) // não bloqueia: o juntar nunca perde dado
  return 'indexeddb'
}

// ---------------------------------------------------------------- o espelho
/**
 * @param lerChave     () => Promise<CryptoKey|null>
 * @param lerEstado, gravarEstado
 * @param ui           { nuvem(rota, corpo, metodo) }  (o `nuvem` do novo.js)
 * @param lerDados     () => dados atuais (objeto vivo do app)
 * @param juntar       (local, remoto) => objeto novo (o JJ.juntar do juntar.js)
 * @param guardarAntes (dadosAntigos) => void
 * @param aoAplicar    (juntado) => void   — o app troca `dados`, salva e redesenha
 */
export function criarEspelho({ lerChave, lerEstado, gravarEstado, ui, lerDados, juntar, guardarAntes: guardar = () => {}, aoAplicar, agora = Date.now }) {
  let rodando = null
  let refazer = false
  async function umaTroca() {
    const chave = await lerChave()
    if (!chave) return { semChave: true }
    const estado = await lerEstado()
    try {
      const { estado: novo, resumo } = await trocar({
        chave, cifrar, decifrar, estado,
        nuvem: (corpo) => ui.nuvem('/dados/sincronizar', corpo),
        salvarEstado: (e) => gravarEstado({ ...e, erro: null, ultima: agora() }),
        lerDados,
        // tudo síncrono entre ler e trocar `dados`: uma edição do usuário no meio não se perde
        aplicar: async (remoto) => {
          const local = lerDados()
          const junto = juntar(local, remoto)
          if (canon(junto) === canon(local)) return false
          guardar(local)
          aoAplicar(junto)
          return true
        },
      })
      await gravarEstado({ ...novo, erro: null, ultima: agora() })
      return { ok: true, resumo }
    } catch (err) {
      const offline = err instanceof TypeError || /Failed to fetch|NetworkError|Load failed|sem-ligacao/i.test(err.message || '')
      if (!offline) { try { await gravarEstado({ ...(await lerEstado()), erro: String(err.message || err).slice(0, 300), erroDesde: agora() }) } catch { /* segue */ } }
      return { erro: err.message || String(err), offline }
    }
  }
  /** Nunca lança. Uma troca por vez; se chamarem durante uma, faz mais uma logo depois. */
  function sincronizar() {
    if (rodando) { refazer = true; return rodando }
    rodando = umaTroca().finally(() => {
      rodando = null
      if (refazer) { refazer = false; setTimeout(sincronizar, 50) }
    })
    return rodando
  }
  return { sincronizar, sincronizando: () => !!rodando }
}

// ---------------------------------------------------------------- ligação com o app (chamado de novo.js)
let espelho = null, timer = null
/** ui: { nuvem, buscarLigacao, lerDados, juntar, aoAplicar, demo? } */
export function iniciar(ui) {
  if (ui.demo || !('indexedDB' in globalThis)) return null
  espelho = criarEspelho({
    lerChave: () => A.lerChave(), lerEstado: lerEstadoIdb, gravarEstado: gravarEstadoIdb,
    ui, lerDados: ui.lerDados, juntar: ui.juntar, guardarAntes: (d) => guardarAntes(d), aoAplicar: ui.aoAplicar,
  })
  /** Chamado depois de cada salvar() e de cada sincronização do GitHub: espera um pouco (muitos toques seguidos viram uma troca só). */
  const agendar = (ms = 3000) => { clearTimeout(timer); timer = setTimeout(() => espelho.sincronizar(), ms) }
  window.jjEspelho = {
    agendar, sincronizar: () => espelho.sincronizar(), estado: () => lerEstadoIdb(),
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(800) })
  setInterval(() => { if (document.visibilityState === 'visible') agendar(500) }, 60_000)
  agendar(2500) // ao abrir: se a chave já está aberta, confere o que mudou
  return window.jjEspelho
}
