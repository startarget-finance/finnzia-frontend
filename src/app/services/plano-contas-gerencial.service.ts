import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface PlanoContasEmpresaNome {
  idEmpresa: number;
  nomeEmpresa: string;
}

export interface PlanoContasGerencial {
  id: number;
  nome: string;
  padrao: boolean;
  idEmpresas: number[];
  empresas: PlanoContasEmpresaNome[];
  dataCriacao?: string;
  dataAtualizacao?: string;
}

export interface PlanoContasGerencialPayload {
  nome: string;
  idEmpresas: number[];
  padrao?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlanoContasGerencialService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/planos-contas-gerenciais`;

  constructor(private readonly http: HttpClient) {}

  listar(filtroIdEmpresa?: number | null): Observable<PlanoContasGerencial[]> {
    let params = new HttpParams();
    if (filtroIdEmpresa != null && filtroIdEmpresa > 0) {
      params = params.set('idEmpresa', String(filtroIdEmpresa));
    }
    return this.http.get<PlanoContasGerencial[]>(this.base, { params });
  }

  criar(body: PlanoContasGerencialPayload): Observable<PlanoContasGerencial> {
    return this.http.post<PlanoContasGerencial>(this.base, body);
  }

  atualizar(id: number, body: PlanoContasGerencialPayload): Observable<PlanoContasGerencial> {
    return this.http.put<PlanoContasGerencial>(`${this.base}/${id}`, body);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  marcarPadrao(id: number): Observable<PlanoContasGerencial> {
    return this.http.post<PlanoContasGerencial>(`${this.base}/${id}/padrao`, {});
  }
}
