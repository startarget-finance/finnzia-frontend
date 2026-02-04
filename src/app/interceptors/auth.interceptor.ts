import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Interceptor para adicionar token JWT em todas as requisições
 * e tratar erros de autenticação (401, 403)
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Não adicionar token para webhooks externos (como Clint)
  // Webhooks não precisam de autenticação JWT
  if (req.url.includes('functions-api.clint.digital') || req.url.includes('clint.digital')) {
    return next(req);
  }

  // Obter token do localStorage
  const token = authService.getToken();

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
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/login'], { 
          queryParams: { 
            expired: 'true',
            message: 'Sua sessão expirou. Por favor, faça login novamente.' 
          } 
        });
      }

      // Se erro 403 (Forbidden), redirecionar para dashboard
      if (error.status === 403) {
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

