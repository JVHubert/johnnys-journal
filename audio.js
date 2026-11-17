// Áudio original das entrevistas: guardar no celular, subir cifrado para a nuvem e tocar com o texto andando junto.
// Módulo (carregado pelo novo.js, que põe tudo em window.JJAudio para o app.js usar).
//
// Como funciona (plano de 14/11/2026, item C):
//  1. Depois de transcrever, o áudio vira Ogg Opus (ogg-opus.js; sem AudioEncoder, fica o arquivo original), é partido em
//     pedaços de até 7 MB e guardado no IndexedDB "jj-audio" deste celular (é a cópia para ouvir sem internet).
//  2. Em segundo plano, cada pedaço sobe cifrado (cifrarBytes, o mesmo esquema das imagens) para a chave aud/<hash16>-<n>
//     da nuvem. Sem internet, sem chave aberta ou com erro, o pedaço fica na fila e sobe depois.
//  3. O que fica na entrevista/memória (`audios`, uma lista; cada item de uma gravação) é só um recibo pequeno:
//     { chave: 'aud/<hash16>', partes, duracao, tipo, segmentos: [[ini, fim, 'texto'], ...], passo? }
//  4. Para ouvir: junta os pedaços daqui; se faltar algum (outro aparelho), baixa da nuvem, decifra e guarda.
import { cifrarBytes, decifrarBytes } from './cifra.mjs';
import * as A from './armazem.js';

export const PEDACO_BYTES = 7 * 1024 * 1024;
export const MAX_PEDACOS = 100;   // a nuvem aceita n de 0 a 99
const NOME = 'jj-audio';

// ---------------------------------------------------------------- IndexedDB próprio (separado das páginas do PC)
let abrindo = null;
function abrir() {
  if (abrindo) return abrindo;
  abrindo = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('pedacos', { keyPath: 'k' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { abrindo = null; falha(r.error); };
    r.onblocked = () => { abrindo = null; falha(new Error('o armazém de áudio está aberto em outra aba')); };
  });
  return abrindo;
}
const pedido = (req) => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error); });
async function loja(modo = 'readonly') { return (await abrir()).transaction('pedacos', modo).objectStore('pedacos'); }
const lerPedaco = async (k) => pedido((await loja()).get(k));
const gravarPedaco = async (p) => pedido((await loja('readwrite')).put(p));
const todosPedacos = async () => pedido((await loja()).getAll());
export async function apagarAudio(chave) {
  const todos = await todosPedacos();
  for (const p of todos) if (p.k.startsWith(chave + '-')) await pedido((await loja('readwrite')).delete(p.k));
}

// ---------------------------------------------------------------- contas (sem tela)
export async function hash16(u8) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function partir(u8, tam = PEDACO_BYTES) {
  const saida = [];
  for (let i = 0; i < u8.length; i += tam) saida.push(u8.subarray(i, Math.min(u8.length, i + tam)));
  return saida.length ? saida : [new Uint8Array(0)];
}
/** Segmento tocando agora: o último que começou até `t` (se `t` passou do fim dele por pouco, ele ainda vale; marca de mudo também conta). */
export function segmentoDe(segmentos, t) {
  let lo = 0, hi = segmentos.length - 1, achou = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (segmentos[meio][0] <= t) { achou = meio; lo = meio + 1; } else hi = meio - 1;
  }
  return achou;
}
/** Agrupa os segmentos em parágrafos: nova linha numa pausa de 2 s ou mais, ao passar de ~500 letras, ou numa marca de microfone mudo. */
export function paragrafos(segmentos, { pausa = 2, letras = 500 } = {}) {
  const out = [];
  let atual = null, tam = 0;
  segmentos.forEach((s, i) => {
    const marca = /^\[[^\]]+\]$/.test(s[2]);
    const anterior = segmentos[i - 1];
    if (!atual || marca || atual.marca || (anterior && s[0] - anterior[1] >= pausa) || tam > letras) { atual = { marca, itens: [] }; out.push(atual); tam = 0; }
    atual.itens.push(i); tam += s[2].length;
  });
  return out;
}
/** Segundos -> "m:ss" ou "h:mm:ss". */
export function tempo(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
/** A lista de gravações de uma entrevista/memória (aceita `audio` solto, de antes da lista). */
export const audiosDe = (e) => (e ? (Array.isArray(e.audios) ? e.audios : e.audio && e.audio.chave ? [e.audio] : []) : []).filter((a) => a && a.chave && a.partes > 0);

// ---------------------------------------------------------------- guardar
/**
 * @param blob       o áudio original (gravação ou arquivo enviado)
 * @param amostras   Float32Array mono 16 kHz que a transcrição mediu (ou undefined)
 * @param segmentos  [[ini, fim, texto]] da transcrição
 * @returns o recibo `{ chave, partes, duracao, tipo, segmentos }`, ou null se não deu para guardar
 */
export async function guardarAudio({ blob, amostras, segmentos, duracao, aoProgresso }) {
  let final = null;
  if (amostras && amostras.length && window.JJOgg) {
    try { final = await window.JJOgg.codificarOpus(amostras, { aoProgresso }); } catch (err) { final = null; }
  }
  const origem = final || blob;
  if (!origem || !origem.size) return null;
  const bytes = new Uint8Array(await origem.arrayBuffer());
  const tipo = final ? 'audio/ogg' : (blob.type || 'audio/webm').split(';')[0];
  const pedacos = partir(bytes);
  if (pedacos.length > MAX_PEDACOS) return null;   // 700 MB: não é uma entrevista
  const chave = 'aud/' + (await hash16(bytes));
  for (let n = 0; n < pedacos.length; n++) {
    const k = `${chave}-${n}`;
    const ja = await lerPedaco(k);
    if (!ja) await gravarPedaco({ k, bytes: pedacos[n].buffer.slice(pedacos[n].byteOffset, pedacos[n].byteOffset + pedacos[n].byteLength), mime: tipo, subido: false });
  }
  return { chave, partes: pedacos.length, duracao: Math.round((duracao || (amostras ? amostras.length / 16000 : 0)) * 10) / 10, tipo, segmentos: segmentos || [], tamanho: bytes.length };
}

// ---------------------------------------------------------------- subir (cifrado, em segundo plano, com nova tentativa)
let subindo = null;
let uiGlobal = null;   // { buscarLigacao }, posto por iniciarSubida
/** Sobe os pedaços que faltam. Nunca lança. Devolve { subidos, faltam, semChave?, semLigacao?, erro? }. */
export function subirPendentes(ui = uiGlobal) {
  if (subindo) return subindo;
  subindo = (async () => {
    const r = { subidos: 0, faltam: 0 };
    try {
      const pend = (await todosPedacos()).filter((p) => !p.subido);
      r.faltam = pend.length;
      if (!pend.length) return r;
      const chave = await A.lerChave();
      if (!chave) { r.semChave = true; return r; }
      const l = ui && await ui.buscarLigacao();
      if (!l) { r.semLigacao = true; return r; }
      for (const p of pend) {
        const cifrado = await cifrarBytes(chave, p.k, new Uint8Array(p.bytes));
        const res = await fetch(`${l.url}/dados/arquivo?chave=${p.k}`, { method: 'PUT', headers: { 'x-segredo': l.segredo, 'content-type': 'application/octet-stream' }, body: cifrado });
        if (!res.ok) { r.erro = `a nuvem respondeu ${res.status}`; break; }
        await gravarPedaco({ ...p, subido: true });
        r.subidos++; r.faltam--;
      }
    } catch (err) { r.erro = String((err && err.message) || err); }
    return r;
  })().finally(() => { subindo = null; });
  return subindo;
}
/** O recibo já está inteiro na nuvem? (null = não sei, não tem esse áudio neste celular) */
export async function estaNaNuvem(a) {
  let achou = 0;
  for (let n = 0; n < a.partes; n++) {
    const p = await lerPedaco(`${a.chave}-${n}`);
    if (p) { achou++; if (!p.subido) return false; }
  }
  return achou === 0 ? null : true;
}
let temporizador = null;
/** Tenta subir ao abrir, quando a tela volta e a cada minuto (como as fotos pendentes). */
export function iniciarSubida(ui) {
  uiGlobal = ui;
  if (temporizador) return;
  const tenta = () => { if (document.visibilityState === 'visible') subirPendentes(ui); };
  document.addEventListener('visibilitychange', tenta);
  temporizador = setInterval(tenta, 60_000);
  setTimeout(tenta, 4000);
}

// ---------------------------------------------------------------- ouvir
const baixando = new Map();
/** Os bytes de um pedaço: daqui, ou baixa da nuvem, decifra e guarda. */
async function pedacoDe(k, tipo, ui) {
  const local = await lerPedaco(k);
  if (local) return local.bytes;
  if (baixando.has(k)) return baixando.get(k);
  const tarefa = (async () => {
    const chave = await A.lerChave();
    const l = await ui.buscarLigacao();
    if (!chave) throw new Error('falta abrir a chave dos dados (Ajustes)');
    if (!l) throw new Error('sem ligação com a nuvem');
    const r = await fetch(`${l.url}/dados/arquivo?chave=${k}`, { headers: { 'x-segredo': l.segredo } });
    if (r.status === 404) throw new Error('o áudio ainda não chegou na nuvem');
    if (!r.ok) throw new Error(`a nuvem respondeu ${r.status}`);
    const claro = await decifrarBytes(chave, k, new Uint8Array(await r.arrayBuffer()));
    const bytes = claro.buffer.slice(claro.byteOffset, claro.byteOffset + claro.byteLength);
    await gravarPedaco({ k, bytes, mime: tipo, subido: true });
    return bytes;
  })().finally(() => baixando.delete(k));
  baixando.set(k, tarefa);
  return tarefa;
}
/** Um Blob com a gravação inteira, pronto para o <audio>. `aoProgresso(feitos, total)`. */
export async function blobDoAudio(a, ui, aoProgresso = () => {}) {
  const partes = [];
  for (let n = 0; n < a.partes; n++) { aoProgresso(n, a.partes); partes.push(await pedacoDe(`${a.chave}-${n}`, a.tipo, ui)); }
  aoProgresso(a.partes, a.partes);
  return new Blob(partes, { type: a.tipo || 'audio/ogg' });
}

// ---------------------------------------------------------------- tela: barra "Ouvir a gravação" + texto sincronizado
const VELOCIDADES = [1, 1.5, 2];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Monta o player dentro de `alvo` (um elemento). `audios` = lista de recibos. `rotulo(a, i)` dá o nome de cada um quando há vários.
 * Devolve { parar() } (pausa e solta o áudio ao fechar a tela).
 */
export function montarPlayer(alvo, audios, { ui, rotulo = (a, i) => `Gravação ${i + 1}`, reduzirMovimento = false, foto = null } = {}) {
  let atual = 0, url = null, segs = [], ativo = -1, rolouNaMao = 0, preparando = false, velocidade = 1;
  alvo.innerHTML = `<section class="aud" aria-label="Gravação original">
    <figure class="aud-destaque" hidden><img alt=""><figcaption></figcaption></figure>
    <div class="aud-marcos" hidden aria-label="Fotos citadas na gravação"></div>
    <div class="aud-barra">
      <button type="button" class="aud-play" data-a="play" aria-label="Ouvir a gravação"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="aud-i-play" d="M8 5.5v13l11-6.5z"/><path class="aud-i-pausa" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></button>
      <div class="aud-meio">
        <p class="aud-titulo">Ouvir a gravação</p>
        <input type="range" class="aud-prog" min="0" max="1000" value="0" step="1" aria-label="Posição na gravação">
        <p class="aud-tempos"><span class="aud-agora">0:00</span><span class="aud-total">0:00</span></p>
      </div>
      <button type="button" class="aud-vel" data-a="vel" aria-label="Velocidade">1x</button>
    </div>
    <p class="aud-estado" role="status" hidden></p>
    <div class="aud-escolha" hidden></div>
    <button type="button" class="aud-texto-b link" data-a="texto" aria-expanded="false">Acompanhar o texto da gravação</button>
    <div class="aud-texto" hidden></div>
    <audio preload="none"></audio>
  </section>`;
  const $a = (s) => alvo.querySelector(s);
  const audio = $a('audio'), prog = $a('.aud-prog'), play = $a('.aud-play'), estado = $a('.aud-estado'), texto = $a('.aud-texto');
  const dur = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (audios[atual].duracao || 0));
  const dizer = (t) => { estado.textContent = t || ''; estado.hidden = !t; };

  // ----- fotos abertas durante a fala (marcos): miniaturas presas no segundo do áudio, como os comentários do SoundCloud -----
  const marcosBox = $a('.aud-marcos'), destaque = $a('.aud-destaque');
  let marcos = [], marcoAtivo = -2;
  const montarMarcos = () => {
    marcos = (audios[atual].marcos || []).filter((m) => m && m.foto && m.seg >= 0).sort((a, b) => a.seg - b.seg);
    marcoAtivo = -2;
    marcosBox.hidden = destaque.hidden = !(marcos.length && foto);
    marcosBox.innerHTML = '';
    if (marcosBox.hidden) return;
    const d = dur() || Math.max(...marcos.map((m) => m.seg)) + 1;
    marcos.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aud-marco'; b.dataset.i = i;
      b.style.left = Math.min(100, (m.seg / d) * 100) + '%';
      b.setAttribute('aria-label', `Foto citada em ${tempo(m.seg)}: ouvir daqui`);
      b.innerHTML = '<img alt="">';
      foto(m.foto, b.querySelector('img'));
      b.onclick = async () => { if (!(await preparar())) return; audio.currentTime = m.seg; audio.play().catch(() => {}); };
      marcosBox.appendChild(b);
    });
    pintarMarcos(0);
  };
  const pintarMarcos = (t) => {
    if (!marcos.length || !foto) return;
    let i = -1;
    for (let k = 0; k < marcos.length; k++) if (marcos[k].seg <= t + 0.2) i = k;
    if (i === marcoAtivo) return;
    marcoAtivo = i;
    marcosBox.querySelectorAll('.aud-marco').forEach((b) => b.classList.toggle('agora', Number(b.dataset.i) === i));
    // antes do primeiro marco, o destaque mostra a primeira foto
    const m = marcos[Math.max(0, i)];
    foto(m.foto, destaque.querySelector('img'));
    destaque.querySelector('figcaption').textContent = i >= 0 ? `citada em ${tempo(m.seg)}` : `${marcos.length} ${marcos.length === 1 ? 'foto citada' : 'fotos citadas'} na fala`;
    destaque.classList.remove('troca'); void destaque.offsetWidth; destaque.classList.add('troca');
  };

  const pintarTempo = () => {
    const d = dur(), t = audio.currentTime || 0;
    pintarMarcos(t);
    $a('.aud-agora').textContent = tempo(t); $a('.aud-total').textContent = tempo(d);
    if (!arrastando) prog.value = d ? Math.round((t / d) * 1000) : 0;
    prog.style.setProperty('--p', (d ? (t / d) * 100 : 0) + '%');
  };
  let arrastando = false;
  prog.addEventListener('input', () => { arrastando = true; const d = dur(); $a('.aud-agora').textContent = tempo((prog.value / 1000) * d); prog.style.setProperty('--p', prog.value / 10 + '%'); });
  prog.addEventListener('change', async () => { arrastando = false; if (!(await preparar())) return; audio.currentTime = (prog.value / 1000) * dur(); pintarTempo(); marcar(true); });

  // ----- texto sincronizado -----
  const montarTexto = () => {
    const s = audios[atual].segmentos || [];
    segs = s;
    if (!s.length) { texto.innerHTML = '<p class="aud-vazio">Esta gravação não tem o texto com tempos.</p>'; return; }
    texto.innerHTML = paragrafos(s).map((p) => `<p class="aud-par${p.marca ? ' marca' : ''}">${p.itens.map((i) => `<span class="aud-seg" data-i="${i}" tabindex="0" role="button" aria-label="Ouvir a partir de ${tempo(s[i][0])}">${esc(s[i][2])}</span>`).join(' ')}</p>`).join('');
    ativo = -1;
  };
  const marcar = (rolar) => {
    if (texto.hidden || !segs.length) return;
    const i = segmentoDe(segs, (audio.currentTime || 0) + 0.05);
    if (i === ativo) return;
    const velho = texto.querySelector('.aud-seg.agora');
    if (velho) velho.classList.remove('agora');
    ativo = i;
    const el = i >= 0 ? texto.querySelector(`.aud-seg[data-i="${i}"]`) : null;
    if (!el) return;
    el.classList.add('agora');
    // a tela rola junto, a não ser que o JV esteja rolando com o dedo
    if ((rolar || !audio.paused) && Date.now() - rolouNaMao > 3500) el.scrollIntoView({ block: 'center', behavior: reduzirMovimento ? 'auto' : 'smooth' });
  };
  const aoRolar = () => { rolouNaMao = Date.now(); };
  addEventListener('wheel', aoRolar, { passive: true }); addEventListener('touchmove', aoRolar, { passive: true });
  texto.addEventListener('click', async (ev) => {
    const s = ev.target.closest('.aud-seg'); if (!s) return;
    if (!(await preparar())) return;
    audio.currentTime = segs[Number(s.dataset.i)][0]; rolouNaMao = 0; audio.play().catch(() => {}); marcar(false);
  });
  texto.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('aud-seg')) { ev.preventDefault(); ev.target.click(); } });
  $a('[data-a="texto"]').onclick = (ev) => {
    const abrir = texto.hidden;
    texto.hidden = !abrir; ev.currentTarget.setAttribute('aria-expanded', String(abrir));
    ev.currentTarget.textContent = abrir ? 'Esconder o texto da gravação' : 'Acompanhar o texto da gravação';
    if (abrir) { if (!texto.childElementCount) montarTexto(); ativo = -1; marcar(true); }
  };

  // ----- carregar, tocar -----
  async function preparar() {
    if (url) return true;
    if (preparando) return false;
    preparando = true;
    try {
      dizer('Preparando a gravação…');
      const a = audios[atual];
      const blob = await blobDoAudio(a, ui, (f, n) => { if (n > 1) dizer(`Baixando a gravação (${f} de ${n})…`); });
      url = URL.createObjectURL(blob);
      audio.src = url; audio.playbackRate = velocidade;
      await new Promise((ok) => { audio.onloadedmetadata = ok; audio.onerror = ok; setTimeout(ok, 4000); });
      dizer(audio.error ? 'Este celular não conseguiu abrir a gravação.' : '');
      pintarTempo();
      return !audio.error;
    } catch (err) {
      dizer('Não consegui carregar a gravação (' + String((err && err.message) || err) + ').');
      return false;
    } finally { preparando = false; }
  }
  play.onclick = async () => {
    if (!(await preparar())) return;
    if (audio.paused) audio.play().catch((e) => dizer('Não consegui tocar (' + e.message + ').')); else audio.pause();
  };
  audio.addEventListener('play', () => { play.classList.add('tocando'); play.setAttribute('aria-label', 'Pausar a gravação'); laco(); });
  audio.addEventListener('pause', () => { play.classList.remove('tocando'); play.setAttribute('aria-label', 'Ouvir a gravação'); pintarTempo(); });
  audio.addEventListener('ended', () => { play.classList.remove('tocando'); pintarTempo(); });
  audio.addEventListener('seeked', () => { pintarTempo(); marcar(true); });
  function laco() {
    if (audio.paused) return;
    pintarTempo(); marcar(false);
    setTimeout(laco, 250);
  }
  $a('[data-a="vel"]').onclick = (ev) => {
    velocidade = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    audio.playbackRate = velocidade;
    ev.currentTarget.textContent = String(velocidade).replace('.', ',') + 'x';
  };

  // ----- várias gravações na mesma entrevista -----
  const escolha = $a('.aud-escolha');
  if (audios.length > 1) {
    escolha.hidden = false;
    escolha.innerHTML = audios.map((a, i) => `<button type="button" class="aud-chip" data-i="${i}" aria-pressed="${i === 0}">${esc(rotulo(a, i))}</button>`).join('');
    escolha.onclick = (ev) => {
      const b = ev.target.closest('.aud-chip'); if (!b) return;
      const i = Number(b.dataset.i); if (i === atual) return;
      audio.pause(); if (url) { URL.revokeObjectURL(url); url = null; }
      audio.removeAttribute('src'); atual = i;
      escolha.querySelectorAll('.aud-chip').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.i) === i)));
      texto.innerHTML = ''; if (!texto.hidden) montarTexto();
      montarMarcos();
      pintarTempo(); dizer('');
    };
  }
  montarMarcos();
  audio.addEventListener('loadedmetadata', () => { if (marcos.length) montarMarcos(); });
  pintarTempo();
  estaNaNuvem(audios[0]).then((n) => { if (n === false) dizer('Esta gravação ainda não foi para a nuvem (só você a ouve aqui, por enquanto).'); }).catch(() => {});
  return {
    parar() { audio.pause(); removeEventListener('wheel', aoRolar); removeEventListener('touchmove', aoRolar); if (url) { URL.revokeObjectURL(url); url = null; } },
    // para os testes
    _audio: audio, _preparar: preparar,
  };
}
