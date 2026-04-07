import { ContratoDTO } from '../../services/contrato.service';

export interface ContratoGrupoCliente {
  clienteId: number;
  cliente: ContratoDTO['cliente'];
  contratos: ContratoDTO[];
}

const FIN_ORDER: Record<string, number> = { EM_DIA: 0, ATRASADO: 1, INADIMPLENTE: 2 };
const WF_ORDER: Record<string, number> = { NOVO: 0, ASSINATURA: 1, COBRANCA: 2, ATIVO: 3 };

function finRank(status: ContratoDTO['financialStatus'] | undefined): number {
  const k = status ?? 'EM_DIA';
  return FIN_ORDER[k] ?? 0;
}

function wfRank(status: ContratoDTO['workflowStatus'] | undefined): number {
  const k = status ?? 'NOVO';
  return WF_ORDER[k] ?? 0;
}

/**
 * Agrupa contratos pelo id do cliente (uma linha por cliente na operação / carteira).
 */
export function groupContratosByClienteId(contratos: ContratoDTO[]): ContratoGrupoCliente[] {
  const map = new Map<number, ContratoDTO[]>();
  for (const c of contratos || []) {
    const id = c.cliente?.id;
    if (id == null) {
      continue;
    }
    if (!map.has(id)) {
      map.set(id, []);
    }
    map.get(id)!.push(c);
  }
  return Array.from(map.entries())
    .map(([clienteId, list]) => ({
      clienteId,
      cliente: list[0].cliente,
      contratos: [...list].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    }))
    .sort((a, b) => {
      const na = a.cliente.razaoSocial || a.cliente.nomeFantasia || '';
      const nb = b.cliente.razaoSocial || b.cliente.nomeFantasia || '';
      return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    });
}

export function grupoValorMensalTotal(g: ContratoGrupoCliente): number {
  return g.contratos.reduce((s, c) => s + Number(c.valorRecorrencia || c.valorContrato || 0), 0);
}

function nextBillingRaw(c: ContratoDTO): string | undefined {
  const pend = (c.cobrancas || [])
    .filter((x) => x.status === 'PENDING' || x.status === 'OVERDUE')
    .map((x) => x.dataVencimento)
    .sort();
  return pend[0] || c.dataVencimento;
}

export function grupoProximaCobranca(g: ContratoGrupoCliente): string | undefined {
  const datas = g.contratos.map(nextBillingRaw).filter((d): d is string => !!d && d.length > 0);
  if (!datas.length) {
    return undefined;
  }
  return datas.slice().sort()[0];
}

export function grupoFinancialWorst(g: ContratoGrupoCliente): ContratoDTO['financialStatus'] {
  let worst: NonNullable<ContratoDTO['financialStatus']> = 'EM_DIA';
  for (const c of g.contratos) {
    const s: NonNullable<ContratoDTO['financialStatus']> = c.financialStatus ?? 'EM_DIA';
    if (finRank(s) > finRank(worst)) {
      worst = s;
    }
  }
  return worst;
}

export function grupoWorkflowRepresentativo(g: ContratoGrupoCliente): ContratoDTO['workflowStatus'] {
  let max: NonNullable<ContratoDTO['workflowStatus']> = 'NOVO';
  for (const c of g.contratos) {
    const s: NonNullable<ContratoDTO['workflowStatus']> = c.workflowStatus ?? 'NOVO';
    if (wfRank(s) > wfRank(max)) {
      max = s;
    }
  }
  return max;
}

/** Etapa mais “atrasada” do grupo — útil no Kanban para o cartão ficar na coluna que ainda precisa de ação. */
export function grupoWorkflowAtencao(g: ContratoGrupoCliente): ContratoDTO['workflowStatus'] {
  let min: NonNullable<ContratoDTO['workflowStatus']> = g.contratos[0]?.workflowStatus ?? 'NOVO';
  for (const c of g.contratos) {
    const s: NonNullable<ContratoDTO['workflowStatus']> = c.workflowStatus ?? 'NOVO';
    if (wfRank(s) < wfRank(min)) {
      min = s;
    }
  }
  return min;
}

/** Contrato “principal” para abrir drawer (pior situação financeira, depois vencimento mais próximo). */
export function grupoContratoPrincipal(g: ContratoGrupoCliente): ContratoDTO {
  const sorted = [...g.contratos].sort((a, b) => {
    const fa = a.financialStatus || 'EM_DIA';
    const fb = b.financialStatus || 'EM_DIA';
    const diff = finRank(fb) - finRank(fa);
    if (diff !== 0) {
      return diff;
    }
    const da = nextBillingRaw(a) || '9999';
    const db = nextBillingRaw(b) || '9999';
    return da.localeCompare(db);
  });
  return sorted[0];
}
