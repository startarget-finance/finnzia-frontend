import {
  CategoriaFinanceira,
  SubcategoriaFinanceira,
  TipoCategoriaFinanceira,
} from '../services/categorias-financeiras.service';

/** Converte o JSON do backend em árvore editável (ids temporários). */
export function parseArvoreJsonParaCategorias(arvore: unknown[]): CategoriaFinanceira[] {
  let noId = 1000;
  let raizSeq = 1;

  const parseFilhos = (filhos: unknown[]): SubcategoriaFinanceira[] => {
    const lista: SubcategoriaFinanceira[] = [];
    for (const el of filhos || []) {
      if (!el || typeof el !== 'object') continue;
      const o = el as Record<string, unknown>;
      const nome = String(o['nome'] || o['subcategoria'] || '').trim();
      if (!nome) continue;
      const nested = Array.isArray(o['children']) ? parseFilhos(o['children'] as unknown[]) : [];
      const node: SubcategoriaFinanceira = { id: noId++, nome };
      if (nested.length) node.children = nested;
      lista.push(node);
    }
    return lista;
  };

  const raizes: CategoriaFinanceira[] = [];
  for (const item of arvore || []) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const tipoRaw = String(o['tipo'] || '').trim().toLowerCase();
    const tipo: TipoCategoriaFinanceira = tipoRaw === 'receita' ? 'receita' : 'despesa';
    const nome = String(o['nome'] || o['categoria'] || '').trim();
    if (!nome) continue;
    const filhos = Array.isArray(o['children']) ? parseFilhos(o['children'] as unknown[]) : [];
    raizes.push({
      id: `${tipo}:${raizSeq++}`,
      tipo,
      nome,
      subcategorias: filhos,
      dataCriacao: '',
      dataAtualizacao: '',
    });
  }
  return raizes;
}

/** Serializa a árvore em memória para salvar no backend. */
export function serializarCategoriasParaJson(categorias: CategoriaFinanceira[]): unknown[] {
  const filhosParaJson = (subs: SubcategoriaFinanceira[] | undefined): unknown[] =>
    (subs || []).map((s) => {
      const o: Record<string, unknown> = { nome: s.nome };
      if (s.children?.length) o['children'] = filhosParaJson(s.children);
      return o;
    });

  return (categorias || []).map((c) => {
    const o: Record<string, unknown> = { tipo: c.tipo, nome: c.nome };
    if (c.subcategorias?.length) o['children'] = filhosParaJson(c.subcategorias);
    return o;
  });
}

export function proximoIdTemporario(categorias: CategoriaFinanceira[]): number {
  let max = 999;
  const walk = (subs: SubcategoriaFinanceira[] | undefined) => {
    for (const s of subs || []) {
      if (typeof s.id === 'number' && s.id > max) max = s.id;
      walk(s.children);
    }
  };
  for (const c of categorias || []) {
    const rid = parseIdRaizUtil(String(c.id));
    if (rid != null && rid > max) max = rid;
    walk(c.subcategorias);
  }
  return max + 1;
}

export function parseIdRaizUtil(idComposto: string): number | null {
  const raw = (idComposto || '').trim();
  const idx = raw.lastIndexOf(':');
  if (idx >= 0 && idx < raw.length - 1) {
    const n = Number(raw.slice(idx + 1));
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  const plain = Number(raw);
  return Number.isFinite(plain) && plain > 0 ? Math.trunc(plain) : null;
}

export function renomearNoNaArvore(categorias: CategoriaFinanceira[], nodeId: number, nome: string): boolean {
  for (const c of categorias) {
    const rid = parseIdRaizUtil(String(c.id));
    if (rid === nodeId) {
      c.nome = nome;
      return true;
    }
    if (renomearEmSubs(c.subcategorias, nodeId, nome)) return true;
  }
  return false;
}

function renomearEmSubs(subs: SubcategoriaFinanceira[] | undefined, nodeId: number, nome: string): boolean {
  for (const s of subs || []) {
    if (s.id === nodeId) {
      s.nome = nome;
      return true;
    }
    if (renomearEmSubs(s.children, nodeId, nome)) return true;
  }
  return false;
}

export function excluirNoNaArvore(categorias: CategoriaFinanceira[], nodeId: number): boolean {
  for (let i = categorias.length - 1; i >= 0; i--) {
    const rid = parseIdRaizUtil(String(categorias[i].id));
    if (rid === nodeId) {
      categorias.splice(i, 1);
      return true;
    }
    if (excluirEmSubs(categorias[i].subcategorias, nodeId)) return true;
  }
  return false;
}

function excluirEmSubs(subs: SubcategoriaFinanceira[] | undefined, nodeId: number): boolean {
  if (!subs) return false;
  for (let i = subs.length - 1; i >= 0; i--) {
    if (subs[i].id === nodeId) {
      subs.splice(i, 1);
      return true;
    }
    if (excluirEmSubs(subs[i].children, nodeId)) return true;
  }
  return false;
}

export function adicionarRaiz(
  categorias: CategoriaFinanceira[],
  tipo: TipoCategoriaFinanceira,
  nome: string,
  nextRaizSeq: number,
  nextNoId: number
): { raizSeq: number; noId: number } {
  categorias.push({
    id: `${tipo}:${nextRaizSeq}`,
    tipo,
    nome,
    subcategorias: [],
    dataCriacao: '',
    dataAtualizacao: '',
  });
  return { raizSeq: nextRaizSeq + 1, noId: nextNoId };
}

export function adicionarFilho(
  categorias: CategoriaFinanceira[],
  parentId: number,
  nome: string,
  nextNoId: number
): number {
  for (const c of categorias) {
    const rid = parseIdRaizUtil(String(c.id));
    if (rid === parentId) {
      c.subcategorias = c.subcategorias || [];
      c.subcategorias.push({ id: nextNoId, nome });
      return nextNoId + 1;
    }
    const updated = adicionarFilhoEmSubs(c.subcategorias, parentId, nome, nextNoId);
    if (updated > nextNoId) return updated;
  }
  return nextNoId;
}

function adicionarFilhoEmSubs(
  subs: SubcategoriaFinanceira[] | undefined,
  parentId: number,
  nome: string,
  nextNoId: number
): number {
  for (const s of subs || []) {
    if (s.id === parentId) {
      s.children = s.children || [];
      s.children.push({ id: nextNoId, nome });
      return nextNoId + 1;
    }
    const updated = adicionarFilhoEmSubs(s.children, parentId, nome, nextNoId);
    if (updated > nextNoId) return updated;
  }
  return nextNoId;
}

export interface OpcaoCategoriaFinanceiraSelect {
  value: string;
  label: string;
  tipo: TipoCategoriaFinanceira;
}

/**
 * Lista todas as contas folha do plano para selects (ex.: lançamento em Movimentações).
 * Caminho completo: "3. DESPESAS... > Recursos Humanos > Folha - Salários (CLT)".
 */
export function flattenCategoriasFinanceirasParaSelect(
  raizes: CategoriaFinanceira[]
): OpcaoCategoriaFinanceiraSelect[] {
  const out: OpcaoCategoriaFinanceiraSelect[] = [];

  const walkSubs = (tipo: TipoCategoriaFinanceira, path: string[], subs: SubcategoriaFinanceira[]): void => {
    for (const s of subs || []) {
      const segmentos = [...path, s.nome];
      const filhos = s.children || [];
      if (filhos.length > 0) {
        walkSubs(tipo, segmentos, filhos);
      } else {
        const label = segmentos.join(' > ');
        out.push({ value: label, label, tipo });
      }
    }
  };

  for (const c of raizes || []) {
    const subs = c.subcategorias || [];
    if (subs.length === 0) {
      out.push({ value: c.nome, label: c.nome, tipo: c.tipo });
    } else {
      walkSubs(c.tipo, [c.nome], subs);
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export interface OpcaoPaiCategoriaSelect {
  value: string;
  label: string;
}

/** Opções para inserir nova categoria como filha de uma conta existente. */
export function listarOpcoesPaiCategoriaFinanceira(
  raizes: CategoriaFinanceira[],
  tipo: TipoCategoriaFinanceira
): OpcaoPaiCategoriaSelect[] {
  const out: OpcaoPaiCategoriaSelect[] = [
    { value: '', label: 'Não — categoria principal (1º nível)' },
  ];

  const walkSubs = (path: string[], subs: SubcategoriaFinanceira[]): void => {
    for (const s of subs || []) {
      const caminho = [...path, s.nome].join(' › ');
      if (typeof s.id === 'number' && s.id > 0) {
        out.push({ value: String(s.id), label: `Sim — em: ${caminho}` });
      }
      walkSubs([...path, s.nome], s.children || []);
    }
  };

  for (const c of raizes || []) {
    if (c.tipo !== tipo) {
      continue;
    }
    const rid = parseIdRaizUtil(String(c.id));
    if (rid != null) {
      out.push({ value: String(rid), label: `Sim — em: ${c.nome}` });
    }
    walkSubs([c.nome], c.subcategorias);
  }

  return out;
}

/** Total de contas do plano (raízes + todos os níveis da árvore). */
export function contarNosCategoriasFinanceiras(raizes: CategoriaFinanceira[]): number {
  let n = 0;
  const walk = (subs: SubcategoriaFinanceira[] | undefined) => {
    for (const s of subs || []) {
      n++;
      walk(s.children);
    }
  };
  for (const c of raizes || []) {
    n++;
    walk(c.subcategorias);
  }
  return n;
}
