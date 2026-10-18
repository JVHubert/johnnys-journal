// Johnny's Journal: tracker de hábitos, entrevista do dia e bujo do mês.
// Tudo fica no celular (localStorage). Com o backup automático ligado, uma cópia vai para o repositório privado de dados.
'use strict';

// Se algo quebrar, mostra o erro na tela (em vez de uma tela preta) com um botão para recarregar.
function mostrarFalha(msg) {
  if (document.getElementById('falha')) return;
  const box = document.createElement('div');
  box.id = 'falha';
  box.setAttribute('role', 'alert');
  box.innerHTML = '<b>O app travou.</b><p>Toque em recarregar. Se repetir, mande um print desta mensagem para o Claude.</p><code></code><button class="principal">Recarregar</button>';
  box.querySelector('code').textContent = String(msg || 'erro desconhecido').slice(0, 300);
  box.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => mostrarFalha(e.message));
window.addEventListener('unhandledrejection', (e) => mostrarFalha(e.reason && (e.reason.message || e.reason)));

const INICIO = '2026-10-13';            // primeiro dia do tracker
const PM3_FIM = '2026-11-01';           // fim da licença da PM3
const PM3_META_HORAS = 30;              // ≈ 53h de curso assistidas em 1,75x

const HABITOS = [
  { id: 'acordar', nome: 'Acordei às 7h', grupo: 'Manhã', curto: 'Acordei 7h' },
  { id: 'treino', nome: 'Exercício', grupo: 'Manhã', curto: 'Exercício' },
  { id: 'agua', nome: 'Água', sub: 'meta: 3 garrafas de 710 mL · a 4ª é bônus', grupo: 'Durante o dia', tipo: 'agua', curto: 'Água' },
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
    const s = (n) => [true, true, 'x', true, 'na', true, true][(i * 3 + n * 5) % 7];   // feito, não feito e não se aplica
    dados.dias[k] = { h: { acordar: s(1), treino: s(2), macros: s(3), semp: s(4), leitura: s(5), celular: s(6), journal: s(7) }, agua: (i * 3) % 5, pm3: i < 15 ? [2, 2.5, 3, 1.5][i % 4] : 0, tweet: frases[i % 5] };
  }
}
function salvar() {
  if (DEMO) return;
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch (e) { avisar('Não consegui salvar neste navegador.'); }
  agendarSync();
}
// dia(k) é chamado antes de toda mudança: o carimbo t decide qual versão vence na sincronização
const dia = (k) => { const r = (dados.dias[k] = dados.dias[k] || { h: {} }); r.t = Date.now(); return r; };
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

// Estado de um hábito num dia:
//   'ok' feito · 'parcial' meta pela metade (água, PM3) · 'x' não feito · 'na' não se aplica · '' sem registro
// Nos hábitos de tocar, d.h[id] vale true (feito), 'x' (não feito) ou 'na' (não se aplica).
const metaPm3 = (k) => (fds(k) ? 3 : 2.5);
function estado(h, k) {
  const d = lerDia(k), v = d.h[h.id];
  if (v === 'na') return 'na';
  // água e PM3 não têm o ✗: num dia que já passou, zero conta como não feito (hoje ainda está em aberto)
  const zero = k < hoje() ? 'x' : '';
  if (h.tipo === 'agua') { const n = d.agua || 0; return n >= 3 ? 'ok' : n > 0 ? 'parcial' : zero; }   // 3 garrafas batem a meta; a 4ª é bônus
  if (h.tipo === 'horas') { const n = d.pm3 || 0; return n >= metaPm3(k) ? 'ok' : n > 0 ? 'parcial' : zero; }
  return v === true ? 'ok' : v === 'x' ? 'x' : '';
}
const feito = (h, k) => estado(h, k) === 'ok';
// conta para a constância: dias passados em que o hábito valia (não se aplica fica de fora)
const conta = (h, k) => ativo(h, k) && k <= hoje() && estado(h, k) !== 'na';

// ---------- aviso ----------
let avisoT;
function avisar(txt) {
  const a = $('aviso');
  a.textContent = txt; a.style.opacity = 1;
  clearTimeout(avisoT); avisoT = setTimeout(() => (a.style.opacity = 0), 2800);
}
// abre o menu de compartilhar do Android (WhatsApp, Gmail, Keep...); sem ele, copia
async function enviar(txt) {
  if (navigator.share) {
    try { await navigator.share({ title: "Johnny's Journal", text: txt }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  copiar(txt, 'Copiado. Cole no WhatsApp para você mesmo.');
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
  const ehHoje = atual === hoje();
  $('dia-sub').textContent = ehHoje ? 'hoje' : atual === somaDias(hoje(), -1) ? 'ontem' : atual === somaDias(hoje(), 1) ? 'amanhã' : '';
  $('ir-hoje').hidden = ehHoje;
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
  $('tweet-nota').hidden = !reg.tweetRascunho;
  $('tweet-claude').hidden = !reg.tweetDoClaude;
  const sug = (dados.sugestoes || {})[atual];
  const mostrarSug = sug && sug.tweet !== reg.tweet && !reg.tweetRascunho && reg.sugRecusada !== sug.t;
  $('sug-box').hidden = !mostrarSug;
  if (mostrarSug) $('sug-texto').textContent = sug.tweet;
  renderCartaoEntrevista(reg);
}

// regra dos dois dias: avisa se ontem também ficou sem
function avisoDoisDias(h) {
  const ontem = somaDias(atual, -1);
  if (!ativo(h, ontem) || atual !== hoje()) return '';
  const firme = (e) => e === 'ok' || e === 'na';
  if (firme(estado(h, atual)) || firme(estado(h, ontem))) return '';
  return 'ontem ficou sem: hoje é o dia';
}

function linhaHabito(h, reg) {
  if (h.tipo === 'agua') {
    const el = document.createElement('div'); el.className = 'habito';
    const n = reg.agua || 0;
    el.innerHTML = `<span class="txt">${h.nome}<small>${n >= 4 ? '4 garrafas: meta + bônus' : n >= 3 ? 'meta batida · a 4ª é bônus' : `${n} de 3 garrafas · a 4ª é bônus`}</small></span><span class="garrafas"></span>`;
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
  const e = estado(h, atual);
  b.dataset.estado = e || 'vazio';
  b.setAttribute('aria-label', `${h.nome}: ${{ ok: 'feito', x: 'não feito', na: 'não se aplica' }[e] || 'sem marcação'}. Toque para mudar.`);
  const av = avisoDoisDias(h);
  b.innerHTML = `<span class="chk">${{ ok: '✓', x: '✗', na: '–' }[e] || ''}</span><span class="txt">${h.nome}${h.sub ? `<small>${h.sub}</small>` : ''}${e === 'na' ? '<small>não se aplica hoje</small>' : ''}${av ? `<small class="aviso2">${av}</small>` : ''}</span>`;
  // cada toque passa para o próximo: vazio → feito → não feito → não se aplica → vazio
  b.onclick = () => {
    const r = dia(atual), v = r.h[h.id];
    const prox = v === true ? 'x' : v === 'x' ? 'na' : v === 'na' ? null : true;
    if (prox === null) delete r.h[h.id]; else r.h[h.id] = prox;
    salvar(); renderHoje();
  };
  return b;
}

function fmtH(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r : r.toFixed(1).replace('.', ',')) + 'h';
}

$('dia-ant').onclick = () => { if (atual > INICIO) { atual = somaDias(atual, -1); renderHoje(); } };
$('dia-prox').onclick = () => { atual = somaDias(atual, 1); renderHoje(); };
$('ir-hoje').onclick = () => { atual = hoje(); renderHoje(); };
$('tweet').addEventListener('input', (e) => {
  const r = dia(atual); r.tweet = e.target.value; r.tweetRascunho = false; r.tweetDoClaude = false;
  $('tweet-claude').hidden = true;
  $('tweet-nota').hidden = true;
  if (r.tweet.trim()) r.h.journal = true;
  $('tweet-cont').textContent = `${r.tweet.length}/280`;
  salvar();
});
$('tweet').addEventListener('change', renderHoje);

// O tweet do Claude entra sozinho se o dia está sem tweet ou só com o rascunho automático.
// Se o JV já escreveu o dele, a sugestão aparece com "Usar" e nada é trocado sem ele tocar.
function aplicarSugestoes() {
  let mudou = false;
  for (const [k, s] of Object.entries(dados.sugestoes || {})) {
    const atualDia = dados.dias[k];
    if (atualDia && atualDia.tweetClaudeT === s.t) continue;          // essa sugestão já foi usada
    if (atualDia && atualDia.tweet && !atualDia.tweetRascunho) continue; // o JV escreveu o dele
    const r = dia(k);
    r.tweet = s.tweet; r.tweetRascunho = false; r.tweetDoClaude = true; r.tweetClaudeT = s.t; r.h.journal = true;
    mudou = true;
  }
  return mudou;
}
$('sug-usar').onclick = () => {
  const s = dados.sugestoes[atual]; if (!s) return;
  const r = dia(atual);
  r.tweet = s.tweet; r.tweetRascunho = false; r.tweetDoClaude = true; r.tweetClaudeT = s.t;
  salvar(); renderHoje(); avisar('Tweet do Claude aplicado.');
};
$('sug-ignorar').onclick = () => { const s = dados.sugestoes[atual]; if (!s) return; dia(atual).sugRecusada = s.t; salvar(); renderHoje(); };

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
  const copia = { modo: ent.modo, titulo: ent.titulo, data: ent.data, respostas: ent.respostas, t: Date.now() };
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
    const n = e.respostas.filter(Boolean).length;
    row.innerHTML = `<span>${esc(rotulo)}<small class="sutil"> · ${n} de ${ENTREVISTAS[e.modo].length} temas</small></span>`;
    const c = document.createElement('button'); c.className = 'link'; c.textContent = 'Abrir';
    c.onclick = () => {
      if (e.modo === 'dia') { iniciarEnt('dia'); return; }
      ent = { ...e, passo: 0 }; mostrarEnt('ent-passo'); renderPasso();
    };
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
  rec = new SR();
  // Uma frase por sessão (continuous = false) e religa no onend. No Chrome do Android,
  // o modo contínuo reenvia o que já foi dito e o texto saía repetido 4 vezes.
  rec.lang = 'pt-BR'; rec.continuous = false; rec.interimResults = true;
  rec.onresult = (ev) => {
    // cada evento traz a frase inteira até agora: substitui em vez de somar
    const frase = Array.from(ev.results).map((r) => r[0].transcript).join(' ').trim();
    area.value = base + frase;
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
  if (ent.modo === 'dia') concluirDia(); else concluirMemoria();
};
$('ent-sair').onclick = () => { guardarResposta(); voltarInicioEnt(); };
$('ent-compartilhar').onclick = () => { if (memoriaFeita) enviar(textoParaClaude(memoriaFeita)); };
$('ent-nova').onclick = voltarInicioEnt;
function voltarInicioEnt() {
  ent = null; $('ent-memoria-nome').hidden = true; $('memoria-titulo').value = '';
  mostrarEnt('ent-inicio'); renderGuardadas();
}

// rascunho do tweet a partir das respostas (o JV revisa na tela Hoje)
function rascunhoTweet(e) {
  // "Para lembrar" diz o essencial do dia; sem ele, "O que aconteceu"
  let t = (e.respostas[5] || e.respostas[0] || e.respostas.find(Boolean) || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t[0].toUpperCase() + t.slice(1);
  if (t.length > 280) { t = t.slice(0, 279); t = t.slice(0, t.lastIndexOf(' ')) + '…'; }
  else if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}

// sincroniza na hora e conta o resultado
async function sincronizarAgora(msgOk) {
  clearTimeout(syncTimer);
  const r = await sincronizar();
  if (r === 'ok') avisar(msgOk + ' Backup feito.');
  else if (r === 'desligado') avisar(msgOk + ' Ligue o backup automático em Mês.');
  else if (r === 'na-fila') avisar(msgOk);
  else avisar(msgOk + ' O backup vai assim que tiver internet.');
}

// fim da entrevista do dia: guarda, faz o rascunho do tweet e leva para a tela Hoje
function concluirDia() {
  const data = ent.data;
  persistirEnt();
  const r = dia(data);
  if (!r.tweet || r.tweetRascunho) {
    const tw = rascunhoTweet(ent);
    if (tw) { r.tweet = tw; r.tweetRascunho = true; r.h.journal = true; }
  }
  salvar();
  ent = null; mostrarEnt('ent-inicio');
  atual = data;
  irPara('hoje');
  setTimeout(() => {
    const card = document.querySelector('.tweet');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
  sincronizarAgora('Entrevista guardada. Revise o tweet.');
}

// fim de uma memória: guarda e sincroniza; o Claude lê do backup
let memoriaFeita = null;
function concluirMemoria() {
  persistirEnt();
  memoriaFeita = { modo: ent.modo, titulo: ent.titulo, data: ent.data, respostas: ent.respostas.slice() };
  $('ent-fim-titulo').textContent = `"${ent.titulo}" está guardada.`;
  ent = null;
  mostrarEnt('ent-fim');
  sincronizarAgora('Memória guardada.');
}

function renderCartaoEntrevista(reg) {
  const e = reg.entrevista;
  const n = e ? e.respostas.filter(Boolean).length : 0;
  $('ent-hoje-status').textContent = n ? `feita · ${n} de ${ENTREVISTAS.dia.length} temas` : 'ainda não';
  $('ent-hoje-btn').textContent = n ? 'Rever ou completar a entrevista' : 'Fazer a entrevista do dia';
  $('ent-hoje-btn').className = n ? 'secundario' : 'principal';
}
$('ent-hoje-btn').onclick = () => { irPara('entrevista'); iniciarEnt('dia'); };

// ================= MÊS =================
let mesRef = deChave(atual); mesRef.setDate(1);
let visao = 'plano';
try { visao = localStorage.getItem('jj-visao-mes') || 'plano'; } catch (e) { /* padrão */ }

function diasDoMes() {
  const ano = mesRef.getFullYear(), m = mesRef.getMonth();
  const n = new Date(ano, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => chave(new Date(ano, m, i + 1)));
}
const pctHabito = (h, ks) => {
  const vale = ks.filter((k) => conta(h, k));
  return vale.length ? Math.round((vale.filter((k) => feito(h, k)).length / vale.length) * 100) : null;
};

function renderMes() {
  const ano = mesRef.getFullYear(), m = mesRef.getMonth();
  $('mes-label').textContent = `${MESES[m][0].toUpperCase() + MESES[m].slice(1)} de ${ano}`;
  $('ir-mes').hidden = ano === deChave(hoje()).getFullYear() && m === deChave(hoje()).getMonth();
  const primeiro = deChave(INICIO);
  $('mes-ant').disabled = ano < primeiro.getFullYear() || (ano === primeiro.getFullYear() && m <= primeiro.getMonth());
  const ks = diasDoMes();
  const ps = HABITOS.map((h) => pctHabito(h, ks)).filter((p) => p !== null);
  $('mes-sub').textContent = ps.length ? `constância média: ${Math.round(ps.reduce((a, b) => a + b, 0) / ps.length)}%` : '';
  $('vis-plano').setAttribute('aria-pressed', String(visao === 'plano'));
  $('mes-plano').hidden = visao !== 'plano';
  $('vis-tweets').setAttribute('aria-pressed', String(visao === 'tweets'));
  $('vis-panorama').setAttribute('aria-pressed', String(visao === 'panorama'));
  $('mes-tweets').hidden = visao !== 'tweets';
  $('mes-panorama').hidden = visao !== 'panorama';
  if (visao === 'plano') renderPlano(); else if (visao === 'tweets') renderTweets(ks); else renderPanorama(ks);
}

// tweets: um dia por linha, do mais recente para o mais antigo; tocar abre o dia
function renderTweets(ks) {
  const dias = ks.filter((k) => k >= INICIO && k <= hoje()).reverse();
  const lista = $('lista-tweets');
  if (!dias.length) { lista.innerHTML = '<li class="sutil" style="padding:14px 2px">Nada registrado neste mês.</li>'; return; }
  lista.innerHTML = dias.map((k) => {
    const d = deChave(k), r = lerDia(k);
    const ativos = HABITOS.filter((h) => ativo(h, k) && estado(h, k) !== 'na');
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

// panorama: uma linha por hábito (nome, um quadradinho por dia, % à direita)
function renderPanorama(ks) {
  const n = ks.length, cols = `repeat(${n}, 1fr)`;
  const hs = HABITOS.filter((h) => ks.some((k) => ativo(h, k)));
  const linhas = hs.map((h) => {
    const p = pctHabito(h, ks);
    const celulas = ks.map((k) => {
      let cls;
      if (!ativo(h, k)) cls = 'fora';
      else if (k > hoje()) cls = 'fut';
      else cls = estado(h, k) || 'vazio';
      return `<i class="${cls}${k === hoje() ? ' hoje' : ''}"></i>`;
    }).join('');
    return { h, p, html: `<div class="pan-h"><span class="pan-nome">${h.curto}</span><div class="faixa" style="grid-template-columns:${cols}">${celulas}</div><b class="pan-pct${p !== null && p < 50 ? ' fraco' : ''}">${p === null ? '–' : p + '%'}</b></div>` };
  });
  const regua = ks.map((k) => { const d = deChave(k).getDate(); return `<span>${d === 1 || d % 5 === 0 ? d : ''}</span>`; }).join('');
  $('pan-habitos').innerHTML = linhas.map((l) => l.html).join('') +
    `<div class="pan-h pan-regua"><span></span><div class="reguas" style="grid-template-columns:${cols}">${regua}</div><span></span></div>`;

  const comP = linhas.filter((l) => l.p !== null);
  if (!comP.length) { $('pan-media').textContent = '–'; $('pan-frase').textContent = 'Ainda não há dias registrados neste mês.'; return; }
  const media = Math.round(comP.reduce((a, l) => a + l.p, 0) / comP.length);
  const ord = comP.slice().sort((a, b) => b.p - a.p);
  $('pan-media').textContent = media + '%';
  $('pan-frase').textContent = ord.length > 1
    ? `Mais firme: ${ord[0].h.nome} (${ord[0].p}%). O que mais escapou: ${ord[ord.length - 1].h.nome} (${ord[ord.length - 1].p}%).`
    : '';
}
$('vis-plano').onclick = () => { visao = 'plano'; try { localStorage.setItem('jj-visao-mes', visao); } catch (e) {} renderMes(); };
$('vis-tweets').onclick = () => { visao = 'tweets'; try { localStorage.setItem('jj-visao-mes', visao); } catch (e) {} renderMes(); };
$('vis-panorama').onclick = () => { visao = 'panorama'; try { localStorage.setItem('jj-visao-mes', visao); } catch (e) {} renderMes(); };const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('mes-ant').onclick = () => { mesRef.setMonth(mesRef.getMonth() - 1); renderMes(); };
$('mes-prox').onclick = () => { mesRef.setMonth(mesRef.getMonth() + 1); renderMes(); };
$('ir-mes').onclick = () => { mesRef = deChave(hoje()); mesRef.setDate(1); renderMes(); };
// ================= PLANO (cifrado) =================
// plano.enc.json é público, mas cifrado (AES-GCM, chave tirada da senha com PBKDF2).
// A senha fica só neste celular. O que o JV marca como feito vai em dados.plano.
let plano = null;
const SENHA_CHAVE = 'jj-senha-plano';
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function abrirPlano(senha) {
  const r = await fetch('plano.enc.json', { cache: 'no-store' });
  const p = await r.json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deB64(p.sal), iterations: p.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(p.iv) }, chave, deB64(p.dados));
  return JSON.parse(new TextDecoder().decode(claro));
}

async function carregarPlano() {
  let s = null;
  try { s = localStorage.getItem(SENHA_CHAVE); } catch (e) { /* sem senha guardada */ }
  if (!s) return false;
  try { plano = await abrirPlano(s); return true; }
  catch (e) { return false; }
}

const passoFeito = (id) => !!(dados.plano && dados.plano[id]);
function marcarPasso(id) {
  dados.plano = dados.plano || {};
  dados.plano[id] = !dados.plano[id];
  dados.planoT = Date.now();
  salvar(); renderPlano();
}

function htmlPasso(p) {
  return `<button class="passo" data-id="${p.id}" aria-pressed="${passoFeito(p.id)}"><span class="chk"></span>
    <span class="txt">${esc(p.txt)}${p.quando ? `<small>${esc(p.quando)}</small>` : ''}</span></button>`;
}

function renderPlano() {
  const box = $('plano-conteudo');
  if (!plano) {
    $('plano-trava').hidden = false; box.innerHTML = '';
    carregarPlano().then((ok) => { if (ok) renderPlano(); });
    return;
  }
  $('plano-trava').hidden = true;
  const k = `${mesRef.getFullYear()}-${pad(mesRef.getMonth() + 1)}`;
  const mes = plano.meses[k];
  if (!mes) { box.innerHTML = '<p class="sutil" style="margin-top:16px">Ainda não há plano para este mês. No fim do mês anterior, o Claude escreve o próximo.</p>'; return; }

  const todos = [...mes.foco.passos, ...mes.temas.flatMap((t) => t.passos || [])];
  const feitos = todos.filter((p) => passoFeito(p.id)).length;
  const pct = todos.length ? Math.round((feitos / todos.length) * 100) : 0;

  box.innerHTML = `
    <h2 class="plano-titulo">${esc(mes.titulo)}</h2>
    <div class="cartao">
      <div class="linha-base"><span>${feitos} de ${todos.length} passos feitos</span><b>${pct}%</b></div>
      <div class="barra"><i style="width:${pct}%"></i></div>
    </div>
    <div class="foco-mes">
      <div class="rotulo">Foco do mês · ${esc(mes.foco.n)} ${esc(mes.foco.nome)}</div>
      <p class="sutil pequena">Feito quando: ${esc(mes.foco.feitoQuando)}</p>
      ${mes.foco.passos.map(htmlPasso).join('')}
    </div>
    <div class="grupo">Em segundo plano, uma ação pequena por semana</div>
    ${mes.temas.map((t) => `
      <div class="tema-plano">
        <div class="tema-nome"><span class="sutil">${esc(t.n)}</span> ${esc(t.nome)}</div>
        ${t.espera ? `<p class="sutil pequena espera">${esc(t.espera)}</p>` : t.passos.map(htmlPasso).join('')}
      </div>`).join('')}
    <p class="sutil pequena" style="margin-top:18px">Plano de ${plano.versao.split('-').reverse().join('/')}. Todo domingo, conte ao Claude o que andou; ele atualiza o plano e o app recebe sozinho.</p>`;
  box.querySelectorAll('.passo').forEach((b) => (b.onclick = () => marcarPasso(b.dataset.id)));
}

$('plano-trava').onsubmit = async (e) => {
  e.preventDefault();
  const s = $('plano-senha').value.trim().toLowerCase();
  if (!s) return;
  try {
    plano = await abrirPlano(s);
    try { localStorage.setItem(SENHA_CHAVE, s); } catch (err) { /* abre só nesta sessão */ }
    $('plano-senha').value = '';
    renderPlano();
  } catch (err) { avisar('Senha errada (ou sem internet na primeira vez).'); }
};

// ================= BACKUP AUTOMÁTICO (GitHub privado) =================
// Grava dados.json no repositório privado JVHubert/johnnys-journal-dados a cada mudança.
// O token (fine-grained, só esse repositório) fica só neste celular.
// ?arquivo=outro.json serve só para testes: grava num arquivo separado sem tocar nos dados reais
const ARQ_DADOS = (new URLSearchParams(location.search).get('arquivo') || 'dados.json').replace(/[^\w.-]/g, '');
const REPO_DADOS = 'https://api.github.com/repos/JVHubert/johnnys-journal-dados/contents/' + ARQ_DADOS;
const TOKEN_CHAVE = 'jj-github-token';
let syncTimer = null, syncRodando = false, syncPendente = false;
const token = () => { try { return localStorage.getItem(TOKEN_CHAVE); } catch (e) { return null; } };
// em pedaços: com o diário crescendo, converter tudo de uma vez estoura o limite de argumentos
function b64Utf8(s) {
  const u8 = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
const utf8B64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

function statusSync(txt) { $('sync-status').textContent = txt; }
function agendarSync() {
  if (DEMO || !token()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sincronizar, 2500);
}

// junta o que está no celular com o que está no GitHub: em cada dia, vence a versão mais recente
function juntar(local, remoto) {
  const r = { dias: { ...remoto.dias }, memorias: [], plano: {}, planoT: 0 };
  for (const [k, d] of Object.entries(local.dias)) if (!r.dias[k] || (d.t || 0) >= (r.dias[k].t || 0)) r.dias[k] = d;
  const mems = new Map();
  for (const m of [...(remoto.memorias || []), ...(local.memorias || [])]) {
    const k = m.titulo + '|' + m.data;
    if (!mems.has(k) || (m.t || 0) >= (mems.get(k).t || 0)) mems.set(k, m);
  }
  r.memorias = [...mems.values()];
  const pl = (local.planoT || 0) >= (remoto.planoT || 0) ? local : remoto;
  r.plano = { ...(pl.plano || {}) }; r.planoT = pl.planoT || 0;
  // sugestões de tweet do Claude: ficam fora dos dias para nunca sobrescrever o que o JV marcou
  r.sugestoes = { ...(remoto.sugestoes || {}) };
  for (const [k, s] of Object.entries(local.sugestoes || {})) if (!r.sugestoes[k] || (s.t || 0) >= (r.sugestoes[k].t || 0)) r.sugestoes[k] = s;
  return r;
}

async function sincronizar() {
  const tk = token(); if (!tk || DEMO) return 'desligado';
  if (syncRodando) { syncPendente = true; return 'na-fila'; }
  syncRodando = true;
  const cab = { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json' };
  try {
    let ok = false;
    for (let tentativa = 0; tentativa < 3 && !ok; tentativa++) {
      let sha, remoto = { dias: {}, memorias: [] };
      const g = await fetch(REPO_DADOS + '?ref=main&t=' + Date.now(), { headers: cab, cache: 'no-store' });
      if (g.status === 401 || g.status === 403) throw new Error('token');
      if (g.ok) { const j = await g.json(); sha = j.sha; remoto = JSON.parse(utf8B64(j.content)); }
      else if (g.status !== 404) throw new Error('rede');
      const junto = juntar(dados, remoto);
      const mudouLocal = JSON.stringify(junto) !== JSON.stringify(dados);
      dados = junto;
      try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* segue */ }
      if (aplicarSugestoes()) { try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* segue */ } }
      if (mudouLocal) renderTudo();
      if (sha && JSON.stringify(junto) === JSON.stringify(remoto)) { ok = true; break; }   // nada novo para enviar
      const p = await fetch(REPO_DADOS, {
        method: 'PUT', headers: cab,
        body: JSON.stringify({ message: `dados ${new Date().toISOString().slice(0, 16)}`, content: b64Utf8(JSON.stringify(dados, null, 1)), sha, branch: 'main' }),
      });
      if (p.ok) { ok = true; break; }
      if (p.status === 401 || p.status === 403) throw new Error('token');
      if (p.status !== 409 && p.status !== 422) throw new Error('rede');   // conflito: lê de novo e junta
    }
    if (!ok) throw new Error('conflito');
    const h = new Date();
    statusSync(`Backup feito às ${pad(h.getHours())}:${pad(h.getMinutes())}.`);
    return 'ok';
  } catch (e) {
    statusSync(e.message === 'token' ? 'O GitHub recusou o token. Cole um token novo.' : e.message === 'conflito' ? 'Não consegui gravar o backup. Toque em Sincronizar agora.' : 'Sem internet agora: tento de novo depois.');
    if (e.message === 'token') { $('sync-form').hidden = false; }
    return 'erro';
  } finally {
    syncRodando = false;
    if (syncPendente) { syncPendente = false; agendarSync(); }
  }
}

function renderSync() {
  const ligado = !!token();
  $('sync-form').hidden = ligado;
  $('sync-agora').hidden = !ligado;
  if (!ligado) statusSync('');
}
$('sync-ligar').onclick = async () => {
  const tk = $('sync-token').value.trim();
  if (!tk) { avisar('Cole o token primeiro.'); return; }
  try { localStorage.setItem(TOKEN_CHAVE, tk); } catch (e) { avisar('Este navegador não deixou guardar o token.'); return; }
  $('sync-token').value = ''; renderSync(); statusSync('Conectando…');
  await sincronizar();
};
$('sync-agora').onclick = () => { statusSync('Sincronizando…'); sincronizar(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });

// ================= abas =================
let telaAtual = 'hoje';
function irPara(tela) {
  telaAtual = tela;
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

// O Firefox do Android congela ou descarta a página quando ela fica parada em segundo plano.
// Ao voltar: redesenha a tela atual e, se mesmo assim ela estiver vazia, recarrega.
let escondidoEm = 0;
function voltarDoSegundoPlano() {
  try {
    if (telaAtual === 'hoje') renderHoje();
    if (telaAtual === 'mes') renderMes();
    if (telaAtual === 'entrevista' && !ent) renderGuardadas();
    document.body.style.display = 'none'; void document.body.offsetHeight; document.body.style.display = '';   // força repintar
  } catch (e) { mostrarFalha(e.message); return; }
  setTimeout(() => {
    const tela = document.querySelector('.tela:not([hidden])');
    if (!tela || tela.getBoundingClientRect().height < 80) location.reload();
  }, 1200);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { escondidoEm = Date.now(); return; }
  if (escondidoEm && Date.now() - escondidoEm > 15000) voltarDoSegundoPlano();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) voltarDoSegundoPlano(); });

renderTudo();
renderSync();
sincronizar();
const inicial = new URLSearchParams(location.search).get('tela');
if (inicial) irPara(inicial);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
