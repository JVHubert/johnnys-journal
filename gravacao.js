// Gravação que não se perde. Script comum (sem import/export): o index.html carrega antes do app.js, que usa window.JJG.
//
// Por que existe (caso real, 31/10/2026): numa conversa de 17 min, o microfone ficou mudo toda vez que a tela
// apagou sozinha (tempo limite de 2 min) e só voltou quando a tela acendeu. A gravação seguiu, gravando silêncio;
// o Whisper preencheu esse silêncio com "E aí, E aí..." e o áudio foi descartado. Só 6 dos 17 minutos ficaram.
//
// O que este arquivo faz:
// 1. Pede para a tela ficar acesa enquanto grava e escurece a imagem depois de 1 min sem toque.
// 2. Guarda o áudio em pedaços de 5 s no celular (IndexedDB): se a página morrer, o que foi gravado fica.
// 3. Antes de transcrever, mede o som: tira os trechos mudos, marca no texto e corta áudio longo em partes.
// 4. Tira do texto as repetições que o Whisper inventa quando ouve silêncio.
(function (raiz) {
  const TAXA = 16000;          // o Whisper trabalha em 16 kHz
  const PASSO = 0.5;           // medir o som a cada meio segundo
  const MUDO_DB = -70;         // abaixo disso não é silêncio de sala: é o microfone sem sinal
  const MUDO_MIN = 10;         // segundos seguidos para contar como mudo
  const MARCA_MIN = 20;        // segundos seguidos para escrever a marca no texto
  const FATIA_MAX = 300;       // 5 min por parte: cabe nos limites da transcrição e do texto (8000 letras) da nuvem
  const FATIA_BYTES = 20 * 1024 * 1024;
  const ESCURECER_MS = 60000;
  const GUARDAR_DIAS = 30;

  const mmss = (s) => {
    const t = Math.max(0, Math.round(s));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const marcaMudo = (ini, fim) => `[microfone mudo de ${mmss(ini)} a ${mmss(fim)}]`;

  // ---------- contas (sem navegador; testadas em testes/gravacao.test.cjs) ----------

  /** Volume de cada passo, em dB. */
  function medirNiveis(amostras, taxa = TAXA, passo = PASSO) {
    const tam = Math.max(1, Math.round(taxa * passo));
    const n = Math.ceil(amostras.length / tam);
    const niveis = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let soma = 0, qtd = 0;
      const fim = Math.min(amostras.length, (i + 1) * tam);
      for (let k = i * tam; k < fim; k++) { soma += amostras[k] * amostras[k]; qtd++; }
      niveis[i] = 10 * Math.log10(soma / Math.max(qtd, 1) + 1e-12);
    }
    return niveis;
  }

  /** Trechos seguidos sem sinal: [{ ini, fim }] em segundos. */
  function trechosMudos(niveis, { passo = PASSO, limiteDb = MUDO_DB, minSeg = MUDO_MIN } = {}) {
    const lista = [];
    let comeco = -1;
    for (let i = 0; i <= niveis.length; i++) {
      const mudo = i < niveis.length && niveis[i] < limiteDb;
      if (mudo && comeco < 0) comeco = i;
      if (!mudo && comeco >= 0) {
        if ((i - comeco) * passo >= minSeg) lista.push({ ini: comeco * passo, fim: i * passo });
        comeco = -1;
      }
    }
    return lista;
  }

  /** O que sobra para transcrever, em partes de até maxSeg, cortando no ponto mais quieto do fim de cada parte. */
  function trechosDeFala(duracao, mudos, niveis, { passo = PASSO, maxSeg = FATIA_MAX, janela = 30 } = {}) {
    const blocos = [];
    let cursor = 0;
    for (const m of mudos) {
      if (m.ini > cursor) blocos.push({ ini: cursor, fim: m.ini });
      cursor = m.fim;
    }
    if (cursor < duracao) blocos.push({ ini: cursor, fim: duracao });
    const partes = [];
    for (const b of blocos) {
      let ini = b.ini;
      while (b.fim - ini > maxSeg) {
        let corte = ini + maxSeg, menor = Infinity;
        for (let t = ini + maxSeg - janela; t <= ini + maxSeg; t += passo) {
          const v = niveis[Math.floor(t / passo)];
          if (v !== undefined && v < menor) { menor = v; corte = t; }
        }
        partes.push({ ini, fim: corte });
        ini = corte;
      }
      partes.push({ ini, fim: b.fim });
    }
    return partes.filter((p) => p.fim - p.ini >= 1);
  }

  const limparPalavra = (p) => p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  /**
   * Whisper em silêncio repete uma frase curta ("E aí E aí E aí..."). Troca cada sequência por uma marca.
   * Frase de 2 a 4 palavras repetida 5 vezes ou mais; palavra sozinha, 8 vezes ou mais (fala de verdade repete pouco).
   */
  function limparRepeticoes(texto) {
    const MARCA = '[trecho sem fala clara]';
    const saida = String(texto).split('\n').map((linha) => {
      const pal = linha.split(/\s+/).filter(Boolean);
      const limpas = pal.map(limparPalavra);
      const fora = [];
      let i = 0;
      while (i < pal.length) {
        let achou = 0;
        for (let tam = 4; tam >= 1 && !achou; tam--) {
          if (i + tam > pal.length || !limpas[i]) continue;
          const igual = (k) => { for (let j = 0; j < tam; j++) if (limpas[k + j] !== limpas[i + j]) return false; return true; };
          let vezes = 1;
          while (i + (vezes + 1) * tam <= pal.length && igual(i + vezes * tam)) vezes++;
          if (vezes >= (tam === 1 ? 8 : 5)) achou = vezes * tam;
        }
        if (achou) { if (fora[fora.length - 1] !== MARCA) fora.push(MARCA); i += achou; }
        else {
          // resto colado numa repetição cortada ("E a") não vira texto entre duas marcas
          fora.push(pal[i]); i++;
        }
      }
      return fora.join(' ');
    });
    const junto = saida.join('\n');
    return { texto: junto, mudou: junto !== String(texto) };
  }

  /** Junta as partes na ordem do tempo, com as marcas de microfone mudo. */
  function montarTexto(partes, mudos) {
    const itens = [
      ...partes.map((p) => ({ t: p.ini, texto: (p.texto || '').trim(), fala: true })),
      ...mudos.filter((m) => m.fim - m.ini >= MARCA_MIN).map((m) => ({ t: m.ini, texto: marcaMudo(m.ini, m.fim), fala: false })),
    ].filter((x) => x.texto).sort((a, b) => a.t - b.t);
    let out = '';
    itens.forEach((x, i) => {
      if (i) out += x.fala && itens[i - 1].fala ? ' ' : '\n';
      out += x.texto;
    });
    return out;
  }

  /** WAV de 16 bits: é o que dá para cortar em qualquer ponto sem reprocessar o áudio original. */
  function wavDe(amostras, taxa = TAXA) {
    const buf = new ArrayBuffer(44 + amostras.length * 2);
    const v = new DataView(buf);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + amostras.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, amostras.length * 2, true);
    for (let i = 0; i < amostras.length; i++) {
      const s = Math.max(-1, Math.min(1, amostras[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  // ---------- transcrever: mede o som, tira o mudo, corta em partes ----------

  async function decodificar(blob) {
    const Ctx = raiz.OfflineAudioContext || raiz.webkitOfflineAudioContext;
    const ctx = new Ctx(1, 1, TAXA);
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const am = buf.getChannelData(0);
    if (buf.numberOfChannels === 1) return am;
    const mix = new Float32Array(am.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) mix[i] += d[i] / buf.numberOfChannels;
    }
    return mix;
  }

  const nomeDoAudio = (blob) => {
    if (blob.name) return blob.name;
    const t = blob.type || '';
    return /ogg/.test(t) ? 'audio.ogg' : /wav/.test(t) ? 'audio.wav' : /mp4|m4a|aac/.test(t) ? 'audio.m4a' : /mpeg|mp3/.test(t) ? 'audio.mp3' : 'audio.webm';
  };

  /**
   * enviar(pedaco, nome) -> Promise<texto>: quem transcreve (Groq ou a nuvem).
   * Devolve { texto, mudos, partes }. Se não der para medir o som, manda o áudio inteiro e só limpa o texto.
   */
  async function transcreverAudio(blob, enviar, { aoProgresso = () => {}, sempreFatiar = false } = {}) {
    let am = null;
    aoProgresso('medindo');
    try { am = await decodificar(blob); } catch (err) { am = null; }
    if (!am) {
      aoProgresso('enviando', 1, 1);
      return { texto: limparRepeticoes(await enviar(blob, nomeDoAudio(blob))).texto, mudos: [], partes: 1, semMedida: true };
    }
    const duracao = am.length / TAXA;
    const niveis = medirNiveis(am);
    const mudos = trechosMudos(niveis);
    if (!sempreFatiar && !mudos.length && duracao <= FATIA_MAX && blob.size <= FATIA_BYTES) {
      aoProgresso('enviando', 1, 1);
      return { texto: limparRepeticoes(await enviar(blob, nomeDoAudio(blob))).texto, mudos, partes: 1, duracao };
    }
    const partes = trechosDeFala(duracao, mudos, niveis);
    for (let i = 0; i < partes.length; i++) {
      aoProgresso('enviando', i + 1, partes.length);
      const p = partes[i];
      const fatia = am.subarray(Math.floor(p.ini * TAXA), Math.floor(p.fim * TAXA));
      const t = await enviar(new Blob([wavDe(fatia)], { type: 'audio/wav' }), 'trecho.wav');
      p.texto = limparRepeticoes(t || '').texto;
    }
    return { texto: montarTexto(partes, mudos), mudos: mudos.filter((m) => m.fim - m.ini >= MARCA_MIN), partes: partes.length, duracao };
  }

  // ---------- guardar no celular ----------

  let bancoP = null;
  function banco() {
    if (bancoP) return bancoP;
    bancoP = new Promise((ok, falha) => {
      const r = indexedDB.open('jj-gravacoes', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('gravacoes', { keyPath: 'id' });
        r.result.createObjectStore('pedacos', { keyPath: ['id', 'n'] });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    bancoP.catch(() => { bancoP = null; });
    return bancoP;
  }
  const pedido = (r) => new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); });
  async function loja(nome, modo = 'readonly') { return (await banco()).transaction(nome, modo).objectStore(nome); }
  async function gravarMeta(m) { return pedido((await loja('gravacoes', 'readwrite')).put(m)); }
  async function mudarMeta(id, mudanca) {
    const l = await loja('gravacoes', 'readwrite');
    const m = await pedido(l.get(id));
    if (m) await pedido(l.put({ ...m, ...mudanca }));
  }
  async function listar() {
    const lista = await pedido((await loja('gravacoes')).getAll());
    return lista.sort((a, b) => b.inicio - a.inicio);
  }
  const faixaDe = (id) => IDBKeyRange.bound([id, 0], [id, Infinity]);
  async function audioDe(id) {
    const m = await pedido((await loja('gravacoes')).get(id));
    const p = await pedido((await loja('pedacos')).getAll(faixaDe(id)));
    return new Blob(p.map((x) => x.blob), { type: (m && m.tipo) || 'audio/webm' });
  }
  async function apagar(id) {
    await pedido((await loja('pedacos', 'readwrite')).delete(faixaDe(id)));
    await pedido((await loja('gravacoes', 'readwrite')).delete(id));
  }

  /** Ao abrir o app: gravação que ficou como "gravando" foi interrompida; a transcrita velha sai. */
  async function arrumarAoAbrir() {
    const agora = Date.now();
    let interrompidas = 0;
    for (const m of await listar()) {
      if (m.estado === 'gravando') {
        const p = await pedido((await loja('pedacos')).count(faixaDe(m.id)));
        if (p) { await mudarMeta(m.id, { estado: 'interrompida', fim: m.ultimo || m.inicio }); interrompidas++; }
        else await apagar(m.id);
      } else if (m.estado === 'transcrita' && agora - (m.fim || m.inicio) > GUARDAR_DIAS * 864e5) await apagar(m.id);
    }
    return interrompidas;
  }

  // ---------- durante a gravação: tela acesa, aviso e tela escura ----------

  /**
   * Cria o gravador. Quem chama define rec.onstop, chama comecar() e, ao terminar, concluir('transcrita').
   * avisoEm: o elemento depois do qual a faixa de aviso aparece.
   */
  function gravar(fluxo, { mimeType, origem = 'Gravação', avisoEm = null } = {}) {
    const rec = new raiz.MediaRecorder(fluxo, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    const id = 'g' + Date.now().toString(36);
    const inicio = Date.now();
    const pedacos = [], buracos = [];
    let n = 0, trava = null, vivo = true, escondidoEm = 0, ultimoToque = Date.now(), semBanco = false;
    const seg = () => (Date.now() - inicio) / 1000;

    // ----- pedaços no celular -----
    rec.ondataavailable = (ev) => {
      if (!ev.data.size) return;
      pedacos.push(ev.data);
      const num = n++;
      loja('pedacos', 'readwrite').then((l) => pedido(l.put({ id, n: num, blob: ev.data })))
        .then(() => mudarMeta(id, { ultimo: Date.now() }))
        .catch(() => { semBanco = true; });
    };

    // ----- faixa de aviso -----
    const faixa = document.createElement('div');
    faixa.className = 'grav-faixa';
    faixa.setAttribute('role', 'status');
    faixa.innerHTML = '<span class="gf-txt"></span><button type="button" class="link gf-escurecer">Escurecer a tela</button>';
    const faixaTxt = faixa.querySelector('.gf-txt');
    const NORMAL = 'A tela fica acesa enquanto grava. Não bloqueie o celular: com a tela apagada, o microfone fica mudo.';
    faixaTxt.textContent = NORMAL;
    const alertar = (txt) => { faixa.classList.add('alerta'); faixaTxt.textContent = txt; };

    // ----- tela acesa -----
    async function pedirTela() {
      if (!vivo || trava || document.visibilityState !== 'visible') return;
      if (!navigator.wakeLock) { if (!buracos.length) alertar('Este navegador não deixa manter a tela acesa. Toque na tela de vez em quando: se ela apagar, o microfone fica mudo.'); return; }
      try {
        trava = await navigator.wakeLock.request('screen');
        trava.addEventListener('release', () => { trava = null; });
      } catch (err) {
        // o aviso de que a tela já apagou é mais importante: não troca por este
        if (!buracos.length) alertar('Não consegui manter a tela acesa. Toque nela de vez em quando: se apagar, o microfone fica mudo.');
      }
    }

    // ----- tela apagou mesmo assim: anota e avisa na volta -----
    const aoMudarTela = () => {
      if (!vivo) return;
      if (document.visibilityState === 'hidden') { escondidoEm = seg(); return; }
      if (escondidoEm && seg() - escondidoEm > 3) {
        buracos.push({ ini: escondidoEm, fim: seg() });
        alertar(`A tela apagou de ${mmss(escondidoEm)} a ${mmss(seg())} e o microfone pode não ter ouvido esse trecho. Vou marcar no texto. Não bloqueie de novo.`);
        if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
      }
      escondidoEm = 0;
      ultimoToque = Date.now();
      pedirTela();
    };
    document.addEventListener('visibilitychange', aoMudarTela);

    // ----- microfone tomado por outra coisa (ligação, outro app) -----
    const trilha = fluxo.getAudioTracks()[0];
    const aoMudo = () => alertar('Outra coisa pegou o microfone (uma ligação, outro app). A gravação segue, mas pode ficar sem som.');
    const aoVoltar = () => { if (vivo && !buracos.length) { faixa.classList.remove('alerta'); faixaTxt.textContent = NORMAL; } };
    if (trilha) { trilha.addEventListener('mute', aoMudo); trilha.addEventListener('unmute', aoVoltar); }

    // ----- tela escura: gasta quase nada e segue ligada -----
    let escuro = null, ctxEscuro = null, relogioEscuro = null, deriva = 0;
    const clarear = () => {
      if (!escuro) return;
      clearInterval(relogioEscuro);
      if (ctxEscuro) ctxEscuro.close().catch(() => {});
      ctxEscuro = null;
      escuro.remove(); escuro = null;
      ultimoToque = Date.now();
    };
    function escurecer() {
      if (escuro || !vivo) return;
      escuro = document.createElement('button');
      escuro.type = 'button';
      escuro.className = 'grav-escuro';
      escuro.setAttribute('aria-label', 'Voltar para a tela da gravação');
      escuro.innerHTML = '<span class="ge-miolo"><b class="ge-relogio"></b><i class="ge-linha"></i><span class="ge-msg"></span><small>Toque para voltar</small></span>';
      document.body.appendChild(escuro);
      escuro.onclick = clarear;
      const miolo = escuro.querySelector('.ge-miolo'), relogio = escuro.querySelector('.ge-relogio');
      const linha = escuro.querySelector('.ge-linha'), msg = escuro.querySelector('.ge-msg');
      const NORMAL_MSG = 'Gravando. A tela segue ligada, só escura, para o microfone continuar ouvindo.';
      msg.textContent = NORMAL_MSG;
      let an = null, buf = null, somEm = Date.now();
      try {
        ctxEscuro = new (raiz.AudioContext || raiz.webkitAudioContext)();
        an = ctxEscuro.createAnalyser(); an.fftSize = 1024;
        ctxEscuro.createMediaStreamSource(fluxo).connect(an);
        buf = new Float32Array(an.fftSize);
      } catch (err) { an = null; }
      const passo = () => {
        if (!escuro) return;
        requestAnimationFrame(passo);
        if (!an) return;
        an.getFloatTimeDomainData(buf);
        let soma = 0; for (const v of buf) soma += v * v;
        const nivel = Math.min(1, Math.sqrt(Math.sqrt(soma / buf.length)) * 4);
        linha.style.transform = `scaleX(${Math.max(0.04, nivel).toFixed(3)})`;
        if (nivel >= 0.12) somEm = Date.now();
        const mudo = Date.now() - somEm > 5000;
        msg.classList.toggle('alerta', mudo);
        msg.textContent = mudo ? 'Não estou ouvindo nada. Toque para conferir.' : NORMAL_MSG;
      };
      requestAnimationFrame(passo);
      const tique = () => {
        relogio.textContent = mmss(seg());
        // muda de lugar devagar para não marcar a tela
        if (++deriva % 30 === 0) miolo.style.transform = `translate(${Math.round(Math.random() * 40 - 20)}px, ${Math.round(Math.random() * 80 - 40)}px)`;
      };
      tique();
      relogioEscuro = setInterval(tique, 1000);
    }
    faixa.querySelector('.gf-escurecer').onclick = escurecer;
    const aoTocar = () => { ultimoToque = Date.now(); };
    document.addEventListener('pointerdown', aoTocar, true);
    const vigiaEscuro = setInterval(() => {
      if (!escuro && document.visibilityState === 'visible' && Date.now() - ultimoToque > ESCURECER_MS) escurecer();
    }, 2000);

    // ----- fim -----
    rec.addEventListener('stop', () => {
      vivo = false;
      clearInterval(vigiaEscuro);
      clarear();
      faixa.remove();
      document.removeEventListener('visibilitychange', aoMudarTela);
      document.removeEventListener('pointerdown', aoTocar, true);
      if (trilha) { trilha.removeEventListener('mute', aoMudo); trilha.removeEventListener('unmute', aoVoltar); }
      if (trava) { trava.release().catch(() => {}); trava = null; }
      mudarMeta(id, { estado: 'pronta', fim: Date.now(), buracos }).catch(() => {});
    });

    return {
      id, rec, pedacos, buracos,
      blob: () => new Blob(pedacos, { type: rec.mimeType || mimeType || 'audio/webm' }),
      comecar() {
        gravarMeta({ id, inicio, origem, tipo: rec.mimeType || mimeType || 'audio/webm', estado: 'gravando' }).catch(() => { semBanco = true; });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        if (avisoEm) avisoEm.after(faixa);
        rec.start(5000);
        pedirTela();
      },
      // quanto pedido, troca o estado; a gravação transcrita some sozinha depois de 30 dias
      concluir(estado) { return mudarMeta(id, { estado, fim: Date.now() }).catch(() => {}); },
      // Cancelar: até 1 min some; mais que isso fica em Ajustes, porque pode ter sido sem querer
      cancelada() { return seg() < 60 ? apagar(id).catch(() => {}) : Promise.resolve(); },
      get semBanco() { return semBanco; },
    };
  }

  raiz.JJG = {
    // contas
    medirNiveis, trechosMudos, trechosDeFala, limparRepeticoes, montarTexto, wavDe, mmss, marcaMudo,
    // transcrever e guardar
    transcreverAudio, listar, audioDe, apagar, arrumarAoAbrir, gravar,
    marcar: (id, estado) => mudarMeta(id, { estado }),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.JJG;
})(typeof window !== 'undefined' ? window : globalThis);
