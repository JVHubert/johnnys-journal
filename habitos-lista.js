// Lista de hábitos guardada nos dados (dados.habitos + dados.habitosT, desde a 2.34.0): o JV edita no
// celular (Ajustes > Hábitos) e o PC lê a mesma lista. Arquivo de script comum (sem import/export): o
// index.html carrega antes do app.js, que usa window.JJH. No fim, exporta para os testes no Node.
//
// Regras:
// - Sem lista nos dados, vale a PADRAO (a lista de antes, escrita no código).
// - O id nunca muda (as marcações dos dias usam o id). Renomear muda só nome, sub e curto.
// - "Parar de acompanhar" põe `ate` = ontem: o hábito some de hoje em diante e o histórico fica.
//   Hábito criado hoje e parado hoje some de vez (não tem histórico).
// - Hábito novo nasce com `desde` = hoje: os dias antes dele não contam como "não feito".
// - Água e PM3 têm contas próprias (tipo 'agua' e 'horas'): dá para renomear e parar, não para criar outro igual.
(function (raiz) {
  const GRUPOS = ['Manhã', 'Durante o dia', 'Noite'];
  const PADRAO = [
    { id: 'acordar', nome: 'Acordei às 7h', grupo: 'Manhã', curto: 'Acordei 7h' },
    { id: 'treino', nome: 'Exercício', grupo: 'Manhã', curto: 'Exercício' },
    { id: 'agua', nome: 'Água', sub: 'meta: 3 garrafas de 710 mL · a 4ª é bônus', grupo: 'Durante o dia', tipo: 'agua', curto: 'Água' },
    { id: 'macros', nome: 'Macros + budget', sub: 'anotar calorias e despesas', grupo: 'Durante o dia', curto: 'Macros + budget' },
    { id: 'pm3', nome: 'PM3', sub: 'horas assistidas hoje', grupo: 'Durante o dia', tipo: 'horas', ate: '2026-11-01', curto: 'PM3' },
    { id: 'semp', nome: 'Sem p + TikTok', grupo: 'Durante o dia', curto: 'Sem p + TikTok' },
    { id: 'leitura', nome: 'Leitura antes de dormir', grupo: 'Noite', curto: 'Leitura' },
    { id: 'celular', nome: 'Celular fora do quarto', sub: 'às 22h30', grupo: 'Noite', curto: 'Celular 22h30' },
    { id: 'journal', nome: 'Journal', sub: 'entrevista ou tweet', grupo: 'Noite', curto: 'Journal' },
  ];
  const DATA = /^\d{4}-\d{2}-\d{2}$/;
  const copia = (l) => l.map((h) => ({ ...h }));

  /** Um hábito com os campos certos, ou null se não serve. */
  function normalizar(h) {
    if (!h || typeof h !== 'object' || !/^[a-z0-9_]{1,30}$/.test(String(h.id || ''))) return null;
    const nome = String(h.nome || '').trim().slice(0, 60);
    if (!nome) return null;
    const r = { id: h.id, nome, grupo: GRUPOS.includes(h.grupo) ? h.grupo : 'Durante o dia', curto: String(h.curto || nome).trim().slice(0, 30) };
    if (h.sub && String(h.sub).trim()) r.sub = String(h.sub).trim().slice(0, 80);
    if (h.tipo === 'agua' || h.tipo === 'horas') r.tipo = h.tipo;
    if (DATA.test(h.desde || '')) r.desde = h.desde;
    if (DATA.test(h.ate || '')) r.ate = h.ate;
    return r;
  }

  /** A lista que vale: a dos dados (se tiver pelo menos um hábito válido) ou a PADRAO. */
  function habitosDe(dados) {
    const l = dados && Array.isArray(dados.habitos) ? dados.habitos.map(normalizar).filter(Boolean) : [];
    const vistos = new Set();
    const unicos = l.filter((h) => !vistos.has(h.id) && vistos.add(h.id));
    return unicos.length ? unicos : copia(PADRAO);
  }

  /** id novo a partir do nome: "Meditar 10 min" -> "meditar_10_min" (com _2, _3… se já existir). */
  function novoId(nome, lista) {
    const base = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'habito';
    const usados = new Set(lista.map((h) => h.id));
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base}_${n}`)) return `${base}_${n}`;
  }

  function adicionar(lista, { nome, sub, grupo }, hoje) {
    const h = normalizar({ id: novoId(nome, lista), nome, sub, grupo, desde: hoje });
    return h ? [...copia(lista), h] : copia(lista);
  }
  function renomear(lista, id, { nome, sub, grupo }) {
    return lista.map((h) => {
      if (h.id !== id) return { ...h };
      const novo = normalizar({ ...h, nome: nome !== undefined ? nome : h.nome, sub: sub !== undefined ? sub : h.sub,
        grupo: grupo !== undefined ? grupo : h.grupo, curto: nome !== undefined ? nome : h.curto });
      return novo || { ...h };
    });
  }
  function parar(lista, id, hoje, ontem) {
    const h = lista.find((x) => x.id === id);
    if (h && h.desde && h.desde >= hoje) return copia(lista.filter((x) => x.id !== id));
    return lista.map((x) => (x.id === id ? { ...x, ate: ontem } : { ...x }));
  }
  function voltar(lista, id) {
    return lista.map((x) => { if (x.id !== id) return { ...x }; const r = { ...x }; delete r.ate; return r; });
  }
  function mover(lista, id, delta) {
    const l = copia(lista), i = l.findIndex((h) => h.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= l.length) return l;
    [l[i], l[j]] = [l[j], l[i]];
    return l;
  }
  /** Ativo no dia k? (INICIO é o primeiro dia do tracker.) */
  const ativo = (h, k, INICIO) => k >= (h.desde || INICIO) && (!h.ate || k <= h.ate);

  raiz.JJH = { GRUPOS, PADRAO, normalizar, habitosDe, novoId, adicionar, renomear, parar, voltar, mover, ativo };
  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.JJH;
})(typeof window !== 'undefined' ? window : globalThis);
