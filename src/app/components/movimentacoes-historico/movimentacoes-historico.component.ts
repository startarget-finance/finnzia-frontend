import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import { MovimentacoesHistoricoService } from '../../services/movimentacoes-historico.service';
import type { HistoricoMovimentacaoAcao, HistoricoMovimentacaoItem } from '../../services/movimentacoes-historico.service';

@Component({
  selector: 'app-movimentacoes-historico',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './movimentacoes-historico.component.html',
})
export class MovimentacoesHistoricoComponent implements OnInit, OnDestroy {
  itens: HistoricoMovimentacaoItem[] = [];
  restaurandoId: number | null = null;
  erro: string | null = null;
  loading = false;

  filtroAcao: HistoricoMovimentacaoAcao | '' = '';
  filtroDataInicio = '';
  filtroDataFim = '';
  paginaAtual = 1;
  itensPorPagina = 20;
  totalItens = 0;
  totalPaginas = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly companySelector: CompanySelectorService,
    private readonly historicoService: MovimentacoesHistoricoService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.carregar());
    this.carregar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregar(): void {
    this.erro = null;
    const idEmpresa = this.companySelector.obterIdEmpresaSelecionada();
    if (!idEmpresa) {
      this.itens = [];
      return;
    }
    this.loading = true;
    this.historicoService
      .listar({
        acao: this.filtroAcao,
        dataInicio: this.filtroDataInicio || undefined,
        dataFim: this.filtroDataFim || undefined,
        itensPorPagina: this.itensPorPagina,
        numeroDaPagina: this.paginaAtual,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.loading = false;
          this.itens = resp?.itens || [];
          this.totalItens = resp?.paginacao?.totalItens || 0;
          this.totalPaginas = resp?.paginacao?.totalPaginas || 0;
        },
        error: (e) => {
          this.loading = false;
          this.erro = e?.error?.mensagem || 'Não foi possível carregar o histórico.';
          this.itens = [];
        },
      });
  }

  aplicarFiltros(): void {
    this.paginaAtual = 1;
    this.carregar();
  }

  limparFiltros(): void {
    this.filtroAcao = '';
    this.filtroDataInicio = '';
    this.filtroDataFim = '';
    this.paginaAtual = 1;
    this.carregar();
  }

  irParaPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas || pagina === this.paginaAtual) {
      return;
    }
    this.paginaAtual = pagina;
    this.carregar();
  }

  async restaurar(item: HistoricoMovimentacaoItem): Promise<void> {
    const idEmpresa = this.companySelector.obterIdEmpresaSelecionada();
    if (!idEmpresa) {
      this.erro = 'Selecione uma empresa antes de restaurar.';
      return;
    }

    const conf = await Swal.fire({
      icon: 'question',
      title: 'Restaurar movimentação?',
      text: `Será criado um novo lançamento com os dados de "${item.descricao}".`,
      showCancelButton: true,
      confirmButtonText: 'Restaurar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#334155',
      reverseButtons: true,
    });
    if (!conf.isConfirmed) {
      return;
    }

    this.restaurandoId = item.id;
    this.historicoService
      .restaurar(item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          this.carregar();
          this.restaurandoId = null;
          await Swal.fire({
            icon: 'success',
            title: 'Movimentação restaurada',
            text: 'A movimentação foi recriada com sucesso.',
            timer: 1800,
            showConfirmButton: false,
          });
        },
        error: async (e) => {
          this.restaurandoId = null;
          this.erro = e?.error?.mensagem || 'Não foi possível restaurar a movimentação.';
          await Swal.fire({
            icon: 'error',
            title: 'Falha ao restaurar',
            text: this.erro || 'Não foi possível restaurar a movimentação.',
            confirmButtonColor: '#dc2626',
          });
        },
      });
  }

  labelAcao(item: HistoricoMovimentacaoItem): string {
    return item.acao === 'EDICAO' ? 'Backup antes da edição' : 'Criação';
  }

  formatarData(iso: string): string {
    if (!iso) return '-';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString('pt-BR');
  }
}
