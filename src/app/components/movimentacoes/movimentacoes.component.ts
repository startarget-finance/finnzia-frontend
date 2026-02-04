import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { BomControleService, MovimentacaoFinanceira, FiltrosMovimentacoes } from '../../services/bomcontrole.service';
import { OmieService, MovimentacaoOmie, MovimentacoesOmieResponse, FiltrosMovimentacoesOmie } from '../../services/omie.service';

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
  loading: boolean = false;
  error: string | null = null;
  
  // Cache estratégico (Anti-Block) - carrega uma vez e persiste
  private cacheMovimentacoes: Map<string, { data: MovimentacaoFinanceira[], timestamp: number, totais: any }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private cacheKeyAtual: string = '';
  
  // Totais agregados (de todas as movimentações, não apenas da página atual)
  totalReceitasGeral: number | null = null;
  totalDespesasGeral: number | null = null;
  saldoLiquidoGeral: number | null = null;

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

  // Filtros de UI (categoria, tipo, etc.)
  filtrosUI = {
    categoria: '',
    tipo: '' as 'receita' | 'despesa' | '',
    textoPesquisa: ''
  };

  // Opções para filtros
  tipos = [
    { value: '', label: 'Todos os Tipos' },
    { value: 'receita', label: 'Receita' },
    { value: 'despesa', label: 'Despesa' }
  ];

  // Categorias dinâmicas (serão carregadas das movimentações)
  categorias: Array<{ value: string, label: string }> = [
    { value: '', label: 'Todas as Categorias' }
  ];

  // Fonte de dados
  fonteDados: 'bomcontrole' | 'omie' = 'omie'; // Padrão: OMIE

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();

  constructor(
    private bomControleService: BomControleService,
    private omieService: OmieService
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
    // Carrega automaticamente sem filtro de data inicial
    this.carregarMovimentacoes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== Carregamento de Dados =====
  carregarMovimentacoes(): void {
    this.loading = true;
    this.error = null;

    if (this.fonteDados === 'omie') {
      this.carregarMovimentacoesOmie();
    } else {
      this.carregarMovimentacoesBomControle();
    }
  }

  private carregarMovimentacoesBomControle(): void {
    // Prepara filtros - agora inclui filtros de UI também
    const filtros: FiltrosMovimentacoes = {
      ...this.filtros,
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined,
      categoria: this.filtrosUI.categoria || undefined,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
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

    console.log(`✅ Busca local concluída: ${resultado.length} itens encontrados`);
    return resultado;
  }

  private carregarMovimentacoesOmie(): void {
    const filtros: FiltrosMovimentacoesOmie = {
      dataInicio: this.dataInicial || undefined,
      dataFim: this.dataFinal || undefined,
      pagina: this.paginaAtual,
      registrosPorPagina: this.itensPorPagina,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      categoria: this.filtrosUI.categoria || undefined,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined
    };

    // ESTRATÉGIA 1: Cache Agressivo (Anti-Block)
    // Se temos cache válido e apenas filtros de UI mudaram (não período), busca localmente
    const temCacheValido = this.obterCache() !== null;
    const periodoMudou = this.cacheKeyAtual !== this.gerarChaveCache();
    
    // Se período não mudou e temos cache, busca localmente (sem requisição ao servidor)
    if (temCacheValido && !periodoMudou && (filtros.tipo || filtros.categoria || filtros.textoPesquisa)) {
      console.log('🚀 Modo cache: aplicando filtros localmente sem requisição ao servidor');
      const resultadoLocal = this.buscarLocalMemoizada(filtros);
      
      // Aplica paginação local
      const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
      const fim = inicio + this.itensPorPagina;
      this.movimentacoes = resultadoLocal.slice(inicio, fim);
      this.movimentacoesFiltradas = [...this.movimentacoes];
      this.totalItens = resultadoLocal.length;
      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      
      // Usa totais do cache
      const cached = this.obterCache();
      if (cached?.totais) {
        console.log('💰 Totais restaurados do cache:', cached.totais);
        this.totalReceitasGeral = cached.totais.totalReceitas ?? null;
        this.totalDespesasGeral = cached.totais.totalDespesas ?? null;
        this.saldoLiquidoGeral = cached.totais.saldoLiquido ?? null;
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
    
    // Atualiza totais agregados
    this.totalReceitasGeral = response.totalReceitas !== undefined ? response.totalReceitas : null;
    this.totalDespesasGeral = response.totalDespesas !== undefined ? response.totalDespesas : null;
    this.saldoLiquidoGeral = response.saldoLiquido !== undefined ? response.saldoLiquido : 
                              (this.totalReceitasGeral !== null && this.totalDespesasGeral !== null ? 
                               this.totalReceitasGeral - this.totalDespesasGeral : null);
    
    // Usa o itensPorPagina retornado pelo backend se disponível
    if (response.paginacao && response.paginacao.itensPorPagina) {
      this.itensPorPagina = response.paginacao.itensPorPagina;
    }
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Extrai categorias únicas
    this.extrairCategorias();
    
    // Os filtros já foram aplicados no backend
    this.movimentacoesFiltradas = [...this.movimentacoes];
    
    this.loading = false;
  }

  private processarRespostaOmie(response: MovimentacoesOmieResponse): void {
    console.log('✅ Resposta completa do OMIE:', JSON.stringify(response, null, 2));
    
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
           ? this.totalReceitasGeral - this.totalDespesasGeral : null);
      
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
    
    // Os filtros já foram aplicados no backend, então apenas usa os dados retornados
    this.movimentacoesFiltradas = [...this.movimentacoes];
    
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
        const isDespesa = mov.Debito;
        return this.filtrosUI.tipo === 'receita' ? isReceita : isDespesa;
      });
    }

    // Filtro por categoria
    if (this.filtrosUI.categoria) {
      filtradas = filtradas.filter(mov => 
        mov.NomeCategoriaFinanceira === this.filtrosUI.categoria
      );
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
    this.carregarMovimentacoes();
  }

  onTextoPesquisaChange(texto: string): void {
    // Atualiza o filtro e recarrega (com debounce já aplicado pelo subject)
    this.filtrosUI.textoPesquisa = texto;
    this.paginaAtual = 1; // Volta para primeira página ao pesquisar
    this.textoPesquisaSubject.next(texto);
  }

  limparFiltros(): void {
    this.filtrosUI = {
      categoria: '',
      tipo: '',
      textoPesquisa: ''
    };
    this.dataInicial = '';
    this.dataFinal = '';
    this.paginaAtual = 1;
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
    if (this.tempRangeStart && this.tempRangeEnd) {
      const a = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeStart : this.tempRangeEnd;
      const b = this.tempRangeStart <= this.tempRangeEnd ? this.tempRangeEnd : this.tempRangeStart;
      
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
          const date = new Date(`${ano}-${mes}-${dia}`);
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('pt-BR');
          }
        }
      }
      
      // Tenta parsear como ISO (YYYY-MM-DD) ou formato padrão
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

  // ===== Exportação =====
  exportarExcel(): void {
    this.loading = true;
    const filtros: FiltrosMovimentacoes = {
      ...this.filtros,
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined
    };

    this.bomControleService.exportarExcel(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `movimentacoes_${new Date().toISOString().split('T')[0]}.xlsx`;
          a.click();
          window.URL.revokeObjectURL(url);
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Erro ao exportar Excel:', err);
          this.error = 'Erro ao exportar Excel';
          this.loading = false;
        }
      });
  }

  exportarPDF(): void {
    this.loading = true;
    const filtros: FiltrosMovimentacoes = {
      ...this.filtros,
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined
    };

    this.bomControleService.exportarPDF(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `movimentacoes_${new Date().toISOString().split('T')[0]}.pdf`;
          a.click();
          window.URL.revokeObjectURL(url);
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Erro ao exportar PDF:', err);
          this.error = 'Erro ao exportar PDF';
          this.loading = false;
        }
      });
  }
}
