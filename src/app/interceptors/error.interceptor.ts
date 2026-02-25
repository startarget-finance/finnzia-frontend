import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorService } from '../services/error.service';

/**
 * Interceptor global para tratamento de erros HTTP
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorService = inject(ErrorService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Não processar 401 do endpoint de login — credenciais inválidas são tratadas pelo LoginComponent
      const isLoginRequest = req.url.includes('/api/auth/login');
      if (!(error.status === 401 && isLoginRequest)) {
        errorService.handleError(error);
      }

      // Retornar erro para que componentes possam tratar se necessário
      return throwError(() => error);
    })
  );
};

