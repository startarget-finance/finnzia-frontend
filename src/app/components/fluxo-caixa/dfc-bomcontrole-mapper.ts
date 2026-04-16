import { DfcLinha, DfcResponse } from '../../services/erp-financeiro.service';
import { DfcPlanilhaLinha, sortDfcMonths } from './dfc-sheet.utils';

function mapLinhaBc(linha: DfcLinha): { type: DfcPlanilhaLinha['type']; sign: '+' | '-' } {
  const t = linha.tipo;
  const nome = (linha.nome || '').toUpperCase();
  if (t === 'SECAO') {
    const despesa =
      nome.includes('DESPESA') ||
      nome.includes('DESPESAS') ||
      (nome.includes('CUSTO') && !nome.includes('RECEITA'));
    return { type: 'title', sign: despesa ? '-' : '+' };
  }
  if (t === 'SUBTOTAL_RECEITA') {
    return { type: 'result', sign: '+' };
  }
  if (t === 'SUBTOTAL_DESPESA') {
    return { type: 'result', sign: '-' };
  }
  if (t === 'RESULTADO') {
    return { type: 'result', sign: '+' };
  }
  if (t === 'RECEITA' || t === 'FATURAMENTO') {
    if (linha.nivel === 1) {
      return { type: 'subitem', sign: '+' };
    }
    return { type: 'item', sign: '+' };
  }
  if (t === 'DESPESA') {
    if (linha.nivel === 1) {
      return { type: 'subitem', sign: '-' };
    }
    return { type: 'item', sign: '-' };
  }
  return { type: 'item', sign: '+' };
}

/**
 * Converte a resposta de `gerarDFC` (Bom Controle) no modelo da planilha DFC (títulos, itens, resultados).
 */
export function mapBomControleDfcToPlanilha(res: DfcResponse): { months: string[]; rows: DfcPlanilhaLinha[] } {
  const months = sortDfcMonths([...(res.meses ?? [])]);
  const linhas = res.linhas ?? [];
  const rows: DfcPlanilhaLinha[] = linhas.map((linha: DfcLinha, idx: number) => {
    const values: Record<string, number | null> = {};
    months.forEach((m, i) => {
      values[m] = linha.valores?.[i] ?? null;
    });
    const mapped = mapLinhaBc(linha);
    const row: DfcPlanilhaLinha = {
      id: `bc-${idx}`,
      label: linha.nome,
      type: mapped.type,
      sign: mapped.sign,
      values
    };
    if (mapped.type === 'result') {
      row.titleIds = [];
    }
    return row;
  });
  return { months, rows };
}
