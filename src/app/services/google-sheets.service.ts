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

    // Usar formulário oculto com iframe para contornar CORS sem redirecionar
    // Método melhorado para funcionar em mobile
    return new Observable(observer => {
      try {
        console.log('Salvando diagnóstico no Google Sheets:', dataToSend);

        // Criar iframe oculto para receber a resposta
        const iframeId = 'hidden-iframe-' + Date.now();
        const iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.name = iframeId;
        iframe.style.position = 'fixed';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        
        // Adicionar iframe ao body ANTES do formulário
        document.body.appendChild(iframe);

        // Aguardar o iframe estar pronto (especialmente importante no mobile)
        const waitForIframe = (callback: () => void, maxAttempts = 10, attempt = 0) => {
          const iframeElement = document.getElementById(iframeId) as HTMLIFrameElement;
          if (iframeElement && (iframeElement.contentWindow || attempt >= maxAttempts)) {
            callback();
          } else {
            setTimeout(() => waitForIframe(callback, maxAttempts, attempt + 1), 50);
          }
        };

        waitForIframe(() => {
          try {
            // Criar formulário oculto que envia para o iframe
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = this.webAppUrl;
            form.target = iframeId; // Envia para o iframe, não abre nova aba
            form.enctype = 'application/x-www-form-urlencoded'; // Encoding correto para Google Apps Script
            form.style.position = 'fixed';
            form.style.top = '-9999px';
            form.style.left = '-9999px';
            form.style.display = 'none';

            // Adicionar todos os campos como inputs hidden
            Object.keys(dataToSend).forEach(key => {
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = key;
              const value = dataToSend[key as keyof typeof dataToSend];
              input.value = value ? String(value) : '';
              form.appendChild(input);
              console.log(`Campo adicionado: ${key} = ${input.value}`);
            });

            // Adicionar formulário ao body
            document.body.appendChild(form);
            console.log('Enviando formulário para:', this.webAppUrl);

            // Forçar o submit de forma mais robusta para mobile
            // Usar múltiplas tentativas para garantir que funcione
            const submitForm = () => {
              try {
                // Método 1: Submit direto (funciona na maioria dos casos)
                if (form.requestSubmit) {
                  // Método moderno (se disponível)
                  form.requestSubmit();
                } else {
                  // Método tradicional
                  form.submit();
                }
                console.log('Formulário submetido com sucesso');
              } catch (submitError) {
                console.warn('Erro no submit direto, tentando método alternativo:', submitError);
                // Método alternativo: criar um botão submit e clicar
                try {
                  const submitButton = document.createElement('button');
                  submitButton.type = 'submit';
                  submitButton.style.position = 'fixed';
                  submitButton.style.top = '-9999px';
                  submitButton.style.left = '-9999px';
                  submitButton.style.opacity = '0';
                  submitButton.style.pointerEvents = 'none';
                  form.appendChild(submitButton);
                  
                  // Usar setTimeout para garantir que o botão foi adicionado
                  setTimeout(() => {
                    submitButton.click();
                    console.log('Submit via botão clicado');
                  }, 50);
                } catch (buttonError) {
                  console.error('Erro ao usar botão submit:', buttonError);
                  // Última tentativa: criar evento submit e disparar
                  try {
                    const submitEvent = document.createEvent('Event');
                    submitEvent.initEvent('submit', true, true);
                    form.dispatchEvent(submitEvent);
                    console.log('Submit via evento disparado');
                  } catch (eventError) {
                    console.error('Erro ao disparar evento submit:', eventError);
                  }
                }
              }
            };

            // Aguardar um frame para garantir que tudo está no DOM
            requestAnimationFrame(() => {
              setTimeout(submitForm, 50);
            });

            // Limpar após enviar (com delay maior para mobile)
            setTimeout(() => {
              try {
                if (form.parentNode) {
                  document.body.removeChild(form);
                }
              } catch (e) {
                console.warn('Erro ao remover formulário:', e);
              }
            }, 3000);

            // Limpar iframe após mais tempo
            setTimeout(() => {
              try {
                const iframeElement = document.getElementById(iframeId);
                if (iframeElement && iframeElement.parentNode) {
                  document.body.removeChild(iframeElement);
                }
              } catch (e) {
                console.warn('Erro ao remover iframe:', e);
              }
            }, 5000);

            // Assumir sucesso (formulário HTML não tem problema de CORS)
            // Delay maior para mobile garantir que o envio foi processado
            setTimeout(() => {
              observer.next({ success: true, message: 'Dados salvos com sucesso' });
              observer.complete();
            }, 1000);

          } catch (formError) {
            console.error('Erro ao criar/enviar formulário:', formError);
            // Limpar iframe em caso de erro
            try {
              const iframeElement = document.getElementById(iframeId);
              if (iframeElement && iframeElement.parentNode) {
                document.body.removeChild(iframeElement);
              }
            } catch (e) {
              // Ignorar erro de limpeza
            }
            observer.next({ success: false, message: 'Erro ao criar formulário' });
            observer.complete();
          }
        }); // Aguardar iframe estar pronto

      } catch (error) {
        console.error('Erro ao salvar no Google Sheets:', error);
        observer.next({ success: false, message: 'Erro ao salvar diagnóstico: ' + (error instanceof Error ? error.message : 'Erro desconhecido') });
        observer.complete();
      }
    });

  }
}
