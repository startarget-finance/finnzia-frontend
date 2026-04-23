import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface EmpresaConfigResponse {
  idEmpresa: number;
  asaasConfigurado: boolean;
  asaasBaseUrl: string;
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  emailEmpresa?: string;
  telefoneEmpresa?: string;
  taxaCartaoCredito?: number;
  taxaAntecipacaoCredito?: number;
}

export interface EmpresaCadastroBasicoPayload {
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  emailEmpresa?: string;
  telefoneEmpresa?: string;
  taxaCartaoCredito?: number;
  taxaAntecipacaoCredito?: number;
}

@Injectable({
  providedIn: 'root'
})
export class EmpresaConfigService {

  private get baseUrl(): string {
    return `${API_CONFIG.BACKEND_API_URL}/api/empresas/config`;
  }

  constructor(private http: HttpClient) {}

  getConfig(idEmpresa: number): Observable<EmpresaConfigResponse> {
    return this.http.get<EmpresaConfigResponse>(`${this.baseUrl}/${idEmpresa}`);
  }

  saveConfig(
    idEmpresa: number,
    asaasApiKey: string,
    asaasBaseUrl?: string,
    empresa?: EmpresaCadastroBasicoPayload
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${idEmpresa}`, {
      asaasApiKey: asaasApiKey || null,
      asaasBaseUrl: asaasBaseUrl || null,
      cnpj: empresa?.cnpj || null,
      razaoSocial: empresa?.razaoSocial || null,
      nomeFantasia: empresa?.nomeFantasia || null,
      emailEmpresa: empresa?.emailEmpresa || null,
      telefoneEmpresa: empresa?.telefoneEmpresa || null,
      taxaCartaoCredito: empresa?.taxaCartaoCredito ?? null,
      taxaAntecipacaoCredito: empresa?.taxaAntecipacaoCredito ?? null
    });
  }
}
