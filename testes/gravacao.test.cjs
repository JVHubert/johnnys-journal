// node testes/gravacao.test.cjs — contas da gravação: medir o som, achar o mudo, cortar em partes e limpar o texto.
const assert = require('node:assert');
const JJG = require('../gravacao.js');

const TAXA = 16000;
const ruido = (seg, amp = 0.05) => Float32Array.from({ length: Math.round(seg * TAXA) }, () => (Math.random() * 2 - 1) * amp);
const zeros = (seg) => new Float32Array(Math.round(seg * TAXA));
const juntar = (...p) => { const a = new Float32Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { a.set(x, i); i += x.length; } return a; };

// o caso de Pipa: som, mudo, som, mudo
{
  const am = juntar(ruido(248), zeros(436), ruido(124), zeros(236));
  const n = JJG.medirNiveis(am);
  const m = JJG.trechosMudos(n);
  assert.deepStrictEqual(m, [{ ini: 248, fim: 684 }, { ini: 808, fim: 1044 }]);
  const partes = JJG.trechosDeFala(1044, m, n);
  assert.strictEqual(partes[0].ini, 0); assert.strictEqual(partes[0].fim, 248);
  assert.strictEqual(partes[1].ini, 684); assert.strictEqual(partes[1].fim, 808);
  assert.strictEqual(partes.length, 2);
  partes[0].texto = 'primeira parte'; partes[1].texto = 'segunda parte';
  assert.strictEqual(JJG.montarTexto(partes, m),
    'primeira parte\n[microfone mudo de 04:08 a 11:24]\nsegunda parte\n[microfone mudo de 13:28 a 17:24]');
}

// pausa curta não conta como mudo; barulho baixo de sala também não
{
  assert.deepStrictEqual(JJG.trechosMudos(JJG.medirNiveis(juntar(ruido(30), zeros(8), ruido(30)))), []);
  assert.deepStrictEqual(JJG.trechosMudos(JJG.medirNiveis(ruido(60, 0.002))), []);
}

// mudo curto sai do áudio, mas não vira marca no texto
{
  const m = [{ ini: 10, fim: 22 }];
  assert.strictEqual(JJG.montarTexto([{ ini: 0, texto: 'a' }, { ini: 22, texto: 'b' }], m), 'a b');
}

// áudio longo sem mudo: partes de até 5 min, sem perder nem repetir nada
{
  const am = ruido(1000);
  am.fill(0, 285 * TAXA, 286 * TAXA);   // ponto quieto: o corte deve cair nele
  const n = JJG.medirNiveis(am);
  const partes = JJG.trechosDeFala(1000, JJG.trechosMudos(n), n);
  assert.ok(partes.every((p) => p.fim - p.ini <= 300));
  assert.strictEqual(partes[0].ini, 0);
  assert.strictEqual(partes[partes.length - 1].fim, 1000);
  partes.slice(1).forEach((p, i) => assert.strictEqual(p.ini, partes[i].fim));
  assert.ok(partes[0].fim >= 285 && partes[0].fim <= 286, 'cortou em ' + partes[0].fim);
}

// tudo mudo: nada para transcrever, só a marca
{
  const am = zeros(120);
  const n = JJG.medirNiveis(am);
  const m = JJG.trechosMudos(n);
  assert.deepStrictEqual(JJG.trechosDeFala(120, m, n), []);
  assert.strictEqual(JJG.montarTexto([], m), '[microfone mudo de 00:00 a 02:00]');
}

// repetições inventadas pelo Whisper: o texto real de Pipa, com a falha "E a" no meio
{
  const r = JJG.limparRepeticoes('coisas importantes para mim. E aí E aí E aí E aí E aí E aí E aí E aí E a E aí E aí E aí E aí E aí E aí, eu quero saber.');
  assert.strictEqual(r.texto.includes('E aí E aí'), false);
  assert.ok(r.texto.startsWith('coisas importantes para mim. [trecho sem fala clara]'), r.texto);
  assert.ok(r.texto.endsWith('eu quero saber.'), r.texto);
  assert.strictEqual(r.mudou, true);
}

// fala de verdade fica intacta, com quebras de linha e repetições curtas
{
  const t = 'Mano, mano, mano, foi muito doido.\nNão, não, não, não sei.\n\nComo esquecer, como esquecer.';
  assert.deepStrictEqual(JJG.limparRepeticoes(t), { texto: t, mudou: false });
}

// WAV: cabeçalho certo e amostras no tamanho certo
{
  const w = JJG.wavDe(Float32Array.from([0, 1, -1]));
  const v = new DataView(w);
  assert.strictEqual(w.byteLength, 44 + 6);
  assert.strictEqual(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), 'RIFF');
  assert.strictEqual(v.getUint32(24, true), 16000);
  assert.strictEqual(v.getInt16(46, true), 32767);
  assert.strictEqual(v.getInt16(48, true), -32768);
}

console.log('gravacao: ok');
