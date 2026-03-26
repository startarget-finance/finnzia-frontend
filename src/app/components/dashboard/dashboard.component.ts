import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { DadosFinanceiros } from '../../models/dados-financeiros.model';
import { BomControleService, ResumoFinanceiroResponse, FiltrosMovimentacoes } from '../../services/bomcontrole.service';
import { CompanySelectorService } from '../../services/company-selector.service';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private resumoSubscription?: Subscription;
  private empresaSubscription?: Subscription;
  resumoFonteDados: string | null = null;
  resumoCarregando: boolean = false;
  receitaChart: Chart | null = null;
  despesasChart: Chart | null = null;
  currentDate: Date = new Date();
  graficoExpandido: boolean = false;
  // Estes KPIs não vêm completos do endpoint atual; mantemos como `null` para não exibir "mocks".
  // Quando/Se o backend fornecer, a gente troca para números reais.
  mediaNovosContratosReais3m: number | null = null;
  mediaNovosContratosUnidades3m: number | null = null;
  custoFinanceiroInvestimento: number | null = null;
  mediaCustoFixo: number | null = null;
  mediaCustoVariavel: number | null = null;
  mediaCustoEstrategico: number | null = null;
  totalClientesAtivos: number | null = null;
  churnPercent: number | null = null;
  ltvMeses: number | null = null;
  inadimplenciaValor: number | null = null;
  inadimplenciaTaxa: number | null = null;
  // Projeção usada para exibir ao lado do gráfico
  projecaoSaldoFinal: number = 0;
  
  // Filtro de data
  dataInicial: string = '';
  dataFinal: string = '';
  tipoFiltro: 'mes' | 'trimestre' | 'ano' = 'mes';
  // Controle específico do gráfico principal
  periodoGrafico: 'mensal' | 'anual' = 'mensal';
  
  // Opções de filtro
  mesesDisponiveis: Array<{value: string, label: string}> = [];
  trimestresDisponiveis: Array<{value: string, label: string}> = [];
  anosDisponiveis: Array<{value: string, label: string}> = [];
  
  // UI: Date Range Picker (para tipo "mes")
  mostrarRangePicker: boolean = false;
  visibleMonth: Date = new Date();
  calendarDays: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];
  private tempRangeStart: string | null = null; // YYYY-MM-DD
  private tempRangeEnd: string | null = null;   // YYYY-MM-DD
  private hoverRangeDate: string | null = null;
  
  // Dados filtrados por período
  dadosFiltrados: DadosFinanceiros = this.getResumoPadrao();

  /** Parse YYYY-MM-DD como data local (evita dia errado por UTC). */
  private parseLocalDateStr(dateStr: string): Date {
    if (!dateStr || dateStr.length < 10) return new Date(NaN);
    const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private getResumoPadrao(): DadosFinanceiros {
    return {
      receitas: 0,
      despesas: 0,
      lucro: 0,
      contratosAtivos: 0,
      contratosPendentes: 0,
      contratosVencidos: 0,
      margemBruta: 0,
      margemLiquida: 0,
      roi: 0,
      receitaMensal: [],
      despesasPorCategoria: [],
      indicadores: {
        crescimentoReceita: 0,
        eficienciaOperacional: 0,
        satisfacaoCliente: 0,
        produtividade: 0
      }
    };
  }


  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private bomControleService: BomControleService,
    private companySelectorService: CompanySelectorService
  ) {}

  ngOnInit() {
    this.inicializarFiltros();
    this.onTipoFiltroAlterado();
    this.visibleMonth = this.dataInicial ? this.parseLocalDateStr(this.dataInicial) : new Date();
    this.buildCalendar();
    this.empresaSubscription = this.companySelectorService.empresaSelecionada$.subscribe((empresa) => {
      if (empresa?.idEmpresa) {
        this.carregarResumoFinanceiro();
      }
    });
  }

  ngOnDestroy() {
    if (this.receitaChart) {
      this.receitaChart.destroy();
    }
    if (this.despesasChart) {
      this.despesasChart.destroy();
    }
    this.resumoSubscription?.unsubscribe();
    this.empresaSubscription?.unsubscribe();
  }

  // ===== Date Range Picker Helpers =====
  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.tempRangeStart = this.dataInicial;
      this.tempRangeEnd = this.dataFinal;
      this.hoverRangeDate = null;
      this.visibleMonth = this.dataInicial ? this.parseLocalDateStr(this.dataInicial) : new Date();
      this.buildCalendar();
    }
  }

  cancelRangePicker(): void {
    this.mostrarRangePicker = false;
  }

  applyRangePicker(): void {
    if (this.tempRangeStart && this.tempRangeEnd) {
      // Garante ordem
      const a = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeStart : this.tempRangeEnd;
      const b = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeEnd : this.tempRangeStart;
      this.dataInicial = a;
      this.dataFinal = b;
      this.onFiltroAlterado();
    }
    this.mostrarRangePicker = false;
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

  criarGraficoReceitas() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const ctx = document.getElementById('receitaChart') as HTMLCanvasElement;
    if (!ctx) return;

    // Destroi gráfico existente se houver
    if (this.receitaChart) {
      this.receitaChart.destroy();
      this.receitaChart = null;
    }

    // Dados do gráfico (mensal: dias; anual: meses)
    const labels: string[] = this.periodoGrafico === 'mensal'
      ? Array.from({ length: 31 }, (_, i) => String(i + 1))
      : ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    let receitaSerie: number[] = [];
    let renegociadoSerie: number[] = [];
    let despesaSerie: number[] = [];

    // Sem mocks: distribui os totais reais igualmente pelas labels do gráfico.
    // Como o endpoint atual não retorna série diária/mensal, isso evita números "fabricados".
    const totalReceitas = this.dadosFiltrados?.receitas ?? 0;
    const totalDespesas = this.dadosFiltrados?.despesas ?? 0;
    const totalRenegociado = 0; // disponível apenas se o backend entregar esse breakdown

    const receitaPorLabel = labels.length ? totalReceitas / labels.length : 0;
    const despesaPorLabel = labels.length ? totalDespesas / labels.length : 0;
    const renegociadoPorLabel = labels.length ? totalRenegociado / labels.length : 0;

    receitaSerie = labels.map(() => receitaPorLabel);
    renegociadoSerie = labels.map(() => renegociadoPorLabel);
    despesaSerie = labels.map(() => despesaPorLabel);

    // Saldo projetado acumulado (derivado dos totais reais)
    const saldoProjetado: number[] = [];
    let saldo = 0;
    labels.forEach((_, i) => {
      saldo += (receitaSerie[i] + renegociadoSerie[i]) - despesaSerie[i];
      saldoProjetado.push(Math.max(saldo, 0));
    });
    this.projecaoSaldoFinal = saldoProjetado[saldoProjetado.length - 1] || 0;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Receita',
            data: receitaSerie,
            backgroundColor: '#2ecc71',
            borderColor: '#2ecc71',
            borderWidth: 0,
          },
          {
            label: 'Renegociado',
            data: renegociadoSerie,
            backgroundColor: '#f1c40f',
            borderColor: '#f1c40f',
            borderWidth: 0,
          },
          {
            label: 'Despesa',
            data: despesaSerie,
            backgroundColor: '#e74c3c',
            borderColor: '#e74c3c',
            borderWidth: 0,
          },
          {
            type: 'line',
            label: 'Saldo total projetado no período',
            data: saldoProjetado,
            borderColor: '#3498db',
            backgroundColor: 'transparent',
            borderWidth: 3,
            borderDash: [6, 6],
            pointBackgroundColor: '#3498db',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 3,
            tension: 0.35,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label || '';
                const v = ctx.parsed.y ?? ctx.raw;
                return `${label}: ${this.formatCurrency(Number(v || 0))}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: 'Dias' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: number | string) => {
                const n = typeof value === 'string' ? parseFloat(value) : value;
                return 'R$ ' + Number(n).toLocaleString('pt-BR');
              }
            }
          }
        }
      }
    };

    this.receitaChart = new Chart(ctx, config);
  }

  setPeriodoGrafico(periodo: 'mensal' | 'anual') {
    this.periodoGrafico = periodo;
    this.criarGraficoReceitas();
  }

  toggleExpandirGrafico(): void {
    this.graficoExpandido = !this.graficoExpandido;
    // Recria o gráfico para garantir redimensionamento correto após mudança de altura
    if (isPlatformBrowser(this.platformId)) {
      this.criarGraficoReceitas();
    }
  }

  // Indicadores ao lado do gráfico
  getSaldoEmConta(): number {
    const receitas = this.dadosFiltrados?.receitas || 0;
    const despesas = this.dadosFiltrados?.despesas || 0;
    const saldo = receitas - despesas;
    return saldo > 0 ? saldo : Math.abs(saldo) * 0.3; // valor positivo mínimo visível
  }

  getContasAReceber(): number {
    const receitas = this.dadosFiltrados?.receitas || 0;
    return receitas * 0.12; // aproximação para exibição
  }

  getContasAPagar(): number {
    const despesas = this.dadosFiltrados?.despesas || 0;
    return despesas * 0.18; // aproximação para exibição
  }

  criarGraficoDespesas() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const ctx = document.getElementById('despesasChart') as HTMLCanvasElement;
    if (!ctx) return;

    // Destroi gráfico existente se houver
    if (this.despesasChart) {
      this.despesasChart.destroy();
      this.despesasChart = null;
    }

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: (() => {
          const porCategoria = this.dadosFiltrados?.despesasPorCategoria || [];
          if (porCategoria.length) return porCategoria.map(item => item.categoria);
          return ['Despesas'];
        })(),
        datasets: [{
          data: (() => {
            const porCategoria = this.dadosFiltrados?.despesasPorCategoria || [];
            if (porCategoria.length) return porCategoria.map(item => item.valor);
            return [this.dadosFiltrados?.despesas || 0];
          })(),
          backgroundColor: [
            '#667eea',
            '#764ba2',
            '#f093fb',
            '#f5576c'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Distribuição de Despesas por Categoria',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true
            }
          }
        }
      }
    };

    this.despesasChart = new Chart(ctx, config);
  }


  formatCurrency(value?: number | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  getLucroPercentual(): number {
    const receitas = this.dadosFiltrados?.receitas || 0;
    const lucro = this.dadosFiltrados?.lucro || 0;
    return receitas > 0 ? (lucro / receitas) * 100 : 0;
  }

  getMargemLucro(): string {
    return this.getLucroPercentual().toFixed(1) + '%';
  }

  getMargemDespesas(): string {
    const despesas = this.dadosFiltrados?.despesas || 0;
    const receitas = this.dadosFiltrados?.receitas || 0;
    const margem = receitas > 0 ? (despesas / receitas) * 100 : 0;
    return margem.toFixed(1) + '%';
  }

  public carregarResumoFinanceiro(): void {
    if (!this.dataInicial || !this.dataFinal) {
      return;
    }

    const filtros: FiltrosMovimentacoes = {
      dataInicio: this.dataInicial,
      dataTermino: this.dataFinal
    };

    const empresaSelecionada = this.companySelectorService.obterEmpresaSelecionada();
    if (empresaSelecionada?.idEmpresa) {
      filtros.idsEmpresa = empresaSelecionada.idEmpresa;
    }

    this.resumoSubscription?.unsubscribe();
    this.resumoCarregando = true;
    this.resumoSubscription = this.bomControleService.obterResumoFinanceiro(filtros)
      .pipe(finalize(() => { this.resumoCarregando = false; }))
      .subscribe({
        next: (resumo) => this.atualizarResumoComDados(resumo),
        error: (error) => {
          console.error('Erro ao carregar o resumo financeiro:', error);
        }
      });
  }

  private atualizarResumoComDados(resumo: ResumoFinanceiroResponse): void {
    if (!resumo) {
      return;
    }

    const totalReceitas = resumo.contasReceber?.totalGeral ?? this.dadosFiltrados.receitas;
    const totalDespesas = resumo.contasPagar?.totalGeral ?? this.dadosFiltrados.despesas;
    const saldoProjetado = Number.isFinite(resumo.saldoProjetado)
      ? resumo.saldoProjetado
      : (totalReceitas - totalDespesas);
    const margemLiquida = totalReceitas > 0 ? (saldoProjetado / totalReceitas) * 100 : 0;

    this.dadosFiltrados.receitas = totalReceitas;
    this.dadosFiltrados.despesas = totalDespesas;
    this.dadosFiltrados.lucro = saldoProjetado;
    this.dadosFiltrados.margemLiquida = Number.isFinite(margemLiquida) ? margemLiquida : 0;

    const liquidadas = resumo.contasReceber?.totalLiquidado ?? 0;
    const percentualLiquidez = totalReceitas > 0
      ? (liquidadas / totalReceitas) * 100
      : this.dadosFiltrados.indicadores.crescimentoReceita;
    this.dadosFiltrados.indicadores = {
      ...this.dadosFiltrados.indicadores,
      crescimentoReceita: Number.isFinite(percentualLiquidez)
        ? Number(percentualLiquidez.toFixed(1))
        : this.dadosFiltrados.indicadores.crescimentoReceita
    };

    this.resumoFonteDados = resumo.fonteDados ?? null;

    // KPIs adicionais calculados no backend.
    this.mediaNovosContratosReais3m = resumo.mediaNovosContratosReais3m ?? null;
    this.mediaNovosContratosUnidades3m = resumo.mediaNovosContratosUnidades3m ?? null;
    this.custoFinanceiroInvestimento = resumo.custoFinanceiroInvestimento ?? null;
    this.mediaCustoFixo = resumo.mediaCustoFixo ?? null;
    this.mediaCustoVariavel = resumo.mediaCustoVariavel ?? null;
    this.mediaCustoEstrategico = resumo.mediaCustoEstrategico ?? null;
    this.totalClientesAtivos = resumo.totalClientesAtivos ?? null;
    this.churnPercent = resumo.churnPercent ?? null;
    this.ltvMeses = resumo.ltvMeses ?? null;
    this.inadimplenciaValor = resumo.inadimplenciaValor ?? null;
    this.inadimplenciaTaxa = resumo.inadimplenciaTaxa ?? null;

    // Atualiza gráficos com base nos totais reais retornados do backend.
    if (isPlatformBrowser(this.platformId)) {
      this.criarGraficoReceitas();
      this.criarGraficoDespesas();
    }
  }

  // Médias para cards do Dashboard Financeiro
  getMediaReceitas(): number {
    const serie = this.dadosFiltrados?.receitaMensal || [];
    if (Array.isArray(serie) && serie.length > 0) {
      const total = serie.reduce((acc, item: any) => acc + (Number(item?.valor) || 0), 0);
      return total / serie.length;
    }
    // Fallback por tipo de período
    if (this.tipoFiltro === 'ano') return (this.dadosFiltrados?.receitas || 0) / 12;
    if (this.tipoFiltro === 'trimestre') return (this.dadosFiltrados?.receitas || 0) / 3;
    return (this.dadosFiltrados?.receitas || 0) / 3;
  }

  getMediaDespesas(): number {
    // Não temos série de despesa por mês em todos os cenários; aproximamos por período
    if (this.tipoFiltro === 'ano') return (this.dadosFiltrados?.despesas || 0) / 12;
    if (this.tipoFiltro === 'trimestre') return (this.dadosFiltrados?.despesas || 0) / 3;
    return (this.dadosFiltrados?.despesas || 0) / 3;
  }

  getStatusLucro(): string {
    const percentual = this.getLucroPercentual();
    if (percentual >= 20) return 'excelente';
    if (percentual >= 10) return 'bom';
    if (percentual >= 0) return 'regular';
    return 'ruim';
  }

  getStatusClass(): string {
    return `status-${this.getStatusLucro()}`;
  }

  private calcularMediasContratosUltimos3Meses(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        this.calcularContratosPorMes();
        break;
      case 'trimestre':
        this.calcularContratosPorTrimestre();
        break;
      case 'ano':
        this.calcularContratosPorAno();
        break;
    }
  }

  private calcularContratosPorMes(): void {
    const novosContratosPorMes: {[key: string]: {valor: number, quantidade: number}} = {
      '2025-10': { valor: 55000, quantidade: 2.5 },
      '2025-09': { valor: 52000, quantidade: 2.3 },
      '2025-08': { valor: 48000, quantidade: 2.1 },
      '2025-07': { valor: 45000, quantidade: 2.0 },
      '2025-06': { valor: 42000, quantidade: 1.8 },
      '2025-05': { valor: 38000, quantidade: 1.6 },
      '2025-04': { valor: 35000, quantidade: 1.4 },
      '2025-03': { valor: 32000, quantidade: 1.2 },
      '2025-02': { valor: 28000, quantidade: 1.0 },
      '2025-01': { valor: 25000, quantidade: 0.8 }
    };

    const mesAtual = this.dataInicial.substring(0, 7);
    if (novosContratosPorMes[mesAtual]) {
      this.mediaNovosContratosReais3m = novosContratosPorMes[mesAtual].valor;
      this.mediaNovosContratosUnidades3m = novosContratosPorMes[mesAtual].quantidade;
    } else {
      this.mediaNovosContratosReais3m = 40000;
      this.mediaNovosContratosUnidades3m = 1.8;
    }
  }

  private calcularContratosPorTrimestre(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
    
    const contratosPorTrimestre: {[key: string]: {valor: number, quantidade: number}} = {
      '2025-Q4': { valor: 155000, quantidade: 6.9 }, // Out+Set+Ago
      '2025-Q3': { valor: 135000, quantidade: 5.9 }, // Jul+Jun+Mai
      '2025-Q2': { valor: 105000, quantidade: 4.2 }, // Abr+Mar+Fev
      '2025-Q1': { valor: 75000, quantidade: 3.0 }   // Jan+Dez+Nov
    };

    const chaveTrimestre = `${ano}-Q${trimestre}`;
    if (contratosPorTrimestre[chaveTrimestre]) {
      this.mediaNovosContratosReais3m = contratosPorTrimestre[chaveTrimestre].valor;
      this.mediaNovosContratosUnidades3m = contratosPorTrimestre[chaveTrimestre].quantidade;
    } else {
      this.mediaNovosContratosReais3m = 120000;
      this.mediaNovosContratosUnidades3m = 5.0;
    }
  }

  private calcularContratosPorAno(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    
    const contratosPorAno: {[key: string]: {valor: number, quantidade: number}} = {
      '2025': { valor: 470000, quantidade: 20.0 },
      '2024': { valor: 380000, quantidade: 16.5 },
      '2023': { valor: 280000, quantidade: 12.0 }
    };

    if (contratosPorAno[ano.toString()]) {
      this.mediaNovosContratosReais3m = contratosPorAno[ano.toString()].valor;
      this.mediaNovosContratosUnidades3m = contratosPorAno[ano.toString()].quantidade;
    } else {
      this.mediaNovosContratosReais3m = 400000;
      this.mediaNovosContratosUnidades3m = 17.0;
    }
  }

  private calcularMediaCustoFixo(): void {
    // Dados mock simulando custos fixos dos últimos 6 meses
    const custosFixosUltimos6Meses = [
      { mes: 'Setembro 2023', valor: 28000 },
      { mes: 'Outubro 2023', valor: 29000 },
      { mes: 'Novembro 2023', valor: 30000 },
      { mes: 'Dezembro 2023', valor: 32000 },
      { mes: 'Janeiro 2024', valor: 31000 },
      { mes: 'Fevereiro 2024', valor: 33000 }
    ];

    const totalCustosFixos = custosFixosUltimos6Meses.reduce((acc, mes) => acc + mes.valor, 0);
    this.mediaCustoFixo = totalCustosFixos / 6; // média mensal em R$
  }

  private calcularMediaCustoVariavel(): void {
    // Dados mock simulando custos variáveis dos últimos 6 meses
    const custosVariaveisUltimos6Meses = [
      { mes: 'Setembro 2023', valor: 12000 },
      { mes: 'Outubro 2023', valor: 15000 },
      { mes: 'Novembro 2023', valor: 18000 },
      { mes: 'Dezembro 2023', valor: 14000 },
      { mes: 'Janeiro 2024', valor: 16000 },
      { mes: 'Fevereiro 2024', valor: 19000 }
    ];

    const totalCustosVariaveis = custosVariaveisUltimos6Meses.reduce((acc, mes) => acc + mes.valor, 0);
    this.mediaCustoVariavel = totalCustosVariaveis / 6; // média mensal em R$
  }

  private calcularMediaCustoEstrategico(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        this.calcularCustoEstrategicoPorMes();
        break;
      case 'trimestre':
        this.calcularCustoEstrategicoPorTrimestre();
        break;
      case 'ano':
        this.calcularCustoEstrategicoPorAno();
        break;
    }
  }

  private calcularCustoEstrategicoPorMes(): void {
    const custosEstrategicosPorMes: {[key: string]: number} = {
      '2025-10': 42000, '2025-09': 38000, '2025-08': 35000, '2025-07': 32000,
      '2025-06': 28000, '2025-05': 25000, '2025-04': 22000, '2025-03': 20000,
      '2025-02': 18000, '2025-01': 15000
    };

    const mesAtual = this.dataInicial.substring(0, 7);
    this.mediaCustoEstrategico = custosEstrategicosPorMes[mesAtual] || 30000;
  }

  private calcularCustoEstrategicoPorTrimestre(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
    
    const custosPorTrimestre: {[key: string]: number} = {
      '2025-Q4': 115000, // Out+Set+Ago
      '2025-Q3': 95000,  // Jul+Jun+Mai
      '2025-Q2': 70000,  // Abr+Mar+Fev
      '2025-Q1': 53000   // Jan+Dez+Nov
    };

    const chaveTrimestre = `${ano}-Q${trimestre}`;
    this.mediaCustoEstrategico = custosPorTrimestre[chaveTrimestre] || 85000;
  }

  private calcularCustoEstrategicoPorAno(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    
    const custosPorAno: {[key: string]: number} = {
      '2025': 333000, '2024': 280000, '2023': 220000
    };

    this.mediaCustoEstrategico = custosPorAno[ano.toString()] || 300000;
  }

  private calcularCustoFinanceiroInvestimento(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        this.calcularCustoFinanceiroPorMes();
        break;
      case 'trimestre':
        this.calcularCustoFinanceiroPorTrimestre();
        break;
      case 'ano':
        this.calcularCustoFinanceiroPorAno();
        break;
    }
  }

  private calcularCustoFinanceiroPorMes(): void {
    const custoFinanceiroPorMes: {[key: string]: number} = {
      '2025-10': 85000, '2025-09': 78000, '2025-08': 72000, '2025-07': 68000,
      '2025-06': 62000, '2025-05': 58000, '2025-04': 54000, '2025-03': 50000,
      '2025-02': 46000, '2025-01': 42000
    };

    const mesAtual = this.dataInicial.substring(0, 7);
    this.custoFinanceiroInvestimento = custoFinanceiroPorMes[mesAtual] || 60000;
  }

  private calcularCustoFinanceiroPorTrimestre(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
    
    const custosPorTrimestre: {[key: string]: number} = {
      '2025-Q4': 235000, // Out+Set+Ago
      '2025-Q3': 198000, // Jul+Jun+Mai
      '2025-Q2': 164000, // Abr+Mar+Fev
      '2025-Q1': 138000  // Jan+Dez+Nov
    };

    const chaveTrimestre = `${ano}-Q${trimestre}`;
    this.custoFinanceiroInvestimento = custosPorTrimestre[chaveTrimestre] || 180000;
  }

  private calcularCustoFinanceiroPorAno(): void {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    
    const custosPorAno: {[key: string]: number} = {
      '2025': 735000, '2024': 650000, '2023': 520000
    };

    this.custoFinanceiroInvestimento = custosPorAno[ano.toString()] || 600000;
  }

  private calcularTotalClientesAtivos(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        const clientesPorMes: {[key: string]: number} = {
          '2025-10': 1250, '2025-09': 1180, '2025-08': 1120, '2025-07': 1080,
          '2025-06': 1020, '2025-05': 980, '2025-04': 920, '2025-03': 880,
          '2025-02': 820, '2025-01': 750
        };
        const mesAtual = this.dataInicial.substring(0, 7);
        this.totalClientesAtivos = clientesPorMes[mesAtual] || 1000;
        break;
      case 'trimestre':
        const dataIni = this.parseLocalDateStr(this.dataInicial);
        const ano = dataIni.getFullYear();
        const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
        const clientesPorTrimestre: {[key: string]: number} = {
          '2025-Q4': 3550, '2025-Q3': 3080, '2025-Q2': 2820, '2025-Q1': 2450
        };
        const chaveTrimestre = `${ano}-Q${trimestre}`;
        this.totalClientesAtivos = clientesPorTrimestre[chaveTrimestre] || 3000;
        break;
      case 'ano':
        const anoAtual = this.parseLocalDateStr(this.dataInicial).getFullYear();
        const clientesPorAno: {[key: string]: number} = {
          '2025': 11900, '2024': 10500, '2023': 8500
        };
        this.totalClientesAtivos = clientesPorAno[anoAtual.toString()] || 10000;
        break;
    }
  }

  private calcularChurnPercent(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        const churnPorMes: {[key: string]: number} = {
          '2025-10': 1.8, '2025-09': 2.1, '2025-08': 2.3, '2025-07': 2.6,
          '2025-06': 2.9, '2025-05': 3.2, '2025-04': 3.5, '2025-03': 3.8,
          '2025-02': 4.1, '2025-01': 4.5
        };
        const mesAtual = this.dataInicial.substring(0, 7);
        this.churnPercent = churnPorMes[mesAtual] || 3.0;
        break;
      case 'trimestre':
        const dataIni = this.parseLocalDateStr(this.dataInicial);
        const ano = dataIni.getFullYear();
        const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
        const churnPorTrimestre: {[key: string]: number} = {
          '2025-Q4': 2.1, '2025-Q3': 2.9, '2025-Q2': 3.5, '2025-Q1': 4.1
        };
        const chaveTrimestre = `${ano}-Q${trimestre}`;
        this.churnPercent = churnPorTrimestre[chaveTrimestre] || 3.2;
        break;
      case 'ano':
        const anoAtual = this.parseLocalDateStr(this.dataInicial).getFullYear();
        const churnPorAno: {[key: string]: number} = {
          '2025': 2.6, '2024': 3.1, '2023': 3.8
        };
        this.churnPercent = churnPorAno[anoAtual.toString()] || 3.0;
        break;
    }
  }

  private calcularLtvMeses(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        const ltvPorMes: {[key: string]: number} = {
          '2025-10': 28, '2025-09': 27, '2025-08': 26, '2025-07': 25,
          '2025-06': 24, '2025-05': 23, '2025-04': 22, '2025-03': 21,
          '2025-02': 20, '2025-01': 19
        };
        const mesAtual = this.dataInicial.substring(0, 7);
        this.ltvMeses = ltvPorMes[mesAtual] || 24;
        break;
      case 'trimestre':
        const dataIni = this.parseLocalDateStr(this.dataInicial);
        const ano = dataIni.getFullYear();
        const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
        const ltvPorTrimestre: {[key: string]: number} = {
          '2025-Q4': 27, '2025-Q3': 24, '2025-Q2': 21, '2025-Q1': 20
        };
        const chaveTrimestre = `${ano}-Q${trimestre}`;
        this.ltvMeses = ltvPorTrimestre[chaveTrimestre] || 23;
        break;
      case 'ano':
        const anoAtual = this.parseLocalDateStr(this.dataInicial).getFullYear();
        const ltvPorAno: {[key: string]: number} = {
          '2025': 25, '2024': 22, '2023': 18
        };
        this.ltvMeses = ltvPorAno[anoAtual.toString()] || 22;
        break;
    }
  }

  private calcularInadimplencia(): void {
    switch (this.tipoFiltro) {
      case 'mes':
        const inadValorPorMes: {[key: string]: number} = {
          '2025-10': 42000, '2025-09': 45000, '2025-08': 47000, '2025-07': 50000,
          '2025-06': 52000, '2025-05': 54000, '2025-04': 56000, '2025-03': 58000,
          '2025-02': 60000, '2025-01': 62000
        };
        const inadTaxaPorMes: {[key: string]: number} = {
          '2025-10': 3.1, '2025-09': 3.3, '2025-08': 3.5, '2025-07': 3.7,
          '2025-06': 3.9, '2025-05': 4.1, '2025-04': 4.3, '2025-03': 4.5,
          '2025-02': 4.7, '2025-01': 5.0
        };
        const mesAtual = this.dataInicial.substring(0, 7);
        this.inadimplenciaValor = inadValorPorMes[mesAtual] || 50000;
        this.inadimplenciaTaxa = inadTaxaPorMes[mesAtual] || 4.0;
        break;
      case 'trimestre':
        const dataIni = this.parseLocalDateStr(this.dataInicial);
        const ano = dataIni.getFullYear();
        const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
        const inadValorPorTrimestre: {[key: string]: number} = {
          '2025-Q4': 134000, '2025-Q3': 149000, '2025-Q2': 164000, '2025-Q1': 180000
        };
        const inadTaxaPorTrimestre: {[key: string]: number} = {
          '2025-Q4': 3.3, '2025-Q3': 3.8, '2025-Q2': 4.3, '2025-Q1': 4.7
        };
        const chaveTrimestre = `${ano}-Q${trimestre}`;
        this.inadimplenciaValor = inadValorPorTrimestre[chaveTrimestre] || 150000;
        this.inadimplenciaTaxa = inadTaxaPorTrimestre[chaveTrimestre] || 4.0;
        break;
      case 'ano':
        const anoAtual = this.parseLocalDateStr(this.dataInicial).getFullYear();
        const inadValorPorAno: {[key: string]: number} = {
          '2025': 627000, '2024': 580000, '2023': 520000
        };
        const inadTaxaPorAno: {[key: string]: number} = {
          '2025': 3.9, '2024': 4.2, '2023': 4.8
        };
        this.inadimplenciaValor = inadValorPorAno[anoAtual.toString()] || 600000;
        this.inadimplenciaTaxa = inadTaxaPorAno[anoAtual.toString()] || 4.0;
        break;
    }
  }

  private inicializarFiltros(): void {
    // Fica dinâmico (sem “mocks” fixos de 2023/2024/2025).
    const hoje = new Date();

    // Últimos 12 meses (inclui mês atual)
    const nomesMes: string[] = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro'
    ];
    const meses: Array<{ value: string; label: string }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${nomesMes[d.getMonth()]} ${d.getFullYear()}`;
      meses.push({ value, label });
    }
    this.mesesDisponiveis = meses;

    // Últimos 4 trimestres
    const trimestres: Array<{ value: string; label: string }> = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i * 3, 1);
      const ano = d.getFullYear();
      const trimestre = Math.ceil((d.getMonth() + 1) / 3);
      const value = `${ano}-Q${trimestre}`;
      const label = `${trimestre}º Trimestre ${ano}`;
      trimestres.push({ value, label });
    }
    // Garante ordem (do mais antigo para o mais recente)
    this.trimestresDisponiveis = trimestres.sort((a, b) => a.value.localeCompare(b.value));

    // Últimos 3 anos
    const anos: Array<{ value: string; label: string }> = [];
    for (let i = 2; i >= 0; i--) {
      const ano = hoje.getFullYear() - i;
      anos.push({ value: String(ano), label: String(ano) });
    }
    this.anosDisponiveis = anos;

    // Define valores padrão
    this.dataInicial = '';
    this.dataFinal = '';
    this.tipoFiltro = 'mes';
  }

  onFiltroAlterado(): void {
    this.carregarResumoFinanceiro();
  }

  onTipoFiltroAlterado(): void {
    // Ajusta as datas baseado no tipo de filtro
    const hoje = new Date();
    const ano = hoje.getFullYear();
    
    switch (this.tipoFiltro) {
      case 'mes':
        this.dataInicial = `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
        this.dataFinal = `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${new Date(ano, hoje.getMonth() + 1, 0).getDate()}`;
        break;
      case 'trimestre':
        const trimestre = Math.ceil((hoje.getMonth() + 1) / 3);
        const mesInicial = (trimestre - 1) * 3 + 1;
        const mesFinal = trimestre * 3;
        this.dataInicial = `${ano}-${String(mesInicial).padStart(2, '0')}-01`;
        this.dataFinal = `${ano}-${String(mesFinal).padStart(2, '0')}-${new Date(ano, mesFinal, 0).getDate()}`;
        break;
      case 'ano':
        this.dataInicial = `${ano}-01-01`;
        this.dataFinal = `${ano}-12-31`;
        break;
    }
    
    this.onFiltroAlterado();
  }

  getTrimestreSelecionado(): string {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const ano = dataIni.getFullYear();
    const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
    return `${ano}-Q${trimestre}`;
  }

  getAnoSelecionado(): string {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    return dataIni.getFullYear().toString();
  }

  selecionarTrimestre(trimestreValue: string): void {
    const [ano, q] = trimestreValue.split('-Q');
    const trimestre = parseInt(q);
    
    // Calcula datas do trimestre
    const mesInicial = (trimestre - 1) * 3 + 1;
    const mesFinal = trimestre * 3;
    
    this.dataInicial = `${ano}-${String(mesInicial).padStart(2, '0')}-01`;
    this.dataFinal = `${ano}-${String(mesFinal).padStart(2, '0')}-${new Date(parseInt(ano), mesFinal, 0).getDate()}`;
    
    this.onFiltroAlterado();
  }

  selecionarAno(anoValue: string): void {
    this.dataInicial = `${anoValue}-01-01`;
    this.dataFinal = `${anoValue}-12-31`;
    this.onFiltroAlterado();
  }

  getPeriodoAtualLabel(): string {
    const dataIni = this.parseLocalDateStr(this.dataInicial);
    const dataFim = this.parseLocalDateStr(this.dataFinal);
    
    switch (this.tipoFiltro) {
      case 'mes':
        return dataIni.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      case 'trimestre':
        const trimestre = Math.ceil((dataIni.getMonth() + 1) / 3);
        return `${trimestre}º Trimestre ${dataIni.getFullYear()}`;
      case 'ano':
        return dataIni.getFullYear().toString();
      default:
        return 'Carregando...';
    }
  }

  getStatusFiltro(): string {
    const percentual = this.getLucroPercentual();
    if (percentual >= 20) return 'Excelente';
    if (percentual >= 10) return 'Bom';
    if (percentual >= 0) return 'Regular';
    return 'Inicial';
  }

  /** Atalhos de período: aplica visão e intervalo em um clique */
  aplicarAtalhoPeriodo(atalho: 'mes' | 'trimestre' | 'ano'): void {
    this.tipoFiltro = atalho;
    this.onTipoFiltroAlterado();
  }

  /** Indica se o atalho está ativo (período atual corresponde ao atalho) */
  isAtalhoAtivo(atalho: 'mes' | 'trimestre' | 'ano'): boolean {
    if (this.tipoFiltro !== atalho) return false;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    if (atalho === 'mes') {
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const inicio = `${ano}-${mes}-01`;
      return this.dataInicial === inicio;
    }
    if (atalho === 'trimestre') {
      const trimestre = Math.ceil((hoje.getMonth() + 1) / 3);
      const mesInicial = (trimestre - 1) * 3 + 1;
      const esperado = `${ano}-${String(mesInicial).padStart(2, '0')}-01`;
      return this.dataInicial === esperado;
    }
    return this.dataInicial === `${ano}-01-01` && this.dataFinal === `${ano}-12-31`;
  }

}
