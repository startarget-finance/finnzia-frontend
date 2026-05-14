import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, mergeMap, timeout } from 'rxjs/operators';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';
import { CompanySelectorService } from './company-selector.service';

export interface PluggyStatus {
  configured: boolean;
}

export interface PluggyConnectTokenResponse {
  accessToken: string;
}

export interface PluggyConexao {
  id: number;
  pluggyItemId: string;
  connectorId?: string | null;
  connectorName?: string | null;
  status?: string | null;
  dataCriacao?: string | null;
  dataAtualizacao?: string | null;
}

export interface PluggyRegisterItemPayload {
  itemId: string;
  connectorId?: string;
  connectorName?: string;
  status?: string;
}

/** Corpo opcional de POST /api/pluggy/conexoes/{id}/sync */
export interface PluggySyncPayload {
  dataInicio?: string;
  dataFim?: string;
  idContaBancaria?: number;
  nomeContaExibicao?: string;
}

export interface PluggySyncResult {
  erro: boolean;
  mensagem?: string;
  totalPluggy?: number;
  importadas?: number;
  ignoradasDuplicadas?: number;
  importacaoId?: number;
  conta?: string;
  periodoInicio?: string;
  periodoFim?: string;
}

@Injectable({ providedIn: 'root' })
export class PluggyService {
  private readonly baseUrl = `${API_CONFIG.BACKEND_API_URL}/api/pluggy`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private companySelector: CompanySelectorService
  ) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    let h = new HttpHeaders();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    const idEmp = this.companySelector.obterIdEmpresaSelecionada();
    if (idEmp != null && idEmp > 0) {
      h = h.set('X-Empresa-Id', String(idEmp));
    }
    return h;
  }

  status(): Observable<PluggyStatus> {
    return this.http.get<PluggyStatus>(`${this.baseUrl}/status`, { headers: this.headers() });
  }

  listarConexoes(): Observable<PluggyConexao[]> {
    return this.http.get<PluggyConexao[]>(`${this.baseUrl}/conexoes`, { headers: this.headers() });
  }

  /**
   * Primeira chamada após cold start (host Pluggy ou API finzzia) às vezes falha; repetimos uma vez após breve espera.
   */
  criarConnectToken(itemId?: string): Observable<PluggyConnectTokenResponse> {
    const body = itemId ? { itemId } : {};
    const post = () =>
      this.http.post<PluggyConnectTokenResponse>(`${this.baseUrl}/connect-token`, body, {
        headers: this.headers(),
      });
    return post().pipe(
      catchError((err) => {
        const s = err?.status as number | undefined;
        const transient =
          s === 502 ||
          s === 503 ||
          s === 504 ||
          s === 0 ||
          s === undefined ||
          (typeof err?.message === 'string' && /timeout|network|failed to fetch/i.test(err.message));
        if (transient) {
          return timer(900).pipe(mergeMap(() => post()));
        }
        return throwError(() => err);
      })
    );
  }

  registrarItem(payload: PluggyRegisterItemPayload): Observable<PluggyConexao> {
    return this.http.post<PluggyConexao>(`${this.baseUrl}/item`, payload, { headers: this.headers() });
  }

  /** Importa transações Pluggy para movimentações (mesmo fluxo de lote OFX / conciliação). Pode demorar (várias páginas na Pluggy). */
  sincronizarConexao(conexaoId: number, payload?: PluggySyncPayload): Observable<PluggySyncResult> {
    const body = payload && Object.keys(payload).length > 0 ? payload : {};
    return this.http
      .post<PluggySyncResult>(`${this.baseUrl}/conexoes/${conexaoId}/sync`, body, {
        headers: this.headers(),
      })
      .pipe(timeout(240000));
  }
}
