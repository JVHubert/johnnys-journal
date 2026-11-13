// Menções automáticas: descobre em quais entradas do diário cada pessoa (e cada lugar) aparece.
// Tudo calculado na hora, aqui no PC: nada do texto sai para fora.
import { semAcento } from './texto.js'
import { listaDePessoas } from './pessoas.js'

const normalizar = (s) => semAcento(String(s || '')).toLowerCase()
const limpar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A entrada em texto (título, começo do texto e etiquetas), sem acento e em minúsculas. */
export function textoDaPagina(p) {
  return normalizar(`${p.titulo || ''} ${p.previa || ''} ${(p.etiquetas || []).map((e) => '#' + e).join(' ')}`)
}

/** O termo aparece como palavra (com começo e fim de palavra), sem ligar para acento ou maiúscula. */
export function contemPalavra(texto, termo) {
  const t = normalizar(termo).trim()
  if (!t) return false
  return new RegExp('(^|[^a-z0-9])' + limpar(t) + '($|[^a-z0-9])').test(texto)
}

/** O pedaço do texto em volta da menção (ou o começo da entrada, quando o termo não está no texto). */
function trechoDaPagina(p, termos, limite = 120) {
  // O "previa" começa com o título da entrada: aqui ele já vem na linha de cima, então sai.
  const inteiro = String(p.previa || p.titulo || '').replace(/\s+/g, ' ').trim()
  const titulo = String(p.titulo || '').replace(/\s+/g, ' ').trim()
  const bruto = titulo && inteiro.startsWith(titulo) ? inteiro.slice(titulo.length).trim() : inteiro
  const alvo = normalizar(bruto)
  let onde = -1
  for (const termo of termos) {
    const i = alvo.indexOf(normalizar(termo))
    if (i >= 0 && (onde < 0 || i < onde)) onde = i
  }
  const inicio = onde < 0 ? 0 : Math.max(0, onde - 40)
  const pedaco = bruto.slice(inicio, inicio + limite)
  return (inicio > 0 ? '…' : '') + pedaco + (inicio + limite < bruto.length ? '…' : '')
}

/**
 * As menções do diário: uma lista de pessoas (as do pessoas.json que aparecem em alguma entrada) e
 * uma de lugares (o campo "Lugar" e os lugares conhecidos que aparecem no texto), cada uma com os
 * dias em que aparece, do mais novo para o mais antigo.
 */
export function indiceDeMencoes(paginas, pessoas, espacoId) {
  const doDiario = paginas.filter((p) => (!espacoId || p.espaco === espacoId) && p.data)
  const lista = listaDePessoas(pessoas)

  const comPessoas = lista
    .map((pessoa) => {
      const termos = [pessoa.nome, ...(pessoa.apelidos || [])].filter(Boolean)
      const dias = []
      for (const pg of doDiario) {
        const texto = textoDaPagina(pg)
        if (!termos.some((t) => contemPalavra(texto, t))) continue
        dias.push({ id: pg.id, data: pg.data, titulo: pg.titulo || 'Sem título', trecho: trechoDaPagina(pg, termos) })
      }
      dias.sort((a, b) => b.data.localeCompare(a.data))
      return { tipo: 'pessoa', id: pessoa.id, nome: pessoa.nome, dias }
    })
    .filter((x) => x.dias.length)
    .sort((a, b) => (b.dias[0]?.data || '').localeCompare(a.dias[0]?.data || '') || a.nome.localeCompare(b.nome, 'pt-BR'))

  // Lugares: o campo "Lugar" de cada entrada e os lugares já conhecidos citados no texto.
  const conhecidos = [...new Set(paginas.map((p) => String(p.lugar || '').trim()).filter(Boolean))]
  const porLugar = new Map()
  for (const pg of doDiario) {
    const texto = textoDaPagina(pg)
    const achados = new Set()
    const doCampo = String(pg.lugar || '').trim()
    if (doCampo) achados.add(doCampo)
    for (const nome of conhecidos) if (contemPalavra(texto, nome)) achados.add(nome)
    for (const nome of achados) {
      if (!porLugar.has(nome)) porLugar.set(nome, [])
      porLugar.get(nome).push({ id: pg.id, data: pg.data, titulo: pg.titulo || 'Sem título', trecho: trechoDaPagina(pg, [nome]) })
    }
  }
  const comLugares = [...porLugar.entries()]
    .map(([nome, dias]) => ({ tipo: 'lugar', nome, dias: dias.sort((a, b) => b.data.localeCompare(a.data)) }))
    .sort((a, b) => (b.dias[0]?.data || '').localeCompare(a.dias[0]?.data || '') || a.nome.localeCompare(b.nome, 'pt-BR'))

  return { pessoas: comPessoas, lugares: comLugares }
}
