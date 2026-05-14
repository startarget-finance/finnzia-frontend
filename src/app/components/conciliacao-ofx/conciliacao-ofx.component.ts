import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import {
  ConciliacaoOfxItem,
  ErpFinanceiroService,
  OfxImportResponse,
} from '../../services/erp-financeiro.service';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  ContaBancariaCadastro,
  ContaBancariaCadastroService,
} from '../../services/conta-bancaria-cadastro.service';

@Component({
  selector: 'app-conciliacao-ofx',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './conciliacao-ofx.component.html',
})
export class ConciliacaoOfxComponent implements OnInit, OnDestroy {
  loading = false;
  importando = false;
  aprovandoId: number | null = null;
  error: string | null = null;
  feedback: { tipo: 'sucesso' | 'erro'; mensagem: string } | null = null;

  ofxSelecionado: File | null = null;
  ultimaContaConciliada: string | null = null;

  /** Conta cadastrada vinculada ao extrato OFX (nome amigável + id no backend). */
  contasParaImportacao: ContaBancariaCadastro[] = [];
  contaImportacaoId: string = '';

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
    private companySelectorService: CompanySelectorService,
    private contaBancariaCadastroService: ContaBancariaCadastroService,
  ) {}

  ngOnInit(): void {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    this.filtros.dataInicio = this.toIsoDate(inicioMes);
    this.filtros.dataFim = this.toIsoDate(hoje);
    this.carregarContasParaImportacao();
    this.companySelectorService.empresaSelecionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.carregarContasParaImportacao());
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

  labelConta(c: ContaBancariaCadastro): string {
    const nome = (c.nomeConta && c.nomeConta.trim()) || c.banco || 'Conta';
    const ag = [c.agencia, c.conta].filter((x) => !!x && String(x).trim()).join(' / ');
    return ag ? `${nome} (${ag})` : nome;
  }

  private contaIdImportacaoSelecionado(): number | null {
    const s = (this.contaImportacaoId || '').trim();
    if (!s) {
      return null;
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private carregarContasParaImportacao(): void {
    const idEmp = this.companySelectorService.obterIdEmpresaSelecionada();
    if (!idEmp) {
      this.contasParaImportacao = [];
      return;
    }
    this.contaBancariaCadastroService
      .listar({ idEmpresa: idEmp, page: 0, size: 500, ativo: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.contasParaImportacao = page.content || [];
          if (
            this.contaImportacaoId &&
            !this.contasParaImportacao.some((c) => String(c.id) === this.contaImportacaoId)
          ) {
            this.contaImportacaoId = '';
          }
        },
        error: () => {
          this.contasParaImportacao = [];
        },
      });
  }

  importarArquivo(): void {
    if (!this.ofxSelecionado) {
      this.feedback = { tipo: 'erro', mensagem: 'Selecione um arquivo OFX para importar.' };
      return;
    }

    if (this.contasParaImportacao.length > 0 && this.contaIdImportacaoSelecionado() == null) {
      this.feedback = {
        tipo: 'erro',
        mensagem:
          'Selecione a conta cadastrada correspondente a este OFX. Assim os lançamentos aparecem com nome profissional e vínculo correto.',
      };
      return;
    }

    const idConta = this.contaIdImportacaoSelecionado();
    const contaSel = idConta != null ? this.contasParaImportacao.find((c) => c.id === idConta) : undefined;
    const opts =
      idConta != null && contaSel
        ? { idContaBancaria: idConta, nomeContaExibicao: this.labelConta(contaSel) }
        : undefined;

    this.importando = true;
    this.feedback = null;
    this.erpFinanceiroService.importarOfx(this.ofxSelecionado, opts)
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
          this.ultimaContaConciliada = (res.conta || '').trim() || null;
          const sufixoConta = this.ultimaContaConciliada
            ? ` Conta conciliada: ${this.ultimaContaConciliada}.`
            : '';
          this.feedback = {
            tipo: 'sucesso',
            mensagem: `Importação concluída (pré-aprovação): ${res.importadas ?? 0} lançamentos pendentes, ${res.ignoradasDuplicadas ?? 0} duplicadas ignoradas.${sufixoConta}`,
          };
          this.carregar();
        },
        error: (err: any) => {
          this.feedback = { tipo: 'erro', mensagem: err?.error?.mensagem || 'Erro ao importar OFX.' };
        },
      });
  }

  tamanhoArquivoSelecionado(): string {
    if (!this.ofxSelecionado) return '';
    const bytes = this.ofxSelecionado.size || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  async excluir(item: ConciliacaoOfxItem): Promise<void> {
    if (!item?.id) return;
    const confirmado = await this.confirmarAcao({
      titulo: 'Excluir importação OFX?',
      texto: 'Essa ação remove o registro da importação do histórico.',
      confirmarTexto: 'Sim, excluir',
      tipo: 'warning',
    });
    if (!confirmado) return;

    this.erpFinanceiroService.excluirConciliacaoOfx(item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.itens = this.itens.filter(i => i.id !== item.id);
          this.aplicarFiltroLocal();
          this.alertaSucesso('Importação removida com sucesso.');
        },
        error: (err: any) => {
          this.feedback = { tipo: 'erro', mensagem: err?.error?.mensagem || 'Não foi possível excluir.' };
          this.alertaErro(err?.error?.mensagem || 'Não foi possível excluir a importação.');
        },
      });
  }

  async aprovar(item: ConciliacaoOfxItem): Promise<void> {
    if (!item?.id) return;
    if ((item.status || '').toUpperCase() === 'CONCILIADO') {
      this.feedback = { tipo: 'sucesso', mensagem: 'Este lote OFX já está aprovado.' };
      this.alertaSucesso('Este lote já está aprovado.');
      return;
    }
    const confirmado = await this.confirmarAcao({
      titulo: 'Aprovar lote OFX?',
      texto: 'Os lançamentos pendentes deste lote serão conciliados.',
      confirmarTexto: 'Aprovar lote',
      tipo: 'question',
    });
    if (!confirmado) return;

    this.aprovandoId = item.id;
    this.erpFinanceiroService.aprovarConciliacaoOfx(item.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.aprovandoId = null)),
      )
      .subscribe({
        next: (res) => {
          if (res.erro) {
            this.feedback = { tipo: 'erro', mensagem: res.mensagem || 'Não foi possível aprovar a importação.' };
            return;
          }
          this.feedback = {
            tipo: 'sucesso',
            mensagem: `Pré-aprovação concluída: ${res.aprovadasAgora ?? 0} lançamentos aprovados. Pendentes: ${res.pendentesTotal ?? 0}.`,
          };
          this.alertaSucesso(`Lote aprovado: ${res.aprovadasAgora ?? 0} lançamentos conciliados.`);
          this.carregar();
        },
        error: (err: any) => {
          this.feedback = { tipo: 'erro', mensagem: err?.error?.mensagem || 'Erro ao aprovar importação OFX.' };
          this.alertaErro(err?.error?.mensagem || 'Erro ao aprovar importação OFX.');
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

  /** Badge na grade: OFX manual/automático vs Open Finance (Pluggy). */
  labelTipoImportacao(item: ConciliacaoOfxItem): string {
    const t = (item.tipo || '').toUpperCase();
    if (t === 'PLUGGY') return 'Open Finance';
    return item.tipo || '—';
  }

  badgeClassTipoImportacao(item: ConciliacaoOfxItem): string {
    const t = (item.tipo || '').toUpperCase();
    if (t === 'PLUGGY') return 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80';
    if (t === 'AUTOMATICO') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-700';
  }

  isLoteSemNovosLancamentos(item: ConciliacaoOfxItem): boolean {
    const total = item.total ?? 0;
    const ignoradas = item.ignoradas ?? 0;
    const pendentes = item.pendentes ?? 0;
    const conciliadas = item.conciliadas ?? 0;
    return total > 0 && ignoradas >= total && pendentes === 0 && conciliadas === 0;
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async confirmarAcao(config: {
    titulo: string;
    texto: string;
    confirmarTexto: string;
    tipo: 'warning' | 'question';
  }): Promise<boolean> {
    const result = await Swal.fire({
      title: config.titulo,
      text: config.texto,
      icon: config.tipo,
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: config.confirmarTexto,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      background: '#ffffff',
    });
    return !!result.isConfirmed;
  }

  private alertaSucesso(mensagem: string): void {
    void Swal.fire({
      title: 'Tudo certo',
      text: mensagem,
      icon: 'success',
      timer: 1700,
      showConfirmButton: false,
    });
  }

  private alertaErro(mensagem: string): void {
    void Swal.fire({
      title: 'Ops',
      text: mensagem,
      icon: 'error',
      confirmButtonText: 'Fechar',
      confirmButtonColor: '#dc2626',
    });
  }
}

