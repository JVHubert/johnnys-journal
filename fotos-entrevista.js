// Fotos da galeria durante a entrevista (2.98.0, app nativo casca 6). Desenho do Claude Design, com a lógica do JV:
// a entrevista do dia mostra as fotos daquele dia (o dia de onde foi aberta); a memória mostra as do início ao fim.
// Durante a gravação: faixa de fotos (meia-luz na tela escura), tocar abre a foto e marca o segundo do áudio,
// "Pôr na nota" / "Lixo". Nada é apagado durante a gravação. No fim, a revisão decide de uma vez.
// Fora do app nativo (sem window.JJNativo.fotosDoPeriodo) nada disto aparece.
const BASE_GALERIA = new URL('./__galeria/', location.href).href
export const mini = (id) => BASE_GALERIA + 'mini/' + id
export const foto = (id) => BASE_GALERIA + 'foto/' + id

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const pad = (n) => String(n).padStart(2, '0')
const hora = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`
const chaveDia = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
const ESCURECE_MS = 30000

/** De-até (ms) de um dia 'AAAA-MM-DD' ou de um período [inicio, fim]. */
export function periodo(inicio, fim = inicio) {
  const [a, m, d] = inicio.split('-').map(Number), [a2, m2, d2] = fim.split('-').map(Number)
  return { de: new Date(a, m - 1, d, 0, 0, 0).getTime(), ate: new Date(a2, m2 - 1, d2, 23, 59, 59, 999).getTime() }
}

let seq = 0
const pedidos = new Map()
function nativo(metodo, ...args) {
  return new Promise((ok) => {
    const id = 'f' + (++seq)
    pedidos.set(id, ok)
    const antes = window.__jjNativo
    // a ponte responde por window.__jjNativo; o novo.js já cuida dos ids 'n…', aqui só os 'f…'
    if (!window.__jjNativoFotos) {
      window.__jjNativoFotos = true
      window.__jjNativo = (rid, okk, msg) => { const f = pedidos.get(rid); if (f) { pedidos.delete(rid); f({ ok: okk, msg }) } else if (antes) antes(rid, okk, msg) }
    }
    window.JJNativo[metodo](id, ...args)
  })
}

export const disponivel = () => !!(window.JJNativo && typeof window.JJNativo.fotosDoPeriodo === 'function')

/** Lista das fotos do período: [{id, quando, w, h, pasta}] ou null (sem permissão / fora do app). */
export async function listar(de, ate) {
  if (!disponivel()) return null
  const r = await nativo('fotosDoPeriodo', String(de), String(ate))
  if (!r.ok) return null
  try { return JSON.parse(r.msg) } catch { return null }
}

export async function apagar(ids) {
  if (!ids.length) return { ok: true }
  return nativo('apagarFotos', JSON.stringify(ids))
}

/**
 * Começa a faixa de fotos para uma gravação.
 * @param {{ fotos: Array, rotulo: string, seg: () => number, viagem?: boolean, aviso?: (t:string) => void }} o
 */
export function comecar({ fotos, rotulo, seg, viagem = false, aviso = () => {} }) {
  const estado = { nota: new Set(), lixo: new Set(), marcos: [], ultima: null }
  const porId = new Map(fotos.map((f) => [f.id, f]))
  let escondida = false, tocouEm = Date.now()
  const faixa = h(`<section class="ff" aria-label="Fotos ${esc(rotulo)}">
    <div class="ff-topo"><b>${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'} ${esc(rotulo)}</b>
      <span class="ff-conta"><span class="ff-nota">&#9733; <i>0</i> na nota</span><span class="ff-lixo">&#10005; <i>0</i> no lixo</span></span>
      <button type="button" class="ff-esconder" aria-label="Esconder as fotos">Esconder</button></div>
    <div class="ff-trilho" role="list"></div>
    <p class="ff-dica">Toque numa foto para abrir. <span class="ff-leg-nota">&#9733; vai para a nota</span>, <span class="ff-leg-lixo">&#10005; vai para o lixo</span>.</p>
  </section>`)
  const trilho = faixa.querySelector('.ff-trilho')
  let diaAnterior = ''
  for (const f of fotos) {
    const k = chaveDia(f.quando)
    if (viagem && k !== diaAnterior) {
      const d = new Date(f.quando)
      trilho.appendChild(h(`<span class="ff-dia" aria-hidden="true">${DIAS[d.getDay()]} ${d.getDate()}</span>`))
      diaAnterior = k
    }
    const b = h(`<button type="button" class="ff-mini" role="listitem" data-id="${f.id}" aria-label="Foto das ${hora(f.quando)}"><img alt="" loading="lazy" decoding="async"><time>${hora(f.quando)}</time></button>`)
    b.querySelector('img').src = mini(f.id)
    trilho.appendChild(b)
  }
  const pintar = () => {
    trilho.querySelectorAll('.ff-mini').forEach((b) => {
      const id = Number(b.dataset.id)
      b.classList.toggle('na-nota', estado.nota.has(id))
      b.classList.toggle('no-lixo', estado.lixo.has(id))
    })
    faixa.querySelector('.ff-nota i').textContent = estado.nota.size
    faixa.querySelector('.ff-lixo i').textContent = estado.lixo.size
  }
  const acordar = () => { tocouEm = Date.now(); faixa.classList.add('acordada') }
  const vigia = setInterval(() => { if (Date.now() - tocouEm > ESCURECE_MS) faixa.classList.remove('acordada') }, 2000)
  faixa.addEventListener('pointerdown', acordar)
  faixa.querySelector('.ff-esconder').onclick = () => { escondida = true; faixa.remove(); document.body.classList.remove('com-fotos') }
  // arrastar para cima numa miniatura = lixo
  let ini = null
  trilho.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('.ff-mini'); if (b) ini = { b, x: ev.clientX, y: ev.clientY } })
  trilho.addEventListener('pointerup', (ev) => {
    if (!ini) return
    const { b, x, y } = ini; ini = null
    const dy = y - ev.clientY, dx = Math.abs(ev.clientX - x)
    const id = Number(b.dataset.id)
    if (dy > 50 && dx < 40) { alternarLixo(id, true); return }
    if (dy < 12 && dx < 12) abrir(fotos.findIndex((f) => f.id === id))
  })
  function alternarNota(id, ligar = !estado.nota.has(id)) { if (ligar) { estado.nota.add(id); estado.lixo.delete(id) } else estado.nota.delete(id); pintar() }
  function alternarLixo(id, ligar = !estado.lixo.has(id)) { if (ligar) { estado.lixo.add(id); estado.nota.delete(id) } else estado.lixo.delete(id); pintar() }

  // ----- foto aberta: a gravação NÃO para -----
  let viewer = null
  function abrir(i) {
    if (i < 0) return
    fechar()
    let atual = i
    viewer = h(`<div class="fv" role="dialog" aria-label="Foto aberta">
      <img class="fv-img" alt="">
      <div class="fv-topo"><button type="button" class="fv-voltar" aria-label="Voltar para a faixa">‹</button>
        <span class="fv-quando"><b></b><small></small></span><span class="fv-rec"><i></i><b class="fv-tempo"></b></span></div>
      <div class="fv-pe"><button type="button" class="fv-lixo">Lixo</button><button type="button" class="fv-nota">Pôr na nota</button></div>
      <p class="fv-toast" role="status"></p>
    </div>`)
    document.body.appendChild(viewer)
    const img = viewer.querySelector('.fv-img'), tempo = viewer.querySelector('.fv-tempo'), toast = viewer.querySelector('.fv-toast')
    const relogio = setInterval(() => { tempo.textContent = mmss(seg()) }, 500)
    viewer._parar = () => clearInterval(relogio)
    const mostrar = () => {
      const f = fotos[atual], d = new Date(f.quando)
      img.src = mini(f.id)
      const cheia = new Image(); cheia.onload = () => { if (fotos[atual] === f) img.src = cheia.src }; cheia.src = foto(f.id)
      viewer.querySelector('.fv-quando b').textContent = hora(f.quando)
      viewer.querySelector('.fv-quando small').textContent = `${DIAS_LONGOS[d.getDay()]} · ${atual + 1} de ${fotos.length}`
      tempo.textContent = mmss(seg())
      botoes()
      // abrir a foto guarda o segundo do áudio; só vale se ela for para a nota (aí a miniatura fica presa nesse ponto)
      const s = Math.max(0, Math.round(seg()))
      estado.marcos.push({ id: f.id, seg: s })
      estado.ultima = f.id; pintar()
      const mb = trilho.querySelector(`.ff-mini[data-id="${f.id}"]`); if (mb) mb.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
    const avisar = (t) => { toast.textContent = t; toast.classList.remove('mostra'); void toast.offsetWidth; toast.classList.add('mostra') }
    const bNota = viewer.querySelector('.fv-nota'), bLixo = viewer.querySelector('.fv-lixo')
    function botoes() {
      const id = fotos[atual].id, n = estado.nota.has(id), l = estado.lixo.has(id)
      bNota.classList.toggle('ligado', n); bNota.setAttribute('aria-pressed', n)
      bNota.innerHTML = n ? '&#10003; Na nota <small>tocar tira</small>' : 'Pôr na nota'
      bLixo.classList.toggle('ligado', l); bLixo.setAttribute('aria-pressed', l)
      bLixo.innerHTML = l ? '&#10005; No lixo <small>tocar tira</small>' : 'Lixo'
    }
    const ir = (n) => { const p = atual + n; if (p >= 0 && p < fotos.length) { atual = p; mostrar() } }
    // "Lixo" passa para a seguinte (como no desenho); avisa na seguinte o que aconteceu com a anterior
    const mandarProLixo = () => {
      alternarLixo(fotos[atual].id, true)
      if (atual < fotos.length - 1) { ir(1); avisar('A anterior vai para o lixo (só no fim, com sua confirmação)') } else fechar()
    }
    viewer.querySelector('.fv-voltar').onclick = fechar
    bNota.onclick = () => {
      const id = fotos[atual].id
      alternarNota(id); botoes()
      if (estado.nota.has(id)) { const m = estado.marcos.filter((x) => x.id === id).pop(); avisar(`Vai para a nota, presa em ${mmss(m ? m.seg : seg())} da fala`) }
      else avisar('Saiu da nota')
      bNota.classList.remove('pulso'); void bNota.offsetWidth; bNota.classList.add('pulso')
    }
    bLixo.onclick = () => { if (estado.lixo.has(fotos[atual].id)) { alternarLixo(fotos[atual].id, false); botoes(); avisar('Saiu do lixo') } else mandarProLixo() }
    let t0 = null
    img.addEventListener('pointerdown', (ev) => { t0 = { x: ev.clientX, y: ev.clientY } })
    img.addEventListener('pointerup', (ev) => {
      if (!t0) return
      const dx = ev.clientX - t0.x, dy = t0.y - ev.clientY; t0 = null
      if (dy > 90 && Math.abs(dx) < 60) { mandarProLixo(); return }
      if (Math.abs(dx) > 60) ir(dx < 0 ? 1 : -1)
    })
    history.pushState({ fotoAberta: true }, '')
    viewer._voltar = () => fechar(true)
    addEventListener('popstate', viewer._voltar, { once: true })
    mostrar()
  }
  function fechar(doVoltar = false) {
    if (!viewer) return
    const v = viewer; viewer = null
    v._parar(); removeEventListener('popstate', v._voltar)
    v.classList.add('saindo'); setTimeout(() => v.remove(), 220)
    if (!doVoltar && history.state && history.state.fotoAberta) history.back()
  }

  document.body.appendChild(faixa)
  document.body.classList.add('com-fotos')
  requestAnimationFrame(() => faixa.classList.add('entrou'))
  acordar()
  return {
    estado,
    porId,
    /** Fim da gravação: tira a faixa e devolve o que foi decidido. */
    terminar() {
      fechar(); clearInterval(vigia)
      faixa.remove(); document.body.classList.remove('com-fotos')
      return { fotos, nota: [...estado.nota], lixo: [...estado.lixo], marcos: estado.marcos.slice(), escondida }
    },
  }
}

/**
 * Revisão ao terminar: Na nota / Para apagar / Sem decisão (abertas sem decisão). Tocar troca o grupo.
 * Resolve com { nota: [ids], lixo: [ids], apagar: boolean } ou null se fechou sem salvar (tudo fica na galeria).
 */
export function revisar({ fotos, nota, lixo, marcos, duracao }) {
  return new Promise((resolver) => {
    const grupo = new Map()
    nota.forEach((id) => grupo.set(id, 'nota'))
    lixo.forEach((id) => grupo.set(id, 'lixo'))
    marcos.forEach((m) => { if (!grupo.has(m.id)) grupo.set(m.id, 'sem') })
    const porId = new Map(fotos.map((f) => [f.id, f]))
    const el = h(`<div class="fr" role="dialog" aria-label="O que fazer com as fotos">
      <p class="fr-sobre">Entrevista terminada · <span class="fr-dur">${mmss(duracao)}</span></p>
      <h1>O que fazer com as fotos</h1>
      <div class="fr-numeros"><div class="fr-n nota"><b></b><span>vão para a nota</span></div><div class="fr-n lixo"><b></b><span>para apagar</span></div><div class="fr-n sem"><b></b><span>ficam na galeria</span></div></div>
      <h2>Na nota <small>copiadas para o Journal</small></h2><div class="fr-grade" data-g="nota"></div>
      <h2>Para apagar <small>toque numa foto para desfazer</small></h2><div class="fr-grade" data-g="lixo"></div>
      <h2>Sem decisão <small>ficam na galeria, como estão</small></h2><div class="fr-grade" data-g="sem"></div>
      <div class="fr-pe"><button type="button" class="botao menta grande fr-salvar"></button><button type="button" class="link fr-sem-apagar">Salvar sem apagar nada</button>
      <p class="meta fr-obs"></p></div>
    </div>`)
    const pintar = () => {
      const ids = { nota: [], lixo: [], sem: [] }
      for (const [id, g] of grupo) ids[g].push(id)
      for (const g of ['nota', 'lixo', 'sem']) {
        const box = el.querySelector(`.fr-grade[data-g="${g}"]`)
        box.innerHTML = ''
        if (!ids[g].length) box.appendChild(h('<p class="meta fr-vazio">Nenhuma.</p>'))
        ids[g].sort((a, b) => (porId.get(a)?.quando || 0) - (porId.get(b)?.quando || 0)).forEach((id) => {
          const b = h(`<button type="button" class="fr-foto ${g}" aria-label="Foto das ${hora(porId.get(id)?.quando || 0)}: trocar de grupo"><img alt="" loading="lazy"></button>`)
          b.querySelector('img').src = mini(id)
          b.onclick = () => { grupo.set(id, g === 'nota' ? 'lixo' : g === 'lixo' ? 'sem' : 'nota'); pintar() }
          box.appendChild(b)
        })
      }
      el.querySelector('.fr-n.nota b').textContent = ids.nota.length
      el.querySelector('.fr-n.lixo b').textContent = ids.lixo.length
      el.querySelector('.fr-n.sem b').textContent = fotos.length - ids.nota.length - ids.lixo.length
      const s = el.querySelector('.fr-salvar')
      s.textContent = ids.lixo.length ? `Salvar e apagar ${ids.lixo.length} ${ids.lixo.length === 1 ? 'foto' : 'fotos'}` : 'Salvar'
      el.querySelector('.fr-sem-apagar').hidden = !ids.lixo.length
      el.querySelector('.fr-obs').textContent = ids.lixo.length === 1 ? 'O Android vai pedir uma confirmação antes de apagar.' : ids.lixo.length ? `O Android vai pedir uma confirmação para as ${ids.lixo.length} de uma vez.` : ''
      el._ids = ids
    }
    const fim = (apagar) => { const ids = el._ids; el.classList.add('saindo'); setTimeout(() => el.remove(), 220); resolver({ nota: ids.nota, lixo: ids.lixo, apagar }) }
    el.querySelector('.fr-salvar').onclick = () => fim(true)
    el.querySelector('.fr-sem-apagar').onclick = () => fim(false)
    pintar()
    document.body.appendChild(el)
  })
}

window.JJFotos = { disponivel, listar, apagar, comecar, revisar, periodo, mini, foto }
