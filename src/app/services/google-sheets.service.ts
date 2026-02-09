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

    // Método otimizado para mobile: usar POST com formulário simples
    // Google Apps Script precisa de doPost() para receber POST
    return new Observable(observer => {
      try {
        // Criar iframe oculto para receber a resposta (evita abrir nova aba)
        const iframeId = 'google-sheets-iframe-' + Date.now();
        const iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.name = iframeId;
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.visibility = 'hidden';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);

        // Criar formulário POST (Google Apps Script espera doPost)
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = this.webAppUrl;
        form.target = iframeId; // Envia para o iframe, não abre nova aba
        form.enctype = 'application/x-www-form-urlencoded';
        form.style.position = 'fixed';
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
          console.log(`Campo adicionado: ${key} = ${input.value}`);
        });

        document.body.appendChild(form);
        console.log('Formulário POST criado, enviando para:', this.webAppUrl);

        // Submeter o formulário após garantir que está no DOM
        const submitForm = () => {
          try {
            // Tentar submit direto
            form.submit();
            console.log('✓ Formulário POST submetido');
            
            // Limpar formulário e iframe após delay
            setTimeout(() => {
              this.cleanup(form, null, iframe);
            }, 2000);

            // Assumir sucesso (POST não retorna resposta devido a CORS)
            setTimeout(() => {
              observer.next({ success: true, message: 'Dados salvos com sucesso' });
              observer.complete();
            }, 1500);

          } catch (submitError) {
            console.error('Erro ao submeter formulário POST:', submitError);
            
            // Tentar método alternativo: criar botão submit
            try {
              const submitButton = document.createElement('button');
              submitButton.type = 'submit';
              submitButton.style.display = 'none';
              form.appendChild(submitButton);
              
              setTimeout(() => {
                submitButton.click();
                console.log('✓ Formulário POST submetido via botão');
                
                setTimeout(() => {
                  this.cleanup(form, null, iframe);
                  observer.next({ success: true, message: 'Dados salvos com sucesso' });
                  observer.complete();
                }, 1500);
              }, 100);
            } catch (buttonError) {
              console.error('Erro ao usar botão submit:', buttonError);
              this.cleanup(form, null, iframe);
              observer.next({ success: false, message: 'Erro ao enviar formulário' });
              observer.complete();
            }
          }
        };

        // Aguardar um pouco para garantir que o formulário está no DOM
        // Isso é especialmente importante no mobile
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            setTimeout(submitForm, 150);
          });
        } else {
          setTimeout(submitForm, 300);
        }

      } catch (error) {
        console.error('Erro ao criar formulário:', error);
        observer.next({ success: false, message: 'Erro ao criar formulário: ' + (error instanceof Error ? error.message : 'Erro desconhecido') });
        observer.complete();
      }
    });
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
