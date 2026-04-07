import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { DfcPlanilhaLinha } from '../components/fluxo-caixa/dfc-sheet.utils';

export interface DfcPlanilhaResponse {
  id: number | null;
  idEmpresa: number;
  months: string[];
  rows: DfcPlanilhaLinha[];
}

export interface DfcPlanilhaPayload {
  months: string[];
  rows: DfcPlanilhaLinha[];
}

@Injectable({ providedIn: 'root' })
export class DfcPlanilhaService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/dfc/planilha`;

  constructor(private readonly http: HttpClient) {}

  buscar(): Observable<DfcPlanilhaResponse> {
    return this.http.get<DfcPlanilhaResponse>(this.base);
  }

  salvar(body: DfcPlanilhaPayload): Observable<DfcPlanilhaResponse> {
    return this.http.put<DfcPlanilhaResponse>(this.base, body);
  }
}
