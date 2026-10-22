// Telas novas do app (Início, Tarefas, Journal, Ajustes) e os avisos. Usa o que o app.js já tem
// (dados, salvar, hoje, HABITOS, entrevista, backup) e conversa com o serviço da Cloudflare do Journal
// do PC: as tarefas vão e voltam por lá, e é de lá que vêm os avisos.
// datas.js e astro.js são cópias dos arquivos do Journal do PC (bloco-de-notas-2/src): copie de novo quando mudarem.
import { lerTarefaRapida, proximaRepeticao, rotuloData, rotuloRepetir } from './datas.js';
import { estacaoAtual, faseDaLua, NOME_ESTACAO } from './astro.js';

// ---------- pequenos ajudantes ----------
const lerLS = (k, padrao = null) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch (e) { return padrao; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* segue */ } };
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const e = (s) => esc(String(s ?? ''));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DIAS3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const diaCurto = (k) => { const d = deChave(k); return `${DIAS3[d.getDay()]} ${d.getDate()} ${MES3[d.getMonth()]}`; };
const difDias = (a, b) => Math.round((deChave(a) - deChave(b)) / 864e5);
const ICONE_MIC = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

const ESPACOS = [
  { id: 'journal', nome: "Johnny's Journal", cor: '#6EE29A', letra: 'J' },
  { id: 'cursos', nome: 'Cursos', cor: '#A98AF0', letra: 'C' },
  { id: 'faculdade', nome: 'Faculdade', cor: '#6AA08F', letra: 'F' },
  { id: 'para-conferir', nome: 'Para conferir', cor: '#5D6B62', letra: 'P' },
];
const espaco = (id) => ESPACOS.find((x) => x.id === id) || ESPACOS[0];
// Sem coral nem mostarda (essas cores querem dizer atraso e prazo).
const CORES_PROJETO = ['#6EE29A', '#6AA08F', '#8FB8E8', '#E59AC8', '#C9B37E', '#9FD3C7', '#B9A6F2'];
const corProjeto = (nome) => { let s = 0; for (const c of String(nome)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return CORES_PROJETO[s % CORES_PROJETO.length]; };

// ---------- avisinho de baixo com "Desfazer" ----------
let lancheT = null;
function lanche(txt, desfazer) {
  const box = $('lanche');
  $('lanche-txt').textContent = txt;
  $('lanche-acao').hidden = !desfazer;
  $('lanche-acao').onclick = () => { box.hidden = true; desfazer && desfazer(); };
  box.hidden = false;
  clearTimeout(lancheT); lancheT = setTimeout(() => (box.hidden = true), 4000);
}

// ---------- camadas por cima (folha, tela cheia) e o botão Voltar do Android ----------
const camadas = [];
function abrirCamada(fechar) {
  camadas.push(fechar);
  history.pushState({ camada: camadas.length }, '');
}
// Fecha a camada de cima; a promessa resolve quando ela fechou de fato (o Voltar é assíncrono).
const esperando = [];
function fecharCamada() {
  return new Promise((ok) => { if (!camadas.length) { ok(); return; } esperando.push(ok); history.back(); });
}
window.addEventListener('popstate', () => {
  const f = camadas.pop();
  if (f) { f(); esperando.splice(0).forEach((ok) => ok()); return; }
  if (telaAtual === 'entrevista' || telaAtual === 'ajustes') irPara(telaDaBarra);
});

function abrirFolha(conteudo, aoFechar) {
  const f = $('folha');
  f.innerHTML = '';
  f.appendChild(h('<div class="folha-alca" aria-hidden="true"></div>'));
  f.appendChild(conteudo);
  f.hidden = false; $('veu').hidden = false;
  abrirCamada(() => { f.hidden = true; $('veu').hidden = true; f.innerHTML = ''; aoFechar && aoFechar(); });
}
$('veu').onclick = fecharCamada;

function abrirCheia(conteudo, aoFechar) {
  const c = $('cheia');
  c.innerHTML = '';
  c.appendChild(conteudo);
  c.hidden = false;
  c.scrollTop = 0;
  abrirCamada(() => { c.hidden = true; c.innerHTML = ''; aoFechar && aoFechar(); });
}

// ================= LIGAÇÃO COM O SERVIÇO DO JOURNAL =================
// O endereço e a senha ficam no repositório privado de dados (ligacao.json), que o celular já lê com o
// token do backup. Assim não é preciso digitar nada.
let ligacao = lerLS('jj-nuvem');
async function buscarLigacao() {
  if (ligacao || DEMO || !token()) return ligacao;
  try {
    const r = await fetch(REPO_DADOS.replace(/[^/]+$/, 'ligacao.json') + '?ref=main&t=' + Date.now(), {
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store',
    });
    if (r.ok) { const l = await r.json(); if (l.url && l.segredo) { ligacao = l; gravarLS('jj-nuvem', l); } }
  } catch (err) { /* sem internet: tenta depois */ }
  return ligacao;
}
async function nuvem(rota, corpo, metodo = 'POST') {
  const l = await buscarLigacao();
  if (!l) throw new Error('sem-ligacao');
  const r = await fetch(l.url + rota, {
    method: metodo, headers: { 'content-type': 'application/json', 'x-segredo': l.segredo },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'erro ' + r.status);
  return j;
}

// ================= TAREFAS (as mesmas do PC) =================
let T = lerLS('jj-tarefas', null) || { desde: 0, lista: {}, pend: {}, quando: 0 };
if (DEMO) T = tarefasDeExemplo();
const salvarT = () => { if (!DEMO) gravarLS('jj-tarefas', T); };
const vivas = () => Object.values(T.lista).filter((t) => !t.apagada);
let sincRodando = false, sincTimer = null;

async function sincTarefas() {
  if (DEMO || sincRodando) return;
  sincRodando = true;
  try {
    const enviadas = Object.keys(T.pend).map((id) => T.lista[id]).filter(Boolean);
    const r = await nuvem('/tarefas/sincronizar', { desde: T.desde, mudancas: enviadas });
    const mandadas = new Map(enviadas.map((t) => [t.id, t.mudou]));
    for (const x of r.tarefas || []) {
      const local = T.lista[x.id];
      if (local && (local.mudou || 0) >= x.mudou) continue; // a daqui é a mais nova
      T.lista[x.id] = x;
    }
    for (const [id, m] of mandadas) if (T.lista[id] && T.lista[id].mudou === m) delete T.pend[id];
    T.desde = r.desde; T.quando = Date.now(); T.erro = null;
    salvarT();
    renderTarefas(); renderInicio();
  } catch (err) {
    T.erro = err.message;
    renderSinc();
  } finally { sincRodando = false; }
}
const agendarSincT = (ms = 1500) => { clearTimeout(sincTimer); sincTimer = setTimeout(sincTarefas, ms); };

function mudarTarefa(id, fn) {
  if (!T.lista[id]) return;
  const t = { ...T.lista[id] };
  fn(t);
  t.mudou = Date.now();
  T.lista[id] = t; T.pend[id] = 1;
  salvarT(); renderTarefas(); renderInicio(); agendarSincT();
}
function criarTarefa(info) {
  const id = 'c' + novoId(), agora = Date.now();
  T.lista[id] = {
    id, titulo: info.titulo, data: info.data || null, hora: info.hora || null, repetir: info.repetir || null,
    projeto: info.projeto || null, etiquetas: info.etiquetas || [], importante: !!info.importante, feita: false,
    concluidaEm: null, notas: info.notas || null, lembrete: info.lembrete || null, origem: null, criada: agora, mudou: agora,
  };
  T.pend[id] = 1;
  salvarT(); renderTarefas(); renderInicio(); agendarSincT();
  talvezPedirAvisos(T.lista[id]);
  return id;
}
function alternarFeita(id) {
  const t = T.lista[id];
  if (!t) return;
  if (t.feita) { mudarTarefa(id, (x) => { x.feita = false; x.concluidaEm = null; }); return; }
  mudarTarefa(id, (x) => { x.feita = true; x.concluidaEm = Date.now(); });
  // Quem conclui cria a próxima repetição (o PC faz igual).
  let proxima = null;
  if (t.repetir && t.data) {
    let p = proximaRepeticao(t.data, t.repetir);
    while (p && p < hoje()) p = proximaRepeticao(p, t.repetir);
    if (p) proxima = criarTarefa({ ...t, data: p, lembrete: null });
  }
  lanche('Concluída', () => {
    mudarTarefa(id, (x) => { x.feita = false; x.concluidaEm = null; });
    if (proxima) mudarTarefa(proxima, (x) => { x.apagada = true; });
  });
}
function apagarTarefa(id) {
  mudarTarefa(id, (x) => { x.apagada = true; });
  lanche('Tarefa apagada', () => mudarTarefa(id, (x) => { x.apagada = false; }));
}
const atrasada = (t) => !t.feita && t.data && t.data < hoje();
const projetos = () => [...new Set(vivas().map((t) => t.projeto).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

function metaTarefa(t) {
  const partes = [];
  if (t.data) partes.push(`<span class="${atrasada(t) ? 'coral' : ''}">${e(rotuloData(t.data, hoje()))}${t.hora ? ' ' + e(t.hora) : ''}</span>`);
  else if (t.hora) partes.push(e(t.hora));
  if (t.repetir) partes.push(`<span title="${e(rotuloRepetir(t.repetir))}">↻</span>`);
  if (t.lembrete) partes.push('<span title="lembrete">⏰</span>');
  if (t.projeto) partes.push(`<span><b style="color:${corProjeto(t.projeto)}">#</b>${e(t.projeto)}</span>`);
  if ((t.origem || '').startsWith('plano:')) partes.push('<span class="selo">Plano</span>');
  return partes.join('<i class="sep">·</i>');
}
function linhaTarefa(t) {
  const el = h(`<div class="tarefa${t.feita ? ' feita' : ''}">
    <button class="circulo${atrasada(t) ? ' atrasada' : ''}" aria-label="${t.feita ? 'Reabrir' : 'Concluir'}: ${e(t.titulo)}">${t.feita ? '✓' : ''}</button>
    <button class="tarefa-corpo"><span class="t-titulo">${e(t.titulo)}</span>${metaTarefa(t) ? `<span class="t-meta">${metaTarefa(t)}</span>` : ''}</button>
    ${t.importante ? '<span class="estrela" aria-label="importante">★</span>' : ''}
  </div>`);
  el.querySelector('.circulo').onclick = () => alternarFeita(t.id);
  el.querySelector('.tarefa-corpo').onclick = () => abrirDetalhe(t.id);
  if (atrasada(t)) el.classList.add('atrasada');
  return el;
}
const ordenar = (a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.hora || '99').localeCompare(b.hora || '99') || (b.importante - a.importante) || (a.criada || 0) - (b.criada || 0);

let vista = 'hoje', projetoAberto = null, verConcluidas = false;
function renderSinc() {
  const b = $('tar-sinc');
  const semLig = !ligacao && !DEMO;
  b.classList.toggle('erro', !!T.erro && !semLig);
  let txt;
  if (DEMO) txt = 'atualizado há 2 min';
  else if (semLig) txt = 'não ligado';
  else if (T.erro && T.erro !== 'sem-ligacao') txt = 'sem internet';
  else if (!T.quando) txt = 'ligando…';
  else { const m = Math.floor((Date.now() - T.quando) / 60000); txt = m < 1 ? 'atualizado agora' : `atualizado há ${m} min`; }
  $('tar-sinc-txt').textContent = txt;
  $('tar-sem-ligacao').hidden = !semLig;
}
function secao(titulo, classe = '') { return h(`<h2 class="secao ${classe}">${titulo}</h2>`); }
function vazio(txt) { return h(`<p class="vazio">${txt}</p>`); }

function renderTarefas() {
  renderSinc();
  const lista = $('tar-lista');
  if (!lista) return;
  const abertas = vivas().filter((t) => !t.feita);
  const k = hoje();
  const deHoje = abertas.filter((t) => t.data && t.data <= k);
  const inbox = abertas.filter((t) => !t.data);
  $('tar-abas').querySelectorAll('button').forEach((b) => {
    const v = b.dataset.v;
    b.setAttribute('aria-selected', String(v === vista));
    const n = v === 'hoje' ? deHoje.length : v === 'inbox' ? inbox.length : 0;
    b.innerHTML = `${{ hoje: 'Hoje', proximos: 'Próximos', inbox: 'Inbox', projetos: 'Projetos' }[v]}${n ? ` <small>${n}</small>` : ''}`;
  });
  lista.innerHTML = '';
  if (vista === 'hoje') {
    const atr = deHoje.filter(atrasada).sort(ordenar);
    const hj = deHoje.filter((t) => t.data === k).sort(ordenar);
    if (atr.length) { lista.appendChild(secao('Atrasadas', 'coral')); atr.forEach((t) => lista.appendChild(linhaTarefa(t))); }
    lista.appendChild(secao('Hoje · ' + diaCurto(k)));
    if (hj.length) hj.forEach((t) => lista.appendChild(linhaTarefa(t)));
    else lista.appendChild(vazio(atr.length ? 'Nada marcado para hoje além das atrasadas.' : 'Nada para hoje. Toque em + para anotar.'));
  } else if (vista === 'proximos') {
    for (let i = 1; i <= 7; i++) {
      const d = somaDias(k, i);
      lista.appendChild(secao(i === 1 ? 'Amanhã · ' + diaCurto(d) : diaCurto(d)));
      const doDia = abertas.filter((t) => t.data === d).sort(ordenar);
      if (doDia.length) doDia.forEach((t) => lista.appendChild(linhaTarefa(t)));
      else lista.appendChild(h('<p class="nada">Nada marcado</p>'));
    }
  } else if (vista === 'inbox') {
    if (inbox.length) inbox.sort(ordenar).forEach((t) => lista.appendChild(linhaTarefa(t)));
    else lista.appendChild(vazio('Inbox vazio. Tarefa sem data cai aqui.'));
  } else if (projetoAberto) {
    renderProjeto(lista, projetoAberto);
  } else {
    const nomes = projetos();
    if (!nomes.length) lista.appendChild(vazio('Nenhum projeto ainda. Escreva "@nome" na tarefa para criar.'));
    nomes.forEach((p) => {
      const doP = vivas().filter((t) => t.projeto === p);
      const ab = doP.filter((t) => !t.feita).length;
      const b = h(`<button class="linha-projeto"><i class="quadrado" style="background:${corProjeto(p)}"></i><span>${e(p)}</span><small>${ab} ${ab === 1 ? 'aberta' : 'abertas'}</small><b>›</b></button>`);
      b.onclick = () => { projetoAberto = p; verConcluidas = false; renderTarefas(); window.scrollTo(0, 0); };
      lista.appendChild(b);
    });
  }
}
function renderProjeto(lista, p) {
  const doP = vivas().filter((t) => t.projeto === p);
  const ab = doP.filter((t) => !t.feita), fe = doP.filter((t) => t.feita);
  const pct = doP.length ? Math.round((fe.length / doP.length) * 100) : 0;
  const topo = h(`<div class="projeto-topo">
    <button class="link" id="proj-voltar">‹ Projetos</button>
    <h2><i class="quadrado" style="background:${corProjeto(p)}"></i>${e(p)}</h2>
    <p class="meta">${ab.length} ${ab.length === 1 ? 'aberta' : 'abertas'} · ${fe.length} ${fe.length === 1 ? 'feita' : 'feitas'}</p>
    <div class="barra-prog"><i style="width:${pct}%"></i></div>
  </div>`);
  topo.querySelector('#proj-voltar').onclick = () => { projetoAberto = null; renderTarefas(); };
  lista.appendChild(topo);
  const comData = ab.filter((t) => t.data).sort(ordenar), semData = ab.filter((t) => !t.data).sort(ordenar);
  if (comData.length) { lista.appendChild(secao('Com data')); comData.forEach((t) => lista.appendChild(linhaTarefa(t))); }
  if (semData.length) { lista.appendChild(secao('Sem data')); semData.forEach((t) => lista.appendChild(linhaTarefa(t))); }
  if (!ab.length) lista.appendChild(vazio('Tudo feito neste projeto.'));
  if (fe.length) {
    const b = h(`<button class="secao botao-secao">Concluídas (${fe.length}) ${verConcluidas ? '▾' : '▸'}</button>`);
    b.onclick = () => { verConcluidas = !verConcluidas; renderTarefas(); };
    lista.appendChild(b);
    if (verConcluidas) fe.sort((a, b2) => (b2.concluidaEm || 0) - (a.concluidaEm || 0)).forEach((t) => lista.appendChild(linhaTarefa(t)));
  }
}
$('tar-abas').querySelectorAll('button').forEach((b) => (b.onclick = () => { vista = b.dataset.v; projetoAberto = null; renderTarefas(); }));
$('tar-sinc').onclick = () => { $('tar-sinc-txt').textContent = 'atualizando…'; sincTarefas(); };
$('tar-nova').onclick = () => abrirNovaTarefa({ data: vista === 'hoje' ? hoje() : null, projeto: vista === 'projetos' ? projetoAberto : null });
$('tar-ditar').onclick = () => ditarTarefas();
setInterval(renderSinc, 30000);

// ---------- detalhe da tarefa (folha que sobe) ----------
const REPETIR = [['', 'Não repete'], ['diaria', 'Todo dia'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']];
function abrirDetalhe(id) {
  const t = T.lista[id];
  if (!t) return;
  const rep = typeof t.repetir === 'string' || !t.repetir ? (t.repetir || '') : 'outro';
  const el = h(`<div class="detalhe">
    <div class="det-topo"><textarea class="det-titulo" rows="1" aria-label="Título">${e(t.titulo)}</textarea>
      <button class="estrela-botao${t.importante ? ' ligada' : ''}" aria-label="Importante" aria-pressed="${!!t.importante}">★</button></div>
    <label class="det-linha"><span>Data</span><input type="date" data-c="data" value="${e(t.data || '')}"></label>
    <label class="det-linha"><span>Hora</span><input type="time" data-c="hora" value="${e(t.hora || '')}"></label>
    <label class="det-linha"><span>Repetir</span><select data-c="repetir">${REPETIR.map(([v, r]) => `<option value="${v}"${v === rep ? ' selected' : ''}>${r}</option>`).join('')}${rep === 'outro' ? `<option value="outro" selected>${e(rotuloRepetir(t.repetir))}</option>` : ''}</select></label>
    <label class="det-linha"><span>Lembrete</span><input type="datetime-local" data-c="lembrete" value="${e(t.lembrete || '')}"></label>
    <label class="det-linha"><span>Projeto</span><input data-c="projeto" list="lista-projetos" placeholder="sem projeto" value="${e(t.projeto || '')}"></label>
    <datalist id="lista-projetos">${projetos().map((p) => `<option value="${e(p)}">`).join('')}</datalist>
    <label class="det-linha"><span>Etiquetas</span><input data-c="etiquetas" placeholder="casa, contas" value="${e((t.etiquetas || []).join(', '))}"></label>
    <label class="det-notas"><span class="secao">Notas</span><textarea data-c="notas" rows="3" placeholder="Detalhes, endereço, telefone…">${e(t.notas || '')}</textarea></label>
    <p class="meta salvo">Salvo · aparece também no PC</p>
    <button class="botao contorno-coral" id="det-apagar">Apagar</button>
  </div>`);
  const tit = el.querySelector('.det-titulo');
  const crescer = () => { tit.style.height = 'auto'; tit.style.height = tit.scrollHeight + 'px'; };
  setTimeout(crescer, 0);
  tit.oninput = crescer;
  tit.onchange = () => { const v = tit.value.trim(); if (v) mudarTarefa(id, (x) => { x.titulo = v; }); };
  el.querySelector('.estrela-botao').onclick = (ev) => {
    const lig = !T.lista[id].importante;
    mudarTarefa(id, (x) => { x.importante = lig; });
    ev.currentTarget.classList.toggle('ligada', lig); ev.currentTarget.setAttribute('aria-pressed', String(lig));
  };
  el.querySelectorAll('[data-c]').forEach((c) => (c.onchange = () => {
    const v = c.value.trim();
    mudarTarefa(id, (x) => {
      const k = c.dataset.c;
      if (k === 'etiquetas') x.etiquetas = v.split(/[,\s]+/).map((s) => s.replace(/^#/, '').toLowerCase()).filter(Boolean);
      else if (k === 'repetir') { if (v !== 'outro') x.repetir = v || null; }
      else x[k] = v || null;
      if (k === 'hora' && v && !x.data) x.data = hoje();
    });
    if ((c.dataset.c === 'hora' || c.dataset.c === 'lembrete') && v) talvezPedirAvisos(T.lista[id]);
  }));
  el.querySelector('#det-apagar').onclick = () => fecharCamada().then(() => apagarTarefa(id));
  abrirFolha(el);
}

// ---------- adicionar rápida (folha sobre o teclado) ----------
function abrirNovaTarefa(pre = {}) {
  const ajuste = { data: pre.data || null, hora: null, lembrete: null, projeto: pre.projeto || null };
  const el = h(`<div class="rapida">
    <div class="campo-rapido"><div class="espelho" aria-hidden="true"></div><input id="rap-texto" autocomplete="off" enterkeyhint="send" placeholder="Comprar fita amanhã 9h #casa"></div>
    <div class="faixa-rola chips" id="rap-chips">
      <button data-a="hoje">Hoje</button><button data-a="amanha">Amanhã</button>
      <button data-a="data">Escolher data</button><button data-a="lembrete">Lembrete</button><button data-a="projeto">Projeto</button>
    </div>
    <input type="date" id="rap-data" class="escondido"><input type="datetime-local" id="rap-lembrete" class="escondido">
    <div class="rap-baixo"><span class="meta" id="rap-resumo"></span>
      <button class="redondo violeta" id="rap-mic" aria-label="Ditar">${ICONE_MIC}</button>
      <button class="redondo menta" id="rap-enviar" aria-label="Adicionar">➤</button></div>
  </div>`);
  const inp = el.querySelector('#rap-texto'), esp = el.querySelector('.espelho');
  const ler = () => lerTarefaRapida(inp.value, hoje());
  const atualizar = () => {
    const r = ler();
    let html = '', i = 0;
    for (const tr of r.trechos) {
      html += e(inp.value.slice(i, tr.inicio)) + `<mark class="m-${tr.tipo}">${e(inp.value.slice(tr.inicio, tr.fim))}</mark>`;
      i = tr.fim;
    }
    esp.innerHTML = html + e(inp.value.slice(i)) + ' ';
    esp.scrollLeft = inp.scrollLeft;
    const data = ajuste.data && !r.data ? ajuste.data : (r.data || ajuste.data);
    const hora = r.hora || ajuste.hora;
    const proj = r.projeto || ajuste.projeto;
    const partes = [];
    if (data) partes.push(rotuloData(data, hoje()).replace(/^./, (c) => c.toUpperCase()) + (hora ? ', ' + hora.replace(/^0/, '') : ''));
    if (r.repetir) partes.push(rotuloRepetir(r.repetir));
    if (ajuste.lembrete) partes.push('⏰ ' + ajuste.lembrete.slice(11));
    if (proj) partes.push('#' + proj);
    r.etiquetas.forEach((x) => partes.push('#' + x));
    el.querySelector('#rap-resumo').textContent = partes.join(' · ');
    el.querySelectorAll('#rap-chips button').forEach((b) => {
      const a = b.dataset.a;
      b.setAttribute('aria-pressed', String(a === 'hoje' ? data === hoje() : a === 'amanha' ? data === somaDias(hoje(), 1) : a === 'data' ? !!data && data !== hoje() && data !== somaDias(hoje(), 1) : a === 'lembrete' ? !!ajuste.lembrete : !!proj));
    });
  };
  inp.oninput = atualizar;
  inp.onscroll = () => (esp.scrollLeft = inp.scrollLeft);
  const enviar = () => {
    const r = ler();
    if (!r.titulo) { inp.focus(); return; }
    criarTarefa({ ...r, data: r.data || ajuste.data, hora: r.hora || ajuste.hora, projeto: r.projeto || ajuste.projeto, lembrete: ajuste.lembrete });
    inp.value = ''; ajuste.lembrete = null; atualizar(); inp.focus();
    avisar('Anotada.');
  };
  inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } };
  el.querySelector('#rap-enviar').onclick = enviar;
  el.querySelector('#rap-mic').onclick = () => fecharCamada().then(ditarTarefas);
  const dataInp = el.querySelector('#rap-data'), lemInp = el.querySelector('#rap-lembrete');
  dataInp.onchange = () => { ajuste.data = dataInp.value || null; atualizar(); };
  lemInp.onchange = () => { ajuste.lembrete = lemInp.value || null; atualizar(); };
  const abrirSeletor = (x) => { try { x.showPicker(); } catch (err) { x.click(); } };
  el.querySelectorAll('#rap-chips button').forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'hoje') ajuste.data = ajuste.data === hoje() ? null : hoje();
    if (a === 'amanha') ajuste.data = ajuste.data === somaDias(hoje(), 1) ? null : somaDias(hoje(), 1);
    if (a === 'data') abrirSeletor(dataInp);
    if (a === 'lembrete') { if (ajuste.lembrete) ajuste.lembrete = null; else { lemInp.value = `${ajuste.data || hoje()}T09:00`; abrirSeletor(lemInp); } }
    if (a === 'projeto') escolherProjeto(ajuste.projeto, (p) => { ajuste.projeto = p; atualizar(); });
    atualizar(); inp.focus();
  }));
  abrirFolha(el);
  atualizar();
  setTimeout(() => inp.focus(), 80);
}
function escolherProjeto(atualP, aoEscolher) {
  const nomes = projetos();
  const box = h(`<div class="escolher-projeto">${nomes.map((p) => `<button data-p="${e(p)}"${p === atualP ? ' aria-pressed="true"' : ''}><i class="quadrado" style="background:${corProjeto(p)}"></i>${e(p)}</button>`).join('')}<button data-p="">Sem projeto</button><button data-novo="1">+ Projeto novo</button></div>`);
  const chips = document.querySelector('#rap-chips');
  document.querySelector('.escolher-projeto')?.remove();
  chips.after(box);
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    let p = b.dataset.p ?? null;
    if (b.dataset.novo) p = (prompt('Nome do projeto') || '').trim() || null;
    box.remove(); aoEscolher(p || null);
  }));
}

// ---------- gravar a fala (tarefas e notas): áudio vai para o serviço do Journal (Whisper da Cloudflare) ----------
async function gravarFala({ titulo, aoTexto, soTexto, aoTarefas }) {
  let fluxo;
  try { fluxo = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) { avisar('Permita o microfone para o app (cadeado na barra de endereço do Firefox).'); return; }
  const tipo = tipoAudio();
  const rec = new MediaRecorder(fluxo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
  const pedacos = [];
  rec.ondataavailable = (ev) => { if (ev.data.size) pedacos.push(ev.data); };
  const el = h(`<div class="ditando">
    <button class="link" id="dit-cancelar">Cancelar</button>
    <h2>${e(titulo)}</h2>
    <div class="onda" aria-hidden="true">${'<i></i>'.repeat(24)}</div>
    <p class="relogio" id="dit-relogio">0:00</p>
    <p class="meta" id="dit-txt">Fale à vontade, com pausas. O texto aparece quando você parar.</p>
    <div class="dit-texto" id="dit-saida" hidden></div>
    <button class="parar" id="dit-parar" aria-label="Parar"><i></i></button>
    <button class="botao menta grande" id="dit-salvar" hidden>Salvar</button>
  </div>`);
  let cancelado = false, inicio = Date.now();
  const relogio = setInterval(() => { const s = Math.floor((Date.now() - inicio) / 1000); el.querySelector('#dit-relogio').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`; }, 500);
  const terminar = () => { clearInterval(relogio); fluxo.getTracks().forEach((x) => x.stop()); };
  abrirCheia(el, () => { cancelado = true; if (rec.state === 'recording') rec.stop(); terminar(); });
  el.querySelector('#dit-cancelar').onclick = fecharCamada;
  rec.onstop = async () => {
    terminar();
    if (cancelado) return;
    el.classList.add('pensando');
    el.querySelector('#dit-parar').hidden = true;
    el.querySelector('#dit-txt').textContent = 'Transcrevendo…';
    try {
      const blob = new Blob(pedacos, { type: rec.mimeType || tipo || 'audio/webm' });
      const audio = await paraBase64(blob);
      const r = await nuvem('/ditado', { audio, hoje: hoje(), projetos: projetos(), etiquetas: [], app: 'tracker', soTexto: !!soTexto });
      if (cancelado) return;
      el.classList.remove('pensando');
      el.querySelector('#dit-txt').textContent = soTexto ? 'Confira o texto:' : (r.tarefas.length ? 'Confira as tarefas:' : 'Não achei tarefas nessa fala.');
      const saida = el.querySelector('#dit-saida');
      saida.hidden = false;
      const salvarB = el.querySelector('#dit-salvar');
      if (soTexto) {
        saida.innerHTML = `<textarea rows="8">${e(r.texto)}</textarea>`;
        salvarB.hidden = false;
        salvarB.onclick = () => { const txt = saida.querySelector('textarea').value; fecharCamada().then(() => aoTexto(txt)); };
      } else {
        saida.innerHTML = r.tarefas.map((t, i) => `<label class="dit-tarefa"><input type="checkbox" checked data-i="${i}"><span><b>${e(t.titulo)}</b><small>${e([t.data && rotuloData(t.data, hoje()), t.hora, t.projeto && '#' + t.projeto].filter(Boolean).join(' · '))}</small></span></label>`).join('') || `<p>${e(r.texto)}</p>`;
        salvarB.hidden = !r.tarefas.length;
        salvarB.textContent = r.tarefas.length === 1 ? 'Criar a tarefa' : `Criar ${r.tarefas.length} tarefas`;
        salvarB.onclick = () => {
          const escolhidas = [...saida.querySelectorAll('input:checked')].map((c) => r.tarefas[Number(c.dataset.i)]);
          escolhidas.forEach((t) => aoTarefas(t));
          fecharCamada();
          avisar(escolhidas.length === 1 ? 'Tarefa criada.' : `${escolhidas.length} tarefas criadas.`);
        };
      }
    } catch (err) {
      el.classList.remove('pensando');
      el.querySelector('#dit-txt').textContent = err.message === 'sem-ligacao' ? 'Falta ligar o backup em Ajustes.' : 'Não consegui transcrever (' + err.message + '). Tente de novo.';
    }
  };
  el.querySelector('#dit-parar').onclick = () => { if (rec.state === 'recording') rec.stop(); };
  rec.start();
}
const paraBase64 = (blob) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = falha; r.readAsDataURL(blob); });
function ditarTarefas() {
  gravarFala({
    titulo: 'Ditando tarefas',
    aoTarefas: (t) => {
      const r = lerTarefaRapida(t.frase || t.titulo, hoje());
      criarTarefa({ titulo: t.titulo || r.titulo, data: t.data || r.data, hora: t.hora || r.hora, repetir: r.repetir, projeto: t.projeto || r.projeto, etiquetas: t.etiquetas?.length ? t.etiquetas : r.etiquetas, importante: t.importante || r.importante, notas: t.notas });
    },
  });
}

// ================= JOURNAL (estilo Keep) =================
let filtro = 'tudo', filtroEspaco = null, busca = '';
function itensJournal() {
  const out = [];
  for (const [k, d] of Object.entries(dados.dias || {})) {
    const resp = (d.entrevista && d.entrevista.respostas) || [];
    const temEnt = resp.some(Boolean), tw = (d.tweet || '').trim();
    if (!temEnt && !tw) continue;
    out.push({ id: 'dia-' + k, tipo: temEnt ? 'entrevista' : 'tweet', espaco: 'journal', data: k, dia: k,
      titulo: tw || `Entrevista de ${k.slice(8)}/${k.slice(5, 7)}`, texto: temEnt ? resp.filter(Boolean).join(' ') : '', t: d.t || 0 });
  }
  for (const m of dados.memorias || []) {
    if (!(m.respostas || []).some(Boolean)) continue;
    out.push({ id: 'mem-' + m.titulo + '|' + m.data, tipo: 'entrevista', memoria: m, espaco: 'journal', data: m.data, titulo: m.titulo, texto: m.respostas.filter(Boolean).join(' '), t: m.t || 0 });
  }
  for (const n of dados.notas || []) {
    if (n.apagada) continue;
    out.push({ id: 'nota-' + n.id, tipo: 'nota', nota: n, espaco: n.espaco || 'journal', data: n.data, titulo: n.titulo || '', texto: n.texto || '', foto: n.foto, t: n.t || 0 });
  }
  return out.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.t - a.t);
}
const ROTULO_TIPO = { entrevista: `<span class="tipo menta">${'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/></svg>'} Entrevista</span>`, tweet: '<span class="tipo violeta">Tweet do dia</span>', nota: '<span class="tipo">Nota</span>' };
const dataBonita = (k) => { if (!k) return ''; const d = deChave(k); return `${d.getDate()} ${MES3[d.getMonth()]}${d.getFullYear() !== deChave(hoje()).getFullYear() ? ' ' + d.getFullYear() : ''}`; };

function cartao(it) {
  const esp = espaco(it.espaco);
  const c = h(`<button class="cartao-j">
    ${it.foto ? '<span class="foto carregando"><img alt="" loading="lazy"></span>' : ''}
    <span class="cj-corpo">${ROTULO_TIPO[it.tipo]}${it.titulo ? `<b>${e(it.titulo)}</b>` : ''}${it.texto ? `<span class="trecho">${e(it.texto.slice(0, 220))}</span>` : ''}
    <span class="cj-pe"><i class="ponto-esp" style="background:${esp.cor}"></i>${e(dataBonita(it.data))}</span></span>
  </button>`);
  if (it.foto) carregarFoto(it.foto, c.querySelector('img'));
  c.onclick = () => abrirItem(it);
  return c;
}

let maisJournal = null;
function renderJournal() {
  const mural = $('jor-mural');
  if (!mural) return;
  $('jor-filtros').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === filtro)));
  const espBox = $('jor-espacos');
  espBox.innerHTML = '';
  ESPACOS.forEach((s) => {
    const b = h(`<button class="espaco-chip" aria-pressed="${filtroEspaco === s.id}" style="--cor:${s.cor}"><i>${s.letra}</i>${e(s.nome)}</button>`);
    b.onclick = () => { filtroEspaco = filtroEspaco === s.id ? null : s.id; renderJournal(); };
    espBox.appendChild(b);
  });
  const ent = lerDia(hoje()).entrevista;
  const feita = !!(ent && ent.respostas.some(Boolean));
  $('jor-entrevista').innerHTML = `${ICONE_MIC}<span><b>Entrevista de hoje</b> · ${feita ? 'feita' : 'ainda não feita'}</span><b>›</b>`;
  $('jor-entrevista').classList.toggle('feita', feita);

  const q = busca.trim().toLocaleLowerCase('pt-BR');
  const itens = itensJournal().filter((it) => (filtro === 'tudo' || (filtro === 'entrevistas' ? it.tipo !== 'nota' : filtro === 'notas' ? it.tipo === 'nota' : !!it.foto))
    && (!filtroEspaco || it.espaco === filtroEspaco)
    && (!q || (it.titulo + ' ' + it.texto).toLocaleLowerCase('pt-BR').includes(q)));
  mural.innerHTML = '';
  if (!itens.length) {
    mural.appendChild(vazio(q ? 'Nada com essa busca.' : filtro === 'galeria' ? 'Nenhuma nota com foto ainda.' : 'Nada aqui ainda. Faça a entrevista ou toque em + Nota.'));
    return;
  }
  // Duas colunas de alturas diferentes: cada cartão vai para a coluna mais baixa (pela altura estimada).
  const cols = [h('<div class="mural-col"></div>'), h('<div class="mural-col"></div>')];
  const alturas = [0, 0];
  cols.forEach((c) => mural.appendChild(c));
  let i = 0;
  const POR_VEZ = 40;
  const mais = () => {
    for (const fim = Math.min(itens.length, i + POR_VEZ); i < fim; i++) {
      const it = itens[i];
      const alt = (it.foto ? 150 : 0) + 60 + Math.min(220, it.texto.length) * 0.5 + (it.titulo.length > 28 ? 22 : 0);
      const c = alturas[0] <= alturas[1] ? 0 : 1;
      cols[c].appendChild(cartao(it)); alturas[c] += alt;
    }
    if (i < itens.length) {
      const s = h('<div class="sentinela"></div>');
      mural.appendChild(s);
      maisJournal?.disconnect();
      maisJournal = new IntersectionObserver((v) => { if (v[0].isIntersecting) { maisJournal.disconnect(); s.remove(); mais(); } }, { rootMargin: '600px' });
      maisJournal.observe(s);
    }
  };
  mais();
}
$('jor-filtros').querySelectorAll('button').forEach((b) => (b.onclick = () => { filtro = b.dataset.f; renderJournal(); }));
$('jor-lupa').onclick = () => { const i = $('jor-busca'); i.hidden = !i.hidden; if (!i.hidden) i.focus(); else { busca = ''; i.value = ''; renderJournal(); } };
$('jor-busca').oninput = (ev) => { busca = ev.target.value; renderJournal(); };
$('jor-entrevista').onclick = () => abrirEntrevistaDeHoje();
$('jor-nova').onclick = () => abrirNovaNota();

function abrirEntrevistaDeHoje() {
  atual = hoje();
  history.pushState({ tela: 'entrevista' }, '');
  irPara('entrevista');
  iniciarEnt('dia');
}

// ---------- nota aberta ----------
function abrirItem(it) {
  const esp = espaco(it.espaco);
  let corpo = '';
  if (it.tipo === 'nota') corpo = (it.texto || '').split('\n').filter((l) => l.trim()).map((l) => `<p>${e(l)}</p>`).join('');
  else if (it.memoria || it.dia) {
    const entr = it.memoria || lerDia(it.dia).entrevista;
    const temas = ENTREVISTAS[(entr && entr.modo) || 'dia'];
    corpo = entr ? entr.respostas.map((r, i) => (r ? `<h3>${e(temas[i] ? temas[i].tema : 'Parte ' + (i + 1))}</h3><p>${e(r)}</p>` : '')).join('') : '';
    if (!corpo && it.dia) corpo = `<p>${e(lerDia(it.dia).tweet || '')}</p>`;
  }
  const el = h(`<article class="nota-aberta">
    <div class="na-topo"><button class="link" data-a="voltar">‹ Journal</button></div>
    ${it.foto ? '<div class="na-foto"><img alt=""></div>' : ''}
    <p class="meta"><i class="ponto-esp" style="background:${esp.cor}"></i>${e(esp.nome)} · ${ROTULO_TIPO[it.tipo]}</p>
    <h1>${e(it.titulo || 'Sem título')}</h1>
    <p class="meta">${e(it.data ? deChave(it.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '')}</p>
    <div class="na-texto">${corpo}</div>
    <div class="na-botoes">
      ${it.tipo === 'nota' ? '<button class="botao contorno" data-a="foto">Trocar foto</button>' : ''}
      <button class="botao menta" data-a="editar">Editar</button>
    </div>
    <p class="meta centro">Edição longa no PC</p>
    ${it.tipo === 'nota' ? '<button class="link coral centro" data-a="apagar">Apagar nota</button>' : ''}
  </article>`);
  if (it.foto) carregarFoto(it.foto, el.querySelector('.na-foto img'));
  el.querySelector('[data-a="voltar"]').onclick = fecharCamada;
  el.querySelector('[data-a="editar"]').onclick = () => {
    fecharCamada().then(() => {
      if (it.tipo === 'nota') editarNota(it.nota);
      else if (it.memoria) { history.pushState({ tela: 'entrevista' }, ''); irPara('entrevista'); ent = { ...it.memoria, passo: 0 }; mostrarEnt('ent-passo'); renderPasso(); }
      else if (it.tipo === 'entrevista') { atual = it.dia; history.pushState({ tela: 'entrevista' }, ''); irPara('entrevista'); iniciarEnt('dia'); }
      else { atual = it.dia; irPara('habitos'); setTimeout(() => $('tweet').focus(), 80); }
    });
  };
  const fotoB = el.querySelector('[data-a="foto"]');
  if (fotoB) fotoB.onclick = () => escolherFoto('galeria', async (blob) => { await guardarFotoDaNota(it.nota, blob); fecharCamada(); renderJournal(); });
  const apagarB = el.querySelector('[data-a="apagar"]');
  if (apagarB) apagarB.onclick = () => {
    const n = it.nota;
    mexerNota(n.id, (x) => { x.apagada = true; });
    fecharCamada();
    lanche('Nota apagada', () => mexerNota(n.id, (x) => { x.apagada = false; }));
  };
  abrirCheia(el);
}

// ---------- notas: criar, editar, foto ----------
function mexerNota(id, fn) {
  const n = (dados.notas || []).find((x) => x.id === id);
  if (!n) return;
  fn(n); n.t = Date.now();
  salvar(); renderJournal(); renderInicio();
}
function abrirNovaNota() {
  let esp = filtroEspaco || 'journal';
  const el = h(`<div class="nova-nota">
    <h2 class="secao">Em qual espaço</h2>
    <div class="faixa-rola" id="nn-espacos"></div>
    <div class="nn-opcoes">
      <button data-a="escrever"><i class="nn-ic menta"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></i>Escrever</button>
      <button data-a="foto"><i class="nn-ic coral"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></i>Foto</button>
      <button data-a="ditar"><i class="nn-ic violeta">${ICONE_MIC}</i>Ditar</button>
    </div>
    <div class="nn-foto" hidden><button class="botao contorno" data-a="camera">Câmera</button><button class="botao contorno" data-a="galeria">Galeria</button></div>
  </div>`);
  const renderEsp = () => {
    const box = el.querySelector('#nn-espacos'); box.innerHTML = '';
    ESPACOS.forEach((s) => {
      const b = h(`<button class="espaco-chip" aria-pressed="${esp === s.id}" style="--cor:${s.cor}"><i>${s.letra}</i>${e(s.nome)}</button>`);
      b.onclick = () => { esp = s.id; renderEsp(); };
      box.appendChild(b);
    });
  };
  renderEsp();
  el.querySelector('[data-a="escrever"]').onclick = () => fecharCamada().then(() => editarNota({ espaco: esp }));
  el.querySelector('[data-a="foto"]').onclick = () => { el.querySelector('.nn-foto').hidden = false; };
  const comFoto = (modo) => escolherFoto(modo, (blob) => fecharCamada().then(() => editarNota({ espaco: esp }, blob)));
  el.querySelector('[data-a="camera"]').onclick = () => comFoto('camera');
  el.querySelector('[data-a="galeria"]').onclick = () => comFoto('galeria');
  el.querySelector('[data-a="ditar"]').onclick = () => {
    fecharCamada().then(() => gravarFala({ titulo: 'Ditando a nota', soTexto: true, aoTexto: (txt) => editarNota({ espaco: esp, texto: txt }) }));
  };
  abrirFolha(el);
}
function editarNota(n, fotoNova = null) {
  const nova = !n.id;
  const el = h(`<div class="editor-nota">
    <div class="na-topo"><button class="link" data-a="cancelar">Cancelar</button><select data-a="espaco">${ESPACOS.map((s) => `<option value="${s.id}"${s.id === (n.espaco || 'journal') ? ' selected' : ''}>${e(s.nome)}</option>`).join('')}</select></div>
    <div class="na-foto" hidden><img alt=""></div>
    <input class="en-titulo" placeholder="Título" value="${e(n.titulo || '')}">
    <textarea class="en-texto" rows="12" placeholder="Escreva aqui…">${e(n.texto || '')}</textarea>
    <button class="botao menta grande" data-a="salvar">Salvar</button>
  </div>`);
  const img = el.querySelector('.na-foto img');
  if (fotoNova) { img.src = URL.createObjectURL(fotoNova); el.querySelector('.na-foto').hidden = false; }
  else if (n.foto) { el.querySelector('.na-foto').hidden = false; carregarFoto(n.foto, img); }
  el.querySelector('[data-a="cancelar"]').onclick = fecharCamada;
  el.querySelector('[data-a="salvar"]').onclick = async () => {
    const titulo = el.querySelector('.en-titulo').value.trim(), texto = el.querySelector('.en-texto').value.trim();
    if (!titulo && !texto && !fotoNova && !n.foto) { fecharCamada(); return; }
    const esp = el.querySelector('[data-a="espaco"]').value;
    let nota = n;
    if (nova) {
      nota = { id: novoId(), espaco: esp, titulo, texto, foto: null, data: hoje(), criada: Date.now(), t: Date.now() };
      dados.notas = [...(dados.notas || []), nota];
    } else Object.assign(nota, { espaco: esp, titulo, texto, t: Date.now() });
    if (fotoNova) await guardarFotoDaNota(nota, fotoNova, true);
    salvar();
    fecharCamada();
    renderJournal(); renderInicio();
    avisar(nova ? 'Nota guardada. Ela vai também para o PC.' : 'Nota salva.');
  };
  abrirCheia(el);
  if (nova && !n.texto && !fotoNova) setTimeout(() => el.querySelector('.en-texto').focus(), 80);
}

// Foto: reduzida no celular (lado maior 1600 px), guardada aqui e enviada para o repositório privado
// (pasta fotos/), de onde o Journal do PC baixa. Sem internet, fica na fila e vai depois.
function escolherFoto(modo, aoEscolher) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  if (modo === 'camera') inp.capture = 'environment';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try { aoEscolher(await reduzir(f, 1600)); } catch (err) { avisar('Não consegui abrir essa foto.'); }
  };
  inp.click();
}
async function reduzir(arquivo, lado) {
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
}
const FOTOS = 'jj-fotos';
async function guardarFotoDaNota(nota, blob, semSalvar = false) {
  const caminho = `fotos/${nota.id}-${Date.now().toString(36)}.jpg`;
  try { const c = await caches.open(FOTOS); await c.put('/' + caminho, new Response(blob, { headers: { 'content-type': 'image/jpeg' } })); } catch (err) { /* sem cache: só envia */ }
  nota.foto = caminho; nota.fotoPendente = true; nota.t = Date.now();
  if (!semSalvar) salvar();
  enviarFotosPendentes();
}
let enviandoFotos = false;
async function enviarFotosPendentes() {
  if (DEMO || enviandoFotos || !token()) return;
  enviandoFotos = true;
  try {
    for (const n of (dados.notas || []).filter((x) => x.fotoPendente && x.foto)) {
      const c = await caches.open(FOTOS);
      const r = await c.match('/' + n.foto);
      if (!r) { n.fotoPendente = false; continue; }
      const b64 = await paraBase64(await r.blob());
      const url = REPO_DADOS.replace(/[^/]+$/, n.foto);
      const p = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ message: 'foto ' + n.id, content: b64, branch: 'main' }) });
      if (p.ok || p.status === 422) { n.fotoPendente = false; n.t = Date.now(); salvar(); }
    }
  } catch (err) { /* sem internet: tenta depois */ } finally { enviandoFotos = false; }
}
const urlsFotos = {};
async function carregarFoto(caminho, img) {
  try {
    if (!urlsFotos[caminho]) {
      const c = await caches.open(FOTOS);
      let r = await c.match('/' + caminho);
      if (!r && token()) {
        const g = await fetch(REPO_DADOS.replace(/[^/]+$/, caminho) + '?ref=main', { headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github.raw+json' } });
        if (g.ok) { const b = await g.blob(); await c.put('/' + caminho, new Response(b, { headers: { 'content-type': 'image/jpeg' } })); r = await c.match('/' + caminho); }
      }
      if (!r) return;
      urlsFotos[caminho] = URL.createObjectURL(await r.blob());
    }
    img.src = urlsFotos[caminho];
    img.closest('.carregando')?.classList.remove('carregando');
  } catch (err) { /* fica sem a foto */ }
}

// ================= INÍCIO =================
const PREFS_PADRAO = { contadores: true, lua: true, hoje: true, habitos: true, neste: true, entrevista: true };
let prefs = { ...PREFS_PADRAO, ...lerLS('jj-inicio', {}) };
const LETRAS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function svgEstacao(nome, progresso) {
  // Ícone que vai se enchendo de baixo para cima conforme a estação passa.
  const forma = {
    primavera: '<path d="M12 21v-7"/><circle cx="12" cy="9" r="2.4"/><path d="M12 6.6c0-2 1-3.6 2.4-3.6 0 1.8-.9 3-2.4 3.6zM12 6.6C12 4.6 11 3 9.6 3c0 1.8.9 3 2.4 3.6zM9.6 9c-2 0-3.6-1-3.6-2.4 1.8 0 3 .9 3.6 2.4zM14.4 9c2 0 3.6-1 3.6-2.4-1.8 0-3 .9-3.6 2.4zM12 17c-2-2.6-4.6-2.6-6-1.6 1.4 2.4 3.8 2.6 6 1.6zM12 17c2-2.6 4.6-2.6 6-1.6-1.4 2.4-3.8 2.6-6 1.6z"/>',
    verao: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    outono: '<path d="M12 21v-4M12 17c-5 0-8-3.5-8-8.5C7 8.5 9 6 12 3c3 3 5 5.5 8 5.5 0 5-3 8.5-8 8.5z"/>',
    inverno: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  }[nome];
  const y = 24 - 24 * progresso;
  const id = 'enche-' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <defs><clipPath id="${id}"><rect x="0" y="${y}" width="24" height="24"/></clipPath></defs>
    <g stroke="#735E53">${forma}</g><g stroke="#F2E7DF" fill="rgba(242,231,223,.25)" clip-path="url(#${id})">${forma}</g></svg>`;
}
function svgLua(fase) {
  // Hemisfério sul: a parte iluminada da crescente fica à esquerda.
  const r = 10, ilum = (1 - Math.cos(2 * Math.PI * fase)) / 2;
  const crescente = fase < 0.5;
  const k = Math.abs(1 - 2 * ilum) * r;
  const lado = crescente ? 0 : 1;
  const varre = crescente ? (ilum < 0.5 ? 1 : 0) : (ilum < 0.5 ? 0 : 1);
  return `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="${r}" fill="#281B15" stroke="#4A3A32"/>
    <path d="M12 2 A${r} ${r} 0 0 ${lado} 12 22 A${k} ${r} 0 0 ${varre} 12 2z" fill="#F2E7DF"/></svg>`;
}
function cartoesContadores() {
  const lista = [];
  const est = estacaoAtual(new Date());
  const txtEst = est.metade
    ? `faltam <b class="mostarda">${est.faltam}</b> dias para o ${NOME_ESTACAO[est.proxima].toLowerCase()}`
    : `há <b>${est.passados}</b> dias`;
  lista.push(`<div class="contador">${svgEstacao(est.estacao, est.progresso)}<span><b class="c-nome">${NOME_ESTACAO[est.estacao]}</b><small>${txtEst}</small></span></div>`);
  if (prefs.lua) {
    const lua = faseDaLua(new Date());
    lista.push(`<div class="contador">${svgLua(lua.fase)}<span><b class="c-nome">${lua.nome}</b><small>${lua.emDias ? `${lua.proxima} em ${lua.emDias} ${lua.emDias === 1 ? 'dia' : 'dias'}` : `${lua.proxima} hoje`}</small></span></div>`);
  }
  for (const c of dados.contadores || []) {
    const n = difDias(c.data, hoje());
    const txt = n > 0 ? `<b class="mostarda grande-n">${n}</b><small class="mostarda">faltam ${n === 1 ? '1 dia' : n + ' dias'}</small>` : n === 0 ? '<b class="grande-n">hoje</b><small>é hoje</small>' : `<b class="grande-n">${-n}</b><small>há ${-n === 1 ? '1 dia' : -n + ' dias'}</small>`;
    lista.push(`<div class="contador pessoal"><span><b class="c-nome">${e(c.nome)}</b>${txt}</span></div>`);
  }
  lista.push('<button class="contador mais" id="ini-mais-contador">+ Contador</button>');
  return lista.join('');
}
function renderInicio() {
  if (!$('ini-ano').isConnected) return;
  const agora = new Date(), k = hoje();
  $('ini-data').textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  // ano em 12 tracinhos
  const m = agora.getMonth(), diasMes = new Date(agora.getFullYear(), m + 1, 0).getDate();
  $('ini-ano').innerHTML = LETRAS.map((l, i) => `<span class="mes${i < m ? ' passado' : i === m ? ' atual' : ''}"><i style="${i === m ? `--p:${Math.round((agora.getDate() / diasMes) * 100)}%` : ''}"></i><small>${l}</small></span>`).join('');
  // contadores
  $('ini-contadores-box').hidden = !prefs.contadores;
  if (prefs.contadores) {
    const car = $('ini-contadores');
    car.innerHTML = cartoesContadores();
    car.querySelector('#ini-mais-contador').onclick = () => abrirAjustes('contadores');
    pontosCarrossel();
  }
  // tarefas de hoje
  $('ini-hoje-box').hidden = !prefs.hoje;
  if (prefs.hoje) {
    const box = $('ini-hoje'); box.innerHTML = '';
    const lista = vivas().filter((t) => !t.feita && t.data && t.data <= k).sort((a, b) => (atrasada(b) - atrasada(a)) || ordenar(a, b));
    if (!ligacao && !DEMO) box.appendChild(vazio('Ligue o backup em Ajustes para ver as tarefas do PC aqui.'));
    else if (!lista.length) box.appendChild(vazio('Nada para hoje.'));
    lista.slice(0, 3).forEach((t) => box.appendChild(linhaTarefa(t)));
    $('ini-ver-tudo').textContent = lista.length > 3 ? `Ver tudo (${lista.length}) ›` : 'Ver tudo ›';
  }
  // hábitos que faltam
  $('ini-habitos-box').hidden = !prefs.habitos;
  if (prefs.habitos) {
    const box = $('ini-habitos'); box.innerHTML = '';
    const faltam = HABITOS.filter((x) => ativo(x, k) && !['ok', 'na'].includes(estado(x, k)));
    if (!faltam.length) box.appendChild(h('<p class="meta">Todos marcados hoje.</p>'));
    faltam.forEach((x) => {
      const reg = lerDia(k);
      const rot = x.tipo === 'agua' ? `Água ${reg.agua || 0}/3` : x.tipo === 'horas' ? `PM3 ${fmtH(reg.pm3 || 0)} +½` : x.curto;
      const b = h(`<button class="chip-habito">${e(rot)}</button>`);
      b.onclick = () => {
        const r = dia(k);
        if (x.tipo === 'agua') r.agua = Math.min(4, (r.agua || 0) + 1);
        else if (x.tipo === 'horas') r.pm3 = Math.min(10, (r.pm3 || 0) + 0.5);
        else r.h[x.id] = true;
        salvar(); renderInicio();
        if (!x.tipo) lanche(`${x.curto}: feito`, () => { const r2 = dia(k); delete r2.h[x.id]; salvar(); renderInicio(); });
      };
      box.appendChild(b);
    });
  }
  // neste dia (anos anteriores)
  const md = k.slice(5);
  const antigos = prefs.neste ? itensJournal().filter((it) => it.data && it.data.slice(5) === md && it.data.slice(0, 4) < k.slice(0, 4)) : [];
  $('ini-neste-box').hidden = !antigos.length;
  if (antigos.length) {
    const box = $('ini-neste'); box.innerHTML = '';
    antigos.forEach((it) => {
      const anos = Number(k.slice(0, 4)) - Number(it.data.slice(0, 4));
      const c = h(`<button class="neste">${it.foto ? '<span class="foto"><img alt=""></span>' : ''}<span><small class="menta">há ${anos} ${anos === 1 ? 'ano' : 'anos'}</small><b>${e(it.titulo)}</b><span class="trecho">${e(it.texto.slice(0, 140))}</span></span></button>`);
      if (it.foto) carregarFoto(it.foto, c.querySelector('img'));
      c.onclick = () => abrirItem(it);
      box.appendChild(c);
    });
  }
  // entrevista
  const ent = lerDia(k).entrevista;
  const feita = !!(ent && ent.respostas.some(Boolean));
  const b = $('ini-entrevista');
  b.hidden = !prefs.entrevista;
  b.textContent = feita ? 'Entrevista feita ✓' : 'Fazer a entrevista de hoje';
  b.className = feita ? 'botao contorno grande' : 'botao violeta grande';
}
function pontosCarrossel() {
  const car = $('ini-contadores'), box = $('ini-pontos');
  const desenhar = () => {
    const paginas = Math.max(1, Math.ceil((car.scrollWidth - 4) / car.clientWidth));
    const atualP = Math.round(car.scrollLeft / Math.max(1, car.clientWidth));
    box.innerHTML = paginas > 1 ? Array.from({ length: paginas }, (_, i) => `<i class="${i === atualP ? 'ativo' : ''}"></i>`).join('') : '';
  };
  car.onscroll = desenhar;
  requestAnimationFrame(desenhar);
}
$('ini-ajustes').onclick = () => abrirAjustes();
$('ini-ver-tudo').onclick = () => { vista = 'hoje'; irPara('tarefas'); };
$('ini-entrevista').onclick = () => abrirEntrevistaDeHoje();
// Na tela Hábitos, a entrevista é a do dia que está aberto ali.
$('ent-hoje-btn').onclick = () => { history.pushState({ tela: 'entrevista' }, ''); irPara('entrevista'); iniciarEnt('dia'); };
$('ent-fechar').onclick = () => history.back();
window.aoMudarEntrevista = () => { renderInicio(); renderJournal(); };

// ================= AJUSTES =================
function abrirAjustes(foco) {
  history.pushState({ tela: 'ajustes' }, '');
  irPara('ajustes');
  renderAjustes();
  if (foco === 'contadores') setTimeout(() => $('aj-contadores').scrollIntoView({ block: 'center' }), 50);
}
$('aj-fechar').onclick = () => history.back();
const chave2 = (rotulo, ligado, aoMudar, extra = '') => {
  const el = h(`<div class="linha-chave"><span>${rotulo}</span>${extra}<button class="chave" role="switch" aria-checked="${ligado}" aria-label="${rotulo}"><i></i></button></div>`);
  el.querySelector('.chave').onclick = (ev) => { const v = ev.currentTarget.getAttribute('aria-checked') !== 'true'; ev.currentTarget.setAttribute('aria-checked', String(v)); aoMudar(v); };
  return el;
};
let ajustesAvisos = null;
async function renderAjustes() {
  const ini = $('aj-inicio'); ini.innerHTML = '';
  [['contadores', 'Contadores'], ['lua', 'Fase da Lua'], ['hoje', 'Tarefas de hoje'], ['habitos', 'Hábitos que faltam'], ['neste', 'Neste dia'], ['entrevista', 'Atalho da entrevista']]
    .forEach(([k, r]) => ini.appendChild(chave2(r, prefs[k], (v) => { prefs[k] = v; gravarLS('jj-inicio', prefs); renderInicio(); })));
  renderAjContadores();
  $('aj-ligacao').textContent = DEMO ? '' : ligacao ? 'Ligado ao Journal do PC: as tarefas vão e voltam.' : token() ? 'Procurando a ligação com o PC…' : '';
  // avisos (os horários ficam no serviço, que é quem manda)
  const av = $('aj-avisos');
  const ligadoAqui = lerLS('jj-avisos', {}).ligado && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  av.innerHTML = '';
  if (!ligacao && !DEMO) { av.appendChild(h('<p class="meta">Ligue o backup primeiro: os avisos vêm do Journal do PC.</p>')); return; }
  const st = h(`<div class="linha-chave"><span>${ligadoAqui ? 'Avisos ligados neste celular' : 'Avisos desligados neste celular'}</span><button class="botao contorno pequeno">${ligadoAqui ? 'Testar' : 'Ligar'}</button></div>`);
  st.querySelector('button').onclick = async () => {
    if (!ligadoAqui) { abrirPedidoAvisos(); return; }
    try { const r = await nuvem('/avisos/testar', {}); avisar(r.enviados ? 'Aviso de teste enviado.' : 'Nenhum celular inscrito. Toque em Ligar.'); } catch (err) { avisar('Não consegui: ' + err.message); }
  };
  av.appendChild(st);
  try { ajustesAvisos = DEMO ? { manha: '08:00', entrevista: '22:00', manhaLigado: true, entrevistaLigado: true, lembretesLigado: true } : await nuvem('/avisos/ajustes', null, 'GET'); }
  catch (err) { av.appendChild(h('<p class="meta">Sem internet: os horários aparecem quando voltar.</p>')); return; }
  const mudar = async (campo, valor) => { ajustesAvisos[campo] = valor; if (!DEMO) try { await nuvem('/avisos/ajustes', { [campo]: valor }); } catch (err) { avisar('Não consegui salvar (internet?).'); } };
  const hora = (campo) => `<input type="time" class="hora-aviso" data-campo="${campo}" value="${ajustesAvisos[campo]}">`;
  av.appendChild(chave2('Resumo da manhã', ajustesAvisos.manhaLigado, (v) => mudar('manhaLigado', v), hora('manha')));
  av.appendChild(chave2('Lembretes das tarefas', ajustesAvisos.lembretesLigado, (v) => mudar('lembretesLigado', v)));
  av.appendChild(chave2('Entrevista da noite', ajustesAvisos.entrevistaLigado, (v) => mudar('entrevistaLigado', v), hora('entrevista')));
  av.querySelectorAll('.hora-aviso').forEach((i) => (i.onchange = () => i.value && mudar(i.dataset.campo, i.value)));
}
function renderAjContadores() {
  const box = $('aj-contadores'); box.innerHTML = '';
  const lista = dados.contadores || [];
  const gravar = (nova) => { dados.contadores = nova; dados.contadoresT = Date.now(); salvar(); renderAjContadores(); renderInicio(); };
  lista.forEach((c, i) => {
    const l = h(`<div class="linha-contador"><span><b>${e(c.nome)}</b><small class="meta">${e(c.data.split('-').reverse().join('/'))}</small></span>
      <button aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button aria-label="Descer" ${i === lista.length - 1 ? 'disabled' : ''}>↓</button><button aria-label="Apagar" class="coral">✕</button></div>`);
    const [sobe, desce, apaga] = l.querySelectorAll('button');
    sobe.onclick = () => { const n = lista.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; gravar(n); };
    desce.onclick = () => { const n = lista.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; gravar(n); };
    apaga.onclick = () => { const n = lista.filter((_, j) => j !== i); gravar(n); lanche('Contador apagado', () => gravar(lista)); };
    box.appendChild(l);
  });
  const f = h(`<form class="novo-contador"><input class="campo" name="nome" placeholder="Ex.: Casa nova" required><input class="campo" type="date" name="data" required><button class="botao menta">Adicionar</button></form>`);
  f.onsubmit = (ev) => { ev.preventDefault(); const nome = f.nome.value.trim(), data = f.data.value; if (nome && data) gravar([...lista, { id: novoId(), nome, data }]); };
  box.appendChild(f);
}

// ================= AVISOS =================
function talvezPedirAvisos(t) {
  if (!t || !(t.hora || t.lembrete) || DEMO) return;
  const st = lerLS('jj-avisos', {});
  if (st.ligado || st.perguntado) return;
  st.perguntado = Date.now(); gravarLS('jj-avisos', st);
  setTimeout(abrirPedidoAvisos, 400);
}
function abrirPedidoAvisos() {
  const el = h(`<div class="pedido-avisos">
    <i class="sino"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></i>
    <h2>Posso te avisar na hora certa?</h2>
    <ul><li><b>8:00</b> resumo das tarefas do dia</li><li><b>na hora</b> lembrete de cada tarefa com horário</li><li><b>22:00</b> hora da entrevista</li></ul>
    <button class="botao menta grande" data-a="sim">Permitir avisos</button>
    <button class="link" data-a="nao">Agora não</button>
  </div>`);
  el.querySelector('[data-a="nao"]').onclick = fecharCamada;
  el.querySelector('[data-a="sim"]').onclick = async () => {
    try { await inscreverAvisos(); fecharCamada(); avisar('Avisos ligados.'); if (telaAtual === 'ajustes') renderAjustes(); }
    catch (err) { avisar(err.message === 'negado' ? 'O Firefox bloqueou os avisos. Libere em Configurações do site (cadeado).' : 'Não consegui ligar: ' + err.message); }
  };
  abrirFolha(el);
}
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function inscreverAvisos() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('este navegador não aceita avisos');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('negado');
  const reg = await navigator.serviceWorker.ready;
  const { chave } = await nuvem('/avisos/chave', null, 'GET');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(chave) });
  await nuvem('/avisos/inscrever', { inscricao: sub.toJSON(), aparelho: navigator.userAgent.includes('Android') ? 'celular' : 'outro' });
  gravarLS('jj-avisos', { ...lerLS('jj-avisos', {}), ligado: true });
}

// ================= navegação e endereços vindos dos avisos =================
function iconesBarra() {
  document.querySelectorAll('.barra button').forEach((b) => {
    const img = b.querySelector('img');
    const ativoB = b.hasAttribute('aria-current');
    img.src = `icons/nav/${img.dataset.icone}-${ativoB ? 'ativo' : 'inativo'}.svg`;
  });
}
window.aoMostrarTela = (tela) => {
  iconesBarra();
  if (tela === 'inicio') renderInicio();
  if (tela === 'tarefas') { renderTarefas(); sincTarefas(); }
  if (tela === 'journal') renderJournal();
  if (tela === 'habitos') mostrarPainelHab(painelHab);
};
let painelHab = 'hoje';
function mostrarPainelHab(p) {
  painelHab = p;
  $('hab-hoje').setAttribute('aria-pressed', String(p === 'hoje'));
  $('hab-mes').setAttribute('aria-pressed', String(p === 'mes'));
  $('hab-painel-hoje').hidden = p !== 'hoje';
  $('hab-painel-mes').hidden = p !== 'mes';
  if (p === 'mes') { mesRef = deChave(atual); mesRef.setDate(1); renderMes(); } else renderHoje();
}
$('hab-hoje').onclick = () => mostrarPainelHab('hoje');
$('hab-mes').onclick = () => mostrarPainelHab('mes');

function seguirEndereco(hash) {
  if (!hash) return;
  if (hash === '#tarefas-hoje') { vista = 'hoje'; irPara('tarefas'); }
  else if (hash === '#entrevista') abrirEntrevistaDeHoje();
  else if (hash.startsWith('#tarefa=')) { irPara('tarefas'); const id = decodeURIComponent(hash.slice(8)); setTimeout(() => abrirDetalhe(id), 300); }
  history.replaceState(null, '', location.pathname + location.search);
}
navigator.serviceWorker?.addEventListener('message', (ev) => { if (ev.data && ev.data.abrir) seguirEndereco(ev.data.abrir); });

window.renderNovo = () => { renderInicio(); renderTarefas(); renderJournal(); };
window.aoSincronizar = async () => {
  const antes = ligacao;
  await buscarLigacao();
  if (!antes && ligacao) { renderNovo(); sincTarefas(); }
  enviarFotosPendentes();
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sincTarefas(); renderInicio(); } });
setInterval(() => { if (document.visibilityState === 'visible') sincTarefas(); }, 60000);

// ================= dados de exemplo (?demo) =================
function tarefasDeExemplo() {
  const k = hoje(), t0 = Date.now();
  const l = [
    ['Pagar a conta de luz', somaDias(k, -1), null, 'Casa', true],
    ['Ligar para o dentista', k, '10:00', null, false],
    ['Revisar o roteiro do curso', k, null, 'Curso', false, 'plano:x'],
    ['Comprar fita crepe', k, '18:30', 'Casa', false],
    ['Enviar o relatório', somaDias(k, 1), '09:00', 'Trabalho', true],
    ['Treino de perna', somaDias(k, 2), '07:00', null, false],
    ['Ler o capítulo 3', null, null, 'Curso', false],
    ['Trocar a lâmpada da cozinha', null, null, 'Casa', false],
  ];
  const lista = {};
  l.forEach(([titulo, data, hora, projeto, importante, origem], i) => {
    const id = 'ex' + i;
    lista[id] = { id, titulo, data, hora, projeto, importante, origem: origem || null, etiquetas: [], feita: false, criada: t0 - i, mudou: t0 };
  });
  lista.exf = { id: 'exf', titulo: 'Montar a estante', data: somaDias(k, -2), projeto: 'Casa', feita: true, concluidaEm: t0, etiquetas: [], criada: t0, mudou: t0 };
  if (!dados.contadores) dados.contadores = [{ id: 'c1', nome: 'Casa nova', data: somaDias(k, 23) }, { id: 'c2', nome: 'Sem açúcar', data: somaDias(k, -41) }];
  if (!dados.notas) dados.notas = [
    { id: 'n1', espaco: 'cursos', titulo: 'Ideias para a aula 4', texto: 'Começar pelo exemplo da padaria. Mostrar o antes e o depois.', data: somaDias(k, -1), t: t0 },
    { id: 'n2', espaco: 'journal', titulo: 'Caminhada no parque', texto: 'O céu ficou laranja perto das seis. Muita gente com cachorro.', data: somaDias(k, -3), t: t0 },
  ];
  return { desde: 0, lista, pend: {}, quando: Date.now() };
}

// ================= começo =================
const inicialTela = new URLSearchParams(location.search).get('tela');
irPara(inicialTela && document.getElementById('tela-' + inicialTela) ? inicialTela : 'inicio');
seguirEndereco(location.hash);
buscarLigacao().then(() => { renderNovo(); sincTarefas(); });
enviarFotosPendentes();
