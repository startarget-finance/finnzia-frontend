import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * Interceptor para gerenciar estados de loading globalmente
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Apenas para requisições da API (exceto login/auth — tela de login tem seu próprio estado)
  // Também ignorar chamadas de background sync (busca de perfil/empresas do usuário)
  const isBackgroundSync = req.url.includes('/api/usuarios/me') ||
    (req.url.includes('/api/usuarios/') && req.url.includes('/empresas'));
  const isApiRequest = req.url.includes('/api/') && !req.url.includes('/api/auth/') && !isBackgroundSync;
  if (isApiRequest) {
    loadingService.show();
  }

  return next(req).pipe(
    finalize(() => {
      if (isApiRequest) {
        loadingService.hide();
      }
    })
  );
};

