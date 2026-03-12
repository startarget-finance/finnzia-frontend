import { Component, OnInit, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subject, takeUntil } from 'rxjs';
import { BomControleService, FiltrosMovimentacoes, ResumoFinanceiroResponse, MovimentacaoFinanceira } from '../../services/bomcontrole.service';

Chart.register(...registerables);

const PAGE_SIZE = 500;

@Component({
  selector: 'app-relatorio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './relatorio.component.html',
  styleUrls: ['./relatorio.component.scss']
})
export class RelatorioComponent implements OnInit, AfterViewInit, OnDestroy {
  // Propriedades do gráfico
  periodoGrafico: 'diario' | 'mensal' = 'diario';
  receitaChart: Chart | null = null;

  // UI: Date Range Picker (igual ao dashboard)
  mostrarRangePicker: boolean = false;
  visibleMonth: Date = new Date();
  calendarDays: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];
  private tempRangeStart: string | null = null; // YYYY-MM-DD
  private tempRangeEnd: string | null = null;   // YYYY-MM-DD
  private hoverRangeDate: string | null = null;
  
  // Datas selecionadas para exibir no botão
  dataInicial: string = '';
  dataFinal: string = '';
  /** Atalho de período ativo: mes | trimestre | ano (vazio se período customizado) */
  atalhoPeriodoAtivo: 'mes' | 'trimestre' | 'ano' | '' = 'mes';

  // Dados reais de contas a receber e pagar
  contasReceber: {
    totalPendente: number;
    totalRecebido: number;
    totalGeral: number;
    totalContas: number;
    contasPendentes: number;
  } = {
    totalPendente: 0,
    totalRecebido: 0,
    totalGeral: 0,
    totalContas: 0,
    contasPendentes: 0
  };

  contasPagar: {
    totalPendente: number;
    totalPago: number;
    totalGeral: number;
    totalContas: number;
    contasPendentes: number;
  } = {
    totalPendente: 0,
    totalPago: 0,
    totalGeral: 0,
    totalContas: 0,
    contasPendentes: 0
  };

  loadingContas: boolean = false;
  saldoDisponivelAtual: number = 0;
  saldoDisponivelAnterior: number | null = null;
  variacaoSaldoPercentual: number | null = null;
  ultimaAtualizacaoSaldo: Date | null = null;
  /** Projeção de saldo do período (vindo do resumo financeiro) */
  projecaoSaldo: number | null = null;

  private destroy$ = new Subject<void>();

  // Dados do gráfico (preenchidos com dados reais)
  chartData = {
    labels: [] as string[],
    dates: [] as string[], // YYYY-MM-DD para cada índice (para clique)
    receita: [] as number[],
    despesa: [] as number[],
    renegociado: [] as number[],
    saldoProjetado: [] as number[]
  };

  // Movimentações reais agrupadas por data (YYYY-MM-DD)
  movimentacoesPorDia: Record<string, MovimentacaoFinanceira[]> = {};

  loadingGrafico = false;
  errorGrafico: string | null = null;

  // Dia clicado no gráfico (data YYYY-MM-DD) e lista para exibir abaixo
  dataSelecionada: string | null = null;
  movimentacoesFiltradas: MovimentacaoFinanceira[] = [];


  // Filtros funcionais
  filtros = {
    empresa: '',
    conta: '',
    tipo: '',
    categoria: '',
    periodo: 'diario' // 'diario' ou 'mensal'
  };

  // Opções para os selects
  empresas = [
    { value: '', label: 'Todas as Empresas' },
    { value: 'empresa1', label: 'Empresa Alpha Ltda' },
    { value: 'empresa2', label: 'Beta Corporation' },
    { value: 'empresa3', label: 'Gamma Solutions' }
  ];

  contas = [
    { value: '', label: 'Todas as Contas' },
    { value: 'conta1', label: 'Conta Corrente - Banco A' },
    { value: 'conta2', label: 'Poupança - Banco A' },
    { value: 'conta3', label: 'Conta Corrente - Banco B' }
  ];

  tipos = [
    { value: '', label: 'Todos os Tipos' },
    { value: 'RECEITA', label: 'Receita' },
    { value: 'DESPESA', label: 'Despesa' },
    { value: 'RENEGOCIAÇÃO', label: 'Renegociação' }
  ];

  categorias = [
    { value: '', label: 'Todas as Categorias' },
    { value: 'Operacional', label: 'Operacional' },
    { value: 'Administrativo', label: 'Administrativo' },
    { value: 'Comercial', label: 'Comercial' },
    { value: 'Financeiro', label: 'Financeiro' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'RH', label: 'Recursos Humanos' },
    { value: 'TI', label: 'Tecnologia da Informação' },
    { value: 'Jurídico', label: 'Jurídico' },
    { value: 'Vendas', label: 'Vendas' },
    { value: 'Outros', label: 'Outros' }
  ];

  constructor(private bomControleService: BomControleService) {}

  ngOnInit() {
    this.visibleMonth = new Date();
    this.buildCalendar();
    this.aplicarAtalhoPeriodo('mes');
  }

  ngAfterViewInit() {
    this.initChart();
    this.carregarDadosGrafico();
  }

  ngOnDestroy() {
    if (this.receitaChart) {
      this.receitaChart.destroy();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carrega dados reais de contas a receber e pagar do Bom Controle
   * Busca todas as páginas para calcular totais corretos
   */
  carregarDadosContas(): void {
    this.loadingContas = true;
    this.variacaoSaldoPercentual = null;
    this.saldoDisponivelAnterior = this.ultimaAtualizacaoSaldo ? this.saldoDisponivelAtual : null;
    
    // Sem filtro de data selecionado: busca do início dos tempos até 3 meses à frente (captura todos os pendentes relevantes)
    const hoje = new Date();
    const tresM = new Date(hoje.getFullYear(), hoje.getMonth() + 3, hoje.getDate());
    const dataInicio = this.dataInicial || '2000-01-01';
    const dataFim = this.dataFinal || tresM.toISOString().split('T')[0];
    
    const filtros: FiltrosMovimentacoes = {
      dataInicio,
      dataTermino: dataFim
    };

    this.bomControleService.obterResumoFinanceiro(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: resumo => this.processarResumoFinanceiro(resumo),
        error: err => {
          console.error('Erro ao carregar resumo financeiro do Bom Controle:', err);
          this.loadingContas = false;
        }
      });
  }

  private processarResumoFinanceiro(resumo: ResumoFinanceiroResponse): void {
    const receber = resumo?.contasReceber ?? {
      totalGeral: 0,
      totalLiquidado: 0,
      totalPendente: 0,
      totalContas: 0,
      contasPendentes: 0
    };

    const pagar = resumo?.contasPagar ?? {
      totalGeral: 0,
      totalLiquidado: 0,
      totalPendente: 0,
      totalContas: 0,
      contasPendentes: 0
    };

    this.contasReceber = {
      totalGeral: receber.totalGeral ?? 0,
      totalRecebido: receber.totalLiquidado ?? 0,
      totalPendente: receber.totalPendente ?? 0,
      totalContas: receber.totalContas ?? 0,
      contasPendentes: receber.contasPendentes ?? 0
    };

    this.contasPagar = {
      totalGeral: pagar.totalGeral ?? 0,
      totalPago: pagar.totalLiquidado ?? 0,
      totalPendente: pagar.totalPendente ?? 0,
      totalContas: pagar.totalContas ?? 0,
      contasPendentes: pagar.contasPendentes ?? 0
    };

    this.saldoDisponivelAtual = resumo?.saldoDisponivel ?? (this.contasReceber.totalRecebido - this.contasPagar.totalPago);

    if (this.saldoDisponivelAnterior !== null && Math.abs(this.saldoDisponivelAnterior) > 0.01) {
      const variacao = ((this.saldoDisponivelAtual - this.saldoDisponivelAnterior) / Math.abs(this.saldoDisponivelAnterior)) * 100;
      this.variacaoSaldoPercentual = Number(variacao.toFixed(1));
    } else {
      this.variacaoSaldoPercentual = null;
    }

    this.ultimaAtualizacaoSaldo = resumo?.atualizadoEm ? new Date(resumo.atualizadoEm) : new Date();
    this.projecaoSaldo = resumo?.saldoProjetado ?? null;
    this.loadingContas = false;
  }

  /**
   * Carrega movimentações do período e agrega por dia para o gráfico.
   */
  carregarDadosGrafico(): void {
    if (!this.dataInicial || !this.dataFinal) return;
    this.loadingGrafico = true;
    this.errorGrafico = null;
    this.dataSelecionada = null;
    this.movimentacoesFiltradas = [];

    const allMovs: MovimentacaoFinanceira[] = [];
    let page = 1;

    const fetchPage = (): void => {
      const filtros: FiltrosMovimentacoes = {
        dataInicio: this.dataInicial,
        dataTermino: this.dataFinal,
        tipoData: 'DataVencimento',
        itensPorPagina: PAGE_SIZE,
        numeroDaPagina: page
      };
      this.bomControleService.buscarMovimentacoes(filtros)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            const list = res.movimentacoes || [];
            allMovs.push(...list);
            const total = res.paginacao?.totalItens ?? res.total ?? list.length;
            if (allMovs.length < total && list.length === PAGE_SIZE) {
              page++;
              fetchPage();
            } else {
              this.agregarDadosPorDia(allMovs);
              this.loadingGrafico = false;
            }
          },
          error: (err) => {
            this.errorGrafico = err?.error?.mensagem || 'Erro ao carregar dados do gráfico';
            this.loadingGrafico = false;
            this.preencherChartDataVazio();
          }
        });
    };
    fetchPage();
  }

  private preencherChartDataVazio(): void {
    const inicio = this.parseLocalDateStr(this.dataInicial);
    const fim = this.parseLocalDateStr(this.dataFinal);
    const labels: string[] = [];
    const dates: string[] = [];
    const receita: number[] = [];
    const despesa: number[] = [];
    const renegociado: number[] = [];
    const saldoProjetado: number[] = [];
    let saldoAcum = 0;
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const dateStr = this.dateToStr(new Date(d));
      dates.push(dateStr);
      labels.push(this.periodoGrafico === 'mensal' ? d.toLocaleDateString('pt-BR', { month: 'short' }) : String(d.getDate()));
      receita.push(0);
      despesa.push(0);
      renegociado.push(0);
      saldoProjetado.push(saldoAcum);
    }
    this.chartData = { labels, dates, receita, despesa, renegociado, saldoProjetado };
    this.movimentacoesPorDia = {};
    this.updateChartData();
  }

  private agregarDadosPorDia(movs: MovimentacaoFinanceira[]): void {
    const inicio = this.parseLocalDateStr(this.dataInicial);
    const fim = this.parseLocalDateStr(this.dataFinal);
    const isAnual = this.periodoGrafico === 'mensal';

    if (isAnual) {
      const porMes: Record<string, { receita: number; despesa: number; renegociado: number; movs: MovimentacaoFinanceira[] }> = {};
      const iter = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (iter <= fim) {
        const key = this.dateToStr(new Date(iter));
        porMes[key] = { receita: 0, despesa: 0, renegociado: 0, movs: [] };
        iter.setMonth(iter.getMonth() + 1);
      }
      for (const m of movs) {
        const dateStr = (m.DataVencimento || '').toString().split('T')[0];
        if (!dateStr) continue;
        const [y, mo] = dateStr.split('-');
        const monthKey = `${y}-${mo}-01`;
        if (!porMes[monthKey]) continue;
        const valor = m.Valor ?? 0;
        const isDebito = m.Debito === true;
        const nomeTipo = (m.NomeTipoMovimentacao || '').toLowerCase();
        const isReneg = nomeTipo.includes('renegoci');
        if (isReneg) porMes[monthKey].renegociado += valor;
        else if (isDebito) porMes[monthKey].despesa += valor;
        else porMes[monthKey].receita += valor;
        porMes[monthKey].movs.push(m);
      }
      const labels: string[] = [];
      const dates: string[] = [];
      const receita: number[] = [];
      const despesa: number[] = [];
      const renegociado: number[] = [];
      const saldoProjetado: number[] = [];
      let saldoAcum = 0;
      const iter2 = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (iter2 <= fim) {
        const monthKey = this.dateToStr(new Date(iter2));
        const bloco = porMes[monthKey] || { receita: 0, despesa: 0, renegociado: 0, movs: [] };
        saldoAcum += bloco.receita + bloco.renegociado - bloco.despesa;
        dates.push(monthKey);
        labels.push(iter2.toLocaleDateString('pt-BR', { month: 'short' }));
        receita.push(bloco.receita);
        despesa.push(bloco.despesa);
        renegociado.push(bloco.renegociado);
        saldoProjetado.push(saldoAcum);
        this.movimentacoesPorDia[monthKey] = bloco.movs;
        iter2.setMonth(iter2.getMonth() + 1);
      }
      this.chartData = { labels, dates, receita, despesa, renegociado, saldoProjetado };
    } else {
      const porDia: Record<string, { receita: number; despesa: number; renegociado: number; movs: MovimentacaoFinanceira[] }> = {};
      const iter = new Date(inicio);
      while (iter <= fim) {
        const dateStr = this.dateToStr(new Date(iter));
        porDia[dateStr] = { receita: 0, despesa: 0, renegociado: 0, movs: [] };
        iter.setDate(iter.getDate() + 1);
      }
      for (const m of movs) {
        const dateStr = (m.DataVencimento || '').toString().split('T')[0];
        if (!dateStr || !porDia[dateStr]) continue;
        const valor = m.Valor ?? 0;
        const isDebito = m.Debito === true;
        const nomeTipo = (m.NomeTipoMovimentacao || '').toLowerCase();
        const isReneg = nomeTipo.includes('renegoci');
        if (isReneg) porDia[dateStr].renegociado += valor;
        else if (isDebito) porDia[dateStr].despesa += valor;
        else porDia[dateStr].receita += valor;
        porDia[dateStr].movs.push(m);
      }
      const labels: string[] = [];
      const dates: string[] = [];
      const receita: number[] = [];
      const despesa: number[] = [];
      const renegociado: number[] = [];
      const saldoProjetado: number[] = [];
      let saldoAcum = 0;
      const iter2 = new Date(inicio);
      while (iter2 <= fim) {
        const dateStr = this.dateToStr(new Date(iter2));
        const bloco = porDia[dateStr] || { receita: 0, despesa: 0, renegociado: 0, movs: [] };
        saldoAcum += bloco.receita + bloco.renegociado - bloco.despesa;
        dates.push(dateStr);
        labels.push(String(iter2.getDate()));
        receita.push(bloco.receita);
        despesa.push(bloco.despesa);
        renegociado.push(bloco.renegociado);
        saldoProjetado.push(saldoAcum);
        this.movimentacoesPorDia[dateStr] = bloco.movs;
        iter2.setDate(iter2.getDate() + 1);
      }
      this.chartData = { labels, dates, receita, despesa, renegociado, saldoProjetado };
    }
    this.updateChartData();
  }

  private updateChartData(): void {
    if (!this.receitaChart) return;
    this.receitaChart.data.labels = this.chartData.labels;
    (this.receitaChart.data.datasets[0] as any).data = this.chartData.receita;
    // Despesa em valor negativo para as barras irem para baixo (mais intuitivo)
    (this.receitaChart.data.datasets[1] as any).data = this.chartData.despesa.map(v => -Math.abs(v));
    (this.receitaChart.data.datasets[2] as any).data = this.chartData.renegociado;
    (this.receitaChart.data.datasets[3] as any).data = this.chartData.saldoProjetado;
    const xScale = this.receitaChart.scales['x'];
    const xOpts = xScale?.options as { title?: { text: string } } | undefined;
    if (xOpts?.title) {
      xOpts.title.text = this.periodoGrafico === 'mensal' ? 'Mês' : 'Dia';
    }
    this.receitaChart.update('none');
  }

  initChart() {
    const ctx = document.getElementById('receitaChart') as HTMLCanvasElement;
    if (!ctx) return;

    const emptyArr = this.chartData.labels?.length ? this.chartData.receita : [];
    const despesaParaChart = this.chartData.despesa.length ? this.chartData.despesa.map(v => -Math.abs(v)) : [0];
    this.receitaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.chartData.labels.length ? this.chartData.labels : [''],
        datasets: [
          {
            label: 'Receita',
            data: this.chartData.receita.length ? this.chartData.receita : [0],
            backgroundColor: 'rgba(22, 163, 74, 0.9)',
            borderColor: 'rgba(22, 163, 74, 1)',
            borderWidth: 0,
            borderRadius: { topLeft: 4, topRight: 4 },
            type: 'bar',
            order: 2,
            maxBarThickness: 28
          },
          {
            label: 'Despesa',
            data: despesaParaChart,
            backgroundColor: 'rgba(220, 38, 38, 0.9)',
            borderColor: 'rgba(220, 38, 38, 1)',
            borderWidth: 0,
            borderRadius: { bottomLeft: 4, bottomRight: 4 },
            type: 'bar',
            order: 2,
            maxBarThickness: 28
          },
          {
            label: 'Renegociado',
            data: this.chartData.renegociado.length ? this.chartData.renegociado : [0],
            backgroundColor: 'rgba(202, 138, 4, 0.9)',
            borderColor: 'rgba(202, 138, 4, 1)',
            borderWidth: 0,
            borderRadius: { topLeft: 4, topRight: 4 },
            type: 'bar',
            order: 2,
            maxBarThickness: 28
          },
          {
            label: 'Saldo projetado',
            data: this.chartData.saldoProjetado.length ? this.chartData.saldoProjetado : [0],
            backgroundColor: 'transparent',
            borderColor: 'rgba(37, 99, 235, 1)',
            borderWidth: 2.5,
            borderDash: [6, 4],
            type: 'line',
            fill: false,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgba(37, 99, 235, 1)',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 20,
              font: { size: 12 }
            },
            onClick: () => {}
          },
          tooltip: {
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw as number;
                const displayVal = ctx.dataset.label === 'Despesa' ? Math.abs(v) : v;
                return `${ctx.dataset.label}: ${this.formatCurrency(displayVal)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            grid: { color: 'rgba(0, 0, 0, 0.06)', drawTicks: false },
            border: { display: false },
            ticks: {
              font: { size: 11 },
              padding: 8,
              callback: (value) => 'R$ ' + Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
            }
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11 }, padding: 8, maxRotation: 0 },
            title: { display: true, text: this.periodoGrafico === 'mensal' ? 'Mês' : 'Dia', font: { size: 12 } }
          }
        },
        interaction: { intersect: false, mode: 'index' },
        onClick: (_event, elements) => {
          if (elements.length > 0 && this.chartData.dates?.length) {
            const idx = elements[0].index;
            const dateStr = this.chartData.dates[idx];
            if (dateStr) this.selecionarDiaNoGrafico(dateStr);
          }
        }
      }
    });
  }

  selecionarDiaNoGrafico(dateStr: string): void {
    this.dataSelecionada = dateStr;
    this.movimentacoesFiltradas = this.movimentacoesPorDia[dateStr] || [];
  }

  setPeriodoGrafico(periodo: 'diario' | 'mensal'): void {
    this.periodoGrafico = periodo;
    const todas = this.getTodasMovimentacoesDoPeriodo();
    if (todas.length) {
      this.agregarDadosPorDia(todas);
    } else {
      this.carregarDadosGrafico();
    }
  }

  private getTodasMovimentacoesDoPeriodo(): MovimentacaoFinanceira[] {
    const out: MovimentacaoFinanceira[] = [];
    Object.values(this.movimentacoesPorDia).forEach(m => out.push(...m));
    return out;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  limparFiltroDia(): void {
    this.dataSelecionada = null;
    this.movimentacoesFiltradas = [];
  }

  @HostListener('document:keydown.escape')
  fecharModalComEscape(): void {
    if (this.dataSelecionada) this.limparFiltroDia();
  }

  getDataSelecionadaLabel(): string {
    if (!this.dataSelecionada) return '';
    const d = this.parseLocalDateStr(this.dataSelecionada);
    if (this.periodoGrafico === 'mensal' && this.dataSelecionada.endsWith('-01')) {
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  getTipoMovimentacaoLabel(m: MovimentacaoFinanceira): string {
    return m.Debito ? 'Despesa' : 'Receita';
  }

  getStatusMovimentacao(m: MovimentacaoFinanceira): string {
    return m.DataQuitacao ? 'Quitado' : 'Pendente';
  }

  getTotalReceitasDia(): number {
    return this.movimentacoesFiltradas
      .filter(m => !m.Debito)
      .reduce((sum, m) => sum + (m.Valor ?? 0), 0);
  }

  getTotalDespesasDia(): number {
    return this.movimentacoesFiltradas
      .filter(m => m.Debito)
      .reduce((sum, m) => sum + (m.Valor ?? 0), 0);
  }

  onFiltroChange(): void {}

  aplicarFiltrosManualmente(): void {
    this.onFiltroChange();
  }

  limparFiltros(): void {
    this.filtros = {
      empresa: '',
      conta: '',
      tipo: '',
      categoria: '',
      periodo: 'diario'
    };
    this.onFiltroChange();
  }

  onPeriodoChange(periodo: 'diario' | 'mensal'): void {
    this.filtros.periodo = periodo;
    this.onFiltroChange();
  }

  getEmpresaLabel(empresaValue: string): string {
    const empresa = this.empresas.find(e => e.value === empresaValue);
    return empresa ? empresa.label : 'N/A';
  }

  // ===== Date Range Picker Helpers =====
  prepararRangePicker(): void {
    this.tempRangeStart = this.dataInicial || null;
    this.tempRangeEnd = this.dataFinal || null;
    this.hoverRangeDate = null;
    this.visibleMonth = this.dataInicial ? this.parseLocalDateStr(this.dataInicial) : new Date();
    this.buildCalendar();
  }

  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.prepararRangePicker();
    }
  }

  cancelRangePicker(): void {
    this.mostrarRangePicker = false;
  }

  applyRangePicker(): void {
    if (this.tempRangeStart && this.tempRangeEnd) {
      const a = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeStart : this.tempRangeEnd;
      const b = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeEnd : this.tempRangeStart;
      this.dataInicial = a;
      this.dataFinal = b;
      this.atalhoPeriodoAtivo = '';
      this.carregarDadosContas();
      this.carregarDadosGrafico();
    }
    this.mostrarRangePicker = false;
  }

  aplicarAtalhoPeriodo(tipo: 'mes' | 'trimestre' | 'ano'): void {
    this.atalhoPeriodoAtivo = tipo;
    const hoje = new Date();
    let inicio: Date;
    let fim: Date;
    if (tipo === 'mes') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    } else if (tipo === 'trimestre') {
      fim = new Date(hoje);
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, hoje.getDate());
    } else {
      inicio = new Date(hoje.getFullYear(), 0, 1);
      fim = new Date(hoje.getFullYear(), 11, 31);
    }
    this.dataInicial = this.dateToStr(inicio);
    this.dataFinal = this.dateToStr(fim);
    this.carregarDadosContas();
    this.carregarDadosGrafico();
  }

  isAtalhoAtivo(tipo: 'mes' | 'trimestre' | 'ano'): boolean {
    return this.atalhoPeriodoAtivo === tipo;
  }

  getPeriodoRelatorioLabel(): string {
    if (this.dataInicial && this.dataFinal) {
      const a = this.parseLocalDateStr(this.dataInicial);
      const b = this.parseLocalDateStr(this.dataFinal);
      return a.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' – ' +
        b.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return 'Selecionar período';
  }

  clearRange(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
  }

  prevMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() - 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  nextMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() + 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  getMonthYearLabel(): string {
    return this.visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  private buildCalendar(): void {
    const year = this.visibleMonth.getFullYear();
    const month = this.visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekDay = firstDay.getDay(); // 0-6 dom..sab
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];

    // Preenche dias do mês anterior para alinhar a semana
    for (let i = startWeekDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    // Dias do mês atual
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({ day: d, inCurrentMonth: true, dateStr: this.dateToStr(date) });
    }

    // Completa até múltiplo de 7 com próximos dias
    while (days.length % 7 !== 0) {
      const nextIndex = days.length - (startWeekDay) - daysInMonth + 1;
      const date = new Date(year, month + 1, nextIndex);
      days.push({ day: date.getDate(), inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    this.calendarDays = days;
  }

  private dateToStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Interpreta YYYY-MM-DD como data local (evita 1 dia a menos por UTC). */
  private parseLocalDateStr(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
      return;
    }
    // Seleciona fim
    if (this.tempRangeStart && !this.tempRangeEnd) {
      this.tempRangeEnd = dateStr;
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  // Estados visuais
  isStart(dateStr: string): boolean {
    return !!this.tempRangeStart && this.tempRangeStart === dateStr;
  }

  isEnd(dateStr: string): boolean {
    return !!this.tempRangeEnd && this.tempRangeEnd === dateStr;
  }

  isBetween(dateStr: string): boolean {
    const start = this.tempRangeStart;
    const end = this.tempRangeEnd || this.hoverRangeDate;
    if (!start || !end) return false;
    const a = start <= end ? start : end;
    const b = start <= end ? end : start;
    return dateStr > a && dateStr < b;
  }

  // Labels para os filtros
  getCategoriaLabel(value: string): string {
    const categoria = this.categorias.find(c => c.value === value);
    return categoria ? categoria.label : value;
  }

  getContaLabel(value: string): string {
    const conta = this.contas.find(c => c.value === value);
    return conta ? conta.label : value;
  }

  getTipoLabel(value: string): string {
    const tipo = this.tipos.find(t => t.value === value);
    return tipo ? tipo.label : value;
  }

}
