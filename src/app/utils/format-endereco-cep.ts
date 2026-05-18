/** Monta endereço legível: logradouro, bairro - cidade/UF */
export function formatEnderecoFromCepParts(
  logradouro: string,
  bairro: string,
  cidade: string,
  uf: string
): string {
  const log = (logradouro || '').trim();
  const b = (bairro || '').trim();
  const cid = (cidade || '').trim();
  const estado = (uf || '').trim();
  const parts: string[] = [];
  if (log) {
    parts.push(log);
  }
  const localParts: string[] = [];
  if (b) {
    localParts.push(b);
  }
  if (cid && estado) {
    localParts.push(`${cid}/${estado}`);
  } else if (cid) {
    localParts.push(cid);
  } else if (estado) {
    localParts.push(estado);
  }
  if (localParts.length) {
    parts.push(localParts.join(' - '));
  }
  return parts.join(', ');
}
