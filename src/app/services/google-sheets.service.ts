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
   * Usa múltiplos métodos para garantir funcionamento no mobile
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

    console.log('Salvando diagnóstico no Google Sheets:', dataToSend);

    return new Observable(observer => {
      const state = { successReported: false };

      // MÉTODO 1: navigator.sendBeacon (MAIS CONFIÁVEL NO MOBILE)
      // Funciona mesmo quando a página está sendo fechada e não tem problemas de CORS
      if (navigator.sendBeacon) {
        try {
          // Construir URL-encoded string manualmente (sendBeacon precisa de string ou Blob)
          const params = new URLSearchParams();
          Object.keys(dataToSend).forEach(key => {
            const value = dataToSend[key as keyof typeof dataToSend];
            if (value) {
              params.append(key, String(value));
            }
          });

          // Criar Blob com dados URL-encoded
          const blob = new Blob([params.toString()], { 
            type: 'application/x-www-form-urlencoded' 
          });
          
          const success = navigator.sendBeacon(this.webAppUrl, blob);
          
          if (success) {
            console.log('✓ Dados enviados via navigator.sendBeacon');
            state.successReported = true;
            observer.next({ success: true, message: 'Dados salvos com sucesso' });
            observer.complete();
            return;
          } else {
            console.warn('navigator.sendBeacon retornou false, tentando método alternativo...');
          }
        } catch (beaconError) {
          console.warn('Erro ao usar navigator.sendBeacon:', beaconError);
        }
      }

      // MÉTODO 2: FormData com fetch (tenta no-cors)
      if (!state.successReported) {
        try {
          const params = new URLSearchParams();
          Object.keys(dataToSend).forEach(key => {
            const value = dataToSend[key as keyof typeof dataToSend];
            if (value) {
              params.append(key, String(value));
            }
          });

          // Tentar fetch com no-cors (pode funcionar em alguns casos)
          fetch(this.webAppUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            mode: 'no-cors',
            keepalive: true // Importante para mobile
          }).then(() => {
            if (!state.successReported) {
              console.log('✓ Dados enviados via fetch (no-cors)');
              state.successReported = true;
              observer.next({ success: true, message: 'Dados salvos com sucesso' });
              observer.complete();
            }
          }).catch((fetchError) => {
            console.warn('Fetch falhou, tentando formulário:', fetchError);
            if (!state.successReported) {
              this.tryFormMethod(dataToSend, observer, state);
            }
          });
        } catch (fetchError) {
          console.warn('Erro ao tentar fetch:', fetchError);
          if (!state.successReported) {
            this.tryFormMethod(dataToSend, observer, state);
          }
        }
      }

      // Timeout de segurança
      setTimeout(() => {
        if (!state.successReported) {
          console.warn('Timeout: tentando método de formulário como último recurso');
          this.tryFormMethod(dataToSend, observer, state);
        }
      }, 500);
    });
  }

  /**
   * Método alternativo usando formulário (fallback)
   */
  private tryFormMethod(
    dataToSend: any,
    observer: any,
    state: { successReported: boolean }
  ): void {
    if (state.successReported) {
      return; // Já foi enviado com sucesso
    }

    try {
      // Criar iframe oculto
      const iframeId = 'google-sheets-iframe-' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.id = iframeId;
      iframe.name = iframeId;
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;opacity:0;visibility:hidden;';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      // Criar formulário POST
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = this.webAppUrl;
      form.target = iframeId;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;visibility:hidden;';
      form.setAttribute('aria-hidden', 'true');

      // Adicionar campos
      Object.keys(dataToSend).forEach(key => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(dataToSend[key] || '');
        form.appendChild(input);
      });

      document.body.appendChild(form);

      // Submeter
      setTimeout(() => {
        try {
          form.submit();
          console.log('✓ Formulário POST submetido (fallback)');
          
          setTimeout(() => {
            if (!state.successReported) {
              state.successReported = true;
              observer.next({ success: true, message: 'Dados salvos com sucesso' });
              observer.complete();
            }
            this.cleanup(form, null, iframe);
          }, 1500);
        } catch (e) {
          console.error('Erro ao submeter formulário:', e);
          this.cleanup(form, null, iframe);
          if (!state.successReported) {
            state.successReported = true;
            observer.next({ success: false, message: 'Erro ao enviar formulário' });
            observer.complete();
          }
        }
      }, 200);

    } catch (error) {
      console.error('Erro no método de formulário:', error);
      if (!state.successReported) {
        state.successReported = true;
        observer.next({ success: false, message: 'Erro ao criar formulário' });
        observer.complete();
      }
    }
  }

  /**
   * Limpa elementos do DOM após envio
   */
  private cleanup(form: HTMLFormElement, img: HTMLImageElement | null, iframe?: HTMLIFrameElement): void {
    setTimeout(() => {
      try {
        if (form && form.parentNode) {
          document.body.removeChild(form);
        }
      } catch (e) {
        // Ignorar
      }
      if (img) {
        try {
          if (img.parentNode) {
            document.body.removeChild(img);
          }
        } catch (e) {
          // Ignorar
        }
      }
      if (iframe) {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        } catch (e) {
          // Ignorar
        }
      }
    }, 2000);
  }
}
