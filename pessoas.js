// Pessoas do JV (aniversários e idade; nas Fases 13 e 15 também as menções no diário).
// Fica em dados/pessoas.json: { id, nome, apelidos: [], nascimento: 'AAAA-MM-DD' | '--MM-DD' }.
// O ano é opcional: sem ele, o programa sabe o dia do aniversário mas não a idade.
import { hojeTexto, somarDias, paraTexto } from './datas.js'

export const pessoasIniciais = () => ({ versao: 1, lista: [] })

/** A lista de pessoas de um arquivo pessoas.json (aceita o arquivo vazio ou só a lista). */
export const listaDePessoas = (p) => (Array.isArray(p?.lista) ? p.lista : Array.isArray(p) ? p : [])

/** "10-24" (mês e dia) do nascimento, ou null se a data estiver estranha. */
export function diaEMes(nascimento) {
  const n = String(nascimento || '').trim()
  return /^(\d{4}|--)-?\d{2}-\d{2}$/.test(n) || /^\d{2}-\d{2}$/.test(n) ? n.slice(-5) : null
}

/** Quantos anos a pessoa faz no dia "AAAA-MM-DD". Sem o ano do nascimento, não dá para saber (null). */
export function idadeNoDia(nascimento, dia) {
  const n = String(nascimento || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null
  return Number(dia.slice(0, 4)) - Number(n.slice(0, 4))
}

/**
 * Os aniversários dos próximos `dias` dias, a partir de hoje: [{ pessoa, dia, dias, idade }].
 * Sem o ano do nascimento, `idade` vem null.
 */
export function proximosAniversarios(pessoas, hoje = hojeTexto(), dias = 30) {
  const lista = []
  for (const pessoa of listaDePessoas(pessoas)) {
    const dm = diaEMes(pessoa.nascimento)
    if (!dm) continue
    for (let i = 0; i <= dias; i++) {
      const dia = somarDias(hoje, i)
      if (dia.slice(5) !== dm) continue
      lista.push({ pessoa, dia, dias: i, idade: idadeNoDia(pessoa.nascimento, dia) })
      break
    }
  }
  return lista.sort((a, b) => a.dias - b.dias || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'))
}

/** { 'MM-DD': [nomes] }: o que o calendário precisa para marcar os dias com 🎂. */
export function aniversariosPorDia(pessoas) {
  const mapa = {}
  for (const pessoa of listaDePessoas(pessoas)) {
    const dm = diaEMes(pessoa.nascimento)
    if (!dm) continue
    ;(mapa[dm] ||= []).push(pessoa.nome)
  }
  return mapa
}

/** "24/10/1965" ou "24/10 (sem ano)". */
export function nascimentoEmTexto(nascimento) {
  const n = String(nascimento || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n.split('-').reverse().join('/')
  if (/^--\d{2}-\d{2}$/.test(n)) return n.slice(5).split('-').reverse().join('/') + ' (sem ano)'
  return ''
}

// ---------- lembretes de aniversário (Fase 4 das melhorias 6) ----------

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/**
 * O dia de hoje para os lembretes. No programa é o dia do computador; nos testes pode vir no
 * endereço (`?teste-hoje=AAAA-MM-DD`), porque o "último dia do mês" precisa de uma data certa.
 */
export function hojeParaLembretes() {
  try {
    const d = new URLSearchParams(location.search).get('teste-hoje')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  } catch { /* fora do navegador */ }
  return hojeTexto()
}

/** O último dia do mês de uma data "AAAA-MM-DD". */
function ultimoDiaDoMes(dia) {
  const [a, m] = dia.split('-').map(Number)
  return paraTexto(new Date(a, m, 0))
}

/** Os aniversários de um mês ("11"), na ordem do dia: [{ pessoa, dia }]. */
export function aniversariosDoMes(pessoas, mes) {
  const mm = String(mes).padStart(2, '0')
  return listaDePessoas(pessoas)
    .map((pessoa) => ({ pessoa, dm: diaEMes(pessoa.nascimento) }))
    .filter((x) => x.dm && x.dm.slice(0, 2) === mm)
    .map((x) => ({ pessoa: x.pessoa, dia: Number(x.dm.slice(3)) }))
    .sort((a, b) => a.dia - b.dia || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'))
}

/**
 * Os lembretes que faltam criar hoje, e o pessoas.json com as marcas do que já foi lembrado:
 * 1) 7 dias antes de cada aniversário, uma tarefa por pessoa (uma vez por ano do aniversário);
 * 2) no último dia do mês, uma tarefa com os aniversários do mês seguinte, se houver algum.
 * A marca fica no próprio pessoas.json (`lembrado: { "2026": true }` na pessoa e `lembretesMes` na
 * raiz), então apagar a tarefa não a faz voltar.
 */
/**
 * O que a tarefa criada por um desses lembretes guarda. É `marcaLembrete`, nunca `lembrete`: esse campo é a
 * hora do aviso no celular (texto). Em 31/10/2026 a marca ia em `lembrete` e travou a troca com a nuvem.
 */
export const camposDoLembrete = (l) => ({ marcaLembrete: l.marca })

export function lembretesDeAniversario(pessoas, hoje = hojeParaLembretes()) {
  const raiz = Array.isArray(pessoas) ? { versao: 1, lista: pessoas } : { ...(pessoas || pessoasIniciais()) }
  const lista = listaDePessoas(raiz).map((p) => ({ ...p }))
  const tarefas = []
  const dia7 = somarDias(hoje, 7)
  const anoDoAniversario = dia7.slice(0, 4)
  for (const pessoa of lista) {
    const dm = diaEMes(pessoa.nascimento)
    if (!dm || dm !== dia7.slice(5)) continue
    if (pessoa.lembrado?.[anoDoAniversario]) continue
    const [mes, dia] = dm.split('-')
    tarefas.push({
      titulo: `Aniversário de ${pessoa.nome} em 7 dias (${dia}/${mes})`,
      data: hoje,
      marca: { tipo: 'aniversario', pessoa: pessoa.id, ano: anoDoAniversario },
    })
    pessoa.lembrado = { ...(pessoa.lembrado || {}), [anoDoAniversario]: true }
  }

  // No último dia do mês: "Aniversários de novembro: Ed (3), Ana (12)" (só se houver algum).
  if (hoje === ultimoDiaDoMes(hoje)) {
    const chave = hoje.slice(0, 7)
    const doMesSeguinte = aniversariosDoMes({ lista }, Number(hoje.slice(5, 7)) % 12 + 1)
    if (doMesSeguinte.length && !raiz.lembretesMes?.[chave]) {
      const nomeDoMes = MESES[(Number(hoje.slice(5, 7)) % 12)]
      tarefas.push({
        titulo: `Aniversários de ${nomeDoMes}: ` + doMesSeguinte.map((x) => `${x.pessoa.nome} (${x.dia})`).join(', '),
        data: hoje,
        marca: { tipo: 'mes', mes: chave },
      })
      raiz.lembretesMes = { ...(raiz.lembretesMes || {}), [chave]: true }
    }
  }

  return { tarefas, pessoas: { ...raiz, lista } }
}

/**
 * O que o PC manda à nuvem junto da troca de tarefas, para o celular avisar os aniversários sozinho
 * (o PC pode estar desligado): só id, nome e nascimento, e as marcas do que já foi lembrado
 * (`aniv:<pessoa>:<ano>` e `mes:<AAAA-MM>`), para a nuvem não repetir lembrete que o PC já criou.
 */
export function pessoasParaNuvem(pessoas) {
  const raiz = Array.isArray(pessoas) ? { lista: pessoas } : (pessoas || {})
  const lista = listaDePessoas(raiz).filter((p) => p?.id && p?.nome && diaEMes(p.nascimento))
  const lembrados = []
  for (const p of lista) for (const [ano, v] of Object.entries(p.lembrado || {})) if (v) lembrados.push(`aniv:${p.id}:${ano}`)
  for (const [mes, v] of Object.entries(raiz.lembretesMes || {})) if (v) lembrados.push(`mes:${mes}`)
  return { pessoas: lista.map((p) => ({ id: p.id, nome: p.nome, nascimento: p.nascimento })), lembrados }
}
