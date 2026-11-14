// node testes/ogg-opus.test.cjs — o arquivo Ogg Opus: cabeçalhos, CRC das páginas, divisão em páginas e duração.
// (Que o navegador toca de verdade e que o AudioEncoder funciona: testes/audio-tela.test.cjs.)
const assert = require('node:assert');
const J = require('../ogg-opus.js');

// CRC: confere a tabela contra a conta bit a bit (polinômio 0x04C11DB7, sem inversão, começando em 0)
function crcLento(u8) {
  let c = 0;
  for (const b of u8) {
    c ^= b << 24;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) : (c << 1);
    c >>>= 0;
  }
  return c >>> 0;
}
for (const t of ['', 'a', '123456789', 'OggS\0\2\0\0\0\0\0\0\0\0']) assert.strictEqual(J.crcOgg(Uint8Array.from(Buffer.from(t, 'latin1'))), crcLento(Buffer.from(t, 'latin1')));
const aleatorio = Uint8Array.from({ length: 5000 }, (_, i) => (i * 131 + 7) & 255);
assert.strictEqual(J.crcOgg(aleatorio), crcLento(aleatorio));

const pacote = (n, f) => ({ dados: Uint8Array.from({ length: n }, (_, i) => (i + f) & 255), amostras48k: 960 });

// cabeçalhos
{
  const cab = J.cabecaOpus({ preSkip: 312, taxaEntrada: 16000 });
  assert.strictEqual(Buffer.from(cab.slice(0, 8)).toString(), 'OpusHead');
  assert.strictEqual(cab.length, 19);
  assert.strictEqual(cab[8], 1);                                 // versão
  assert.strictEqual(cab[9], 1);                                 // mono
  assert.strictEqual(new DataView(cab.buffer).getUint16(10, true), 312);
  assert.strictEqual(new DataView(cab.buffer).getUint32(12, true), 16000);
  const tags = J.tagsOpus('x');
  assert.strictEqual(Buffer.from(tags.slice(0, 8)).toString(), 'OpusTags');
  assert.strictEqual(tags.length, 8 + 4 + 1 + 4);
}

// arquivo pequeno: 3 páginas (cabeça, tags, áudio), CRC certo, início e fim marcados
{
  const pacotes = Array.from({ length: 10 }, (_, i) => pacote(60 + i, i));
  const ogg = J.montarOggOpus(pacotes, { taxaEntrada: 16000, preSkip: 312 });
  const r = J.lerOggOpus(ogg);
  assert.strictEqual(r.paginas.length, 3);
  assert.ok(r.paginas.every((p) => p.crcOk), 'todas as páginas com CRC certo');
  assert.deepStrictEqual(r.paginas.map((p) => p.tipo), [0x02, 0, 0x04]);
  assert.deepStrictEqual(r.paginas.map((p) => p.seq), [0, 1, 2]);
  assert.strictEqual(new Set(r.paginas.map((p) => p.serial)).size, 1);
  assert.strictEqual(r.paginas[0].granule, 0);
  assert.strictEqual(r.paginas[2].granule, 312 + 9600);
  assert.strictEqual(r.preSkip, 312); assert.strictEqual(r.taxaEntrada, 16000); assert.strictEqual(r.canais, 1);
  assert.strictEqual(r.duracao, 0.2);                            // 10 pacotes de 20 ms
  assert.deepStrictEqual(r.paginas[2].pacotes.map((p) => p.length), pacotes.map((p) => p.dados.length));
  assert.deepStrictEqual(r.paginas[2].pacotes[3], pacotes[3].dados);
}

// o fim é cortado no ponto certo: 1,005 s de áudio de verdade em pacotes que somam 1,02 s
{
  const pacotes = Array.from({ length: 51 }, (_, i) => pacote(50, i));
  const ogg = J.montarOggOpus(pacotes, { taxaEntrada: 16000, totalAmostrasEntrada: 16080 });
  assert.strictEqual(J.lerOggOpus(ogg).duracao, 1.005);
  // pedir mais do que existe não passa do que existe
  assert.strictEqual(J.lerOggOpus(J.montarOggOpus(pacotes, { totalAmostrasEntrada: 999999 })).duracao, 1.02);
}

// áudio longo (33 min): várias páginas de até 50 pacotes, granule crescente, duração certa
{
  const n = 33 * 60 * 50;
  const pacotes = Array.from({ length: n }, (_, i) => pacote(55 + (i % 11), i));
  const ogg = J.montarOggOpus(pacotes, { taxaEntrada: 16000, totalAmostrasEntrada: 33 * 60 * 16000 });
  const r = J.lerOggOpus(ogg);
  assert.strictEqual(r.paginas.length, 2 + Math.ceil(n / 50));
  assert.ok(r.paginas.every((p) => p.crcOk));
  assert.strictEqual(r.duracao, 33 * 60);
  for (let i = 3; i < r.paginas.length; i++) assert.ok(r.paginas[i].granule > r.paginas[i - 1].granule);
  assert.strictEqual(r.paginas.reduce((s, p, i) => s + (i >= 2 ? p.pacotes.length : 0), 0), n);
  // 24 kbps = ~60 bytes por pacote de 20 ms (mais ~1,7% de cabeçalhos de página): 33 min cabem em menos de 7 MB
  assert.ok(ogg.length < 7 * 1024 * 1024, 'tamanho: ' + ogg.length);
}

// pacotes de 255 bytes exatos e maiores (precisam de segmento zero de fechamento) voltam inteiros
{
  const pacotes = [pacote(255, 1), pacote(510, 2), pacote(1275, 3), pacote(1, 4), pacote(254, 5)];
  const r = J.lerOggOpus(J.montarOggOpus(pacotes, {}));
  assert.deepStrictEqual(r.paginas[2].pacotes.map((p) => p.length), [255, 510, 1275, 1, 254]);
  assert.deepStrictEqual(r.paginas[2].pacotes[2], pacotes[2].dados);
}

// pacotes grandes: a página nunca passa de 255 segmentos
{
  const pacotes = Array.from({ length: 200 }, (_, i) => pacote(1275, i));
  const r = J.lerOggOpus(J.montarOggOpus(pacotes, {}));
  assert.ok(r.paginas.length > 5);
  assert.ok(r.paginas.every((p) => p.crcOk));
  assert.strictEqual(r.paginas.reduce((s, p, i) => s + (i >= 2 ? p.pacotes.length : 0), 0), 200);
}

// um byte mexido estraga o CRC (o navegador recusaria a página)
{
  const ogg = J.montarOggOpus([pacote(80, 1), pacote(80, 2)], {});
  ogg[ogg.length - 5] ^= 1;
  assert.strictEqual(J.lerOggOpus(ogg).paginas.pop().crcOk, false);
}

// sem pacotes: ainda é um arquivo válido (vazio)
{
  const r = J.lerOggOpus(J.montarOggOpus([], {}));
  assert.strictEqual(r.duracao, 0);
}

console.log('ogg-opus: ok');
