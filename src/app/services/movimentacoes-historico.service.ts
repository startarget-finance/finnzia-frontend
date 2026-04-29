import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ErpFinanceiroService,
  HistoricoMovimentacaoAcao,
  HistoricoMovimentacaoItem,
  HistoricoMovimentacoesResponse,
} from './erp-financeiro.service';
export type {
  HistoricoMovimentacaoAcao,
  HistoricoMovimentacaoItem,
  HistoricoMovimentacoesResponse,
} from './erp-financeiro.service';

@Injectable({ providedIn: 'root' })
export class MovimentacoesHistoricoService {
  constructor(private readonly erpFinanceiroService: ErpFinanceiroService) {}

  listar(filtros?: {
    acao?: HistoricoMovimentacaoAcao | '';
    dataInicio?: string;
    dataFim?: string;
    itensPorPagina?: number;
    numeroDaPagina?: number;
  }): Observable<HistoricoMovimentacoesResponse> {
    return this.erpFinanceiroService.listarHistoricoMovimentacoes(filtros);
  }

  restaurar(idHistorico: number): Observable<any> {
    return this.erpFinanceiroService.restaurarMovimentacaoHistorico(idHistorico);
  }
}
