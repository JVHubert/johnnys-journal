// Cifra dos dados do Journal (Etapa 2). O MESMO arquivo roda no celular, na tela do PC (WebView2) e no Node.
// Ver FORMATO.md.
//
// Cofre: os dados são cifrados com uma CHAVE DOS DADOS sorteada (32 bytes), que nunca muda.
// Essa chave fica guardada na nuvem trancada duas vezes:
//   - pela senha do JV (PBKDF2-SHA256, 310000 voltas)        -> trocar a senha = trancar de novo, sem mexer nos dados;
//   - por uma CHAVE DE RECUPERAÇÃO (impressa/guardada no papel) -> esqueceu a senha, ainda abre.
// Registro cifrado: texto "v1.<iv>.<cifrado>" (base64url), AES-GCM-256, IV novo, dado adicional = id do registro
// (não dá para trocar o conteúdo de um registro pelo de outro).

export const VOLTAS = 310000
const te = new TextEncoder()
const td = new TextDecoder()
const cr = globalThis.crypto

export const paraB64 = (u8) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const deB64 = (t) => {
  const s = atob(String(t).replace(/-/g, '+').replace(/_/g, '/'))
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}
const sortear = (n) => cr.getRandomValues(new Uint8Array(n))

/** Chave crua (base64url) -> CryptoKey. Sem `extraivel`, ninguém consegue ler a chave de volta (guardar assim no IndexedDB). */
export const paraCryptoKey = (crua, extraivel = false) => cr.subtle.importKey('raw', deB64(crua), 'AES-GCM', extraivel, ['encrypt', 'decrypt'])
const comoChave = (k) => (typeof k === 'string' ? paraCryptoKey(k) : k)

/** Senha (ou código de recuperação) + sal -> chave crua de 32 bytes. */
export async function derivar(segredo, sal, voltas = VOLTAS) {
  const base = await cr.subtle.importKey('raw', te.encode(segredo), 'PBKDF2', false, ['deriveBits'])
  const bits = await cr.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deB64(sal), iterations: voltas }, base, 256)
  return paraB64(new Uint8Array(bits))
}

/** Cifra qualquer valor JSON. `chave` = chave crua (texto) ou CryptoKey. `iv` só é passado em testes. */
export async function cifrar(chave, id, valor, iv = sortear(12)) {
  const ct = await cr.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(String(id)) }, await comoChave(chave), te.encode(JSON.stringify(valor)))
  return `v1.${paraB64(iv)}.${paraB64(new Uint8Array(ct))}`
}

/** Decifra; lança erro se a chave, o id ou o conteúdo estiverem errados. */
export async function decifrar(chave, id, texto) {
  const [v, iv, ct] = String(texto).split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('formato desconhecido')
  const pt = await cr.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: te.encode(String(id)) }, await comoChave(chave), deB64(ct))
  return JSON.parse(td.decode(pt))
}

// ---- bytes (fotos): mesmo esquema, sem passar por JSON ----
export async function cifrarBytes(chave, id, u8, iv = sortear(12)) {
  const ct = new Uint8Array(await cr.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(String(id)) }, await comoChave(chave), u8))
  const saida = new Uint8Array(13 + ct.length)
  saida[0] = 1; saida.set(iv, 1); saida.set(ct, 13) // [versão 1][iv 12][cifrado]
  return saida
}
export async function decifrarBytes(chave, id, u8) {
  if (u8[0] !== 1) throw new Error('formato desconhecido')
  return new Uint8Array(await cr.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(1, 13), additionalData: te.encode(String(id)) }, await comoChave(chave), u8.subarray(13)))
}

// ---- cofre ----
const LETRAS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // sem 0/O, 1/I/L: fácil de copiar do papel
const limparCodigo = (c) => String(c).toUpperCase().replace(/[^0-9A-Z]/g, '')

/** 24 caracteres em 6 blocos (≈119 bits): "K7QM-..." */
export function novoCodigoDeRecuperacao() {
  const b = sortear(24)
  const s = [...b].map((x) => LETRAS[x % LETRAS.length]).join('')
  return s.match(/.{4}/g).join('-')
}

/** Cria o cofre (vai para a nuvem; é público, não abre sem a senha ou o código). */
export async function criarCofre(senha) {
  const chaveDados = paraB64(sortear(32))
  const recuperacao = novoCodigoDeRecuperacao()
  const salSenha = paraB64(sortear(16)), salRec = paraB64(sortear(16))
  const cofre = {
    v: 1, voltas: VOLTAS, salSenha, salRec,
    porSenha: await cifrar(await derivar(senha, salSenha), 'cofre-senha', chaveDados),
    porRecuperacao: await cifrar(await derivar(limparCodigo(recuperacao), salRec, 1000), 'cofre-recuperacao', chaveDados),
  }
  return { cofre, chaveDados, recuperacao }
}

/** Senha certa -> chave dos dados (crua); senha errada -> null. */
export async function abrirCofre(cofre, senha) {
  try { return await decifrar(await derivar(senha, cofre.salSenha, cofre.voltas), 'cofre-senha', cofre.porSenha) } catch { return null }
}
export async function abrirComRecuperacao(cofre, codigo) {
  try { return await decifrar(await derivar(limparCodigo(codigo), cofre.salRec, 1000), 'cofre-recuperacao', cofre.porRecuperacao) } catch { return null }
}

/** Troca a senha sem mexer em nenhum dado: só tranca a mesma chave com a senha nova. */
export async function trocarSenha(cofre, chaveDados, novaSenha) {
  const salSenha = paraB64(sortear(16))
  return { ...cofre, salSenha, porSenha: await cifrar(await derivar(novaSenha, salSenha, cofre.voltas), 'cofre-senha', chaveDados) }
}
