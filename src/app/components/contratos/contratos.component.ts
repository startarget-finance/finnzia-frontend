import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin, takeUntil } from 'rxjs';
import { ContratoDTO, ContratoService, WorkflowAction } from '../../services/contrato.service';
import { ContractTableComponent } from './contract-table.component';
import { ContractDrawerComponent } from './contract-drawer.component';
import { WorkflowBoardComponent } from './workflow-board.component';
import {
  ContratoGrupoCliente,
  groupContratosByClienteId,
  grupoContratoPrincipal,
  grupoFinancialWorst,
  grupoValorMensalTotal,
  grupoWorkflowRepresentativo
} from './contratos-group.utils';

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ContractTableComponent,
    ContractDrawerComponent,
    WorkflowBoardComponent
  ],
  templateUrl: './contratos.component.html',
})
export class ContratosComponent implements OnInit, OnDestroy {
  contratos: ContratoDTO[] = [];
  loading = false;
  error: string | null = null;
  successMessage: string | null = null;

  activeArea: 'comercial' | 'cobrancas' = 'comercial';
  activeTab: 'tabela' | 'pipeline' = 'tabela';
  activeModule: 'dashboard' | 'propostas' | 'fluxo' | 'envios' | 'clientes' | 'detalhe' | 'operacao' | 'carteira' = 'dashboard';
  drawerOpen = false;
  contratoSelecionado: ContratoDTO | null = null;
  fluxoContratoId: number | null = null;
  fluxoBuscaContrato = '';
  loadingContractActionId: number | null = null;
  loadingContractActionName: string | null = null;
  selectedProposalId: number | null = null;
  page = 0;
  size = 12;
  totalElements = 0;
  totalPages = 0;
  resumoTotalContratos = 0;
  resumoValorMensalTotal = 0;
  resumoTotalAtivos = 0;
  resumoTotalInadimplentes = 0;
  resumoTotalEmDia = 0;
  resumoTotalAtrasados = 0;

  filtroTexto = '';
  filtroWorkflow: 'todos' | ContratoDTO['workflowStatus'] = 'todos';
  filtroFinanceiro: 'todos' | ContratoDTO['financialStatus'] = 'todos';
  filtroDataCobranca = '';

  // Pagination local (client-side) for list views
  dashboardPage = 0;
  dashboardSize = 6;
  propostasPageLocal = 0;
  propostasSizeLocal = 8;
  clientesPageLocal = 0;
  clientesSizeLocal = 6;
  enviosPageLocal = 0;
  enviosSizeLocal = 10;
  carteiraPageLocal = 0;
  carteiraSizeLocal = 10;
  kanbanPageLocal = 0;
  kanbanSizeLocal = 10;
  readonly pageSizeOptionsLocal = [6, 10, 20, 50];
  readonly pageSizeOptionsOperacao = [12, 24, 48, 96];

  /** Linhas expandidas nas listas comerciais agrupadas (propostas, dashboard assinados, envios). */
  private expandedComercialPorCliente: Record<number, boolean> = {};

  private destroy$ = new Subject<void>();
  private filtroTextoSubject = new Subject<string>();

  constructor(
    public contratoService: ContratoService,
    private route: ActivatedRoute
  ) {
    // Debounce para busca por texto
    this.filtroTextoSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.carregarContratos();
    });
  }

  ngOnInit() {
    this.carregarResumoGeral();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.aplicarQueryParamInicial();
      this.carregarContratos();
    });
  }

  /**
   * Deep-link a partir da Frente comercial (e outros): /contratos?area=comercial&modulo=propostas
   */
  private aplicarQueryParamInicial(): void {
    const q = this.route.snapshot.queryParamMap;
    const area = q.get('area');
    const modulo = q.get('modulo');

    if (area === 'cobrancas') {
      this.activeArea = 'cobrancas';
      this.activeModule = 'operacao';
    } else if (area === 'comercial') {
      this.activeArea = 'comercial';
      this.activeModule = 'dashboard';
    }

    const modulosComercial = new Set<string>(['dashboard', 'propostas', 'fluxo', 'envios', 'clientes', 'detalhe']);
    const modulosCobranca = new Set<string>(['operacao', 'carteira']);

    if (modulo && this.activeArea === 'comercial' && modulosComercial.has(modulo)) {
      this.activeModule = modulo as typeof this.activeModule;
    }
    if (modulo && this.activeArea === 'cobrancas' && modulosCobranca.has(modulo)) {
      this.activeModule = modulo as typeof this.activeModule;
    }

    this.activeTab = 'tabela';
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregarContratos(): void {
    this.loading = true;
    this.error = null;
    const usaPaginacaoServidor = this.activeArea === 'cobrancas' && this.activeModule === 'operacao' && this.activeTab === 'tabela';
    const pageToLoad = usaPaginacaoServidor ? this.page : 0;
    const sizeToLoad = usaPaginacaoServidor ? this.size : 200;

    this.contratoService.buscarComFiltros(
      undefined,
      undefined,
      this.filtroTexto.trim() || undefined,
      pageToLoad,
      sizeToLoad,
      undefined,
      this.filtroDataCobranca || undefined,
      this.filtroDataCobranca || undefined,
      undefined,
      undefined,
      'dataCriacao,desc',
      this.filtroWorkflow === 'todos' ? undefined : this.filtroWorkflow,
      this.filtroFinanceiro === 'todos' ? undefined : this.filtroFinanceiro
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.contratos = response.content || [];
          const gruposPropostas = groupContratosByClienteId(this.propostasLista);
          const idPrincipalFluxo = gruposPropostas[0] ? grupoContratoPrincipal(gruposPropostas[0]).id : null;
          if (!this.fluxoContratoId && idPrincipalFluxo != null) {
            this.fluxoContratoId = idPrincipalFluxo;
          }
          if (this.fluxoContratoId && !this.contratos.some((c) => c.id === this.fluxoContratoId)) {
            this.fluxoContratoId = idPrincipalFluxo ?? this.propostasLista[0]?.id ?? null;
          }
          this.totalElements = response.totalElements || 0;
          this.totalPages = response.totalPages || 0;
          this.page = usaPaginacaoServidor ? (response.number || 0) : 0;
          this.loading = false;
        },
        error: () => {
          this.error = 'Erro ao carregar contratos. Tente novamente.';
          this.loading = false;
          this.contratos = [];
        }
      });
  }

  onFiltroTextoChange() {
    this.filtroTextoSubject.next(this.filtroTexto);
  }

  onFiltrosChange() {
    this.page = 0;
    this.dashboardPage = 0;
    this.propostasPageLocal = 0;
    this.clientesPageLocal = 0;
    this.enviosPageLocal = 0;
    this.carteiraPageLocal = 0;
    this.kanbanPageLocal = 0;
    this.carregarContratos();
  }

  abrirDrawer(contrato: ContratoDTO) {
    this.contratoSelecionado = contrato;
    this.drawerOpen = true;
  }

  fecharDrawer() {
    this.drawerOpen = false;
    this.contratoSelecionado = null;
  }

  executarWorkflowAction(payload: { contrato: ContratoDTO; action: WorkflowAction }) {
    this.loadingContractActionId = payload.contrato.id;
    this.loadingContractActionName = payload.action;
    this.contratoService.atualizarWorkflow(payload.contrato.id, payload.action)
      .pipe(takeUntil(this.destroy$))
      .pipe(finalize(() => {
        this.loadingContractActionId = null;
        this.loadingContractActionName = null;
      }))
      .subscribe({
        next: (updated) => {
          this.successMessage = 'Etapa atualizada com sucesso.';
          this.contratos = this.contratos.map(c => c.id === updated.id ? updated : c);
          if (this.contratoSelecionado?.id === updated.id) {
            this.contratoSelecionado = updated;
          }
          this.carregarResumoGeral();
          setTimeout(() => this.successMessage = null, 3000);
        },
        error: () => {
          this.error = 'Não foi possível atualizar a etapa do contrato.';
        }
      });
  }

  executarWorkflowNoDrawer(action: WorkflowAction) {
    if (!this.contratoSelecionado) return;
    this.contratoService.atualizarWorkflow(this.contratoSelecionado.id, action)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.successMessage = 'Etapa atualizada com sucesso.';
          this.contratos = this.contratos.map(c => c.id === updated.id ? updated : c);
          this.contratoSelecionado = updated;
          this.carregarResumoGeral();
          setTimeout(() => this.successMessage = null, 3000);
        },
        error: () => {
          this.error = 'Não foi possível atualizar a etapa do contrato.';
        }
      });
  }

  get totalContratos(): number {
    return this.resumoTotalContratos;
  }

  get valorMensalTotal(): number {
    return this.resumoValorMensalTotal;
  }

  get totalAtivos(): number {
    return this.resumoTotalAtivos;
  }

  get totalInadimplentes(): number {
    return this.resumoTotalInadimplentes;
  }

  get totalEmDia(): number {
    return this.resumoTotalEmDia;
  }

  get totalAtrasados(): number {
    return this.resumoTotalAtrasados;
  }

  exportarContratos() {
    const dados = this.contratos.map(contrato => ({
      Cliente: contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia || '',
      ValorMensal: Number(contrato.valorRecorrencia || contrato.valorContrato || 0),
      ProximaCobranca: this.getProximaCobranca(contrato),
      Workflow: contrato.workflowStatus || 'NOVO',
      Financeiro: contrato.financialStatus || 'EM_DIA'
    }));

    const headers = Object.keys(dados[0] || {});
    const csv = [
      headers.join(','),
      ...dados.map(row => headers.map(h => `"${(row as any)[h]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'contratos-erp.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getProximaCobranca(contrato: ContratoDTO): string {
    const pendentes = (contrato.cobrancas || [])
      .filter(c => c.status === 'PENDING' || c.status === 'OVERDUE')
      .map(c => c.dataVencimento)
      .sort();
    return pendentes[0] || contrato.dataVencimento || '';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  }

  adicionarContrato() {
    this.successMessage = this.activeArea === 'comercial'
      ? 'Use "Enviar para assinatura" para iniciar o fluxo comercial.'
      : 'Use o fluxo operacional para avançar etapas e cobrança.';
    setTimeout(() => (this.successMessage = null), 2500);
  }

  alterarTab(tab: 'tabela' | 'pipeline') {
    this.activeTab = tab;
    this.page = 0;
    this.kanbanPageLocal = 0;
    this.carregarContratos();
  }

  alterarModulo(modulo: 'dashboard' | 'propostas' | 'fluxo' | 'envios' | 'clientes' | 'detalhe' | 'operacao' | 'carteira') {
    this.activeModule = modulo;
    this.page = 0;
    if (modulo !== 'detalhe') this.selectedProposalId = null;
    this.dashboardPage = 0;
    this.propostasPageLocal = 0;
    this.clientesPageLocal = 0;
    this.enviosPageLocal = 0;
    this.carteiraPageLocal = 0;
    this.kanbanPageLocal = 0;
    this.carregarContratos();
  }

  alterarArea(area: 'comercial' | 'cobrancas') {
    this.activeArea = area;
    this.activeModule = area === 'comercial' ? 'dashboard' : 'operacao';
    this.activeTab = 'tabela';
    this.page = 0;
    this.dashboardPage = 0;
    this.propostasPageLocal = 0;
    this.clientesPageLocal = 0;
    this.enviosPageLocal = 0;
    this.carteiraPageLocal = 0;
    this.kanbanPageLocal = 0;
    this.carregarContratos();
  }

  private paginate<T>(items: T[], page: number, size: number): T[] {
    const safeItems = items || [];
    const start = page * size;
    return safeItems.slice(start, start + size);
  }

  private totalPagesLocal(items: unknown[], size: number): number {
    const safeItems = items || [];
    return Math.max(1, Math.ceil(safeItems.length / size));
  }

  private paginasVisiveisLocal(currentPage: number, totalPages: number, max = 5): number[] {
    const current = currentPage + 1; // 1-based
    let start = Math.max(1, current - Math.floor(max / 2));
    let end = Math.min(totalPages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i - 1); // back to 0-based for click
    return pages;
  }

  rangeStart(page: number, size: number, total: number): number {
    if (!total) return 0;
    return page * size + 1;
  }
  
  rangeEnd(page: number, size: number, total: number): number {
    if (!total) return 0;
    return Math.min((page + 1) * size, total);
  }

  // Dashboard comercial baseado em status de cobrança do Asaas.
  get dashboardAssinadosLista(): ContratoDTO[] {
    return this.contratosFiltrados.filter((c) => this.hasRecebimentoAsaas(c));
  }
  get dashboardAssinadosGrupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.dashboardAssinadosLista);
  }
  get dashboardPaginatedAssinadosGrupos(): ContratoGrupoCliente[] {
    return this.paginate(this.dashboardAssinadosGrupos, this.dashboardPage, this.dashboardSize);
  }
  get dashboardTotalPages(): number {
    return this.totalPagesLocal(this.dashboardAssinadosGrupos, this.dashboardSize);
  }

  dashboardIrParaPagina(p: number) {
    if (p < 0 || p >= this.dashboardTotalPages) return;
    this.dashboardPage = p;
  }

  get dashboardPaginasVisiveis(): number[] {
    return this.paginasVisiveisLocal(this.dashboardPage, this.dashboardTotalPages);
  }

  onDashboardSizeChange(): void {
    this.dashboardPage = 0;
  }

  get propostasGrupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.propostasLista);
  }
  get propostasPaginatedGrupos(): ContratoGrupoCliente[] {
    return this.paginate(this.propostasGrupos, this.propostasPageLocal, this.propostasSizeLocal);
  }
  get propostasTotalPagesLocal(): number {
    return this.totalPagesLocal(this.propostasGrupos, this.propostasSizeLocal);
  }
  propostasIrParaPagina(p: number) {
    if (p < 0 || p >= this.propostasTotalPagesLocal) return;
    this.propostasPageLocal = p;
  }

  get propostasPaginasVisiveisLocal(): number[] {
    return this.paginasVisiveisLocal(this.propostasPageLocal, this.propostasTotalPagesLocal);
  }

  onPropostasSizeChange(): void {
    this.propostasPageLocal = 0;
  }

  // Clientes pagination
  get clientesPaginatedCards(): any[] {
    return this.paginate(this.clientesCards as any[], this.clientesPageLocal, this.clientesSizeLocal);
  }
  get clientesTotalPagesLocal(): number {
    return this.totalPagesLocal(this.clientesCards, this.clientesSizeLocal);
  }
  clientesIrParaPagina(p: number) {
    if (p < 0 || p >= this.clientesTotalPagesLocal) return;
    this.clientesPageLocal = p;
  }

  get clientesPaginasVisiveisLocal(): number[] {
    return this.paginasVisiveisLocal(this.clientesPageLocal, this.clientesTotalPagesLocal);
  }

  onClientesSizeChange(): void {
    this.clientesPageLocal = 0;
  }

  get enviosGrupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.enviosLista);
  }
  get enviosPaginatedGrupos(): ContratoGrupoCliente[] {
    return this.paginate(this.enviosGrupos, this.enviosPageLocal, this.enviosSizeLocal);
  }
  get enviosTotalPagesLocal(): number {
    return this.totalPagesLocal(this.enviosGrupos, this.enviosSizeLocal);
  }
  enviosIrParaPagina(p: number) {
    if (p < 0 || p >= this.enviosTotalPagesLocal) return;
    this.enviosPageLocal = p;
  }

  get enviosPaginasVisiveisLocal(): number[] {
    return this.paginasVisiveisLocal(this.enviosPageLocal, this.enviosTotalPagesLocal);
  }

  onEnviosSizeChange(): void {
    this.enviosPageLocal = 0;
  }

  // Operação Kanban pagination (agrupada por cliente)
  get kanbanGruposOperacao(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.contratosFiltrados);
  }

  get kanbanPaginatedGruposOperacao(): ContratoGrupoCliente[] {
    return this.paginate(this.kanbanGruposOperacao, this.kanbanPageLocal, this.kanbanSizeLocal);
  }

  get contratosKanbanPagina(): ContratoDTO[] {
    return this.kanbanPaginatedGruposOperacao.flatMap((g) => g.contratos);
  }

  get kanbanTotalPagesLocal(): number {
    return this.totalPagesLocal(this.kanbanGruposOperacao, this.kanbanSizeLocal);
  }

  kanbanIrParaPagina(p: number): void {
    if (p < 0 || p >= this.kanbanTotalPagesLocal) return;
    this.kanbanPageLocal = p;
  }

  get kanbanPaginasVisiveisLocal(): number[] {
    return this.paginasVisiveisLocal(this.kanbanPageLocal, this.kanbanTotalPagesLocal);
  }

  onKanbanSizeChange(): void {
    this.kanbanPageLocal = 0;
  }

  // Carteira pagination (agrupada por cliente)
  get carteiraGrupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.carteiraCobrancas);
  }
  get carteiraPaginatedGrupos(): ContratoGrupoCliente[] {
    return this.paginate(this.carteiraGrupos, this.carteiraPageLocal, this.carteiraSizeLocal);
  }
  get carteiraTotalPagesLocal(): number {
    return this.totalPagesLocal(this.carteiraGrupos, this.carteiraSizeLocal);
  }
  grupoContratoPrincipal = grupoContratoPrincipal;
  grupoValorMensalTotal = grupoValorMensalTotal;
  grupoFinancialWorst = grupoFinancialWorst;
  grupoWorkflowRepresentativo = grupoWorkflowRepresentativo;

  toggleExpandComercial(clienteId: number, ev?: Event): void {
    ev?.stopPropagation();
    this.expandedComercialPorCliente[clienteId] = !this.expandedComercialPorCliente[clienteId];
  }

  isExpandComercial(clienteId: number): boolean {
    return !!this.expandedComercialPorCliente[clienteId];
  }

  isFluxoGrupoSelecionado(g: ContratoGrupoCliente): boolean {
    const cur = this.fluxoContratoAtual;
    if (!cur) {
      return false;
    }
    return g.contratos.some((c) => c.id === cur.id);
  }
  carteiraIrParaPagina(p: number) {
    if (p < 0 || p >= this.carteiraTotalPagesLocal) return;
    this.carteiraPageLocal = p;
  }

  get carteiraPaginasVisiveisLocal(): number[] {
    return this.paginasVisiveisLocal(this.carteiraPageLocal, this.carteiraTotalPagesLocal);
  }

  onCarteiraSizeChange(): void {
    this.carteiraPageLocal = 0;
  }

  get moduleTitle(): string {
    switch (this.activeModule) {
      case 'dashboard':
        return 'Dashboard Comercial';
      case 'propostas':
        return 'Propostas';
      case 'clientes':
        return 'Clientes';
      case 'detalhe':
        return 'Detalhes da Proposta';
      case 'fluxo':
        return 'Fluxo Comercial';
      case 'operacao':
        return 'Carteira de Cobrança';
      case 'carteira':
        return 'Inadimplentes e Atrasos';
      case 'envios':
        return 'Envios e Pagamentos';
      default:
        return 'Contratos';
    }
  }

  get moduleSubtitle(): string {
    switch (this.activeModule) {
      case 'dashboard':
        return 'Visão geral das propostas, contratos e receita.';
      case 'propostas':
        return 'Envie proposta, acompanhe cobrança no Asaas e avance a operação.';
      case 'clientes':
        return 'Gerencie seus clientes e propostas enviadas.';
      case 'detalhe':
        return 'Acompanhe timeline, onboarding e compartilhamento da proposta.';
      case 'fluxo':
        return 'Workflow visual da proposta ao pagamento, com etapas conectadas.';
      case 'operacao':
        return 'Operação financeira com visão de carteira, status e ações de cobrança.';
      case 'carteira':
        return 'Foco em contratos atrasados e inadimplentes para recuperação.';
      case 'envios':
        return 'Controle envio de link e status de pagamento em tempo real.';
      default:
        return 'Gestão operacional de contratos e cobrança.';
    }
  }

  sincronizarTudoAsaas() {
    this.contratoService.sincronizarTodos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.successMessage = res.mensagem || 'Sincronização com Asaas concluída.';
          this.carregarContratos();
          setTimeout(() => (this.successMessage = null), 4000);
        },
        error: () => this.error = 'Falha ao sincronizar com Asaas.'
      });
  }

  importarAsaas() {
    this.contratoService.importarDoAsaas()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.successMessage = res.mensagem || 'Importação do Asaas concluída.';
          this.carregarContratos();
          this.carregarResumoGeral();
          setTimeout(() => (this.successMessage = null), 4000);
        },
        error: () => this.error = 'Falha ao importar contratos do Asaas.'
      });
  }

  avancarParaAssinatura(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.executarWorkflowAction({ contrato, action: 'ENVIAR_PARA_ASSINATURA' });
  }

  marcarAssinado(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.executarWorkflowAction({ contrato, action: 'MARCAR_COMO_ASSINADO' });
  }

  gerarCobranca(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.executarWorkflowAction({ contrato, action: 'GERAR_COBRANCA' });
  }

  ativarContrato(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.executarWorkflowAction({ contrato, action: 'ATIVAR_CONTRATO' });
  }

  sincronizarContrato(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.loadingContractActionId = contrato.id;
    this.loadingContractActionName = 'SYNC';
    this.contratoService.sincronizarStatusComAsaas(contrato.id)
      .pipe(takeUntil(this.destroy$))
      .pipe(finalize(() => {
        this.loadingContractActionId = null;
        this.loadingContractActionName = null;
      }))
      .subscribe({
        next: (updated) => {
          this.contratos = this.contratos.map(c => c.id === updated.id ? updated : c);
          this.successMessage = 'Contrato sincronizado com Asaas.';
          setTimeout(() => (this.successMessage = null), 3000);
        },
        error: () => this.error = 'Não foi possível sincronizar este contrato com Asaas.'
      });
  }

  abrirLinkPagamento(contrato: ContratoDTO | null) {
    if (!contrato) return;
    const cobranca = this.getProximaCobrancaDetalhada(contrato);
    const link = cobranca?.linkPagamento;
    if (!link) {
      this.error = 'Este contrato ainda não possui link de pagamento.';
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  get propostasLista(): ContratoDTO[] {
    return this.contratosFiltrados.filter(c => (c.workflowStatus || 'NOVO') !== 'ATIVO');
  }

  get propostaSelecionada(): ContratoDTO | null {
    if (!this.selectedProposalId) return this.propostasLista[0] || null;
    return this.propostasLista.find(c => c.id === this.selectedProposalId) || this.propostasLista[0] || null;
  }

  get fluxoContratoAtual(): ContratoDTO | null {
    if (!this.fluxoContratoId) {
      const g = this.propostasFluxoGrupos[0];
      return g ? grupoContratoPrincipal(g) : null;
    }
    return this.contratos.find((c) => c.id === this.fluxoContratoId) || this.propostasLista[0] || null;
  }

  /** Valor total do cliente no fluxo quando há várias propostas/cobranças. */
  get fluxoValorResumo(): number {
    const c = this.fluxoContratoAtual;
    if (!c?.cliente?.id) {
      return Number(c?.valorRecorrencia || c?.valorContrato || 0);
    }
    const grupo = this.propostasFluxoGrupos.find((g) => g.clienteId === c.cliente.id);
    if (grupo && grupo.contratos.length > 1) {
      return grupoValorMensalTotal(grupo);
    }
    return Number(c.valorRecorrencia || c.valorContrato || 0);
  }

  get fluxoMostraSomaCliente(): boolean {
    const c = this.fluxoContratoAtual;
    if (!c?.cliente?.id) {
      return false;
    }
    const g = this.propostasFluxoGrupos.find((x) => x.clienteId === c.cliente.id);
    return !!g && g.contratos.length > 1;
  }

  selecionarFluxoContrato(id: number) {
    this.fluxoContratoId = id;
  }

  isFluxoStepAtivo(step: 'NOVO' | 'ASSINATURA' | 'COBRANCA' | 'ATIVO'): boolean {
    const contrato = this.fluxoContratoAtual;
    if (!contrato) return false;
    const wf = contrato.workflowStatus || 'NOVO';
    const ordem: Record<'NOVO' | 'ASSINATURA' | 'COBRANCA' | 'ATIVO', number> = {
      NOVO: 0,
      ASSINATURA: 1,
      COBRANCA: 2,
      ATIVO: 3
    };
    return ordem[wf] >= ordem[step];
  }

  get fluxoStatusFinanceiroLabel(): string {
    if (this.isCobrancaRefunded(this.fluxoContratoAtual)) return 'Estornado';
    const status = this.fluxoContratoAtual?.financialStatus || 'EM_DIA';
    if (status === 'INADIMPLENTE') return 'Inadimplente';
    if (status === 'ATRASADO') return 'Atrasado';
    return 'Em dia';
  }

  get fluxoStatusCobrancaLabel(): string {
    const contrato = this.fluxoContratoAtual;
    if (!contrato) return 'PENDING';
    return this.getProximaCobrancaDetalhada(contrato)?.status || 'PENDING';
  }

  get etapasFluxoContrato(): Array<{ nome: string; status: 'done' | 'current' | 'pending' }> {
    const c = this.fluxoContratoAtual;
    const assinatura = c?.statusAssinatura === 'ASSINADO';
    const cobrancaAtual = c ? this.getProximaCobrancaDetalhada(c) : undefined;
    const temCobranca = !!cobrancaAtual;
    const pago = cobrancaAtual?.status === 'RECEIVED';
    const ativo = (c?.workflowStatus || 'NOVO') === 'ATIVO';
    const emAssinatura = (c?.workflowStatus || 'NOVO') === 'ASSINATURA';
    const emCobranca = (c?.workflowStatus || 'NOVO') === 'COBRANCA';

    const baseDone = !!c;
    const etapas: Array<{ nome: string; status: 'done' | 'current' | 'pending' }> = [
      { nome: 'Contratos', status: baseDone ? 'done' : 'pending' },
      { nome: 'Vendedor', status: baseDone ? 'done' : 'pending' },
      { nome: 'Formulário', status: baseDone ? 'done' : 'pending' },
      { nome: 'Dados Contrato', status: baseDone ? 'done' : 'pending' },
      { nome: 'Contrato', status: baseDone ? 'done' : 'pending' },
      { nome: 'Assinatura', status: assinatura || ativo ? 'done' : (emAssinatura ? 'current' : 'pending') },
      { nome: 'Cobranças', status: pago || ativo ? 'done' : (temCobranca || emCobranca ? 'current' : 'pending') },
      { nome: 'Aprovação', status: assinatura || ativo ? 'done' : 'pending' },
      { nome: 'Contas a Receber', status: temCobranca || ativo ? 'done' : 'pending' },
      { nome: 'Fim', status: ativo ? 'done' : 'pending' }
    ];

    return etapas;
  }

  get propostasFluxoLista(): ContratoDTO[] {
    const termo = this.fluxoBuscaContrato.trim().toLowerCase();
    if (!termo) return this.propostasLista;
    return this.propostasLista.filter(c => {
      const alvo = `${c.cliente.razaoSocial || ''} ${c.cliente.nomeFantasia || ''} ${c.titulo || ''}`.toLowerCase();
      return alvo.includes(termo);
    });
  }

  get propostasFluxoGrupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.propostasFluxoLista);
  }

  getCobrancaPrimaryActionLabel(contrato: ContratoDTO | null): string {
    return this.isCobrancaRefunded(contrato) ? 'Reemitir cobrança' : 'Gerar cobrança';
  }

  executarCobrancaPrimaria(contrato: ContratoDTO | null) {
    if (!contrato) return;
    this.gerarCobranca(contrato);
  }

  podeAtivarContrato(contrato: ContratoDTO | null): boolean {
    if (!contrato) return false;
    const status = this.getProximaCobrancaDetalhada(contrato)?.status;
    return status === 'RECEIVED';
  }

  isCobrancaRefunded(contrato: ContratoDTO | null): boolean {
    if (!contrato) return false;
    const status = this.getProximaCobrancaDetalhada(contrato)?.status;
    return status === 'REFUNDED' || status === 'RECEIVED_IN_CASH_UNDONE';
  }

  isActionLoading(contrato: ContratoDTO | null, action: string): boolean {
    if (!contrato) return false;
    return this.loadingContractActionId === contrato.id && this.loadingContractActionName === action;
  }

  get carteiraCobrancas(): ContratoDTO[] {
    return this.contratosFiltrados.filter(c => (c.financialStatus || 'EM_DIA') !== 'EM_DIA');
  }

  get totalContratosAbertos(): number {
    return Math.max(0, this.resumoTotalContratos - this.resumoTotalAtivos);
  }

  get receitaEmRisco(): number {
    return this.contratosFiltrados
      .filter(c => (c.financialStatus || 'EM_DIA') !== 'EM_DIA')
      .reduce((sum, c) => sum + Number(c.valorRecorrencia || c.valorContrato || 0), 0);
  }

  get totalPropostas(): number {
    return this.propostasLista.length;
  }

  get contratosAssinadosComercial(): number {
    return this.contratosFiltrados.filter((c) => this.hasRecebimentoAsaas(c)).length;
  }

  get propostasPendentesComercial(): number {
    return this.contratosFiltrados.filter((c) => this.hasPendenteAsaas(c)).length;
  }

  get receitaFechada(): number {
    return this.contratosFiltrados.reduce((sum, c) => {
      const recebidas = (c.cobrancas || [])
        .filter((cb) => cb.status === 'RECEIVED' || cb.status === 'DUNNING_RECEIVED')
        .reduce((acc, cb) => acc + Number(cb.valor || 0), 0);
      return sum + recebidas;
    }, 0);
  }

  get receitaPotencial(): number {
    return this.contratosFiltrados.reduce((sum, c) => {
      const abertas = (c.cobrancas || [])
        .filter((cb) => cb.status === 'PENDING' || cb.status === 'OVERDUE' || cb.status === 'DUNNING_REQUESTED')
        .reduce((acc, cb) => acc + Number(cb.valor || 0), 0);
      return sum + abertas;
    }, 0);
  }

  get clientesCards(): Array<{
    clienteId: number;
    nome: string;
    email: string;
    telefone: string;
    propostas: number;
    recebidos: number;
    emAberto: number;
    contratos: ContratoDTO[];
  }> {
    return groupContratosByClienteId(this.contratosFiltrados).map((g) => ({
      clienteId: g.clienteId,
      nome: g.cliente.razaoSocial || g.cliente.nomeFantasia || 'Sem cliente',
      email: g.cliente.emailFinanceiro || '-',
      telefone: g.cliente.celularFinanceiro || '-',
      propostas: g.contratos.length,
      recebidos: g.contratos.filter((c) => this.hasRecebimentoAsaas(c)).length,
      emAberto: g.contratos.filter((c) => this.hasPendenteAsaas(c)).length,
      contratos: g.contratos
    }));
  }

  abrirDetalheProposta(contrato: ContratoDTO) {
    this.selectedProposalId = contrato.id;
    this.activeModule = 'detalhe';
  }

  voltarParaPropostas() {
    this.activeModule = 'propostas';
  }

  get timelineDetalhe(): Array<{ label: string; done: boolean }> {
    const p = this.propostaSelecionada;
    if (!p) return [];
    const assinado = this.hasRecebimentoAsaas(p);
    const pago = this.getProximaCobrancaDetalhada(p)?.status === 'RECEIVED';
    return [
      { label: 'Proposta criada', done: true },
      { label: 'Enviada ao cliente', done: true },
      { label: 'Cliente preenchendo dados', done: (p.workflowStatus || 'NOVO') !== 'NOVO' },
      { label: 'Recebimento Asaas confirmado', done: assinado },
      { label: 'Pagamento realizado', done: pago },
      { label: 'Onboarding', done: (p.workflowStatus || 'NOVO') === 'ATIVO' && pago }
    ];
  }

  statusPagamentoAsaas(contrato: ContratoDTO | null): string {
    if (!contrato) return 'Sem cobrança';
    const cobrancas = contrato.cobrancas || [];
    if (cobrancas.some((cb) => cb.status === 'RECEIVED' || cb.status === 'DUNNING_RECEIVED')) {
      return 'Recebido';
    }
    if (cobrancas.some((cb) => cb.status === 'OVERDUE' || cb.status === 'DUNNING_REQUESTED')) {
      return 'Atrasado';
    }
    if (cobrancas.some((cb) => cb.status === 'PENDING')) {
      return 'Pendente';
    }
    return 'Sem cobrança';
  }

  get enviosLista(): ContratoDTO[] {
    return this.contratosFiltrados.filter(c =>
      !!c.linkContrato || (c.cobrancas || []).some(cb => !!cb.linkPagamento)
    );
  }

  get contratosFiltrados(): ContratoDTO[] {
    return (this.contratos || []).filter(c => this.matchFiltrosLocais(c));
  }

  private matchFiltrosLocais(contrato: ContratoDTO): boolean {
    const texto = this.filtroTexto.trim().toLowerCase();
    if (texto) {
      const alvo = [
        contrato.cliente?.razaoSocial || '',
        contrato.cliente?.nomeFantasia || '',
        contrato.titulo || '',
        contrato.servico || ''
      ].join(' ').toLowerCase();
      if (!alvo.includes(texto)) return false;
    }

    if (this.filtroWorkflow !== 'todos' && (contrato.workflowStatus || 'NOVO') !== this.filtroWorkflow) {
      return false;
    }

    const financeiro = contrato.financialStatus || 'EM_DIA';
    if (this.filtroFinanceiro !== 'todos' && financeiro !== this.filtroFinanceiro) {
      return false;
    }

    if (this.filtroDataCobranca) {
      const prox = this.getProximaCobranca(contrato);
      if (!prox || prox !== this.filtroDataCobranca) return false;
    }

    return true;
  }

  private hasRecebimentoAsaas(contrato: ContratoDTO): boolean {
    return (contrato.cobrancas || []).some(
      (cb) => cb.status === 'RECEIVED' || cb.status === 'DUNNING_RECEIVED'
    );
  }

  private hasPendenteAsaas(contrato: ContratoDTO): boolean {
    return (contrato.cobrancas || []).some(
      (cb) => cb.status === 'PENDING' || cb.status === 'OVERDUE' || cb.status === 'DUNNING_REQUESTED'
    );
  }

  getProximaCobrancaDetalhada(contrato: ContratoDTO) {
    const pendentes = (contrato.cobrancas || [])
      .filter(c => c.status === 'PENDING' || c.status === 'OVERDUE')
      .sort((a, b) => (a.dataVencimento || '').localeCompare(b.dataVencimento || ''));
    return pendentes[0] || contrato.cobrancas?.[0];
  }

  get inicioItem(): number {
    if (this.totalElements === 0) return 0;
    return this.page * this.size + 1;
  }

  get fimItem(): number {
    return Math.min((this.page + 1) * this.size, this.totalElements);
  }

  get paginasVisiveis(): number[] {
    const max = 5;
    const current = this.page + 1;
    let start = Math.max(1, current - Math.floor(max / 2));
    let end = Math.min(this.totalPages, start + max - 1);
    if (end - start < max - 1) {
      start = Math.max(1, end - max + 1);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  irParaPagina(p: number) {
    const next = p - 1;
    if (next < 0 || next >= this.totalPages || next === this.page) return;
    this.page = next;
    this.carregarContratos();
  }

  proximaPagina() {
    this.irParaPagina(this.page + 2);
  }

  paginaAnterior() {
    this.irParaPagina(this.page);
  }

  alterarTamanhoPagina() {
    this.page = 0;
    this.carregarContratos();
  }

  private carregarResumoGeral() {
    const size = 200;
    this.contratoService.listarTodos(0, size, 'dataCriacao,desc')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (firstPage) => {
          const totalPages = firstPage.totalPages || 1;
          let all = firstPage.content || [];

          if (totalPages <= 1) {
            this.aplicarResumoGeral(all);
            return;
          }

          const requests = [];
          for (let p = 1; p < totalPages; p++) {
            requests.push(this.contratoService.listarTodos(p, size, 'dataCriacao,desc'));
          }

          if (requests.length === 0) {
            this.aplicarResumoGeral(all);
            return;
          }

          forkJoin(requests).pipe(takeUntil(this.destroy$)).subscribe({
            next: (pages) => {
              for (const page of pages) {
                all = all.concat(page.content || []);
              }
              this.aplicarResumoGeral(all);
            },
            error: () => this.aplicarResumoGeral(all)
          });
        },
        error: () => this.aplicarResumoGeral([])
      });
  }

  private aplicarResumoGeral(contratos: ContratoDTO[]) {
    this.resumoTotalContratos = contratos.length;
    this.resumoValorMensalTotal = contratos.reduce((sum, c) => sum + Number(c.valorRecorrencia || c.valorContrato || 0), 0);
    this.resumoTotalAtivos = contratos.filter(c => (c.workflowStatus || 'NOVO') === 'ATIVO').length;
    this.resumoTotalInadimplentes = contratos.filter(c => c.financialStatus === 'INADIMPLENTE').length;
    this.resumoTotalAtrasados = contratos.filter(c => c.financialStatus === 'ATRASADO').length;
    this.resumoTotalEmDia = contratos.filter(c => (c.financialStatus || 'EM_DIA') === 'EM_DIA').length;
  }
}
