// Páginas do PC no celular, parte "com tela" (Etapa 2): abrir os dados, leitura e edição simples, troca com a nuvem.
// Desde a 2.88 a lista, os espaços e a busca moram na aba Journal (journal-pc.js); aqui ficam as telas que abrem por cima
// (ler, editar, imagem, senha) e o estado da troca com a nuvem, que a aba Journal consulta (`estado()`, `aoMudar()`).
// Tudo aqui é ADITIVO: não lê nem grava nada do localStorage do app. A lógica (cofre, troca com a nuvem, imagens) está em pc-sync.js.
import { esc as e, tiptapParaHtml } from './tiptap-html.mjs'
import { docParaMarkdown, markdownParaDoc, editavel as docEditavel } from './tiptap-md.mjs'
import * as A from './armazem.js'
import * as S from './pc-sync.js'

let UI = null          // ligações com o novo.js: { abrirCamada, fecharCamada, abrirFolha, buscarLigacao, nuvem }
const ouvintes = new Set() // quem quer saber quando o estado muda (a aba Journal)
export const aoMudar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }
const emitir = (fim = false) => { for (const f of ouvintes) { try { f(fim) } catch (err) { console.warn(err) } } }
export const estado = () => U
let sobre = null       // a tela cheia da seção
const U = { aberto: false, metas: [], espacos: [], estado: null, contagem: null, q: '', sinc: { rodando: false, feitos: 0, offline: false, erro: null, primeira: false }, visto: 0 }
const pilha = []       // vistas abertas: { nome, args, rolagem }
const rascunhos = new Map() // texto de edição não salvo, por página (só nesta sessão)
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
export const num = (n) => Number(n || 0).toLocaleString('pt-BR')
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const dataCurta = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()} ${MES3[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}` }
export const haQuanto = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} dias` }
export const reduzMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ICONE_VOLTAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>'
export const ICONE_LUPA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
export const ICONE_ATUALIZAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/></svg>'
export const ICONE_CADEADO = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'

// ---------------------------------------------------------------- dados da seção
export const ESPACO_INBOX = { id: 'inbox', nome: 'Inbox', icone: '?', cor: '#B8893F', corTexto: '#1A110D' }
export const ORDEM = ['journal', 'faculdade', 'cursos', 'notas', 'inbox']
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
  const pos = (id) => { const i = ORDEM.indexOf(id); return i < 0 ? ORDEM.length : i }
  U.espacos = [...porId.values()].sort((a, b) => pos(a.id) - pos(b.id) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
}
export const espacoDe = (id) => U.espacos.find((x) => x.id === (id || 'inbox')) || ESPACO_INBOX
export const corDoEspaco = (x) => x?.cor || '#968073'

// ---------------------------------------------------------------- troca com a nuvem
let sincTimer = null
export function agendarSinc(ms = 500) { clearTimeout(sincTimer); sincTimer = setTimeout(() => iniciarSinc(), ms) }
export async function iniciarSinc() {
  if (typeof DEMO !== 'undefined' && DEMO) return null
  if (!(await S.estaAberto())) return null
  const primeira = !(await A.lerEstado()).ultima
  Object.assign(U.sinc, { rodando: true, feitos: 0, primeira, erro: null })
  emitir()
  let ultimaAtualizacao = 0
  const r = await S.sincronizar(UI, async (p) => {
    U.sinc.feitos = p.resumo.recebidos + p.resumo.apagados
    emitir()
    // o que já chegou aparece na lista enquanto o resto vem (no máximo a cada 1,5 s)
    if (Date.now() - ultimaAtualizacao > 1500) { ultimaAtualizacao = Date.now(); await carregar(); emitir(true) }
  })
  U.sinc.rodando = false
  U.sinc.offline = !!r.offline
  U.sinc.erro = r.erro && !r.offline ? r.erro : null
  U.visto = Date.now()
  await carregar()
  emitir(true)
  if (!r.erro && r.resumo?.conflitos) avisarGlobal(r.resumo.conflitos === 1 ? 'Uma página mudou nos dois lados: a sua versão ficou como cópia "(conflito)".' : `${r.resumo.conflitos} páginas mudaram nos dois lados: as suas versões ficaram como cópias "(conflito)".`)
  return r
}
const avisarGlobal = (t) => { try { avisar(t) } catch { /* sem aviso global */ } }

// ---------------------------------------------------------------- pedaços de tela
export function anel(frac, indet, numero, legenda, classe = '') {
  const C = 326.7
  return `<div class="pc-anel ${indet ? 'indet' : ''} ${classe}" role="img" aria-label="${e(numero)} ${e(legenda)}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trilho" cx="60" cy="60" r="52"/><circle class="arco" cx="60" cy="60" r="52" style="stroke-dasharray:${(Math.max(0, Math.min(1, frac)) * C).toFixed(1)} ${C}"/></svg>
    <div class="pc-anel-texto"><b class="pc-num">${e(numero)}</b><small>${e(legenda)}</small></div></div>`
}
export const topo = (extra = '', titulo = '') => `<header class="pc-topo"><button class="icone-b" data-a="voltar" aria-label="Voltar">${ICONE_VOLTAR}</button>${titulo ? `<h2 class="pc-topo-titulo">${e(titulo)}</h2>` : '<span></span>'}${extra}</header>`

// ---------------------------------------------------------------- navegação (cada vista = uma camada do botão Voltar do Android)
/** Abre a tela cheia (por cima da aba Journal) já numa vista: 'leitura' (com { id }), 'abrir' (senha), 'mencao'... */
export function abrirNa(nome, args = {}) {
  if (!UI) return
  if (!sobre.hidden) { ir(nome, args); return }
  sobre.hidden = false
  pilha.length = 0
  pilha.push({ nome, args })
  UI.abrirCamada(() => { sobre.hidden = true; sobre.innerHTML = ''; pilha.length = 0; carregar().then(() => emitir(true)) })
  desenhar()
  if (Date.now() - U.visto > 20_000) agendarSinc(300)
}
export const abrirPagina = (id) => abrirNa('leitura', { id })
export const abrirDesbloqueio = () => abrirNa('abrir')
/** Outras telas (a de pessoa e lugar, da aba Journal) se registram aqui e abrem na mesma pilha, com o botão Voltar do Android. */
export const registrarVista = (nome, fn) => { VISTAS[nome] = fn }
export const abrirVista = abrirNa
export const atualizarAgora = () => { S.esquecerFaltantes(); return iniciarSinc() }
export function ir(nome, args = {}) {
  const atual = pilha.at(-1)
  if (atual) atual.rolagem = sobre.scrollTop
  pilha.push({ nome, args })
  UI.abrirCamada(() => { pilha.pop(); desenhar(true) })
  desenhar()
}
export const voltar = () => UI.fecharCamada()

const VISTAS = { leitura: vistaLeitura, editor: vistaEditor, abrir: vistaAbrir, foto: vistaFoto }
async function desenhar(restaurar = false) {
  const topoDaPilha = pilha.at(-1)
  if (!topoDaPilha || sobre.hidden) return
  const el = await VISTAS[topoDaPilha.nome](topoDaPilha.args)
  if (pilha.at(-1) !== topoDaPilha) return // mudou de vista enquanto carregava
  sobre.innerHTML = ''
  sobre.appendChild(el)
  sobre.querySelectorAll('[data-a="voltar"]').forEach((b) => (b.onclick = voltar))
  sobre.scrollTop = restaurar && topoDaPilha.rolagem ? topoDaPilha.rolagem : 0
  if (el.depois) el.depois()
}

/** O pedaço do texto da página em volta do que foi procurado, com a palavra marcada (HTML pronto). */
export async function trechoDe(meta, onde, palavras) {
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
      await carregar(); emitir(true)
      iniciarSinc()
    } catch (err) { erro.textContent = 'Não consegui abrir: ' + (err.message || err) } finally { enviar.disabled = false; enviar.textContent = 'Abrir os dados' }
  }
  el.depois = () => (modoCodigo ? codigo : senha).focus()
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
      await carregar(); emitir(true)
      avisarGlobal('Salvo. Enviando para o PC…')
      agendarSinc(400)
    } catch (err) { salvar.disabled = false; avisarGlobal('Não consegui salvar: ' + (err.message || err)) }
  }
  el.depois = () => ta.focus()
  return el
}

async function renderAjustes() {
  const caixa = document.getElementById('aj-pc')
  if (!caixa) return
  await carregar()
  caixa.innerHTML = ''
  if (!U.aberto) {
    caixa.appendChild(h('<p class="meta">Trancado neste celular. As páginas do PC só abrem com a senha dos dados.</p>'))
    const b = h('<button class="botao menta">Abrir os dados do PC</button>')
    b.onclick = () => abrirNa('abrir')
    caixa.appendChild(b)
    if (U.estado?.ultima) caixa.appendChild(h('<p class="meta">As páginas já baixadas continuam guardadas neste aparelho, escondidas até você abrir de novo.</p>'))
    return
  }
  caixa.appendChild(h(`<p class="meta">Aberto: ${num(U.contagem.paginas)} páginas, ${num(U.contagem.espacos)} espaços${U.estado?.ultima ? ', atualizado ' + e(haQuanto(U.estado.ultima)) : ''}. A chave fica só neste celular e não sai dele.</p>`))
  const agora = h('<button class="botao contorno pequeno">Atualizar agora</button>')
  agora.onclick = () => { iniciarSinc(); avisarGlobal('Atualizando as páginas do PC…') }
  caixa.appendChild(agora)
  const bloquear = h('<button class="botao contorno pequeno" id="pc-bloquear">Bloquear e esquecer a chave neste celular</button>')
  bloquear.onclick = () => confirmar('Bloquear as páginas do PC?', 'A chave é esquecida. As páginas somem da tela até você digitar a senha de novo. Nada é apagado do PC nem da nuvem.', 'Bloquear', async () => { await S.bloquear(); await carregar(); renderAjustes(); emitir(true); avisarGlobal('Bloqueado. A chave foi esquecida neste celular.') })
  caixa.appendChild(bloquear)
  const apagar = h('<button class="botao contorno-coral" id="pc-apagar">Apagar a cópia das páginas deste celular</button>')
  if (U.contagem.pendentes) { apagar.disabled = true; caixa.appendChild(apagar); caixa.appendChild(h('<p class="meta">Há edições que ainda não subiram. Atualize antes.</p>')) }
  else {
    apagar.onclick = () => confirmar('Apagar a cópia deste celular?', 'Só a cópia daqui. O PC e a nuvem continuam com tudo. Para ver as páginas de novo, o celular baixa tudo outra vez.', 'Apagar a cópia', async () => { await A.limparPaginas(); await carregar(); renderAjustes(); emitir(true); avisarGlobal('Cópia apagada deste celular.') })
    caixa.appendChild(apagar)
  }
}
function confirmar(titulo, texto, rotulo, aoConfirmar) {
  const f = h(`<div class="menu-folha"><p class="folha-pergunta">${e(titulo)}</p><p class="meta">${e(texto)}</p><button class="botao menta grande" data-a="ok">${e(rotulo)}</button><button class="botao cinza grande" data-a="nao">Agora não</button></div>`)
  f.querySelector('[data-a="nao"]').onclick = () => UI.fecharCamada()
  f.querySelector('[data-a="ok"]').onclick = async () => { await UI.fecharCamada(); await aoConfirmar() }
  UI.abrirFolha(f)
}

export const dispensarAvisos = async () => { await S.limparAvisos(); await carregar(); emitir(true) }
/** Relê o armazém (depois de uma mudança) e avisa a aba Journal. */
export const recarregar = async () => { await carregar(); emitir(true) }

// ---------------------------------------------------------------- partida
/** Chamado pelo novo.js depois de tudo pronto. Se algo aqui falhar, o resto do app segue como sempre. */
export function iniciar(ui) {
  UI = ui
  sobre = document.getElementById('pc-sobre')
  if (!sobre || !('indexedDB' in window)) return
  window.JJ_PC = { abrir: abrirDesbloqueio, renderAjustes, renderPortal: () => {}, sincronizar: iniciarSinc, estado: () => ({ ...U }) }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - U.visto > 20_000) agendarSinc(800) })
  // ao abrir o app: se já está desbloqueado, confere o que mudou (espera a ligação com a nuvem)
  carregar().then(() => emitir(true)).catch(() => {})
  S.estaAberto().then(async (aberto) => { if (aberto) { await UI.buscarLigacao().catch(() => {}); agendarSinc(1200) } }).catch(() => {})
}
