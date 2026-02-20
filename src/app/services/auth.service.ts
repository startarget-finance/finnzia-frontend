import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { CompanySelectorService } from './company-selector.service';

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
    private companySelectorService: CompanySelectorService
  ) {
    this.checkAuthStatus();
  }

  // Verificar status de autenticação
  private checkAuthStatus(): void {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');
    
    if (token && userData) {
      this.isAuthenticatedSubject.next(true);
      this.userSubject.next(JSON.parse(userData));
    }
  }

  // Login
  async login(email: string, password: string): Promise<boolean> {
    try {
      // Limpa seleção de empresa de sessões anteriores antes de autenticar
      this.companySelectorService.limparSessao();
      const response = await this.authenticateWithAPI(email, password);
      
      if (response.success) {
        this.setUserSession(response.user, response.token);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erro no login:', error);
      return false;
    }
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

      const apiResponse = await firstValueFrom(
        this.http.post<LoginApiResponse>(url, { email, senha: password })
      );

      const mappedUser: User = {
        email: apiResponse.usuario.email,
        name: apiResponse.usuario.name,
        role: apiResponse.usuario.role?.toLowerCase() ?? 'cliente',
        loginTime: apiResponse.usuario.loginTime,
        permissions: this.mapPermissionsFromBackend(apiResponse.usuario.permissions)
      };

      return {
        success: true,
        token: apiResponse.token,  // Corrigido: usar 'token' do backend
        user: mappedUser
      };
    } catch (error) {
      console.error('Erro ao autenticar no backend:', error);
      return { success: false };
    }
  }

  // Salvar sessão do usuário
  private setUserSession(user: User, token: string): void {
    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify(user));
    
    this.isAuthenticatedSubject.next(true);
    this.userSubject.next(user);
  }

  // Logout
  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('rememberMe');
    
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
    this.userSubject.next(user);
    localStorage.setItem('userData', JSON.stringify(user));
  }

  // Obter token
  getToken(): string | null {
    return localStorage.getItem('authToken');
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
    return user?.role === role;
  }

  // Verificar se pode acessar rota
  canAccess(route: string): boolean {
    if (!this.isAuthenticated()) return false;
    
    // Lógica de permissões por rota
    const user = this.getCurrentUser();
    if (!user) return false;
    
    // Admin pode acessar tudo
    if (user.role === 'admin') return true;
    
    const map: Record<string, keyof NonNullable<User['permissions']>> = {
      'dashboard': 'dashboard',
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
      // Simular renovação de token
      const newToken = 'mock-jwt-token-' + Date.now();
      localStorage.setItem('authToken', newToken);
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
}
