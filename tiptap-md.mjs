// Documento Tiptap <-> markdown leve (Etapa 2). É o que o editor do celular mostra numa caixa de texto.
// Só entende: parágrafo, título, listas (marcadores, numerada, checklist), citação, linha, quebra de linha, e as marcas negrito (**), itálico (*), riscado (~~), link ([texto](endereço)) e código (`).
// Uma página só é EDITÁVEL se doc -> md -> doc der exatamente o mesmo documento (`editavel`). Senão fica só leitura.
//
// Detalhes do formato:
//  - blocos separados por linha em branco; Enter simples = quebra dentro do texto (as páginas importadas têm milhares);
//    quebra de linha de verdade (hardBreak) = barra no fim da linha;
//  - parágrafo vazio = linha "&nbsp;"; item de lista vazio = só o marcador;
//  - em texto comum, \ * ` [ ] viram \\ \* \` \[ \] ; "~" só quando colado em outro; "&" só antes de "nbsp;";
//    começo de linha que pareceria título/lista/citação/linha ganha "\" na frente.
//  - os negritos/itálicos/riscados são "liga/desliga" (não precisam fechar na ordem); o link sempre fecha tudo antes.

export class ErroMd extends Error {}
const recusa = (m) => { throw new ErroMd(m) }

// ---------------------------------------------------------------- normalização
const ORDEM_MARCA = ['link', 'bold', 'italic', 'strike', 'code']

function marcaNormal(m) {
  if (!m || typeof m.type !== 'string') return null
  if (m.type === 'link') {
    const out = { type: 'link', attrs: { href: String(m.attrs?.href ?? '') } }
    if (m.attrs?.title) out.attrs.title = m.attrs.title
    return out
  }
  if (m.type === 'textStyle') {
    const a = Object.fromEntries(Object.entries(m.attrs || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''))
    return Object.keys(a).length ? { type: 'textStyle', attrs: a } : null // sem nenhum estilo = marca vazia
  }
  return m.attrs && Object.keys(m.attrs).length ? { type: m.type, attrs: m.attrs } : { type: m.type }
}
const posMarca = (m) => { const i = ORDEM_MARCA.indexOf(m.type); return i < 0 ? 99 : i }

function atributosNormais(tipo, attrs) {
  const a = { ...(attrs || {}) }
  if (tipo === 'orderedList') {
    if (a.start === 1 || a.start == null) delete a.start
    if (a.type == null || a.type === '1') delete a.type
  }
  if (tipo === 'taskItem') a.checked = !!a.checked
  for (const k of Object.keys(a)) if (a[k] === undefined) delete a[k]
  return Object.keys(a).length ? a : null
}

/** Forma canônica: marcas em ordem fixa, textos vizinhos iguais juntados, sem vazios, chaves em ordem fixa. */
export function normalizar(doc) {
  const filhos = (lista) => {
    const out = []
    for (const x of Array.isArray(lista) ? lista : []) {
      const n = noNormal(x)
      if (!n) continue
      const ant = out[out.length - 1]
      if (n.type === 'text' && ant?.type === 'text' && JSON.stringify(ant.marks || null) === JSON.stringify(n.marks || null)) ant.text += n.text
      else out.push(n)
    }
    return out
  }
  function noNormal(n) {
    if (!n || typeof n.type !== 'string') return null
    if (n.type === 'text') {
      if (!n.text) return null
      const marks = (n.marks || []).map(marcaNormal).filter(Boolean).sort((a, b) => posMarca(a) - posMarca(b))
      return marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text }
    }
    const out = { type: n.type }
    const a = atributosNormais(n.type, n.attrs)
    if (a) out.attrs = a
    const c = filhos(n.content)
    if (c.length) out.content = c
    if (n.marks?.length) out.marks = n.marks.map(marcaNormal).filter(Boolean)
    return out
  }
  const d = noNormal(doc && doc.type === 'doc' ? doc : { type: 'doc', content: [] }) || { type: 'doc' }
  if (!d.content) d.content = [{ type: 'paragraph' }]
  return d
}

// ---------------------------------------------------------------- doc -> md
const TOQUE = { bold: '**', italic: '*', strike: '~~' }

function escreverTexto(t, marcas) {
  const eCodigo = marcas.some((m) => m.type === 'code')
  if (eCodigo) {
    if (t.includes('`') || t.includes('\n')) recusa('crase ou quebra de linha dentro de código')
    return '`' + t + '`'
  }
  let r = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '\\' || c === '*' || c === '`' || c === '[' || c === ']') r += '\\' + c
    else if (c === '~') r += (t[i - 1] === '~' || t[i + 1] === '~' || i === 0 || i === t.length - 1) ? '\\~' : '~'
    else if (c === '&' && t.startsWith('nbsp;', i + 1)) r += '\\&'
    else r += c
  }
  return r
}

const urlEsc = (u) => u.replace(/[\\()]/g, '\\$&')

/** Um parágrafo (ou título) -> texto de uma ou mais linhas. */
function inline(conteudo) {
  let saida = ''
  let ativo = { toques: new Set(), link: null }
  const fechar = () => { for (const t of ativo.toques) saida += TOQUE[t]; if (ativo.link !== null) saida += `](${urlEsc(ativo.link)})` }
  for (const n of conteudo || []) {
    if (n.type === 'hardBreak') {
      if (n.marks?.length) recusa('marca na quebra de linha')
      saida += '\\\n'
      continue
    }
    if (n.type !== 'text') recusa('nó ' + n.type + ' no texto')
    const marcas = n.marks || []
    const toques = new Set()
    let link = null
    for (const m of marcas) {
      if (m.type === 'bold' || m.type === 'italic' || m.type === 'strike') toques.add(m.type)
      else if (m.type === 'link') { if (m.attrs?.title) recusa('link com título'); link = m.attrs.href }
      else if (m.type !== 'code') recusa('marca ' + m.type)
    }
    if (link !== ativo.link) {
      for (const t of ativo.toques) saida += TOQUE[t]
      if (ativo.link !== null) saida += `](${urlEsc(ativo.link)})`
      if (link !== null) saida += '['
      for (const t of toques) saida += TOQUE[t]
    } else {
      for (const t of ativo.toques) if (!toques.has(t)) saida += TOQUE[t]
      for (const t of toques) if (!ativo.toques.has(t)) saida += TOQUE[t]
    }
    ativo = { toques, link }
    saida += escreverTexto(n.text, marcas)
  }
  fechar()
  // começo de linha que viraria título/lista/citação/linha: barra na frente
  return saida.split('\n').map(linhaSegura).join('\n')
}
function linhaSegura(l) {
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^#{1,6}(\s|$)/.test(l) || /^>/.test(l) || /^[-+](\s|$)/.test(l)) return '\\' + l
  const o = l.match(/^(\d{1,9})([.)])(\s|$)/)
  if (o) return o[1] + '\\' + l.slice(o[1].length)
  return l
}

const recuar = (texto, n) => texto.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n')
const LISTAS = new Set(['bulletList', 'orderedList', 'taskList'])

function item(n, marcador, tarefa) {
  const blocos = n.content || []
  if (!blocos.length || blocos[0].type !== 'paragraph') recusa('item sem parágrafo')
  const prefixo = tarefa ? `[${n.attrs?.checked ? 'x' : ' '}]` : ''
  const primeiro = inline(blocos[0].content)
  const largura = marcador.length + 1
  let texto = primeiro
  if (prefixo) texto = prefixo + (texto ? ' ' + texto : '')
  let saida = marcador + (texto ? ' ' + texto.split('\n').map((l, i) => (i ? ' '.repeat(largura) + l : l)).join('\n') : '')
  for (const b of blocos.slice(1)) saida += (LISTAS.has(b.type) ? '\n' : '\n\n') + recuar(bloco(b), largura)
  return saida
}

function bloco(n) {
  switch (n.type) {
    case 'paragraph': return n.content?.length ? inline(n.content) : '&nbsp;'
    case 'heading': {
      const nivel = n.attrs?.level
      if (!(nivel >= 1 && nivel <= 6)) recusa('título sem nível')
      const t = inline(n.content)
      if (t.includes('\n')) recusa('quebra de linha no título')
      return '#'.repeat(nivel) + (t ? ' ' + t : '')
    }
    case 'horizontalRule': return '---'
    case 'bulletList': return n.content.map((i) => item(i, '-', false)).join('\n')
    case 'taskList': return n.content.map((i) => item(i, '-', true)).join('\n')
    case 'orderedList': {
      const ini = n.attrs?.start ?? 1
      return n.content.map((i, k) => item(i, `${ini + k}.`, false)).join('\n')
    }
    case 'blockquote': return docParaMd(n.content).split('\n').map((l) => (l ? '> ' + l : '>')).join('\n')
    default: return recusa('nó ' + n.type)
  }
}

function docParaMd(blocos) {
  return blocos.map(bloco).join('\n\n')
}

/** Documento Tiptap -> markdown. Lança ErroMd se tiver algo que o markdown leve não representa. */
export function docParaMarkdown(doc) {
  return docParaMd(normalizar(doc).content)
}

// ---------------------------------------------------------------- md -> doc
const ORD = /^(\d{1,9})[.)](?: +(.*))?$/
const PTO = /^[-+*](?: +(.*))?$/
const ehHr = (l) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)
const ehTitulo = (l) => /^#{1,6}(\s|$)/.test(l)
const ehCitacao = (l) => l.startsWith('>')
const ehItem = (l) => !ehHr(l) && (PTO.test(l) || ORD.test(l))
const iniciaBloco = (l) => ehHr(l) || ehTitulo(l) || ehCitacao(l) || ehItem(l)
const branca = (l) => l.trim() === ''

function ordenarMarcas(ms) {
  return [...ms].sort((a, b) => posMarca(a) - posMarca(b))
}

/** Texto inline -> nós. `base`: marcas que já valem (dentro de um link). */
function lerInline(s, base = []) {
  const nos = []
  let buf = ''
  const on = new Set()
  const marcasAgora = (extra = []) => ordenarMarcas([...base, ...[...on].map((t) => ({ type: t })), ...extra])
  const soltar = () => {
    if (!buf) return
    const marks = marcasAgora()
    nos.push(marks.length ? { type: 'text', text: buf, marks } : { type: 'text', text: buf })
    buf = ''
  }
  const alternar = (t) => { soltar(); on.has(t) ? on.delete(t) : on.add(t) }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) { buf += s[++i]; continue }
    if (c === '\\' && s[i + 1] === '\n') { soltar(); nos.push({ type: 'hardBreak' }); i++; continue }
    if (c === '*') { if (s[i + 1] === '*') { alternar('bold'); i++ } else alternar('italic'); continue }
    if (c === '~' && s[i + 1] === '~') { alternar('strike'); i++; continue }
    if (c === '`') {
      const fim = s.indexOf('`', i + 1)
      if (fim > i + 1) {
        soltar()
        nos.push({ type: 'text', text: s.slice(i + 1, fim), marks: marcasAgora([{ type: 'code' }]) })
        i = fim
        continue
      }
    }
    if (c === '[') {
      const l = lerLink(s, i)
      if (l) {
        soltar()
        const marcasFora = [...base, ...[...on].map((t) => ({ type: t })), { type: 'link', attrs: { href: l.url } }]
        nos.push(...lerInline(l.texto, marcasFora))
        i = l.fim
        continue
      }
    }
    buf += c
  }
  soltar()
  return nos
}

/** "[texto](endereço)" começando em i. Devolve { texto, url, fim } (fim = posição do ")") ou null. */
function lerLink(s, i) {
  let j = i + 1
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === '`') { const f = s.indexOf('`', j + 1); if (f > j) { j = f; continue } }
    if (s[j] === ']') break
  }
  if (s[j] !== ']' || s[j + 1] !== '(') return null
  let url = ''
  for (let k = j + 2; k < s.length; k++) {
    if (s[k] === '\\' && k + 1 < s.length) { url += s[++k]; continue }
    if (s[k] === ')') return url ? { texto: s.slice(i + 1, j), url, fim: k } : null
    url += s[k]
  }
  return null
}

function paragrafoDeLinhas(linhas) {
  const texto = linhas.join('\n')
  if (texto === '&nbsp;') return { type: 'paragraph' }
  const c = lerInline(texto)
  return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' }
}

function lerBlocos(linhas) {
  const blocos = []
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]
    if (branca(l)) { i++; continue }
    if (ehHr(l)) { blocos.push({ type: 'horizontalRule' }); i++; continue }
    const t = l.match(/^(#{1,6})(?:\s+(.*))?$/)
    if (t) {
      const c = lerInline((t[2] || '').trim())
      blocos.push({ type: 'heading', attrs: { level: t[1].length }, ...(c.length ? { content: c } : {}) })
      i++
      continue
    }
    if (ehCitacao(l)) {
      const dentro = []
      while (i < linhas.length && ehCitacao(linhas[i])) { dentro.push(linhas[i].replace(/^> ?/, '')); i++ }
      blocos.push({ type: 'blockquote', content: lerBlocos(dentro) })
      continue
    }
    if (ehItem(l)) { const r = lerLista(linhas, i); blocos.push(r.no); i = r.proximo; continue }
    const par = []
    while (i < linhas.length && !branca(linhas[i]) && (par.length === 0 || !iniciaBloco(linhas[i]))) { par.push(linhas[i]); i++ }
    blocos.push(paragrafoDeLinhas(par))
  }
  return blocos
}

function lerLista(linhas, i) {
  const primeira = linhas[i]
  const ord = ORD.exec(primeira)
  const tipoItem = (l) => {
    const o = ORD.exec(l)
    if (o) return { tipo: 'orderedList' }
    const p = PTO.exec(l)
    return { tipo: /^\[[ xX]\](\s|$)/.test(p?.[1] || '') ? 'taskList' : 'bulletList' }
  }
  const tipo = tipoItem(primeira).tipo
  const itens = []
  while (i < linhas.length) {
    const l = linhas[i]
    if (!ehItem(l) || tipoItem(l).tipo !== tipo) break
    const o = ORD.exec(l)
    const marcador = o ? l.slice(0, l.indexOf(o[1]) + o[1].length + 1) : l[0]
    let resto = (o ? o[2] : PTO.exec(l)[1]) || ''
    const largura = marcador.length + 1
    let feito = false
    if (tipo === 'taskList') {
      const m = resto.match(/^\[([ xX])\](?: +(.*))?$/)
      feito = m[1] !== ' '
      resto = m[2] || ''
    }
    const dentro = [resto]
    i++
    for (;;) {
      let j = i
      while (j < linhas.length && branca(linhas[j])) j++
      if (j >= linhas.length) break
      const rec = linhas[j].match(/^ */)[0].length
      if (rec >= 2) {
        for (; i < j; i++) dentro.push('')
        dentro.push(linhas[i].slice(Math.min(rec, largura)))
        i++
      } else break
    }
    let blocos = lerBlocos(dentro)
    if (!blocos.length || blocos[0].type !== 'paragraph' || (resto === '' && dentro.length > 1 && branca(dentro[0]) && blocos[0].type !== 'paragraph')) blocos = [{ type: 'paragraph' }, ...blocos]
    itens.push({ type: tipo === 'taskList' ? 'taskItem' : 'listItem', ...(tipo === 'taskList' ? { attrs: { checked: feito } } : {}), content: blocos })
    // linhas em branco entre itens do mesmo tipo não quebram a lista
    let k = i
    while (k < linhas.length && branca(linhas[k])) k++
    if (k < linhas.length && k > i && ehItem(linhas[k]) && tipoItem(linhas[k]).tipo === tipo && !/^ /.test(linhas[k])) i = k
  }
  const no = { type: tipo, content: itens }
  if (tipo === 'orderedList' && Number(ord[1]) !== 1) no.attrs = { start: Number(ord[1]) }
  return { no, proximo: i }
}

/** Markdown -> documento Tiptap (já na forma canônica). */
export function markdownParaDoc(md) {
  const linhas = String(md ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocos = lerBlocos(linhas)
  return normalizar({ type: 'doc', content: blocos.length ? blocos : [{ type: 'paragraph' }] })
}

/** Verdadeiro só se doc -> markdown -> doc volta idêntico: aí o celular pode editar sem perder nada. */
export function editavel(doc) {
  try {
    const n = normalizar(doc)
    const volta = markdownParaDoc(docParaMarkdown(n))
    return JSON.stringify(n) === JSON.stringify(volta)
  } catch (e) {
    if (e instanceof ErroMd) return false
    throw e
  }
}
