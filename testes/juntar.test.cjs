// Teste da junção dos dias do celular (juntar.js). Uso, na pasta do app do celular:
//   node testes/juntar.test.cjs
// Tudo com dados inventados.
const path = require('path')
const JJ = require(path.join(__dirname, '..', 'juntar.js'))
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'OK    ' : 'FALHA ') + msg); if (!cond) falhas++ }
const ent = (txt) => ({ modo: 'dia', data: '2026-10-20', respostas: [txt, '', '', '', '', '', ''] })

// 1. O problema de 23/10: entrevista feita no celular sem internet + hábito marcado depois no PC.
{
  const celular = { t: 100, tc: { entrevista: 100, 'h.leitura': 100 }, h: { leitura: true }, entrevista: ent('fui ao parque') }
  const github = { t: 200, tc: { agua: 200 }, h: {}, agua: 2 }
  const r = JJ.juntarDia(celular, github)
  ok(r.entrevista && r.entrevista.respostas[0] === 'fui ao parque', '1. a entrevista do celular continua depois do PC marcar a água')
  ok(r.h.leitura === true, '1. o hábito marcado no celular continua')
  ok(r.agua === 2, '1. a água marcada no PC entra')
  ok(r.t === 200 && r.tc.agua === 200 && r.tc.entrevista === 100, '1. carimbos guardados')
}
// 2. O mesmo hábito mudado nos dois: vale o mais novo.
{
  const r = JJ.juntarDia({ t: 300, tc: { 'h.treino': 300 }, h: { treino: true } }, { t: 200, tc: { 'h.treino': 200 }, h: { treino: 'x' } })
  ok(r.h.treino === true, '2. no mesmo hábito vale a marcação mais nova')
  const r2 = JJ.juntarDia({ t: 100, tc: { 'h.treino': 100 }, h: { treino: true } }, { t: 200, tc: { 'h.treino': 200 }, h: { treino: 'x' } })
  ok(r2.h.treino === 'x', '2. vale a mais nova também quando é a do GitHub')
}
// 3. Desmarcar (apagar o campo) deixa carimbo e vence a marcação mais velha.
{
  const r = JJ.juntarDia({ t: 400, tc: { 'h.treino': 400 }, h: {} }, { t: 300, tc: { 'h.treino': 300 }, h: { treino: true } })
  ok(!('treino' in r.h), '3. desmarcado depois vence a marcação antiga')
}
// 4. Dias antigos, sem tc: cada lado mantém o que só ele tem.
{
  const r = JJ.juntarDia({ t: 100, h: { a: true } }, { t: 200, h: { b: true } })
  ok(r.h.a === true && r.h.b === true, '4. dias antigos sem carimbo por campo: nada se perde')
  const r2 = JJ.juntarDia({ t: 100, h: { a: true } }, { t: 200, h: { a: 'x' } })
  ok(r2.h.a === 'x', '4. dias antigos: no mesmo campo vale o dia mais novo')
}
// 5. Entrevista com conteúdo nunca é trocada por vazia.
{
  const r = JJ.juntarDia({ t: 500, tc: { entrevista: 500 }, h: {}, entrevista: ent('') }, { t: 400, tc: { entrevista: 400 }, h: {}, entrevista: ent('dia bom') })
  ok(r.entrevista.respostas[0] === 'dia bom', '5. entrevista vazia mais nova não apaga a que tem texto')
  const r2 = JJ.juntarDia({ t: 500, tc: { entrevista: 500 }, h: {} }, { t: 400, tc: { entrevista: 400 }, h: {}, entrevista: ent('dia bom') })
  ok(r2.entrevista && r2.entrevista.respostas[0] === 'dia bom', '5. entrevista sumida mais nova não apaga a que tem texto')
}
// 5b. Entrevista movida de dia de propósito: a vazia com movidaPara vence, nos dois sentidos.
{
  const movida = { modo: 'dia', data: '2026-10-20', respostas: [], movidaPara: '2026-10-19' }
  const r = JJ.juntarDia({ t: 500, tc: { entrevista: 500 }, h: {}, entrevista: movida }, { t: 400, tc: { entrevista: 400 }, h: {}, entrevista: ent('dia bom') })
  ok(r.entrevista.movidaPara === '2026-10-19', '5b. a mudança de dia feita no celular vence a cópia velha do GitHub')
  const r2 = JJ.juntarDia({ t: 400, tc: { entrevista: 400 }, h: {}, entrevista: ent('dia bom') }, { t: 500, tc: { entrevista: 500 }, h: {}, entrevista: movida })
  ok(r2.entrevista.movidaPara === '2026-10-19', '5b. um celular com a cópia velha também aceita a mudança de dia')
  const r3 = JJ.juntarDia({ t: 600, tc: { entrevista: 600 }, h: {}, entrevista: ent('refiz') }, { t: 500, tc: { entrevista: 500 }, h: {}, entrevista: movida })
  ok(r3.entrevista.respostas[0] === 'refiz', '5b. entrevista nova feita depois no mesmo dia vale')
}
// 6. carimbar: só os campos que mudaram ganham carimbo novo.
{
  const antes = { '2026-10-20': { t: 1, h: { a: true }, agua: 1, tweet: 'x' } }
  const depois = { '2026-10-20': { t: 2, h: { a: true, b: 'x' }, agua: 2, tweet: 'x' }, '2026-10-21': { t: 3, h: { c: true } } }
  JJ.carimbar(antes, depois, 999)
  const tc = depois['2026-10-20'].tc
  ok(tc['h.b'] === 999 && tc.agua === 999, '6. campos mudados ganham carimbo')
  ok(!('h.a' in tc) && !('tweet' in tc), '6. campos iguais não ganham carimbo')
  ok(depois['2026-10-21'].tc['h.c'] === 999, '6. dia novo ganha carimbo nos campos')
  const antes2 = { d: { t: 1, h: { a: true } } }, depois2 = { d: { t: 2, h: {} } }
  JJ.carimbar(antes2, depois2, 50)
  ok(depois2.d.tc['h.a'] === 50, '6. desmarcar também ganha carimbo')
}
// 7. juntar() inteiro: o resto continua igual a antes.
{
  const local = { dias: { d1: { t: 10, tc: { entrevista: 10 }, h: {}, entrevista: ent('oi') } }, memorias: [], notas: [{ id: 'n1', t: 5, texto: 'velha' }], contadores: [{ id: 'c' }], contadoresT: 1 }
  const remoto = { dias: { d1: { t: 20, tc: { agua: 20 }, h: {}, agua: 3 }, d2: { t: 1, h: { z: true } } }, memorias: [], notas: [{ id: 'n1', t: 9, texto: 'nova' }], plano: { p: true }, planoT: 2 }
  const r = JJ.juntar(local, remoto)
  ok(r.dias.d1.entrevista && r.dias.d1.agua === 3, '7. juntar(): o dia junta campo a campo')
  ok(r.dias.d2 && r.dias.d2.h.z === true, '7. juntar(): dia que só existe no GitHub entra')
  ok(r.notas.length === 1 && r.notas[0].texto === 'nova', '7. juntar(): notas pelo id, a mais nova')
  ok(r.plano.p === true && r.contadores.length === 1, '7. juntar(): plano e contadores como antes')
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes da junção passaram')
process.exit(falhas ? 1 : 0)
