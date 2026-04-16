import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  ConciliacaoOfxItem,
  ErpFinanceiroService,
  OfxImportResponse,
} from '../../services/erp-financeiro.service';

@Component({
  selector: 'app-conciliacao-ofx',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './conciliacao-ofx.component.html',
})
export class ConciliacaoOfxComponent implements OnInit, OnDestroy {
  loading = false;
  importando = false;
  error: string | null = null;
  feedback: { tipo: 'sucesso' | 'erro'; mensagem: string } | null = null;

  ofxSelecionado: File | null = null;

  filtros = {
    status: '',
    tipo: '',
    conta: '',
    dataInicio: '',
    dataFim: '',
    pesquisa: '',
  };

  itens: ConciliacaoOfxItem[] = [];
  itensFiltrados: ConciliacaoOfxItem[] = [];
  contasDisponiveis: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private erpFinanceiroService: ErpFinanceiroService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    this.filtros.dataInicio = this.toIsoDate(inicioMes);
    this.filtros.dataFim = this.toIsoDate(hoje);
    this.carregar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSelecionarArquivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ofxSelecionado = input?.files?.[0] ?? null;
    this.feedback = null;
  }

  importarArquivo(): void {
    if (!this.ofxSelecionado) {
      this.feedback = { tipo: 'erro', mensagem: 'Selecione um arquivo OFX para importar.' };
      return;
    }

    this.importando = true;
    this.feedback = null;
    this.erpFinanceiroService.importarOfx(this.ofxSelecionado)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.importando = false;
          this.ofxSelecionado = null;
        }),
      )
      .subscribe({
        next: (res: OfxImportResponse) => {
          if (res.erro) {
            this.feedback = { tipo: 'erro', mensagem: res.mensagem || 'Falha ao importar OFX.' };
            return;
          }
          this.feedback = {
            tipo: 'sucesso',
            mensagem: `Importação concluída: ${res.importadas ?? 0} novas, ${res.ignoradasDuplicadas ?? 0} duplicadas ignoradas.`,
          };
          this.carregar();
        },
        error: (err: any) => {
          this.feedback = { tipo: 'erro', mensagem: err?.error?.mensagem || 'Erro ao importar OFX.' };
        },
      });
  }

  carregar(): void {
    this.loading = true;
    this.error = null;
    this.erpFinanceiroService.listarConciliacoesOfx({
      dataInicio: this.filtros.dataInicio || undefined,
      dataFim: this.filtros.dataFim || undefined,
      status: this.filtros.status || undefined,
      tipo: this.filtros.tipo || undefined,
      conta: this.filtros.conta || undefined,
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (res) => {
          this.itens = res.itens || [];
          this.contasDisponiveis = Array.from(
            new Set(
              (this.itens || [])
                .map(i => (i.conta || '').trim())
                .filter(v => !!v),
            ),
          ).sort((a, b) => a.localeCompare(b));
          if (this.filtros.conta && !this.contasDisponiveis.includes(this.filtros.conta)) {
            this.filtros.conta = '';
          }
          this.aplicarFiltroLocal();
        },
        error: (err: any) => {
          this.error = err?.error?.mensagem || 'Erro ao carregar conciliações.';
        },
      });
  }

  aplicarFiltroLocal(): void {
    const q = (this.filtros.pesquisa || '').trim().toLowerCase();
    if (!q) {
      this.itensFiltrados = [...this.itens];
      return;
    }
    this.itensFiltrados = this.itens.filter(i =>
      [i.arquivoNome, i.banco, i.conta, i.nomeEmpresa, i.tipo, i.status]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)),
    );
  }

  excluir(item: ConciliacaoOfxItem): void {
    if (!item?.id) return;
    if (!confirm('Excluir este registro de conciliação?')) return;

    this.erpFinanceiroService.excluirConciliacaoOfx(item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.itens = this.itens.filter(i => i.id !== item.id);
          this.aplicarFiltroLocal();
        },
        error: (err: any) => {
          this.feedback = { tipo: 'erro', mensagem: err?.error?.mensagem || 'Não foi possível excluir.' };
        },
      });
  }

  abrirMovimentacoes(item: ConciliacaoOfxItem): void {
    this.router.navigate(['/movimentacoes'], {
      queryParams: {
        dataInicial: item.periodoInicio || undefined,
        dataFinal: item.periodoFim || undefined,
      },
    });
  }

  formatDate(v?: string | null): string {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR');
  }

  formatDateTime(v?: string | null): string {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

