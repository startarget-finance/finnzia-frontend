import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * Interceptor para gerenciar estados de loading globalmente
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Apenas para requisições da API
  const isApiRequest = req.url.includes('/api/');
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

