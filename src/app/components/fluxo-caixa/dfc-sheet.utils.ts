/** Modelo alinhado ao backend / planilha Base44 (React). */

export const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type DfcRowType = 'title' | 'item' | 'subitem' | 'result';

export interface DfcPlanilhaLinha {
  id: string;
  label: string;
  type: DfcRowType;
  sign: '+' | '-';
  values: Record<string, number | null | undefined>;
  titleIds?: string[];
}

export interface DfcLinhaComputada extends DfcPlanilhaLinha {
  _val: Record<string, number>;
}

export function genDfcRowId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultDfcRows(): DfcPlanilhaLinha[] {
  return [
    { id: genDfcRowId(), label: 'FATURAMENTO BRUTO', type: 'title', sign: '+', values: {} },
    { id: genDfcRowId(), label: '1. RECEITA OPERACIONAL TOTAL', type: 'title', sign: '+', values: {} },
    { id: genDfcRowId(), label: 'Receita de Contratos', type: 'item', sign: '+', values: {} },
    { id: genDfcRowId(), label: 'Outras Receitas', type: 'item', sign: '+', values: {} },
    { id: genDfcRowId(), label: '2. CUSTOS VARIÁVEIS', type: 'title', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Custos Operacionais', type: 'item', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Margem de Contribuição', type: 'result', sign: '+', values: {}, titleIds: [] },
    { id: genDfcRowId(), label: '3. DESPESAS ESTRATÉGICAS', type: 'title', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Marketing', type: 'item', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Comercial', type: 'subitem', sign: '-', values: {} },
    { id: genDfcRowId(), label: '4. DESPESAS FIXAS', type: 'title', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Folha de Pagamento', type: 'item', sign: '-', values: {} },
    { id: genDfcRowId(), label: 'Aluguel', type: 'item', sign: '-', values: {} },
    { id: genDfcRowId(), label: '5. RESULTADO OPERACIONAL', type: 'result', sign: '+', values: {}, titleIds: [] }
  ];
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') {
    return 0;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Replica a lógica do DFCTab React (computeSheet). */
export function computeDfcSheet(rows: DfcPlanilhaLinha[], months: string[]): DfcLinhaComputada[] {
  const c: DfcLinhaComputada[] = rows.map((r) => ({
    ...r,
    sign: r.sign === '-' ? '-' : '+',
    values: { ...r.values },
    _val: { ...r.values } as Record<string, number>
  }));

  for (const row of c) {
    for (const m of months) {
      row._val[m] = num(row.values[m]);
    }
  }

  for (let i = 0; i < c.length; i++) {
    if (c[i].type !== 'item') {
      continue;
    }
    const subs: DfcLinhaComputada[] = [];
    for (let j = i + 1; j < c.length; j++) {
      if (c[j].type === 'subitem') {
        subs.push(c[j]);
      } else {
        break;
      }
    }
    if (subs.length > 0) {
      months.forEach((m) => {
        c[i]._val[m] = subs.reduce((s, r) => s + num(r.values[m]), 0);
      });
    }
  }

  for (let i = 0; i < c.length; i++) {
    if (c[i].type !== 'title') {
      continue;
    }
    const items: DfcLinhaComputada[] = [];
    for (let j = i + 1; j < c.length; j++) {
      if (c[j].type === 'subitem') {
        continue;
      }
      if (c[j].type === 'item') {
        items.push(c[j]);
      } else {
        break;
      }
    }
    if (items.length > 0) {
      months.forEach((m) => {
        c[i]._val[m] = items.reduce((s, r) => s + num(r._val[m]), 0);
      });
    } else {
      const subs: DfcLinhaComputada[] = [];
      for (let j = i + 1; j < c.length; j++) {
        if (c[j].type === 'subitem') {
          subs.push(c[j]);
        } else {
          break;
        }
      }
      if (subs.length > 0) {
        months.forEach((m) => {
          c[i]._val[m] = subs.reduce((s, r) => s + num(r.values[m]), 0);
        });
      }
    }
  }

  for (let i = 0; i < c.length; i++) {
    if (c[i].type !== 'result') {
      continue;
    }
    const titleIds = c[i].titleIds;
    if (titleIds && titleIds.length > 0) {
      months.forEach((m) => {
        let val = 0;
        titleIds.forEach((tid) => {
          const t = c.find((r) => r.id === tid);
          if (t) {
            const sign = t.sign === '-' ? -1 : 1;
            val += sign * num(t._val[m]);
          }
        });
        c[i]._val[m] = val;
      });
    } else {
      let start = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (c[j].type === 'result') {
          start = j + 1;
          break;
        }
      }
      months.forEach((m) => {
        let val = 0;
        for (let j = start; j < i; j++) {
          const sign = c[j].sign === '-' ? -1 : 1;
          val += sign * num(c[j]._val[m]);
        }
        c[i]._val[m] = val;
      });
    }
  }

  return c;
}

/** Exibe exatamente os valores vindos da API (Bom Controle), sem recalcular hierarquia na planilha. */
export function computeDfcSheetFromApi(rows: DfcPlanilhaLinha[], months: string[]): DfcLinhaComputada[] {
  return rows.map((r) => {
    const _val: Record<string, number> = {};
    for (const m of months) {
      _val[m] = num(r.values[m]);
    }
    return { ...r, _val };
  });
}

/**
 * Recalcula apenas linhas `result` cujo `titleIds` não está vazio (painel “Títulos no cálculo”),
 * somando os títulos selecionados com o sinal de cada um — compatível com dados da API.
 */
export function applyResultTitleSelections(
  computed: DfcLinhaComputada[],
  sourceRows: DfcPlanilhaLinha[],
  months: string[]
): DfcLinhaComputada[] {
  const byId = new Map(computed.map((r) => [r.id, r]));
  const titleIdsByResultId = new Map<string, string[]>();
  for (const r of sourceRows) {
    if (r.type === 'result' && r.titleIds?.length) {
      titleIdsByResultId.set(r.id, r.titleIds);
    }
  }
  if (!titleIdsByResultId.size) {
    return computed;
  }
  return computed.map((row) => {
    const ids = titleIdsByResultId.get(row.id);
    if (!ids?.length) {
      return row;
    }
    const _val: Record<string, number> = { ...row._val };
    for (const m of months) {
      let val = 0;
      for (const tid of ids) {
        const t = byId.get(tid);
        if (t) {
          const sign = t.sign === '-' ? -1 : 1;
          val += sign * num(t._val[m]);
        }
      }
      _val[m] = val;
    }
    return { ...row, _val };
  });
}

/**
 * Seções (títulos) vindas da API costumam vir zeradas enquanto itens/subitens têm valor.
 * Soma filhos até o próximo título/resultado e preenche o título quando a API está ~0,
 * para ficar alinhado ao protótipo (totais + % nas linhas de cabeçalho de grupo).
 */
export function rollupEmptyTitleValuesFromDescendants(
  computed: DfcLinhaComputada[],
  months: string[]
): DfcLinhaComputada[] {
  const out = computed.map((r) => ({ ...r, _val: { ...r._val } }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].type !== 'title') {
      continue;
    }
    const sums: Record<string, number> = {};
    for (const m of months) {
      sums[m] = 0;
    }
    for (let j = i + 1; j < out.length; j++) {
      const rj = out[j];
      if (rj.type === 'title' || rj.type === 'result') {
        break;
      }
      if (rj.type === 'item' || rj.type === 'subitem') {
        const mult = rj.sign === '-' ? -1 : 1;
        for (const m of months) {
          sums[m] += mult * num(rj._val[m]);
        }
      }
    }
    const t = out[i];
    for (const m of months) {
      const api = num(t._val[m]);
      const rolled = sums[m];
      if (Math.abs(api) < 1e-9 && Math.abs(rolled) > 1e-9) {
        t._val[m] = rolled;
      }
    }
  }
  return out;
}

export function sortDfcMonths(arr: string[]): string[] {
  return [...arr].sort((a, b) => {
    const [mA, yA] = a.split('/');
    const [mB, yB] = b.split('/');
    const yearDiff = parseInt(yA ?? '0', 10) - parseInt(yB ?? '0', 10);
    if (yearDiff !== 0) {
      return yearDiff;
    }
    return MONTHS_PT.indexOf(mA ?? '') - MONTHS_PT.indexOf(mB ?? '');
  });
}

export function fmtDfc(v: number | null | undefined): string {
  if (v == null) {
    return '';
  }
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDfcPct(v: number | null | undefined): string {
  if (v == null || isNaN(v as number) || !isFinite(v as number)) {
    return '';
  }
  return (v as number).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

/** Normaliza payload da API (números podem vir como string). */
export function normalizeDfcRows(rows: DfcPlanilhaLinha[] | undefined | null): DfcPlanilhaLinha[] {
  if (!rows?.length) {
    return defaultDfcRows();
  }
  return rows.map((r) => ({
    ...r,
    type: r.type,
    sign: r.sign === '-' ? '-' : '+',
    values: normalizeValues(r.values),
    titleIds: r.type === 'result' ? r.titleIds ?? [] : undefined
  }));
}

function normalizeValues(v: Record<string, unknown> | undefined): Record<string, number | null> {
  if (!v) {
    return {};
  }
  const out: Record<string, number | null> = {};
  for (const k of Object.keys(v)) {
    const raw = v[k];
    if (raw === null || raw === undefined || raw === '') {
      out[k] = null;
    } else {
      const n = typeof raw === 'number' ? raw : Number(raw);
      out[k] = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}
