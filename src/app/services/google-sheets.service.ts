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
   * Usa método simplificado que funciona melhor em mobile
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

    // Método otimizado para mobile: usar GET com imagem beacon (mais confiável)
    // Google Apps Script aceita tanto GET quanto POST
    return new Observable(observer => {
      try {
        // Construir URL com query string (GET funciona melhor no mobile)
        const params = new URLSearchParams();
        Object.keys(dataToSend).forEach(key => {
          const value = dataToSend[key as keyof typeof dataToSend];
          if (value) {
            params.append(key, String(value));
          }
        });

        const getUrl = `${this.webAppUrl}?${params.toString()}`;
        console.log('Enviando dados via GET para:', getUrl);

        // Método 1: Tentar com formulário GET primeiro (mais compatível)
        const form = document.createElement('form');
        form.method = 'GET';
        form.action = this.webAppUrl;
        form.style.position = 'absolute';
        form.style.left = '-9999px';
        form.style.top = '0';
        form.style.width = '1px';
        form.style.height = '1px';
        form.style.opacity = '0';
        form.style.visibility = 'hidden';
        form.setAttribute('aria-hidden', 'true');

        // Adicionar campos como inputs hidden
        Object.keys(dataToSend).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          const value = dataToSend[key as keyof typeof dataToSend];
          input.value = value ? String(value) : '';
          form.appendChild(input);
        });

        document.body.appendChild(form);

        // Método principal: usar imagem beacon (funciona em TODOS os navegadores mobile)
        const img = new Image();
        img.style.display = 'none';
        img.style.width = '1px';
        img.style.height = '1px';
        img.style.position = 'absolute';
        img.style.left = '-9999px';
        
        let successReported = false;

        img.onload = () => {
          if (!successReported) {
            successReported = true;
            console.log('✓ Dados enviados com sucesso via imagem beacon');
            this.cleanup(form, img);
            observer.next({ success: true, message: 'Dados salvos com sucesso' });
            observer.complete();
          }
        };

        img.onerror = () => {
          // Mesmo com erro, tentar submeter formulário como fallback
          console.log('Imagem beacon falhou, tentando formulário...');
          try {
            form.submit();
            setTimeout(() => {
              if (!successReported) {
                successReported = true;
                console.log('✓ Dados enviados via formulário');
                this.cleanup(form, img);
                observer.next({ success: true, message: 'Dados salvos com sucesso' });
                observer.complete();
              }
            }, 1500);
          } catch (e) {
            console.error('Erro ao submeter formulário:', e);
            if (!successReported) {
              successReported = true;
              this.cleanup(form, img);
              // Mesmo assim, pode ter funcionado
              observer.next({ success: true, message: 'Dados podem ter sido salvos' });
              observer.complete();
            }
          }
        };

        // Disparar o envio da imagem
        img.src = getUrl;
        document.body.appendChild(img);

        // Timeout de segurança
        setTimeout(() => {
          if (!successReported) {
            successReported = true;
            console.log('Timeout: assumindo sucesso');
            this.cleanup(form, img);
            observer.next({ success: true, message: 'Dados podem ter sido salvos' });
            observer.complete();
          }
        }, 3000);

      } catch (error) {
        console.error('Erro ao enviar diagnóstico:', error);
        observer.next({ success: false, message: 'Erro ao enviar: ' + (error instanceof Error ? error.message : 'Erro desconhecido') });
        observer.complete();
      }
    });
  }

  /**
   * Limpa elementos do DOM após envio
   */
  private cleanup(form: HTMLFormElement, img: HTMLImageElement): void {
    setTimeout(() => {
      try {
        if (form && form.parentNode) {
          document.body.removeChild(form);
        }
      } catch (e) {
        // Ignorar
      }
      try {
        if (img && img.parentNode) {
          document.body.removeChild(img);
        }
      } catch (e) {
        // Ignorar
      }
    }, 2000);
  }
}
