// Documento Tiptap -> HTML seguro (Etapa 2). Roda no celular e no Node, sem dependências.
// Regras: todo texto é escapado; link só http/https/mailto; imagem pelo `opcoes.imagem(src, attrs)` (o chamador
// decide de onde ela vem); cores só em formatos conhecidos; nó desconhecido mostra o texto que tiver, sem quebrar.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESC[c])

/** Só http, https e mailto; qualquer outra coisa (javascript:, data:, caminho relativo) vira null. */
export function linkSeguro(href) {
  const h = String(href ?? '').trim()
  return /^(https?:\/\/|mailto:)[^\s"'<>`]+$/i.test(h) ? h : null
}
const COR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i
const corSegura = (c) => (typeof c === 'string' && COR.test(c.trim()) ? c.trim() : null)
const inteiro = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null }
const CALLOUTS = { NOTE: 'Nota', TIP: 'Dica', IMPORTANT: 'Importante', WARNING: 'Aviso', CAUTION: 'Cuidado' }

function textoDe(n) {
  if (!n) return ''
  if (typeof n.text === 'string') return n.text
  if (n.type === 'hardBreak') return '\n'
  if (n.type === 'linkPagina') return n.attrs?.titulo || ''
  const filhos = Array.isArray(n.content) ? n.content : []
  return filhos.map(textoDe).join(n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem' ? '' : '\n')
}

/** Marcas em volta do texto (o que vem primeiro na lista fica por dentro). */
function comMarcas(html, marcas) {
  let r = html
  for (const m of marcas || []) {
    switch (m?.type) {
      case 'bold': r = `<strong>${r}</strong>`; break
      case 'italic': r = `<em>${r}</em>`; break
      case 'strike': r = `<s>${r}</s>`; break
      case 'code': r = `<code>${r}</code>`; break
      case 'link': {
        const h = linkSeguro(m.attrs?.href)
        if (h) r = `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer nofollow">${r}</a>`
        break
      }
      case 'textStyle': {
        const cor = corSegura(m.attrs?.color), fundo = corSegura(m.attrs?.backgroundColor)
        const estilo = [cor && `color:${cor}`, fundo && `background-color:${fundo}`].filter(Boolean).join(';')
        if (estilo) r = `<span style="${esc(estilo)}">${r}</span>`
        break
      }
      default: break // marca desconhecida: o texto fica sem ela
    }
  }
  return r
}

export function tiptapParaHtml(doc, opcoes = {}) {
  const imagem = opcoes.imagem || ((src) => src)
  const filhos = (n) => (Array.isArray(n?.content) ? n.content.map(no).join('') : '')

  function celula(n, tag) {
    const a = n.attrs || {}
    const cs = inteiro(a.colspan, 2, 50), rs = inteiro(a.rowspan, 2, 500)
    const al = ['left', 'center', 'right'].includes(a.align) ? ` style="text-align:${a.align}"` : ''
    return `<${tag}${cs ? ` colspan="${cs}"` : ''}${rs ? ` rowspan="${rs}"` : ''}${al}>${filhos(n)}</${tag}>`
  }

  function no(n) {
    if (!n || typeof n !== 'object') return ''
    if (n.type === 'text' || (typeof n.text === 'string' && !n.content)) return comMarcas(esc(n.text), n.marks)
    switch (n.type) {
      case 'doc': return filhos(n)
      case 'paragraph': return `<p>${filhos(n)}</p>`
      case 'heading': return `<h${inteiro(n.attrs?.level, 1, 6) || 2}>${filhos(n)}</h${inteiro(n.attrs?.level, 1, 6) || 2}>`
      case 'hardBreak': return '<br>'
      case 'bulletList': return `<ul>${filhos(n)}</ul>`
      case 'orderedList': { const s = inteiro(n.attrs?.start, 0, 100000); return `<ol${s != null && s !== 1 ? ` start="${s}"` : ''}>${filhos(n)}</ol>` }
      case 'listItem': return `<li>${filhos(n)}</li>`
      case 'taskList': return `<ul class="tarefas">${filhos(n)}</ul>`
      case 'taskItem': { const f = !!n.attrs?.checked; return `<li class="tarefa${f ? ' feita' : ''}"><input type="checkbox" disabled${f ? ' checked' : ''}><div>${filhos(n)}</div></li>` }
      case 'blockquote': return `<blockquote>${filhos(n)}</blockquote>`
      case 'horizontalRule': return '<hr>'
      case 'codeBlock': return `<pre><code>${esc(textoDe(n))}</code></pre>`
      case 'table': return `<div class="tabela"><table>${filhos(n)}</table></div>`
      case 'tableRow': return `<tr>${filhos(n)}</tr>`
      case 'tableHeader': return celula(n, 'th')
      case 'tableCell': return celula(n, 'td')
      case 'image': {
        const src = imagem(n.attrs?.src, n.attrs || {})
        if (!src) return n.attrs?.alt ? `<span class="sem-imagem">${esc(n.attrs.alt)}</span>` : ''
        const l = inteiro(n.attrs?.width, 1, 10000), a = inteiro(n.attrs?.height, 1, 10000)
        return `<img src="${esc(src)}" alt="${esc(n.attrs?.alt || '')}"${l ? ` width="${l}"` : ''}${a ? ` height="${a}"` : ''} loading="lazy">`
      }
      case 'callout': {
        const k = Object.hasOwn(CALLOUTS, String(n.attrs?.kind).toUpperCase()) ? String(n.attrs.kind).toUpperCase() : 'NOTE'
        return `<div class="callout" data-kind="${k}" data-label="${CALLOUTS[k]}">${filhos(n)}</div>`
      }
      case 'colunas': {
        const total = Array.isArray(n.content) ? n.content.length : 2
        const l = inteiro(n.attrs?.largura, 10, 90)
        const est = `--colunas:${total}` + (l && total === 2 ? `;grid-template-columns:${l}% minmax(0,1fr)` : '')
        return `<div class="colunas" style="${est}">${filhos(n)}</div>`
      }
      case 'coluna': return `<div class="coluna-texto">${filhos(n)}</div>`
      case 'linkPagina': return `<span class="link-pagina" data-pagina="${esc(n.attrs?.id || '')}">${esc(n.attrs?.titulo || 'Página')}</span>`
      case 'secao': { const c = corSegura(n.attrs?.cor); return `<div class="secao"${c ? ` style="background:${esc(c)}"` : ''}>${filhos(n)}</div>` }
      default: {
        // Nó que este leitor não conhece: mostra o texto dele (e dos filhos) em vez de sumir ou quebrar.
        const t = textoDe(n)
        return t ? `<span class="desconhecido">${esc(t).replace(/\n/g, '<br>')}</span>` : ''
      }
    }
  }
  return no(doc)
}
