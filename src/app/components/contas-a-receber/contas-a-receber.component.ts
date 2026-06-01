import { Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DOCUMENT, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ErpFinanceiroService, MovimentacaoFinanceira, FiltrosMovimentacoes } from '../../services/erp-financeiro.service';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';
import { LancamentosImportModalComponent } from '../../shared/components/lancamentos-import-modal/lancamentos-import-modal.component';
import { PeriodoRangePickerComponent } from '../../shared/components/periodo-range-picker/periodo-range-picker.component';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LinhaExportacaoReceber {
  'Cliente / origem': string;
  Vencimento: string;
  Recebimento: string;
  Descricao: string;
  Categoria: string;
  Valor: string;
  Status: string;
}

@Component({
  selector: 'app-contas-a-receber',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FeedbackStateComponent, LancamentosImportModalComponent, PeriodoRangePickerComponent],
  templateUrl: './contas-a-receber.component.html',
})
export class ContasAReceberComponent implements OnInit, OnDestroy {
  @ViewChild('menuCriarReceita', { read: ElementRef }) menuCriarReceitaRef?: ElementRef<HTMLElement>;

  /** Mesmo menu de “Criar receita” da tela Movimentações (navega para o cadastro com fluxo). */
  mostrarMenuCriarReceita = false;
  mostrarModalImportacao = false;

  // Datas selecionadas
  dataInicial: string = '';
  dataFinal: string = '';

  // Dados
  contas: MovimentacaoFinanceira[] = [];
  contasFiltradas: MovimentacaoFinanceira[] = [];
  loading: boolean = false;
  error: string | null = null;
  
  // Totais
  totalContas: number = 0;
  totalValor: number = 0; // Soma total dos títulos (valor original ou atual)
  totalRecebido: number = 0;  // Soma do que já foi pago (liquidado)
  totalPendente: number = 0; // Soma do que está em aberto

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalItens: number = 0;
  totalPaginas: number = 0;

  // Filtros
  filtrosUI = {
    status: '' as 'recebido' | 'pendente' | '',
    textoPesquisa: ''
  };

  // Opções para filtros
  statusOptions = [
    { value: '', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'recebido', label: 'Recebidas' }
  ];

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();

  private readonly fecharMenuReceitaMousedownCapture = (ev: Event): void => {
    const mev = ev as MouseEvent;
    if (mev.button !== 0 || !this.mostrarMenuCriarReceita) {
      return;
    }
    const t = mev.target as Node | null;
    if (!t) {
      return;
    }
    const host = this.menuCriarReceitaRef?.nativeElement;
    const path =
      typeof mev.composedPath === 'function' ? (mev.composedPath() as EventTarget[]) : [];
    const dentro = host && (path.length ? path.includes(host) : host.contains(t));
    if (!dentro) {
      this.mostrarMenuCriarReceita = false;
    }
  };

  constructor(
    private erpFinanceiroService: ErpFinanceiroService,
    public location: Location,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    
    // Debounce para pesquisa de texto
    this.textoPesquisaSubject.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(texto => {
      this.filtrosUI.textoPesquisa = texto;
      this.paginaAtual = 1;
      this.carregarContas();
    });
  }

  ngOnInit(): void {
    this.document.addEventListener('mousedown', this.fecharMenuReceitaMousedownCapture, true);
    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }
    this.carregarContas();
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('mousedown', this.fecharMenuReceitaMousedownCapture, true);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== Carregamento de Dados =====
  carregarContas(): void {
    this.loading = true;
    this.error = null;

    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }

    const filtros: FiltrosMovimentacoes = {
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined,
      tipo: 'receita', // Apenas contas a receber
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      statusPagamento: this.getStatusPagamentoFiltro(),
      numeroDaPagina: this.paginaAtual,
      itensPorPagina: this.itensPorPagina
    };

    this.erpFinanceiroService.buscarMovimentacoes(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.processarResposta(response);
        },
        error: (err: any) => {
          this.error = this.obterMensagemErro(err, 'Não foi possível carregar contas a receber.');
          this.loading = false;
        }
      });
  }

  private processarResposta(response: any): void {
    // A resposta do ERP retorna { movimentacoes, total, ... }
    const movimentacoes: MovimentacaoFinanceira[] = response.movimentacoes || [];
    this.contas = movimentacoes.filter(mov => this.isContaReceber(mov));

    // Só atualiza totais em busca nova (página 1) — nunca durante paginação
    if (this.paginaAtual === 1) {
      const totalBackend = response.total ?? response.total_de_registros ?? response.totalRegistros ?? null;
      this.totalItens = (totalBackend !== null && totalBackend > 0) ? totalBackend : this.contas.length;

      if (response.paginacao && response.paginacao.itensPorPagina) {
        this.itensPorPagina = response.paginacao.itensPorPagina;
      }

      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      this.aplicarFiltrosLocais();
      // Usa totalReceitas do backend se disponível (soma real de todos os registros)
      if (response.totalReceitas != null && response.totalReceitas > 0) {
        this.totalValor = response.totalReceitas;
        this.calcularTotaisParciais();
      } else {
        this.calcularTotais();
      }
    } else {
      if (response.paginacao && response.paginacao.itensPorPagina) {
        this.itensPorPagina = response.paginacao.itensPorPagina;
      }
      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      this.aplicarFiltrosLocais();
    }
     
     this.loading = false;
  }

  private getStatusPagamentoFiltro(): 'pendente' | 'recebido' | undefined {
    const status = this.filtrosUI.status;
    return status === 'pendente' || status === 'recebido' ? status : undefined;
  }

  private aplicarFiltrosLocais(): void {
    this.contasFiltradas = [...this.contas];
  }

  private calcularTotais(): void {
    this.totalContas = this.contasFiltradas.length;
    this.totalValor = 0;
    this.totalRecebido = 0;
    this.totalPendente = 0;

    this.contasFiltradas.forEach(conta => {
      const valor = conta.Valor || 0;
      this.totalValor += valor;

      if (this.isRecebido(conta)) {
        this.totalRecebido += valor;
      } else {
        this.totalPendente += valor;
      }
    });
  }

  // Calcula só recebido/pendente sem sobrescrever totalValor (já vem do backend)
  private calcularTotaisParciais(): void {
    this.totalContas = this.contasFiltradas.length;
    this.totalRecebido = 0;
    this.totalPendente = 0;

    this.contasFiltradas.forEach(conta => {
      const valor = conta.Valor || 0;
      if (this.isRecebido(conta)) {
        this.totalRecebido += valor;
      } else {
        this.totalPendente += valor;
      }
    });
  }

  private isRecebido(conta: MovimentacaoFinanceira): boolean {
    return !!conta.DataQuitacao;
  }

  private isContaReceber(conta: MovimentacaoFinanceira): boolean {
    if (typeof conta.Debito === 'boolean') {
      return conta.Debito === false;
    }

    const tipo = (conta.NomeTipoMovimentacao || '').toLowerCase();
    return tipo.includes('receita') || tipo.includes('receber');
  }

  private preencherMesAtual(): void {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    this.dataInicial = this.dateToStr(primeiroDia);
    this.dataFinal = this.dateToStr(ultimoDia);
  }

  onPeriodoAplicado(): void {
    this.paginaAtual = 1;
    this.carregarContas();
  }

  onPeriodoLimpar(): void {
    this.preencherMesAtual();
    this.paginaAtual = 1;
    this.carregarContas();
  }

  // ===== Filtros =====
  onFiltroChange(): void {
    this.paginaAtual = 1;
    this.carregarContas();
  }

  onTextoPesquisaChange(texto: string): void {
    this.textoPesquisaSubject.next(texto);
  }

  limparFiltros(): void {
    this.filtrosUI = {
      status: '',
      textoPesquisa: ''
    };
    this.paginaAtual = 1;
    this.carregarContas();
  }

  // ===== Paginação =====
  paginaAnterior(): void {
    if (this.paginaAtual > 1) {
      this.paginaAtual--;
      this.carregarContas();
    }
  }

  proximaPagina(): void {
    if (this.paginaAtual < this.totalPaginas) {
      this.paginaAtual++;
      this.carregarContas();
    }
  }

  irParaPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaAtual = pagina;
      this.carregarContas();
    }
  }

  getPaginasVisiveis(): number[] {
    const paginas: number[] = [];
    const maxVisiveis = 5;
    let inicio = Math.max(1, this.paginaAtual - Math.floor(maxVisiveis / 2));
    let fim = Math.min(this.totalPaginas, inicio + maxVisiveis - 1);
    
    if (fim - inicio < maxVisiveis - 1) {
      inicio = Math.max(1, fim - maxVisiveis + 1);
    }
    
    for (let i = inicio; i <= fim; i++) {
        paginas.push(i);
    }
    return paginas;
  }

  private dateToStr(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ===== Helpers de Formatação =====
  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const sanitized = dateStr.trim();

    try {
      if (sanitized.includes('/')) {
        const partes = sanitized.split('/');
        if (partes.length === 3) {
          const date = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
          return date.toLocaleDateString('pt-BR');
        }
        return sanitized;
      }

      const [anoStr, mesStr, diaStr] = sanitized.split('-');
      if (anoStr && mesStr && diaStr) {
        const ano = parseInt(anoStr, 10);
        const mes = parseInt(mesStr, 10) - 1;
        const dia = parseInt(diaStr, 10);
        if (!Number.isNaN(ano) && !Number.isNaN(mes) && !Number.isNaN(dia)) {
          const date = new Date(ano, mes, dia);
          return date.toLocaleDateString('pt-BR');
        }
      }

      const date = new Date(sanitized);
      if (Number.isNaN(date.getTime())) {
        return sanitized;
      }
      return date.toLocaleDateString('pt-BR');
    } catch {
      return sanitized;
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  /**
   * Cliente só faz sentido quando há terceiro (venda, contrato etc.).
   * Aporte financeiro é interno à empresa (contexto já definido pelo login).
   */
  rotuloClienteContaReceber(conta: MovimentacaoFinanceira): string {
    const nome = [conta.NomeClienteFornecedor, conta.NomeFantasiaClienteFornecedor, conta.RazaoSocialClienteFornecedor]
      .map((x) => (x != null ? String(x).trim() : ''))
      .find((t) => t.length > 0);
    if (nome) {
      return nome;
    }
    if (this.isAporteFinanceiroConta(conta)) {
      return 'Aporte financeiro';
    }
    return 'Cliente não informado';
  }

  private isAporteFinanceiroConta(conta: MovimentacaoFinanceira): boolean {
    if (conta.Debito) {
      return false;
    }
    const metaRaw = conta.MetadataJson;
    if (metaRaw && String(metaRaw).trim()) {
      try {
        const o = JSON.parse(String(metaRaw)) as { fluxoReceita?: string };
        if (o?.fluxoReceita === 'aporte') {
          return true;
        }
      } catch {
        /* ignore */
      }
    }
    const blob = `${conta.Nome || ''} ${conta.Observacao || ''}`.toLowerCase();
    return blob.includes('aporte financeiro') || blob.includes('fluxo receita: aporte');
  }

  getMaxItemPagina(): number {
    return Math.min(this.paginaAtual * this.itensPorPagina, this.totalItens);
  }

  getStatusBadgeClass(conta: MovimentacaoFinanceira): string {
    if (this.isRecebido(conta)) {
      return 'bg-emerald-100 text-emerald-800';
    }
    // Verifica se venceu
    if (conta.DataVencimento) {
      const hoje = this.dateToStr(new Date());
      if (conta.DataVencimento < hoje) {
        return 'bg-red-100 text-red-800';
      }
    }
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusLabel(conta: MovimentacaoFinanceira): string {
    if (this.isRecebido(conta)) { return 'RECEBIDO'; }
    if (conta.DataVencimento) {
      const hoje = this.dateToStr(new Date());
      if (conta.DataVencimento < hoje) {
        return 'ATRASADO';
      }
    }
    return 'PENDENTE';
  }

  // ===== Exportação =====
  exportarExcel(): void {
    const linhas = this.obterLinhasExportacao();
    if (linhas.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(linhas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ContasReceber');
    XLSX.writeFile(workbook, `contas-a-receber_${this.getDataArquivo()}.xlsx`);
  }

  exportarPDF(): void {
    const linhas = this.obterLinhasExportacao();
    if (linhas.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text('Contas a Receber', 40, 36);
    doc.setFontSize(9);
    doc.text(`Periodo: ${this.formatDate(this.dataInicial)} a ${this.formatDate(this.dataFinal)}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [[
        'Cliente / origem',
        'Vencimento',
        'Recebimento',
        'Descricao',
        'Categoria',
        'Valor',
        'Status',
      ]],
      body: linhas.map((l) => [
        l['Cliente / origem'],
        l.Vencimento,
        l.Recebimento,
        l.Descricao,
        l.Categoria,
        l.Valor,
        l.Status,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    doc.save(`contas-a-receber_${this.getDataArquivo()}.pdf`);
  }

  private obterLinhasExportacao(): LinhaExportacaoReceber[] {
    return (this.contasFiltradas || []).map((conta) => ({
      'Cliente / origem': this.rotuloClienteContaReceber(conta),
      Vencimento: this.formatDate(conta.DataVencimento),
      Recebimento: this.formatDate(conta.DataQuitacao) || '-',
      Descricao: conta.Observacao || conta.Nome || '-',
      Categoria: conta.NomeCategoriaFinanceira || '-',
      Valor: this.formatCurrency(conta.Valor || 0),
      Status: this.getStatusLabel(conta),
    }));
  }

  private getDataArquivo(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private obterMensagemErro(err: unknown, fallback: string): string {
    const errorAny = err as any;
    return (
      errorAny?.error?.mensagem ||
      errorAny?.error?.message ||
      errorAny?.message ||
      fallback
    );
  }
}
