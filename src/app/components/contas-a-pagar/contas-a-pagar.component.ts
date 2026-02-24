import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { BomControleService, MovimentacaoFinanceira, FiltrosMovimentacoes } from '../../services/bomcontrole.service';

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
  tempRangeStart: string | null = null;
  tempRangeEnd: string | null = null;
  hoverRangeDate: string | null = null;
  
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
    private bomControleService: BomControleService
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
    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
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

    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }

    const filtros: FiltrosMovimentacoes = {
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined,
      tipo: 'despesa', // Apenas contas a pagar
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      numeroDaPagina: this.paginaAtual,
      itensPorPagina: this.itensPorPagina
    };

    console.log('🔍 Carregando contas a pagar (Bom Controle) com filtros:', filtros);
    
    this.bomControleService.buscarMovimentacoes(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.processarResposta(response);
        },
        error: (err: any) => {
          console.error('Erro ao carregar contas a pagar:', err);
          this.error = err.error?.mensagem || 'Erro ao carregar contas a pagar';
          this.loading = false;
        }
      });
  }

  private processarResposta(response: any): void {
    // A resposta do BomControleService.buscarMovimentacoes retorna { movimentacoes, total, ... }
    const movimentacoes: MovimentacaoFinanceira[] = response.movimentacoes || [];
    this.contas = movimentacoes.filter(mov => this.isContaPagar(mov));
    this.totalItens = response.total || response.total_de_registros || this.contas.length;
    
    if (response.paginacao && response.paginacao.itensPorPagina) {
        this.itensPorPagina = response.paginacao.itensPorPagina;
    }
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Aplicar filtros locais de status (se necessário, caso o backend não filtre status)
    // O backend do Bom Controle filtra por data e tipo, mas status 'pago'/'pendente' 
    // geralmente é verificado via DataQuitacao
    this.aplicarFiltrosLocais();
    
    // Calcular totais baseados nos dados retornados (ou totais globais se vierem na resposta)
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

    // O filtro de texto já foi aplicado no backend via 'textoPesquisa', 
    // mas se quisermos reforçar localmente ou se o backend não filtrar tudo:
    if (this.filtrosUI.textoPesquisa) {
       // Já filtrado no backend, mas mantemos lógica para integridade visual imediata se necessário
    }

    this.contasFiltradas = filtradas;
  }

  private calcularTotais(): void {
    // Idealmente, usaríamos totais vindos do backend se disponíveis, 
    // mas calculamos aqui com base na página atual/filtrada para feedback imediato
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
    this.visibleMonth = new Date(ano, mes, 1);
    this.buildCalendar();
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

  limparFiltros(): void {
    this.filtrosUI = {
      status: '',
      textoPesquisa: ''
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

  // ===== Date Range Picker =====
  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.tempRangeStart = null;
      this.tempRangeEnd = null;
      this.hoverRangeDate = null;
      this.visibleMonth = this.dataInicial ? new Date(this.dataInicial) : new Date();
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
    this.preencherMesAtual();
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
    this.paginaAtual = 1;
    this.carregarContas();
  }

  applyRangePicker(): void {
    if (this.tempRangeStart) {
      const rangeEnd = this.tempRangeEnd ?? this.tempRangeStart;
      const inicio = this.tempRangeStart <= rangeEnd ? this.tempRangeStart : rangeEnd;
      const fim = this.tempRangeStart <= rangeEnd ? rangeEnd : this.tempRangeStart;

      this.dataInicial = inicio;
      this.dataFinal = fim;
      this.paginaAtual = 1;
      this.carregarContas();
    }
    this.mostrarRangePicker = false;
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
  }

  buildCalendar(): void {
    const year = this.visibleMonth.getFullYear();
    const month = this.visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];

    for (let i = startWeekDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({ day: d, inCurrentMonth: true, dateStr: this.dateToStr(date) });
    }

    while (days.length % 7 !== 0) {
      const nextIndex = days.length - startWeekDay - daysInMonth + 1;
      const date = new Date(year, month + 1, nextIndex);
      days.push({ day: date.getDate(), inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    this.calendarDays = days;
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

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
      return;
    }
    this.tempRangeEnd = dateStr;
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  isStart(dateStr: string): boolean {
    if (this.tempRangeStart) {
      return this.tempRangeStart === dateStr;
    }
    return !this.mostrarRangePicker && !!this.dataInicial && this.dataInicial === dateStr;
  }

  isEnd(dateStr: string): boolean {
    if (this.tempRangeEnd) {
      return this.tempRangeEnd === dateStr;
    }
    return !this.mostrarRangePicker && !!this.dataFinal && this.dataFinal === dateStr;
  }

  isBetween(dateStr: string): boolean {
    const start = this.tempRangeStart;
    const end = this.tempRangeEnd || this.hoverRangeDate;
    if (!start || !end) return false;

    const inicio = start <= end ? start : end;
    const fim = start <= end ? end : start;
    return dateStr > inicio && dateStr < fim;
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
    alert('Funcionalidade de exportação para Excel será implementada em breve');
  }

  exportarPDF(): void {
    alert('Funcionalidade de exportação para PDF será implementada em breve');
  }
}
