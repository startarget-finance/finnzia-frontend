import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subject, takeUntil } from 'rxjs';
import { OmieService, ContasReceberResponse, ContasPagarResponse, FiltrosMovimentacoesOmie } from '../../services/omie.service';

Chart.register(...registerables);

@Component({
  selector: 'app-relatorio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './relatorio.component.html',
  styleUrls: ['./relatorio.component.scss']
})
export class RelatorioComponent implements OnInit, AfterViewInit, OnDestroy {
  // Propriedades do gráfico
  periodoGrafico: 'mensal' | 'anual' = 'mensal';
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

  private destroy$ = new Subject<void>();

  // Dados mockados para o gráfico
  dadosFiltrados = {
    receitas: 45000,
    despesas: 32000,
    margemLiquida: 28.9,
    lucro: 13000,
    indicadores: {
      crescimentoReceita: 12.5
    }
  };

  // Dados do gráfico
  chartData = {
    labels: Array.from({ length: 31 }, (_, i) => (i + 1).toString()),
    receita: [5000, 3000, 4000, 0, 0, 0, 0, 6000, 7000, 0, 0, 0, 0, 0, 0, 8000, 0, 0, 0, 0, 0, 0, 9000, 10000, 0, 0, 0, 0, 0, 0, 5000],
    despesa: [0, 0, 0, 0, 0, 15000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12000, 0, 0, 0, 0, 0, 8000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    renegociado: [0, 0, 0, 2000, 0, 0, 0, 0, 0, 1500, 0, 0, 0, 0, 0, 0, 0, 3000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000],
    saldoProjetado: [5000, 8000, 12000, 10000, 10000, -5000, -5000, 1000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 4000, 4000, 4000, 4000, 4000, 4000, -4000, 5000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 20000]
  };

  // Dados mockados das movimentações por dia
  movimentacoesPorDia: { [key: number]: any[] } = {
    1: [
      { tipo: 'RECEITA', cliente: 'Cliente A', descricao: 'Pagamento DE Cliente A', categoria: 'Vendas', valor: 5000, dia: 1, empresa: 'empresa1', conta: 'conta1' }
    ],
    2: [
      { tipo: 'RECEITA', cliente: 'Cliente B', descricao: 'Pagamento DE Cliente B', categoria: 'Vendas', valor: 3000, dia: 2, empresa: 'empresa2', conta: 'conta2' }
    ],
    3: [
      { tipo: 'RECEITA', cliente: 'Cliente C', descricao: 'Pagamento DE Cliente C', categoria: 'Vendas', valor: 4000, dia: 3, empresa: 'empresa1', conta: 'conta1' }
    ],
    4: [
      { tipo: 'RENEGOCIAÇÃO', cliente: 'Cliente D', descricao: 'Renegociação DE Cliente D', categoria: 'Vendas', valor: 2000, dia: 4, empresa: 'empresa3', conta: 'conta3' }
    ],
    6: [
      { tipo: 'DESPESA', cliente: 'Fornecedor X', descricao: 'Pagamento DO(A) Fornecedor X', categoria: 'Operacional', valor: 15000, dia: 6, empresa: 'empresa1', conta: 'conta1' }
    ],
    8: [
      { tipo: 'RECEITA', cliente: 'Cliente E', descricao: 'Pagamento DE Cliente E', categoria: 'Vendas', valor: 6000, dia: 8, empresa: 'empresa2', conta: 'conta2' }
    ],
    9: [
      { tipo: 'RECEITA', cliente: 'Cliente F', descricao: 'Pagamento DE Cliente F', categoria: 'Vendas', valor: 7000, dia: 9, empresa: 'empresa1', conta: 'conta1' }
    ],
    10: [
      { tipo: 'RENEGOCIAÇÃO', cliente: 'Cliente G', descricao: 'Renegociação DE Cliente G', categoria: 'Vendas', valor: 1500, dia: 10, empresa: 'empresa2', conta: 'conta2' }
    ],
    15: [
      { tipo: 'DESPESA', cliente: 'Fornecedor Y', descricao: 'Pagamento DO(A) Fornecedor Y', categoria: 'Operacional', valor: 12000, dia: 15, empresa: 'empresa1', conta: 'conta1' },
      { tipo: 'RECEITA', cliente: 'Cliente H', descricao: 'Pagamento DE Cliente H', categoria: 'Vendas', valor: 8000, dia: 15, empresa: 'empresa3', conta: 'conta3' }
    ],
    18: [
      { tipo: 'RENEGOCIAÇÃO', cliente: 'Cliente I', descricao: 'Renegociação DE Cliente I', categoria: 'Vendas', valor: 3000, dia: 18, empresa: 'empresa1', conta: 'conta1' }
    ],
    21: [
      { tipo: 'DESPESA', cliente: 'Fornecedor Z', descricao: 'Pagamento DO(A) Fornecedor Z', categoria: 'Operacional', valor: 8000, dia: 21, empresa: 'empresa2', conta: 'conta2' }
    ],
    23: [
      { tipo: 'RECEITA', cliente: 'Cliente J', descricao: 'Pagamento DE Cliente J', categoria: 'Vendas', valor: 9000, dia: 23, empresa: 'empresa3', conta: 'conta3' }
    ],
    24: [
      { tipo: 'RECEITA', cliente: 'Cliente K', descricao: 'Pagamento DE Cliente K', categoria: 'Vendas', valor: 10000, dia: 24, empresa: 'empresa1', conta: 'conta1' }
    ],
    31: [
      { tipo: 'RECEITA', cliente: 'Cliente L', descricao: 'Pagamento DE Cliente L', categoria: 'Vendas', valor: 5000, dia: 31, empresa: 'empresa2', conta: 'conta2' }
    ],
    // Dias sem movimentações para testar a mensagem
    5: [],
    7: [],
    11: [],
    12: [],
    13: [],
    14: [],
    16: [],
    17: [],
    19: [],
    20: [],
    22: [],
    25: [],
    26: [],
    27: [],
    28: [],
    29: [],
    30: []
  };

  // Estado para controle de filtro por dia
  diaSelecionado: number | null = null;
  movimentacoesFiltradas: any[] = [];

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 10;
  totalItens: number = 0;

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

  constructor(private omieService: OmieService) {}

  ngOnInit() {
    this.visibleMonth = new Date();
    this.buildCalendar();
    
    // Define período padrão (ano atual até hoje)
    const hoje = new Date();
    const primeiroDiaAno = new Date(hoje.getFullYear(), 0, 1);
    this.dataInicial = primeiroDiaAno.toISOString().split('T')[0];
    this.dataFinal = hoje.toISOString().split('T')[0];
    
    // Carrega dados reais do Omie
    this.carregarDadosContas();
  }

  ngAfterViewInit() {
    this.initChart();
  }

  ngOnDestroy() {
    if (this.receitaChart) {
      this.receitaChart.destroy();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carrega dados reais de contas a receber e pagar do Omie
   * Busca todas as páginas para calcular totais corretos
   */
  carregarDadosContas(): void {
    this.loadingContas = true;
    
    // Define período padrão se não houver datas selecionadas
    const dataInicio = this.dataInicial || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const dataFim = this.dataFinal || new Date().toISOString().split('T')[0];
    
    // Busca todas as páginas para calcular totais corretos
    this.carregarTodasPaginasContasReceber(dataInicio, dataFim);
    this.carregarTodasPaginasContasPagar(dataInicio, dataFim);
  }

  /**
   * Carrega todas as páginas de contas a receber
   */
  private carregarTodasPaginasContasReceber(dataInicio: string, dataFim: string): void {
    const todasContas: any[] = [];
    let paginaAtual = 1;
    const registrosPorPagina = 500;
    let totalPaginas = 1;

    const carregarPagina = () => {
      const filtros: FiltrosMovimentacoesOmie = {
        dataInicio: dataInicio,
        dataFim: dataFim,
        pagina: paginaAtual,
        registrosPorPagina: registrosPorPagina
      };

      this.omieService.listarContasReceber(filtros)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: ContasReceberResponse) => {
            const registros = response.registros || [];
            todasContas.push(...registros);
            
            totalPaginas = response.total_de_paginas || Math.ceil((response.total_de_registros || 0) / registrosPorPagina);
            
            // Se há mais páginas, carrega a próxima
            if (paginaAtual < totalPaginas) {
              paginaAtual++;
              carregarPagina();
            } else {
              // Processa todas as contas coletadas
              this.processarContasReceber({ registros: todasContas, total_de_registros: todasContas.length } as ContasReceberResponse);
              this.loadingContas = false;
            }
          },
          error: (err: any) => {
            console.error('Erro ao carregar contas a receber:', err);
            // Processa o que conseguiu carregar
            if (todasContas.length > 0) {
              this.processarContasReceber({ registros: todasContas, total_de_registros: todasContas.length } as ContasReceberResponse);
            }
            this.loadingContas = false;
          }
        });
    };

    carregarPagina();
  }

  /**
   * Carrega todas as páginas de contas a pagar
   */
  private carregarTodasPaginasContasPagar(dataInicio: string, dataFim: string): void {
    const todasContas: any[] = [];
    let paginaAtual = 1;
    const registrosPorPagina = 500;
    let totalPaginas = 1;

    const carregarPagina = () => {
      const filtros: FiltrosMovimentacoesOmie = {
        dataInicio: dataInicio,
        dataFim: dataFim,
        pagina: paginaAtual,
        registrosPorPagina: registrosPorPagina
      };

      this.omieService.listarContasPagar(filtros)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: ContasPagarResponse) => {
            const registros = response.registros || [];
            todasContas.push(...registros);
            
            totalPaginas = response.total_de_paginas || Math.ceil((response.total_de_registros || 0) / registrosPorPagina);
            
            // Se há mais páginas, carrega a próxima
            if (paginaAtual < totalPaginas) {
              paginaAtual++;
              carregarPagina();
            } else {
              // Processa todas as contas coletadas
              this.processarContasPagar({ registros: todasContas, total_de_registros: todasContas.length } as ContasPagarResponse);
            }
          },
          error: (err: any) => {
            console.error('Erro ao carregar contas a pagar:', err);
            // Processa o que conseguiu carregar
            if (todasContas.length > 0) {
              this.processarContasPagar({ registros: todasContas, total_de_registros: todasContas.length } as ContasPagarResponse);
            }
          }
        });
    };

    carregarPagina();
  }

  /**
   * Processa resposta de contas a receber
   */
  private processarContasReceber(response: ContasReceberResponse): void {
    const registros = response.registros || [];
    let totalGeral = 0;
    let totalRecebido = 0;
    let totalPendente = 0;
    let contasPendentes = 0;

    registros.forEach(conta => {
      const valor = conta.valor_documento || conta.valor_pago || 0;
      totalGeral += valor;
      
      // Verifica se foi recebido - múltiplas formas de verificar
      const statusTitulo = (conta['status_titulo'] || conta['status'] || '').toString().toUpperCase();
      const temDataPagamento = conta.data_pagamento != null && conta.data_pagamento !== '' && conta.data_pagamento !== '-';
      const temRecebimentos = conta['recebimentos'] && Array.isArray(conta['recebimentos']) && conta['recebimentos'].length > 0;
      const temBaixas = conta['baixas'] && Array.isArray(conta['baixas']) && conta['baixas'].length > 0;
      
      const isRecebido = temDataPagamento || 
                         temRecebimentos || 
                         temBaixas ||
                         statusTitulo.includes('RECEBIDO') || 
                         statusTitulo.includes('BAIXADO') || 
                         statusTitulo.includes('QUITADO');
      
      if (isRecebido) {
        totalRecebido += valor;
      } else {
        totalPendente += valor;
        contasPendentes++;
      }
    });

    this.contasReceber = {
      totalPendente,
      totalRecebido,
      totalGeral,
      totalContas: registros.length,
      contasPendentes
    };
    
    console.log('📊 Contas a Receber processadas:', this.contasReceber);
  }

  /**
   * Processa resposta de contas a pagar
   */
  private processarContasPagar(response: ContasPagarResponse): void {
    const registros = response.registros || [];
    let totalGeral = 0;
    let totalPago = 0;
    let totalPendente = 0;
    let contasPendentes = 0;

    registros.forEach(conta => {
      const valor = conta.valor_documento || conta.valor_pago || 0;
      totalGeral += valor;
      
      // Verifica se foi pago - múltiplas formas de verificar
      const statusTitulo = (conta['status_titulo'] || conta['status'] || '').toString().toUpperCase();
      const temDataPagamento = conta.data_pagamento != null && conta.data_pagamento !== '' && conta.data_pagamento !== '-';
      const temPagamentos = conta['pagamentos'] && Array.isArray(conta['pagamentos']) && conta['pagamentos'].length > 0;
      const temBaixas = conta['baixas'] && Array.isArray(conta['baixas']) && conta['baixas'].length > 0;
      
      const isPago = temDataPagamento || 
                     temPagamentos || 
                     temBaixas ||
                     statusTitulo.includes('PAGO') || 
                     statusTitulo.includes('BAIXADO') || 
                     statusTitulo.includes('QUITADO');
      
      if (isPago) {
        totalPago += valor;
      } else {
        totalPendente += valor;
        contasPendentes++;
      }
    });

    this.contasPagar = {
      totalPendente,
      totalPago,
      totalGeral,
      totalContas: registros.length,
      contasPendentes
    };
    
    console.log('📊 Contas a Pagar processadas:', this.contasPagar);
  }

  initChart() {
    const ctx = document.getElementById('receitaChart') as HTMLCanvasElement;
    if (!ctx) return;

    this.receitaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.chartData.labels,
        datasets: [
          {
            label: 'Receita',
            data: this.chartData.receita,
            backgroundColor: 'rgba(34, 197, 94, 0.8)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 1,
            type: 'bar'
          },
          {
            label: 'Despesa',
            data: this.chartData.despesa,
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 1,
            type: 'bar'
          },
          {
            label: 'Renegociado',
            data: this.chartData.renegociado,
            backgroundColor: 'rgba(234, 179, 8, 0.8)',
            borderColor: 'rgba(234, 179, 8, 1)',
            borderWidth: 1,
            type: 'bar'
          },
          {
            label: 'Saldo total projetado no período',
            data: this.chartData.saldoProjetado,
            backgroundColor: 'transparent',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 2,
            borderDash: [5, 5],
            type: 'line',
            fill: false,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: {
                size: 12
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toLocaleString('pt-BR');
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            title: {
              display: true,
              text: 'Dias'
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const elementIndex = elements[0].index;
            const dia = elementIndex + 1;
            this.filtrarMovimentacoesPorDia(dia);
          }
        }
      }
    });
  }

  setPeriodoGrafico(periodo: 'mensal' | 'anual') {
    this.periodoGrafico = periodo;
    // Aqui você pode implementar a lógica para alterar os dados do gráfico
    // baseado no período selecionado
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  // Métodos para filtrar movimentações
  filtrarMovimentacoesPorDia(dia: number): void {
    this.diaSelecionado = dia;
    this.movimentacoesFiltradas = this.movimentacoesPorDia[dia] || [];
  }

  limparFiltroDia(): void {
    this.diaSelecionado = null;
    this.movimentacoesFiltradas = [];
  }

  getTodasMovimentacoes(): any[] {
    const todas: any[] = [];
    Object.values(this.movimentacoesPorDia).forEach(movimentacoes => {
      todas.push(...movimentacoes);
    });
    return this.aplicarFiltros(todas).sort((a, b) => b.dia - a.dia); // Ordena por dia decrescente
  }

  // Métodos de paginação
  getMovimentacoesPaginadas(): any[] {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    this.totalItens = todasMovimentacoes.length;
    
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    
    return todasMovimentacoes.slice(inicio, fim);
  }

  getTotalPaginas(): number {
    return Math.ceil(this.totalItens / this.itensPorPagina);
  }

  getPaginasVisiveis(): number[] {
    const totalPaginas = this.getTotalPaginas();
    const paginas: number[] = [];
    
    if (totalPaginas <= 7) {
      for (let i = 1; i <= totalPaginas; i++) {
        paginas.push(i);
      }
    } else {
      if (this.paginaAtual <= 4) {
        for (let i = 1; i <= 5; i++) {
          paginas.push(i);
        }
        paginas.push(-1); // Separador
        paginas.push(totalPaginas);
      } else if (this.paginaAtual >= totalPaginas - 3) {
        paginas.push(1);
        paginas.push(-1); // Separador
        for (let i = totalPaginas - 4; i <= totalPaginas; i++) {
          paginas.push(i);
        }
      } else {
        paginas.push(1);
        paginas.push(-1); // Separador
        for (let i = this.paginaAtual - 1; i <= this.paginaAtual + 1; i++) {
          paginas.push(i);
        }
        paginas.push(-1); // Separador
        paginas.push(totalPaginas);
      }
    }
    
    return paginas;
  }

  irParaPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.getTotalPaginas()) {
      this.paginaAtual = pagina;
    }
  }

  proximaPagina(): void {
    if (this.paginaAtual < this.getTotalPaginas()) {
      this.paginaAtual++;
    }
  }

  paginaAnterior(): void {
    if (this.paginaAtual > 1) {
      this.paginaAtual--;
    }
  }

  alterarItensPorPagina(novosItens: number): void {
    this.itensPorPagina = novosItens;
    this.paginaAtual = 1; // Volta para a primeira página
  }

  // Expor Math para o template
  Math = Math;

  // Métodos para filtros funcionais
  aplicarFiltros(movimentacoes: any[]): any[] {
    return movimentacoes.filter(mov => {
      const filtroEmpresa = !this.filtros.empresa || mov.empresa === this.filtros.empresa;
      const filtroConta = !this.filtros.conta || mov.conta === this.filtros.conta;
      const filtroTipo = !this.filtros.tipo || mov.tipo === this.filtros.tipo;
      const filtroCategoria = !this.filtros.categoria || mov.categoria === this.filtros.categoria;
      
      return filtroEmpresa && filtroConta && filtroTipo && filtroCategoria;
    });
  }

  onFiltroChange(): void {
    // Aplica os filtros automaticamente quando qualquer filtro muda
    if (this.diaSelecionado) {
      this.movimentacoesFiltradas = this.aplicarFiltros(this.movimentacoesPorDia[this.diaSelecionado] || []);
    }
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

  getEmpresaLabel(empresaValue: string): string {
    const empresa = this.empresas.find(e => e.value === empresaValue);
    return empresa ? empresa.label : 'N/A';
  }

  // ===== Date Range Picker Helpers =====
  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.tempRangeStart = null;
      this.tempRangeEnd = null;
      this.hoverRangeDate = null;
      this.visibleMonth = new Date();
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
      
      // Salva as datas selecionadas
      this.dataInicial = a;
      this.dataFinal = b;
      
      console.log('Período selecionado:', a, 'até', b);
      
      // Recarrega dados do Omie com o novo período
      this.carregarDadosContas();
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

  // Métodos para cálculos dos itens selecionados
  getTotalReceitas(): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes
      .filter(mov => mov.tipo === 'RECEITA')
      .reduce((total, mov) => total + mov.valor, 0);
  }

  getTotalDespesas(): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes
      .filter(mov => mov.tipo === 'DESPESA')
      .reduce((total, mov) => total + mov.valor, 0);
  }

  getSaldoLiquido(): number {
    return this.getTotalReceitas() - this.getTotalDespesas();
  }

  getTotalItens(): number {
    // Retorna o total de itens considerando todos os filtros aplicados
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes.length;
  }

  // Métodos para estatísticas avançadas
  getTotalItensPorTipo(tipo: string): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes.filter(mov => mov.tipo === tipo).length;
  }

  getTotalItensPorCategoria(categoria: string): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes.filter(mov => mov.categoria === categoria).length;
  }

  getTotalItensPorEmpresa(empresa: string): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    return todasMovimentacoes.filter(mov => mov.empresa === empresa).length;
  }

  getValorMedioPorTransacao(): number {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    if (todasMovimentacoes.length === 0) return 0;
    const valorTotal = todasMovimentacoes.reduce((total, mov) => total + mov.valor, 0);
    return valorTotal / todasMovimentacoes.length;
  }

  getMaiorTransacao(): any {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    if (todasMovimentacoes.length === 0) return null;
    return todasMovimentacoes.reduce((maior, mov) => mov.valor > maior.valor ? mov : maior);
  }

  getMenorTransacao(): any {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    if (todasMovimentacoes.length === 0) return null;
    return todasMovimentacoes.reduce((menor, mov) => mov.valor < menor.valor ? mov : menor);
  }

  getPercentualPorTipo(tipo: string): number {
    const total = this.getTotalItens();
    if (total === 0) return 0;
    return (this.getTotalItensPorTipo(tipo) / total) * 100;
  }

  getPercentualPorEmpresa(empresa: string): number {
    const total = this.getTotalItens();
    if (total === 0) return 0;
    return (this.getTotalItensPorEmpresa(empresa) / total) * 100;
  }

  getPercentualPorCategoria(categoria: string): number {
    const total = this.getTotalItens();
    if (total === 0) return 0;
    return (this.getTotalItensPorCategoria(categoria) / total) * 100;
  }

  getDiasComMovimentacao(): number {
    return Object.keys(this.movimentacoesPorDia).filter(dia => 
      this.movimentacoesPorDia[parseInt(dia)].length > 0
    ).length;
  }

  getDiasSemMovimentacao(): number {
    return 31 - this.getDiasComMovimentacao();
  }

  // Métodos para exportação
  exportarParaCSV(): void {
    const todasMovimentacoes = this.diaSelecionado ? this.movimentacoesFiltradas : this.getTodasMovimentacoes();
    
    const headers = ['Parcela', 'Tipo', 'Data Venc.', 'Data Comp.', 'Cliente/Fornecedor', 'Empresa', 'Categoria', 'Valor (R$)'];
    const csvContent = [
      headers.join(','),
      ...todasMovimentacoes.map(mov => [
        '∞',
        mov.tipo,
        `${mov.dia}/10/2024`,
        `${mov.dia}/10/2024`,
        `"${mov.cliente}"`,
        `"${this.getEmpresaLabel(mov.empresa)}"`,
        mov.categoria,
        mov.valor.toFixed(2).replace('.', ',')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `movimentacoes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportarParaPDF(): void {
    // Implementação básica para PDF (seria necessário uma biblioteca como jsPDF)
    console.log('Exportação para PDF - funcionalidade a ser implementada');
    alert('Funcionalidade de exportação para PDF será implementada em breve!');
  }

  // Métodos para análise de tendências
  getTendenciaReceitas(): 'crescimento' | 'queda' | 'estavel' {
    // Lógica simplificada - em um sistema real, compararia com períodos anteriores
    const receitas = this.getTotalReceitas();
    if (receitas > 50000) return 'crescimento';
    if (receitas < 30000) return 'queda';
    return 'estavel';
  }

  getIndicadorPerformance(): number {
    // Score de 0 a 100 baseado em vários fatores
    const totalItens = this.getTotalItens();
    const saldoLiquido = this.getSaldoLiquido();
    const diasComMovimentacao = this.getDiasComMovimentacao();
    
    let score = 0;
    
    // Score baseado no número de transações (0-30 pontos)
    score += Math.min(totalItens * 2, 30);
    
    // Score baseado no saldo líquido (0-40 pontos)
    if (saldoLiquido > 0) {
      score += Math.min(saldoLiquido / 1000, 40);
    }
    
    // Score baseado na atividade (0-30 pontos)
    score += Math.min(diasComMovimentacao * 1.5, 30);
    
    return Math.round(Math.min(score, 100));
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
