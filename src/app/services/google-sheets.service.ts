import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
export class GoogleSheetsService {
  // URL do Google Apps Script Web App
  // IMPORTANTE: Substitua pela URL do seu Google Apps Script após criar
  private readonly webAppUrl = API_CONFIG.GOOGLE_SHEETS_WEB_APP_URL || '';

  constructor(private http: HttpClient) {}

  /**
   * Salva dados do diagnóstico no Google Sheets
   */
  salvarDiagnostico(data: DiagnosticoData): Observable<{ success: boolean; message?: string }> {
    if (!this.webAppUrl) {
      console.warn('Google Sheets Web App URL não configurada');
      return of({ success: false, message: 'URL não configurada' });
    }

    // Adicionar timestamp e origem
    const dataToSend = {
      ...data,
      timestamp: new Date().toISOString(),
      origem: 'Landing Page - Diagnóstico'
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // Usar formulário oculto com iframe para contornar CORS sem redirecionar
    return new Observable(observer => {
      try {
        // Criar iframe oculto para receber a resposta
        const iframe = document.createElement('iframe');
        iframe.name = 'hidden-iframe-' + Date.now();
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        // Criar formulário oculto que envia para o iframe
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = this.webAppUrl;
        form.target = iframe.name; // Envia para o iframe, não abre nova aba
        form.enctype = 'application/x-www-form-urlencoded'; // Encoding correto para Google Apps Script
        form.style.display = 'none';

        // Adicionar todos os campos como inputs hidden
        console.log('Dados que serão enviados:', dataToSend);
        Object.keys(dataToSend).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(dataToSend[key as keyof typeof dataToSend] || '');
          form.appendChild(input);
          console.log(`Campo adicionado: ${key} = ${input.value}`);
        });

        // Adicionar formulário ao body, enviar
        document.body.appendChild(form);
        console.log('Enviando formulário para:', this.webAppUrl);
        form.submit();

        // Limpar após enviar
        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 2000);

        // Assumir sucesso (formulário HTML não tem problema de CORS)
        setTimeout(() => {
          observer.next({ success: true, message: 'Dados salvos com sucesso' });
          observer.complete();
        }, 500);

      } catch (error) {
        console.error('Erro ao salvar no Google Sheets:', error);
        observer.next({ success: false, message: 'Erro ao salvar diagnóstico' });
        observer.complete();
      }
    });

  }
}
