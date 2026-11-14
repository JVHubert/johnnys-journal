// Áudio da entrevista em arquivo pequeno: Ogg Opus (o <audio> de qualquer navegador toca). Script comum (sem import/export):
// o index.html carrega antes do app.js, que usa window.JJOgg. No Node, exporta para os testes.
//
// Por que existe (14/11/2026): o JV quer ouvir de novo a gravação original, com o texto andando junto.
// O áudio já foi decodificado em 16 kHz mono (gravacao.js) para transcrever; aqui ele vira Opus de ~24 kbps
// (33 min ≈ 6 MB) com o AudioEncoder do navegador e é embrulhado num arquivo Ogg.
//
// Formato (RFC 3533 e RFC 7845): página 1 = OpusHead, página 2 = OpusTags, depois páginas de áudio.
// O "granule" de cada página conta amostras a 48 kHz (sempre, qualquer que seja a taxa de entrada), somando o pré-corte
// (pre-skip). Cada página leva um CRC-32 próprio (polinômio 0x04C11DB7, sem inversão de bits).
(function (raiz) {
  const TAXA_OGG = 48000;
  const PRE_SKIP_PADRAO = 312;      // atraso do codificador libopus, em amostras de 48 kHz
  const PACOTES_POR_PAGINA = 50;    // ~1 s de áudio por página (pacotes de 20 ms)

  // ---------- CRC do Ogg ----------
  const TABELA = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let k = 0; k < 8; k++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
      t[i] = r >>> 0;
    }
    return t;
  })();
  function crcOgg(u8) {
    let c = 0;
    for (let i = 0; i < u8.length; i++) c = ((c << 8) ^ TABELA[((c >>> 24) ^ u8[i]) & 0xff]) >>> 0;
    return c >>> 0;
  }

  const texto = (s) => Uint8Array.from(String(s), (ch) => ch.charCodeAt(0) & 0xff);
  const utf8 = (s) => new TextEncoder().encode(s);

  function cabecaOpus({ canais = 1, preSkip = PRE_SKIP_PADRAO, taxaEntrada = 16000 } = {}) {
    const b = new Uint8Array(19), v = new DataView(b.buffer);
    b.set(texto('OpusHead'), 0); b[8] = 1; b[9] = canais;
    v.setUint16(10, preSkip, true); v.setUint32(12, taxaEntrada, true); v.setInt16(16, 0, true); b[18] = 0;
    return b;
  }
  function tagsOpus(fabricante = 'Journal do JV') {
    const f = utf8(fabricante);
    const b = new Uint8Array(8 + 4 + f.length + 4), v = new DataView(b.buffer);
    b.set(texto('OpusTags'), 0); v.setUint32(8, f.length, true); b.set(f, 12); v.setUint32(12 + f.length, 0, true);
    return b;
  }

  /** Uma página Ogg com os pacotes inteiros (nenhum atravessa a página). tipo: bits 0x02 início, 0x04 fim. */
  function pagina({ tipo = 0, granule = 0, serial, seq, pacotes }) {
    const lacing = [];
    for (const p of pacotes) {
      let n = p.length;
      while (n >= 255) { lacing.push(255); n -= 255; }
      lacing.push(n);
    }
    if (lacing.length > 255) throw new Error('página com segmentos demais');
    const corpo = pacotes.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(27 + lacing.length + corpo), v = new DataView(out.buffer);
    out.set(texto('OggS'), 0); out[4] = 0; out[5] = tipo;
    v.setUint32(6, granule % 4294967296, true); v.setUint32(10, Math.floor(granule / 4294967296), true);
    v.setUint32(14, serial >>> 0, true); v.setUint32(18, seq >>> 0, true); v.setUint32(22, 0, true);
    out[26] = lacing.length; out.set(lacing, 27);
    let o = 27 + lacing.length;
    for (const p of pacotes) { out.set(p, o); o += p.length; }
    v.setUint32(22, crcOgg(out), true);
    return out;
  }

  /**
   * pacotes: [{ dados: Uint8Array, amostras48k: n }] na ordem. Devolve o arquivo .ogg (Uint8Array).
   * totalAmostrasEntrada: quantas amostras (na taxa de entrada) o áudio tinha de verdade; o último pacote costuma
   * levar um pouco de silêncio de enchimento, e com isso o fim é cortado no ponto certo (a duração bate).
   */
  function montarOggOpus(pacotes, { taxaEntrada = 16000, preSkip = PRE_SKIP_PADRAO, canais = 1, totalAmostrasEntrada = null, serial = 0x4a4a4f31 } = {}) {
    const partes = [];
    let seq = 0;
    partes.push(pagina({ tipo: 0x02, granule: 0, serial, seq: seq++, pacotes: [cabecaOpus({ canais, preSkip, taxaEntrada })] }));
    partes.push(pagina({ tipo: 0, granule: 0, serial, seq: seq++, pacotes: [tagsOpus()] }));
    let soma = 0;
    const soma48 = pacotes.reduce((s, p) => s + p.amostras48k, 0);
    const alvo = totalAmostrasEntrada == null ? soma48 : Math.min(soma48, Math.round(totalAmostrasEntrada * TAXA_OGG / taxaEntrada));
    // Grupos de até 50 pacotes e no máximo 255 segmentos por página (um pacote de 1275 bytes usa 6 segmentos).
    const grupos = [];
    let grupo = [], segmentos = 0;
    for (const p of pacotes) {
      const seg = Math.floor(p.dados.length / 255) + 1;
      if (grupo.length && (grupo.length >= PACOTES_POR_PAGINA || segmentos + seg > 255)) { grupos.push(grupo); grupo = []; segmentos = 0; }
      grupo.push(p); segmentos += seg;
    }
    if (grupo.length) grupos.push(grupo);
    grupos.forEach((g, i) => {
      for (const p of g) soma += p.amostras48k;
      const ultima = i === grupos.length - 1;
      partes.push(pagina({ tipo: ultima ? 0x04 : 0, granule: preSkip + (ultima ? alvo : soma), serial, seq: seq++, pacotes: g.map((p) => p.dados) }));
    });
    if (!pacotes.length) partes.push(pagina({ tipo: 0x04, granule: preSkip, serial, seq: seq++, pacotes: [] }));
    const total = partes.reduce((s, p) => s + p.length, 0);
    const saida = new Uint8Array(total);
    let o = 0;
    for (const p of partes) { saida.set(p, o); o += p.length; }
    return saida;
  }

  /** Lê um arquivo Ogg Opus (para conferir): { paginas: [{ tipo, granule, serial, seq, crcOk, pacotes }], duracao, preSkip, taxaEntrada, canais }. */
  function lerOggOpus(u8) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const paginas = [];
    let o = 0;
    while (o + 27 <= u8.length) {
      if (String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) !== 'OggS') throw new Error('falta OggS em ' + o);
      const n = u8[o + 26];
      let corpo = 0;
      for (let i = 0; i < n; i++) corpo += u8[o + 27 + i];
      const tam = 27 + n + corpo;
      const crc = v.getUint32(o + 22, true);
      const copia = u8.slice(o, o + tam);
      new DataView(copia.buffer).setUint32(22, 0, true);
      const pacotes = [];
      let atual = 0, pedaco = o + 27 + n;
      for (let i = 0; i < n; i++) {
        atual += u8[o + 27 + i];
        if (u8[o + 27 + i] < 255) { pacotes.push(u8.slice(pedaco, pedaco + atual)); pedaco += atual; atual = 0; }
      }
      paginas.push({
        tipo: u8[o + 5], granule: v.getUint32(o + 6, true) + v.getUint32(o + 10, true) * 4294967296, serial: v.getUint32(o + 14, true),
        seq: v.getUint32(o + 18, true), crcOk: crcOgg(copia) === crc, pacotes,
      });
      o += tam;
    }
    const cab = paginas[0] && paginas[0].pacotes[0];
    if (!cab || String.fromCharCode(...cab.slice(0, 8)) !== 'OpusHead') throw new Error('não é Ogg Opus');
    const cv = new DataView(cab.buffer, cab.byteOffset, cab.byteLength);
    const preSkip = cv.getUint16(10, true);
    const ultimo = paginas[paginas.length - 1];
    return { paginas, preSkip, taxaEntrada: cv.getUint32(12, true), canais: cab[9], duracao: Math.max(0, ultimo.granule - preSkip) / TAXA_OGG };
  }

  // ---------- codificar no navegador (WebCodecs) ----------
  /**
   * amostras: Float32Array mono. Devolve um Blob audio/ogg, ou null se o navegador não tem AudioEncoder com Opus
   * (aí quem chamou guarda o arquivo original).
   */
  async function codificarOpus(amostras, { taxa = 16000, bitrate = 24000, aoProgresso = () => {} } = {}) {
    if (!raiz.AudioEncoder || !raiz.AudioData) return null;
    const config = { codec: 'opus', sampleRate: taxa, numberOfChannels: 1, bitrate };
    try { const sup = await raiz.AudioEncoder.isConfigSupported(config); if (!sup.supported) return null; } catch (err) { return null; }
    const pacotes = [];
    let descricao = null, falha = null;
    const enc = new raiz.AudioEncoder({
      output: (chunk, meta) => {
        const dados = new Uint8Array(chunk.byteLength); chunk.copyTo(dados);
        pacotes.push({ dados, amostras48k: Math.round((chunk.duration || 20000) * TAXA_OGG / 1e6) });
        if (!descricao && meta && meta.decoderConfig && meta.decoderConfig.description) descricao = new Uint8Array(meta.decoderConfig.description.buffer || meta.decoderConfig.description);
      },
      error: (e) => { falha = e; },
    });
    enc.configure(config);
    const BLOCO = taxa * 10;   // 10 s por vez
    for (let i = 0; i < amostras.length && !falha; i += BLOCO) {
      const fatia = amostras.subarray(i, Math.min(amostras.length, i + BLOCO));
      const ad = new raiz.AudioData({ format: 'f32', sampleRate: taxa, numberOfFrames: fatia.length, numberOfChannels: 1, timestamp: Math.round(i / taxa * 1e6), data: fatia });
      enc.encode(ad); ad.close();
      while (enc.encodeQueueSize > 8 && !falha) await new Promise((ok) => setTimeout(ok, 0));
      aoProgresso(Math.min(1, (i + BLOCO) / amostras.length));
    }
    if (!falha) await enc.flush();
    try { enc.close(); } catch (err) { /* já fechou */ }
    if (falha || !pacotes.length) return null;
    // pré-corte que o próprio codificador declarou (OpusHead), se veio; senão o padrão do libopus
    let preSkip = PRE_SKIP_PADRAO;
    if (descricao && descricao.length >= 19 && String.fromCharCode(...descricao.slice(0, 8)) === 'OpusHead') preSkip = new DataView(descricao.buffer, descricao.byteOffset).getUint16(10, true);
    const arquivo = montarOggOpus(pacotes, { taxaEntrada: taxa, preSkip, totalAmostrasEntrada: amostras.length });
    return new Blob([arquivo], { type: 'audio/ogg' });
  }

  raiz.JJOgg = { crcOgg, cabecaOpus, tagsOpus, pagina, montarOggOpus, lerOggOpus, codificarOpus };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.JJOgg;
})(typeof window !== 'undefined' ? window : globalThis);
