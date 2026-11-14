// Galeria do Journal: grade de miniaturas por mês e o visor em tela cheia (deslizar, data e título, "Abrir a página").
// As imagens vêm de dois lugares: as páginas do PC (hash de /imagens/<hash>.<ext>, miniatura e original cifrados na nuvem) e as
// fotos que nascem no celular (ilustração do dia, fotos de notas e do dia). A lista de quais imagens cada página tem fica no
// resumo da página (`imagens`, ver armazem.js): a galeria nunca abre as páginas.
// Miniaturas só são buscadas quando chegam perto da tela, no máximo 6 ao mesmo tempo. Só `opacity` e `transform` animam.
import * as P from './paginas.js'
import { MES_NOME } from './linha-tempo.js'

const h = P.h
const num = P.num
const COLUNAS = 3
const ESPACO = 2
const MAX_BAIXANDO = 6
let lig = null // { abrirCamada, fecharCamada, abrirItem, carregarFoto }
export const iniciar = (ligacoes) => { lig = ligacoes }

const dataLonga = (k) => { if (!k) return 'Sem data'; const [a, m, d] = k.split('-').map(Number); return `${d} de ${MES_NOME[m - 1]} de ${a}` }

// ---------------------------------------------------------------- agrupar por mês
/** itens: [{ tipo:'pc'|'cel', hash|caminho, data:'AAAA-MM-DD'|'', titulo, ... }] já do mais novo para o mais antigo. */
export function secoesDaGaleria(itens) {
  const secoes = []
  let atual = null
  itens.forEach((it, idx) => {
    it.idx = idx
    const mes = it.data ? it.data.slice(0, 7) : ''
    if (!atual || atual.key !== (mes || 'sem-data')) {
      const [a, m] = mes ? mes.split('-').map(Number) : [0, 0]
      atual = { key: mes || 'sem-data', ano: a, mes: m, n: 0, itens: [] }
      secoes.push(atual)
    }
    atual.itens.push(it); atual.n++
  })
  return secoes
}
/** Altura exata do corpo de um mês ainda vazio: linhas de quadrados mais os espaços. */
export function estimarGrade(sec, { largura }) {
  const cel = (largura + 32 - ESPACO * (COLUNAS - 1)) / COLUNAS
  const linhas = Math.ceil(sec.n / COLUNAS)
  return linhas * cel + Math.max(0, linhas - 1) * ESPACO
}

// ---------------------------------------------------------------- miniaturas: só as que chegam perto da tela, 6 por vez
const fila = []
let baixando = 0
let observador = null
const medidas = { pedidas: 0, ok: 0, faltou: 0, msTotal: 0, maxSimultaneas: 0 }
export const medidasDaGaleria = () => ({ ...medidas })
function garantirObservador() {
  if (observador) return observador
  observador = new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      const el = en.target
      if (en.isIntersecting) { if (!el._naFila && !el._feito) { el._naFila = true; fila.push(el) } }
      else if (el._naFila) { const k = fila.indexOf(el); if (k >= 0) fila.splice(k, 1); el._naFila = false }
    }
    bombear()
  }, { rootMargin: '320px 0px' })
  return observador
}
function bombear() {
  // o que entrou na tela por último é o que a pessoa está olhando: sai primeiro
  while (baixando < MAX_BAIXANDO && fila.length) {
    const el = fila.pop()
    el._naFila = false
    if (!el.isConnected || el._feito) continue
    baixando++
    medidas.maxSimultaneas = Math.max(medidas.maxSimultaneas, baixando)
    carregarCelula(el).catch(() => marcarFalta(el)).finally(() => { baixando--; bombear() })
  }
}
function marcarFalta(el) {
  el._feito = true
  el.classList.add('sem')
  el.title = 'imagem ainda não chegou'
  medidas.faltou++
}
async function carregarCelula(el) {
  const it = el._item
  const img = el.querySelector('img')
  const t0 = performance.now()
  medidas.pedidas++
  if (it.tipo === 'pc') {
    const url = await P.imagemDoPC(it.hash, 'mini')
    if (!el.isConnected) { el._feito = false; return }
    if (!url) { marcarFalta(el); return }
    await mostrar(el, img, url)
  } else {
    await lig.carregarFoto(it.caminho, img)
    if (!el.isConnected) { el._feito = false; return }
    if (!img.getAttribute('src')) { marcarFalta(el); return }
    el._feito = true; el.classList.add('ok')
  }
  medidas.ok++; medidas.msTotal += performance.now() - t0
}
function mostrar(el, img, url) {
  return new Promise((ok) => {
    img.onload = () => { el._feito = true; el.classList.add('ok'); ok() }
    img.onerror = () => { marcarFalta(el); ok() }
    img.src = url
  })
}

function celula(it) {
  const rotulo = `${it.titulo ? it.titulo + ', ' : ''}${dataLonga(it.data)}`
  const el = h(`<button type="button" class="gal-cel" data-i="${it.idx}" aria-label="Abrir imagem: ${rotulo.replace(/"/g, '&quot;')}"><img alt="" decoding="async"></button>`)
  el._item = it
  return el
}

/** Monta um mês (grade de quadrados). `lista` = todas as imagens, para o visor deslizar entre meses. */
export function montarMes(sec, corpo, lista, aoAbrir = null) {
  const grade = h('<div class="gal-grade"></div>')
  const io = garantirObservador()
  for (const it of sec.itens) {
    const c = celula(it)
    c.onclick = () => (aoAbrir ? aoAbrir(it.idx) : abrirVisor(lista, it.idx))
    grade.appendChild(c)
    io.observe(c)
  }
  corpo.appendChild(grade)
}
export function liberarMes(sec, corpo) {
  if (!observador) return
  for (const c of corpo.querySelectorAll('.gal-cel')) { observador.unobserve(c); if (c._naFila) { const k = fila.indexOf(c); if (k >= 0) fila.splice(k, 1); c._naFila = false } }
}
/** Solta tudo (ao sair da galeria). */
export function soltarTudo() { fila.length = 0; observador?.disconnect(); observador = null }

// ---------------------------------------------------------------- o visor em tela cheia
const SETA_VOLTAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>'
let visorAberto = null
export const visorEstaAberto = () => !!visorAberto

export function abrirVisor(lista, indice) {
  if (!lig || visorAberto || !lista.length) return
  let i = Math.max(0, Math.min(lista.length - 1, indice))
  const el = h(`<div class="gv" role="dialog" aria-modal="true" aria-label="Imagem em tela cheia">
    <div class="gv-palco"><div class="gv-pista"><div class="gv-slide"></div><div class="gv-slide"></div><div class="gv-slide"></div></div></div>
    <header class="gv-topo"><button type="button" class="gv-fechar" data-a="fechar" aria-label="Fechar a imagem">${SETA_VOLTAR}</button><span class="gv-pos" aria-live="polite"></span></header>
    <footer class="gv-pe"><div class="gv-info"><b class="gv-titulo"></b><small class="gv-data"></small><small class="gv-aviso"></small></div><button type="button" class="botao menta pequeno gv-pagina" data-a="pagina">Abrir a página</button></footer>
  </div>`)
  const palco = el.querySelector('.gv-palco'), pista = el.querySelector('.gv-pista'), slides = [...pista.children]
  const pos = el.querySelector('.gv-pos'), titulo = el.querySelector('.gv-titulo'), data = el.querySelector('.gv-data'), aviso = el.querySelector('.gv-aviso')
  const btnPagina = el.querySelector('[data-a="pagina"]')
  let larg = 0, ocupado = false

  const mostrarSlide = async (slide, item, principal) => {
    const t = (slide._t = (slide._t || 0) + 1)
    slide.textContent = ''
    slide.classList.remove('sem', 'ok')
    if (!item) return
    const img = h('<img alt="" draggable="false">')
    slide.appendChild(img)
    const pronto = () => { if (t === slide._t) slide.classList.add('ok') }
    if (item.tipo === 'pc') {
      const mini = await P.imagemDoPC(item.hash, 'mini')
      if (t !== slide._t) return
      if (mini) { img.onload = pronto; img.src = mini }
      if (principal) {
        const cheia = await P.imagemDoPC(item.hash, 'img')
        if (t !== slide._t) return
        if (cheia && cheia !== mini) { const nova = new Image(); nova.onload = () => { if (t === slide._t) { img.src = cheia; pronto() } }; nova.src = cheia }
        else if (!cheia && mini) aviso.textContent = 'O original ainda não chegou; esta é a miniatura.'
        else if (!cheia && !mini) { slide.classList.add('sem'); slide.textContent = ''; slide.appendChild(h('<p class="gv-falta">Esta imagem ainda não chegou ao celular.</p>')) }
      } else if (!mini) { slide.classList.add('sem') }
    } else {
      img.onload = pronto
      await lig.carregarFoto(item.caminho, img)
      if (t !== slide._t) return
      if (!img.getAttribute('src')) { slide.classList.add('sem'); slide.textContent = ''; slide.appendChild(h('<p class="gv-falta">Esta foto ainda não chegou ao celular.</p>')) }
    }
  }
  const preencher = () => {
    aviso.textContent = ''
    for (let k = -1; k <= 1; k++) mostrarSlide(slides[k + 1], lista[i + k], k === 0)
    const it = lista[i]
    pos.textContent = `${num(i + 1)} de ${num(lista.length)}`
    titulo.textContent = it.titulo || 'Sem título'
    data.textContent = dataLonga(it.data)
    btnPagina.hidden = !(it.tipo === 'pc' ? it.metaId : it.it)
  }
  const medir = () => { larg = palco.clientWidth }
  const parar = (px, animado) => {
    pista.style.transition = animado && !P.reduzMovimento() ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none'
    pista.style.transform = `translate3d(${px}px,0,0)`
  }
  const ir = (dir) => {
    if (ocupado) return
    if (dir < 0 && i === 0 || dir > 0 && i === lista.length - 1) { parar(-larg, true); return }
    ocupado = true
    let feito = false
    const terminar = () => {
      if (feito) return
      feito = true
      i += dir
      parar(-larg, false)
      preencher()
      ocupado = false
    }
    parar(-larg * (1 + dir), true)
    if (P.reduzMovimento()) terminar()
    else { pista.addEventListener('transitionend', terminar, { once: true }); setTimeout(terminar, 360) }
  }

  // deslizar com o dedo (ou o mouse): arrasta a pista; solta com mais de 22% da largura ou com velocidade
  let toque = null
  palco.addEventListener('pointerdown', (ev) => {
    if (ev.button || ocupado) return
    medir()
    toque = { x: ev.clientX, y: ev.clientY, t: performance.now(), dx: 0, mexeu: false, id: ev.pointerId }
    try { palco.setPointerCapture(ev.pointerId) } catch { /* segue sem captura */ }
    pista.style.transition = 'none'
  })
  palco.addEventListener('pointermove', (ev) => {
    if (!toque || ev.pointerId !== toque.id) return
    toque.dx = ev.clientX - toque.x
    if (Math.abs(toque.dx) > 8) toque.mexeu = true
    const borda = (toque.dx > 0 && i === 0) || (toque.dx < 0 && i === lista.length - 1)
    pista.style.transform = `translate3d(${-larg + (borda ? toque.dx / 3 : toque.dx)}px,0,0)`
  })
  const soltar = (ev) => {
    if (!toque || ev.pointerId !== toque.id) return
    const { dx, t, mexeu } = toque
    toque = null
    if (ev.type === 'pointercancel') { parar(-larg, true); return }
    const vel = dx / Math.max(1, performance.now() - t) // px por ms
    if (!mexeu) { parar(-larg, false); el.classList.toggle('gv-limpo'); return } // toque simples: a interface some e volta
    if (dx < -larg * 0.22 || vel < -0.5) ir(1)
    else if (dx > larg * 0.22 || vel > 0.5) ir(-1)
    else parar(-larg, true)
  }
  palco.addEventListener('pointerup', soltar)
  palco.addEventListener('pointercancel', soltar)

  const teclas = (ev) => {
    if (ev.key === 'ArrowRight') ir(1)
    else if (ev.key === 'ArrowLeft') ir(-1)
    else if (ev.key === 'Escape') { ev.preventDefault(); lig.fecharCamada() }
  }
  el.querySelector('[data-a="fechar"]').onclick = () => lig.fecharCamada()
  btnPagina.onclick = async () => {
    const it = lista[i]
    await lig.fecharCamada()
    if (it.tipo === 'pc') P.abrirPagina(it.metaId)
    else if (it.it) lig.abrirItem(it.it)
  }
  const aoRedimensionar = () => { medir(); parar(-larg, false) }
  window.addEventListener('resize', aoRedimensionar)
  document.addEventListener('keydown', teclas)
  document.body.appendChild(el)
  visorAberto = el
  medir(); parar(-larg, false)
  preencher()
  lig.abrirCamada(() => {
    document.removeEventListener('keydown', teclas)
    window.removeEventListener('resize', aoRedimensionar)
    el.classList.add('saindo')
    visorAberto = null
    const tirar = () => el.remove()
    if (P.reduzMovimento()) tirar(); else setTimeout(tirar, 180)
  })
  el.querySelector('.gv-fechar').focus({ preventScroll: true })
  // para os testes e para quem quiser: ir pelo código
  el.irPara = (d) => ir(d)
}
