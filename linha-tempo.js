// Navegação no tempo da aba Journal (linha do tempo e galeria): lista "por mês sob demanda" + onde estou + régua de anos.
// - Cada mês é uma seção que já existe na tela com a ALTURA ESTIMADA; o conteúdo (cartões ou miniaturas) só é montado quando o mês
//   chega perto da janela e é esvaziado de novo quando fica longe. Pular para 2017 é só rolar até a seção e montar 2 ou 3 meses.
// - Barra fixa no topo com o mês e o ANO de onde a pessoa está; tocar nela abre a folha "Ir para…" (quem chama decide a folha).
// - Régua de anos na borda direita (aparece ao rolar; arrastar mostra um balão com o mês e o ano; soltar pula para lá).
// - Botão "Hoje" para voltar ao começo quando está longe.
// Só `transform` e `opacity` mudam durante a rolagem. Nada aqui depende de passar o mouse. Não lê nem grava dados.

export const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const $ = (id) => document.getElementById(id)
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
const num = (n) => Number(n || 0).toLocaleString('pt-BR')

const PERTO = 1.3   // montar o que está a até 1,3 janelas da tela
const LONGE = 4     // esvaziar o que passou de 4 janelas
const ALTURA_BARRA = 52
const SOME_EM_MS = 1500

let M = null        // a montagem atual
let ui = null       // os elementos fixos (criados uma vez)
let agendado = false
let sumir = null
let arrastando = false
let ultimoY = 0
let medidas = { atualizacoes: 0, ultimaMs: 0, maxMs: 0 }

/** Rótulo de uma seção: "março de 2021" ou "Sem data". */
export const rotuloDe = (s) => (s.mes ? `${MES_NOME[s.mes - 1]} de ${s.ano}` : s.ano ? String(s.ano) : 'Sem data')

// ---------------------------------------------------------------- elementos fixos
const SETA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
const SETA_CIMA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>'
function garantirUi() {
  if (ui && ui.raiz.isConnected) return ui
  const tela = $('tela-journal')
  if (!tela) return null
  const raiz = h(`<div class="lt-ui" id="lt-ui" hidden>
    <button type="button" class="lt-barra" aria-label="Ir para outra data" aria-haspopup="dialog"><span class="lt-barra-rot" aria-live="off"><span class="lt-barra-mes"></span> <span class="lt-barra-ano"></span></span><span class="lt-barra-n"></span>${SETA}</button>
    <div class="lt-regua" aria-hidden="true"><div class="lt-trilho"></div><i class="lt-polegar"></i></div>
    <div class="lt-balao" aria-hidden="true"><b></b><small></small></div>
    <button type="button" class="lt-voltar" aria-label="Voltar ao começo da lista">${SETA_CIMA}<span>Hoje</span></button>
  </div>`)
  tela.appendChild(raiz)
  ui = {
    raiz, barra: raiz.querySelector('.lt-barra'), mes: raiz.querySelector('.lt-barra-mes'), ano: raiz.querySelector('.lt-barra-ano'), n: raiz.querySelector('.lt-barra-n'),
    regua: raiz.querySelector('.lt-regua'), trilho: raiz.querySelector('.lt-trilho'), polegar: raiz.querySelector('.lt-polegar'),
    balao: raiz.querySelector('.lt-balao'), voltar: raiz.querySelector('.lt-voltar'),
  }
  ui.barra.onclick = () => { if (M?.aoAbrirIrPara) M.aoAbrirIrPara() }
  ui.voltar.onclick = () => voltarAoTopo()
  ligarRegua()
  return ui
}

// ---------------------------------------------------------------- montar e desmontar
/**
 * @param o.mural      o elemento da lista
 * @param o.chave      assinatura do conteúdo: igual à da montagem atual = não refaz nada (devolve false)
 * @param o.secoes     [{ key, ano, mes (1-12, 0 = sem data), n, ... }] do mais novo para o mais antigo
 * @param o.estimar    (sec, ctx) => altura em px do corpo ainda vazio (ctx.largura = largura do mural)
 * @param o.renderizar (sec, corpo) => void   monta o conteúdo do mês
 * @param o.liberar    (sec, corpo) => void   (opcional) solta o que o conteúdo segurava (observadores)
 * @param o.unidade    ['item','itens'] para "34 itens" na barra
 * @param o.aoAbrirIrPara  () => void   a barra foi tocada
 * @param o.reiniciar  volta a rolagem para o começo
 */
export function montar(o) {
  if (M && M.chave === o.chave && M.mural === o.mural && o.mural.isConnected && o.mural.querySelector('.lt-sec')) { atualizar(); return false }
  desmontar(false)
  try { history.scrollRestoration = 'manual' } catch { /* segue */ } // o Voltar do Android não devolve a rolagem antiga por cima de um pulo
  const u = garantirUi()
  if (!u) return false
  const { mural } = o
  mural.innerHTML = ''
  mural.classList.add('jor-novo', 'lt-mural')
  const secoes = o.secoes.map((s) => ({ ...s, rend: false, alt: 0, h: 0 }))
  M = { ...o, secoes, bandas: [], atual: -1, direcao: 1 }
  const frag = document.createDocumentFragment()
  for (const s of secoes) {
    s.el = h(`<section class="lt-sec" data-k="${s.key}" data-n="${s.n}"><h3 class="jor-mes lt-cab">${rotuloDe(s)}</h3><div class="lt-corpo"></div></section>`)
    s.corpo = s.el.querySelector('.lt-corpo')
    frag.appendChild(s.el)
  }
  mural.appendChild(frag)
  estimarTodas()
  montarBandas()
  desenharRegua()
  u.raiz.hidden = false
  if (o.reiniciar && scrollY > 0) window.scrollTo(0, 0)
  window.addEventListener('scroll', aoRolar, { passive: true })
  window.addEventListener('resize', aoRedimensionar, { passive: true })
  atualizar(true)
  return true
}

export function desmontar(limpar = true) {
  if (M) {
    for (const s of M.secoes) if (s.rend) M.liberar?.(s, s.corpo)
    window.removeEventListener('scroll', aoRolar)
    window.removeEventListener('resize', aoRedimensionar)
    M.mural.classList.remove('lt-mural')
  }
  M = null
  clearTimeout(sumir)
  if (ui) { ui.raiz.hidden = true; ui.raiz.classList.remove('mostra-barra', 'mostra-regua', 'mostra-voltar', 'arrastando') }
  void limpar
}
export const montado = () => !!M

function estimarTodas() {
  if (!M) return
  const ctx = { largura: M.mural.clientWidth }
  for (const s of M.secoes) if (!s.rend) { s.corpo.style.height = Math.max(0, Math.round(M.estimar(s, ctx))) + 'px'; s.alt = parseFloat(s.corpo.style.height) }
}
function aoRedimensionar() { estimarTodas(); montarBandas(); desenharRegua(); atualizar() }

// ---------------------------------------------------------------- montar/esvaziar um mês
function montarSecao(s) {
  s.corpo.style.height = ''
  M.renderizar(s, s.corpo)
  s.rend = true
}
function esvaziarSecao(s) {
  const alt = s.corpo.offsetHeight
  M.liberar?.(s, s.corpo)
  s.corpo.textContent = ''
  s.corpo.style.height = alt + 'px'
  s.alt = alt
  s.rend = false
}

// ---------------------------------------------------------------- o laço da rolagem
function aoRolar() {
  mostrarRegua()
  if (agendado) return
  agendado = true
  requestAnimationFrame(() => { agendado = false; atualizar() })
}

/** Monta o que está perto, esvazia o que está longe, compensa mudanças de altura acima da tela e atualiza barra e régua. */
export function atualizar(inicial = false) {
  if (!M) return
  const tela = $('tela-journal')
  if (!tela || tela.hidden || !M.mural.isConnected) return
  const t0 = performance.now()
  const vh = innerHeight
  const secs = M.secoes
  const base = M.mural.getBoundingClientRect().top + scrollY
  let topo = scrollY - base
  const tops = secs.map((s) => s.el.offsetTop), alts = secs.map((s) => s.el.offsetHeight)
  // 1) alturas que mudaram acima da tela (foto que chegou, etc.): segura o que a pessoa está olhando
  let comp = 0
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i]
    if (s.rend && s.h && alts[i] !== s.h && tops[i] + s.h <= topo) comp += alts[i] - s.h
  }
  // 2) o que montar e o que esvaziar
  const p0 = topo - PERTO * vh, p1 = topo + vh + PERTO * vh
  const l0 = topo - LONGE * vh, l1 = topo + vh + LONGE * vh
  const montar = [], esvaziar = []
  for (let i = 0; i < secs.length; i++) {
    const a = tops[i], b = a + alts[i]
    const perto = b >= p0 && a <= p1, longe = b < l0 || a > l1
    if (!secs[i].rend && perto) montar.push(i)
    else if (secs[i].rend && longe) esvaziar.push(i)
  }
  for (const i of esvaziar) esvaziarSecao(secs[i])
  for (const i of montar) {
    const antes = secs[i].alt
    montarSecao(secs[i])
    const depois = secs[i].corpo.offsetHeight
    if (tops[i] + alts[i] <= topo) comp += depois - antes // o mês montado está inteiro acima da tela
  }
  if (comp) { window.scrollBy({ top: comp, left: 0, behavior: 'instant' }); topo = scrollY - base }
  // 3) guarda as alturas de agora
  for (const s of secs) { s.h = s.el.offsetHeight; if (s.rend) s.alt = s.corpo.offsetHeight }
  // 4) onde estou
  const novoTops = secs.map((s) => s.el.offsetTop)
  let atual = 0
  for (let i = 0; i < secs.length; i++) { if (novoTops[i] <= topo + ALTURA_BARRA + 14) atual = i; else break }
  // depois de um pulo, o mês escolhido é o "onde estou" mesmo que o fim da página não deixe subir o cabeçalho até a barra (mês mais antigo)
  if (M.alvo) { if (Math.abs(scrollY - M.alvo.y) <= 3) atual = M.alvo.i; else M.alvo = null }
  mostrarOndeEstou(atual, inicial, topo, vh)
  const ms = performance.now() - t0
  medidas = { atualizacoes: medidas.atualizacoes + 1, ultimaMs: ms, maxMs: Math.max(medidas.maxMs, ms) }
}
export const medidasDeRolagem = () => ({ ...medidas, montadas: M ? M.secoes.filter((s) => s.rend).length : 0, secoes: M ? M.secoes.length : 0 })

function mostrarOndeEstou(atual, inicial, topo, vh) {
  if (!ui) return
  const s = M.secoes[atual]
  if (atual !== M.atual) {
    M.direcao = atual > M.atual ? 1 : -1
    M.atual = atual
    const partes = s.mes ? [MES_NOME[s.mes - 1], String(s.ano)] : [s.ano ? String(s.ano) : 'Sem data', '']
    ui.mes.textContent = partes[0]
    ui.ano.textContent = partes[1]
    const [um, varios] = M.unidade || ['item', 'itens']
    ui.n.textContent = `${num(s.n)} ${s.n === 1 ? um : varios}`
    if (!inicial && !reduz()) {
      const r = ui.barra.querySelector('.lt-barra-rot')
      r.classList.remove('troca-desce', 'troca-sobe')
      void r.offsetWidth
      r.classList.add(M.direcao > 0 ? 'troca-desce' : 'troca-sobe')
    }
    posicionarPolegar()
  }
  ui.raiz.classList.toggle('mostra-barra', topo > 8)
  ui.raiz.classList.toggle('mostra-voltar', topo > vh * 1.6)
  for (const a of ui.regua.querySelectorAll('.lt-rot.agora')) a.classList.remove('agora')
  const banda = M.bandas.findIndex((b) => b.secs.includes(atual))
  if (banda >= 0) ui.regua.querySelector(`.lt-rot[data-b="${banda}"]`)?.classList.add('agora')
}

// ---------------------------------------------------------------- pular
/** Rola até o mês (instantâneo) e já monta o que está em volta. Devolve os ms que levou até o mês estar na tela. */
export function irPara(key) {
  if (!M) return 0
  const t0 = performance.now()
  const s = M.secoes.find((x) => x.key === key)
  if (!s) return 0
  const base = M.mural.getBoundingClientRect().top + scrollY
  window.scrollTo({ top: Math.max(0, base + s.el.offsetTop - ALTURA_BARRA - 6), left: 0, behavior: 'instant' })
  M.alvo = { i: M.secoes.indexOf(s), y: scrollY }
  atualizar()
  // montar os de cima pode ter mexido: confere o alvo uma vez
  const base2 = M.mural.getBoundingClientRect().top + scrollY
  const alvo = Math.max(0, base2 + s.el.offsetTop - ALTURA_BARRA - 6)
  if (Math.abs(alvo - scrollY) > 2) { window.scrollTo({ top: alvo, left: 0, behavior: 'instant' }); M.alvo = { i: M.secoes.indexOf(s), y: scrollY }; atualizar() }
  s.el.classList.remove('chegou'); void s.el.offsetWidth; if (!reduz()) s.el.classList.add('chegou')
  mostrarRegua()
  return performance.now() - t0
}
export function voltarAoTopo() {
  const longe = scrollY > innerHeight * 4
  window.scrollTo({ top: 0, left: 0, behavior: longe || reduz() ? 'instant' : 'smooth' })
  if (longe) atualizar()
}

/** Para a folha "Ir para…": os anos com seus meses e as contagens. */
export function anos() {
  if (!M) return []
  const por = new Map()
  for (const s of M.secoes) {
    const a = s.ano || 0
    if (!por.has(a)) por.set(a, { ano: a, n: 0, meses: [] })
    const g = por.get(a)
    g.n += s.n
    g.meses.push({ mes: s.mes, key: s.key, n: s.n })
  }
  return [...por.values()]
}
export const unidade = () => M?.unidade || ['item', 'itens']
export const secaoAtual = () => (M && M.atual >= 0 ? M.secoes[M.atual] : null)

// ---------------------------------------------------------------- régua de anos
function montarBandas() {
  if (!M) return
  const por = new Map()
  M.secoes.forEach((s, i) => { const a = s.ano || 0; if (!por.has(a)) por.set(a, { ano: a, secs: [] }); por.get(a).secs.push(i) })
  M.bandas = [...por.values()]
}
function desenharRegua() {
  if (!ui || !M) return
  const n = M.bandas.length
  ui.regua.hidden = n < 2
  ui.trilho.innerHTML = ''
  const alto = Math.max(120, innerHeight - 112 - 156)
  const cabem = Math.max(2, Math.floor(alto / 22))
  const passo = Math.ceil(n / cabem)
  M.bandas.forEach((b, i) => {
    const mostra = i % passo === 0
    const el = h(`<span class="lt-rot${mostra ? '' : ' ponto'}" data-b="${i}" style="top:${(((i + 0.5) / n) * 100).toFixed(3)}%">${mostra ? (b.ano || 's/d') : ''}</span>`)
    ui.trilho.appendChild(el)
  })
  posicionarPolegar()
}
/** Posição (0 a 1) de um mês na régua: cada ano tem a mesma faixa; dentro dela, os meses que existem. */
function fracaoDe(idx) {
  const n = M.bandas.length
  const bi = M.bandas.findIndex((b) => b.secs.includes(idx))
  if (bi < 0) return 0
  const b = M.bandas[bi]
  return (bi + (b.secs.indexOf(idx) + 0.5) / b.secs.length) / n
}
function secaoDaFracao(f) {
  const n = M.bandas.length
  const x = Math.min(0.99999, Math.max(0, f)) * n
  const bi = Math.floor(x)
  const b = M.bandas[bi]
  return b.secs[Math.min(b.secs.length - 1, Math.floor((x - bi) * b.secs.length))]
}
function posicionarPolegar(fracao = null) {
  if (!ui || !M || M.atual < 0) return
  const alto = ui.trilho.clientHeight || Math.max(120, innerHeight - 112 - 156)
  const f = fracao ?? fracaoDe(M.atual)
  ui.polegar.style.transform = `translateY(${(f * alto).toFixed(1)}px)`
}
function mostrarRegua() {
  if (!ui || !M) return
  ui.raiz.classList.add('mostra-regua')
  clearTimeout(sumir)
  if (!arrastando) sumir = setTimeout(() => ui.raiz.classList.remove('mostra-regua'), SOME_EM_MS)
}
function ligarRegua() {
  const { regua, trilho, balao } = ui
  let alvo = null
  const mover = (clientY) => {
    if (!M) return
    const r = trilho.getBoundingClientRect()
    const f = Math.min(0.99999, Math.max(0, (clientY - r.top) / Math.max(1, r.height)))
    const idx = secaoDaFracao(f)
    alvo = M.secoes[idx]
    ultimoY = clientY
    balao.querySelector('b').textContent = alvo.mes ? MES_NOME[alvo.mes - 1] : 'Sem data'
    balao.querySelector('small').textContent = alvo.mes ? String(alvo.ano) : ''
    balao.style.transform = `translateY(${Math.round(Math.min(innerHeight - 140, Math.max(60, clientY - 38)))}px)`
    posicionarPolegar(f)
  }
  regua.addEventListener('pointerdown', (ev) => {
    if (ev.button) return
    ev.preventDefault()
    arrastando = true
    clearTimeout(sumir)
    try { regua.setPointerCapture(ev.pointerId) } catch { /* sem captura: segue pelo evento */ }
    ui.raiz.classList.add('arrastando', 'mostra-regua')
    mover(ev.clientY)
  })
  regua.addEventListener('pointermove', (ev) => { if (arrastando) mover(ev.clientY) })
  const soltar = (ev) => {
    if (!arrastando) return
    arrastando = false
    ui.raiz.classList.remove('arrastando')
    if (ev.type === 'pointerup' && alvo) irPara(alvo.key)
    alvo = null
    mostrarRegua()
  }
  regua.addEventListener('pointerup', soltar)
  regua.addEventListener('pointercancel', soltar)
  // tocar perto da borda direita (em qualquer lugar da lista) também acorda a régua, sem atrapalhar o toque
  window.addEventListener('pointerdown', (ev) => {
    if (M && ev.pointerType === 'touch' && ev.clientX > innerWidth - 56 && !$('tela-journal')?.hidden) mostrarRegua()
  }, { passive: true, capture: true })
}
export const reguaVisivel = () => !!ui?.raiz.classList.contains('mostra-regua')
