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
import * as LT from './linha-tempo.js'
import * as G from './galeria.js'

const $ = (id) => document.getElementById(id)
const h = P.h
const norm = A.normalizar
const num = P.num
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const PESSOAS_E_LUGARES = '@pessoas'
const NEWS = '@news'

let ui = null // ligações com o novo.js: { ESPACOS, itensJournal, fotosJournal, cartao, atalhoEntrevista, abrirItem, abrirCamada, fecharCamada, abrirFolha, carregarFoto }
const J = { espaco: 'journal', caminho: [], q: '', todos: false, filtro: 'tudo', sub: 'pessoas', seq: 0, men: null, mostrarSemMencao: false }
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
/** Data dos cartões da linha do tempo: o ano aparece sempre ("5 nov 2026"). */
const dataComAno = (k) => { if (!k) return ''; const [a, m, d] = k.split('-').map(Number); return `${d} ${MES3[m - 1]} ${a}` }
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
  const abas = [...lista.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor, n: contagens[x.id] || 0 })), ...(ui.temNews?.() ? [{ id: NEWS, nome: 'News', news: true }] : []), ...(aberto ? [{ id: PESSOAS_E_LUGARES, nome: 'Pessoas e lugares', pessoas: true }] : [])]
  const sig = abas.map((a) => `${a.id}:${a.n ?? ''}:${a.nome}:${a.cor || ''}`).join('|')
  sel.classList.add('jor-sel')
  sel.setAttribute('role', 'tablist')
  sel.setAttribute('aria-label', 'Espaços')
  if (sig !== assinaturaSeletor) {
    assinaturaSeletor = sig
    sel.innerHTML = ''
    for (const a of abas) {
      const b = h(`<button type="button" role="tab" data-e="${e(a.id)}" style="--cor:${e(a.cor || 'var(--menta)')}">${a.news
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h12v14H6a2 2 0 0 1-2-2z"/><path d="M16 9h4v8a2 2 0 0 1-4 0"/><path d="M7.5 9h5M7.5 12.5h5M7.5 16h3"/></svg>'
        : a.pessoas
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
  J.caminho = []
  if (id !== 'journal' && J.filtro !== 'galeria') J.filtro = P.estado().aberto ? 'pastas' : 'tudo' // a galeria acompanha a pessoa de um espaço para outro
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
  const ver = J.espaco !== PESSOAS_E_LUGARES && J.espaco !== NEWS
  box.hidden = !ver
  if (!ver) return
  const chips = J.espaco === 'journal'
    ? [['tudo', 'Tudo'], ...(aberto ? [['diario', 'Diário']] : []), ['entrevistas', 'Entrevistas'], ['notas', 'Notas'], ['galeria', 'Galeria']]
    : [...(aberto ? [['pastas', 'Pastas']] : []), ['tudo', 'Por data'], ['galeria', 'Galeria']]
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
    <span class="cj-pe"><i class="ponto-esp" style="background:${e(esp.cor || '#968073')}"></i>${e(dataComAno(x.data))}${esp.id === 'journal' ? '' : ' · ' + e(esp.nome)}${m.pendente ? '<em class="pc-pend">esperando para subir</em>' : ''}</span></span>
  </button>`)
  c.onclick = () => P.abrirPagina(m.id)
  return c
}

/** Altura estimada de um cartão (px), antes de existir na tela. */
function alturaDoItem(x) {
  if (x.k === 'c') return (x.it.foto ? 150 : 0) + 60 + Math.min(220, x.it.texto.length) * 0.5 + (x.it.titulo.length > 28 ? 22 : 0)
  return 60 + Math.min(160, (x.m.previa || '').length) * 0.5 + (x.m.titulo.length > 28 ? 22 : 0)
}
const GAP = 8
/** Uma assinatura barata do que está na lista: se não mudou, a lista (e a rolagem) fica como está. */
const assinaturaDe = (itens, lista) => `${itens.length}|${lista.map((x) => x.cor).join('')}|` + itens.map((x) => (x.k === 'c' ? x.it.id + ':' + (x.it.t || 0) + ':' + (x.it.foto || '') : x.m.id + ':' + (x.m.mudou || 0) + (x.m.pendente ? 'p' : ''))).join(',')

/** A linha do tempo: um mês por seção, montado só quando chega perto da tela (linha-tempo.js). */
function pintarLinhaDoTempo(itens, lista, { vazio, chave, reiniciar }) {
  const mural = $('jor-mural')
  if (!itens.length) {
    LT.desmontar(); G.soltarTudo()
    observador?.disconnect()
    mural.innerHTML = ''; mural.classList.add('jor-novo'); mural.classList.remove('lt-mural')
    mural.appendChild(h(`<p class="vazio jor-vazio">${vazio}</p>`))
    return
  }
  G.soltarTudo()
  const grupos = []
  for (const x of itens) {
    const mes = x.data ? x.data.slice(0, 7) : 'sem-data'
    let g = grupos.at(-1)
    if (!g || g.key !== mes) { const [a, m] = mes === 'sem-data' ? [0, 0] : mes.split('-').map(Number); g = { key: mes, ano: a, mes: m, n: 0, cols: [[], []], alt: [0, 0] }; grupos.push(g) }
    const alt = alturaDoItem(x)
    const col = g.alt[0] <= g.alt[1] ? 0 : 1
    g.cols[col].push(x); g.alt[col] += alt + GAP; g.n++
  }
  for (const g of grupos) g.est = Math.max(g.alt[0], g.alt[1]) - GAP
  observador?.disconnect()
  LT.montar({
    mural, chave, secoes: grupos, reiniciar, unidade: ['item', 'itens'],
    estimar: (g) => g.est,
    renderizar: (g, corpo) => {
      const el = h('<div class="mural-secao"><div class="mural-col"></div><div class="mural-col"></div></div>')
      g.cols.forEach((col, k) => { for (const x of col) el.children[k].appendChild(x.k === 'c' ? cartaoCelular(x, espDe(lista, x.esp).cor) : cartaoPagina(x, lista, null)) })
      corpo.appendChild(el)
    },
    aoAbrirIrPara: abrirIrPara,
  })
}

function pintarItens(itens, lista, { meses = true, vazio = '', palavras = null, ondes = null, chave = '', reiniciar = false } = {}) {
  if (meses) { pintarLinhaDoTempo(itens, lista, { vazio, chave, reiniciar }); return }
  LT.desmontar(); G.soltarTudo()
  const mural = $('jor-mural')
  observador?.disconnect()
  mural.innerHTML = ''
  mural.classList.add('jor-novo')
  mural.classList.remove('lt-mural')
  if (!itens.length) { mural.appendChild(h(`<p class="vazio jor-vazio">${vazio}</p>`)); return }
  let i = 0
  const el = h('<div class="mural-secao"><div class="mural-col"></div><div class="mural-col"></div></div>')
  mural.appendChild(el)
  const alt = [0, 0]
  const POR_VEZ = 40
  const mais = () => {
    for (const fim = Math.min(itens.length, i + POR_VEZ); i < fim; i++) {
      const x = itens[i]
      let c
      if (x.k === 'c') c = cartaoCelular(x, espDe(lista, x.esp).cor)
      else {
        c = cartaoPagina(x, lista, palavras ? '' : null)
        if (palavras) P.trechoDe(x.m, ondes?.get(x.m.id) ?? 0, palavras).then((t) => { const el = c.querySelector('.trecho'); if (el) { if (t) el.innerHTML = t; else el.remove() } })
      }
      const col = alt[0] <= alt[1] ? 0 : 1
      el.children[col].appendChild(c); alt[col] += alturaDoItem(x)
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

// ---------------------------------------------------------------- galeria: todas as imagens do espaço
/** As imagens do espaço: as das páginas do PC (hashes guardados no resumo) e as fotos do celular. Mais recentes primeiro. */
async function itensDaGaleria(lista, q) {
  const U = P.estado()
  const palavras = norm(q).split(/\s+/).filter(Boolean)
  const doTitulo = (t) => !palavras.length || palavras.every((w) => norm(t).includes(w))
  const doEspaco = (esp) => (J.todos && q ? true : esp === J.espaco)
  const porHash = new Map()
  if (U.aberto) {
    const metas = await A.completarResumos()
    for (const m of metas) {
      if (ehTracker(m) || !m.imagens?.length) continue
      const esp = m.espaco || 'inbox'
      if (!doEspaco(esp) || !doTitulo(m.titulo || '')) continue
      const data = m.data || chaveDeMs(m.quando)
      for (const hash of m.imagens) {
        const antes = porHash.get(hash)
        // a mesma imagem em duas páginas aparece uma vez só, na página mais antiga
        if (!antes || (data && (!antes.data || data < antes.data))) porHash.set(hash, { tipo: 'pc', hash, data, titulo: m.titulo || 'Sem título', metaId: m.id, esp })
      }
    }
  }
  const itens = [...porHash.values()]
  const nPC = itens.length
  let nCel = 0
  for (const f of ui.fotosJournal()) {
    const esp = f.it?.tipo === 'nota' ? espacoDaNota(f.espaco, lista) : 'journal'
    if (!doEspaco(esp) || !doTitulo(f.titulo)) continue
    itens.push({ tipo: 'cel', caminho: f.caminho, data: f.data || '', titulo: f.titulo, it: f.it, esp }); nCel++
  }
  itens.sort((a, b) => b.data.localeCompare(a.data))
  return { itens, nPC, nCel }
}
const quantas = (n) => `${num(n)} ${n === 1 ? 'imagem' : 'imagens'}`
function desenharEscopoGaleria(lista, q, g) {
  const box = $('jor-escopo')
  if (!box) return
  const nome = espDe(lista, J.espaco).nome
  const anos = g.itens.filter((x) => x.data).map((x) => Number(x.data.slice(0, 4)))
  const de = anos.length ? Math.min(...anos) : 0, ate = anos.length ? Math.max(...anos) : 0
  const resumo = !g.itens.length ? (q ? 'Nenhuma imagem com essa busca' : '') : `<b class="men-n">${quantas(g.itens.length)}</b> ${q ? 'em páginas com essa busca' : 'em ' + e(nome)}${de ? (de === ate ? `, de ${de}` : `, de ${de} a ${ate}`) : ''}.`
  box.hidden = !resumo && !q
  box.innerHTML = `<span>${resumo}</span>${q ? `<button type="button" class="link" data-a="escopo">${J.todos ? 'Só em ' + e(nome) : 'Procurar em todos'}</button>` : ''}`
  box.querySelector('[data-a="escopo"]')?.addEventListener('click', () => { J.todos = !J.todos; render(false) })
  box.classList.toggle('gal-resumo', !q)
}
async function desenharGaleria(lista, seq, q, trocou) {
  const U = P.estado()
  const mural = $('jor-mural')
  if (U.aberto && !LT.montado()) {
    // primeira vez com a chave: completar os resumos pode levar alguns segundos; mostra o que está acontecendo
    mural.classList.remove('lt-mural'); mural.innerHTML = '<p class="vazio jor-vazio gal-preparando">Preparando a galeria…</p>'
  }
  const g = await itensDaGaleria(lista, q)
  if (seq !== J.seq) return
  desenharEscopoGaleria(lista, q, g)
  const modo = `gal|${J.espaco}|${q}|${J.todos}`
  if (!g.itens.length) {
    LT.desmontar(); G.soltarTudo(); observador?.disconnect()
    mural.classList.remove('lt-mural'); mural.classList.add('jor-novo')
    mural.innerHTML = `<p class="vazio jor-vazio">${q ? 'Nenhuma imagem nas páginas com essa busca.' : U.aberto ? 'Nenhuma imagem neste espaço ainda.' : J.espaco === 'journal' ? 'Nenhuma foto do celular ainda.<br><small>Abra os dados do PC para ver também as imagens das páginas.</small>' : 'Nada seu neste espaço ainda. Abra os dados do PC para ver as imagens das páginas.'}</p>`
    J.ultimoModo = modo
    return
  }
  const secoes = G.secoesDaGaleria(g.itens)
  const chave = `${modo}|${g.itens.length}|${g.itens.map((x) => (x.hash || x.caminho).slice(-6)).join('')}`
  observador?.disconnect()
  LT.montar({
    mural, chave, secoes, reiniciar: trocou || J.ultimoModo !== modo, unidade: ['imagem', 'imagens'],
    estimar: G.estimarGrade,
    renderizar: (s, corpo) => G.montarMes(s, corpo, g.itens),
    liberar: G.liberarMes,
    aoAbrirIrPara: abrirIrPara,
  })
  J.ultimoModo = modo
}

// ---------------------------------------------------------------- a folha "Ir para…" (anos e meses, com contagens)
function abrirIrPara() {
  const anos = LT.anos()
  if (!anos.length || !ui.abrirFolha) return
  const [um, varios] = LT.unidade()
  const atual = LT.secaoAtual()
  const unidade = (n) => `${num(n)} ${n === 1 ? um : varios}`
  const folha = h('<div class="ir-folha"><p class="folha-pergunta ir-titulo">Ir para…</p><div class="ir-corpo"></div></div>')
  const corpo = folha.querySelector('.ir-corpo')
  const titulo = folha.querySelector('.ir-titulo')
  const pular = async (key) => { await ui.fecharCamada(); LT.irPara(key) }
  const verAnos = () => {
    titulo.textContent = 'Ir para…'
    corpo.className = 'ir-corpo ir-anos'
    corpo.innerHTML = ''
    anos.forEach((a, k) => {
      const b = h(`<button type="button" class="ir-ano${atual && (atual.ano || 0) === a.ano ? ' agora' : ''}" style="--i:${Math.min(k, 12)}"><b>${a.ano || 'Sem data'}</b><small>${unidade(a.n)}</small></button>`)
      b.onclick = () => (a.ano ? verMeses(a) : pular(a.meses[0].key))
      corpo.appendChild(b)
    })
  }
  const verMeses = (a) => {
    titulo.textContent = String(a.ano)
    corpo.className = 'ir-corpo ir-meses'
    corpo.innerHTML = '<button type="button" class="link ir-volta" data-a="anos">‹ Todos os anos</button>'
    corpo.querySelector('[data-a="anos"]').onclick = verAnos
    const porMes = new Map(a.meses.map((m) => [m.mes, m]))
    for (let m = 1; m <= 12; m++) {
      const d = porMes.get(m)
      const b = h(`<button type="button" class="ir-mes${d ? '' : ' vazio-mes'}${atual && atual.ano === a.ano && atual.mes === m ? ' agora' : ''}" style="--i:${m}" ${d ? '' : 'disabled'}><b>${MES3[m - 1]}</b><small>${d ? num(d.n) : '·'}</small></button>`)
      if (d) b.onclick = () => pular(d.key)
      corpo.appendChild(b)
    }
  }
  verAnos()
  ui.abrirFolha(folha)
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
  box.classList.remove('gal-resumo')
  if (!ver) return
  const nome = espDe(lista, J.espaco).nome
  box.innerHTML = `<span>${total === 0 ? 'Nada' : num(total) + (total === 1 ? ' resultado' : ' resultados')} ${J.todos ? 'em todos os espaços' : 'em ' + e(nome)}.</span><button type="button" class="link" data-a="escopo">${J.todos ? 'Só em ' + e(nome) : 'Procurar em todos'}</button>`
  box.querySelector('[data-a="escopo"]').onclick = () => { J.todos = !J.todos; render(false) }
}

async function desenharEspaco(lista, seq, trocou = false) {
  const U = P.estado()
  const q = J.q.trim()
  if (J.filtro === 'galeria') { await desenharGaleria(lista, seq, q, trocou); return }
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
  if (J.filtro === 'pastas' && J.espaco !== 'journal' && U.aberto) { await desenharPastas(lista, cel, seq, trocou); return }
  const itens = [...cel, ...pc].filter((x) => x.esp === J.espaco && filtroOk(x)).sort(ordem)
  const vazio = J.espaco === 'journal'
    ? 'Nada aqui ainda. Faça a entrevista ou toque em + Nota.'
    : (U.aberto ? 'Este espaço está vazio.' : 'Nada seu neste espaço ainda. Abra os dados do PC para ver as páginas dele.')
  const modo = `tl|${J.espaco}|${J.filtro}`
  pintarItens(itens, lista, { meses: true, vazio, chave: `${modo}|${assinaturaDe(itens, lista)}`, reiniciar: trocou || J.ultimoModo !== modo })
  J.ultimoModo = modo
}

// ---------------------------------------------------------------- pastas (como no PC)
// Duas origens, iguais às do PC: página dentro de página (campo "pai") e o caminho de pasta que veio do Notion
// (campo "pasta", "Faculdade/3º período/Cálculo"). O toque numa pasta entra nela; o caminho no topo volta.
const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' })
function arvoreDoEspaco(metas) {
  const raiz = { id: '', nome: '', filhos: [], pagina: null }
  const nos = new Map()
  const porId = new Map(metas.map((m) => [m.id, m])); const ids = porId
  const noDaPagina = (m) => { let n = nos.get(m.id); if (!n) { n = { id: m.id, nome: m.titulo || 'Sem título', filhos: [], pagina: m }; nos.set(m.id, n) } return n }
  const noDaPasta = (caminho) => {
    let atual = raiz, acc = ''
    for (const parte of caminho.split('/').map((x) => x.trim()).filter(Boolean)) {
      acc += '/' + parte
      let n = nos.get('pasta:' + acc)
      if (!n) { n = { id: 'pasta:' + acc, nome: parte, filhos: [], pagina: null }; nos.set(n.id, n); atual.filhos.push(n) }
      atual = n
    }
    return atual
  }
  for (const m of metas) {
    const n = noDaPagina(m)
    if (m.pai && ids.has(m.pai) && m.pai !== m.id) noDaPagina(porId.get(m.pai)).filhos.push(n)
    else (m.pasta ? noDaPasta(m.pasta) : raiz).filhos.push(n)
  }
  return { raiz, nos }
}
const totalDentro = (n) => n.filhos.reduce((s, f) => s + (f.pagina ? 1 : 0) + totalDentro(f), 0)
const ICONE_PASTA = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.2h8.5A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>'

async function desenharPastas(lista, cel, seq, trocou) {
  const metas = (await A.completarResumos()).filter((m) => !ehTracker(m) && (m.espaco || 'inbox') === J.espaco)
  if (seq !== J.seq) return
  LT.desmontar(); G.soltarTudo(); observador?.disconnect()
  const { raiz, nos } = arvoreDoEspaco(metas)
  // o caminho guardado pode ter sumido (página apagada ou movida): corta onde quebrou
  const caminho = []
  for (const id of J.caminho) { if (!nos.has(id)) break; caminho.push(nos.get(id)) }
  J.caminho = caminho.map((n) => n.id)
  const atual = caminho[caminho.length - 1] || raiz
  const esp = espDe(lista, J.espaco)
  const mural = $('jor-mural')
  mural.innerHTML = ''
  mural.classList.add('jor-novo')
  mural.classList.remove('lt-mural')
  const ir = (ids) => { J.caminho = ids; render(false); animarTroca(); window.scrollTo({ top: 0 }) }

  // o caminho: Faculdade › 3º período › Cálculo (cada pedaço volta para lá)
  if (caminho.length) {
    const migalhas = h('<nav class="pastas-caminho" aria-label="Onde você está"></nav>')
    const voltar = h(`<button type="button" class="pastas-voltar" aria-label="Voltar uma pasta">‹</button>`)
    voltar.onclick = () => ir(J.caminho.slice(0, -1))
    migalhas.appendChild(voltar)
    const partes = [{ nome: esp.nome, ids: [] }, ...caminho.map((n, i) => ({ nome: n.nome, ids: J.caminho.slice(0, i + 1) }))]
    partes.forEach((p, i) => {
      if (i) migalhas.appendChild(h('<span class="pastas-sep">›</span>'))
      const ultimo = i === partes.length - 1
      const b = h(`<button type="button" class="pastas-migalha"${ultimo ? ' aria-current="page"' : ''}>${e(p.nome)}</button>`)
      if (!ultimo) b.onclick = () => ir(p.ids)
      migalhas.appendChild(b)
    })
    mural.appendChild(migalhas)
    mural.appendChild(h(`<h2 class="pastas-titulo">${e(atual.nome)}</h2>`))
  }
  // dentro de uma página que tem filhas: a própria página vem primeiro
  if (atual.pagina) {
    const b = h(`<button type="button" class="pastas-propria"><span>Abrir a página</span><b>${e(atual.nome)}</b></button>`)
    b.onclick = () => P.abrirPagina(atual.pagina.id)
    mural.appendChild(b)
  }
  const pastas = atual.filhos.filter((n) => n.filhos.length).sort(porNome)
  const soltas = atual.filhos.filter((n) => !n.filhos.length && n.pagina)
    .sort((a, b) => String(b.pagina.data || '').localeCompare(String(a.pagina.data || '')) || porNome(a, b))
  // as notas do celular deste espaço ficam no nível de cima (não têm pasta)
  const doCelular = caminho.length ? [] : cel.filter((x) => x.esp === J.espaco).sort(ordem)
  if (!pastas.length && !soltas.length && !doCelular.length && !atual.pagina) { mural.appendChild(h('<p class="vazio jor-vazio">Este espaço está vazio.</p>')); return }
  if (!caminho.length && !pastas.length) mural.appendChild(h('<p class="meta pastas-dica">Nada aqui está organizado em pastas. As páginas aparecem soltas.</p>'))
  if (pastas.length) {
    const box = h('<div class="pastas-lista"></div>')
    pastas.forEach((n, i) => {
      const tot = totalDentro(n)
      const b = h(`<button type="button" class="pasta-linha" style="--i:${Math.min(i, 14)};--cor:${e(esp.cor || '#968073')}">
        <span class="pasta-icone">${ICONE_PASTA}</span>
        <span class="pasta-nome"><b>${e(n.nome)}</b><small>${num(tot)} ${tot === 1 ? 'nota' : 'notas'}${n.pagina ? ' · é uma página' : ''}</small></span>
        <span class="pasta-seta" aria-hidden="true">›</span></button>`)
      b.onclick = () => ir([...J.caminho, n.id])
      box.appendChild(b)
    })
    mural.appendChild(box)
  }
  const itens = [...doCelular, ...soltas.map((n) => ({ k: 'p', m: n.pagina, esp: J.espaco, data: n.pagina.data || chaveDeMs(n.pagina.quando), t: n.pagina.quando || 0 }))]
  if (itens.length) {
    if (pastas.length) mural.appendChild(h(`<h3 class="pastas-sub">${caminho.length ? 'Notas' : 'Notas soltas'}</h3>`))
    const el = h('<div class="mural-secao"><div class="mural-col"></div><div class="mural-col"></div></div>')
    const alt = [0, 0]
    for (const x of itens.slice(0, 400)) {
      const c = x.k === 'c' ? cartaoCelular(x, esp.cor) : cartaoPagina(x, lista)
      const col = alt[0] <= alt[1] ? 0 : 1
      el.children[col].appendChild(c); alt[col] += alturaDoItem(x)
    }
    mural.appendChild(el)
  }
  if (trocou) animarTroca()
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
  mural.classList.remove('lt-mural')
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
  // Pessoas na ordem do próximo aniversário (pedido do JV, 14/11): hoje primeiro; sem data de nascimento, no fim.
  const faltam = new Map(proximosAniversarios(pes, hoje, 366).map((a) => [a.pessoa.id, a.dias]))
  const todasPessoas = men.indice.pessoas.filter((x) => passa(x.nome))
    .sort((a, b) => (faltam.get(a.id) ?? 999) - (faltam.get(b.id) ?? 999) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
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
  if (J.espaco === NEWS && !ui.temNews?.()) J.espaco = 'journal'
  if (J.espaco !== PESSOAS_E_LUGARES && J.espaco !== NEWS && !lista.some((x) => x.id === J.espaco)) J.espaco = 'journal'
  desenharSeletor(lista, contagens, U.aberto)
  desenharStatus()
  const busca = $('jor-busca')
  busca.hidden = J.espaco === NEWS
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
  const nova = $('jor-nova')
  if (nova) nova.style.display = J.espaco === NEWS ? 'none' : ''
  if (J.espaco === NEWS) {
    LT.desmontar(); G.soltarTudo(); observador?.disconnect(); desenharEscopo(lista, '', 0)
    const mural = $('jor-mural')
    mural.classList.remove('lt-mural')
    mural.innerHTML = '<div class="news-caixa"></div>'
    ui.desenharNews()
    return
  }
  if (emPessoas) { LT.desmontar(); G.soltarTudo(); desenharEscopo(lista, '', 0); await desenharPessoas(seq) } else await desenharEspaco(lista, seq, trocou)
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
  G.iniciar(ligacoes)
  const busca = $('jor-busca')
  let t
  busca.oninput = (ev) => { clearTimeout(t); const v = ev.target.value; t = setTimeout(() => { J.q = v; render(false) }, 120) }
  $('jor-lupa').onclick = null
  $('jor-mural').classList.add('jor-novo')
  P.registrarVista('mencao', vistaMencao)
  P.aoMudar(aoMudarSecao)
  window.JJ_JOR = { ativo: true, render: () => render(false), aniversarios, estado: () => ({ ...J, men: !!J.men }), medida: null, medidasLinhaDoTempo: LT.medidasDeRolagem, medidasGaleria: G.medidasDaGaleria, irPara: LT.irPara, mencoes, mencaoMs: () => J.men?.ms || null }
  render(false)
}
