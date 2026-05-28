import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface InstituicaoFinanceira {
  id: number;
  codigo?: string | null;
  banco: string;
  instituicao: string;
  grupo: string;
  popular: boolean;
}

export interface InstituicoesFinanceirasResponse {
  itens: InstituicaoFinanceira[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class InstituicoesFinanceirasService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/catalogo/instituicoes-financeiras`;

  constructor(private readonly http: HttpClient) {}

  listar(q?: string, limit = 500): Observable<InstituicoesFinanceirasResponse> {
    let params = new HttpParams().set('limit', String(limit));
    if (q != null && q.trim() !== '') {
      params = params.set('q', q.trim());
    }
    return this.http.get<InstituicoesFinanceirasResponse>(this.base, { params });
  }
}
