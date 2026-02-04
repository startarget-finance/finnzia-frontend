import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { OmieService, MovimentacaoOmie, ContasPagarResponse, FiltrosMovimentacoesOmie } from '../../services/omie.service';

@Component({
  selector: 'app-contas-a-pagar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './contas-a-pagar.component.html',
})
export class ContasAPagarComponent implements OnInit, OnDestroy {
  // UI: Date Range Picker
  mostrarRangePicker: boolean = false;
  visibleMonth: Date = new Date();
  calendarDays: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];
  private tempRangeStart: string | null = null;
  private tempRangeEnd: string | null = null;
  private hoverRangeDate: string | null = null;
  
  // Datas selecionadas
  dataInicial: string = '';
  dataFinal: string = '';

  // Dados
  contas: MovimentacaoOmie[] = [];
  contasFiltradas: MovimentacaoOmie[] = [];
  loading: boolean = false;
  error: string | null = null;
  
  // Totais
  totalContas: number = 0;
  totalValor: number = 0;
  totalPago: number = 0;
  totalPendente: number = 0;

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalItens: number = 0;
  totalPaginas: number = 0;

  // Filtros
  filtrosUI = {
    status: '' as 'todas' | 'pago' | 'pendente' | '',
    textoPesquisa: ''
  };

  // Opções para filtros
  statusOptions = [
    { value: '', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'pago', label: 'Pagas' }
  ];

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();

  constructor(
    private omieService: OmieService
  ) {
    this.visibleMonth = new Date();
    this.buildCalendar();
    
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
    // Define período padrão se não houver datas selecionadas
    if (!this.dataInicial || !this.dataFinal) {
      const hoje = new Date();
      const primeiroDiaAno = new Date(hoje.getFullYear(), 0, 1);
      this.dataInicial = primeiroDiaAno.toISOString().split('T')[0];
      this.dataFinal = hoje.toISOString().split('T')[0];
    }
    
    this.carregarContas();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== Carregamento de Dados =====
  carregarContas(): void {
    this.loading = true;
    this.error = null;

    const filtros: FiltrosMovimentacoesOmie = {
      dataInicio: this.dataInicial || undefined,
      dataFim: this.dataFinal || undefined,
      pagina: this.paginaAtual,
      registrosPorPagina: this.itensPorPagina
    };

    console.log('🔍 Carregando contas a pagar com filtros:', filtros);
    
    this.omieService.listarContasPagar(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ContasPagarResponse) => {
          this.processarResposta(response);
        },
        error: (err: any) => {
          console.error('Erro ao carregar contas a pagar:', err);
          this.error = err.error?.mensagem || 'Erro ao carregar contas a pagar';
          this.loading = false;
        }
      });
  }

  private processarResposta(response: ContasPagarResponse): void {
    this.contas = response.registros || [];
    this.totalItens = response.total_de_registros || 0;
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Aplica filtros locais
    this.aplicarFiltrosLocais();
    
    // Calcula totais
    this.calcularTotais();
    
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

    // Filtro por texto
    if (this.filtrosUI.textoPesquisa) {
      const texto = this.filtrosUI.textoPesquisa.toLowerCase();
      filtradas = filtradas.filter(c => {
        const nome = (c.nome_cliente_fornecedor || '').toLowerCase();
        const codigoCliente = (c.codigo_cliente_fornecedor || '').toString().toLowerCase();
        const numeroDoc = (c.numero_documento || '').toString().toLowerCase();
        const numeroParcela = (c.numero_parcela || '').toString().toLowerCase();
        const observacao = (c.observacao || '').toLowerCase();
        const statusTitulo = ((c['status_titulo'] || c['status'] || '')).toString().toLowerCase();
        
        return nome.includes(texto) || 
               codigoCliente.includes(texto) ||
               numeroDoc.includes(texto) ||
               numeroParcela.includes(texto) ||
               observacao.includes(texto) ||
               statusTitulo.includes(texto);
      });
    }

    this.contasFiltradas = filtradas;
  }

  private calcularTotais(): void {
    this.totalContas = this.contas.length;
    this.totalValor = 0;
    this.totalPago = 0;
    this.totalPendente = 0;

    this.contas.forEach(conta => {
      const valor = conta.valor_documento || conta.valor_pago || 0;
      this.totalValor += valor;
      
      if (this.isPago(conta)) {
        this.totalPago += valor;
      } else {
        this.totalPendente += valor;
      }
    });
  }

  private isPago(conta: MovimentacaoOmie): boolean {
    // Verifica se há data de pagamento
    if (conta.data_pagamento != null && conta.data_pagamento !== '') {
      return true;
    }
    
    // Verifica status do título (campos do Omie)
    const statusTitulo = conta['status_titulo'] || conta['status'];
    if (statusTitulo) {
      const statusUpper = statusTitulo.toString().toUpperCase();
      // Status que indicam pagamento: PAGO, BAIXADO, QUITADO
      if (statusUpper.includes('PAGO') || statusUpper.includes('BAIXADO') || statusUpper.includes('QUITADO')) {
        return true;
      }
      // Status que indicam pendência: ATRASADO, VENCE HOJE, A VENCER, PENDENTE
      if (statusUpper.includes('ATRASADO') || statusUpper.includes('VENCE HOJE') || 
          statusUpper.includes('A VENCER') || statusUpper.includes('PENDENTE')) {
        return false;
      }
    }
    
    // Verifica se há pagamentos (baixas) na conta
    const pagamentos = conta['pagamentos'] || conta['baixas'];
    if (pagamentos && Array.isArray(pagamentos) && pagamentos.length > 0) {
      return true;
    }
    
    return false;
  }

  // ===== Filtros =====
  onFiltroChange(): void {
    this.paginaAtual = 1;
    this.aplicarFiltrosLocais();
    this.calcularTotais();
  }

  onTextoPesquisaChange(texto: string): void {
    this.textoPesquisaSubject.next(texto);
  }

  limparFiltros(): void {
    this.filtrosUI = {
      status: '',
      textoPesquisa: ''
    };
    this.aplicarFiltrosLocais();
    this.calcularTotais();
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

  // ===== Date Range Picker =====
  buildCalendar(): void {
    const year = this.visibleMonth.getFullYear();
    const month = this.visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    this.calendarDays = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      this.calendarDays.push({
        day: currentDate.getDate(),
        inCurrentMonth: currentDate.getMonth() === month,
        dateStr: dateStr
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.buildCalendar();
    }
  }

  cancelRangePicker(): void {
    this.mostrarRangePicker = false;
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
  }

  clearRange(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
  }

  applyRangePicker(): void {
    if (this.tempRangeStart && this.tempRangeEnd) {
      this.dataInicial = this.tempRangeStart;
      this.dataFinal = this.tempRangeEnd;
      this.paginaAtual = 1;
      this.carregarContas();
    }
    this.mostrarRangePicker = false;
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
  }

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
    } else if (this.tempRangeStart && !this.tempRangeEnd) {
      if (dateStr < this.tempRangeStart) {
        this.tempRangeEnd = this.tempRangeStart;
        this.tempRangeStart = dateStr;
      } else {
        this.tempRangeEnd = dateStr;
      }
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  isStart(dateStr: string): boolean {
    return this.tempRangeStart === dateStr || 
           (!!this.dataInicial && this.dataInicial === dateStr && !this.mostrarRangePicker);
  }

  isEnd(dateStr: string): boolean {
    return this.tempRangeEnd === dateStr || 
           (!!this.dataFinal && this.dataFinal === dateStr && !this.mostrarRangePicker);
  }

  isBetween(dateStr: string): boolean {
    if (this.mostrarRangePicker && this.tempRangeStart && !this.tempRangeEnd && this.hoverRangeDate) {
      const start = this.tempRangeStart < this.hoverRangeDate ? this.tempRangeStart : this.hoverRangeDate;
      const end = this.tempRangeStart < this.hoverRangeDate ? this.hoverRangeDate : this.tempRangeStart;
      return dateStr > start && dateStr < end;
    }
    if (this.tempRangeStart && this.tempRangeEnd) {
      return dateStr > this.tempRangeStart && dateStr < this.tempRangeEnd;
    }
    if (this.dataInicial && this.dataFinal && !this.mostrarRangePicker) {
      return dateStr > this.dataInicial && dateStr < this.dataFinal;
    }
    return false;
  }

  prevMonth(): void {
    this.visibleMonth = new Date(this.visibleMonth.getFullYear(), this.visibleMonth.getMonth() - 1, 1);
    this.buildCalendar();
  }

  nextMonth(): void {
    this.visibleMonth = new Date(this.visibleMonth.getFullYear(), this.visibleMonth.getMonth() + 1, 1);
    this.buildCalendar();
  }

  getMonthYearLabel(): string {
    return this.visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  // ===== Utilitários =====
  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    try {
      // Omie retorna datas no formato DD/MM/YYYY
      if (dateStr.includes('/')) {
        const partes = dateStr.split('/');
        if (partes.length === 3) {
          // Converte DD/MM/YYYY para Date
          const date = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
          return date.toLocaleDateString('pt-BR');
        }
        return dateStr;
      }
      // Formato ISO ou YYYY-MM-DD
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  getMaxItemPagina(): number {
    return Math.min(this.paginaAtual * this.itensPorPagina, this.totalItens);
  }

  getStatusBadgeClass(conta: MovimentacaoOmie): string {
    const statusTitulo = (conta['status_titulo'] || conta['status'] || '').toString().toUpperCase();
    
    // Status pago/quitado
    if (statusTitulo.includes('PAGO') || statusTitulo.includes('BAIXADO') || statusTitulo.includes('QUITADO') || this.isPago(conta)) {
      return 'bg-green-100 text-green-800';
    }
    
    // Status atrasado
    if (statusTitulo.includes('ATRASADO')) {
      return 'bg-red-100 text-red-800';
    }
    
    // Status vence hoje
    if (statusTitulo.includes('VENCE HOJE')) {
      return 'bg-orange-100 text-orange-800';
    }
    
    // Status a vencer/pendente
    if (statusTitulo.includes('A VENCER') || statusTitulo.includes('PENDENTE')) {
      return 'bg-yellow-100 text-yellow-800';
    }
    
    // Default
    return 'bg-gray-100 text-gray-800';
  }

  getStatusLabel(conta: MovimentacaoOmie): string {
    // Usa o status_titulo do Omie se disponível
    const statusTitulo = conta['status_titulo'] || conta['status'];
    if (statusTitulo) {
      return statusTitulo.toString();
    }
    
    // Fallback para lógica padrão
    if (this.isPago(conta)) {
      return 'Pago';
    }
    return 'Pendente';
  }

  // ===== Exportação =====
  exportarExcel(): void {
    // TODO: Implementar exportação para Excel
    alert('Funcionalidade de exportação para Excel será implementada em breve');
  }

  exportarPDF(): void {
    // TODO: Implementar exportação para PDF
    alert('Funcionalidade de exportação para PDF será implementada em breve');
  }
}
