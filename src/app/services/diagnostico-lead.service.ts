import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_CONFIG } from '../config/api.config';

export interface DiagnosticoData {
  nome: string;
  email: string;
  telefone?: string;
  segmento?: string;
  faturamento?: string;
  contexto?: string;
  timestamp?: string;
  origem?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DiagnosticoLeadService {
  private readonly webhookUrl = API_CONFIG.PIPEDREAM_DIAGNOSTICO_WEBHOOK_URL?.trim() ?? '';

  constructor(private readonly http: HttpClient) {}

  salvarDiagnostico(data: DiagnosticoData): Observable<{ success: boolean; message?: string }> {
    if (!this.webhookUrl) {
      console.warn('PIPEDREAM_DIAGNOSTICO_WEBHOOK_URL não configurada');
      return of({
        success: false,
        message: 'Integração de leads não configurada. Defina o webhook do Pipedream em api.config.ts.'
      });
    }

    const timestamp = new Date().toISOString();
    const payload = {
      ...data,
      timestamp,
      dataHora: timestamp,
      origem: data.origem ?? 'Landing Page - Diagnóstico'
    };

    return this.http
      .post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text'
      })
      .pipe(
        map(() => ({ success: true, message: 'Lead registrado com sucesso' })),
        catchError(err => {
          console.error('Erro ao enviar lead para Pipedream:', err);
          return of({
            success: false,
            message: 'Não foi possível enviar seus dados. Tente novamente ou fale pelo WhatsApp.'
          });
        })
      );
  }
}
