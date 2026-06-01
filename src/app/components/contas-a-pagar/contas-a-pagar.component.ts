import { Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DOCUMENT, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ErpFinanceiroService, MovimentacaoFinanceira, FiltrosMovimentacoes, ResumoFinanceiroResponse } from '../../services/erp-financeiro.service';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';
import { LancamentosImportModalComponent } from '../../shared/components/lancamentos-import-modal/lancamentos-import-modal.component';
import { PeriodoRangePickerComponent } from '../../shared/components/periodo-range-picker/periodo-range-picker.component';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LinhaExportacaoPagar {
  Fornecedor: string;
  Vencimento: string;
  Pagamento: string;
  Descricao: string;
  Categoria: string;
  Valor: string;
  Status: string;
}

@Component({
  selector: 'app-contas-a-pagar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FeedbackStateComponent, LancamentosImportModalComponent, PeriodoRangePickerComponent],
  templateUrl: './contas-a-pagar.component.html',
})
export class ContasAPagarComponent implements OnInit, OnDestroy {
  @ViewChild('menuCriarDespesa', { read: ElementRef }) menuCriarDespesaRef?: ElementRef<HTMLElement>;

  mostrarMenuCriarDespesa = false;
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
  totalPago: number = 0;  // Soma do que já foi pago (liquidado)
  totalPendente: number = 0; // Soma do que está em aberto

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalItens: number = 0;
  totalPaginas: number = 0;

  // Filtros
  filtrosUI = {
    status: '' as 'todas' | 'pago' | 'pendente' | '',
    textoPesquisa: '',
    buscaFornecedor: '',
    buscaCategoria: ''
  };

  // Opções para filtros
  statusOptions = [
    { value: '', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'pago', label: 'Pagas' }
  ];

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();
  private buscaFornecedorSubject = new Subject<string>();
  private buscaCategoriaSubject = new Subject<string>();

  private readonly fecharMenuDespesaMousedownCapture = (ev: Event): void => {
    const mev = ev as MouseEvent;
    if (mev.button !== 0 || !this.mostrarMenuCriarDespesa) {
      return;
    }
    const t = mev.target as Node | null;
    if (!t) {
      return;
    }
    const host = this.menuCriarDespesaRef?.nativeElement;
    const path =
      typeof mev.composedPath === 'function' ? (mev.composedPath() as EventTarget[]) : [];
    const dentro = host && (path.length ? path.includes(host) : host.contains(t));
    if (!dentro) {
      this.mostrarMenuCriarDespesa = false;
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

    this.buscaFornecedorSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((texto) => {
      this.filtrosUI.buscaFornecedor = texto;
      this.paginaAtual = 1;
      this.carregarContas();
    });

    this.buscaCategoriaSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((texto) => {
      this.filtrosUI.buscaCategoria = texto;
      this.paginaAtual = 1;
      this.carregarContas();
    });
  }

  ngOnInit(): void {
    this.document.addEventListener('mousedown', this.fecharMenuDespesaMousedownCapture, true);
    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }
    this.carregarContas();
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('mousedown', this.fecharMenuDespesaMousedownCapture, true);
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
      tipo: 'despesa', // Apenas contas a pagar
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      buscaFornecedor: this.filtrosUI.buscaFornecedor?.trim() || undefined,
      buscaCategoria: this.filtrosUI.buscaCategoria?.trim() || undefined,
      numeroDaPagina: this.paginaAtual,
      itensPorPagina: this.itensPorPagina
    };

    // Totais dos cards vêm do resumo (mesmo endpoint do Relatório) para bater o valor entre as telas
    if (this.paginaAtual === 1 && this.dataInicial && this.dataFinal) {
      this.erpFinanceiroService.obterResumoFinanceiro({
        dataInicio: this.dataInicial,
        dataTermino: this.dataFinal
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (resumo: ResumoFinanceiroResponse) => {
          const pagar = resumo?.contasPagar;
          if (pagar) {
            this.totalValor = pagar.totalGeral ?? 0;
            this.totalPago = pagar.totalLiquidado ?? 0;
            this.totalPendente = pagar.totalPendente ?? 0;
          }
        },
        error: () => { /* em caso de falha, totais serão preenchidos pelo processarResposta se backend enviar totais */ }
      });
    }

    this.erpFinanceiroService.buscarMovimentacoes(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.processarResposta(response);
        },
        error: (err: any) => {
          this.error = this.obterMensagemErro(err, 'Não foi possível carregar contas a pagar.');
          this.loading = false;
        }
      });
  }

  private processarResposta(response: any): void {
    // A resposta do ERP retorna { movimentacoes, total, ... }
    const movimentacoes: MovimentacaoFinanceira[] = response.movimentacoes || [];
    this.contas = movimentacoes.filter(mov => this.isContaPagar(mov));

    // Só atualiza totais de contagem/paginação em busca nova (página 1). Valor/Pago/Pendente vêm do resumo.
    if (this.paginaAtual === 1) {
      const totalBackend = response.total ?? response.total_de_registros ?? response.totalRegistros ?? null;
      this.totalItens = (totalBackend !== null && totalBackend > 0) ? totalBackend : this.contas.length;

      if (response.paginacao && response.paginacao.itensPorPagina) {
        this.itensPorPagina = response.paginacao.itensPorPagina;
      }

      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      this.aplicarFiltrosLocais();
      // Fallback: preenche totais com a primeira página; o resumo (quando chegar) sobrescreve para bater com o Relatório
      if (response.totalDespesas != null && response.totalDespesas > 0) {
        this.totalValor = response.totalDespesas;
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

  private aplicarFiltrosLocais(): void {
    let filtradas = [...this.contas];

    // Filtro por status
    if (this.filtrosUI.status === 'pago') {
      filtradas = filtradas.filter(c => this.isPago(c));
    } else if (this.filtrosUI.status === 'pendente') {
      filtradas = filtradas.filter(c => !this.isPago(c));
    }

    if (this.filtrosUI.buscaFornecedor?.trim()) {
      const termo = this.normalizarTextoBusca(this.filtrosUI.buscaFornecedor);
      filtradas = filtradas.filter((c) => this.nomeFornecedorNormalizado(c).includes(termo));
    }

    if (this.filtrosUI.buscaCategoria?.trim()) {
      const termo = this.normalizarTextoBusca(this.filtrosUI.buscaCategoria);
      filtradas = filtradas.filter((c) => this.categoriaNormalizada(c).includes(termo));
    }

    this.contasFiltradas = filtradas;
  }

  private calcularTotais(): void {
    this.totalContas = this.contasFiltradas.length;
    this.totalValor = 0;
    this.totalPago = 0;
    this.totalPendente = 0;

    this.contasFiltradas.forEach(conta => {
      const valor = conta.Valor || 0;
      this.totalValor += valor;

      if (this.isPago(conta)) {
        this.totalPago += valor;
      } else {
        this.totalPendente += valor;
      }
    });
  }

  // Calcula só pago/pendente sem sobrescrever totalValor (já vem do backend)
  private calcularTotaisParciais(): void {
    this.totalContas = this.contasFiltradas.length;
    this.totalPago = 0;
    this.totalPendente = 0;

    this.contasFiltradas.forEach(conta => {
      const valor = conta.Valor || 0;
      if (this.isPago(conta)) {
        this.totalPago += valor;
      } else {
        this.totalPendente += valor;
      }
    });
  }

  private isPago(conta: MovimentacaoFinanceira): boolean {
    return !!conta.DataQuitacao;
  }

  private isContaPagar(conta: MovimentacaoFinanceira): boolean {
    if (typeof conta.Debito === 'boolean') {
      return conta.Debito === true;
    }

    const tipo = (conta.NomeTipoMovimentacao || '').toLowerCase();
    return tipo.includes('despesa') || tipo.includes('pagar');
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
    // Filtros de status são locais
    this.aplicarFiltrosLocais();
    this.calcularTotais();
  }

  onTextoPesquisaChange(texto: string): void {
    this.textoPesquisaSubject.next(texto);
  }

  onBuscaFornecedorChange(texto: string): void {
    this.buscaFornecedorSubject.next(texto);
  }

  limparBuscaFornecedor(): void {
    this.filtrosUI.buscaFornecedor = '';
    this.paginaAtual = 1;
    this.carregarContas();
  }

  onBuscaCategoriaChange(texto: string): void {
    this.buscaCategoriaSubject.next(texto);
  }

  limparBuscaCategoria(): void {
    this.filtrosUI.buscaCategoria = '';
    this.paginaAtual = 1;
    this.carregarContas();
  }

  private normalizarTextoBusca(valor: string): string {
    return (valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private nomeFornecedorNormalizado(conta: MovimentacaoFinanceira): string {
    const partes = [
      conta.NomeClienteFornecedor,
      conta.NomeFantasiaClienteFornecedor,
      conta.RazaoSocialClienteFornecedor,
    ]
      .filter((p) => !!p && String(p).trim())
      .map((p) => this.normalizarTextoBusca(String(p)));
    return partes.join(' ');
  }

  private categoriaNormalizada(conta: MovimentacaoFinanceira): string {
    const partes = [conta.NomeCategoriaFinanceira];
    if (conta.Valores?.length) {
      for (const v of conta.Valores) {
        if (v.Categoria) {
          partes.push(v.Categoria);
        }
        if (v.NomeCategoriaRoot) {
          partes.push(v.NomeCategoriaRoot);
        }
      }
    }
    return partes
      .filter((p) => !!p && String(p).trim())
      .map((p) => this.normalizarTextoBusca(String(p)))
      .join(' ');
  }

  limparFiltros(): void {
    this.filtrosUI = {
      status: '',
      textoPesquisa: '',
      buscaFornecedor: '',
      buscaCategoria: ''
    };
    this.carregarContas(); // Recarrega do backend limpo
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
    if (!dateStr) return '-';
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

  getMaxItemPagina(): number {
    return Math.min(this.paginaAtual * this.itensPorPagina, this.totalItens);
  }

  getStatusBadgeClass(conta: MovimentacaoFinanceira): string {
    if (this.isPago(conta)) {
      return 'bg-green-100 text-green-800';
    }
    if (conta.DataVencimento) {
      const hoje = this.dateToStr(new Date());
      if (conta.DataVencimento < hoje) {
        return 'bg-red-100 text-red-800';
      }
    }
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusLabel(conta: MovimentacaoFinanceira): string {
    if (this.isPago(conta)) {
      return 'PAGO';
    }
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ContasPagar');
    XLSX.writeFile(workbook, `contas-a-pagar_${this.getDataArquivo()}.xlsx`);
  }

  exportarPDF(): void {
    const linhas = this.obterLinhasExportacao();
    if (linhas.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text('Contas a Pagar', 40, 36);
    doc.setFontSize(9);
    doc.text(`Periodo: ${this.formatDate(this.dataInicial)} a ${this.formatDate(this.dataFinal)}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [[
        'Fornecedor',
        'Vencimento',
        'Pagamento',
        'Descricao',
        'Categoria',
        'Valor',
        'Status',
      ]],
      body: linhas.map((l) => [
        l.Fornecedor,
        l.Vencimento,
        l.Pagamento,
        l.Descricao,
        l.Categoria,
        l.Valor,
        l.Status,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    doc.save(`contas-a-pagar_${this.getDataArquivo()}.pdf`);
  }

  private obterLinhasExportacao(): LinhaExportacaoPagar[] {
    return (this.contasFiltradas || []).map((conta) => ({
      Fornecedor: conta.NomeClienteFornecedor || 'Fornecedor nao informado',
      Vencimento: this.formatDate(conta.DataVencimento),
      Pagamento: this.formatDate(conta.DataQuitacao) || '-',
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
