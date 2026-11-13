// A aba Journal organizada como o PC (Etapa 2, Fase 4d): um espaço por vez (Johnny's Journal, Faculdade, Cursos, Notas, Inbox)
// mais "Pessoas e lugares". Tudo o que nasce no celular (entrevistas, tweets, memórias, notas) entra na mesma linha do tempo
// das páginas do PC, pelo espaço. Sem a chave, só o que nasce no celular + um convite para abrir os dados.
// Aditivo: não escreve no localStorage do app nem mexe nos dados; lê o armazém (IndexedDB "jj-dados") e usa as telas de paginas.js.
// mencoes.js, pessoas.js e texto.js são CÓPIAS IDÊNTICAS das do Journal do PC (bloco-de-notas-2/src): copie de novo quando mudarem.
import { esc as e } from './tiptap-html.mjs'
import * as A from './armazem.js'
import * as S from './pc-sync.js'
import * as P from './paginas.js'
import { indiceDeMencoes } from './mencoes.js'
import { proximosAniversarios, aniversariosDoMes, diaEMes, listaDePessoas } from './pessoas.js'
import { hojeTexto } from './datas.js'

const $ = (id) => document.getElementById(id)
const h = P.h
const norm = A.normalizar
const num = P.num
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const PESSOAS_E_LUGARES = '@pessoas'

let ui = null // ligações com o novo.js: { ESPACOS, itensJournal, cartao, atalhoEntrevista, mic }
const J = { espaco: 'journal', q: '', todos: false, filtro: 'tudo', sub: 'pessoas', seq: 0, men: null, mostrarSemMencao: false }
let observador = null
let calculando = null // a conta das menções em andamento (só uma por vez)
let adiar = null
let assinaturaSeletor = ''

// Os espaços do PC quando ainda não chegaram (ou sem a chave): mesmos nomes, ordem e cores do registro `espaco`.
const PADRAO = [
  { id: 'journal', nome: "Johnny's Journal", cor: '#D9A63A', icone: 'J', diario: true },
  { id: 'faculdade', nome: 'Faculdade', cor: '#8ADD9E', icone: 'F' },
  { id: 'cursos', nome: 'Cursos', cor: '#53D776', icone: 'C' },
  { id: 'notas', nome: 'Notas', cor: '#215730', icone: 'N' },
  P.ESPACO_INBOX,
]
const posicao = (id) => { const i = P.ORDEM.indexOf(id); return i < 0 ? P.ORDEM.length : i }
const ehTracker = (m) => m.origem === 'tracker' || String(m.id).startsWith('tracker-')
const chaveDeMs = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dataCurtaDeChave = (k) => {
  if (!k) return ''
  const [a, m, d] = k.split('-').map(Number)
  return `${d} ${MES3[m - 1]}${a !== new Date().getFullYear() ? ' ' + a : ''}`
}

// ---------------------------------------------------------------- espaços e itens
/** Os espaços que a aba mostra, na ordem do PC. Sem a chave: só os que têm algo do celular (o do Journal sempre). */
function espacosDaAba(celularPorEspaco) {
  const U = P.estado()
  const porId = new Map(PADRAO.map((x) => [x.id, x]))
  // (enquanto o registro do espaço não chegou, paginas.js inventa nome = id e cor cinza: aí vale o nome e a cor padrão)
  if (U.aberto) for (const x of U.espacos) { const base = porId.get(x.id); porId.set(x.id, base && x.nome === x.id ? { ...base } : { ...base, ...x }) }
  const lista = [...porId.values()].sort((a, b) => posicao(a.id) - posicao(b.id) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
  return U.aberto ? lista : lista.filter((x) => x.id === 'journal' || celularPorEspaco?.[x.id])
}
/** O espaço do PC onde uma nota do celular entra: mesmo id, ou mesmo nome; o que não casa vai para o Inbox. */
function espacoDaNota(idCelular, lista) {
  if (lista.some((x) => x.id === idCelular)) return idCelular
  const nomeCel = norm(ui.ESPACOS.find((x) => x.id === idCelular)?.nome || '')
  return lista.find((x) => nomeCel && norm(x.nome) === nomeCel)?.id || 'inbox'
}
/** Tudo o que nasce no celular, já com o espaço do PC. */
function itensDoCelular() {
  const lista = [...new Map([...PADRAO, ...P.estado().espacos].map((x) => [x.id, x])).values()]
  return ui.itensJournal().map((it) => ({ k: 'c', it, esp: it.tipo === 'nota' ? espacoDaNota(it.espaco, lista) : 'journal', data: it.data || '', t: it.t || 0 }))
}
function itensDoPC() {
  const U = P.estado()
  if (!U.aberto) return []
  return U.metas.filter((m) => !ehTracker(m)).map((m) => ({ k: 'p', m, esp: m.espaco || 'inbox', data: m.data || chaveDeMs(m.quando), t: m.quando || 0 }))
}
const ordem = (a, b) => b.data.localeCompare(a.data) || b.t - a.t
const espDe = (lista, id) => lista.find((x) => x.id === id) || P.ESPACO_INBOX

// ---------------------------------------------------------------- pedaços de tela
function desenharSeletor(lista, contagens, aberto) {
  const sel = $('jor-espacos')
  const abas = [...lista.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor, n: contagens[x.id] || 0 })), ...(aberto ? [{ id: PESSOAS_E_LUGARES, nome: 'Pessoas e lugares', pessoas: true }] : [])]
  const sig = abas.map((a) => `${a.id}:${a.n ?? ''}:${a.nome}:${a.cor || ''}`).join('|')
  sel.classList.add('jor-sel')
  sel.setAttribute('role', 'tablist')
  sel.setAttribute('aria-label', 'Espaços')
  if (sig !== assinaturaSeletor) {
    assinaturaSeletor = sig
    sel.innerHTML = ''
    for (const a of abas) {
      const b = h(`<button type="button" role="tab" data-e="${e(a.id)}" style="--cor:${e(a.cor || 'var(--menta)')}">${a.pessoas
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.4 0 3.9 1.4 4.5 4"/></svg>'
        : `<i class="dot"></i>`}<span>${e(a.nome)}</span>${a.n ? `<small>${num(a.n)}</small>` : ''}</button>`)
      b.onclick = () => escolher(a.id)
      sel.appendChild(b)
    }
    sel.appendChild(h('<span class="jor-sel-marca" aria-hidden="true"></span>'))
  }
  sel.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.e === J.espaco)))
  const ativo = sel.querySelector(`[data-e="${CSS.escape(J.espaco)}"]`)
  const marca = sel.querySelector('.jor-sel-marca')
  if (ativo && marca) {
    // a barra desliza até a aba escolhida (só transform)
    const w = ativo.offsetWidth, x = ativo.offsetLeft
    if (w) marca.style.transform = `translateX(${x}px) scaleX(${(w / 100).toFixed(3)})`
    if (w) sel.scrollTo({ left: Math.max(0, x - (sel.clientWidth - w) / 2), behavior: P.reduzMovimento() ? 'auto' : 'smooth' })
  }
}

function escolher(id) {
  if (id === J.espaco) return
  J.espaco = id
  if (id !== 'journal') J.filtro = 'tudo'
  J.todos = false
  render(true)
}

const ICONE_CADEADO_PEQUENO = P.ICONE_CADEADO.replace(/width="34" height="34"/, 'width="22" height="22"')
/** Convite (sem a chave), progresso (primeira baixada) ou a linha discreta "Atualizado há..." */
function desenharStatus() {
  const box = $('jor-pc')
  if (!box) return
  const U = P.estado()
  box.className = 'jor-status'
  if (!U.aberto) {
    if (box.dataset.modo !== 'convite') {
      box.dataset.modo = 'convite'
      box.innerHTML = `<span class="jor-convite-ic">${ICONE_CADEADO_PEQUENO}</span><span class="jor-convite-txt"><b>Abrir os dados do PC</b><small>Traz faculdade, cursos, notas e pessoas para cá.</small></span><button type="button" class="botao menta pequeno" data-a="abrir">Abrir</button>`
      box.querySelector('[data-a="abrir"]').onclick = () => P.abrirDesbloqueio()
    }
    box.classList.add('convite')
    return
  }
  const s = U.sinc, total = U.estado?.total || null, n = U.contagem?.paginas || 0
  const baixando = s.rodando && s.primeira
  const frac = baixando ? (total ? s.feitos / total : 0.25) : 1
  const indet = baixando && !total
  if (baixando) {
    box.classList.add('baixando')
    if (box.dataset.modo !== 'baixando') {
      box.dataset.modo = 'baixando'
      box.innerHTML = `<div id="pc-anel-caixa">${P.anel(frac, indet, num(s.feitos), 'baixadas', 'mini')}</div><div class="jor-status-txt"><b>Trazendo as páginas do PC…</b><span class="pc-status" id="pc-status" role="status"></span></div>`
    }
    const anel = box.querySelector('.pc-anel')
    anel.classList.toggle('indet', indet)
    anel.querySelector('.pc-num').textContent = num(s.feitos)
    anel.querySelector('.arco').style.strokeDasharray = `${(Math.max(0, Math.min(1, frac)) * 326.7).toFixed(1)} 326.7`
    box.querySelector('#pc-status').textContent = `${num(s.feitos)}${total ? ' de ' + num(total) : ''} páginas baixadas. Pode ler o que já chegou.`
    return
  }
  box.dataset.modo = 'aberto'
  const pend = U.contagem?.pendentes || 0
  const linha = s.rodando ? 'Conferindo o que mudou…'
    : s.erro ? `Não consegui atualizar: ${s.erro}`
    : s.offline ? 'Sem internet agora. Tento de novo quando voltar.'
    : U.estado?.ultima ? `${num(n)} páginas do PC · atualizado ${P.haQuanto(U.estado.ultima)}` : ''
  const avisos = (U.estado?.avisos || []).map((a) => `<li>${e(a.texto)} <small>${e(P.haQuanto(a.quando))}</small></li>`).join('')
  box.innerHTML = `<div class="jor-status-linha"><span class="pc-status${s.erro ? ' erro' : ''}" id="pc-status" role="status">${e(linha)}</span><button type="button" class="icone-b jor-atualizar${s.rodando ? ' girando' : ''}" data-a="atualizar" aria-label="Atualizar agora">${P.ICONE_ATUALIZAR}</button></div>
    ${pend ? `<p class="pc-pend-linha">${num(pend)} ${pend === 1 ? 'página editada aqui ainda não subiu' : 'páginas editadas aqui ainda não subiram'}.</p>` : ''}
    ${avisos ? `<ul class="pc-avisos">${avisos}<li><button type="button" class="link" data-a="limpar">Dispensar avisos</button></li></ul>` : ''}`
  box.querySelector('[data-a="atualizar"]').onclick = () => P.atualizarAgora()
  const l = box.querySelector('[data-a="limpar"]')
  if (l) l.onclick = () => P.dispensarAvisos()
}

function desenharFiltros(aberto) {
  const box = $('jor-filtros')
  const ver = J.espaco === 'journal'
  box.hidden = !ver
  if (!ver) return
  const chips = [['tudo', 'Tudo'], ...(aberto ? [['diario', 'Diário']] : []), ['entrevistas', 'Entrevistas'], ['notas', 'Notas'], ['galeria', 'Galeria']]
  if (!chips.some(([f]) => f === J.filtro)) J.filtro = 'tudo'
  box.innerHTML = chips.map(([f, nome]) => `<button type="button" data-f="${f}" aria-pressed="${f === J.filtro}">${nome}</button>`).join('')
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => { J.filtro = b.dataset.f; render(false) }))
}

// ---------------------------------------------------------------- a lista (linha do tempo por data)
function cartaoCelular(x, cor) {
  const c = ui.cartao(x.it)
  const ponto = c.querySelector('.ponto-esp')
  if (ponto && cor) ponto.style.background = cor
  return c
}
function cartaoPagina(x, lista, trecho = null) {
  const m = x.m
  const esp = espDe(lista, m.espaco || 'inbox')
  const previa = trecho === null ? m.previa : ''
  const c = h(`<button type="button" class="cartao-j cartao-pc">
    <span class="cj-corpo"><span class="tipo">${esp.id === 'journal' ? 'Diário' : 'Página'}</span><b>${e(m.titulo || 'Sem título')}</b>${previa || trecho !== null ? `<span class="trecho">${e(previa || '')}</span>` : ''}
    <span class="cj-pe"><i class="ponto-esp" style="background:${e(esp.cor || '#968073')}"></i>${e(dataCurtaDeChave(x.data))}${esp.id === 'journal' ? '' : ' · ' + e(esp.nome)}${m.pendente ? '<em class="pc-pend">esperando para subir</em>' : ''}</span></span>
  </button>`)
  c.onclick = () => P.abrirPagina(m.id)
  return c
}

function pintarItens(itens, lista, { meses = true, vazio = '', palavras = null, ondes = null } = {}) {
  const mural = $('jor-mural')
  observador?.disconnect()
  mural.innerHTML = ''
  mural.classList.add('jor-novo')
  if (!itens.length) { mural.appendChild(h(`<p class="vazio jor-vazio">${vazio}</p>`)); return }
  let i = 0, sec = null
  const POR_VEZ = 40
  const novaSecao = (mes) => {
    if (meses && mes) {
      const [a, m] = mes.split('-').map(Number)
      mural.appendChild(h(`<h3 class="jor-mes">${MES_NOME[m - 1]}${a !== new Date().getFullYear() ? ' ' + a : ''}</h3>`))
    } else if (meses) mural.appendChild(h('<h3 class="jor-mes">Sem data</h3>'))
    const el = h('<div class="mural-secao"><div class="mural-col"></div><div class="mural-col"></div></div>')
    mural.appendChild(el)
    sec = { mes, cols: el.children, alt: [0, 0] }
  }
  if (!meses) novaSecao(null)
  const mais = () => {
    for (const fim = Math.min(itens.length, i + POR_VEZ); i < fim; i++) {
      const x = itens[i]
      const mes = x.data ? x.data.slice(0, 7) : ''
      if (meses && (!sec || sec.mes !== mes)) novaSecao(mes)
      let c, alt
      if (x.k === 'c') {
        c = cartaoCelular(x, espDe(lista, x.esp).cor)
        alt = (x.it.foto ? 150 : 0) + 60 + Math.min(220, x.it.texto.length) * 0.5 + (x.it.titulo.length > 28 ? 22 : 0)
      } else {
        c = cartaoPagina(x, lista, palavras ? '' : null)
        alt = 60 + Math.min(160, (x.m.previa || '').length) * 0.5 + (x.m.titulo.length > 28 ? 22 : 0)
        if (palavras) P.trechoDe(x.m, ondes?.get(x.m.id) ?? 0, palavras).then((t) => { const el = c.querySelector('.trecho'); if (el) { if (t) el.innerHTML = t; else el.remove() } })
      }
      const col = sec.alt[0] <= sec.alt[1] ? 0 : 1
      sec.cols[col].appendChild(c); sec.alt[col] += alt
    }
    if (i < itens.length) {
      const s = h('<div class="sentinela"></div>')
      mural.appendChild(s)
      observador = new IntersectionObserver((v) => { if (v[0].isIntersecting) { observador.disconnect(); s.remove(); mais() } }, { rootMargin: '600px' })
      observador.observe(s)
    }
  }
  mais()
}

function animarTroca() {
  const m = $('jor-mural')
  m.classList.remove('entra')
  void m.offsetWidth
  m.classList.add('entra')
}

function desenharEscopo(lista, q, total) {
  const box = $('jor-escopo')
  if (!box) return
  const ver = !!q && J.espaco !== PESSOAS_E_LUGARES
  box.hidden = !ver
  if (!ver) return
  const nome = espDe(lista, J.espaco).nome
  box.innerHTML = `<span>${total === 0 ? 'Nada' : num(total) + (total === 1 ? ' resultado' : ' resultados')} ${J.todos ? 'em todos os espaços' : 'em ' + e(nome)}.</span><button type="button" class="link" data-a="escopo">${J.todos ? 'Só em ' + e(nome) : 'Procurar em todos'}</button>`
  box.querySelector('[data-a="escopo"]').onclick = () => { J.todos = !J.todos; render(false) }
}

async function desenharEspaco(lista, seq) {
  const U = P.estado()
  const q = J.q.trim()
  const cel = itensDoCelular(), pc = itensDoPC()
  const doEspaco = (x) => J.todos && q ? true : x.esp === J.espaco
  const filtroOk = (x) => J.espaco !== 'journal' || J.filtro === 'tudo' || (J.filtro === 'diario' ? x.k === 'p' : x.k === 'p' ? false : J.filtro === 'entrevistas' ? x.it.tipo !== 'nota' : J.filtro === 'notas' ? x.it.tipo === 'nota' : !!x.it.foto)
  if (q) {
    const palavras = norm(q).split(/\s+/).filter(Boolean)
    const pontua = (titulo, texto) => { let p = 0; for (const w of palavras) { const t = titulo.includes(w), c = texto.includes(w); if (!t && !c) return 0; p += t ? 3 : 1 } return p }
    const achados = []
    for (const x of cel) {
      if (!doEspaco(x) || !filtroOk(x)) continue
      const p = pontua(norm(x.it.titulo), norm(x.it.texto))
      if (p) achados.push({ ...x, pontos: p })
    }
    const ondes = new Map()
    if (U.aberto) {
      const metasPorId = new Map(pc.map((x) => [x.m.id, x]))
      for (const a of await A.buscar(q, 100000)) {
        const x = metasPorId.get(a.meta.id)
        if (!x || !doEspaco(x) || !filtroOk(x)) continue
        achados.push({ ...x, pontos: pontua(norm(x.m.titulo), '') || 1 }) // o título pesa 3; o resto só entra
        ondes.set(a.meta.id, a.onde)
      }
      if (seq !== J.seq) return
    }
    achados.sort((a, b) => b.pontos - a.pontos || ordem(a, b))
    desenharEscopo(lista, q, achados.length)
    pintarItens(achados.slice(0, 300), lista, { meses: false, vazio: 'Nada com essa busca.<br><small>A busca ignora acento e maiúscula.</small>', palavras, ondes })
    return
  }
  desenharEscopo(lista, '', 0)
  const itens = [...cel, ...pc].filter((x) => x.esp === J.espaco && filtroOk(x)).sort(ordem)
  const vazio = J.espaco === 'journal'
    ? (J.filtro === 'galeria' ? 'Nenhuma nota com foto ainda.' : 'Nada aqui ainda. Faça a entrevista ou toque em + Nota.')
    : (U.aberto ? 'Este espaço está vazio.' : 'Nada seu neste espaço ainda. Abra os dados do PC para ver as páginas dele.')
  pintarItens(itens, lista, { meses: true, vazio })
}

// ---------------------------------------------------------------- Pessoas e lugares
/** Monta (uma vez por versão dos dados) as menções do diário com o MESMO mencoes.js do PC. */
async function mencoes() {
  const U = P.estado()
  const pes = await A.lerPessoas()
  if (!pes) return null
  const diario = U.espacos.find((x) => x.diario)?.id || 'journal'
  const ultimo = U.metas.reduce((m, x) => Math.max(m, x.mudou || 0), 0)
  const sig = `${U.metas.length}|${ultimo}|${pes.mudou}|${diario}`
  if (J.men?.sig === sig) return J.men
  if (calculando?.sig === sig) return calculando.promessa
  const promessa = (async () => {
    // já calculado antes (e nada mudou): vem pronto do armazém, sem refazer a conta
    const guardado = await A.lerGuardado('mencoes')
    if (guardado?.sig === sig) { J.men = { sig, indice: guardado.indice, pessoas: listaDePessoas(pes.obj), ms: { ler: 0, indice: 0, total: 0, doArmazem: true } }; return J.men }
    const t0 = performance.now()
    const paginas = await A.paginasParaMencoes(diario)
    const t1 = performance.now()
    const indice = indiceDeMencoes(paginas, pes.obj, diario)
    const t2 = performance.now()
    J.men = { sig, indice, pessoas: listaDePessoas(pes.obj), ms: { ler: Math.round(t1 - t0), indice: Math.round(t2 - t1), total: Math.round(t2 - t0) } }
    if (window.JJ_JOR) window.JJ_JOR.medida = J.men.ms
    A.gravarGuardado('mencoes', { sig, indice }).catch(() => {})
    return J.men
  })().finally(() => { calculando = null })
  calculando = { sig, promessa }
  return promessa
}
const iniciais = (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const quandoAniv = (a) => (a.dias === 0 ? 'hoje' : a.dias === 1 ? 'amanhã' : `em ${a.dias} dias`)
const nascEmTexto = (n) => { const dm = diaEMes(n); return dm ? `${Number(dm.slice(3))} ${MES3[Number(dm.slice(0, 2)) - 1]}` : '' }

async function desenharPessoas(seq) {
  const mural = $('jor-mural')
  observador?.disconnect()
  mural.classList.add('jor-novo')
  mural.innerHTML = '<p class="vazio jor-vazio">Procurando nos dias do diário…</p>'
  const men = await mencoes()
  if (seq !== J.seq) return
  if (!men) {
    mural.innerHTML = '<p class="vazio jor-vazio">O PC ainda não mandou a lista de pessoas.<br><small>Abra o Journal do PC e espere a troca com o celular; ela chega sozinha.</small></p>'
    return
  }
  const U = P.estado()
  const hoje = hojeTexto()
  const pes = { lista: men.pessoas }
  const aniv = new Map(proximosAniversarios(pes, hoje, 30).map((a) => [a.pessoa.id, a]))
  const q = norm(J.q.trim())
  const passa = (nome) => !q || norm(nome).includes(q)
  const todasPessoas = men.indice.pessoas.filter((x) => passa(x.nome))
  const lugares = men.indice.lugares.filter((x) => passa(x.nome))
  const semMencao = men.pessoas.filter((p) => !men.indice.pessoas.some((x) => x.id === p.id) && passa(p.nome))
  const top = men.indice.pessoas.reduce((m, x) => (x.dias.length > (m?.dias.length || 0) ? x : m), null)
  const sub = J.sub
  const lista = sub === 'pessoas' ? todasPessoas : lugares
  mural.innerHTML = ''
  const conclusao = top
    ? `<b>${e(top.nome)}</b> é quem mais aparece: <b class="men-n">${num(top.dias.length)}</b> dias no diário.`
    : 'Ninguém da sua lista aparece no diário ainda.'
  const cab = h(`<section class="men-topo">
    <p class="men-conclusao">${conclusao}</p>
    <div class="men-sub" role="tablist" aria-label="Pessoas ou lugares">
      <button type="button" role="tab" data-s="pessoas" aria-selected="${sub === 'pessoas'}">Pessoas <small>${num(men.indice.pessoas.length)}</small></button>
      <button type="button" role="tab" data-s="lugares" aria-selected="${sub === 'lugares'}">Lugares <small>${num(men.indice.lugares.length)}</small></button>
    </div>
  </section>`)
  cab.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { J.sub = b.dataset.s; desenharPessoas(++J.seq); animarTroca() }))
  mural.appendChild(cab)
  const caixa = h('<div class="men-lista"></div>')
  mural.appendChild(caixa)
  if (!lista.length) caixa.appendChild(h(`<p class="vazio jor-vazio">${q ? 'Ninguém com esse nome.' : sub === 'pessoas' ? 'Nenhuma pessoa aparece no diário ainda.' : 'Nenhum lugar no diário ainda.'}</p>`))
  let i = 0
  const POR_VEZ = 40
  const mais = () => {
    for (const fim = Math.min(lista.length, i + POR_VEZ); i < fim; i++) {
      const it = lista[i]
      const ultimo = it.dias[0]
      const a = it.tipo === 'pessoa' ? aniv.get(it.id) : null
      const pessoa = it.tipo === 'pessoa' ? men.pessoas.find((p) => p.id === it.id) : null
      const nasc = pessoa ? nascEmTexto(pessoa.nascimento) : ''
      const b = h(`<button type="button" class="men-card${a && a.dias === 0 ? ' hoje' : ''}" style="--i:${Math.min(i, 10)}">
        <span class="men-avatar${it.tipo === 'lugar' ? ' lugar' : ''}" aria-hidden="true">${it.tipo === 'lugar' ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>' : e(iniciais(it.nome))}</span>
        <span class="men-corpo"><b>${e(it.nome)}</b><small>${num(it.dias.length)} ${it.dias.length === 1 ? 'dia' : 'dias'}${ultimo ? ' · último em ' + e(dataCurtaDeChave(ultimo.data)) : ''}</small></span>
        ${nasc ? `<span class="men-aniv${a ? ' perto' : ''}">${a ? (a.idade != null ? `faz ${a.idade} ${quandoAniv(a)}` : `${quandoAniv(a)}`) : 'aniv. ' + e(nasc)}</span>` : ''}
      </button>`)
      b.onclick = () => P.abrirVista('mencao', { tipo: it.tipo, chave: it.tipo === 'pessoa' ? it.id : it.nome })
      caixa.appendChild(b)
    }
    if (i < lista.length) {
      const s = h('<div class="sentinela"></div>')
      caixa.appendChild(s)
      observador = new IntersectionObserver((v) => { if (v[0].isIntersecting) { observador.disconnect(); s.remove(); mais() } }, { rootMargin: '600px' })
      observador.observe(s)
    }
  }
  mais()
  if (sub === 'pessoas' && semMencao.length) {
    const resto = h(`<section class="men-resto"><p class="meta">Na sua lista, mas ainda sem aparecer no diário</p><p class="men-resto-nomes">${semMencao.map((p) => e(p.nome.split(' ').slice(0, 2).join(' '))).join(' · ')}</p></section>`)
    mural.appendChild(resto)
  }
  mural.appendChild(h(`<p class="meta men-nota">Calculado aqui no celular com as entradas do diário (${num(men.indice.pessoas.reduce((s, x) => s + x.dias.length, 0))} menções). Etiquetas como #nome também contam.</p>`))
  void U
}

// A tela de uma pessoa ou de um lugar: os dias, do mais novo ao mais antigo, com o trecho; tocar abre a página.
function marcar(trecho, termos) {
  const alvo = norm(trecho)
  const marcas = []
  for (const t of termos.map(norm).filter(Boolean)) { let k = 0; while ((k = alvo.indexOf(t, k)) >= 0) { marcas.push([k, k + t.length]); k += t.length } }
  marcas.sort((a, b) => a[0] - b[0])
  let out = '', pos = 0
  for (const [a, b] of marcas) { if (a < pos) continue; out += e(trecho.slice(pos, a)) + '<mark>' + e(trecho.slice(a, b)) + '</mark>'; pos = b }
  return out + e(trecho.slice(pos))
}
async function vistaMencao({ tipo, chave }) {
  const men = (await mencoes()) || J.men
  const item = men?.indice[tipo === 'pessoa' ? 'pessoas' : 'lugares'].find((x) => (tipo === 'pessoa' ? x.id === chave : x.nome === chave))
  if (!item) return h(`<div class="pc-vista">${P.topo('', '')}<p class="vazio pc-vazio">Não encontrei mais essa menção.</p></div>`)
  const pessoa = tipo === 'pessoa' ? men.pessoas.find((p) => p.id === item.id) : null
  const termos = tipo === 'pessoa' ? [pessoa?.nome, ...(pessoa?.apelidos || [])].filter(Boolean) : [item.nome]
  const a = pessoa ? proximosAniversarios({ lista: [pessoa] }, hojeTexto(), 366)[0] : null
  const nasc = pessoa ? nascEmTexto(pessoa.nascimento) : ''
  const n = item.dias.length
  const el = h(`<div class="pc-vista men-vista">
    <div class="pc-luz" aria-hidden="true"></div>
    ${P.topo('', '')}
    <section class="men-cab">
      <span class="men-avatar grande${tipo === 'lugar' ? ' lugar' : ''}" aria-hidden="true">${tipo === 'lugar' ? '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>' : e(iniciais(item.nome))}</span>
      <h1>${e(item.nome)}</h1>
      <p class="men-numero"><b class="pc-num">${num(n)}</b> ${n === 1 ? 'dia' : 'dias'} no diário</p>
      <p class="men-ultimo">${n ? 'O último foi em ' + e(dataCurtaDeChave(item.dias[0].data)) + '.' : ''}${n > 1 ? ' O primeiro, em ' + e(dataCurtaDeChave(item.dias[n - 1].data)) + '.' : ''}</p>
      ${nasc ? `<p class="men-detalhe">Aniversário: ${e(nasc)}${a && a.dias <= 30 ? ` · ${a.idade != null ? 'faz ' + a.idade + ' ' : ''}${quandoAniv(a)}` : ''}</p>` : ''}
      ${pessoa?.apelidos?.length ? `<p class="men-detalhe">Também aparece como ${e(pessoa.apelidos.join(', '))}.</p>` : ''}
    </section>
    <div class="men-dias" id="men-dias"></div>
    <p class="meta men-nota">Calculado aqui no celular com as entradas do diário.</p>
  </div>`)
  el.depois = () => {
    const caixa = el.querySelector('#men-dias')
    let i = 0
    const POR_VEZ = 40
    let obs = null
    const mais = () => {
      for (const fim = Math.min(n, i + POR_VEZ); i < fim; i++) {
        const d = item.dias[i]
        const b = h(`<button type="button" class="men-dia" style="--i:${Math.min(i % POR_VEZ, 10)}"><span class="men-data">${e(dataCurtaDeChave(d.data))}</span><b>${e(d.titulo)}</b>${d.trecho ? `<span class="men-trecho">${marcar(d.trecho, termos)}</span>` : ''}</button>`)
        b.onclick = () => P.ir('leitura', { id: d.id })
        caixa.appendChild(b)
      }
      if (i < n) {
        const s = h('<div class="sentinela"></div>')
        caixa.appendChild(s)
        obs?.disconnect()
        obs = new IntersectionObserver((v) => { if (v[0].isIntersecting) { obs.disconnect(); s.remove(); mais() } }, { rootMargin: '700px' })
        obs.observe(s)
      }
    }
    mais()
  }
  return el
}

// ---------------------------------------------------------------- a aba
let pendente = false
/** Desenha a aba. `trocou`: veio de uma troca de espaço (anima a entrada). */
export async function render(trocou = false) {
  if (!ui) return
  const mural = $('jor-mural')
  if (!mural || !mural.isConnected) return
  const seq = ++J.seq
  const U = P.estado()
  const cel = itensDoCelular()
  const celPorEsp = {}
  for (const x of cel) celPorEsp[x.esp] = (celPorEsp[x.esp] || 0) + 1
  const lista = espacosDaAba(celPorEsp)
  const contagens = {}
  for (const x of lista) contagens[x.id] = (celPorEsp[x.id] || 0) + (U.aberto ? U.contagem?.porEspaco?.[x.id] || 0 : 0)
  if (J.espaco === PESSOAS_E_LUGARES && !U.aberto) J.espaco = 'journal'
  if (J.espaco !== PESSOAS_E_LUGARES && !lista.some((x) => x.id === J.espaco)) J.espaco = 'journal'
  desenharSeletor(lista, contagens, U.aberto)
  desenharStatus()
  const busca = $('jor-busca')
  busca.hidden = false
  busca.classList.add('jor-busca')
  busca.placeholder = J.espaco === PESSOAS_E_LUGARES ? 'Procurar uma pessoa ou lugar' : `Procurar em ${J.todos && J.q ? 'todos os espaços' : espDe(lista, J.espaco).nome}`
  if (document.activeElement !== busca) busca.value = J.q
  $('jor-lupa').hidden = true
  const emPessoas = J.espaco === PESSOAS_E_LUGARES
  desenharFiltros(U.aberto)
  const ent = $('jor-entrevista')
  ent.hidden = J.espaco !== 'journal'
  if (J.espaco === 'journal') ui.atalhoEntrevista()
  if (trocou) animarTroca()
  if (emPessoas) { desenharEscopo(lista, '', 0); await desenharPessoas(seq) } else await desenharEspaco(lista, seq)
  void pendente
}

// Pedaços do que a troca com a nuvem mexe: o status sempre; a lista só quando terminou ou não está rolando
function aoMudarSecao(fim) {
  desenharStatus()
  const sinc = P.estado().sinc
  const meio = sinc.rodando && sinc.primeira
  if ($('tela-journal')?.hidden) { if (fim) ui.mudouAlgo?.(); return }
  if (fim || (meio && window.scrollY < 120 && document.activeElement !== $('jor-busca'))) render(false)
  if (fim) {
    ui.mudouAlgo?.()
    // com os dados novos, deixa a conta das menções pronta em segundo plano (a primeira abertura da visão fica instantânea)
    clearTimeout(adiar)
    adiar = setTimeout(() => { if (!P.estado().sinc.rodando && P.estado().aberto) mencoes().catch(() => {}) }, 2500)
  }
}

/** Os aniversários dos próximos 30 dias para o Início (com a chave); null = sem chave ou sem a lista (usa a da nuvem). */
export async function aniversarios() {
  if (!(await S.estaAberto())) return null
  const p = await A.lerPessoas()
  if (!p) return null
  const hoje = hojeTexto()
  const lista = proximosAniversarios(p.obj, hoje, 30).map((a) => ({ id: a.pessoa.id, nome: a.pessoa.nome, dia: a.dia, dias: a.dias, idade: a.idade }))
  const mesQueVem = Number(hoje.slice(8, 10)) >= 25 ? aniversariosDoMes(p.obj, Number(hoje.slice(5, 7)) % 12 + 1).map((x) => ({ nome: x.pessoa.nome, dia: x.dia })) : []
  return { lista, mesQueVem }
}

export function iniciar(ligacoes) {
  ui = ligacoes
  const busca = $('jor-busca')
  let t
  busca.oninput = (ev) => { clearTimeout(t); const v = ev.target.value; t = setTimeout(() => { J.q = v; render(false) }, 120) }
  $('jor-lupa').onclick = null
  $('jor-mural').classList.add('jor-novo')
  P.registrarVista('mencao', vistaMencao)
  P.aoMudar(aoMudarSecao)
  window.JJ_JOR = { ativo: true, render: () => render(false), aniversarios, estado: () => ({ ...J, men: !!J.men }), medida: null, mencoes, mencaoMs: () => J.men?.ms || null }
  render(false)
}
