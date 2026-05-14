import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ErrorMessage {
  message: string;
  code?: string;
  status?: number;
  timestamp: Date;
}

const MSG_CONEXAO_INTERROMPIDA =
  'A comunicação com o servidor caiu no meio da resposta (reinício da API, timeout ou rede). Tente de novo; se persistir, confira o console do backend.';

/** Indica texto de socket/rede, não mensagem de validação de negócio da API. */
export function looksLikeNetworkInfrastructureMessage(text: string | undefined | null): boolean {
  if (text == null || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes('connection reset') ||
    t.includes('econnreset') ||
    t.includes('broken pipe') ||
    t.includes('socket hang up') ||
    t.includes('socket hung up') ||
    t.includes('enetunreach') ||
    t.includes('etimedout') ||
    t.includes('eai_again') ||
    t.includes('net::err_') ||
    t.includes('failed to fetch') ||
    t.includes('network error')
  );
}

/**
 * Extrai texto legível do corpo de erro HTTP (API interna, Spring Boot, RFC 7807).
 */
export function extractHttpErrorBodyMessage(backendError: unknown): string | undefined {
  if (backendError == null) return undefined;
  if (typeof backendError === 'string') {
    const t = backendError.trim();
    if (!t.length) return undefined;
    if (looksLikeNetworkInfrastructureMessage(t)) return undefined;
    return t;
  }
  if (typeof backendError !== 'object') return undefined;
  const o = backendError as Record<string, unknown>;
  const pick = (key: string): string | undefined => {
    const v = o[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  };
  /** Corpo padrão do Spring Boot sem {@code mensagem} — o campo {@code error} costuma ser só "Bad Request". */
  const springDefaultShape =
    typeof o['status'] === 'number' &&
    (typeof o['path'] === 'string' || typeof o['instance'] === 'string');
  const isGenericReason = (s: string) =>
    /^(Bad Request|Unauthorized|Forbidden|Not Found|Method Not Allowed|Internal Server Error)$/i.test(s);
  for (const key of ['mensagem', 'detail', 'message', 'title', 'error']) {
    const s = pick(key);
    if (!s) continue;
    if (looksLikeNetworkInfrastructureMessage(s)) continue;
    if (springDefaultShape && (key === 'error' || key === 'message' || key === 'title') && isGenericReason(s)) {
      continue;
    }
    return s;
  }
  const errors = o['errors'];
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (first && typeof first === 'object') {
      const row = first as Record<string, unknown>;
      const d = row['defaultMessage'];
      if (typeof d === 'string' && d.trim()) return d.trim();
      const m = row['message'];
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
  }
  return undefined;
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

    const extractBackendText = (backendError: unknown): string | undefined =>
      extractHttpErrorBodyMessage(backendError);

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
      const rawString = typeof backendError === 'string' ? backendError.trim() : '';
      const infraRaw =
        rawString.length > 0 && looksLikeNetworkInfrastructureMessage(rawString);

      // Mensagens personalizadas por status
      switch (status) {
        case 400:
          errorMessage = {
            message: infraRaw
              ? MSG_CONEXAO_INTERROMPIDA
              : backendText || 'Dados inválidos. Verifique os campos e tente novamente.',
            code: infraRaw ? 'NETWORK_INTERRUPTED' : 'BAD_REQUEST',
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

