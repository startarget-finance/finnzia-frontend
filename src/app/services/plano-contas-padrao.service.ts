import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface PlanoContasPadraoResponse {
  arvore: unknown[];
  dataAtualizacao?: string | null;
  atualizadoPorEmail?: string | null;
  usandoPadraoEmbutido?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlanoContasPadraoService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/plano-contas-padrao`;
  private readonly adminBase = `${API_CONFIG.BACKEND_API_URL}/api/admin/plano-contas-padrao`;

  constructor(private readonly http: HttpClient) {}

  /** Modelo usado ao aplicar plano automático na empresa (parametrização). */
  obter(): Observable<PlanoContasPadraoResponse> {
    return this.http.get<PlanoContasPadraoResponse>(this.base);
  }

  obterAdmin(): Observable<PlanoContasPadraoResponse> {
    return this.http.get<PlanoContasPadraoResponse>(this.adminBase);
  }

  salvarAdmin(arvore: unknown[]): Observable<PlanoContasPadraoResponse> {
    return this.http.put<PlanoContasPadraoResponse>(this.adminBase, { arvore });
  }

  restaurarEmbutidoAdmin(): Observable<PlanoContasPadraoResponse> {
    return this.http.post<PlanoContasPadraoResponse>(`${this.adminBase}/restaurar-embutido`, {});
  }
}
