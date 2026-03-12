import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { BomControleService, MovimentacaoFinanceira, FiltrosMovimentacoes } from '../../services/bomcontrole.service';
import { OmieService, MovimentacaoOmie, MovimentacoesOmieResponse, FiltrosMovimentacoesOmie } from '../../services/omie.service';
import { CompanySelectorService } from '../../services/company-selector.service';

@Component({
  selector: 'app-movimentacoes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './movimentacoes.component.html',
})
export class MovimentacoesComponent implements OnInit, OnDestroy {
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
  movimentacoes: MovimentacaoFinanceira[] = [];
  movimentacoesFiltradas: MovimentacaoFinanceira[] = [];
  /** Lista completa filtrada quando disponível (ex.: cache Omie) — usada para ordenar sobre todos os itens */
  movimentacoesFiltradasCompleta: MovimentacaoFinanceira[] = [];
  loading: boolean = false;
  error: string | null = null;
  
  // Cache estratégico (Anti-Block) - carrega uma vez e persiste
  private cacheMovimentacoes: Map<string, { data: MovimentacaoFinanceira[], timestamp: number, totais: any }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private cacheKeyAtual: string = '';
  
  // Totais agregados (de todas as movimentações, não apenas da página atual)
  totalReceitasGeral: number = 0;
  totalDespesasGeral: number = 0;
  saldoLiquidoGeral: number = 0;

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalItens: number = 0;
  totalPaginas: number = 0;

  // Filtros
  filtros: FiltrosMovimentacoes = {
    tipoData: 'DataVencimento',
    itensPorPagina: 50,
    numeroDaPagina: 1
  };

  // Filtros de UI (categoria, tipo, status, etc.)
  filtrosUI = {
    categoria: '',
    tipo: '' as 'receita' | 'despesa' | '',
    status: '' as 'pendente' | 'quitado' | '',
    textoPesquisa: ''
  };

  /**
   * Mensagem de erro de validação (ex.: intervalo de datas inválido).
   * Diferente de erros de API.
   */
  validationError: string | null = null;

  // Opções para filtros
  tipos = [
    { value: '', label: 'Todos os Tipos' },
    { value: 'receita', label: 'Receita' },
    { value: 'despesa', label: 'Despesa' }
  ];
  statusOpcoes = [
    { value: '', label: 'Todos os Status' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'quitado', label: 'Quitado' }
  ];

  // Ordenação da tabela
  sortBy: '' | 'tipo' | 'data' | 'valor' | 'status' = '';
  sortOrder: 'asc' | 'desc' = 'asc';

  // Modal de detalhes (por categoria/cliente)
  mostrarModalDetalhes = false;
  tipoModalDetalhes: 'receita' | 'despesa' = 'receita';

  // Categorias dinâmicas (serão carregadas das movimentações)
  categorias: Array<{ value: string, label: string }> = [
    { value: '', label: 'Todas as Categorias' }
  ];

  // Fonte de dados
  fonteDados: 'bomcontrole' | 'omie' = 'bomcontrole'; // Padrão: Bom Controle

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();

  constructor(
    private bomControleService: BomControleService,
    private omieService: OmieService,
    private companySelectorService: CompanySelectorService
  ) {
    this.visibleMonth = new Date();
    this.buildCalendar();
    
            // Debounce para pesquisa de texto - recarrega dados quando texto mudar
            this.textoPesquisaSubject.pipe(
              debounceTime(500),
              distinctUntilChanged(),
              takeUntil(this.destroy$)
            ).subscribe(texto => {
              this.filtrosUI.textoPesquisa = texto;
              this.paginaAtual = 1; // Volta para primeira página ao pesquisar
              this.carregarMovimentacoes();
            });
  }

  ngOnInit(): void {
    // Pré-preencher com mês atual automaticamente
    this.preencherMesAtual();
    
    // Verificar se usuário possui alguma empresa configurada
    const empresaSelecionada = this.companySelectorService.obterEmpresaSelecionada();
    
    if (!empresaSelecionada) {
      // Incrementar contador e log com informação de empresas permitidas
      const empresasPermitidas = this.companySelectorService.obterEmpresasAtivas();
      console.warn(`⚠️ Usuário não possui empresa selecionada, ${empresasPermitidas.length} empresa(s) disponível(is)`);
      
      // Se há empresas disponíveis, selecionar a primeira ou a padrão
      if (empresasPermitidas.length > 0) {
        this.companySelectorService.selecionarEmpresaPadrao();
        // Tentar carregar novamente após seleção
        setTimeout(() => {
          this.carregarMovimentacoes();
        }, 100);
        return;
      }
      
      this.error = 'Nenhuma empresa configurada para o usuário. Acesse "Gerenciar Acessos" para configurar.';
      this.loading = false;
      return;
    }
    
    // Carrega automaticamente com filtro de data do mês atual
    // A empresa é obtida via CompanySelectorService (X-Empresa-Id header)
    this.carregarMovimentacoes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Preenche automaticamente com as datas do mês atual
   * Formato: YYYY-MM-DD
   */
  private preencherMesAtual(): void {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    
    // Primeiro dia do mês
    this.dataInicial = `${ano}-${mes}-01`;
    
    // Último dia do mês
    const ultimoDia = new Date(ano, parseInt(mes), 0).getDate();
    this.dataFinal = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
    
    // Atualizar calendário visual
    this.visibleMonth = new Date(ano, parseInt(mes) - 1);
    this.buildCalendar();
    
    console.log(`📅 Mês atual pré-preenchido: ${this.dataInicial} até ${this.dataFinal}`);
  }

  // ===== Carregamento de Dados =====
  carregarMovimentacoes(): void {
    // Validação básica de intervalo de datas quando ambos estiverem preenchidos
    if (this.dataInicial && this.dataFinal) {
      const inicio = this.parseLocalDateStr(this.dataInicial);
      const fim = this.parseLocalDateStr(this.dataFinal);
      if (inicio > fim) {
        this.validationError = 'A data inicial não pode ser maior que a data final.';
        this.loading = false;
        return;
      }
    }

    this.loading = true;
    this.error = null;
    this.validationError = null;

    if (this.fonteDados === 'omie') {
      this.carregarMovimentacoesOmie();
    } else {
      this.carregarMovimentacoesBomControle();
    }
  }

  private carregarMovimentacoesBomControle(): void {
    // Garante que temos datas preenchidas (mês atual como padrão)
    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }

    // Prepara filtros - agora inclui filtros de UI também
    const statusPagamento = this.filtrosUI.status === 'quitado' ? 'recebido' as const
      : this.filtrosUI.status === 'pendente' ? 'pendente' as const : undefined;
    const filtros: FiltrosMovimentacoes = {
      ...this.filtros,
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined,
      categoria: this.filtrosUI.categoria || undefined,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      statusPagamento,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      orderBy: this.sortBy || undefined,
      orderDirection: this.sortBy ? this.sortOrder : undefined,
      numeroDaPagina: this.paginaAtual,
      itensPorPagina: this.itensPorPagina
    };

    console.log('🔍 Carregando movimentações do Bom Controle com filtros:', filtros);
    
    this.bomControleService.buscarMovimentacoes(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.processarRespostaBomControle(response);
        },
        error: (err: any) => {
          console.error('Erro ao carregar movimentações do Bom Controle:', err);
          this.error = err.error?.mensagem || 'Erro ao carregar movimentações';
          this.loading = false;
        }
      });
  }

  /**
   * Gera chave única para cache baseada no período de datas
   */
  private gerarChaveCache(): string {
    const inicio = this.dataInicial || 'sem_data';
    const fim = this.dataFinal || 'sem_data';
    return `${inicio}_${fim}`;
  }

  /**
   * Verifica se há cache válido para o período atual
   */
  private obterCache(): { data: MovimentacaoFinanceira[], totais: any } | null {
    const chave = this.gerarChaveCache();
    const cached = this.cacheMovimentacoes.get(chave);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log('✅ Cache hit - usando dados em cache para evitar consumo redundante');
      return { data: cached.data, totais: cached.totais };
    }
    
    return null;
  }

  /**
   * Armazena dados no cache
   */
  private armazenarCache(data: MovimentacaoFinanceira[], totais: any): void {
    const chave = this.gerarChaveCache();
    this.cacheMovimentacoes.set(chave, {
      data: [...data], // Cópia para evitar mutação
      timestamp: Date.now(),
      totais: { ...totais }
    });
    this.cacheKeyAtual = chave;
    console.log('💾 Dados armazenados no cache (TTL: 5min)');
  }

  /**
   * Busca memoizada local - filtra dados em cache sem fazer requisição
   */
  private buscarLocalMemoizada(filtros: FiltrosMovimentacoesOmie): MovimentacaoFinanceira[] {
    const cached = this.obterCache();
    if (!cached) {
      return []; // Sem cache, precisa buscar do servidor
    }

    console.log('🔍 Busca local memoizada - filtrando', cached.data.length, 'itens em cache');
    
    let resultado = [...cached.data];

    // Aplica filtros localmente
    if (filtros.tipo) {
      const isReceita = filtros.tipo === 'receita';
      resultado = resultado.filter(mov => isReceita ? !mov.Debito : mov.Debito);
    }

    if (filtros.categoria) {
      resultado = resultado.filter(mov => 
        mov.NomeCategoriaFinanceira === filtros.categoria
      );
    }

    if (filtros.textoPesquisa) {
      const texto = filtros.textoPesquisa.toLowerCase();
      resultado = resultado.filter(mov => 
        (mov.Nome && mov.Nome.toLowerCase().includes(texto)) ||
        (mov.NomeClienteFornecedor && mov.NomeClienteFornecedor.toLowerCase().includes(texto)) ||
        (mov.Observacao && mov.Observacao.toLowerCase().includes(texto))
      );
    }

    const status = (filtros as FiltrosMovimentacoesOmie & { status?: string }).status;
    if (status === 'pendente') {
      resultado = resultado.filter(mov => !(mov as any).DataQuitacao);
    } else if (status === 'quitado') {
      resultado = resultado.filter(mov => !!(mov as any).DataQuitacao);
    }

    console.log(`✅ Busca local concluída: ${resultado.length} itens encontrados`);
    return resultado;
  }

  private carregarMovimentacoesOmie(): void {
    const filtros: FiltrosMovimentacoesOmie & { status?: string } = {
      dataInicio: this.dataInicial || undefined,
      dataFim: this.dataFinal || undefined,
      pagina: this.paginaAtual,
      registrosPorPagina: this.itensPorPagina,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      categoria: this.filtrosUI.categoria || undefined,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      status: this.filtrosUI.status || undefined
    };

    // ESTRATÉGIA 1: Cache Agressivo (Anti-Block)
    // Se temos cache válido e apenas filtros de UI mudaram (não período), busca localmente
    const temCacheValido = this.obterCache() !== null;
    const periodoMudou = this.cacheKeyAtual !== this.gerarChaveCache();
    
    // Se período não mudou e temos cache, busca localmente (sem requisição ao servidor)
    if (temCacheValido && !periodoMudou) {
      console.log('🚀 Modo cache: aplicando filtros localmente sem requisição ao servidor');
      const resultadoLocal = this.buscarLocalMemoizada(filtros);
      this.movimentacoesFiltradasCompleta = resultadoLocal;
      // Aplica paginação local (slice será aplicado na exibição após ordenação)
      const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
      const fim = inicio + this.itensPorPagina;
      this.movimentacoes = resultadoLocal.slice(inicio, fim);
      this.aplicarFiltrosUI();
      this.totalItens = resultadoLocal.length;
      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      
      // Usa totais do cache
      const cached = this.obterCache();
      if (cached?.totais) {
        console.log('💰 Totais restaurados do cache:', cached.totais);
        this.totalReceitasGeral = cached.totais.totalReceitas ?? 0;
        this.totalDespesasGeral = cached.totais.totalDespesas ?? 0;
        this.saldoLiquidoGeral = cached.totais.saldoLiquido ?? 0;
        console.log('✅ Totais atribuídos do cache:', {
          totalReceitasGeral: this.totalReceitasGeral,
          totalDespesasGeral: this.totalDespesasGeral,
          saldoLiquidoGeral: this.saldoLiquidoGeral
        });
      } else {
        console.warn('⚠️ Cache não tem totais, calculando localmente');
        // Se não tem totais no cache, calcula localmente
        let totalReceitas = 0;
        let totalDespesas = 0;
        resultadoLocal.forEach(mov => {
          if (mov.Debito) {
            totalDespesas += mov.Valor || 0;
          } else {
            totalReceitas += mov.Valor || 0;
          }
        });
        this.totalReceitasGeral = totalReceitas;
        this.totalDespesasGeral = totalDespesas;
        this.saldoLiquidoGeral = totalReceitas - totalDespesas;
      }
      
      this.loading = false;
      return;
    }

    // Se período mudou ou não há cache, busca do servidor
    console.log('🌐 Buscando do servidor (cache miss ou período alterado)');
    this.loading = true;
    this.error = null;

    // Remove filtros de UI da requisição se temos cache (para buscar todos os dados)
    const filtrosServidor: FiltrosMovimentacoesOmie = temCacheValido && !periodoMudou
      ? {
          dataInicio: this.dataInicial || undefined,
          dataFim: this.dataFinal || undefined,
          pagina: 1,
          registrosPorPagina: 500 // Busca máximo para cache completo
        }
      : filtros;

    console.log('🔍 Carregando movimentações do OMIE com filtros:', filtrosServidor);
    
    this.omieService.pesquisarMovimentacoes(filtrosServidor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.processarRespostaOmie(response);
          // Cache já é armazenado dentro de processarRespostaOmie
        },
        error: (err) => {
          console.error('Erro ao carregar movimentações do OMIE:', err);
          this.error = err.error?.mensagem || err.message || 'Erro ao carregar movimentações do OMIE';
          this.loading = false;
        }
      });
  }

  private processarRespostaBomControle(response: any): void {
    console.log('✅ Resposta completa do Bom Controle:', JSON.stringify(response, null, 2));
    this.movimentacoesFiltradasCompleta = [];
    this.movimentacoes = response.movimentacoes || [];
    console.log(`📦 Itens recebidos: ${this.movimentacoes.length}`);
    
    // Obtém o total de itens da resposta
    if (response.total !== undefined && response.total !== null) {
      this.totalItens = response.total;
    } else if (response.paginacao && response.paginacao.totalItens !== undefined) {
      this.totalItens = response.paginacao.totalItens;
    } else {
      this.totalItens = this.movimentacoes.length;
    }
    
    // Atualiza totais agregados (calculados de todas as páginas, sempre precisos)
    this.totalReceitasGeral = response.totalReceitas !== undefined ? response.totalReceitas : 0;
    this.totalDespesasGeral = response.totalDespesas !== undefined ? response.totalDespesas : 0;
    this.saldoLiquidoGeral = response.saldoLiquido !== undefined ? response.saldoLiquido : 
                              (this.totalReceitasGeral !== null && this.totalDespesasGeral !== null ? 
                               this.totalReceitasGeral - this.totalDespesasGeral : 0);
    
    // Usa o itensPorPagina retornado pelo backend se disponível
    if (response.paginacao && response.paginacao.itensPorPagina) {
      this.itensPorPagina = response.paginacao.itensPorPagina;
    }
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Extrai categorias únicas
    this.extrairCategorias();
    
    // Garante que filtros locais (tipo/categoria/pesquisa) também sejam aplicados
    this.aplicarFiltrosUI();
    
    this.loading = false;
  }

  private processarRespostaOmie(response: MovimentacoesOmieResponse): void {
    console.log('✅ Resposta completa do OMIE:', JSON.stringify(response, null, 2));
    this.movimentacoesFiltradasCompleta = [];
    // Normaliza movimentações do OMIE para o formato esperado
    const movimentacoesOmie = response.movimentacoes || [];
    const movimentacoesNormalizadas = movimentacoesOmie.map(mov => this.normalizarMovimentacaoOmie(mov));
    
    console.log(`📦 Itens recebidos do OMIE: ${movimentacoesNormalizadas.length}`);
    
    // Obtém o total de itens
    this.totalItens = response.total !== undefined ? response.total : movimentacoesNormalizadas.length;
    
    // Obtém totais agregados da resposta do backend (já calculados de todas as movimentações)
    // O backend agora retorna totalReceitas, totalDespesas e saldoLiquido
    const responseAny = response as any;
    console.log('💰 Totais recebidos do backend:', {
      totalReceitas: responseAny.totalReceitas,
      totalDespesas: responseAny.totalDespesas,
      saldoLiquido: responseAny.saldoLiquido
    });
    
    if (responseAny.totalReceitas !== undefined && responseAny.totalReceitas !== null) {
      this.totalReceitasGeral = Number(responseAny.totalReceitas);
      this.totalDespesasGeral = responseAny.totalDespesas !== undefined && responseAny.totalDespesas !== null 
        ? Number(responseAny.totalDespesas) : 0;
      this.saldoLiquidoGeral = responseAny.saldoLiquido !== undefined && responseAny.saldoLiquido !== null
        ? Number(responseAny.saldoLiquido)
        : (this.totalReceitasGeral !== null && this.totalDespesasGeral !== null 
           ? this.totalReceitasGeral - this.totalDespesasGeral : 0);
      
      console.log('✅ Totais atribuídos:', {
        totalReceitasGeral: this.totalReceitasGeral,
        totalDespesasGeral: this.totalDespesasGeral,
        saldoLiquidoGeral: this.saldoLiquidoGeral
      });
    } else {
      console.warn('⚠️ Backend não retornou totais, calculando localmente');
      // Fallback: calcula apenas da página atual se backend não retornar os totais
      this.calcularTotaisOmie(movimentacoesOmie);
    }
    
    // Armazena todos os dados normalizados no cache (não apenas a página atual)
    // Isso permite busca local e filtros sem requisições adicionais
    const totais = {
      totalReceitas: this.totalReceitasGeral,
      totalDespesas: this.totalDespesasGeral,
      saldoLiquido: this.saldoLiquidoGeral
    };
    this.armazenarCache(movimentacoesNormalizadas, totais);
    
    // Aplica paginação para exibição
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    this.movimentacoes = movimentacoesNormalizadas.slice(inicio, fim);
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Extrai categorias únicas (de todos os dados, não apenas da página)
    this.extrairCategorias();
    
    // Reaplica filtros locais para garantir consistência visual
    this.aplicarFiltrosUI();
    
    this.loading = false;
  }

  private normalizarMovimentacaoOmie(mov: MovimentacaoOmie): any {
    // Normaliza dados do OMIE (endpoint MF) para o formato esperado pelo componente
    const debito = mov.debito !== undefined ? mov.debito : (mov['tipo'] === 'DESPESA' || mov['natureza'] === 'P');
    
    // Prioriza valor_documento para títulos não liquidados, depois valor_liquido para liquidados
    // Se liquidado, usa valor_liquido; senão, usa valor_documento ou valor_aberto
    const isLiquidado = mov['liquidado'] === 'S' || mov['liquidado'] === true;
    let valor = 0;
    
    if (isLiquidado) {
      // Para títulos liquidados, prioriza valor_liquido
      valor = mov['valor_liquido'] ?? 
              mov['valor_pago'] ?? 
              mov['valor_documento'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    } else {
      // Para títulos não liquidados, prioriza valor_documento ou valor_aberto
      valor = mov['valor_documento'] ?? 
              mov['valor_aberto'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    }
    
    // Se ainda for 0, tenta qualquer campo disponível como último recurso
    if (valor === 0) {
      valor = mov['valor_liquido'] ?? 
              mov['valor_pago'] ?? 
              mov['valor_aberto'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    }
    
    // Extrai nome do cliente/fornecedor (pode vir de diferentes campos)
    const nomeClienteFornecedor = mov['nome_cliente_fornecedor'] || 
                                  mov['nome_fantasia_cliente_fornecedor'] || 
                                  mov['razao_social_cliente_fornecedor'] || 
                                  '';
    
    // Debug: verifica se o nome está presente
    if (!nomeClienteFornecedor && mov['codigo_cliente_fornecedor']) {
      console.debug('Movimentação sem nome de cliente/fornecedor:', {
        codigo: mov['codigo_cliente_fornecedor'],
        mov: mov
      });
    }
    
    // Extrai categoria (pode vir de categorias array ou campo direto)
    let categoria = mov['categoria'] || mov['codigo_categoria'] || 'Sem categoria';
    if (mov['categorias'] && Array.isArray(mov['categorias']) && mov['categorias'].length > 0) {
      const primeiraCategoria = mov['categorias'][0];
      categoria = primeiraCategoria['cCodCateg'] || primeiraCategoria['codigo_categoria'] || categoria;
    }
    
    // Extrai número da parcela (pode vir de numero_parcela, _detalhes.cNumParcela ou _movimento_completo.detalhes.cNumParcela)
    let numeroParcela = mov['numero_parcela'] || '';
    let quantidadeParcela: number | undefined = undefined;
    
    // Tenta extrair de _detalhes.cNumParcela (formato: "004/013")
    if (!numeroParcela && mov['_detalhes'] && mov['_detalhes']['cNumParcela']) {
      const parcelaStr = mov['_detalhes']['cNumParcela'];
      const partes = parcelaStr.split('/');
      if (partes.length === 2) {
        // Remove zeros à esquerda, mas mantém pelo menos um dígito
        const numParcela = parseInt(partes[0], 10);
        numeroParcela = isNaN(numParcela) ? partes[0] : numParcela.toString();
        quantidadeParcela = parseInt(partes[1], 10) || undefined;
      } else {
        numeroParcela = parcelaStr;
      }
    }
    
    // Tenta extrair de _movimento_completo.detalhes.cNumParcela como fallback
    if (!numeroParcela && mov['_movimento_completo'] && mov['_movimento_completo']['detalhes'] && mov['_movimento_completo']['detalhes']['cNumParcela']) {
      const parcelaStr = mov['_movimento_completo']['detalhes']['cNumParcela'];
      const partes = parcelaStr.split('/');
      if (partes.length === 2) {
        // Remove zeros à esquerda, mas mantém pelo menos um dígito
        const numParcela = parseInt(partes[0], 10);
        numeroParcela = isNaN(numParcela) ? partes[0] : numParcela.toString();
        quantidadeParcela = parseInt(partes[1], 10) || undefined;
      } else {
        numeroParcela = parcelaStr;
      }
    }
    
    // Status do título
    const status = mov['status_titulo'] || mov['status'] || mov['_detalhes']?.['cStatus'] || '';
    
    // Forma de pagamento (prioriza nome_forma_pagamento, depois tipo_documento)
    const formaPagamento = mov['nome_forma_pagamento'] || mov['tipo_documento'] || '';
    
    return {
      IdMovimentacaoFinanceiraParcela: mov['codigo_lancamento_omie'] || mov['codigo_lancamento_integracao'] || '',
      Debito: debito,
      DataVencimento: mov['data_vencimento'] || mov['data_pagamento'] || mov['data_previsao'] || '',
      DataCompetencia: mov['data_emissao'] || mov['data_pagamento'] || mov['data_registro'] || mov['data_vencimento'] || '',
      DataQuitacao: mov['data_pagamento'] || undefined,
      Valor: valor,
      Nome: mov['numero_documento'] || mov['numero_documento_fiscal'] || mov['numero_pedido'] || 'Movimentação OMIE',
      Observacao: mov['observacao'] || mov['numero_documento'] || '',
      NomeClienteFornecedor: nomeClienteFornecedor,
      NomeFantasiaClienteFornecedor: mov['nome_fantasia_cliente_fornecedor'] || nomeClienteFornecedor,
      RazaoSocialClienteFornecedor: mov['razao_social_cliente_fornecedor'] || '',
      NomeCategoriaFinanceira: categoria,
      Status: status,
      NumeroParcela: numeroParcela,
      QuantidadeParcela: quantidadeParcela,
      NumeroDocumento: mov['numero_documento'] || '',
      NumeroPedido: mov['numero_pedido'] || '',
      NumeroDocumentoFiscal: mov['numero_documento_fiscal'] || '',
      NomeFormaPagamento: formaPagamento,
      CodigoClienteFornecedor: mov['codigo_cliente_fornecedor'] || '',
      CPFCNPJCliente: mov['cpf_cnpj_cliente'] || '',
      tipo: mov['tipo'] || (debito ? 'DESPESA' : 'RECEITA'),
      // Campos adicionais do endpoint MF
      ValorPago: mov['valor_pago'] || 0,
      ValorAberto: mov['valor_aberto'] || 0,
      ValorDesconto: mov['valor_desconto'] || 0,
      ValorJuros: mov['valor_juros'] || 0,
      ValorMulta: mov['valor_multa'] || 0,
      ValorLiquido: mov['valor_liquido'] || valor,
      Liquidado: mov['liquidado'] === 'S',
      // Campos originais do OMIE preservados
      _omieData: mov
    };
  }

  private calcularTotaisOmie(movimentacoes: MovimentacaoOmie[]): void {
    let totalReceitas = 0;
    let totalDespesas = 0;

    movimentacoes.forEach(mov => {
      const valor = mov['valor_documento'] || mov['valor_pago'] || 0;
      const isDebito = mov.debito !== undefined ? mov.debito : (mov['tipo'] === 'DESPESA');
      
      if (isDebito) {
        totalDespesas += valor;
      } else {
        totalReceitas += valor;
      }
    });

    this.totalReceitasGeral = totalReceitas;
    this.totalDespesasGeral = totalDespesas;
    this.saldoLiquidoGeral = totalReceitas - totalDespesas;
    
    console.log(`💰 Totais OMIE: Receitas=${totalReceitas}, Despesas=${totalDespesas}, Saldo=${this.saldoLiquidoGeral}`);
  }

  private aplicarFiltrosUI(): void {
    let filtradas = [...this.movimentacoes];

    // Filtro por tipo (receita/despesa)
    if (this.filtrosUI.tipo) {
      filtradas = filtradas.filter(mov => {
        const isReceita = !mov.Debito;
        const isDespesa = !!mov.Debito;
        return this.filtrosUI.tipo === 'receita' ? isReceita : isDespesa;
      });
    }

    // Filtro por categoria
    if (this.filtrosUI.categoria) {
      const categoriaSelecionada = this.filtrosUI.categoria.toLowerCase();
      filtradas = filtradas.filter(mov => {
        const nomeCategoria = (mov.NomeCategoriaFinanceira || '').toLowerCase();
        const categoriaRoot = (mov.Valores?.[0]?.NomeCategoriaRoot || '').toLowerCase();
        return nomeCategoria === categoriaSelecionada || categoriaRoot === categoriaSelecionada;
      });
    }

    // Filtro por status (pendente / quitado)
    if (this.filtrosUI.status) {
      filtradas = filtradas.filter(mov => {
        const quitado = !!(mov as any).DataQuitacao;
        return this.filtrosUI.status === 'quitado' ? quitado : !quitado;
      });
    }

    // Filtro por texto de pesquisa
    if (this.filtrosUI.textoPesquisa) {
      const texto = this.filtrosUI.textoPesquisa.toLowerCase();
      filtradas = filtradas.filter(mov => 
        (mov.Nome && mov.Nome.toLowerCase().includes(texto)) ||
        (mov.NomeClienteFornecedor && mov.NomeClienteFornecedor.toLowerCase().includes(texto)) ||
        (mov.Observacao && mov.Observacao.toLowerCase().includes(texto))
      );
    }

    this.movimentacoesFiltradas = filtradas;
  }

  onFonteDadosChange(): void {
    this.paginaAtual = 1;
    this.carregarMovimentacoes();
  }

  // ===== Filtros =====
  // Os filtros agora são aplicados no backend, então quando mudarem, recarrega os dados
  onFiltroChange(): void {
    this.paginaAtual = 1; // Volta para primeira página ao mudar filtro
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  /**
   * Atalho para aplicar filtro de tipo a partir dos cards de resumo.
   * Se o tipo já estiver selecionado, limpa o filtro (toggle).
   */
  aplicarFiltroTipo(tipo: 'receita' | 'despesa'): void {
    this.filtrosUI.tipo = this.filtrosUI.tipo === tipo ? '' : tipo;
    this.paginaAtual = 1;
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  onTextoPesquisaChange(texto: string): void {
    // Atualiza o filtro e recarrega (com debounce já aplicado pelo subject)
    this.filtrosUI.textoPesquisa = texto;
    this.paginaAtual = 1; // Volta para primeira página ao pesquisar
    this.aplicarFiltrosUI();
    this.textoPesquisaSubject.next(texto);
  }

  limparFiltros(): void {
    this.filtrosUI = {
      categoria: '',
      tipo: '',
      status: '',
      textoPesquisa: ''
    };
    this.dataInicial = '';
    this.dataFinal = '';
    this.paginaAtual = 1;
    this.validationError = null;
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  extrairCategorias(): void {
    const categoriasSet = new Set<string>();
    categoriasSet.add('');

    // Usa dados do cache completo se disponível, senão usa apenas da página atual
    const dadosParaExtrair = this.obterCache()?.data || this.movimentacoes;

    dadosParaExtrair.forEach(mov => {
      const categoriaRoot = this.extrairCategoriaRoot(mov);
      if (categoriaRoot) {
        categoriasSet.add(categoriaRoot);
      }
    });

    this.categorias = [
      { value: '', label: 'Todas as Categorias' },
      ...Array.from(categoriasSet)
        .filter(c => c !== '')
        .sort()
        .map(c => ({ value: c, label: c }))
    ];
  }

  extrairCategoriaRoot(mov: MovimentacaoFinanceira): string {
    if (mov.Valores && mov.Valores.length > 0) {
      return mov.Valores[0].NomeCategoriaRoot || mov.NomeCategoriaFinanceira || '';
    }
    return mov.NomeCategoriaFinanceira || '';
  }

  // ===== Paginação =====
  irParaPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaAtual = pagina;
      this.filtros.numeroDaPagina = pagina;
      this.carregarMovimentacoes();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  proximaPagina(): void {
    if (this.paginaAtual < this.totalPaginas) {
      this.irParaPagina(this.paginaAtual + 1);
    }
  }

  getPaginasVisiveis(): number[] {
    const paginas: number[] = [];
    const maxPaginas = 5;
    let inicio = Math.max(1, this.paginaAtual - Math.floor(maxPaginas / 2));
    let fim = Math.min(this.totalPaginas, inicio + maxPaginas - 1);
    
    if (fim - inicio < maxPaginas - 1) {
      inicio = Math.max(1, fim - maxPaginas + 1);
    }
    
    for (let i = inicio; i <= fim; i++) {
      paginas.push(i);
    }
    
    return paginas;
  }

  get Math() {
    return Math;
  }

  paginaAnterior(): void {
    if (this.paginaAtual > 1) {
      this.irParaPagina(this.paginaAtual - 1);
    }
  }

  // ===== Date Range Picker =====
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
    if (this.tempRangeStart) {
      const rangeEnd = this.tempRangeEnd ?? this.tempRangeStart; // permite selecionar apenas um dia
      const a = this.tempRangeStart <= rangeEnd ? this.tempRangeStart : rangeEnd;
      const b = this.tempRangeStart <= rangeEnd ? rangeEnd : this.tempRangeStart;
      
      this.dataInicial = a;
      this.dataFinal = b;
      
      this.paginaAtual = 1;
      this.carregarMovimentacoes();
    }
    this.mostrarRangePicker = false;
  }

  clearRange(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
    
    const periodoMudou = this.dataInicial !== '' || this.dataFinal !== '';
    this.dataInicial = '';
    this.dataFinal = '';
    
    // Limpa cache se período mudou
    if (periodoMudou) {
      this.cacheMovimentacoes.clear();
      this.cacheKeyAtual = '';
      console.log('🗑️ Cache limpo - período limpo');
    }
    
    this.paginaAtual = 1;
    this.carregarMovimentacoes();
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
    if (this.tempRangeStart && !this.tempRangeEnd) {
      this.tempRangeEnd = dateStr;
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

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

  // ===== Cálculos =====
  getTotalReceitas(): number {
    // Retorna o total geral de receitas (de todas as movimentações, não apenas da página atual)
    // Se não houver total geral disponível, calcula apenas da página atual como fallback
    if (this.totalReceitasGeral !== null && this.totalReceitasGeral !== undefined) {
      return this.totalReceitasGeral;
    }
    // Fallback: calcula apenas da página atual se não houver total geral
    return this.movimentacoesFiltradas
      .filter(mov => !mov.Debito)
      .reduce((total, mov) => total + (mov.Valor || 0), 0);
  }

  getTotalDespesas(): number {
    // Retorna o total geral de despesas (de todas as movimentações, não apenas da página atual)
    // Se não houver total geral disponível, calcula apenas da página atual como fallback
    if (this.totalDespesasGeral !== null && this.totalDespesasGeral !== undefined) {
      return this.totalDespesasGeral;
    }
    // Fallback: calcula apenas da página atual se não houver total geral
    return this.movimentacoesFiltradas
      .filter(mov => mov.Debito)
      .reduce((total, mov) => total + (mov.Valor || 0), 0);
  }

  getSaldoLiquido(): number {
    // Retorna o saldo líquido geral (de todas as movimentações)
    if (this.saldoLiquidoGeral !== null && this.saldoLiquidoGeral !== undefined) {
      return this.saldoLiquidoGeral;
    }
    // Fallback: calcula a partir dos totais gerais ou da página atual
    return this.getTotalReceitas() - this.getTotalDespesas();
  }

  // ===== Formatação =====
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      // Detecta formato DD/MM/YYYY (formato do OMIE)
      if (dateStr.includes('/') && dateStr.length === 10) {
        const partes = dateStr.split('/');
        if (partes.length === 3) {
          // Converte DD/MM/YYYY para YYYY-MM-DD para o JavaScript parsear corretamente
          const dia = partes[0].padStart(2, '0');
          const mes = partes[1].padStart(2, '0');
          const ano = partes[2];
          const date = new Date(Number(ano), Number(mes) - 1, Number(dia));
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('pt-BR');
          }
        }
      }

      // Trata formatos ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ) sem aplicar fuso horário
      // para evitar o problema de "voltar 1 dia" em timezones negativas.
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const ano = Number(isoMatch[1]);
        const mes = Number(isoMatch[2]);
        const dia = Number(isoMatch[3]);
        const date = new Date(ano, mes - 1, dia);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('pt-BR');
        }
      }

      // Última tentativa: parse padrão
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
      
      // Se não conseguiu parsear, retorna a string original
      return dateStr;
    } catch {
      return dateStr || '';
    }
  }

  formatExtrato(value: number, isDebito: boolean): string {
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(value));
    
    return isDebito ? `-${formatted}` : `+${formatted}`;
  }

  getParcelaLabel(mov: MovimentacaoFinanceira): string {
    if (mov.NumeroParcela && mov.QuantidadeParcela) {
      return `${mov.NumeroParcela}/${mov.QuantidadeParcela}`;
    }
    return mov.NumeroParcela ? `${mov.NumeroParcela}` : '∞';
  }

  // Labels para os filtros
  getCategoriaLabel(value: string): string {
    const categoria = this.categorias.find(c => c.value === value);
    return categoria ? categoria.label : value;
  }

  getTipoLabel(value: string): string {
    const tipo = this.tipos.find(t => t.value === value);
    return tipo ? tipo.label : value;
  }

  /**
   * Quantidade de filtros atualmente ativos (tipo, categoria, texto e período).
   * Usado apenas para feedback visual na tela.
   */
  getTotalFiltrosAtivos(): number {
    let total = 0;
    if (this.filtrosUI.tipo) total++;
    if (this.filtrosUI.categoria) total++;
    if (this.filtrosUI.status) total++;
    if (this.filtrosUI.textoPesquisa) total++;
    if (this.dataInicial) total++;
    if (this.dataFinal) total++;
    return total;
  }

  /** Lista completa ordenada (todos os itens quando há lista completa; senão só da página atual). Bom Controle: servidor já retorna ordenado. */
  get movimentacoesOrdenadas(): MovimentacaoFinanceira[] {
    if (this.fonteDados === 'bomcontrole') {
      return [...this.movimentacoesFiltradas];
    }
    const list = this.movimentacoesFiltradasCompleta.length > 0
      ? [...this.movimentacoesFiltradasCompleta]
      : [...this.movimentacoesFiltradas];
    if (!this.sortBy) return list;
    const order = this.sortOrder === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      let va: number | string | undefined, vb: number | string | undefined;
      switch (this.sortBy) {
        case 'tipo':
          va = a.Debito ? 'despesa' : 'receita';
          vb = b.Debito ? 'despesa' : 'receita';
          break;
        case 'data':
          va = a.DataVencimento || '';
          vb = b.DataVencimento || '';
          break;
        case 'valor':
          va = a.Valor ?? 0;
          vb = b.Valor ?? 0;
          break;
        case 'status':
          va = (a as any).DataQuitacao ? 'quitado' : 'pendente';
          vb = (b as any).DataQuitacao ? 'quitado' : 'pendente';
          break;
        default:
          return 0;
      }
      if (typeof va === 'string' && typeof vb === 'string') return order * (va.localeCompare(vb));
      return order * ((va as number) - (vb as number));
    });
    return list;
  }

  /** Fatia da lista ordenada para a página atual (ordena sobre todos os dados quando há lista completa). */
  get movimentacoesParaExibir(): MovimentacaoFinanceira[] {
    const ordenadas = this.movimentacoesOrdenadas;
    if (this.movimentacoesFiltradasCompleta.length > 0) {
      const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
      const fim = inicio + this.itensPorPagina;
      return ordenadas.slice(inicio, fim);
    }
    return ordenadas;
  }

  toggleSort(col: 'tipo' | 'data' | 'valor' | 'status'): void {
    if (this.sortBy === col) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = col;
      this.sortOrder = 'asc';
    }
    if (this.fonteDados === 'bomcontrole') {
      this.paginaAtual = 1;
      this.carregarMovimentacoes();
    }
  }

  abrirModalDetalhes(tipo: 'receita' | 'despesa'): void {
    this.tipoModalDetalhes = tipo;
    this.mostrarModalDetalhes = true;
  }

  fecharModalDetalhes(): void {
    this.mostrarModalDetalhes = false;
  }

  /** Detalhes agregados por categoria para o tipo (receita/despesa) */
  getDetalhesPorCategoria(tipo: 'receita' | 'despesa'): Array<{ nome: string; total: number; quantidade: number }> {
    const fonte = this.obterCache()?.data || this.movimentacoes;
    const isReceita = tipo === 'receita';
    const filtradas = fonte.filter(mov => (mov.Debito ? !isReceita : isReceita));
    const map = new Map<string, { total: number; quantidade: number }>();
    filtradas.forEach(mov => {
      const nome = mov.NomeCategoriaFinanceira || mov.Valores?.[0]?.NomeCategoriaRoot || '(Sem categoria)';
      const cur = map.get(nome) || { total: 0, quantidade: 0 };
      cur.total += mov.Valor ?? 0;
      cur.quantidade += 1;
      map.set(nome, cur);
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, quantidade: v.quantidade }))
      .sort((a, b) => b.total - a.total);
  }

  /** Detalhes agregados por cliente/fornecedor para o tipo (receita/despesa) */
  getDetalhesPorCliente(tipo: 'receita' | 'despesa'): Array<{ nome: string; total: number; quantidade: number }> {
    const fonte = this.obterCache()?.data || this.movimentacoes;
    const isReceita = tipo === 'receita';
    const filtradas = fonte.filter(mov => (mov.Debito ? !isReceita : isReceita));
    const map = new Map<string, { total: number; quantidade: number }>();
    filtradas.forEach(mov => {
      const nome = (mov as any).NomeClienteFornecedor || (mov as any).NomeFantasiaClienteFornecedor || '(Sem cliente/fornecedor)';
      const cur = map.get(nome) || { total: 0, quantidade: 0 };
      cur.total += mov.Valor ?? 0;
      cur.quantidade += 1;
      map.set(nome, cur);
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, quantidade: v.quantidade }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Formata valores monetários em BRL
   * Exemplo: 1234.56 → "R$ 1.234,56"
   */
  formatarMoeda(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'R$ 0,00';
    }
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  // Métodos de exportação (exportarExcel e exportarPDF) removidos
  // Implementar futuramente se necessário usando bibliotecas como ExcelJS ou jsPDF
}
