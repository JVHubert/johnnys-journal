// node testes/transcricao-acento.test.cjs — texto sem acento (caso Buenos Aires), nova tentativa com o modelo completo e segmentos com tempo.
const assert = require('node:assert');
const JJG = require('../gravacao.js');

const bom = 'Fomos para Buenos Aires há três dias e não paramos mais. A cidade é enorme, você anda muito, e a comida é ótima. Voltamos cansados, mas felizes, porque a viagem foi inesquecível. '.repeat(3);
const ruim = 'Fomos para Buenos Aires ha tr dias e nao paramos mais. A cidade e enorme, voc anda muito, e a comida e otima. Voltamos cansados, mas felizes, porque a viagem foi inesquecivel. '.repeat(3);

// reconhece o texto sem acento e deixa o bom em paz
assert.strictEqual(JJG.pareceSemAcento(ruim), true);
assert.strictEqual(JJG.pareceSemAcento(bom), false);
assert.strictEqual(JJG.pareceSemAcento(''), false);
assert.strictEqual(JJG.pareceSemAcento('oi, tudo bem?'), false);          // curto e sem acento: não é prova
assert.strictEqual(JJG.pareceSemAcento('ele disse l e n e s e tr e voc e ent pois ent nao sei bem como foi aquilo tudo naquele dia e depois fomos embora para casa'), true);   // palavras soltas
assert.strictEqual(JJG.pareceSemAcento('Eu li o livro e depois fui ao mercado comprar pão e leite.'), false);

(async () => {
  // texto ruim no turbo: refaz com o completo e fica com o bom
  {
    const chamadas = [];
    const r = await JJG.transcreverGroq(async (modelo) => {
      chamadas.push(modelo);
      return modelo === 'whisper-large-v3'
        ? { text: bom, segments: [{ start: 0, end: 4.5, text: ' Fomos para Buenos Aires.' }, { start: 4.5, end: 9, text: ' A cidade é enorme.' }] }
        : { text: ruim, segments: [] };
    });
    assert.deepStrictEqual(chamadas, ['whisper-large-v3-turbo', 'whisper-large-v3']);
    assert.strictEqual(r.texto, bom.trim());
    assert.strictEqual(r.modelo, 'whisper-large-v3');
    assert.strictEqual(r.refeito, true);
    assert.deepStrictEqual(r.segmentos, [{ start: 0, end: 4.5, text: 'Fomos para Buenos Aires.' }, { start: 4.5, end: 9, text: 'A cidade é enorme.' }]);
  }
  // texto bom: uma chamada só
  {
    const chamadas = [];
    const r = await JJG.transcreverGroq(async (m) => { chamadas.push(m); return { text: bom }; });
    assert.deepStrictEqual(chamadas, ['whisper-large-v3-turbo']);
    assert.strictEqual(r.refeito, false);
  }
  // o completo também vem ruim: fica a melhor (não perde nada)
  {
    const r = await JJG.transcreverGroq(async () => ({ text: ruim }));
    assert.strictEqual(r.texto, ruim.trim());
  }
  // o completo falha (limite): fica o primeiro, sem erro
  {
    const r = await JJG.transcreverGroq(async (m) => { if (m === 'whisper-large-v3') throw new Error('limite'); return { text: ruim }; });
    assert.strictEqual(r.texto, ruim.trim());
  }

  // segmentos com deslocamento de cada parte + marca de microfone mudo
  {
    const partes = [
      { ini: 0, texto: 'a b', segmentos: [{ start: 0, end: 3, text: 'a' }, { start: 3, end: 6.5, text: 'b' }] },
      { ini: 600, texto: 'c', segmentos: [{ start: 1.25, end: 5, text: 'c' }] },
    ];
    const mudos = [{ ini: 300, fim: 600 }, { ini: 700, fim: 705 }];   // o segundo é curto: não vira marca
    assert.deepStrictEqual(JJG.montarSegmentos(partes, mudos, 700), [
      [0, 3, 'a'], [3, 6.5, 'b'],
      [300, 600, '[microfone mudo de 05:00 a 10:00]'],
      [601.25, 605, 'c'],
    ]);
  }
  // parte sem segmentos (resposta só em texto): um segmento até o início da próxima
  {
    const partes = [{ ini: 0, texto: 'um', segmentos: [] }, { ini: 100, texto: 'dois', segmentos: [] }];
    assert.deepStrictEqual(JJG.montarSegmentos(partes, [], 150), [[0, 100, 'um'], [100, 150, 'dois']]);
  }

  console.log('transcricao-acento: ok');
})().catch((e) => { console.error(e); process.exit(1); });
