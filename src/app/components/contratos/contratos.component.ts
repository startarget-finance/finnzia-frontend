import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ContratoService, ContratoDTO, CobrancaDTO, CriarContratoRequest } from '../../services/contrato.service';
import { Contrato, DadosCliente } from '../../data/mock-data';

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contratos.component.html',
})
export class ContratosComponent implements OnInit, OnDestroy {
  contratos: Contrato[] = [];
  contratosBackend: ContratoDTO[] = [];
  filtroStatus: string = 'todos';
  filtroTexto: string = '';
  filtroFormaPagamento: string = 'todos';
  filtroDataVencimentoInicio: string = '';
  filtroDataVencimentoFim: string = '';
  filtroDataPagamentoInicio: string = '';
  filtroDataPagamentoFim: string = '';
  visualizacao: 'lista' | 'kanban' = 'kanban';
  mostrarFormularioCliente: boolean = false;
  mostrarFormularioNovo: boolean = false;
  mostrarDetalhes: boolean = false;
  contratoSelecionado: Contrato | null = null;
  contratoDetalhes: ContratoDTO | null = null;
  loading: boolean = false;
  saving: boolean = false;
  error: string | null = null;
  successMessage: string | null = null;
  modoEdicao: boolean = false;
  importando: boolean = false;
  sincronizando: boolean = false;
  
  // Paginação (igual ao Asaas: offset começa em 0, limit padrão 10)
  page: number = 0; // offset (começa em 0)
  size: number = 10; // limit (padrão do Asaas: 10, máximo 100)
  totalElements: number = 0;
  totalPages: number = 0;
  
  // Totais fixos (não mudam com paginação)
  totalContratosGeral: number = 0;
  totalValorGeral: number = 0;
  totaisPorCategoria: {
    emDia: number;
    pendente: number;
    emAtraso: number;
    inadimplente: number;
    valorEmDia?: number;
    valorPendente?: number;
    valorEmAtraso?: number;
    valorInadimplente?: number;
  } = {
    emDia: 0,
    pendente: 0,
    emAtraso: 0,
    inadimplente: 0,
    valorEmDia: 0,
    valorPendente: 0,
    valorEmAtraso: 0,
    valorInadimplente: 0
  };
  contratosPorStatusGeral: Record<string, number> = {
    'PENDENTE': 0,
    'ASSINADO': 0,
    'VENCIDO': 0,
    'PAGO': 0,
    'CANCELADO': 0
  };
  
  private destroy$ = new Subject<void>();
  private filtroTextoSubject = new Subject<string>();

  // Formulário de dados do cliente
  dadosCliente: DadosCliente = {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    enderecoCompleto: '',
    cep: '',
    celularFinanceiro: '',
    emailFinanceiro: '',
    responsavel: '',
    cpf: '',
    plano: '',
    descricaoNegociacao: '',
    valorRecorrencia: '',
    dataVenda: '',
    dataPrimeiraParcelaRecorrencia: ''
  };

  // Dados adicionais do contrato
  servico: string = '';
  inicioContrato: string = '';
  inicioRecorrencia: string = '';
  valorContrato: number = 0;
  valorRecorrencia: number = 0;
  tipoContrato: 'UNICO' | 'RECORRENTE' = 'UNICO';
  
  // Configurações de pagamento (Asaas)
  formaPagamento: string = 'BOLETO';
  numeroParcelas: number = 1;
  jurosAoMes: number | undefined = undefined;
  multaPorAtraso: number | undefined = undefined;
  descontoPercentual: number | undefined = undefined;
  descontoValorFixo: number | undefined = undefined;
  prazoMaximoDesconto: number | undefined = undefined;

  // Colunas do Kanban
  colunas = [
    { id: 'em-dia', titulo: 'Em Dia', cor: 'green', icone: '✅' },
    { id: 'em-atraso', titulo: 'Em Atraso', cor: 'orange', icone: '⏰' },
    { id: 'pendente', titulo: 'Pendentes', cor: 'yellow', icone: '⏳' },
    { id: 'inadimplente', titulo: 'Inadimplentes', cor: 'red', icone: '⚠️' }
  ];

  constructor(
    private router: Router,
    public contratoService: ContratoService
  ) {
    // Debounce para busca por texto
    this.filtroTextoSubject.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(termo => {
      this.page = 0;
      this.carregarTotaisGerais();
      this.carregarContratos();
    });
  }

  ngOnInit() {
    this.carregarTotaisGerais();
    this.carregarContratos();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregarTotaisGerais(): void {
    // Busca totais por categoria diretamente do backend
    this.contratoService.getTotaisPorCategoria()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (totais) => {
          this.totalContratosGeral = totais.totalContratos || 0;
          this.totalValorGeral = totais.totalValor || 0;
          
          // Armazenar totais por categoria para uso nos métodos getContratosX()
          this.totaisPorCategoria = {
            emDia: totais.emDia || 0,
            pendente: totais.pendente || 0,
            emAtraso: totais.emAtraso || 0,
            inadimplente: totais.inadimplente || 0,
            valorEmDia: totais.valorEmDia || 0,
            valorPendente: totais.valorPendente || 0,
            valorEmAtraso: totais.valorEmAtraso || 0,
            valorInadimplente: totais.valorInadimplente || 0
          };
        },
        error: (error) => {
          console.error('Erro ao carregar totais por categoria:', error);
          // Em caso de erro, usar valores padrão
          this.totalContratosGeral = 0;
          this.totalValorGeral = 0;
          this.totaisPorCategoria = {
            emDia: 0,
            pendente: 0,
            emAtraso: 0,
            inadimplente: 0,
            valorEmDia: 0,
            valorPendente: 0,
            valorEmAtraso: 0,
            valorInadimplente: 0
          };
        }
      });
  }

  carregarContratos(): void {
    this.loading = true;
    this.error = null;

    // Normalizar filtros: status vira undefined se for 'todos', termo vira undefined se vazio
    const status = this.filtroStatus === 'todos' ? undefined : this.filtroStatus;
    const termo = this.filtroTexto && this.filtroTexto.trim() ? this.filtroTexto.trim() : undefined;
    const billingType = this.filtroFormaPagamento === 'todos' ? undefined : this.filtroFormaPagamento;
    const dueDateInicio = this.filtroDataVencimentoInicio || undefined;
    const dueDateFim = this.filtroDataVencimentoFim || undefined;
    const paymentDateInicio = this.filtroDataPagamentoInicio || undefined;
    const paymentDateFim = this.filtroDataPagamentoFim || undefined;

    // No Kanban, carregar todos os contratos de uma vez (sem paginação)
    // Na Lista, usar paginação normal
    const pageParaUsar = this.visualizacao === 'kanban' ? 0 : this.page;
    const sizeParaUsar = this.visualizacao === 'kanban' ? 10000 : this.size;

    this.contratoService.buscarComFiltros(
      undefined, 
      status, 
      termo, 
      pageParaUsar, 
      sizeParaUsar,
      billingType,
      dueDateInicio,
      dueDateFim,
      paymentDateInicio,
      paymentDateFim
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Resposta paginação:', response);
          this.contratosBackend = response.content || [];
          this.totalElements = response.totalElements || 0;
          
          // No Kanban, não usar paginação (já carregamos tudo)
          // Na Lista, manter paginação normal
          if (this.visualizacao === 'kanban') {
            this.totalPages = 1; // Sempre 1 página no Kanban (tudo carregado)
            this.page = 0; // Sempre página 0 no Kanban
          } else {
            this.totalPages = response.totalPages || (this.totalElements > 0 ? 1 : 0);
            this.page = response.number !== undefined ? response.number : 0;
          }
          
          console.log('Total elementos:', this.totalElements, 'Total páginas:', this.totalPages, 'Página atual:', this.page, 'Visualização:', this.visualizacao);
          // Converter para formato do componente
          this.contratos = (response.content || []).map(c => this.contratoService.converterParaFormatoComponente(c));
          
          // Debug: verificar categorias
          const categorias = this.contratos.map(c => ({ id: c.id, titulo: c.titulo, categoria: c.categoria, status: c.status }));
          const semCategoria = categorias.filter(c => !c.categoria);
          const comCategoria = categorias.filter(c => c.categoria);
          console.log('Contratos com categoria:', comCategoria.length, 'Sem categoria:', semCategoria.length);
          if (semCategoria.length > 0) {
            console.warn('Contratos sem categoria (primeiros 5):', semCategoria.slice(0, 5));
          }
          const inadimplentes = categorias.filter(c => c.categoria === 'inadimplente');
          console.log('Contratos inadimplentes encontrados:', inadimplentes.length);
          
          this.loading = false;
        },
        error: (error) => {
          console.error('Erro ao carregar contratos:', error);
          this.error = 'Erro ao carregar contratos. Tente novamente.';
          this.loading = false;
          // Fallback para lista vazia
          this.contratos = [];
          this.totalPages = 0;
        }
      });
  }

  onFiltroTextoChange(): void {
    this.filtroTextoSubject.next(this.filtroTexto);
  }

  onFiltroStatusChange(): void {
    this.page = 0;
    this.carregarTotaisGerais();
    this.carregarContratos();
  }

  onFiltroFormaPagamentoChange(): void {
    this.page = 0;
    this.carregarContratos();
  }

  onFiltroDataChange(): void {
    this.page = 0;
    this.carregarContratos();
  }

  // Métodos de paginação
  irParaPrimeiraPagina(): void {
    if (this.page > 0) {
      this.page = 0;
      this.carregarContratos();
    }
  }

  irParaPaginaAnterior(): void {
    if (this.page > 0) {
      this.page--;
      this.carregarContratos();
    }
  }

  irParaProximaPagina(): void {
    if (this.page < this.totalPages - 1) {
      this.page++;
      this.carregarContratos();
    }
  }

  irParaUltimaPagina(): void {
    if (this.page < this.totalPages - 1) {
      this.page = this.totalPages - 1;
      this.carregarContratos();
    }
  }

  irParaPagina(numeroPagina: number): void {
    // numeroPagina vem como número de página (1, 2, 3...), precisa converter para offset (0, 1, 2...)
    const offset = numeroPagina - 1;
    if (offset >= 0 && offset < this.totalPages && offset !== this.page) {
      this.page = offset;
      this.carregarContratos();
    }
  }

  alterarTamanhoPagina(): void {
    this.page = 0;
    this.carregarContratos();
  }

  getPaginasVisiveis(): number[] {
    const paginas: number[] = [];
    const maxPaginas = 5; // Mostrar no máximo 5 números de página
    // Converter offset (0-based) para número de página (1-based) para exibição
    const paginaAtual = this.page + 1; // page é offset (0, 1, 2...), converte para (1, 2, 3...)
    let inicio = Math.max(1, paginaAtual - Math.floor(maxPaginas / 2));
    let fim = Math.min(this.totalPages, inicio + maxPaginas - 1);
    
    // Ajustar início se estiver próximo do fim
    if (fim - inicio < maxPaginas - 1) {
      inicio = Math.max(1, fim - maxPaginas + 1);
    }
    
    // Retornar números de página (1, 2, 3...) mas internamente usar offset (0, 1, 2...)
    for (let i = inicio; i <= fim; i++) {
      paginas.push(i);
    }
    
    return paginas;
  }

  get inicioItem(): number {
    return this.page * this.size + 1;
  }

  get fimItem(): number {
    return Math.min((this.page + 1) * this.size, this.totalElements);
  }

  get Math() {
    return Math;
  }

  get contratosFiltrados(): Contrato[] {
    // Os contratos já vêm filtrados do backend
    return this.contratos;
  }

  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'pendente': return 'status-pendente';
      case 'assinado': return 'status-assinado';
      case 'vencido': return 'status-vencido';
      case 'pago': return 'status-pago';
      case 'cancelado': return 'status-cancelado';
      default: return '';
    }
  }

  getStatusText(status: string): string {
    switch (status.toLowerCase()) {
      case 'pendente': return 'Pendente';
      case 'assinado': return 'Assinado';
      case 'vencido': return 'Vencido';
      case 'pago': return 'Pago';
      case 'cancelado': return 'Cancelado';
      default: return status;
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  /**
   * Converte string de data (yyyy-MM-dd) para Date local sem problema de timezone.
   * new Date("2026-01-20") interpreta como UTC, causando -1 dia no Brasil (UTC-3).
   * Este método cria a data como horário local.
   */
  private parseLocalDate(dateString: string): Date {
    if (!dateString) return new Date();
    const parts = dateString.substring(0, 10).split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = this.parseLocalDate(dateString);
    return date.toLocaleDateString('pt-BR');
  }

  assinarContrato(contrato: Contrato) {
    this.router.navigate(['/assinatura'], { 
      queryParams: { contratoId: contrato.id } 
    });
  }

  enviarWhatsApp(contrato: Contrato) {
    const mensagem = `Olá! Gostaria de falar sobre o contrato: ${contrato.titulo}. Valor: ${this.formatCurrency(contrato.valor)}`;
    const url = `https://wa.me/${contrato.whatsapp}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  }

  adicionarContrato() {
    this.mostrarFormularioNovo = true;
    this.limparFormulario();
    
    // Preencher valores padrão
    this.inicioContrato = new Date().toISOString().split('T')[0];
    const dataRecorrencia = new Date();
    dataRecorrencia.setMonth(dataRecorrencia.getMonth() + 1);
    this.inicioRecorrencia = dataRecorrencia.toISOString().split('T')[0];
    this.servico = 'Consultoria Financeira e Implementação de ERP';
    this.tipoContrato = 'UNICO';
  }

  onTipoContratoChange(): void {
    // Se mudar para único, limpar valor de recorrência
    if (this.tipoContrato === 'UNICO') {
      this.valorRecorrencia = 0;
    } else {
      // Se mudar para recorrente e não tiver valor, sugerir 15% do valor do contrato
      if (!this.valorRecorrencia && this.valorContrato > 0) {
        this.valorRecorrencia = Math.round(this.valorContrato * 0.15 * 100) / 100;
      }
    }
  }

  criarContrato(): void {
    if (!this.validarFormulario()) {
      this.error = 'Preencha todos os campos obrigatórios.';
      this.successMessage = null;
      return;
    }

    this.saving = true;
    this.error = null;
    this.successMessage = null;

    // Remover formatação do CPF/CNPJ
    const cpfCnpj = this.dadosCliente.cnpj?.replace(/\D/g, '') || '';
    const cpf = this.dadosCliente.cpf ? this.dadosCliente.cpf.replace(/\D/g, '') : undefined;
    const celular = this.dadosCliente.celularFinanceiro ? this.dadosCliente.celularFinanceiro.replace(/\D/g, '') : undefined;
    const cep = this.dadosCliente.cep ? this.dadosCliente.cep.replace(/\D/g, '') : undefined;

    // Determinar data de vencimento (deve ser futura conforme validação do backend)
    // Garantir que a data está no formato ISO (YYYY-MM-DD)
    let dataVencimento: string | undefined;
    if (this.tipoContrato === 'RECORRENTE') {
      dataVencimento = this.inicioRecorrencia || this.inicioContrato;
    } else {
      dataVencimento = this.inicioContrato;
    }
    
    // Validar que a data não está no passado
    if (dataVencimento) {
      const dataVenc = this.parseLocalDate(dataVencimento);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (dataVenc < hoje) {
        this.error = 'A data de vencimento deve ser futura.';
        this.saving = false;
        return;
      }
    }

    // Validar WhatsApp se fornecido (regex do backend: ^\+?[1-9]\d{1,14}$)
    // O regex espera apenas dígitos, começando com 1-9, sem espaços ou caracteres especiais
    let whatsappFormatado: string | undefined = undefined;
    if (celular && celular.length > 0) {
      // Remover todos os caracteres não numéricos e garantir que começa com dígito 1-9
      const whatsappLimpo = celular.replace(/\D/g, '');
      if (whatsappLimpo.length >= 2 && whatsappLimpo.length <= 15) {
        // Se começar com 0, remover (o regex não aceita começar com 0)
        whatsappFormatado = whatsappLimpo.startsWith('0') ? whatsappLimpo.substring(1) : whatsappLimpo;
        // Garantir que começa com 1-9
        if (whatsappFormatado && /^[1-9]/.test(whatsappFormatado)) {
          whatsappFormatado = whatsappFormatado;
        } else {
          // Se não começar com 1-9, adicionar código do país (55 para Brasil)
          whatsappFormatado = '55' + whatsappFormatado;
        }
      }
    }

    // Helper para garantir que strings vazias sejam undefined
    const toUndefinedIfEmpty = (value: string | undefined | null): string | undefined => {
      if (!value || value.trim() === '') return undefined;
      return value.trim();
    };

    const request: CriarContratoRequest = {
      titulo: this.servico ? `${this.servico} - ${this.dadosCliente.razaoSocial}` : `Contrato - ${this.dadosCliente.razaoSocial}`,
      descricao: toUndefinedIfEmpty(this.dadosCliente.descricaoNegociacao) || toUndefinedIfEmpty(this.servico) || undefined,
      dadosCliente: {
        razaoSocial: this.dadosCliente.razaoSocial.trim(),
        nomeFantasia: toUndefinedIfEmpty(this.dadosCliente.nomeFantasia),
        cpfCnpj: cpfCnpj,
        enderecoCompleto: toUndefinedIfEmpty(this.dadosCliente.enderecoCompleto),
        cep: cep && cep.length > 0 ? cep : undefined,
        celularFinanceiro: celular && celular.length > 0 ? celular : undefined,
        emailFinanceiro: toUndefinedIfEmpty(this.dadosCliente.emailFinanceiro),
        responsavel: toUndefinedIfEmpty(this.dadosCliente.responsavel),
        cpf: cpf && cpf.length > 0 ? cpf : undefined
      },
      valorContrato: this.valorContrato,
      valorRecorrencia: (this.tipoContrato === 'RECORRENTE' && this.valorRecorrencia > 0) ? this.valorRecorrencia : undefined,
      dataVencimento: dataVencimento!,
      tipoPagamento: this.tipoContrato,
      servico: toUndefinedIfEmpty(this.servico),
      inicioContrato: this.inicioContrato && this.inicioContrato.length > 0 ? this.inicioContrato : undefined,
      inicioRecorrencia: (this.tipoContrato === 'RECORRENTE' && this.inicioRecorrencia && this.inicioRecorrencia.length > 0) ? this.inicioRecorrencia : undefined,
      whatsapp: whatsappFormatado && whatsappFormatado.length > 0 ? whatsappFormatado : undefined,
      // Configurações de pagamento
      formaPagamento: this.formaPagamento || 'BOLETO',
      numeroParcelas: (this.tipoContrato === 'UNICO' && this.numeroParcelas && this.numeroParcelas > 1) ? this.numeroParcelas : undefined,
      jurosAoMes: this.jurosAoMes && this.jurosAoMes > 0 ? this.jurosAoMes : undefined,
      multaPorAtraso: this.multaPorAtraso && this.multaPorAtraso > 0 ? this.multaPorAtraso : undefined,
      descontoPercentual: this.descontoPercentual && this.descontoPercentual > 0 ? this.descontoPercentual : undefined,
      descontoValorFixo: this.descontoValorFixo && this.descontoValorFixo > 0 ? this.descontoValorFixo : undefined,
      prazoMaximoDesconto: this.prazoMaximoDesconto && this.prazoMaximoDesconto > 0 ? this.prazoMaximoDesconto : undefined
    };

    // Log para debug (remover em produção)
    console.log('Request sendo enviado:', JSON.stringify(request, null, 2));

    this.contratoService.criarContrato(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (contrato) => {
          this.saving = false;
          this.successMessage = 'Contrato criado com sucesso!';
          this.mostrarFormularioNovo = false;
          this.limparFormulario();
          this.carregarTotaisGerais();
          this.carregarContratos();
          // Limpar mensagem de sucesso após 5 segundos
          setTimeout(() => this.successMessage = null, 5000);
        },
        error: (error) => {
          console.error('Erro ao criar contrato:', error);
          
          // Tratar erros de validação do backend
          if (error.error?.errors) {
            const validationErrors = error.error.errors;
            const errorMessages: string[] = [];
            
            // Mapear campos para nomes amigáveis
            const fieldNames: Record<string, string> = {
              'titulo': 'Título',
              'dadosCliente.razaoSocial': 'Razão Social',
              'dadosCliente.cpfCnpj': 'CPF/CNPJ',
              'valorContrato': 'Valor do Contrato',
              'dataVencimento': 'Data de Vencimento',
              'tipoPagamento': 'Tipo de Pagamento',
              'dadosCliente.emailFinanceiro': 'E-mail Financeiro',
              'whatsapp': 'WhatsApp'
            };
            
            // Coletar todas as mensagens de erro
            Object.keys(validationErrors).forEach(field => {
              const fieldName = fieldNames[field] || field;
              errorMessages.push(`${fieldName}: ${validationErrors[field]}`);
            });
            
            this.error = errorMessages.length > 0 
              ? errorMessages.join('\n')
              : error.error?.message || 'Erro de validação nos campos';
          } else {
            this.error = error.error?.message || 'Erro ao criar contrato. Verifique os dados e tente novamente.';
          }
          
          this.saving = false;
          this.successMessage = null;
        }
      });
  }

  validarFormulario(): boolean {
    // Validações básicas
    if (!this.dadosCliente.razaoSocial || this.dadosCliente.razaoSocial.trim().length < 3) {
      this.error = 'Razão Social deve ter pelo menos 3 caracteres.';
      return false;
    }

    const cpfCnpj = this.dadosCliente.cnpj.replace(/\D/g, '');
    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      this.error = 'CPF/CNPJ inválido. Deve ter 11 ou 14 dígitos.';
      return false;
    }

    if (!this.valorContrato || this.valorContrato <= 0) {
      this.error = 'Valor do contrato deve ser maior que zero.';
      return false;
    }

    if (!this.inicioContrato) {
      this.error = 'Data de início do contrato é obrigatória.';
      return false;
    }

    // Validar que data de vencimento é futura (backend exige)
    const dataVencimento = this.inicioRecorrencia || this.inicioContrato;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = this.parseLocalDate(dataVencimento);
    if (dataVenc <= hoje) {
      this.error = 'Data de vencimento deve ser futura.';
      return false;
    }

    // Se for contrato recorrente, validar valor e data de recorrência
    if (this.tipoContrato === 'RECORRENTE') {
      if (!this.valorRecorrencia || this.valorRecorrencia <= 0) {
        this.error = 'Valor da recorrência é obrigatório para contratos recorrentes.';
        return false;
      }
      if (!this.inicioRecorrencia) {
        this.error = 'Data de início da recorrência é obrigatória para contratos recorrentes.';
        return false;
      }
      const dataRec = this.parseLocalDate(this.inicioRecorrencia);
      if (dataRec <= new Date()) {
        this.error = 'Data de início da recorrência deve ser futura.';
        return false;
      }
    }

    // Validação de email se fornecido
    if (this.dadosCliente.emailFinanceiro && !this.validarEmail(this.dadosCliente.emailFinanceiro)) {
      this.error = 'E-mail financeiro inválido.';
      return false;
    }

    return true;
  }

  validarEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  getTotalContratos(): number {
    return this.totalContratosGeral;
  }

  getTotalValor(): number {
    return this.totalValorGeral;
  }

  getContratosPorStatus(status: string): number {
    const statusMap: Record<string, string> = {
      'pendente': 'PENDENTE',
      'assinado': 'ASSINADO',
      'vencido': 'VENCIDO',
      'pago': 'PAGO',
      'cancelado': 'CANCELADO'
    };
    const statusBackend = statusMap[status] || status.toUpperCase();
    return this.contratosPorStatusGeral[statusBackend] || 0;
  }

  // Método auxiliar para determinar a categoria de um contrato (mutuamente exclusivo)
  // Nota: Agora a categoria vem do backend, mas este método é mantido para compatibilidade
  // Inadimplente = 2+ parcelas em atraso | Em Atraso = 1 parcela em atraso
  private getCategoriaContrato(contrato: Contrato): 'inadimplente' | 'em-atraso' | 'em-dia' | 'pendente' {
    // Se o contrato já tem categoria do backend, usar ela
    if ((contrato as any).categoria) {
      const categoria = (contrato as any).categoria;
      if (categoria === 'em-dia') return 'em-dia';
      if (categoria === 'em-atraso') return 'em-atraso';
      if (categoria === 'inadimplente') return 'inadimplente';
      if (categoria === 'pendente') return 'pendente';
    }
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Contar parcelas em atraso
    const parcelasEmAtraso = this.contarParcelasEmAtraso(contrato);
    
    // PRIORIDADE 1: Inadimplentes (2+ parcelas em atraso)
    if (parcelasEmAtraso >= 2) {
      return 'inadimplente';
    }
    
    // PRIORIDADE 2: Em Atraso (1 parcela em atraso ou contrato vencido sem cobranças)
    if (parcelasEmAtraso === 1) {
      return 'em-atraso';
    }
    
    // Contrato vencido sem cobranças = em atraso
    if (contrato.status === 'vencido') {
      return 'em-atraso';
    }
    
    // Contrato assinado com data vencida (sem cobranças em atraso) = em atraso
    if (contrato.status === 'assinado') {
      const vencimento = this.parseLocalDate(contrato.dataVencimento);
      if (vencimento < hoje) {
        return 'em-atraso';
      }
    }
    
    // PRIORIDADE 3: Em Dia
    if (contrato.status === 'pago') {
      return 'em-dia';
    }
    
    if (contrato.cobrancas && contrato.cobrancas.length > 0) {
      // Todas pagas
      const todasPagas = contrato.cobrancas.every(cob => 
        cob.status === 'RECEIVED' || 
        cob.status === 'RECEIVED_IN_CASH_UNDONE' || 
        cob.status === 'DUNNING_RECEIVED'
      );
      if (todasPagas) {
        return 'em-dia';
      }
      
      // Pelo menos uma paga
      const temPaga = contrato.cobrancas.some(cob => 
        cob.status === 'RECEIVED' || 
        cob.status === 'RECEIVED_IN_CASH_UNDONE' || 
        cob.status === 'DUNNING_RECEIVED'
      );
      if (temPaga) {
        return 'em-dia';
      }
      
      // Todas PENDING e data futura
      const todasPendentes = contrato.cobrancas.every(cob => cob.status === 'PENDING');
      if (todasPendentes) {
        const vencimento = this.parseLocalDate(contrato.dataVencimento);
        if (vencimento >= hoje) {
          return 'em-dia';
        }
      }
    }
    
    if (contrato.status === 'assinado') {
      const vencimento = this.parseLocalDate(contrato.dataVencimento);
      if (vencimento >= hoje) {
        return 'em-dia';
      }
    }
    
    // PRIORIDADE 4: Pendentes (padrão)
    if (contrato.status === 'pendente') {
      return 'pendente';
    }
    
    if (contrato.cobrancas && contrato.cobrancas.length > 0) {
      const temPendente = contrato.cobrancas.some(cob => cob.status === 'PENDING');
      if (temPendente) {
        const vencimento = this.parseLocalDate(contrato.dataVencimento);
        if (vencimento >= hoje) {
          return 'pendente';
        }
      }
    }
    
    // Padrão: pendente
    return 'pendente';
  }

  getContratosEmDia(): number {
    return this.totaisPorCategoria.emDia;
  }

  getContratosAtraso(): number {
    return this.totaisPorCategoria.emAtraso;
  }

  getContratosPendentes(): number {
    return this.totaisPorCategoria.pendente;
  }

  getContratosInadimplentes(): number {
    return this.totaisPorCategoria.inadimplente;
  }

  getValorEmDia(): number {
    return this.totaisPorCategoria.valorEmDia || 0;
  }

  getValorPendente(): number {
    return this.totaisPorCategoria.valorPendente || 0;
  }

  getValorEmAtraso(): number {
    return this.totaisPorCategoria.valorEmAtraso || 0;
  }

  getValorInadimplente(): number {
    return this.totaisPorCategoria.valorInadimplente || 0;
  }

  // Métodos para Kanban - usa categoria calculada pelo backend
  getContratosPorColuna(colunaId: string): Contrato[] {
    const contratosFiltrados = this.contratosFiltrados;
    
    // Usar a categoria que já vem calculada do backend
    // Isso garante que os números batam com os cards de status
    const contratosComCategoria = contratosFiltrados.filter(c => {
      // Se o contrato tem categoria do backend, usar ela
      if (c.categoria) {
        return c.categoria === colunaId;
      }
      return false;
    });
    
    // Debug para inadimplentes
    if (colunaId === 'inadimplente') {
      console.log('[DEBUG Inadimplentes] Total filtrados:', contratosFiltrados.length);
      console.log('[DEBUG Inadimplentes] Com categoria inadimplente:', contratosComCategoria.length);
      const semCategoria = contratosFiltrados.filter(c => !c.categoria);
      if (semCategoria.length > 0) {
        console.warn('[DEBUG Inadimplentes] Contratos sem categoria (primeiros 3):', semCategoria.slice(0, 3).map(c => ({ id: c.id, titulo: c.titulo, status: c.status })));
      }
      const comCategoriaInadimplente = contratosFiltrados.filter(c => c.categoria === 'inadimplente');
      console.log('[DEBUG Inadimplentes] Contratos com categoria="inadimplente":', comCategoriaInadimplente.length);
    }
    
    return contratosComCategoria;
  }

  /**
   * Conta quantas parcelas (cobranças) estão em atraso para um contrato.
   * Parcela em atraso = OVERDUE, DUNNING_REQUESTED, CHARGEBACK_REQUESTED
   * ou PENDING com data de vencimento no passado.
   */
  contarParcelasEmAtraso(contrato: Contrato): number {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (!contrato.cobrancas || contrato.cobrancas.length === 0) {
      return 0;
    }
    
    return contrato.cobrancas.filter(cob => {
      if (cob.status === 'OVERDUE' || cob.status === 'DUNNING_REQUESTED' || cob.status === 'CHARGEBACK_REQUESTED') {
        return true;
      }
      if (cob.status === 'PENDING' && cob.dataVencimento) {
        const vencCobranca = this.parseLocalDate(cob.dataVencimento);
        return vencCobranca < hoje;
      }
      return false;
    }).length;
  }

  /**
   * Inadimplente = 2 ou mais parcelas em atraso
   */
  isInadimplente(contrato: Contrato): boolean {
    return this.contarParcelasEmAtraso(contrato) >= 2;
  }

  /**
   * Em Atraso = exatamente 1 parcela em atraso, 
   * ou contrato vencido/assinado com data vencida (sem cobranças para contar)
   */
  isAtraso(contrato: Contrato): boolean {
    const parcelasEmAtraso = this.contarParcelasEmAtraso(contrato);
    
    if (parcelasEmAtraso === 1) return true;
    
    // Se não tem cobranças mas está vencido, considerar como atraso
    if (parcelasEmAtraso === 0) {
      if (contrato.status === 'vencido') return true;
      
      if (contrato.status === 'assinado') {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const vencimento = this.parseLocalDate(contrato.dataVencimento);
        return vencimento < hoje;
      }
    }
    
    return false;
  }

  getTotalPorColuna(colunaId: string): number {
    return this.getContratosPorColuna(colunaId).length;
  }

  getValorTotalPorColuna(colunaId: string): number {
    return this.getContratosPorColuna(colunaId).reduce((total, contrato) => total + contrato.valor, 0);
  }

  alterarVisualizacao(tipo: 'lista' | 'kanban'): void {
    this.visualizacao = tipo;
    // Recarregar contratos quando mudar de visualização
    // No Kanban carrega tudo, na Lista usa paginação
    this.page = 0; // Resetar para primeira página
    this.carregarContratos();
  }

  isVisualizacaoLista(): boolean {
    return this.visualizacao === 'lista';
  }

  isVisualizacaoKanban(): boolean {
    return this.visualizacao === 'kanban';
  }

  // Métodos para formulário de dados do cliente
  abrirFormularioCliente(contrato: Contrato): void {
    this.contratoSelecionado = contrato;
    this.mostrarFormularioCliente = true;
    
    // Preencher dados existentes se houver, senão usar dados mockados
    if (contrato.dadosCliente) {
      this.dadosCliente = { ...contrato.dadosCliente };
    } else {
      this.preencherDadosMockados(contrato);
    }
    
    if (contrato.servico) {
      this.servico = contrato.servico;
    } else {
      this.servico = 'Consultoria Financeira e Implementação de ERP';
    }
    
    if (contrato.inicioContrato) {
      this.inicioContrato = contrato.inicioContrato;
    } else {
      this.inicioContrato = new Date().toISOString().split('T')[0];
    }
    
    if (contrato.inicioRecorrencia) {
      this.inicioRecorrencia = contrato.inicioRecorrencia;
    } else {
      const dataRecorrencia = new Date();
      dataRecorrencia.setMonth(dataRecorrencia.getMonth() + 1);
      this.inicioRecorrencia = dataRecorrencia.toISOString().split('T')[0];
    }
    
    if (contrato.valorContrato) {
      this.valorContrato = contrato.valorContrato;
    } else {
      this.valorContrato = contrato.valor;
    }
    
    if (contrato.valorRecorrencia) {
      this.valorRecorrencia = contrato.valorRecorrencia;
    } else {
      this.valorRecorrencia = Math.round(contrato.valor * 0.15);
    }
    
    // Determinar tipo de contrato baseado em valorRecorrencia
    if (contrato.valorRecorrencia && contrato.valorRecorrencia > 0) {
      this.tipoContrato = 'RECORRENTE';
    } else {
      this.tipoContrato = 'UNICO';
    }
  }

  preencherDadosMockados(contrato: Contrato): void {
    // Dados mockados baseados no contrato
    const dadosMock = this.gerarDadosMockados(contrato);
    this.dadosCliente = { ...dadosMock };
  }

  gerarDadosMockados(contrato: Contrato): DadosCliente {
    const hoje = new Date();
    const dataVenda = new Date(hoje.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const dataRecorrencia = new Date(dataVenda);
    dataRecorrencia.setMonth(dataRecorrencia.getMonth() + 1);

    return {
      razaoSocial: contrato.cliente + ' LTDA',
      nomeFantasia: contrato.cliente,
      cnpj: this.gerarCNPJ(),
      enderecoCompleto: 'Rua das Flores, 123, Centro, São Paulo - SP',
      cep: '01234-567',
      celularFinanceiro: '(11) 99999-8888',
      emailFinanceiro: 'financeiro@' + contrato.cliente.toLowerCase().replace(/\s+/g, '') + '.com.br',
      responsavel: 'João Silva',
      cpf: '123.456.789-00',
      plano: 'TURBOLOC',
      descricaoNegociacao: `SETUP: ${this.formatCurrency(contrato.valor)} em ${Math.ceil(contrato.valor / 1000)}x de ${this.formatCurrency(Math.ceil(contrato.valor / Math.ceil(contrato.valor / 1000)))}`,
      valorRecorrencia: `${this.formatCurrency(Math.round(contrato.valor * 0.15))} + 15% após o 3° mês`,
      dataVenda: dataVenda.toISOString().split('T')[0],
      dataPrimeiraParcelaRecorrencia: dataRecorrencia.toISOString().split('T')[0]
    };
  }

  gerarCNPJ(): string {
    const numeros = Array.from({length: 14}, () => Math.floor(Math.random() * 10));
    return `${numeros[0]}${numeros[1]}.${numeros[2]}${numeros[3]}${numeros[4]}.${numeros[5]}${numeros[6]}${numeros[7]}/${numeros[8]}${numeros[9]}${numeros[10]}${numeros[11]}-${numeros[12]}${numeros[13]}`;
  }

  fecharFormularioCliente(): void {
    this.mostrarFormularioCliente = false;
    this.mostrarFormularioNovo = false;
    this.modoEdicao = false;
    this.contratoSelecionado = null;
    this.limparFormulario();
    this.error = null;
    this.successMessage = null;
  }

  // Visualizar detalhes do contrato
  visualizarDetalhes(contrato: Contrato): void {
    this.contratoSelecionado = contrato;
    const contratoId = parseInt(contrato.id);
    this.loading = true;
    this.error = null;
    
    this.contratoService.buscarPorId(contratoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detalhes) => {
          this.contratoDetalhes = detalhes;
          this.mostrarDetalhes = true;
          this.loading = false;
        },
        error: (error) => {
          console.error('Erro ao buscar detalhes do contrato:', error);
          this.error = 'Erro ao carregar detalhes do contrato.';
          this.loading = false;
        }
      });
  }

  fecharDetalhes(): void {
    this.mostrarDetalhes = false;
    this.contratoDetalhes = null;
    this.error = null;
    this.successMessage = null;
  }

  sincronizarComAsaas(contrato: Contrato): void {
    if (!contrato || !contrato.id) {
      this.error = 'Contrato inválido.';
      return;
    }

    this.saving = true;
    this.error = null;
    this.successMessage = null;

    const contratoId = parseInt(contrato.id);
    this.contratoService.sincronizarStatusComAsaas(contratoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (contratoAtualizado) => {
          this.saving = false;
          this.successMessage = 'Status sincronizado com sucesso!';
          this.contratoDetalhes = contratoAtualizado;
          // Atualizar na lista
          this.carregarContratos();
          setTimeout(() => this.successMessage = null, 3000);
        },
        error: (error) => {
          console.error('Erro ao sincronizar contrato:', error);
          this.error = error.error?.message || 'Erro ao sincronizar com Asaas. Tente novamente.';
          this.saving = false;
          setTimeout(() => this.error = null, 5000);
        }
      });
  }

  // Editar contrato
  editarContrato(contrato: Contrato): void {
    this.visualizarDetalhes(contrato);
    // Por enquanto, edição será feita através do formulário de detalhes
    // TODO: Implementar endpoint de atualização no backend
  }

  // Cancelar contrato
  cancelarContrato(contrato: Contrato): void {
    if (!confirm(`Tem certeza que deseja cancelar o contrato "${contrato.titulo}"?`)) {
      return;
    }

    const contratoId = parseInt(contrato.id);
    this.loading = true;
    this.error = null;
    this.successMessage = null;

    this.contratoService.removerContrato(contratoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Contrato cancelado com sucesso!';
          this.loading = false;
          this.carregarTotaisGerais();
          this.carregarContratos();
          setTimeout(() => this.successMessage = null, 5000);
        },
        error: (error) => {
          console.error('Erro ao cancelar contrato:', error);
          this.error = error.error?.message || 'Erro ao cancelar contrato.';
          this.loading = false;
        }
      });
  }

  // Criar objeto Contrato a partir de ContratoDTO
  criarContratoFromDTO(detalhes: ContratoDTO): Contrato {
    return {
      id: detalhes.id.toString(),
      titulo: detalhes.titulo,
      cliente: detalhes.cliente.razaoSocial,
      valor: detalhes.valorContrato,
      dataVencimento: detalhes.dataVencimento,
      status: this.contratoService.mapearStatus(detalhes.status) as 'pendente' | 'assinado' | 'vencido' | 'pago' | 'cancelado',
      descricao: detalhes.descricao || '',
      conteudo: detalhes.conteudo || '',
      whatsapp: detalhes.whatsapp || detalhes.cliente.celularFinanceiro || '',
      servico: detalhes.servico,
      inicioContrato: detalhes.inicioContrato,
      inicioRecorrencia: detalhes.inicioRecorrencia,
      valorContrato: detalhes.valorContrato,
      valorRecorrencia: detalhes.valorRecorrencia
    };
  }

  // Reenviar link de pagamento
  reenviarLinkPagamento(contrato: Contrato): void {
    // Se já temos os detalhes carregados, usar diretamente
    if (this.contratoDetalhes) {
      const cobranca = this.contratoDetalhes.cobrancas?.[0];
      const whatsapp = this.contratoDetalhes.whatsapp || this.contratoDetalhes.cliente.celularFinanceiro;
      
      if (!whatsapp) {
        this.error = 'WhatsApp não cadastrado para este contrato.';
        return;
      }

      if (cobranca?.linkPagamento) {
        const mensagem = `Olá! Segue o link para pagamento do contrato "${this.contratoDetalhes.titulo}": ${cobranca.linkPagamento}`;
        const url = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, '_blank');
        this.successMessage = 'Link de pagamento enviado via WhatsApp!';
        setTimeout(() => this.successMessage = null, 5000);
        return;
      }
    }

    // Caso contrário, buscar do backend
    if (!contrato.whatsapp) {
      this.error = 'WhatsApp não cadastrado para este contrato.';
      return;
    }

    const contratoId = parseInt(contrato.id);
    this.loading = true;
    this.error = null;
    this.successMessage = null;

    this.contratoService.buscarPorId(contratoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detalhes) => {
          const cobranca = detalhes.cobrancas?.[0];
          const whatsapp = detalhes.whatsapp || detalhes.cliente.celularFinanceiro;
          
          if (!whatsapp) {
            this.error = 'WhatsApp não cadastrado para este contrato.';
            this.loading = false;
            return;
          }

          if (cobranca?.linkPagamento) {
            const mensagem = `Olá! Segue o link para pagamento do contrato "${detalhes.titulo}": ${cobranca.linkPagamento}`;
            const url = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;
            window.open(url, '_blank');
            this.successMessage = 'Link de pagamento enviado via WhatsApp!';
            this.loading = false;
            setTimeout(() => this.successMessage = null, 5000);
          } else {
            this.error = 'Link de pagamento não disponível para este contrato.';
            this.loading = false;
          }
        },
        error: (error) => {
          console.error('Erro ao buscar link de pagamento:', error);
          this.error = 'Erro ao buscar link de pagamento.';
          this.loading = false;
        }
      });
  }

  // Copiar link de pagamento
  copiarLinkPagamento(link: string): void {
    navigator.clipboard.writeText(link).then(() => {
      this.successMessage = 'Link copiado para a área de transferência!';
      setTimeout(() => this.successMessage = null, 3000);
    }).catch(() => {
      this.error = 'Erro ao copiar link.';
    });
  }

  // Abrir link de pagamento
  abrirLinkPagamento(link: string): void {
    window.open(link, '_blank');
  }

  // === Métodos do Resumo do Parcelamento (estilo Asaas) ===

  // Ordena cobranças por data de vencimento (mais antiga primeiro)
  getCobrancasOrdenadas(cobrancas: CobrancaDTO[]): CobrancaDTO[] {
    return [...cobrancas].sort((a, b) => {
      const dateA = this.parseLocalDate(a.dataVencimento).getTime();
      const dateB = this.parseLocalDate(b.dataVencimento).getTime();
      return dateA - dateB;
    });
  }

  // Verifica se cobrança foi paga
  isCobrancaPaga(cobranca: CobrancaDTO): boolean {
    return cobranca.status === 'RECEIVED' || cobranca.status === 'RECEIVED_IN_CASH_UNDONE';
  }

  // Verifica se cobrança está vencida/inadimplente
  isCobrancaVencida(cobranca: CobrancaDTO): boolean {
    if (cobranca.status === 'OVERDUE' || cobranca.status === 'DUNNING_REQUESTED' || 
        cobranca.status === 'CHARGEBACK_REQUESTED' || cobranca.status === 'CHARGEBACK_DISPUTE') {
      return true;
    }
    // PENDING mas com data já vencida
    if (cobranca.status === 'PENDING') {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const venc = this.parseLocalDate(cobranca.dataVencimento);
      return venc < hoje;
    }
    return false;
  }

  // Contadores para o totalizador
  contarCobrancasPagas(cobrancas: CobrancaDTO[]): number {
    return cobrancas.filter(c => this.isCobrancaPaga(c)).length;
  }

  contarCobrancasVencidas(cobrancas: CobrancaDTO[]): number {
    return cobrancas.filter(c => this.isCobrancaVencida(c)).length;
  }

  contarCobrancasPendentes(cobrancas: CobrancaDTO[]): number {
    return cobrancas.filter(c => c.status === 'PENDING' && !this.isCobrancaVencida(c)).length;
  }

  salvarDadosCliente(): void {
    // Se estiver criando novo contrato
    if (this.mostrarFormularioNovo) {
      this.criarContrato();
      return;
    }

    // Se estiver editando contrato existente (por enquanto apenas fecha)
    // TODO: Implementar atualização de contrato quando backend tiver endpoint
    if (this.contratoSelecionado) {
      // Atualizar dados do cliente no contrato (apenas localmente por enquanto)
      this.contratoSelecionado.dadosCliente = { ...this.dadosCliente };
      this.contratoSelecionado.servico = this.servico;
      this.contratoSelecionado.inicioContrato = this.inicioContrato;
      this.contratoSelecionado.inicioRecorrencia = this.inicioRecorrencia;
      this.contratoSelecionado.valorContrato = this.valorContrato;
      this.contratoSelecionado.valorRecorrencia = this.valorRecorrencia;

      // Atualizar na lista de contratos
      const index = this.contratos.findIndex(c => c.id === this.contratoSelecionado!.id);
      if (index !== -1) {
        this.contratos[index] = { ...this.contratoSelecionado };
      }
    }
    
    this.fecharFormularioCliente();
  }

  limparFormulario(): void {
    // Resetar configurações de pagamento
    this.formaPagamento = 'BOLETO';
    this.numeroParcelas = 1;
    this.jurosAoMes = undefined;
    this.multaPorAtraso = undefined;
    this.descontoPercentual = undefined;
    this.descontoValorFixo = undefined;
    this.prazoMaximoDesconto = undefined;
    this.dadosCliente = {
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      enderecoCompleto: '',
      cep: '',
      celularFinanceiro: '',
      emailFinanceiro: '',
      responsavel: '',
      cpf: '',
      plano: '',
      descricaoNegociacao: '',
      valorRecorrencia: '',
      dataVenda: '',
      dataPrimeiraParcelaRecorrencia: ''
    };
    this.servico = '';
    this.inicioContrato = '';
    this.inicioRecorrencia = '';
    this.valorContrato = 0;
    this.valorRecorrencia = 0;
    this.tipoContrato = 'UNICO';
  }

  formatarCNPJ(event: any): void {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      // CPF: 000.000.000-00
      value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
      this.dadosCliente.cnpj = value;
    } else if (value.length <= 14) {
      // CNPJ: 00.000.000/0000-00
      value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      this.dadosCliente.cnpj = value;
    }
  }

  formatarCPF(event: any): void {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
      this.dadosCliente.cpf = value;
    }
  }

  formatarCEP(event: any): void {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      value = value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
      this.dadosCliente.cep = value;
    }
  }

  formatarCelular(event: any): void {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      value = value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
      this.dadosCliente.celularFinanceiro = value;
    }
  }

  getDataAtual(): string {
    return new Date().toLocaleDateString('pt-BR');
  }


  importarDoAsaas(): void {
    if (this.importando) return;
    
    this.importando = true;
    this.error = null;
    this.successMessage = null;

    this.contratoService.importarDoAsaas()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.importando = false;
          this.successMessage = result.mensagem || `${result.contratosImportados} contratos importados com sucesso!`;
          // Recarregar dados
          this.carregarTotaisGerais();
          this.carregarContratos();
          setTimeout(() => this.successMessage = null, 8000);
        },
        error: (error) => {
          console.error('Erro ao importar do Asaas:', error);
          this.error = error.error?.message || 'Erro ao importar contratos do Asaas. Tente novamente.';
          this.importando = false;
          setTimeout(() => this.error = null, 8000);
        }
      });
  }

  sincronizarTodos(): void {
    if (this.sincronizando) return;
    
    this.sincronizando = true;
    this.error = null;
    this.successMessage = null;

    this.contratoService.sincronizarTodos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.sincronizando = false;
          this.successMessage = result.mensagem || 
            `Sincronização concluída: ${result.cobrancasAtualizadas} cobranças atualizadas.`;
          // Recarregar dados
          this.carregarTotaisGerais();
          this.carregarContratos();
          setTimeout(() => this.successMessage = null, 10000);
        },
        error: (error) => {
          console.error('Erro ao sincronizar com Asaas:', error);
          this.error = error.error?.message || 'Erro ao sincronizar contratos com Asaas. Tente novamente.';
          this.sincronizando = false;
          setTimeout(() => this.error = null, 8000);
        }
      });
  }

  exportarContratos(): void {
    const dados = this.contratosFiltrados.map(contrato => ({
      'ID': contrato.id,
      'Título': contrato.titulo,
      'Cliente': contrato.cliente,
      'Valor': this.formatCurrency(contrato.valor),
      'Data Vencimento': contrato.dataVencimento,
      'Status': contrato.status,
      'Descrição': contrato.descricao
    }));

    const csv = this.converterParaCSV(dados);
    this.downloadCSV(csv, 'contratos.csv');
  }

  private converterParaCSV(dados: any[]): string {
    if (dados.length === 0) return '';
    
    const headers = Object.keys(dados[0]);
    const csvContent = [
      headers.join(','),
      ...dados.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }

  private downloadCSV(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
