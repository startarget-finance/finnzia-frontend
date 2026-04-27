import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import {
  ErpFinanceiroService,
  MovimentacaoFinanceira,
  ResumoFinanceiroResponse
} from '../../services/erp-financeiro.service';

@Component({
  selector: 'app-frente-caixa-comercial',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './frente-caixa-comercial.component.html'
})
export class FrenteCaixaComercialComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  resumo: ResumoFinanceiroResponse | null = null;
  /** Últimas receitas (entradas) do mês na amostra. */
  ultimasReceitas: MovimentacaoFinanceira[] = [];
  totalReceitasPeriodo = 0;
  totalRegistrosReceitas = 0;

  readonly movimentacoesPath: string[] = ['/movimentacoes'];
  /** Abre o cadastro de receita (conta a receber) em Movimentações. */
  readonly qpLancarVenda = { novo: 'receita' };

  private destroy$ = new Subject<void>();

  constructor(private erp: ErpFinanceiroService) {}

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Query para Movimentações com filtro de receitas do mês corrente
   * (nomes alinhados a `aplicarFiltrosDeNavegacao` no componente de movimentações).
   */
  get qpMovimentacoesReceitasMes(): Record<string, string> {
    const { dataInicial, dataFinal } = this.intervaloMesAtual();
    return { tipo: 'receita', dataInicial, dataFinal };
  }

  carregar(): void {
    this.loading = true;
    this.error = null;
    const { dataInicio, dataTermino } = this.intervaloMesAtual();

    forkJoin({
      resumo: this.erp.obterResumoFinanceiro({ dataInicio, dataTermino }),
      movs: this.erp.buscarMovimentacoes({
        dataInicio,
        dataTermino,
        tipo: 'receita',
        tipoData: 'DataVencimento',
        itensPorPagina: 20,
        numeroDaPagina: 1
      })
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ resumo, movs }) => {
          this.resumo = resumo;
          this.ultimasReceitas = movs.movimentacoes || [];
          this.totalReceitasPeriodo = movs.totalReceitas ?? 0;
          this.totalRegistrosReceitas = movs.paginacao?.totalItens ?? this.ultimasReceitas.length;
          this.loading = false;
        },
        error: () => {
          this.error = 'Não foi possível carregar os dados financeiros. Tente novamente.';
          this.loading = false;
          this.resumo = null;
          this.ultimasReceitas = [];
        }
      });
  }

  private intervaloMesAtual(): {
    dataInicio: string;
    dataTermino: string;
    dataInicial: string;
    dataFinal: string;
  } {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const mm = String(m).padStart(2, '0');
    const ultimo = new Date(y, m, 0).getDate();
    const di = `${y}-${mm}-01`;
    const df = `${y}-${mm}-${String(ultimo).padStart(2, '0')}`;
    return { dataInicio: di, dataTermino: df, dataInicial: di, dataFinal: df };
  }

  formatCurrency(v: number | undefined | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      v == null || Number.isNaN(v) ? 0 : v
    );
  }

  fmtData(iso: string | undefined): string {
    if (!iso) {
      return '—';
    }
    const s = `${iso}`.slice(0, 10);
    if (s.length < 10) {
      return iso;
    }
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }

  nomeClienteOuFornecedor(m: MovimentacaoFinanceira): string {
    return (
      m.NomeClienteFornecedor ||
      m.NomeFantasiaClienteFornecedor ||
      m.RazaoSocialClienteFornecedor ||
      '—'
    );
  }

  descricaoMov(m: MovimentacaoFinanceira): string {
    return m.Nome || '—';
  }

  recebidoPendente(m: MovimentacaoFinanceira): 'recebido' | 'pendente' {
    return m.DataQuitacao && `${m.DataQuitacao}`.trim() !== '' ? 'recebido' : 'pendente';
  }
}
