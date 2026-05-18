import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
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
  private readonly webAppUrl = API_CONFIG.GOOGLE_SHEETS_WEB_APP_URL?.trim() ?? '';

  salvarDiagnostico(data: DiagnosticoData): Observable<{ success: boolean; message?: string }> {
    if (!this.webAppUrl) {
      console.warn('Google Sheets Web App URL não configurada');
      return of({ success: false, message: 'URL não configurada' });
    }

    const dataToSend: DiagnosticoData = {
      ...data,
      timestamp: new Date().toISOString(),
      origem: data.origem ?? 'Landing Page - Diagnóstico'
    };

    return new Observable(observer => {
      const state = { done: false };

      const finish = (success: boolean, message?: string) => {
        if (state.done) {
          return;
        }
        state.done = true;
        observer.next({ success, message });
        observer.complete();
      };

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try {
          const params = new URLSearchParams();
          Object.entries(dataToSend).forEach(([key, value]) => {
            if (value != null && String(value).length > 0) {
              params.append(key, String(value));
            }
          });
          const blob = new Blob([params.toString()], {
            type: 'application/x-www-form-urlencoded'
          });
          if (navigator.sendBeacon(this.webAppUrl, blob)) {
            finish(true, 'Dados salvos com sucesso');
            return;
          }
        } catch (e) {
          console.warn('sendBeacon falhou:', e);
        }
      }

      fetch(this.webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: this.toUrlEncoded(dataToSend),
        mode: 'no-cors',
        keepalive: true
      })
        .then(() => finish(true, 'Dados enviados'))
        .catch(() => this.submitViaHiddenForm(dataToSend, finish));
    });
  }

  private toUrlEncoded(data: DiagnosticoData): string {
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value != null && String(value).length > 0) {
        params.append(key, String(value));
      }
    });
    return params.toString();
  }

  private submitViaHiddenForm(
    data: DiagnosticoData,
    finish: (success: boolean, message?: string) => void
  ): void {
    try {
      const iframeName = 'google-sheets-iframe';
      let iframe = document.getElementById(iframeName) as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = iframeName;
        iframe.name = iframeName;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText =
          'position:fixed;left:-9999px;width:1px;height:1px;border:0;opacity:0';
        document.body.appendChild(iframe);
      }

      let form = document.getElementById('google-sheets-form') as HTMLFormElement | null;
      if (!form) {
        form = document.createElement('form');
        form.id = 'google-sheets-form';
        form.method = 'POST';
        form.target = iframeName;
        form.enctype = 'application/x-www-form-urlencoded';
        form.setAttribute('aria-hidden', 'true');
        form.style.cssText =
          'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
        document.body.appendChild(form);
      }

      form.action = this.webAppUrl;
      form.innerHTML = '';
      Object.entries(data).forEach(([key, value]) => {
        if (value == null || String(value).length === 0) {
          return;
        }
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form!.appendChild(input);
      });

      form.submit();
      setTimeout(() => finish(true, 'Dados enviados via formulário'), 1200);
    } catch (e) {
      console.error('Erro ao enviar para Google Sheets:', e);
      finish(false, 'Erro ao enviar formulário');
    }
  }
}
