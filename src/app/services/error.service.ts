import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ErrorMessage {
  message: string;
  code?: string;
  status?: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorService {
  private errorSubject = new BehaviorSubject<ErrorMessage | null>(null);
  public error$: Observable<ErrorMessage | null> = this.errorSubject.asObservable();

  /**
   * Trata erros HTTP de forma centralizada
   */
  handleError(error: HttpErrorResponse): void {
    let errorMessage: ErrorMessage;

    const extractBackendText = (backendError: unknown): string | undefined => {
      if (!backendError || typeof backendError !== 'object') return undefined;
      const o = backendError as Record<string, unknown>;
      const m = o['message'];
      const msgPt = o['mensagem'];
      if (typeof m === 'string' && m.trim()) return m;
      if (typeof msgPt === 'string' && msgPt.trim()) return msgPt;
      return undefined;
    };

    if (error.error instanceof ErrorEvent) {
      // Erro do lado do cliente
      errorMessage = {
        message: 'Erro de conexão. Verifique sua internet e tente novamente.',
        code: 'CLIENT_ERROR',
        timestamp: new Date()
      };
    } else {
      // Erro do servidor
      const status = error.status;
      const backendError = error.error;
      const backendText = extractBackendText(backendError);

      // Mensagens personalizadas por status
      switch (status) {
        case 400:
          errorMessage = {
            message:
              backendText || 'Dados inválidos. Verifique os campos e tente novamente.',
            code: 'BAD_REQUEST',
            status: 400,
            timestamp: new Date()
          };
          break;
        case 401:
          errorMessage = {
            message: 'Sessão expirada. Por favor, faça login novamente.',
            code: 'UNAUTHORIZED',
            status: 401,
            timestamp: new Date()
          };
          break;
        case 403:
          errorMessage = {
            message: 'Você não tem permissão para realizar esta ação.',
            code: 'FORBIDDEN',
            status: 403,
            timestamp: new Date()
          };
          break;
        case 404:
          errorMessage = {
            message: 'Recurso não encontrado.',
            code: 'NOT_FOUND',
            status: 404,
            timestamp: new Date()
          };
          break;
        case 409:
          errorMessage = {
            message: backendText || 'Conflito. Este recurso já existe.',
            code: 'CONFLICT',
            status: 409,
            timestamp: new Date()
          };
          break;
        case 422:
          errorMessage = {
            message: backendText || 'Dados inválidos. Verifique os campos.',
            code: 'UNPROCESSABLE_ENTITY',
            status: 422,
            timestamp: new Date()
          };
          break;
        case 500:
          errorMessage = {
            message: 'Erro interno do servidor. Tente novamente mais tarde.',
            code: 'INTERNAL_SERVER_ERROR',
            status: 500,
            timestamp: new Date()
          };
          break;
        case 503:
          errorMessage = {
            message: 'Serviço temporariamente indisponível. Tente novamente mais tarde.',
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
            timestamp: new Date()
          };
          break;
        default:
          errorMessage = {
            message: backendText || 'Erro inesperado. Tente novamente.',
            code: 'UNKNOWN_ERROR',
            status: status,
            timestamp: new Date()
          };
      }
    }

    // Emitir erro
    this.errorSubject.next(errorMessage);

    // Log para desenvolvimento
    if (error.status !== 401 && error.status !== 403) {
      console.error('Erro HTTP:', errorMessage);
    }
  }

  /**
   * Limpar erro atual
   */
  clearError(): void {
    this.errorSubject.next(null);
  }

  /**
   * Obter erro atual
   */
  getCurrentError(): ErrorMessage | null {
    return this.errorSubject.value;
  }
}

