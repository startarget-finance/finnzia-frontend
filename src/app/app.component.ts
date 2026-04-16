import { Component, HostListener, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { UsuarioService } from './services/usuario.service';
import { CompanySelectorService, CompaniaInfo } from './services/company-selector.service';
import { LoadingComponent } from './components/loading/loading.component';
import { ErrorNotificationComponent } from './components/error-notification/error-notification.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, LoadingComponent, ErrorNotificationComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  title = 'ia-financeira-erp';
  isMobileMenuOpen = false;
  isUserMenuOpen = false;
  isCompanyMenuOpen = false;
  /** Desktop: sidebar estreita por padrão; expande ao passar o mouse e recolhe ao sair. */
  isSidebarCollapsed = true;
  currentYear: number = new Date().getFullYear();
  
  // Gerenciamento de empresas
  empresasDisponiveis: CompaniaInfo[] = [];
  empresaSelecionada: CompaniaInfo | null = null;
  carregandoEmpresas = false;

  // Simular tipo de usuário (em produção viria do AuthService)
  get isAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'admin';
  }

  /**
   * Retorna o nome do usuário atual
   */
  get nomeUsuarioAtual(): string {
    return this.authService.getCurrentUser()?.name || 'Usuário';
  }

  /**
   * Retorna até 2 iniciais para o avatar do usuário.
   */
  get iniciaisUsuarioAtual(): string {
    const nome = (this.nomeUsuarioAtual || '').trim();
    if (!nome) return 'US';
    const partes = nome.split(/\s+/).filter(Boolean);
    if (partes.length === 1) {
      return partes[0].slice(0, 2).toUpperCase();
    }
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  }

  constructor(
    private authService: AuthService,
    private usuarioService: UsuarioService,
    private companySelectorService: CompanySelectorService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    // Bloquear chamadas HTTP durante SSR para evitar page freeze no Vercel
    if (!isPlatformBrowser(this.platformId)) { return; }
    // Não sincronizar empresas em páginas públicas (landing, login, etc.)
    if (!this.isAuthPublicPage()) {
      this.sincronizarEmpresasDoUsuario();
    }
    this.carregarEmpresas();
    this.subscribeToCompanyChanges();
  }

  /**
   * Sincroniza as empresas do usuário logado com o CompanySelectorService
   * Isso garante que mesmo se o usuário acesse direto uma página (ex: movimentações),
   * suas empresas serão carregadas automaticamente
   */
  private sincronizarEmpresasDoUsuario(): void {
    if (!this.authService.isAuthenticated()) {
      return;
    }
    // Evitar chamada dupla: o LoginComponent já sincronizou as empresas logo após o login.
    // Só busca da API se o seletor estiver vazio (ex: refresh direto na página protegida).
    const empresasJaCarregadas = this.companySelectorService.obterEmpresasAtivas();
    if (empresasJaCarregadas.length > 0) {
      return;
    }
    this.usuarioService.buscarMeuPerfil().subscribe({
      next: (usuarioAtual) => {
        if (usuarioAtual && usuarioAtual.id) {
          this.usuarioService.obterEmpresasUsuario(usuarioAtual.id).subscribe({
            next: (empresas: any[]) => {
              const empresasInfo: CompaniaInfo[] = empresas
                .filter(e => e.ativo)
                .map(e => ({
                  id: e.id,
                  idEmpresa: e.idEmpresa,
                  nomeEmpresa: e.nomeEmpresa,
                  padrao: e.padrao,
                  ativo: e.ativo,
                  dataCriacao: e.dataCriacao
                }));

              if (empresasInfo.length > 0) {
                this.companySelectorService.atualizarEmpresas(empresasInfo);
                console.log(`✅ Empresas do usuário sincronizadas automaticamente (${empresasInfo.length} empresa(s))`);
              }
            },
            error: (error) => {
              console.error('❌ Erro ao sincronizar empresas do usuário:', error);
            }
          });
        }
      },
      error: (error) => {
        console.error('❌ Erro ao obter perfil do usuário:', error);
      }
    });
  }

  /**
   * Carrega empresas disponíveis do serviço
   */
  private carregarEmpresas(): void {
    this.companySelectorService.empresasPermitidas$.subscribe(empresas => {
      this.empresasDisponiveis = empresas;
      if (empresas.length === 0) {
        console.log('⚠️ Nenhuma empresa configurada para o usuário');
      }
    });

    this.companySelectorService.carregando$.subscribe(carregando => {
      this.carregandoEmpresas = carregando;
    });
  }

  /**
   * Subscribe para atualizações da empresa selecionada
   */
  private subscribeToCompanyChanges(): void {
    this.companySelectorService.empresaSelecionada$.subscribe(empresa => {
      this.empresaSelecionada = empresa;
      if (empresa) {
        console.log(`🏢 Empresa selecionada: ${empresa.nomeEmpresa} (ID: ${empresa.idEmpresa})`);
      }
    });
  }

  /**
   * Seleciona uma empresa
   */
  selecionarEmpresa(empresa: CompaniaInfo): void {
    if (!empresa.idEmpresa) return;
    
    this.companySelectorService.selecionarEmpresa(empresa);
    this.isCompanyMenuOpen = false;
    
    // Recarregar dados da página atual se necessário
    // window.location.reload(); // Opcional - descomentar para reload automático
  }

  /**
   * Toggle do menu de seleção de empresa
   */
  toggleCompanyMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.isCompanyMenuOpen = !this.isCompanyMenuOpen;
  }

  /**
   * Fecha menu de empresa se clicar fora
   */
  @HostListener('document:click', ['$event'])
  closeMenusOnOutsideClick(event: MouseEvent): void {
    if (this.isUserMenuOpen) {
      this.isUserMenuOpen = false;
    }
    if (this.isCompanyMenuOpen) {
      this.isCompanyMenuOpen = false;
    }
  }
  
  // Métodos para verificar permissões e ocultar itens de menu
  hasPermission(permission: string): boolean {
    return this.authService.canAccess(permission);
  }

  // Métodos específicos para cada módulo
  canAccessDashboard(): boolean {
    return this.hasPermission('dashboard');
  }

  canAccessRotina(): boolean {
    return this.hasPermission('dashboard');
  }

  canAccessRelatorio(): boolean {
    return this.hasPermission('relatorio');
  }

  canAccessMovimentacoes(): boolean {
    return this.hasPermission('movimentacoes');
  }

  canAccessConciliacaoOfx(): boolean {
    return this.hasPermission('movimentacoes');
  }

  canAccessFaturaCartao(): boolean {
    return this.hasPermission('movimentacoes');
  }

  canAccessFluxoCaixa(): boolean {
    return this.hasPermission('fluxo-caixa');
  }

  canAccessContratos(): boolean {
    return this.hasPermission('contratos');
  }

  /** Mesma permissão de contratos: visão operacional do time comercial. */
  canAccessFrenteCaixaComercial(): boolean {
    return this.hasPermission('contratos');
  }

  /** Parametrização operacional usada por Financeiro/DFC. */
  canAccessParametrizacao(): boolean {
    return this.hasPermission('fluxo-caixa');
  }

  canAccessChat(): boolean {
    return this.hasPermission('chat');
  }

  canAccessAssinatura(): boolean {
    return this.hasPermission('assinatura');
  }

  canAccessGerenciarAcessos(): boolean {
    return this.hasPermission('gerenciar-acessos');
  }

  onSidebarMouseEnter(): void {
    this.isSidebarCollapsed = false;
  }

  onSidebarMouseLeave(): void {
    this.isSidebarCollapsed = true;
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  logout() {
    this.authService.logout();
  }

  /**
   * Telas públicas de autenticação (não devem exibir header/footer globais)
   */
  isAuthPublicPage(): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    // Landing (/) e telas de auth não exibem o layout interno do app
    // Verifica se é a rota raiz (landing page), páginas de segmento, diagnóstico ou páginas de autenticação
    return url === '/' || 
           url === '/login' || 
           url === '/esqueci-senha' || 
           url === '' ||
           url === '/restaurantes' ||
           url === '/prestadores' ||
           url === '/agencias' ||
           url === '/diagnostico' ||
           url === '/obrigado';
  }

  toggleUserMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  onManageAccess() {
    this.isUserMenuOpen = false;
    this.router.navigate(['/gerenciar-acessos']);
  }
}
