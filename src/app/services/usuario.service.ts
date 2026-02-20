import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';

export interface Usuario {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'cliente';
  status: 'ativo' | 'inativo';
  loginTime?: string;
  dataCriacao?: string;
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

export interface CriarUsuarioRequest {
  nome: string;
  email: string;
  senha: string;
  role: 'ADMIN' | 'CLIENTE';
}

export interface AtualizarUsuarioRequest {
  nome?: string;
  email?: string;
  role?: 'ADMIN' | 'CLIENTE';
  status?: 'ATIVO' | 'INATIVO';
}

export interface AtualizarPermissoesRequest {
  permissions: { [key: string]: boolean };
}

export interface UsuarioFiltroRequest {
  nome?: string;
  email?: string;
  role?: 'ADMIN' | 'CLIENTE';
  status?: 'ATIVO' | 'INATIVO';
  page?: number;
  size?: number;
  sort?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UsuarioService {
  private readonly baseUrl = `${API_CONFIG.BACKEND_API_URL}/api/usuarios`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  /**
   * Obtém o token JWT para autenticação
   */
  private getAuthHeaders(): { [key: string]: string } {
    const token = this.authService.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Lista todos os usuários com paginação
   */
  listarUsuarios(page: number = 0, size: number = 10, sort: string = 'nome'): Observable<PageResponse<Usuario>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('sort', sort);

    return this.http.get<PageResponse<Usuario>>(this.baseUrl, {
      params,
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Lista usuários com filtros avançados
   */
  listarComFiltros(filtros: UsuarioFiltroRequest): Observable<PageResponse<Usuario>> {
    return this.http.post<PageResponse<Usuario>>(`${this.baseUrl}/filtros`, filtros, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Busca um usuário por ID
   */
  buscarPorId(id: number): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.baseUrl}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Cria um novo usuário
   */
  criarUsuario(request: CriarUsuarioRequest): Observable<Usuario> {
    return this.http.post<Usuario>(this.baseUrl, request, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualiza um usuário
   */
  atualizarUsuario(id: number, request: AtualizarUsuarioRequest): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.baseUrl}/${id}`, request, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualiza permissões de um usuário
   */
  atualizarPermissoes(id: number, request: AtualizarPermissoesRequest): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.baseUrl}/${id}/permissoes`, request, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Remove um usuário (soft delete)
   */
  deletarUsuario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Restaura um usuário deletado
   */
  restaurarUsuario(id: number): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.baseUrl}/${id}/restaurar`, {}, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Remove permanentemente um usuário (hard delete)
   */
  removerPermanentemente(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/permanente`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Busca o perfil do usuário logado
   */
  buscarMeuPerfil(): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualiza o perfil do usuário logado
   */
  atualizarMeuPerfil(request: { nome?: string }): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.baseUrl}/me`, request, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Altera a senha do usuário logado
   */
  alterarMinhaSenha(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/me/senha`, {
      senhaAtual,
      novaSenha
    }, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * GET /api/usuarios/{id}/empresas
   * Obtém empresas atribuídas a um usuário
   */
  obterEmpresasUsuario(usuarioId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${usuarioId}/empresas`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * PUT /api/usuarios/{id}/empresas
   * Atualiza empresas em bulk (atribui múltiplas empresas ao usuário)
   */
  atualizarEmpresasUsuario(usuarioId: number, payload: any): Observable<any[]> {
    return this.http.put<any[]>(`${this.baseUrl}/${usuarioId}/empresas`, payload, {
      headers: this.getAuthHeaders()
    });
  }
}

