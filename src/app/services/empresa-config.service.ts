import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface EmpresaConfigResponse {
  idEmpresa: number;
  asaasConfigurado: boolean;
  asaasBaseUrl: string;
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

  saveConfig(idEmpresa: number, asaasApiKey: string, asaasBaseUrl?: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${idEmpresa}`, {
      asaasApiKey: asaasApiKey || null,
      asaasBaseUrl: asaasBaseUrl || null
    });
  }
}
