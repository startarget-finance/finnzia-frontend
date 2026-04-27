import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { CompanySelectorService, type CompaniaInfo } from './company-selector.service';

export interface User {
  email: string;
  name: string;
  role: string;
  loginTime: string;
  permissions?: {
    dashboard: boolean;
    relatorio: boolean;
    movimentacoes: boolean;
    fluxoCaixa: boolean;
    contratos: boolean;
    chat: boolean;
    assinatura: boolean;
    gerenciarAcessos: boolean;
  };
}

/** Sessão por aba: token e user ficam no `sessionStorage` (cada aba = usuário possível). */
const STORAGE_KEY_TOKEN = 'authToken';
const STORAGE_KEY_USER = 'userData';
const STORAGE_KEY_REMEMBER = 'rememberMe';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private userSubject = new BehaviorSubject<User | null>(null);

  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  public user$ = this.userSubject.asObservable();

  constructor(
    private router: Router,
    private http: HttpClient,
    private companySelectorService: CompanySelectorService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.checkAuthStatus();
  }

  /**
   * Uma única vez: se ainda houver token no `localStorage` (versão antiga, compartilhada
   * entre abas), copia para o `sessionStorage` desta aba e limpa o local, para passar
   * a respeitar sessão independente por aba.
   */
  private migrarSessaoDeLocalStorageUmaVez(): void {
    if (!isPlatformBrowser(this.platformId) || !window.sessionStorage || !window.localStorage) {
      return;
    }
    if (window.sessionStorage.getItem(STORAGE_KEY_TOKEN) && window.sessionStorage.getItem(STORAGE_KEY_USER)) {
      return;
    }
    const lt = window.localStorage.getItem(STORAGE_KEY_TOKEN);
    const lu = window.localStorage.getItem(STORAGE_KEY_USER);
    if (!lt || !lu) {
      return;
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY_TOKEN, lt);
      window.sessionStorage.setItem(STORAGE_KEY_USER, lu);
      const r = window.localStorage.getItem(STORAGE_KEY_REMEMBER);
      if (r) {
        window.sessionStorage.setItem(STORAGE_KEY_REMEMBER, r);
      }
    } catch {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY_TOKEN);
    window.localStorage.removeItem(STORAGE_KEY_USER);
    window.localStorage.removeItem(STORAGE_KEY_REMEMBER);
  }

  // Verificar status de autenticação
  private checkAuthStatus(): void {
    if (!isPlatformBrowser(this.platformId) || !window.sessionStorage) {
      return;
    }
    this.migrarSessaoDeLocalStorageUmaVez();
    const token = window.sessionStorage.getItem(STORAGE_KEY_TOKEN);
    const userData = window.sessionStorage.getItem(STORAGE_KEY_USER);

    if (token && userData) {
      const user = this.normalizeUserRole(JSON.parse(userData));
      this.isAuthenticatedSubject.next(true);
      this.userSubject.next(user);
      window.sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      void this.hydrateCompanyContextFromBackend();
    }
  }

  /** Resultado do login (mensagem opcional vem do body do backend, ex.: 401). */
  async loginWithResult(
    email: string,
    password: string
  ): Promise<{ success: boolean; timeout?: boolean; backendMessage?: string }> {
    try {
      this.companySelectorService.limparSessao();
      const response = await this.authenticateWithAPI(email, password);

      if (response.timeout) {
        return { success: false, timeout: true };
      }
      if (response.success) {
        this.setUserSession(response.user, response.token);
        return { success: true };
      }
      return { success: false, backendMessage: response.backendMessage };
    } catch (error) {
      console.error('Erro no login:', error);
      return { success: false };
    }
  }

  private logDicaPrimeiroAdminSeLocalhost(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') {
      return;
    }
    const base = API_CONFIG.BACKEND_API_URL || 'http://localhost:8080';
    console.info(
      '[Finnzia] Login retornou 401 — na maioria dos casos é email/senha errados ou usuário inativo.\n' +
        'Confira a senha no banco ou use "Esqueci minha senha" (se configurado).\n' +
        'Só use primeiro admin se o banco estiver realmente sem nenhum usuário:\n' +
        `POST ${base}/api/usuarios/primeiro-admin\n` +
        'Content-Type: application/json\n\n' +
        '{"nome":"Administrador","email":"seu@email.com","senha":"123456","role":"ADMIN"}'
    );
  }

  // Login (compatibilidade legada)
  async login(email: string, password: string): Promise<boolean> {
    const result = await this.loginWithResult(email, password);
    return result.success;
  }

  // Autenticação com API (backend real ou mock, controlado por flag)
  private async authenticateWithAPI(email: string, password: string): Promise<any> {
    // Modo mock antigo (útil para demo offline ou se backend estiver fora do ar)
    if (API_CONFIG.USE_BACKEND_MOCK_AUTH) {
      return new Promise((resolve) => {
        setTimeout(() => {
          if (email === 'julia@startarget.com' && password === '123456') {
            resolve({
              success: true,
              token: 'mock-jwt-token-' + Date.now(),
              user: {
                email: email,
                name: 'Julia (Admin)',
                role: 'admin',
                loginTime: new Date().toISOString(),
                permissions: this.buildFullAccessPermissions()
              }
            });
          } else if (email === 'cliente@startarget.com' && password === '123456') {
            resolve({
              success: true,
              token: 'mock-jwt-token-' + Date.now(),
              user: {
                email: email,
                name: 'Cliente',
                role: 'cliente',
                loginTime: new Date().toISOString(),
                permissions: this.buildFullAccessPermissions()
              }
            });
          } else {
            resolve({ success: false });
          }
        }, 1000);
      });
    }

    // Autenticação real no backend Spring Boot
    const url = `${API_CONFIG.BACKEND_API_URL}/api/auth/login`;

    try {
      type LoginApiResponse = {
        token: string;  // Backend retorna 'token', não 'accessToken'
        tipoToken?: string;
        usuario: {
          email: string;
          name: string;
          role: string;
          loginTime: string;
          permissions?: { [key: string]: boolean };  // Backend retorna Map como objeto JSON
        };
      };

      // Timeout de 75s para lidar com cold start do Render (pode demorar até 60s)
      const apiResponse = await firstValueFrom(
        this.http.post<LoginApiResponse>(url, { email, senha: password }).pipe(
          timeout(75000)
        )
      );

      const mappedUser: User = {
        email: apiResponse.usuario.email,
        name: apiResponse.usuario.name,
        role: this.normalizeRole(apiResponse.usuario.role),
        loginTime: apiResponse.usuario.loginTime,
        permissions: this.mapPermissionsFromBackend(apiResponse.usuario.permissions)
      };

      return {
        success: true,
        token: apiResponse.token,  // Corrigido: usar 'token' do backend
        user: mappedUser
      };
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        console.error('Timeout no login — servidor demorou mais de 75s');
        return { success: false, timeout: true };
      }
      let backendMessage: string | undefined;
      if (error instanceof HttpErrorResponse) {
        const body = error.error;
        if (body && typeof body === 'object' && body !== null && 'message' in body) {
          const m = (body as { message?: unknown }).message;
          if (typeof m === 'string' && m.length > 0) {
            backendMessage = m;
          }
        }
        if (error.status === 401) {
          this.logDicaPrimeiroAdminSeLocalhost();
        }
      }
      console.error('Erro ao autenticar no backend:', error);
      return { success: false, backendMessage };
    }
  }

  // Salvar sessão do usuário
  private setUserSession(user: User, token: string): void {
    if (isPlatformBrowser(this.platformId) && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
      window.sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }
    this.isAuthenticatedSubject.next(true);
    this.userSubject.next(user);
    void this.hydrateCompanyContextFromBackend();
  }

  /**
   * Carrega empresas vinculadas ao usuário (API) e preenche o CompanySelectorService.
   * Necessário para o nome da empresa no topo: antes só havia dado se outra tela tinha
   * gravado sessionStorage, o que o cliente nunca alcançava.
   */
  private async hydrateCompanyContextFromBackend(): Promise<void> {
    if (API_CONFIG.USE_BACKEND_MOCK_AUTH) {
      const u = this.getCurrentUser();
      const em = (u?.email || '').toLowerCase();
      if (em.includes('julia')) {
        const demo: CompaniaInfo = {
          idEmpresa: 1,
          nomeEmpresa: 'Julia',
          padrao: true,
          ativo: true,
        };
        this.companySelectorService.atualizarEmpresas([demo]);
      }
      return;
    }
    if (!this.isTokenValid()) {
      return;
    }
    const headers = this.getHttpAuthHeaders();
    if (!headers['Authorization']) {
      return;
    }
    const base = API_CONFIG.BACKEND_API_URL;
    try {
      const me = await firstValueFrom(
        this.http.get<{ id: number }>(`${base}/api/usuarios/me`, { headers })
      );
      if (!me?.id) {
        return;
      }
      const raw = await firstValueFrom(
        this.http.get<unknown[]>(`${base}/api/usuarios/${me.id}/empresas`, { headers })
      );
      if (!raw?.length) {
        return;
      }
      const list: CompaniaInfo[] = (raw as any[]).map((e) => ({
        id: e.id,
        idEmpresa: Number(e.idEmpresa ?? e.id_empresa) || 0,
        nomeEmpresa: String(
          e.nomeEmpresa ?? e.nome ?? e.nomeFantasia ?? e.razaoSocial ?? 'Empresa'
        ).trim() || 'Empresa',
        padrao: Boolean(e.padrao),
        ativo: e.ativo !== false,
      })).filter((c) => c.idEmpresa > 0);
      if (list.length > 0) {
        this.companySelectorService.atualizarEmpresas(list);
      }
    } catch (e) {
      console.warn(
        '[Finnza] Não foi possível carregar empresas do usuário; nome da empresa no cabeçalho pode ficar vazio.',
        e
      );
    }
  }

  // Logout
  logout(): void {
    if (isPlatformBrowser(this.platformId) && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      window.sessionStorage.removeItem(STORAGE_KEY_USER);
      window.sessionStorage.removeItem(STORAGE_KEY_REMEMBER);
    }

    // Limpa cache e notificações de empresa selecionada
    this.companySelectorService.limparSessao();

    this.isAuthenticatedSubject.next(false);
    this.userSubject.next(null);

    this.router.navigate(['/login']);
  }

  // Verificar se está autenticado
  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  // Obter usuário atual
  getCurrentUser(): User | null {
    return this.userSubject.value;
  }

  // Atualizar usuário (por exemplo, permissões)
  updateCurrentUser(user: User) {
    const normalized = this.normalizeUserRole(user);
    this.userSubject.next(normalized);
    if (isPlatformBrowser(this.platformId) && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(normalized));
    }
  }

  // Obter token
  getToken(): string | null {
    if (!isPlatformBrowser(this.platformId) || !window.sessionStorage) {
      return null;
    }
    return window.sessionStorage.getItem(STORAGE_KEY_TOKEN);
  }

  private getHttpAuthHeaders(): { [key: string]: string } {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Verificar se token é válido
  isTokenValid(): boolean {
    const token = this.getToken();
    if (!token) return false;
    // Boa prática: aqui poderíamos decodificar o JWT e verificar expiração.
    // Por enquanto, consideramos qualquer token presente como válido;
    // o backend é quem faz a validação definitiva.
    return true;
  }

  // Construir permissões completas (usado em modo mock ou fallback)
  private buildFullAccessPermissions(): NonNullable<User['permissions']> {
    return {
      dashboard: true,
      relatorio: true,
      movimentacoes: true,
      fluxoCaixa: true,
      contratos: true,
      chat: true,
      assinatura: true,
      gerenciarAcessos: true
    };
  }

  // Mapear permissões vindas do backend (Map) para o modelo usado no front
  private mapPermissionsFromBackend(permissions: { [key: string]: boolean } | undefined): NonNullable<User['permissions']> {
    if (!permissions || Object.keys(permissions).length === 0) {
      // Se backend não enviar permissões, libera tudo para não travar navegação
      return this.buildFullAccessPermissions();
    }

    // Backend já retorna as permissões no formato correto (camelCase)
    return {
      dashboard: permissions['dashboard'] ?? false,
      relatorio: permissions['relatorio'] ?? false,
      movimentacoes: permissions['movimentacoes'] ?? false,
      fluxoCaixa: permissions['fluxoCaixa'] ?? false,
      contratos: permissions['contratos'] ?? false,
      chat: permissions['chat'] ?? false,
      assinatura: permissions['assinatura'] ?? false,
      gerenciarAcessos: permissions['gerenciarAcessos'] ?? false
    };
  }

  // Verificar permissões
  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return this.normalizeRole(user?.role) === this.normalizeRole(role);
  }

  // Verificar se pode acessar rota
  canAccess(route: string): boolean {
    if (!this.isAuthenticated()) return false;
    
    // Lógica de permissões por rota
    const user = this.getCurrentUser();
    if (!user) return false;
    
    // Admin pode acessar tudo
    if (this.normalizeRole(user.role) === 'admin') return true;
    
    const map: Record<string, keyof NonNullable<User['permissions']>> = {
      'dashboard': 'dashboard',
      'rotina': 'dashboard',
      'relatorio': 'relatorio',
      'movimentacoes': 'movimentacoes',
      'fluxo-caixa': 'fluxoCaixa',
      'contratos': 'contratos',
      'chat': 'chat',
      'assinatura': 'assinatura',
      'gerenciar-acessos': 'gerenciarAcessos'
    };

    const key = map[route];
    if (!key) return true; // rotas não mapeadas liberadas
    return Boolean(user.permissions?.[key]);
  }

  // Renovar token (simulação)
  async refreshToken(): Promise<boolean> {
    try {
      const newToken = 'mock-jwt-token-' + Date.now();
      if (isPlatformBrowser(this.platformId) && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_KEY_TOKEN, newToken);
      }
      return true;
    } catch (error) {
      console.error('Erro ao renovar token:', error);
      return false;
    }
  }

  /**
   * Solicita recuperação de senha
   */
  async forgotPassword(email: string): Promise<boolean> {
    try {
      const url = `${API_CONFIG.BACKEND_API_URL}/api/auth/forgot-password`;
      await firstValueFrom(this.http.post(url, { email }));
      return true;
    } catch (error) {
      console.error('Erro ao solicitar recuperação de senha:', error);
      return false;
    }
  }

  /**
   * Redefine senha usando token
   */
  async resetPassword(token: string, novaSenha: string): Promise<boolean> {
    try {
      const url = `${API_CONFIG.BACKEND_API_URL}/api/auth/reset-password`;
      await firstValueFrom(this.http.post(url, { token, novaSenha }));
      return true;
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      return false;
    }
  }

  private normalizeRole(role?: string): string {
    const value = (role || '').trim().toLowerCase();
    if (value === 'admin' || value === 'role_admin') return 'admin';
    if (value === 'cliente' || value === 'role_cliente' || value === 'user' || value === 'role_user') {
      return 'cliente';
    }
    if (value.includes('admin')) return 'admin';
    return value || 'cliente';
  }

  private normalizeUserRole(user: User): User {
    return {
      ...user,
      role: this.normalizeRole(user?.role)
    };
  }
}
