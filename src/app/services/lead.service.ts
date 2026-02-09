import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface LeadData {
  nome: string;
  email: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  timestamp?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LeadService {
  private readonly apiUrl = 'https://app.heysheet.in/api/s/QvNKqDMGOJ';

  constructor(private http: HttpClient) {}

  /**
   * Envia um lead para o HeySheet usando FormData
   * FormData é mais estável e funciona perfeitamente em mobile
   * @param data Dados do lead
   * @returns Observable com a resposta do servidor
   */
  enviarLead(data: LeadData): Observable<any> {
    // Adicionar timestamp automaticamente
    const leadData: LeadData = {
      ...data,
      timestamp: new Date().toISOString()
    };

    console.log('Enviando lead para HeySheet:', leadData);

    // Usar FormData - mais estável e funciona em qualquer browser (especialmente mobile)
    const formData = new FormData();
    
    // Adicionar apenas campos que têm valor (evita enviar undefined/null)
    Object.keys(leadData).forEach(key => {
      const value = leadData[key as keyof LeadData];
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    });

    // Não precisa definir Content-Type - o browser define automaticamente como multipart/form-data
    return this.http.post(this.apiUrl, formData).pipe(
      catchError(error => {
        console.error('Erro ao enviar lead:', error);
        
        // Tratar diferentes tipos de erro
        let errorMessage = 'Erro ao enviar formulário. Por favor, tente novamente.';
        
        if (error.status === 0) {
          errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else if (error.status >= 400 && error.status < 500) {
          errorMessage = 'Dados inválidos. Verifique os campos e tente novamente.';
        } else if (error.status >= 500) {
          errorMessage = 'Erro no servidor. Tente novamente em alguns instantes.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        return throwError(() => new Error(errorMessage));
      })
    );
  }
}
