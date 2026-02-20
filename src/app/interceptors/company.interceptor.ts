import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CompanySelectorService } from '../services/company-selector.service';

/**
 * HTTP Interceptor funcional para adicionar empresa ao header de requisições
 * 
 * Adiciona header "X-Empresa-Id" com o ID da empresa selecionada
 * em todas as requisições para a API
 */
export const companyInterceptor: HttpInterceptorFn = (req, next) => {
  const companySelectorService = inject(CompanySelectorService);
  const HEADER_KEY = 'X-Empresa-Id';

  // Obter empresa selecionada atual
  const empresaSelecionada = companySelectorService.obterIdEmpresaSelecionada();

  // Se houver empresa selecionada, adicionar ao header
  if (empresaSelecionada && empresaSelecionada > 0) {
    req = req.clone({
      setHeaders: {
        [HEADER_KEY]: empresaSelecionada.toString()
      }
    });

    console.log(`📤 [${HEADER_KEY}: ${empresaSelecionada}] ${req.method} ${req.url}`);
  }

  // Continuar a requisição
  return next(req);
};
