// Páginas do PC no celular, parte "com tela" (Etapa 2): abrir os dados, espaços, lista, busca, leitura e edição simples.
// Tudo aqui é ADITIVO: não lê nem grava nada do localStorage do app. A lógica (cofre, troca com a nuvem, imagens) está em pc-sync.js.
import { esc as e, tiptapParaHtml } from './tiptap-html.mjs'
import { docParaMarkdown, markdownParaDoc, editavel as docEditavel } from './tiptap-md.mjs'
import * as A from './armazem.js'
import * as S from './pc-sync.js'

let UI = null          // ligações com o novo.js: { abrirCamada, fecharCamada, abrirFolha, buscarLigacao, nuvem }
let sobre = null       // a tela cheia da seção
const U = { aberto: false, metas: [], espacos: [], estado: null, contagem: null, q: '', sinc: { rodando: false, feitos: 0, offline: false, erro: null, primeira: false }, visto: 0 }
const pilha = []       // vistas abertas: { nome, args, rolagem }
const rascunhos = new Map() // texto de edição não salvo, por página (só nesta sessão)
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
const num = (n) => Number(n || 0).toLocaleString('pt-BR')
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dataCurta = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()} ${MES3[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}` }
const haQuanto = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} dias` }
const reduzMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ICONE_VOLTAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>'
const ICONE_LUPA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
const ICONE_ATUALIZAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/></svg>'
const ICONE_CADEADO = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'

// ---------------------------------------------------------------- dados da seção
const ESPACO_INBOX = { id: 'inbox', nome: 'Inbox', icone: '?', cor: '#B8893F', corTexto: '#1A110D' }
const ORDEM = ['journal', 'faculdade', 'cursos', 'notas', 'inbox']
async function carregar() {
  U.aberto = await S.estaAberto()
  U.estado = await A.lerEstado()
  if (!U.aberto) { U.metas = []; U.espacos = []; U.contagem = null; return }
  U.metas = await A.listarMetas()
  U.contagem = await A.contar()
  const lista = await A.listarEspacos()
  const porId = new Map(lista.map((x) => [x.id, x]))
  if (U.contagem.porEspaco.inbox && !porId.has('inbox')) porId.set('inbox', ESPACO_INBOX)
  for (const id of Object.keys(U.contagem.porEspaco)) if (!porId.has(id)) porId.set(id, { id, nome: id, icone: id[0]?.toUpperCase() || '?', cor: '#968073', corTexto: '#120B09' })
  U.espacos = [...porId.values()].sort((a, b) => (U.contagem.porEspaco[b.id] || 0) - (U.contagem.porEspaco[a.id] || 0) || ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id))
}
const espacoDe = (id) => U.espacos.find((x) => x.id === (id || 'inbox')) || ESPACO_INBOX
const corDoEspaco = (x) => x?.cor || '#968073'

// ---------------------------------------------------------------- troca com a nuvem
let sincTimer = null
export function agendarSinc(ms = 500) { clearTimeout(sincTimer); sincTimer = setTimeout(() => iniciarSinc(), ms) }
export async function iniciarSinc() {
  if (typeof DEMO !== 'undefined' && DEMO) return null
  if (!(await S.estaAberto())) return null
  const primeira = !(await A.lerEstado()).ultima
  Object.assign(U.sinc, { rodando: true, feitos: 0, primeira, erro: null })
  pintarSinc()
  let ultimaAtualizacao = 0
  const r = await S.sincronizar(UI, async (p) => {
    U.sinc.feitos = p.resumo.recebidos + p.resumo.apagados
    pintarSinc()
    // o que já chegou aparece na lista enquanto o resto vem (no máximo a cada 1,5 s)
    if (Date.now() - ultimaAtualizacao > 1500) { ultimaAtualizacao = Date.now(); await carregar(); pintarSinc(true) }
  })
  U.sinc.rodando = false
  U.sinc.offline = !!r.offline
  U.sinc.erro = r.erro && !r.offline ? r.erro : null
  U.visto = Date.now()
  await carregar()
  pintarSinc(true)
  if (!r.erro && r.resumo?.conflitos) avisarGlobal(r.resumo.conflitos === 1 ? 'Uma página mudou nos dois lados: a sua versão ficou como cópia "(conflito)".' : `${r.resumo.conflitos} páginas mudaram nos dois lados: as suas versões ficaram como cópias "(conflito)".`)
  return r
}
const avisarGlobal = (t) => { try { avisar(t) } catch { /* sem aviso global */ } }

// ---------------------------------------------------------------- pedaços de tela
function anel(frac, indet, numero, legenda, classe = '') {
  const C = 326.7
  return `<div class="pc-anel ${indet ? 'indet' : ''} ${classe}" role="img" aria-label="${e(numero)} ${e(legenda)}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trilho" cx="60" cy="60" r="52"/><circle class="arco" cx="60" cy="60" r="52" style="stroke-dasharray:${(Math.max(0, Math.min(1, frac)) * C).toFixed(1)} ${C}"/></svg>
    <div class="pc-anel-texto"><b class="pc-num">${e(numero)}</b><small>${e(legenda)}</small></div></div>`
}
const topo = (extra = '', titulo = '') => `<header class="pc-topo"><button class="icone-b" data-a="voltar" aria-label="Voltar">${ICONE_VOLTAR}</button>${titulo ? `<h2 class="pc-topo-titulo">${e(titulo)}</h2>` : '<span></span>'}${extra}</header>`

function cartaoPagina(m, i = 0, trecho = null) {
  const esp = espacoDe(m.espaco)
  const el = h(`<button class="pc-item" style="--i:${Math.min(i, 12)}" data-id="${e(m.id)}">
    <b>${e(m.titulo || 'Sem título')}</b>
    ${trecho !== false ? `<span class="pc-previa">${trecho != null ? trecho : e(m.previa || '')}</span>` : ''}
    <span class="pc-pe"><i class="ponto-esp" style="background:${e(corDoEspaco(esp))}"></i>${e(dataCurta(m.quando) || '')}${dataCurta(m.quando) ? ' · ' : ''}${e(esp.nome)}${m.pendente ? '<em class="pc-pend">esperando para subir</em>' : ''}</span>
  </button>`)
  if (!m.previa && trecho == null) el.querySelector('.pc-previa')?.remove()
  el.onclick = () => ir('leitura', { id: m.id })
  return el
}

/** Lista grande por pedaços (a página mais antiga do Journal tem 10 anos de textos). */
function listaEmPedacos(metas, caixa, { trechos = null } = {}) {
  let i = 0
  const POR_VEZ = 40
  let obs = null
  const mais = () => {
    for (const fim = Math.min(metas.length, i + POR_VEZ); i < fim; i++) {
      const m = metas[i]
      const c = cartaoPagina(m, i - (fim - POR_VEZ), trechos ? '' : null)
      caixa.appendChild(c)
      if (trechos) trechos(m).then((t) => { const p = c.querySelector('.pc-previa'); if (p) { if (t) p.innerHTML = t; else p.remove() } })
    }
    if (i < metas.length) {
      const s = h('<div class="sentinela"></div>')
      caixa.appendChild(s)
      obs?.disconnect()
      obs = new IntersectionObserver((v) => { if (v[0].isIntersecting) { obs.disconnect(); s.remove(); mais() } }, { rootMargin: '700px' })
      obs.observe(s)
    }
  }
  mais()
}

// ---------------------------------------------------------------- navegação (cada vista = uma camada do botão Voltar do Android)
function abrirSobre() {
  sobre.hidden = false
  pilha.length = 0
  pilha.push({ nome: 'inicio', args: {} })
  UI.abrirCamada(() => { sobre.hidden = true; sobre.innerHTML = ''; pilha.length = 0; renderPortal() })
  carregar().then(desenhar)
  if (Date.now() - U.visto > 20_000) agendarSinc(300)
}
export function ir(nome, args = {}) {
  const atual = pilha.at(-1)
  if (atual) atual.rolagem = sobre.scrollTop
  pilha.push({ nome, args })
  UI.abrirCamada(() => { pilha.pop(); desenhar(true) })
  desenhar()
}
const voltar = () => UI.fecharCamada()

const VISTAS = { inicio: vistaInicio, espaco: vistaEspaco, leitura: vistaLeitura, editor: vistaEditor, abrir: vistaAbrir, foto: vistaFoto }
async function desenhar(restaurar = false) {
  const topoDaPilha = pilha.at(-1)
  if (!topoDaPilha || sobre.hidden) return
  if (topoDaPilha.nome === 'inicio' || topoDaPilha.nome === 'espaco') { U.aberto = await S.estaAberto() }
  const el = await VISTAS[topoDaPilha.nome](topoDaPilha.args)
  if (pilha.at(-1) !== topoDaPilha) return // mudou de vista enquanto carregava
  sobre.innerHTML = ''
  sobre.appendChild(el)
  sobre.querySelectorAll('[data-a="voltar"]').forEach((b) => (b.onclick = voltar))
  sobre.scrollTop = restaurar && topoDaPilha.rolagem ? topoDaPilha.rolagem : 0
  if (el.depois) el.depois()
}

// ---------------------------------------------------------------- vista: início da seção
async function vistaInicio() {
  await carregar()
  if (!U.aberto) return vistaTrancada()
  const n = U.contagem.paginas
  const el = h(`<div class="pc-vista pc-inicio">
    <div class="pc-luz" aria-hidden="true"></div>
    ${topo(`<button class="icone-b pc-atualizar" data-a="atualizar" aria-label="Atualizar agora">${ICONE_ATUALIZAR}</button>`)}
    <section class="pc-centro">
      <div id="pc-anel-caixa"></div>
      <h1 id="pc-titulo"></h1>
      <p class="pc-status" id="pc-status" role="status"></p>
    </section>
    <label class="pc-busca">${ICONE_LUPA}<input id="pc-busca" type="search" enterkeyhint="search" autocomplete="off" placeholder="Procurar em ${num(n)} páginas" value="${e(U.q)}"></label>
    <div id="pc-corpo"></div>
    <ul class="pc-avisos" id="pc-avisos"></ul>
  </div>`)
  el.querySelector('[data-a="atualizar"]').onclick = () => { S.esquecerFaltantes(); iniciarSinc() }
  const campo = el.querySelector('#pc-busca')
  let t
  campo.oninput = () => { clearTimeout(t); t = setTimeout(() => { U.q = campo.value; pintarCorpo() }, 120) }
  el.depois = () => { pintarSinc(true); pintarCorpo() }
  return el
}

function vistaTrancada() {
  const el = h(`<div class="pc-vista pc-hero">
    <div class="pc-luz" aria-hidden="true"></div>
    ${topo()}
    <section class="pc-centro">
      <div class="pc-anel trancado" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="trilho" cx="60" cy="60" r="52"/></svg><div class="pc-anel-texto">${ICONE_CADEADO}</div></div>
      <h1>As páginas do PC cabem no seu bolso.</h1>
      <p class="pc-texto">Elas ficam na nuvem embaralhadas. Com a senha dos dados, este celular abre, lê e até edita as mais simples.</p>
    </section>
    <button class="botao menta grande" data-a="abrir">Abrir os dados do PC</button>
    <p class="meta pc-nota">Isso não mexe nas suas notas, hábitos e tarefas daqui.</p>
  </div>`)
  el.querySelector('[data-a="abrir"]').onclick = () => ir('abrir')
  return el
}

/** Atualiza anel, título e status sem redesenhar a tela (a busca continua com o dedo onde estava). */
function pintarSinc(fim = false) {
  atualizarPortal()
  const cx = document.getElementById('pc-anel-caixa')
  if (!cx || !U.contagem) return
  const s = U.sinc
  const total = U.estado?.total || null
  const n = U.contagem.paginas
  const baixando = s.rodando && (s.primeira || s.feitos > 0)
  const numero = baixando && s.primeira ? s.feitos : n
  const frac = baixando && s.primeira ? (total ? s.feitos / total : 0.25) : 1
  const indet = baixando && s.primeira && !total
  const novoAnel = anel(frac, indet, num(numero), baixando && s.primeira ? 'baixadas' : 'páginas', !baixando && fim && !reduzMovimento() ? 'completo' : '')
  const velho = cx.firstElementChild
  if (velho && velho.dataset.estado === `${baixando}|${indet}`) {
    velho.querySelector('.pc-num').textContent = num(numero)
    velho.querySelector('small').textContent = baixando && s.primeira ? 'baixadas' : 'páginas'
    velho.querySelector('.arco').style.strokeDasharray = `${(Math.max(0, Math.min(1, frac)) * 326.7).toFixed(1)} 326.7`
  } else { cx.innerHTML = novoAnel; cx.firstElementChild.dataset.estado = `${baixando}|${indet}` }
  const caixaBusca = document.getElementById('pc-busca')
  if (caixaBusca) caixaBusca.placeholder = `Procurar em ${num(n)} páginas`
  const t = document.getElementById('pc-titulo')
  if (t) t.textContent = baixando && s.primeira ? 'Trazendo as páginas do PC…' : 'As páginas do PC estão no seu bolso.'
  const st = document.getElementById('pc-status')
  if (st) {
    st.className = 'pc-status' + (s.erro ? ' erro' : '')
    st.textContent = s.rodando ? (s.primeira ? `${num(s.feitos)}${total ? ' de ' + num(total) : ''} páginas baixadas. Pode ler o que já chegou.` : 'Conferindo o que mudou…')
      : s.erro ? `Não consegui atualizar: ${s.erro}`
      : s.offline ? 'Sem internet agora. Tento de novo quando voltar.'
      : U.estado?.ultima ? `Atualizado ${haQuanto(U.estado.ultima)}.` : ''
  }
  const av = document.getElementById('pc-avisos')
  if (av) {
    av.innerHTML = ''
    for (const a of U.estado?.avisos || []) av.appendChild(h(`<li>${e(a.texto)} <small>${e(haQuanto(a.quando))}</small></li>`))
    if (U.contagem.pendentes) av.appendChild(h(`<li>${num(U.contagem.pendentes)} ${U.contagem.pendentes === 1 ? 'página editada aqui ainda não subiu' : 'páginas editadas aqui ainda não subiram'}.</li>`))
    if (U.estado?.avisos?.length) { const b = h('<li><button class="link" data-a="limpar">Dispensar avisos</button></li>'); b.querySelector('button').onclick = async () => { await S.limparAvisos(); await carregar(); pintarSinc() }; av.appendChild(b) }
    av.hidden = !av.children.length
  }
  if (fim) pintarCorpo()
}

/** Espaços + mais recentes, ou os resultados da busca. */
async function pintarCorpo() {
  const corpo = document.getElementById('pc-corpo')
  if (!corpo || !U.contagem) return
  const q = U.q.trim()
  corpo.innerHTML = ''
  if (q) {
    const achados = await A.buscar(q)
    if (document.getElementById('pc-corpo') !== corpo || U.q.trim() !== q) return
    if (!achados.length) { corpo.appendChild(h(`<p class="vazio pc-vazio">Nenhuma página com “${e(q)}”.<br><small>A busca ignora acento e maiúscula.</small></p>`)); return }
    corpo.appendChild(h(`<h2 class="pc-sub">${num(achados.length)} ${achados.length === 1 ? 'página tem' : 'páginas têm'} “${e(q)}”</h2>`))
    const lista = h('<div class="pc-lista"></div>')
    corpo.appendChild(lista)
    const palavras = A.normalizar(q).split(/\s+/).filter(Boolean)
    const mapa = new Map(achados.map((a) => [a.meta.id, a.onde]))
    listaEmPedacos(achados.map((a) => a.meta), lista, { trechos: async (m) => trechoDe(m, mapa.get(m.id), palavras) })
    return
  }
  if (!U.metas.length) {
    corpo.appendChild(h(U.sinc.rodando ? '<p class="vazio pc-vazio">As primeiras páginas aparecem aqui em instantes…</p>' : '<p class="vazio pc-vazio">Nenhuma página ainda. Toque em atualizar para buscar o que o PC mandou.</p>'))
    return
  }
  corpo.appendChild(h('<h2 class="pc-sub">Seus espaços</h2>'))
  const maior = Math.max(...U.espacos.map((x) => U.contagem.porEspaco[x.id] || 0), 1)
  const caixa = h('<div class="pc-espacos"></div>')
  U.espacos.filter((x) => U.contagem.porEspaco[x.id]).forEach((x, i) => {
    const total = U.contagem.porEspaco[x.id]
    const ultima = U.metas.find((m) => (m.espaco || 'inbox') === x.id)
    const b = h(`<button class="pc-espaco ${i === 0 ? 'principal' : ''}" style="--cor:${e(corDoEspaco(x))};--i:${i}">
      <i class="pc-chip">${e(x.icone || x.nome[0])}</i>
      <span class="pc-espaco-corpo"><b>${e(x.nome)}</b><small>${num(total)} ${total === 1 ? 'página' : 'páginas'}${i === 0 && ultima ? ' · a mais recente: ' + e(dataCurta(ultima.quando)) : ''}</small>
      <span class="pc-barra" aria-hidden="true"><i style="width:${Math.max(3, Math.round((total / maior) * 100))}%"></i></span></span>
    </button>`)
    b.onclick = () => ir('espaco', { id: x.id })
    caixa.appendChild(b)
  })
  corpo.appendChild(caixa)
  corpo.appendChild(h('<h2 class="pc-sub">Mais recentes</h2>'))
  const rec = h('<div class="pc-lista"></div>')
  U.metas.slice(0, 6).forEach((m, i) => rec.appendChild(cartaoPagina(m, i)))
  corpo.appendChild(rec)
}

async function trechoDe(meta, onde, palavras) {
  const reg = await A.lerPagina(meta.id)
  if (!reg) return ''
  const texto = reg.texto
  if (!texto) return ''
  const ini = Math.max(0, (onde >= 0 ? onde : 0) - 50)
  let rec = texto.slice(ini, ini + 170)
  const norm = A.normalizar(rec)
  const marcas = []
  for (const p of palavras) { let k = 0; while ((k = norm.indexOf(p, k)) >= 0) { marcas.push([k, k + p.length]); k += p.length } }
  marcas.sort((a, b) => a[0] - b[0])
  let saida = '', pos = 0
  for (const [a, b] of marcas) { if (a < pos) continue; saida += e(rec.slice(pos, a)) + '<mark>' + e(rec.slice(a, b)) + '</mark>'; pos = b }
  saida += e(rec.slice(pos))
  return (ini > 0 ? '… ' : '') + saida + (ini + 170 < texto.length ? ' …' : '')
}

// ---------------------------------------------------------------- vista: abrir os dados (senha ou código)
function vistaAbrir() {
  let modoCodigo = false
  const el = h(`<div class="pc-vista pc-abrir">
    ${topo()}
    <h1>Digite a senha dos dados</h1>
    <p class="pc-texto">É a mesma que você criou no Journal do PC, em Ajustes. Ela não é guardada: só a chave que ela abre fica neste celular.</p>
    <form id="pc-form" autocomplete="off">
      <input id="pc-senha" class="campo" type="password" autocomplete="current-password" placeholder="Senha dos dados" enterkeyhint="go">
      <input id="pc-codigo" class="campo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código de recuperação (K7QM-…)" hidden>
      <p class="pc-erro" id="pc-erro" role="alert"></p>
      <button class="botao menta grande" id="pc-enviar" type="submit">Abrir os dados</button>
      <button class="link" id="pc-alterna" type="button">Usar o código de recuperação</button>
    </form>
  </div>`)
  const senha = el.querySelector('#pc-senha'), codigo = el.querySelector('#pc-codigo'), erro = el.querySelector('#pc-erro'), enviar = el.querySelector('#pc-enviar')
  el.querySelector('#pc-alterna').onclick = (ev) => {
    modoCodigo = !modoCodigo
    senha.hidden = modoCodigo; codigo.hidden = !modoCodigo; erro.textContent = ''
    el.querySelector('h1').textContent = modoCodigo ? 'Digite o código de recuperação' : 'Digite a senha dos dados'
    ev.currentTarget.textContent = modoCodigo ? 'Usar a senha' : 'Usar o código de recuperação'
    ;(modoCodigo ? codigo : senha).focus()
  }
  const MENSAGENS = {
    senha: 'Senha errada. Confira e tente de novo.', codigo: 'Esse código não abriu. Confira as letras, com ou sem traços.',
    'sem-cofre': 'O PC ainda não protegeu os dados com senha. No Journal do PC: Ajustes › Proteger meus dados com senha.',
    'sem-ligacao': 'Falta ligar o backup (Ajustes na Início): a ligação com o PC vem junto.',
    'sem-rede': 'Sem internet agora. Conecte e tente de novo.',
  }
  el.querySelector('#pc-form').onsubmit = async (ev) => {
    ev.preventDefault()
    const valor = modoCodigo ? codigo.value.trim() : senha.value
    if (!valor) { erro.textContent = modoCodigo ? 'Digite o código.' : 'Digite a senha.'; return }
    enviar.disabled = true; enviar.textContent = 'Abrindo…'; erro.textContent = ''
    try {
      const r = await S.abrirDados(modoCodigo ? { codigo: valor } : { senha: valor }, UI)
      if (!r.ok) { erro.textContent = MENSAGENS[r.erro] || 'Não consegui abrir.'; return }
      senha.value = ''
      await voltar() // fecha a tela da senha
      await carregar(); await desenhar(); renderPortal()
      iniciarSinc()
    } catch (err) { erro.textContent = 'Não consegui abrir: ' + (err.message || err) } finally { enviar.disabled = false; enviar.textContent = 'Abrir os dados' }
  }
  el.depois = () => (modoCodigo ? codigo : senha).focus()
  return el
}

// ---------------------------------------------------------------- vista: um espaço
async function vistaEspaco({ id }) {
  await carregar()
  const x = espacoDe(id)
  const metas = U.metas.filter((m) => (m.espaco || 'inbox') === id)
  const el = h(`<div class="pc-vista pc-espaco-vista" style="--cor:${e(corDoEspaco(x))}">
    ${topo('', x.nome)}
    <p class="pc-contagem"><i class="pc-chip">${e(x.icone || x.nome[0])}</i>${num(metas.length)} ${metas.length === 1 ? 'página' : 'páginas'}, das mais recentes para as mais antigas</p>
    <div class="pc-lista" id="pc-lista"></div>
  </div>`)
  if (!metas.length) el.querySelector('#pc-lista').appendChild(h('<p class="vazio pc-vazio">Este espaço está vazio.</p>'))
  el.depois = () => listaEmPedacos(metas, document.getElementById('pc-lista'))
  return el
}

// ---------------------------------------------------------------- vista: leitura
async function vistaLeitura({ id }) {
  const reg = await A.lerPagina(id)
  if (!reg) return h(`<div class="pc-vista">${topo()}<p class="vazio pc-vazio">Esta página não está mais aqui.</p></div>`)
  const { meta, pg } = reg
  const esp = espacoDe(meta.espaco)
  const podeEditar = !!pg.doc && safeEditavel(pg.doc)
  const html = pg.doc ? tiptapParaHtml(pg.doc, { imagem: srcDaImagem }) : ''
  const el = h(`<article class="pc-vista pc-leitura">
    ${topo(`${meta.pendente ? '<span class="pc-selo">esperando para subir</span>' : ''}${podeEditar ? '<button class="botao menta pequeno" data-a="editar">Editar</button>' : ''}`)}
    <p class="pc-meta"><i class="ponto-esp" style="background:${e(corDoEspaco(esp))}"></i>${e(esp.nome)}${meta.quando ? ' · ' + e(dataCurta(meta.quando)) : ''}</p>
    <div class="pc-doc selecionavel">${html || `<h1>${e(meta.titulo)}</h1><p class="meta">Página sem texto.</p>`}</div>
    <p class="pc-rodape">${podeEditar ? 'Você pode editar esta página aqui. Mudanças simples chegam ao PC sozinhas.' : 'Só leitura. Para mudar, use o Journal do PC.'}</p>
  </article>`)
  el.querySelector('[data-a="editar"]')?.addEventListener('click', () => ir('editor', { id }))
  el.depois = () => {
    el.querySelectorAll('img[src^="data:image/gif"]').forEach(carregarImagem)
    el.querySelectorAll('.link-pagina').forEach((s) => {
      const alvo = s.dataset.pagina
      if (alvo && U.metas.some((m) => m.id === alvo)) { s.classList.add('ativo'); s.setAttribute('role', 'link'); s.tabIndex = 0; s.onclick = () => ir('leitura', { id: alvo }) }
    })
  }
  return el
}
const safeEditavel = (doc) => { try { return docEditavel(doc) } catch { return false } }

// Imagens: a página aponta para /imagens/<hash>.<ext>; aqui vira um quadradinho que troca pela miniatura quando ela chega.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
function srcDaImagem(src) {
  const hash = S.hashDaImagem(src)
  if (hash) return `${PIXEL}#${hash}`
  return /^https:\/\//i.test(String(src || '')) ? src : null
}
async function carregarImagem(img) {
  const hash = (img.getAttribute('src').split('#')[1] || '').trim()
  if (!hash) return
  img.classList.add('pc-img-carregando')
  const url = await S.imagemSrc(hash, 'mini', UI)
  if (!url) {
    const falta = h('<span class="pc-sem-img" role="img" aria-label="Imagem ainda não chegou"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg><span>imagem ainda não chegou</span></span>')
    img.replaceWith(falta)
    return
  }
  img.removeAttribute('width'); img.removeAttribute('height')
  img.onload = () => img.classList.remove('pc-img-carregando')
  img.src = url
  img.classList.add('pc-img')
  img.onclick = () => ir('foto', { hash, mini: url })
}

// ---------------------------------------------------------------- vista: imagem inteira
function vistaFoto({ hash, mini }) {
  const el = h(`<div class="pc-vista pc-foto-vista">${topo()}<div class="pc-foto"><img alt="" src="${e(mini)}"></div><p class="meta pc-foto-msg"></p></div>`)
  S.imagemSrc(hash, 'img', UI).then((u) => {
    const img = el.querySelector('img')
    if (u && img) img.src = u
    else el.querySelector('.pc-foto-msg').textContent = 'O original ainda não chegou; esta é a miniatura.'
  })
  return el
}

// ---------------------------------------------------------------- vista: edição simples
async function vistaEditor({ id }) {
  const reg = await A.lerPagina(id)
  if (!reg || !reg.pg.doc || !safeEditavel(reg.pg.doc)) return h(`<div class="pc-vista">${topo()}<p class="vazio pc-vazio">Esta página só pode ser lida aqui.</p></div>`)
  const original = docParaMarkdown(reg.pg.doc)
  const rasc = rascunhos.get(id)
  const el = h(`<div class="pc-vista pc-editor">
    <header class="pc-topo"><button class="link" data-a="voltar">Cancelar</button><span class="pc-topo-titulo pc-editando">${rasc != null ? 'rascunho recuperado' : 'editando'}</span><button class="botao menta pequeno" id="pc-salvar" disabled>Salvar</button></header>
    <textarea id="pc-md" class="pc-md" spellcheck="true" autocapitalize="sentences" aria-label="Texto da página"></textarea>
    <div class="pc-ferr" role="toolbar" aria-label="Formatar">
      <button type="button" data-f="negrito" aria-label="Negrito"><b>N</b></button>
      <button type="button" data-f="italico" aria-label="Itálico"><i>I</i></button>
      <button type="button" data-f="lista" aria-label="Lista">• Lista</button>
      <button type="button" data-f="titulo" aria-label="Título">Título</button>
    </div>
    <p class="meta pc-dica">Texto simples: **negrito**, *itálico*, “- ” abre lista, “# ” vira título.</p>
  </div>`)
  const ta = el.querySelector('#pc-md'), salvar = el.querySelector('#pc-salvar')
  ta.value = rasc != null ? rasc : original
  const mudou = () => ta.value !== original
  const marcar = () => { salvar.disabled = !mudou(); rascunhos.set(id, ta.value); if (!mudou()) rascunhos.delete(id) }
  ta.oninput = marcar
  marcar()
  const envolver = (a, b = a) => {
    const [i, j] = [ta.selectionStart, ta.selectionEnd]
    const sel = ta.value.slice(i, j)
    ta.setRangeText(a + sel + b, i, j, 'end')
    if (!sel) ta.setSelectionRange(i + a.length, i + a.length)
    ta.focus(); marcar()
  }
  const porLinha = (prefixo) => {
    const i = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    let j = ta.value.indexOf('\n', ta.selectionEnd); if (j < 0) j = ta.value.length
    const linhas = ta.value.slice(i, j).split('\n')
    const todas = linhas.every((l) => l.startsWith(prefixo))
    ta.setRangeText(linhas.map((l) => (todas ? l.slice(prefixo.length) : prefixo + l)).join('\n'), i, j, 'end')
    ta.focus(); marcar()
  }
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => ({ negrito: () => envolver('**'), italico: () => envolver('*'), lista: () => porLinha('- '), titulo: () => porLinha('# ') })[b.dataset.f]()))
  salvar.onclick = async () => {
    salvar.disabled = true
    try {
      const doc = markdownParaDoc(ta.value)
      await S.salvarEdicao(id, doc)
      rascunhos.delete(id)
      await voltar()
      await carregar()
      avisarGlobal('Salvo. Enviando para o PC…')
      agendarSinc(400)
    } catch (err) { salvar.disabled = false; avisarGlobal('Não consegui salvar: ' + (err.message || err)) }
  }
  el.depois = () => ta.focus()
  return el
}

// ---------------------------------------------------------------- portal (Journal) e Ajustes
function renderPortal() {
  const b = document.getElementById('jor-pc')
  if (!b) return
  b.onclick = abrirSobre
  atualizarPortal()
}
async function atualizarPortal() {
  const b = document.getElementById('jor-pc')
  if (!b) return
  const aberto = await S.estaAberto()
  let c = null, est = null
  if (aberto) { c = await A.contar(); est = await A.lerEstado() }
  const s = U.sinc
  const sub = !aberto ? 'Toque para abrir com a senha dos dados'
    : s.rodando && s.primeira ? `Trazendo… ${num(s.feitos)} páginas`
    : s.rodando ? 'Conferindo o que mudou…'
    : `${num(c.paginas)} páginas${est?.ultima ? ' · atualizado ' + haQuanto(est.ultima) : ''}`
  const alerta = aberto && ((est?.avisos?.length || 0) > 0 || c.pendentes > 0)
  b.className = 'pc-portal' + (aberto ? ' aberto' : '') + (alerta ? ' alerta' : '')
  b.innerHTML = `<span class="pc-portal-icone">${aberto ? ICONE_LUPA : ICONE_CADEADO.replace(/width="34" height="34"/, 'width="22" height="22"')}</span><span class="pc-portal-corpo"><b>Páginas do PC</b><small>${e(sub)}</small></span><span class="pc-portal-seta" aria-hidden="true">›</span>`
}

async function renderAjustes() {
  const caixa = document.getElementById('aj-pc')
  if (!caixa) return
  await carregar()
  caixa.innerHTML = ''
  if (!U.aberto) {
    caixa.appendChild(h('<p class="meta">Trancado neste celular. As páginas do PC só abrem com a senha dos dados.</p>'))
    const b = h('<button class="botao menta">Abrir os dados do PC</button>')
    b.onclick = () => { abrirSobre(); ir('abrir') }
    caixa.appendChild(b)
    if (U.estado?.ultima) caixa.appendChild(h('<p class="meta">As páginas já baixadas continuam guardadas neste aparelho, escondidas até você abrir de novo.</p>'))
    return
  }
  caixa.appendChild(h(`<p class="meta">Aberto: ${num(U.contagem.paginas)} páginas, ${num(U.contagem.espacos)} espaços${U.estado?.ultima ? ', atualizado ' + e(haQuanto(U.estado.ultima)) : ''}. A chave fica só neste celular e não sai dele.</p>`))
  const agora = h('<button class="botao contorno pequeno">Atualizar agora</button>')
  agora.onclick = () => { iniciarSinc(); avisarGlobal('Atualizando as páginas do PC…') }
  caixa.appendChild(agora)
  const bloquear = h('<button class="botao contorno pequeno" id="pc-bloquear">Bloquear e esquecer a chave neste celular</button>')
  bloquear.onclick = () => confirmar('Bloquear as páginas do PC?', 'A chave é esquecida. As páginas somem da tela até você digitar a senha de novo. Nada é apagado do PC nem da nuvem.', 'Bloquear', async () => { await S.bloquear(); await carregar(); renderAjustes(); renderPortal(); avisarGlobal('Bloqueado. A chave foi esquecida neste celular.') })
  caixa.appendChild(bloquear)
  const apagar = h('<button class="botao contorno-coral" id="pc-apagar">Apagar a cópia das páginas deste celular</button>')
  if (U.contagem.pendentes) { apagar.disabled = true; caixa.appendChild(apagar); caixa.appendChild(h('<p class="meta">Há edições que ainda não subiram. Atualize antes.</p>')) }
  else {
    apagar.onclick = () => confirmar('Apagar a cópia deste celular?', 'Só a cópia daqui. O PC e a nuvem continuam com tudo. Para ver as páginas de novo, o celular baixa tudo outra vez.', 'Apagar a cópia', async () => { await A.limparPaginas(); await carregar(); renderAjustes(); renderPortal(); avisarGlobal('Cópia apagada deste celular.') })
    caixa.appendChild(apagar)
  }
}
function confirmar(titulo, texto, rotulo, aoConfirmar) {
  const f = h(`<div class="menu-folha"><p class="folha-pergunta">${e(titulo)}</p><p class="meta">${e(texto)}</p><button class="botao menta grande" data-a="ok">${e(rotulo)}</button><button class="botao cinza grande" data-a="nao">Agora não</button></div>`)
  f.querySelector('[data-a="nao"]').onclick = () => UI.fecharCamada()
  f.querySelector('[data-a="ok"]').onclick = async () => { await UI.fecharCamada(); await aoConfirmar() }
  UI.abrirFolha(f)
}

// ---------------------------------------------------------------- partida
/** Chamado pelo novo.js depois de tudo pronto. Se algo aqui falhar, o resto do app segue como sempre. */
export function iniciar(ui) {
  UI = ui
  sobre = document.getElementById('pc-sobre')
  if (!sobre || !('indexedDB' in window)) return
  renderPortal()
  window.JJ_PC = { abrir: abrirSobre, renderAjustes, renderPortal, sincronizar: iniciarSinc, estado: () => ({ ...U }) }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - U.visto > 20_000) agendarSinc(800) })
  // ao abrir o app: se já está desbloqueado, confere o que mudou (espera a ligação com a nuvem)
  S.estaAberto().then(async (aberto) => { if (aberto) { await UI.buscarLigacao().catch(() => {}); agendarSinc(1200) } }).catch(() => {})
}
