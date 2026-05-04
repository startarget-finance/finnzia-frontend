export function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.replace(/^(\d{3})(\d+)/, '$1.$2');
  if (d.length <= 9) return d.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}

export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (!d) return '';
  if (d.length <= 2) return d;
  if (d.length <= 5) return d.replace(/^(\d{2})(\d+)/, '$1.$2');
  if (d.length <= 8) return d.replace(/^(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
  if (d.length <= 12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5');
}

export function maskCpfCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (!d) return '';
  return d.length <= 11 ? maskCpf(d) : maskCnpj(d);
}

export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return d.replace(/^(\d{5})(\d+)/, '$1-$2');
}

/** Telefone BR: (11) 99999-9999 ou (11) 9999-9999 */
export function maskBrPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

