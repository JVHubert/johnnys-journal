// Johnny's Journal: tracker de hábitos, entrevista do dia e bujo do mês.
// Tudo fica no próprio celular (localStorage). Nada sai daqui sem o JV copiar.
'use strict';

const INICIO = '2026-10-13';            // primeiro dia do tracker
const PM3_FIM = '2026-11-01';           // fim da licença da PM3
const PM3_META_HORAS = 30;              // ≈ 53h de curso assistidas em 1,75x

const HABITOS = [
  { id: 'acordar', nome: 'Acordei às 7h', grupo: 'Manhã', curto: 'Acordei 7h' },
  { id: 'treino', nome: 'Exercício', grupo: 'Manhã', curto: 'Exercício' },
  { id: 'agua', nome: 'Água', sub: '4 garrafas de 710 mL', grupo: 'Durante o dia', tipo: 'agua', curto: 'Água' },
  { id: 'macros', nome: 'Macros + budget', sub: 'anotar calorias e despesas', grupo: 'Durante o dia', curto: 'Macros + budget' },
  { id: 'pm3', nome: 'PM3', sub: 'horas assistidas hoje', grupo: 'Durante o dia', tipo: 'horas', ate: PM3_FIM, curto: 'PM3' },
  { id: 'semp', nome: 'Sem p + TikTok', grupo: 'Durante o dia', curto: 'Sem p + TikTok' },
  { id: 'leitura', nome: 'Leitura antes de dormir', grupo: 'Noite', curto: 'Leitura' },
  { id: 'celular', nome: 'Celular fora do quarto', sub: 'às 22h30', grupo: 'Noite', curto: 'Celular 22h30' },
  { id: 'journal', nome: 'Journal', sub: 'entrevista ou tweet', grupo: 'Noite', curto: 'Journal' },
];

const ENTREVISTAS = {
  dia: [
    { tema: 'O que aconteceu hoje', perguntas: ['Onde você estava e o que fez, do começo ao fim do dia?', 'Teve alguma surpresa?'] },
    { tema: 'Coração', perguntas: ['Com quem você esteve ou falou hoje?', 'Como você se sentiu com essas pessoas?'] },
    { tema: 'Mente', perguntas: ['O que ocupou a sua cabeça? Trabalho, PM3, uma ideia, uma preocupação.', 'Você se sentiu ouvido hoje?'] },
    { tema: 'Música e cultura', perguntas: ['O que você ouviu, leu, assistiu ou criou?', 'Alguma coisa te deu vontade de criar?'] },
    { tema: 'Corpo', perguntas: ['Como foram o treino, a comida e a energia?', 'Como você dormiu ontem?'] },
    { tema: 'Para lembrar', perguntas: ['Qual momento de hoje você quer lembrar daqui a 10 anos?', 'Descreva como se estivesse lá: cheiro, som, luz.'] },
    { tema: 'Amanhã', perguntas: ['Qual é a coisa mais importante de amanhã?', 'O que pode atrapalhar, e o que você faz se atrapalhar?'] },
  ],
  memoria: [
    { tema: 'Onde e quando', perguntas: ['Onde você estava, por quanto tempo e por quê?', 'Como era o lugar? Como era o lugar onde você dormia?'] },
    { tema: 'As pessoas', perguntas: ['Quem estava com você? Quem você conheceu?', 'Tem alguma conversa que você não quer esquecer?'] },
    { tema: 'Os melhores momentos', perguntas: ['Conte três cenas, uma de cada vez.', 'Qual foi o dia mais bonito?'] },
    { tema: 'O que deu errado', perguntas: ['O que foi difícil, chato ou estranho?', 'O que você faria diferente?'] },
    { tema: 'Sabores e sons', perguntas: ['O que você comeu e bebeu que marcou?', 'Qual música vai te levar de volta para lá?'] },
    { tema: 'Quem voltou', perguntas: ['Você voltou diferente? Em quê?', 'O que essa viagem disse sobre o que você quer?'] },
    { tema: 'Uma foto mental', perguntas: ['Se só pudesse guardar uma imagem, qual seria?', 'Descreva como se estivesse lá agora.'] },
  ],
};

const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SEM1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CHAVE = 'johnnys-journal-v1';

// ---------- dados ----------
let dados = { dias: {}, memorias: [] };
try {
  const salvo = JSON.parse(localStorage.getItem(CHAVE));
  if (salvo && salvo.dias) dados = { memorias: [], ...salvo };
} catch (e) { /* começa vazio */ }
// ?demo mostra o app com dados inventados, sem salvar nada (para conferir o visual)
const DEMO = new URLSearchParams(location.search).has('demo');
if (DEMO) {
  dados = { dias: {}, memorias: [{ modo: 'memoria', titulo: 'Pipa, setembro de 2026', data: '2026-10-13', respostas: ['Um mês em Pipa.'] }] };
  const frases = ['Treino cedo, PM3 rendeu, jantar com o pai.', 'Dia pesado no trabalho, mas li antes de dormir.', 'Corrida de 10 km e sol no fim da tarde.', '', 'Conversa boa com o Igor sobre o México.'];
  for (let i = 0; i < 18; i++) {
    const d = new Date(2026, 9, 13 + i), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = (n) => (i * 7 + n * 3) % 5 !== 0;
    dados.dias[k] = { h: { acordar: s(1), treino: s(2), macros: s(3), semp: s(4), leitura: s(5), celular: s(6), journal: s(7) }, agua: (i * 3) % 5, pm3: i < 15 ? [2, 2.5, 3, 1.5][i % 4] : 0, tweet: frases[i % 5] };
  }
}
function salvar() {
  if (DEMO) return;
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch (e) { avisar('Não consegui salvar neste navegador.'); }
}
const dia = (k) => (dados.dias[k] = dados.dias[k] || { h: {} });
const lerDia = (k) => dados.dias[k] || { h: {} };

// ---------- datas ----------
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const chave = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deChave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d); };
const somaDias = (k, n) => { const d = deChave(k); d.setDate(d.getDate() + n); return chave(d); };
const hoje = () => (DEMO ? '2026-10-30' : chave(new Date()));
const fds = (k) => [0, 6].includes(deChave(k).getDay());
const ativo = (h, k) => k >= INICIO && (!h.ate || k <= h.ate);

function feito(h, k) {
  const d = lerDia(k);
  if (h.tipo === 'agua') return (d.agua || 0) >= 4;
  if (h.tipo === 'horas') return (d.pm3 || 0) > 0;
  return !!d.h[h.id];
}

// ---------- aviso ----------
let avisoT;
function avisar(txt) {
  const a = $('aviso');
  a.textContent = txt; a.style.opacity = 1;
  clearTimeout(avisoT); avisoT = setTimeout(() => (a.style.opacity = 0), 2800);
}
async function copiar(txt, msg) {
  try { await navigator.clipboard.writeText(txt); avisar(msg); }
  catch (e) {
    const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); avisar(msg); } catch (e2) { avisar('Não consegui copiar.'); }
    t.remove();
  }
}

// ================= HOJE =================
let atual = hoje() < INICIO ? INICIO : hoje();

function renderHoje() {
  const d = deChave(atual), reg = lerDia(atual);
  $('dia-label').textContent = `${SEM[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  $('dia-sub').textContent = atual === hoje() ? 'hoje' : (atual === somaDias(hoje(), -1) ? 'ontem' : '');
  $('dia-ant').disabled = atual <= INICIO;

  // PM3
  const mostraPm3 = atual <= PM3_FIM;
  $('pm3-card').hidden = !mostraPm3;
  if (mostraPm3) {
    const total = Object.values(dados.dias).reduce((s, x) => s + (x.pm3 || 0), 0);
    const pct = Math.min(100, Math.round((total / PM3_META_HORAS) * 100));
    $('pm3-pct').textContent = pct + '%';
    $('pm3-barra').style.width = pct + '%';
    const falta = Math.max(0, PM3_META_HORAS - total);
    const diasRest = Math.max(1, Math.round((deChave(PM3_FIM) - deChave(hoje())) / 864e5));
    $('pm3-txt').textContent = falta > 0
      ? `${fmtH(total)} de ${PM3_META_HORAS}h · faltam ${fmtH(falta)}, cerca de ${fmtH(falta / diasRest)} por dia até 01/11`
      : 'Curso no fim: faça as provas e baixe o certificado.';
  }

  // hábitos agrupados
  const lista = $('lista-habitos');
  lista.innerHTML = '';
  let grupo = '';
  for (const h of HABITOS) {
    if (!ativo(h, atual)) continue;
    if (h.grupo !== grupo) {
      grupo = h.grupo;
      const g = document.createElement('div'); g.className = 'grupo'; g.textContent = grupo; lista.appendChild(g);
    }
    lista.appendChild(linhaHabito(h, reg));
  }

  $('tweet').value = reg.tweet || '';
  $('tweet-cont').textContent = `${(reg.tweet || '').length}/280`;
}

// regra dos dois dias: avisa se ontem também ficou sem
function avisoDoisDias(h) {
  const ontem = somaDias(atual, -1);
  if (!ativo(h, ontem) || feito(h, atual) || feito(h, ontem)) return '';
  return atual === hoje() ? 'ontem ficou sem: hoje é o dia' : '';
}

function linhaHabito(h, reg) {
  if (h.tipo === 'agua') {
    const el = document.createElement('div'); el.className = 'habito';
    const n = reg.agua || 0;
    el.innerHTML = `<span class="txt">${h.nome}<small>${n} de 4 · ${h.sub}</small></span><span class="garrafas"></span>`;
    const box = el.querySelector('.garrafas');
    for (let i = 1; i <= 4; i++) {
      const b = document.createElement('button');
      b.className = 'garrafa' + (i <= n ? ' cheia' : '');
      b.setAttribute('aria-label', `${i} garrafa${i > 1 ? 's' : ''}`);
      b.onclick = () => { const r = dia(atual); r.agua = (r.agua || 0) === i ? i - 1 : i; salvar(); renderHoje(); };
      box.appendChild(b);
    }
    return el;
  }
  if (h.tipo === 'horas') {
    const el = document.createElement('div'); el.className = 'habito';
    const v = reg.pm3 || 0;
    el.innerHTML = `<span class="txt">${h.nome}<small>${h.sub} · meta ${fds(atual) ? '3h' : '2,5h'}</small></span>
      <span class="stepper"><button aria-label="Menos meia hora">−</button><output>${fmtH(v)}</output><button aria-label="Mais meia hora">+</button></span>`;
    const [menos, mais] = el.querySelectorAll('button');
    menos.onclick = () => { const r = dia(atual); r.pm3 = Math.max(0, (r.pm3 || 0) - 0.5); salvar(); renderHoje(); };
    mais.onclick = () => { const r = dia(atual); r.pm3 = Math.min(10, (r.pm3 || 0) + 0.5); salvar(); renderHoje(); };
    return el;
  }
  const b = document.createElement('button');
  b.className = 'habito';
  b.setAttribute('aria-pressed', String(!!reg.h[h.id]));
  const av = avisoDoisDias(h);
  b.innerHTML = `<span class="chk"></span><span class="txt">${h.nome}${h.sub ? `<small>${h.sub}</small>` : ''}${av ? `<small class="aviso2">${av}</small>` : ''}</span>`;
  b.onclick = () => { const r = dia(atual); r.h[h.id] = !r.h[h.id]; salvar(); renderHoje(); };
  return b;
}

function fmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : r.toFixed(1).replace('.', ',')) + 'h';
}

$('dia-ant').onclick = () => { if (atual > INICIO) { atual = somaDias(atual, -1); renderHoje(); } };
$('dia-prox').onclick = () => { atual = somaDias(atual, 1); renderHoje(); };
$('tweet').addEventListener('input', (e) => {
  const r = dia(atual); r.tweet = e.target.value;
  if (r.tweet.trim()) r.h.journal = true;
  $('tweet-cont').textContent = `${r.tweet.length}/280`;
  salvar();
});
$('tweet').addEventListener('change', renderHoje);

// ================= ENTREVISTA =================
let ent = null;   // { modo, titulo, data, passo, respostas: [] }
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, gravando = false;

function mostrarEnt(qual) {
  for (const id of ['ent-inicio', 'ent-passo', 'ent-fim']) $(id).hidden = id !== qual;
}

function iniciarEnt(modo, titulo) {
  const k = atual;
  const ja = modo === 'dia' ? lerDia(k).entrevista : null;
  ent = ja ? { ...ja, passo: 0 } : { modo, titulo, data: k, passo: 0, respostas: [] };
  mostrarEnt('ent-passo');
  renderPasso();
}

function renderPasso() {
  const temas = ENTREVISTAS[ent.modo];
  const t = temas[ent.passo];
  $('ent-prog').textContent = `${ent.passo + 1} de ${temas.length}${ent.modo === 'memoria' ? ' · ' + ent.titulo : ''}`;
  $('ent-tema').textContent = t.tema;
  $('ent-perguntas').innerHTML = t.perguntas.map((p) => `<li>${p}</li>`).join('');
  $('ent-resposta').value = ent.respostas[ent.passo] || '';
  $('ent-voltar').disabled = ent.passo === 0;
  $('ent-prox').textContent = ent.passo === temas.length - 1 ? 'Terminar' : ($('ent-resposta').value.trim() ? 'Próximo' : 'Pular');
  $('ent-dica').textContent = SR
    ? 'Toque em Falar e conte. Toque de novo para parar.'
    : 'Este navegador não transcreve sozinho: toque na caixa e use o microfone do teclado.';
  $('ent-falar').hidden = !SR;
}

function guardarResposta() {
  pararGravacao();
  ent.respostas[ent.passo] = $('ent-resposta').value.trim();
  persistirEnt();
}

function persistirEnt() {
  const copia = { modo: ent.modo, titulo: ent.titulo, data: ent.data, respostas: ent.respostas };
  if (ent.modo === 'dia') {
    const r = dia(ent.data);
    r.entrevista = copia;
    if (ent.respostas.some(Boolean)) r.h.journal = true;
  } else {
    const i = dados.memorias.findIndex((m) => m.titulo === ent.titulo && m.data === ent.data);
    if (i >= 0) dados.memorias[i] = copia; else dados.memorias.push(copia);
  }
  salvar();
}

function textoParaClaude(e) {
  const temas = ENTREVISTAS[e.modo];
  const d = deChave(e.data);
  const quando = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const cab = e.modo === 'dia'
    ? `Johnny's Journal: entrevista do dia ${quando}.\nMonte uma entrada de diário em primeira pessoa, com as minhas palavras (só arrume a transcrição), e sugira um tweet de até 280 caracteres. Salve em "2026.10.12 Johnny's Journal\\01 Projeto\\diario\\".`
    : `Johnny's Journal: memória "${e.titulo}" (entrevista feita em ${quando}).\nMonte uma entrada de diário em primeira pessoa sobre essa memória, com as minhas palavras (só arrume a transcrição). Me faça perguntas se faltar algo importante. Salve em "2026.10.12 Johnny's Journal\\01 Projeto\\diario\\".`;
  const corpo = temas.map((t, i) => e.respostas[i] ? `## ${t.tema}\n${e.respostas[i]}` : '').filter(Boolean).join('\n\n');
  const tw = e.modo === 'dia' && lerDia(e.data).tweet ? `\n\n## Tweet que eu escrevi\n${lerDia(e.data).tweet}` : '';
  return `${cab}\n\n${corpo || '(sem respostas)'}${tw}`;
}

function renderGuardadas() {
  const box = $('ent-guardadas');
  const itens = [];
  const r = lerDia(atual).entrevista;
  if (r && r.respostas.some(Boolean)) itens.push({ rotulo: 'Entrevista deste dia', e: r });
  dados.memorias.slice().reverse().forEach((m) => itens.push({ rotulo: m.titulo, e: m }));
  if (!itens.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<h2>Guardadas</h2>';
  itens.forEach(({ rotulo, e }) => {
    const row = document.createElement('div'); row.className = 'guardada';
    row.innerHTML = `<span>${rotulo}</span>`;
    const c = document.createElement('button'); c.className = 'link'; c.textContent = 'Copiar para o Claude';
    c.onclick = () => copiar(textoParaClaude(e), 'Copiado. Cole numa conversa com o Claude.');
    row.appendChild(c); box.appendChild(row);
  });
}

// voz: no Android o reconhecimento desliga sozinho depois de uma pausa,
// então religamos até o JV tocar em parar. Assim dá para falar com calma.
function pararGravacao() {
  gravando = false;
  if (rec) { try { rec.stop(); } catch (e) { /* já parado */ } }
}
function fimGravacao() {
  $('ent-falar').setAttribute('aria-pressed', 'false'); $('ent-falar-txt').textContent = 'Falar';
  $('ent-resposta').value = $('ent-resposta').value.trim();
}
function ouvir() {
  const area = $('ent-resposta');
  const base = area.value ? area.value.replace(/\s*$/, ' ') : '';
  let final = '';
  rec = new SR();
  rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (ev) => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += t + ' '; else parcial += t;
    }
    area.value = base + final + parcial;
    $('ent-prox').textContent = ent.passo === ENTREVISTAS[ent.modo].length - 1 ? 'Terminar' : 'Próximo';
  };
  rec.onerror = (ev) => {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;   // silêncio: só religa
    gravando = false;
    avisar(ev.error === 'not-allowed' ? 'Permita o microfone para este app.' : 'Não consegui ouvir. Use o microfone do teclado.');
  };
  rec.onend = () => { if (gravando) { try { ouvir(); } catch (e) { gravando = false; fimGravacao(); } } else fimGravacao(); };
  rec.start();
}
$('ent-falar').onclick = () => {
  if (gravando) { pararGravacao(); return; }
  try {
    gravando = true; ouvir();
    $('ent-falar').setAttribute('aria-pressed', 'true'); $('ent-falar-txt').textContent = 'Ouvindo… toque para parar';
  } catch (e) { gravando = false; avisar('Não consegui ligar o microfone.'); }
};

$('ent-resposta').addEventListener('input', () => {
  if (ent.passo < ENTREVISTAS[ent.modo].length - 1) $('ent-prox').textContent = $('ent-resposta').value.trim() ? 'Próximo' : 'Pular';
});
$('ent-dia').onclick = () => iniciarEnt('dia');
$('ent-memoria').onclick = () => { $('ent-memoria-nome').hidden = false; $('memoria-titulo').focus(); };
$('ent-memoria-ir').onclick = () => {
  const t = $('memoria-titulo').value.trim();
  if (!t) { avisar('Dê um nome para a memória.'); return; }
  const ja = dados.memorias.find((m) => m.titulo === t);
  ent = ja ? { ...ja, passo: 0 } : { modo: 'memoria', titulo: t, data: hoje(), passo: 0, respostas: [] };
  mostrarEnt('ent-passo'); renderPasso();
};
$('ent-voltar').onclick = () => { guardarResposta(); ent.passo--; renderPasso(); };
$('ent-prox').onclick = () => {
  guardarResposta();
  if (ent.passo < ENTREVISTAS[ent.modo].length - 1) { ent.passo++; renderPasso(); return; }
  mostrarEnt('ent-fim');
  $('ent-texto').hidden = true;
  $('ent-texto').textContent = textoParaClaude(ent);
};
$('ent-sair').onclick = () => { guardarResposta(); voltarInicioEnt(); };
$('ent-copiar').onclick = () => copiar(textoParaClaude(ent), 'Copiado. Cole numa conversa com o Claude.');
$('ent-ver').onclick = () => { $('ent-texto').hidden = !$('ent-texto').hidden; };
$('ent-nova').onclick = voltarInicioEnt;
function voltarInicioEnt() {
  ent = null; $('ent-memoria-nome').hidden = true; $('memoria-titulo').value = '';
  mostrarEnt('ent-inicio'); renderGuardadas();
}

// ================= MÊS =================
let mesRef = deChave(atual); mesRef.setDate(1);
let visao = 'tweets';
try { visao = localStorage.getItem('jj-visao-mes') || 'tweets'; } catch (e) { /* padrão */ }

function diasDoMes() {
  const ano = mesRef.getFullYear(), m = mesRef.getMonth();
  const n = new Date(ano, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => chave(new Date(ano, m, i + 1)));
}
const pctHabito = (h, ks) => {
  const passados = ks.filter((k) => ativo(h, k) && k <= hoje());
  return passados.length ? Math.round((passados.filter((k) => feito(h, k)).length / passados.length) * 100) : null;
};

function renderMes() {
  const ano = mesRef.getFullYear(), m = mesRef.getMonth();
  $('mes-label').textContent = `${MESES[m][0].toUpperCase() + MESES[m].slice(1)} de ${ano}`;
  const primeiro = deChave(INICIO);
  $('mes-ant').disabled = ano < primeiro.getFullYear() || (ano === primeiro.getFullYear() && m <= primeiro.getMonth());
  const ks = diasDoMes();
  const ps = HABITOS.map((h) => pctHabito(h, ks)).filter((p) => p !== null);
  $('mes-sub').textContent = ps.length ? `constância média: ${Math.round(ps.reduce((a, b) => a + b, 0) / ps.length)}%` : '';
  $('vis-tweets').setAttribute('aria-pressed', String(visao === 'tweets'));
  $('vis-panorama').setAttribute('aria-pressed', String(visao === 'panorama'));
  $('mes-tweets').hidden = visao !== 'tweets';
  $('mes-panorama').hidden = visao !== 'panorama';
  if (visao === 'tweets') renderTweets(ks); else renderPanorama(ks);
}

// tweets: um dia por linha, do mais recente para o mais antigo; tocar abre o dia
function renderTweets(ks) {
  const dias = ks.filter((k) => k >= INICIO && k <= hoje()).reverse();
  const lista = $('lista-tweets');
  if (!dias.length) { lista.innerHTML = '<li class="sutil" style="padding:14px 2px">Nada registrado neste mês.</li>'; return; }
  lista.innerHTML = dias.map((k) => {
    const d = deChave(k), r = lerDia(k);
    const ativos = HABITOS.filter((h) => ativo(h, k));
    const n = ativos.filter((h) => feito(h, k)).length;
    const txt = r.tweet ? `<span>${esc(r.tweet)}</span>` : '<span class="vazio">sem tweet: toque para escrever</span>';
    return `<li class="${k === hoje() ? 'hoje' : ''}"><button data-dia="${k}">
      <span class="data"><b>${d.getDate()}</b><span>${SEM[d.getDay()].slice(0, 3)}</span></span>
      <span class="txt">${txt}<span class="meta">${n} de ${ativos.length} hábitos${r.pm3 ? ` · PM3 ${fmtH(r.pm3)}` : ''}</span></span>
    </button></li>`;
  }).join('');
  lista.querySelectorAll('button[data-dia]').forEach((b) => (b.onclick = () => {
    atual = b.dataset.dia; irPara('hoje'); setTimeout(() => $('tweet').focus(), 50);
  }));
}

// panorama: uma faixa por hábito, um quadradinho por dia
function renderPanorama(ks) {
  const n = ks.length, cols = `repeat(${n}, 1fr)`;
  const hs = HABITOS.filter((h) => ks.some((k) => ativo(h, k)));
  const linhas = hs.map((h) => {
    const p = pctHabito(h, ks);
    const celulas = ks.map((k) => {
      const cls = [];
      let estilo = '';
      if (!ativo(h, k)) cls.push('fora');
      else if (k > hoje()) cls.push('fut');
      else {
        const r = lerDia(k);
        // água e PM3 acendem aos poucos: meia garrafa de verde também conta como esforço
        const parcial = h.tipo === 'agua' ? (r.agua || 0) / 4 : h.tipo === 'horas' ? Math.min(1, (r.pm3 || 0) / 2.5) : null;
        if (feito(h, k)) cls.push('ok');
        if (parcial !== null && parcial > 0 && parcial < 1) estilo = ` style="background:rgba(92,192,138,${0.25 + parcial * 0.55})"`;
      }
      if (k === hoje()) cls.push('hoje');
      return `<i class="${cls.join(' ')}"${estilo}></i>`;
    }).join('');
    return { h, p, html: `<div class="pan-h"><div class="pan-top"><span>${h.nome}</span><b class="${p !== null && p < 50 ? 'fraco' : ''}">${p === null ? '–' : p + '%'}</b></div><div class="faixa" style="grid-template-columns:${cols}">${celulas}</div></div>` };
  });
  const regua = ks.map((k) => { const d = deChave(k).getDate(); return `<span>${d === 1 || d % 5 === 0 ? d : ''}</span>`; }).join('');
  $('pan-habitos').innerHTML = linhas.map((l) => l.html).join('') + `<div class="reguas" style="grid-template-columns:${cols}">${regua}</div>`;

  const comP = linhas.filter((l) => l.p !== null);
  if (!comP.length) { $('pan-media').textContent = '–'; $('pan-frase').textContent = 'Ainda não há dias registrados neste mês.'; return; }
  const media = Math.round(comP.reduce((a, l) => a + l.p, 0) / comP.length);
  const ord = comP.slice().sort((a, b) => b.p - a.p);
  $('pan-media').textContent = media + '%';
  $('pan-frase').textContent = ord.length > 1
    ? `Mais firme: ${ord[0].h.nome} (${ord[0].p}%). O que mais escapou: ${ord[ord.length - 1].h.nome} (${ord[ord.length - 1].p}%).`
    : '';
}

$('vis-tweets').onclick = () => { visao = 'tweets'; try { localStorage.setItem('jj-visao-mes', visao); } catch (e) {} renderMes(); };
$('vis-panorama').onclick = () => { visao = 'panorama'; try { localStorage.setItem('jj-visao-mes', visao); } catch (e) {} renderMes(); };const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('mes-ant').onclick = () => { mesRef.setMonth(mesRef.getMonth() - 1); renderMes(); };
$('mes-prox').onclick = () => { mesRef.setMonth(mesRef.getMonth() + 1); renderMes(); };
$('mes-copiar').onclick = () => {
  const ano = mesRef.getFullYear(), m = mesRef.getMonth();
  const nDias = new Date(ano, m + 1, 0).getDate();
  const linhas = [];
  for (let i = 1; i <= nDias; i++) {
    const k = chave(new Date(ano, m, i));
    if (k < INICIO || k > hoje()) continue;
    const r = lerDia(k);
    const ok = HABITOS.filter((h) => ativo(h, k) && feito(h, k)).map((h) => h.curto);
    linhas.push(`${pad(i)}/${pad(m + 1)} (${SEM[deChave(k).getDay()]}): ${r.tweet || '(sem tweet)'}\n   feitos: ${ok.join(', ') || 'nenhum'}${r.pm3 ? ` · PM3 ${fmtH(r.pm3)}` : ''}${r.agua ? ` · água ${r.agua}/4` : ''}`);
  }
  const txt = `Johnny's Journal: fechamento de ${MESES[m]} de ${ano}.\nOlhe a constância dos hábitos e os tweets do mês e me ajude no fechamento mensal: o que funcionou, o que falhou, o que muda no mês que vem.\n\n${linhas.join('\n')}`;
  copiar(txt, 'Mês copiado. Cole numa conversa com o Claude.');
};
$('bk-exportar').onclick = () => {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `johnnys-journal-${hoje()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('bk-importar').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const novo = JSON.parse(await f.text());
    if (!novo.dias) throw new Error();
    if (!confirm('Trocar os dados deste celular pela cópia escolhida?')) return;
    dados = { memorias: [], ...novo }; salvar(); renderTudo(); avisar('Cópia restaurada.');
  } catch (err) { avisar('Esse arquivo não é uma cópia do Journal.'); }
  e.target.value = '';
};

// ================= abas =================
function irPara(tela) {
  pararGravacao();
  document.querySelectorAll('.tela').forEach((s) => (s.hidden = s.id !== 'tela-' + tela));
  document.querySelectorAll('.abas button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.tela === tela));
  document.querySelectorAll('.abas button[aria-current]').forEach((b) => b.setAttribute('aria-current', 'page'));
  if (tela === 'hoje') renderHoje();
  if (tela === 'entrevista' && !ent) voltarInicioEnt();
  if (tela === 'mes') { mesRef = deChave(atual); mesRef.setDate(1); renderMes(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('.abas button').forEach((b) => (b.onclick = () => irPara(b.dataset.tela)));
function renderTudo() { renderHoje(); renderMes(); renderGuardadas(); }

// volta para "hoje" quando o app é reaberto num dia novo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !ent && atual < hoje() && atual === ultimoHoje) { atual = hoje(); renderHoje(); }
  ultimoHoje = hoje();
});
let ultimoHoje = hoje();

renderTudo();
const inicial = new URLSearchParams(location.search).get('tela');
if (inicial) irPara(inicial);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
