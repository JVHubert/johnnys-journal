// Junta o que está no celular com o que está no GitHub (dados.json). Arquivo de script comum (sem
// import/export): o index.html carrega antes do app.js, que usa window.JJ. No fim, exporta para os testes no Node.
//
// Regra dos dias (desde a journal-v25): cada campo do dia tem o seu carimbo em `tc` ("h.<id>" para cada
// hábito, "agua", "pm3", "tweet", "entrevista", "ilustracao"…). Em cada campo vence o carimbo mais novo,
// então marcar um hábito no PC não apaga uma entrevista que o celular ainda não tinha enviado.
// Dia antigo sem `tc`: o campo que existe vale o carimbo do dia (t); o campo que não existe vale 0.
// Entrevista com respostas nunca é trocada por uma vazia ou sumida, a não ser que a vazia diga
// `movidaPara` (o JV mudou a entrevista de dia de propósito, desde a 2.32.0) ou `apagada` (o JV apagou, desde a 2.40.0).
(function (raiz) {
  const FIXAS = ['t', 'tc'];

  const ler = (d, campo) => {
    if (!d) return undefined;
    if (campo.startsWith('h.')) return d.h ? d.h[campo.slice(2)] : undefined;
    return d[campo];
  };

  function carimbo(d, campo) {
    if (!d) return 0;
    if (d.tc && typeof d.tc[campo] === 'number') return d.tc[campo];
    return ler(d, campo) !== undefined ? (d.t || 0) : 0;
  }

  function camposDoDia(d) {
    const lista = new Set();
    if (!d) return lista;
    for (const k of Object.keys(d)) {
      if (FIXAS.includes(k)) continue;
      if (k === 'h') Object.keys(d.h || {}).forEach((hid) => lista.add('h.' + hid));
      else lista.add(k);
    }
    Object.keys(d.tc || {}).forEach((k) => lista.add(k)); // campo apagado que deixou carimbo
    return lista;
  }

  const temConteudo = (ent) => !!(ent && Array.isArray(ent.respostas) && ent.respostas.some((x) => x && String(x).trim()));

  /** Junta um dia: `a` é o do celular, `b` o do GitHub. */
  function juntarDia(a, b) {
    if (!a) return b;
    if (!b) return a;
    const r = { h: {}, tc: {} };
    const campos = new Set([...camposDoDia(a), ...camposDoDia(b)]);
    for (const c of campos) {
      const ca = carimbo(a, c), cb = carimbo(b, c);
      let vence = ca >= cb ? a : b;
      if (c === 'entrevista') {
        const outro = vence === a ? b : a;
        const v = ler(vence, c);
        if (!temConteudo(v) && !(v && (v.movidaPara || v.apagada)) && temConteudo(ler(outro, c))) vence = outro;
      }
      r.tc[c] = Math.max(ca, cb);
      const v = ler(vence, c);
      if (v === undefined) continue;
      if (c.startsWith('h.')) r.h[c.slice(2)] = v;
      else r[c] = v;
    }
    r.t = Math.max(a.t || 0, b.t || 0);
    return r;
  }

  /**
   * Põe carimbo `agora` em cada campo que mudou entre `antes` e `depois` (os dias inteiros, { 'AAAA-MM-DD': dia }).
   * Muda `depois` no lugar. Chamado pelo app a cada salvar().
   */
  function carimbar(antes, depois, agora) {
    for (const [k, d] of Object.entries(depois || {})) {
      const velho = (antes || {})[k];
      const campos = new Set([...camposDoDia(d), ...camposDoDia(velho)]);
      for (const c of campos) {
        if (c === 'tc') continue;
        if (JSON.stringify(ler(d, c)) !== JSON.stringify(ler(velho, c))) {
          if (!d.tc || typeof d.tc !== 'object') d.tc = {};
          d.tc[c] = agora;
        }
      }
    }
    return depois;
  }

  /** Junta o arquivo inteiro: dias campo a campo; o resto como antes (memórias, notas, caixa… pelo mais novo). */
  function juntar(local, remoto) {
    // Começa com tudo das duas pontas: um campo novo (de outra versão do app ou do Journal do PC) não se perde.
    const r = { ...remoto, ...local, dias: { ...(remoto.dias || {}) }, memorias: [], plano: {}, planoT: 0 };
    for (const [k, d] of Object.entries(local.dias || {})) r.dias[k] = juntarDia(d, (remoto.dias || {})[k]);
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
    // notas escritas no celular (Journal): juntam pelo id, vale a mais nova
    const notas = new Map();
    for (const n of [...(remoto.notas || []), ...(local.notas || [])]) if (n && n.id && (!notas.has(n.id) || (n.t || 0) >= (notas.get(n.id).t || 0))) notas.set(n.id, n);
    if (notas.size) r.notas = [...notas.values()]; else delete r.notas;
    // contadores pessoais da Início: a lista inteira, vale a mais nova
    const ct = (local.contadoresT || 0) >= (remoto.contadoresT || 0) ? local : remoto;
    if (ct.contadores) { r.contadores = ct.contadores; r.contadoresT = ct.contadoresT || 0; }
    // lista de hábitos (editada em Ajustes): a lista inteira, vale a mais nova
    const hb = [local, remoto].filter((x) => Array.isArray(x.habitos)).sort((a, b) => (b.habitosT || 0) - (a.habitosT || 0))[0];
    if (hb) { r.habitos = hb.habitos; r.habitosT = hb.habitosT || 0; } else { delete r.habitos; delete r.habitosT; }
    // caixa: tarefas escritas no celular para o Journal do PC (junta as duas pontas pelo id)
    const caixa = new Map();
    for (const c of [...(remoto.caixa || []), ...(local.caixa || [])]) if (c && c.id && (!caixa.has(c.id) || (c.t || 0) >= (caixa.get(c.id).t || 0))) caixa.set(c.id, c);
    if (caixa.size) r.caixa = [...caixa.values()]; else delete r.caixa;
    return r;
  }

  raiz.JJ = { juntar, juntarDia, carimbar };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.JJ;
})(typeof window !== 'undefined' ? window : globalThis);
