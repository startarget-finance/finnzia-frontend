import { Component, OnInit, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subject, takeUntil } from 'rxjs';
import { ErpFinanceiroService, FiltrosMovimentacoes, ResumoFinanceiroResponse, MovimentacaoFinanceira } from '../../services/erp-financeiro.service';
import { CompanySelectorService } from '../../services/company-selector.service';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';
import { PeriodoRangePickerComponent } from '../../shared/components/periodo-range-picker/periodo-range-picker.component';
import { dateToYmd, parseLocalYmd } from '../../utils/date-range-calendar.util';

Chart.register(...registerables);

const PAGE_SIZE = 500;

@Component({
  selector: 'app-relatorio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FeedbackStateComponent, PeriodoRangePickerComponent],
  templateUrl: './relatorio.component.html',
  styleUrls: ['./relatorio.component.scss']
})
export class RelatorioComponent implements OnInit, AfterViewInit, OnDestroy {
  // Propriedades do gráfico
  periodoGrafico: 'diario' | 'mensal' = 'diario';
  receitaChart: Chart | null = null;

  pickerPeriodoAberto = false;

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
  private movimentacoesPeriodoBruto: MovimentacaoFinanceira[] = [];

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
    { value: '', label: 'Todas as Empresas' }
  ];

  contas = [
    { value: '', label: 'Todas as Contas' }
  ];

  tipos = [
    { value: '', label: 'Todos os Tipos' },
    { value: 'RECEITA', label: 'Receita' },
    { value: 'DESPESA', label: 'Despesa' },
    { value: 'RENEGOCIAÇÃO', label: 'Renegociação' }
  ];

  categorias = [
    { value: '', label: 'Todas as Categorias' }
  ];

  constructor(
    private erpFinanceiroService: ErpFinanceiroService,
    private companySelector: CompanySelectorService
  ) {}

  ngOnInit() {
    this.carregarEmpresas();
    this.aplicarAtalhoPeriodo('mes');
  }

  ngAfterViewInit() {
    this.initChart();
    setTimeout(() => this.redimensionarGrafico(), 0);
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

    this.erpFinanceiroService.obterResumoFinanceiro(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resumo: ResumoFinanceiroResponse) => this.processarResumoFinanceiro(resumo),
        error: (err: any) => {
          console.error('Erro ao carregar resumo financeiro do ERP:', err);
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
        tipo: this.mapearTipoFiltroBackend(),
        categoria: this.filtros.categoria || undefined,
        itensPorPagina: PAGE_SIZE,
        numeroDaPagina: page
      };
      this.erpFinanceiroService.buscarMovimentacoes(filtros)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res: any) => {
            const list = res.movimentacoes || [];
            allMovs.push(...list);
            const total = res.paginacao?.totalItens ?? res.total ?? list.length;
            if (allMovs.length < total && list.length === PAGE_SIZE) {
              page++;
              fetchPage();
            } else {
              this.movimentacoesPeriodoBruto = allMovs;
              this.sincronizarOpcoesFiltrosComMovimentacoes(allMovs);
              this.aplicarFiltrosNoGrafico();
              this.loadingGrafico = false;
            }
          },
          error: (err: any) => {
            this.errorGrafico = err?.error?.mensagem || 'Erro ao carregar dados do gráfico';
            this.loadingGrafico = false;
            this.preencherChartDataVazio();
          }
        });
    };
    fetchPage();
  }

  private preencherChartDataVazio(): void {
    const inicio = parseLocalYmd(this.dataInicial);
    const fim = parseLocalYmd(this.dataFinal);
    const labels: string[] = [];
    const dates: string[] = [];
    const receita: number[] = [];
    const despesa: number[] = [];
    const renegociado: number[] = [];
    const saldoProjetado: number[] = [];
    let saldoAcum = 0;
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const dateStr = dateToYmd(new Date(d));
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
    this.movimentacoesPorDia = {};
    const inicio = parseLocalYmd(this.dataInicial);
    const fim = parseLocalYmd(this.dataFinal);
    const isAnual = this.periodoGrafico === 'mensal';

    if (isAnual) {
      const porMes: Record<string, { receita: number; despesa: number; renegociado: number; movs: MovimentacaoFinanceira[] }> = {};
      const iter = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (iter <= fim) {
        const key = dateToYmd(new Date(iter));
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
        const monthKey = dateToYmd(new Date(iter2));
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
        const dateStr = dateToYmd(new Date(iter));
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
        const dateStr = dateToYmd(new Date(iter2));
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
    this.redimensionarGrafico();
  }

  private redimensionarGrafico(): void {
    if (this.receitaChart) {
      this.receitaChart.resize();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.redimensionarGrafico();
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
        layout: { padding: { top: 12, right: 16, bottom: 12, left: 8 } },
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
    const movsDoDia = this.movimentacoesPorDia[dateStr] || [];
    this.movimentacoesFiltradas = this.aplicarFiltrosLocais(movsDoDia);
  }

  setPeriodoGrafico(periodo: 'diario' | 'mensal'): void {
    this.periodoGrafico = periodo;
    if (this.movimentacoesPeriodoBruto.length) {
      this.aplicarFiltrosNoGrafico();
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
    const d = parseLocalYmd(this.dataSelecionada);
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

  onFiltroChange(): void {
    const periodoAlvo = this.filtros.periodo === 'mensal' ? 'mensal' : 'diario';
    this.periodoGrafico = periodoAlvo;
    this.aplicarFiltrosNoGrafico();
  }

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

  private carregarEmpresas(): void {
    const aplicarLista = (lista: { idEmpresa: number; nomeEmpresa: string }[]): void => {
      const opts = lista
        .filter((e) => e?.idEmpresa != null)
        .map((e) => ({
          value: String(e.idEmpresa),
          label: e.nomeEmpresa?.trim() || `Empresa ${e.idEmpresa}`,
        }));
      this.empresas = [{ value: '', label: 'Todas as Empresas' }, ...opts];
    };
    aplicarLista(this.companySelector.obterEmpresasAtivas());
    this.companySelector.empresasPermitidas$
      .pipe(takeUntil(this.destroy$))
      .subscribe((emps) => aplicarLista(emps.filter((e) => e.ativo !== false)));
  }

  private mapearTipoFiltroBackend(): 'receita' | 'despesa' | undefined {
    if (this.filtros.tipo === 'RECEITA') return 'receita';
    if (this.filtros.tipo === 'DESPESA') return 'despesa';
    return undefined;
  }

  private aplicarFiltrosNoGrafico(): void {
    const filtradas = this.aplicarFiltrosLocais(this.movimentacoesPeriodoBruto);
    this.movimentacoesFiltradas = this.dataSelecionada
      ? this.aplicarFiltrosLocais(this.movimentacoesPorDia[this.dataSelecionada] || [])
      : [];
    this.agregarDadosPorDia(filtradas);
  }

  private aplicarFiltrosLocais(movs: MovimentacaoFinanceira[]): MovimentacaoFinanceira[] {
    return movs.filter((mov) => {
      const tipoOk =
        !this.filtros.tipo ||
        (this.filtros.tipo === 'RECEITA' && !mov.Debito) ||
        (this.filtros.tipo === 'DESPESA' && mov.Debito) ||
        (this.filtros.tipo === 'RENEGOCIAÇÃO' &&
          this.normalizarTexto(mov.NomeTipoMovimentacao || '').includes('renegoci'));

      const categoriaOk =
        !this.filtros.categoria ||
        this.normalizarTexto(mov.NomeCategoriaFinanceira || '') === this.normalizarTexto(this.filtros.categoria);

      const contaOk =
        !this.filtros.conta ||
        this.normalizarTexto(mov.NomeContaFinanceira || '') === this.normalizarTexto(this.filtros.conta) ||
        String(mov.IdContaFinanceira || '') === this.filtros.conta;

      const empresaOk =
        !this.filtros.empresa ||
        String(mov.IdEmpresa || '') === this.filtros.empresa ||
        this.normalizarTexto(mov.NomeEmpresa || '') === this.normalizarTexto(this.filtros.empresa);

      return tipoOk && categoriaOk && contaOk && empresaOk;
    });
  }

  private sincronizarOpcoesFiltrosComMovimentacoes(movs: MovimentacaoFinanceira[]): void {
    const categorias = Array.from(
      new Set(
        movs
          .map((m) => (m.NomeCategoriaFinanceira || '').trim())
          .filter((v) => v.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const contas = Array.from(
      new Set(
        movs
          .map((m) => (m.NomeContaFinanceira || '').trim())
          .filter((v) => v.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    this.categorias = [
      { value: '', label: 'Todas as Categorias' },
      ...categorias.map((c) => ({ value: c, label: c }))
    ];

    this.contas = [
      { value: '', label: 'Todas as Contas' },
      ...contas.map((c) => ({ value: c, label: c }))
    ];

    if (this.filtros.categoria && !categorias.includes(this.filtros.categoria)) {
      this.filtros.categoria = '';
    }
    if (this.filtros.conta && !contas.includes(this.filtros.conta)) {
      this.filtros.conta = '';
    }
  }

  private normalizarTexto(valor: string): string {
    return (valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  getEmpresaLabel(empresaValue: string): string {
    const empresa = this.empresas.find(e => e.value === empresaValue);
    return empresa ? empresa.label : 'N/A';
  }

  onPeriodoAplicado(): void {
    this.atalhoPeriodoAtivo = '';
    this.carregarDadosContas();
    this.carregarDadosGrafico();
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
    this.dataInicial = dateToYmd(inicio);
    this.dataFinal = dateToYmd(fim);
    this.carregarDadosContas();
    this.carregarDadosGrafico();
  }

  isAtalhoAtivo(tipo: 'mes' | 'trimestre' | 'ano'): boolean {
    return this.atalhoPeriodoAtivo === tipo;
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
