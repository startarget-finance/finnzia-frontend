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

  /** Tempo extra no mobile antes de considerar envio concluído (ms) */
  private readonly mobileFinishDelayMs = 1800;

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

      const mobile = this.isMobileDevice();

      // Mobile: POST via formulário no DOM (mais confiável que fetch dinâmico)
      if (mobile) {
        this.trySendBeacon(dataToSend);
        const formOk = this.submitViaDomForm(dataToSend, finish, this.mobileFinishDelayMs);
        if (formOk) {
          return;
        }
      }

      if (this.trySendBeacon(dataToSend, finish)) {
        return;
      }

      fetch(this.webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: this.toUrlEncoded(dataToSend),
        mode: 'no-cors',
        keepalive: true
      })
        .then(() => finish(true, 'Dados enviados'))
        .catch(() => {
          const delay = mobile ? this.mobileFinishDelayMs : 1200;
          if (!this.submitViaDomForm(dataToSend, finish, delay)) {
            finish(false, 'Erro ao enviar formulário');
          }
        });
    });
  }

  isMobileDevice(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }
    const ua = navigator.userAgent || '';
    return (
      /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
    );
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

  private trySendBeacon(
    data: DiagnosticoData,
    finish?: (success: boolean, message?: string) => void
  ): boolean {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      return false;
    }
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value != null && String(value).length > 0) {
          formData.append(key, String(value));
        }
      });
      const ok = navigator.sendBeacon(this.webAppUrl, formData);
      if (ok && finish) {
        finish(true, 'Dados salvos com sucesso');
      }
      return ok;
    } catch (e) {
      console.warn('sendBeacon falhou:', e);
      return false;
    }
  }

  /**
   * Usa #google-sheets-form e #google-sheets-iframe no HTML (obrigatório no mobile).
   */
  private submitViaDomForm(
    data: DiagnosticoData,
    finish: (success: boolean, message?: string) => void,
    delayMs: number
  ): boolean {
    try {
      const iframe = this.ensureIframe();
      const form = this.ensureForm(iframe.name);

      form.action = this.webAppUrl;
      form.method = 'POST';
      form.target = iframe.name;
      form.enctype = 'application/x-www-form-urlencoded';

      while (form.firstChild) {
        form.removeChild(form.firstChild);
      }

      Object.entries(data).forEach(([key, value]) => {
        if (value == null || String(value).length === 0) {
          return;
        }
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      setTimeout(() => {
        try {
          form.submit();
        } catch (e) {
          console.error('form.submit falhou:', e);
          finish(false, 'Erro ao enviar formulário');
          return;
        }
        setTimeout(() => finish(true, 'Dados enviados via formulário'), delayMs);
      }, 50);

      return true;
    } catch (e) {
      console.error('Erro ao enviar para Google Sheets:', e);
      return false;
    }
  }

  private ensureIframe(): HTMLIFrameElement {
    const id = 'google-sheets-iframe';
    let iframe = document.getElementById(id) as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = id;
      iframe.name = id;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;visibility:hidden;';
      document.body.appendChild(iframe);
    }
    return iframe;
  }

  private ensureForm(iframeName: string): HTMLFormElement {
    const id = 'google-sheets-form';
    let form = document.getElementById(id) as HTMLFormElement | null;
    if (!form) {
      form = document.createElement('form');
      form.id = id;
      form.setAttribute('aria-hidden', 'true');
      form.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;visibility:hidden;';
      document.body.appendChild(form);
    }
    form.target = iframeName;
    return form;
  }
}
