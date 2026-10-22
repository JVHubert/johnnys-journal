// Estações do ano (hemisfério sul) e fase da Lua, calculadas aqui mesmo, sem internet.
// Equinócios e solstícios pelo método de Jean Meeus ("Astronomical Algorithms", cap. 27): erro de
// minutos. Fase da Lua pelo mês sinódico médio: erro de algumas horas, o bastante para dizer a fase do dia.

const DIA = 86400000
const JD_UNIX = 2440587.5 // dia juliano de 1/1/1970 00:00 UTC
const deJD = (jd) => new Date((jd - JD_UNIX) * DIA)
const paraJD = (data) => data.getTime() / DIA + JD_UNIX
const rad = (g) => (g * Math.PI) / 180

// Meeus, tabelas 27.C (termos periódicos) e 27.B (anos 2000 a 3000)
const A = [485, 203, 199, 182, 156, 136, 77, 74, 70, 58, 52, 50, 45, 44, 29, 18, 17, 16, 14, 12, 12, 12, 9, 8]
const B = [324.96, 337.23, 342.08, 27.85, 73.14, 171.52, 222.54, 296.72, 243.58, 119.81, 297.17, 21.02, 247.54, 325.15, 60.93, 155.12, 288.79, 198.04, 199.76, 95.39, 287.11, 320.81, 227.73, 15.45]
const C = [1934.136, 32964.467, 20.186, 445267.112, 45036.886, 22518.443, 65928.934, 3034.906, 9037.513, 33718.147, 150.678, 2281.226, 29929.562, 31555.956, 4443.417, 67555.328, 4562.452, 62894.029, 31436.921, 14577.848, 31931.756, 34777.259, 1222.114, 16859.074]
const MEDIOS = [
  [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057], // equinócio de março
  [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030], // solstício de junho
  [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078], // equinócio de setembro
  [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032], // solstício de dezembro
]

/** Momento (Date) do equinócio/solstício `i` (0 março, 1 junho, 2 setembro, 3 dezembro) do ano. */
export function marcoDoAno(ano, i) {
  const Y = (ano - 2000) / 1000
  const [a, b, c, d, e] = MEDIOS[i]
  const jde0 = a + b * Y + c * Y ** 2 + d * Y ** 3 + e * Y ** 4
  const T = (jde0 - 2451545.0) / 36525
  const W = 35999.373 * T - 2.47
  const dl = 1 + 0.0334 * Math.cos(rad(W)) + 0.0007 * Math.cos(rad(2 * W))
  let S = 0
  for (let k = 0; k < 24; k++) S += A[k] * Math.cos(rad(B[k] + C[k] * T))
  return deJD(jde0 + (0.00001 * S) / dl)
}

// No hemisfério sul: março abre o outono, junho o inverno, setembro a primavera, dezembro o verão.
export const ESTACOES = ['outono', 'inverno', 'primavera', 'verao']
export const NOME_ESTACAO = { outono: 'Outono', inverno: 'Inverno', primavera: 'Primavera', verao: 'Verão' }

// Dia no fuso de Brasília (UTC-3), como número de dias: para contar "há N dias" pelo calendário.
const diaLocal = (data) => Math.floor((data.getTime() - 3 * 3600000) / DIA)

/**
 * Estação de agora: { estacao, proxima, inicio, fim, passados, faltam, total, progresso, metade }.
 * `metade`: já passou da metade (aí vale mais dizer quanto falta para a próxima).
 */
export function estacaoAtual(agora = new Date()) {
  const ano = agora.getUTCFullYear()
  const marcos = []
  for (const a of [ano - 1, ano, ano + 1]) for (let i = 0; i < 4; i++) marcos.push({ quando: marcoDoAno(a, i), estacao: ESTACOES[i] })
  let k = marcos.findIndex((m) => m.quando > agora) - 1
  if (k < 0) k = 0
  const atual = marcos[k]
  const prox = marcos[k + 1]
  const total = diaLocal(prox.quando) - diaLocal(atual.quando)
  const passados = diaLocal(agora) - diaLocal(atual.quando)
  const faltam = diaLocal(prox.quando) - diaLocal(agora)
  return {
    estacao: atual.estacao, proxima: prox.estacao, inicio: atual.quando, fim: prox.quando, total, passados, faltam,
    progresso: Math.min(1, Math.max(0, (agora - atual.quando) / (prox.quando - atual.quando))),
    metade: passados >= total / 2,
  }
}

// ---------- Lua ----------
const SINODICO = 29.530588853
const LUA_NOVA_REF = 2451550.09766 // lua nova de 6/1/2000, 18:14 UTC (Meeus)

/** Fase da Lua: { nome, idade (dias), fase (0 a 1), iluminada (0 a 1), proxima, emDias }. */
export function faseDaLua(agora = new Date()) {
  const idade = (((paraJD(agora) - LUA_NOVA_REF) % SINODICO) + SINODICO) % SINODICO
  const fase = idade / SINODICO
  const iluminada = (1 - Math.cos(2 * Math.PI * fase)) / 2
  // Nomes do dia a dia: "nova" e "cheia" perto do dia exato; entre elas, crescente ou minguante.
  const nome = idade < 1.5 || idade > SINODICO - 1.5 ? 'Lua nova'
    : Math.abs(idade - SINODICO / 2) < 1.5 ? 'Lua cheia'
      : idade < SINODICO / 2 ? 'Lua crescente' : 'Lua minguante'
  const proxima = idade < SINODICO / 2 ? 'cheia' : 'nova'
  const emDias = Math.round((idade < SINODICO / 2 ? SINODICO / 2 : SINODICO) - idade)
  return { nome, idade, fase, iluminada, proxima, emDias }
}
