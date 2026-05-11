import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor para adicionar token JWT em todas as requisições
 * e tratar erros de autenticação (401, 403)
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  // Não adicionar token para webhooks externos (como Clint)
  // Webhooks não precisam de autenticação JWT
  if (
    req.url.includes('functions-api.clint.digital') ||
    req.url.includes('clint.digital') ||
    req.url.includes('brasilapi.com.br')
  ) {
    return next(req);
  }

  // Lê token direto da sessão da aba para evitar acoplamento cíclico
  // entre AuthService -> HttpClient -> Interceptor -> AuthService no bootstrap.
  const token =
    typeof window !== 'undefined' && window.sessionStorage
      ? window.sessionStorage.getItem('authToken')
      : null;

  // Adicionar token no header se existir
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // Processar requisição e tratar erros
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Se erro 401 (Unauthorized), fazer logout e redirecionar
      // Ignorar se for a própria requisição de login (credenciais inválidas não são sessão expirada)
      const isLoginRequest = req.url.includes('/api/auth/login');
      if (error.status === 401 && !isLoginRequest) {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('authToken');
          window.sessionStorage.removeItem('userData');
          window.sessionStorage.removeItem('rememberMe');
          window.sessionStorage.removeItem('empresa_selecionada');
          window.sessionStorage.removeItem('empresas_permitidas');
        }
        router.navigate(['/login'], { 
          queryParams: { 
            expired: 'true',
            message: 'Sua sessão expirou. Por favor, faça login novamente.' 
          } 
        });
      }

      // Se erro 403 (Forbidden), redirecionar para dashboard apenas se já estiver autenticado
      if (error.status === 403 && token) {
        router.navigate(['/dashboard'], { 
          queryParams: { 
            forbidden: 'true',
            message: 'Você não tem permissão para acessar este recurso.' 
          } 
        });
      }

      return throwError(() => error);
    })
  );
};

