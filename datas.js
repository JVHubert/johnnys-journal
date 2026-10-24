// Datas em texto "AAAA-MM-DD", sempre no fuso do computador.
// Também entende a "tarefa rápida": "Pagar luz sexta #casa @contas !" vira
// { titulo: 'Pagar luz', data: <próxima sexta>, etiquetas: ['casa'], projeto: 'contas', importante: true }.

export function paraTexto(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

export function deTexto(s) {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function hojeTexto(agora = new Date()) {
  return paraTexto(agora)
}

export function somarDias(s, n) {
  const d = deTexto(s)
  d.setDate(d.getDate() + n)
  return paraTexto(d)
}

export function diferencaDias(a, b) {
  return Math.round((deTexto(a) - deTexto(b)) / 86400000)
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate()
}

export function somarMeses(s, n) {
  const d = deTexto(s)
  const dia = d.getDate()
  const alvo = new Date(d.getFullYear(), d.getMonth() + n, 1)
  alvo.setDate(Math.min(dia, ultimoDiaDoMes(alvo.getFullYear(), alvo.getMonth())))
  return paraTexto(alvo)
}

/** N-ésimo dia da semana do mês (n = 1..5; -1 = último). Ex.: 2ª quinta de nov/2026 = 12/11. */
function enesimoDiaSemana(ano, mes, n, diaSemana) {
  if (n === -1) {
    const ultimo = new Date(ano, mes + 1, 0)
    ultimo.setDate(ultimo.getDate() - ((ultimo.getDay() - diaSemana + 7) % 7))
    return paraTexto(ultimo)
  }
  const primeiro = new Date(ano, mes, 1)
  const dia = 1 + ((diaSemana - primeiro.getDay() + 7) % 7) + (n - 1) * 7
  if (dia > ultimoDiaDoMes(ano, mes)) return null
  return paraTexto(new Date(ano, mes, dia))
}

/** Último dia útil (segunda a sexta) do mês. */
function ultimoDiaUtil(ano, mes) {
  const d = new Date(ano, mes + 1, 0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return paraTexto(d)
}

/** A primeira data mensal (a partir de `desde`, inclusive) que a função `doMes(ano, mes)` der. */
function proximaMensal(desde, doMes, incluir = true) {
  const h = deTexto(desde)
  for (let i = 0; i < 14; i++) {
    const ref = new Date(h.getFullYear(), h.getMonth() + i, 1)
    const s = doMes(ref.getFullYear(), ref.getMonth())
    if (s && (s > desde || (incluir && s === desde))) return s
  }
  return null
}

/**
 * Id da próxima ocorrência de uma tarefa que repete: "<série>@<data>". O PC, o celular e a nuvem chegam
 * ao mesmo id, então concluir dos dois lados não cria duas repetições.
 */
export function idDaProximaRepeticao(t, data) {
  const id = String(t.id || '')
  const serie = t.serie || (id.includes('@') ? id.slice(0, id.indexOf('@')) : id)
  return `${serie}@${data}`
}

/**
 * Repetição: os textos antigos ('diaria', 'semanal', 'mensal', 'anual') ou uma regra
 * { tipo: 'dia'|'semana'|'mes'|'ano', cada: N, dias: [1, 3], nDoMes: 2, diaSemana: 4, ultimoUtil: true }.
 */
export function proximaRepeticao(s, repetir) {
  if (repetir === 'diaria') return somarDias(s, 1)
  if (repetir === 'semanal') return somarDias(s, 7)
  if (repetir === 'mensal') return somarMeses(s, 1)
  if (repetir === 'anual') return somarMeses(s, 12)
  if (!repetir || typeof repetir !== 'object') return null
  const cada = repetir.cada || 1
  if (repetir.tipo === 'dia') return somarDias(s, cada)
  if (repetir.tipo === 'semana') {
    if (repetir.dias?.length) {
      for (let i = 1; i <= 7; i++) {
        const prox = somarDias(s, i)
        if (repetir.dias.includes(deTexto(prox).getDay())) return prox
      }
    }
    return somarDias(s, 7 * cada)
  }
  if (repetir.tipo === 'mes') {
    if (repetir.nDoMes) return proximaMensal(s, (a, m) => enesimoDiaSemana(a, m, repetir.nDoMes, repetir.diaSemana), false)
    if (repetir.ultimoUtil) return proximaMensal(s, ultimoDiaUtil, false)
    return somarMeses(s, cada)
  }
  if (repetir.tipo === 'ano') return somarMeses(s, 12 * cada)
  return null
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const ORDINAIS = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª', 5: '5ª', '-1': 'última' }

/** "hoje", "amanhã", "sex 23/out", "23/out/2027" */
export function rotuloData(s, hoje = hojeTexto()) {
  const dif = diferencaDias(s, hoje)
  if (dif === 0) return 'hoje'
  if (dif === 1) return 'amanhã'
  if (dif === -1) return 'ontem'
  const d = deTexto(s)
  const base = `${d.getDate()}/${MESES_CURTOS[d.getMonth()]}`
  if (d.getFullYear() !== deTexto(hoje).getFullYear()) return `${base}/${d.getFullYear()}`
  if (dif > 1 && dif < 7) return `${DIAS_CURTOS[d.getDay()]} ${base}`
  return base
}

export const ROTULO_REPETIR = { diaria: 'todo dia', semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' }

/** Texto curto da repetição: "toda 2ª qui do mês", "a cada 2 semanas", "toda seg e qua"... */
export function rotuloRepetir(r) {
  if (!r) return ''
  if (typeof r === 'string') return ROTULO_REPETIR[r] || r
  const cada = r.cada || 1
  const nomes = { dia: ['todo dia', 'dias'], semana: ['toda semana', 'semanas'], mes: ['todo mês', 'meses'], ano: ['todo ano', 'anos'] }
  if (r.tipo === 'semana' && r.dias?.length) return 'toda ' + r.dias.map((d) => DIAS_CURTOS[d]).join(' e ')
  if (r.tipo === 'mes' && r.nDoMes) return `toda ${ORDINAIS[r.nDoMes]} ${DIAS_CURTOS[r.diaSemana]} do mês`
  if (r.tipo === 'mes' && r.ultimoUtil) return 'todo último dia útil'
  if (cada > 1) return `a cada ${cada} ${nomes[r.tipo][1]}`
  return nomes[r.tipo]?.[0] || ''
}

// ---------- tarefa rápida ----------

const DIAS_SEMANA = [
  ['domingo', 0], ['segunda', 1], ['ter[çc]a', 2], ['quarta', 3],
  ['quinta', 4], ['sexta', 5], ['s[áa]bado', 6],
]
const SEMANA_RE = DIAS_SEMANA.map(([r]) => r).join('|')
const DIA_SEMANA = String.raw`(?:${SEMANA_RE})(?:s)?(?:[- ]feiras?)?`
const MESES_RE = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro'
const ORDINAL_RE = 'primeira|segunda|terceira|quarta|quinta|[úu]ltima'

function numeroDoDia(palavra) {
  const p = palavra.toLowerCase()
  for (const [r, n] of DIAS_SEMANA) if (new RegExp(`^${r}`, 'i').test(p)) return n
  return null
}

function numeroDoMes(palavra) {
  const lista = MESES_RE.split('|')
  const p = palavra.toLowerCase()
  return lista.findIndex((r) => new RegExp(`^${r}$`, 'i').test(p))
}

function numeroOrdinal(palavra) {
  const p = palavra.toLowerCase()
  if (/^[úu]ltima$/.test(p)) return -1
  return ['primeira', 'segunda', 'terceira', 'quarta', 'quinta'].indexOf(p) + 1
}

/** Dias da semana citados num trecho: "segunda e quarta" -> [1, 3]. */
function diasCitados(trecho) {
  return [...trecho.matchAll(new RegExp(SEMANA_RE, 'gi'))].map((m) => numeroDoDia(m[0]))
}

/** Próximo dia da semana; se `incluirHoje` e hoje for o dia, devolve hoje. */
function proximoDiaSemana(hoje, alvo, incluirHoje = false) {
  const d = deTexto(hoje)
  let dif = (alvo - d.getDay() + 7) % 7
  if (dif === 0 && !incluirHoje) dif = 7
  return somarDias(hoje, dif)
}

function proximoDiaDoMes(hoje, dia, incluirHoje = true) {
  return proximaMensal(hoje, (a, m) => (dia > ultimoDiaDoMes(a, m) ? null : paraTexto(new Date(a, m, dia))), incluirHoje)
}

/** "3 de dezembro" (sem ano): a próxima vez que esse dia acontece. */
function proximaDataDoAno(hoje, dia, mes, ano = null) {
  const h = deTexto(hoje)
  let d = new Date(ano ?? h.getFullYear(), mes, dia)
  if (d.getMonth() !== mes) return null
  if (ano === null && paraTexto(d) < hoje) d = new Date(h.getFullYear() + 1, mes, dia)
  return paraTexto(d)
}

// Preposição antes da data, que some junto: "pagar luz até sexta" -> "pagar luz".
const PREP = String.raw`(?:(?:na|no|nesta|neste|nessa|nesse|pr[óo]xima|pr[óo]ximo|at[ée]|para|pra|de|em|a partir de)\s+)*`
const FIM = String.raw`(?=$|[\s,.;!?])`
const INICIO = String.raw`(^|\s)`

/**
 * Cada regra recebe o trecho encontrado e devolve { data, repetir? }.
 * A ordem importa: as mais específicas primeiro ("segunda quinta do mês" antes de "segunda").
 */
function regras(hoje) {
  const h = deTexto(hoje)
  return [
    // ---- repetições ----
    [String.raw`tod[ao]s? (?:as |os |a |o )?(${ORDINAL_RE}) (${SEMANA_RE})(?:[- ]feira)? do m[êe]s`, (m) => {
      const n = numeroOrdinal(m[1]); const ds = numeroDoDia(m[2])
      return { data: proximaMensal(hoje, (a, mes) => enesimoDiaSemana(a, mes, n, ds)), repetir: { tipo: 'mes', nDoMes: n, diaSemana: ds } }
    }],
    [String.raw`todo [úu]ltimo dia [úu]til(?: do m[êe]s)?`, () => ({ data: proximaMensal(hoje, ultimoDiaUtil), repetir: { tipo: 'mes', ultimoUtil: true } })],
    [String.raw`a cada (\d{1,3}) (dias?|semanas?|m[êe]s(?:es)?|anos?)`, (m) => {
      const tipo = /^d/.test(m[2]) ? 'dia' : /^s/.test(m[2]) ? 'semana' : /^m/.test(m[2]) ? 'mes' : 'ano'
      return { data: hoje, repetir: { tipo, cada: Number(m[1]) } }
    }],
    [String.raw`todo dia (\d{1,2})`, (m) => ({ data: proximoDiaDoMes(hoje, Number(m[1])), repetir: 'mensal' })],
    [String.raw`todos? os dias|todo dia|diariamente`, () => ({ data: hoje, repetir: 'diaria' })],
    [String.raw`tod[ao]s? (?:as |os )?${DIA_SEMANA}(?: e ${DIA_SEMANA})+`, (m) => {
      const dias = [...new Set(diasCitados(m[0]))].sort()
      const data = dias.map((d) => proximoDiaSemana(hoje, d, true)).sort()[0]
      return { data, repetir: { tipo: 'semana', dias } }
    }],
    [String.raw`tod[ao]s? (?:as |os )?(${SEMANA_RE})(?:s)?(?:[- ]feiras?)?`, (m) => ({ data: proximoDiaSemana(hoje, numeroDoDia(m[1]), true), repetir: 'semanal' })],
    [String.raw`toda semana|semanalmente`, () => ({ data: hoje, repetir: 'semanal' })],
    [String.raw`todo m[êe]s|mensalmente`, () => ({ data: hoje, repetir: 'mensal' })],
    [String.raw`todo ano|anualmente`, () => ({ data: hoje, repetir: 'anual' })],
    // ---- datas soltas ----
    // "última sexta-feira de novembro", "primeira segunda do mês que vem"
    [String.raw`(${ORDINAL_RE}) (${SEMANA_RE})(?:[- ]feira)? (?:de (${MESES_RE})|do m[êe]s que vem|do pr[óo]ximo m[êe]s)`, (m) => {
      const n = numeroOrdinal(m[1]); const ds = numeroDoDia(m[2])
      if (!m[3]) { const p = new Date(h.getFullYear(), h.getMonth() + 1, 1); return { data: enesimoDiaSemana(p.getFullYear(), p.getMonth(), n, ds) } }
      const mes = numeroDoMes(m[3])
      let data = enesimoDiaSemana(h.getFullYear(), mes, n, ds)
      if (!data || data < hoje) data = enesimoDiaSemana(h.getFullYear() + 1, mes, n, ds)
      return { data }
    }],
    [String.raw`(${ORDINAL_RE}) (${SEMANA_RE})(?:[- ]feira)? do m[êe]s`, (m) => {
      const n = numeroOrdinal(m[1]); const ds = numeroDoDia(m[2])
      return { data: proximaMensal(hoje, (a, mes) => enesimoDiaSemana(a, mes, n, ds)) }
    }],
    [String.raw`[úu]ltimo dia [úu]til(?: do m[êe]s)?`, () => ({ data: proximaMensal(hoje, ultimoDiaUtil) })],
    [String.raw`depois de amanh[ãa]`, () => ({ data: somarDias(hoje, 2) })],
    [String.raw`amanh[ãa]`, () => ({ data: somarDias(hoje, 1) })],
    [String.raw`hoje`, () => ({ data: hoje })],
    [String.raw`(?:em|daqui(?: a)?) (\d{1,3}) dias?`, (m) => ({ data: somarDias(hoje, Number(m[1])) })],
    [String.raw`(?:em|daqui(?: a)?) (\d{1,2}) semanas?`, (m) => ({ data: somarDias(hoje, 7 * Number(m[1])) })],
    [String.raw`(?:em|daqui(?: a)?) (\d{1,2}) m[êe]s(?:es)?`, (m) => ({ data: somarMeses(hoje, Number(m[1])) })],
    [String.raw`semana que vem|pr[óo]xima semana`, () => ({ data: proximoDiaSemana(hoje, 1) })],
    [String.raw`m[êe]s que vem|pr[óo]ximo m[êe]s`, () => ({ data: somarMeses(hoje, 1) })],
    [String.raw`fim de semana|fds`, () => ({ data: proximoDiaSemana(hoje, 6, true) })],
    [String.raw`fim do m[êe]s`, () => ({ data: paraTexto(new Date(h.getFullYear(), h.getMonth(), ultimoDiaDoMes(h.getFullYear(), h.getMonth()))) })],
    [String.raw`(?:dia )?(\d{1,2}) de (${MESES_RE})(?: de (\d{4}))?`, (m) => {
      const mes = numeroDoMes(m[2])
      return mes < 0 ? null : { data: proximaDataDoAno(hoje, Number(m[1]), mes, m[3] ? Number(m[3]) : null) }
    }],
    [String.raw`(${SEMANA_RE})(?:[- ]feira)?`, (m) => ({ data: proximoDiaSemana(hoje, numeroDoDia(m[1])) })],
    [String.raw`(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?`, (m) => {
      const dia = Number(m[1]); const mes = Number(m[2]) - 1
      if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null
      let ano = m[3] ? Number(m[3]) : null
      if (ano !== null && ano < 100) ano += 2000
      return { data: proximaDataDoAno(hoje, dia, mes, ano) }
    }],
    [String.raw`dia (\d{1,2})`, (m) => {
      const dia = Number(m[1])
      return dia >= 1 && dia <= 31 ? { data: proximoDiaDoMes(hoje, dia) } : null
    }],
  ]
}

// Horário: "14h", "14h30", "às 9:30", "às 2h". Sem "às" e sem minutos, só a partir das 6h:
// "estudar 2h" é duração, não hora.
const HORA_RE = String.raw`([àa]s )?(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:min)?`

/**
 * Lê a tarefa rápida. Além dos campos, devolve `trechos`: onde, no texto original, está cada
 * coisa entendida ({ inicio, fim, tipo: 'data'|'hora'|'etiqueta'|'projeto'|'importante' }),
 * para o campo destacar o trecho (e abrir o calendário ao clicar nele).
 */
export function lerTarefaRapida(texto, hoje = hojeTexto(), opcoes = {}) {
  // Trabalha numa cópia em que cada trecho entendido vira espaços do mesmo tamanho:
  // assim as posições continuam batendo com o texto original.
  let resto = ` ${texto} `
  const desloc = 1
  const out = { titulo: '', data: null, hora: null, repetir: null, etiquetas: [], importante: false, projeto: null, trechos: [] }
  const apagar = (inicio, fim, tipo) => {
    resto = resto.slice(0, inicio) + ' '.repeat(fim - inicio) + resto.slice(fim)
    out.trechos.push({ inicio: inicio - desloc, fim: fim - desloc, tipo })
  }

  for (const m of resto.matchAll(/(^|\s)(#[\p{L}\p{N}_-]+)/gu)) {
    const t = m[2].slice(1).toLowerCase()
    if (!out.etiquetas.includes(t)) out.etiquetas.push(t)
    apagar(m.index + m[1].length, m.index + m[0].length, 'etiqueta')
  }
  // "@casa" manda a tarefa para a coluna (projeto) Casa do quadro. Só o primeiro vale.
  for (const m of resto.matchAll(/(^|\s)(@[\p{L}\p{N}_-]+)/gu)) {
    if (!out.projeto) out.projeto = m[2].slice(1).replace(/_/g, ' ')
    apagar(m.index + m[1].length, m.index + m[0].length, 'projeto')
  }
  for (const m of resto.matchAll(/(^|\s)(!{1,3})(?=\s)/g)) {
    out.importante = true
    apagar(m.index + m[1].length, m.index + m[0].length, 'importante')
  }

  // Trechos que o JV mandou ignorar (Backspace logo depois do destaque): não valem como data.
  const normal = (s) => s.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()
  const ignorar = (opcoes.ignorar || []).map(normal)
  const regs = regras(hoje)

  // 1) Data entre parênteses ou aspas: "ir ao médico (última sexta de novembro)". Vale primeiro e inteira.
  for (const m of resto.matchAll(/[("“]([^()"“”]+)[)"”]/g)) {
    if (ignorar.includes(normal(m[0]))) continue
    const dentro = ` ${m[1].trim()} `
    for (const [padrao, fazer] of regs) {
      const mm = dentro.match(new RegExp(`^\\s${PREP}(?:${padrao})\\s$`, 'iu'))
      const r = mm && fazer([mm[0], ...mm.slice(1)])
      if (!r || !r.data) continue
      out.data = r.data
      out.repetir = r.repetir || null
      apagar(m.index, m.index + m[0].length, 'data')
      break
    }
    if (out.data) break
  }

  // 2) Data no meio do texto: a regra mais específica primeiro; pula os trechos ignorados.
  procura: for (const [padrao, fazer] of out.data ? [] : regs) {
    for (const m of resto.matchAll(new RegExp(`${INICIO}${PREP}(?:${padrao})${FIM}`, 'giu'))) {
      // m[1] é o espaço inicial; os grupos da regra vêm depois.
      if (ignorar.includes(normal(m[0].slice(m[1].length)))) continue
      const r = fazer([m[0], ...m.slice(2)])
      if (!r || !r.data) continue
      out.data = r.data
      out.repetir = r.repetir || null
      apagar(m.index + m[1].length, m.index + m[0].length, 'data')
      break procura
    }
  }

  const mh = [...resto.matchAll(new RegExp(`${INICIO}${HORA_RE}${FIM}`, 'giu'))]
    .find((m) => !ignorar.includes(normal(m[0].slice(m[1].length))))
  if (mh) {
    const comAs = !!mh[2]
    const hh = Number(mh[3]); const mm = Number(mh[4] || mh[5] || 0)
    const temMinutos = !!(mh[4] || mh[5])
    if (hh <= 23 && mm <= 59 && (comAs || temMinutos || hh >= 6)) {
      out.hora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      apagar(mh.index + mh[1].length, mh.index + mh[0].length, 'hora')
      if (!out.data) out.data = hoje
    }
  }

  out.trechos.sort((a, b) => a.inicio - b.inicio)
  out.titulo = resto.replace(/\s+/g, ' ').trim().replace(/[\s,;-]+$/, '')
  return out
}

/** Tira do texto um trecho (ex.: a data, depois que o JV escolheu outra no calendário). */
export function tirarTrecho(texto, trecho) {
  return (texto.slice(0, trecho.inicio) + texto.slice(trecho.fim)).replace(/\s{2,}/g, ' ').trim()
}
