import { Component, HostListener, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from './services/auth.service';
import { CompanySelectorService } from './services/company-selector.service';
import { LoadingComponent } from './components/loading/loading.component';
import { ErrorNotificationComponent } from './components/error-notification/error-notification.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, LoadingComponent, ErrorNotificationComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'ia-financeira-erp';
  isMobileMenuOpen = false;
  isUserMenuOpen = false;
  isCompanyMenuOpen = false;
  /** Desktop: sidebar estreita por padrão; expande ao passar o mouse e recolhe ao sair. */
  isSidebarCollapsed = true;
  currentYear: number = new Date().getFullYear();

  /** Nome da empresa ativa (contexto multi-empresa) para exibir no topo. */
  nomeEmpresaAtual: string | null = null;

  private destroy$ = new Subject<void>();

  // Simular tipo de usuário (em produção viria do AuthService)
  get isAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'admin';
  }

  /** Conta administrador: menu reduzido (visão geral + gerenciar acessos). */
  painelAdminSomente(): boolean {
    return this.authService.hasRole('admin');
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
    private router: Router,
    private companySelector: CompanySelectorService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    // Bloquear chamadas HTTP durante SSR para evitar page freeze no Vercel
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.companySelector.empresaSelecionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe((emp) => {
        const n = emp?.nomeEmpresa?.trim();
        this.nomeEmpresaAtual = n && n.length > 0 ? n : null;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    if (this.painelAdminSomente()) {
      return true;
    }
    return this.hasPermission('dashboard');
  }

  canAccessGerenciarAcessos(): boolean {
    if (this.painelAdminSomente()) {
      return true;
    }
    return this.hasPermission('gerenciar-acessos');
  }

  canAccessRotina(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('dashboard');
  }

  canAccessRelatorio(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('relatorio');
  }

  canAccessMovimentacoes(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('movimentacoes');
  }

  canAccessConciliacaoOfx(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('movimentacoes');
  }

  canAccessPluggyOpenFinance(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('movimentacoes');
  }

  canAccessFaturaCartao(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('movimentacoes');
  }

  canAccessFluxoCaixa(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('fluxo-caixa');
  }

  canAccessContratos(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('contratos');
  }

  /** Frente comercial: receitas em Movimentações. Quem tem movimentacoes ou contratos enxerga o atalho. */
  canAccessFrenteCaixaComercial(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('movimentacoes') || this.hasPermission('contratos');
  }

  /** Parametrização operacional usada por Financeiro/DFC. */
  canAccessParametrizacao(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('fluxo-caixa');
  }

  canAccessChat(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('chat');
  }

  canAccessAssinatura(): boolean {
    if (this.painelAdminSomente()) {
      return false;
    }
    return this.hasPermission('assinatura');
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
