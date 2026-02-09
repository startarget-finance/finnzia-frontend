import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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
  private readonly apiUrl = 'https://api.sheetmonkey.io/form/aZAYW6Fa1rjgp48GALxmGM';

  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  constructor(private http: HttpClient) {}

  /**
   * Envia um lead para o SheetMonkey
   * @param data Dados do lead
   * @returns Observable com a resposta do servidor
   */
  enviarLead(data: LeadData): Observable<any> {
    // Adicionar timestamp automaticamente
    const leadData: LeadData = {
      ...data,
      timestamp: new Date().toISOString()
    };

    console.log('Enviando lead para SheetMonkey:', leadData);

    // SheetMonkey pode retornar HTML/texto, não JSON
    // Usar observe: 'response' para verificar status HTTP independente do formato
    const options = {
      headers: this.httpOptions.headers,
      observe: 'response' as const,
      responseType: 'text' as const
    };

    return this.http.post(this.apiUrl, leadData, options).pipe(
      map((response: HttpResponse<string>) => {
        // Se o status for 200-299, considerar sucesso
        // SheetMonkey retorna HTML/texto, não JSON, então qualquer resposta 200 é sucesso
        if (response.status >= 200 && response.status < 300) {
          console.log('Lead enviado com sucesso. Status:', response.status);
          return { success: true, status: response.status };
        }
        throw new Error(`Erro ao enviar: Status ${response.status}`);
      }),
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
