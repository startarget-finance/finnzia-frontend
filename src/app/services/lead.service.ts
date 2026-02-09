import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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

    return this.http.post(this.apiUrl, leadData, this.httpOptions).pipe(
      catchError(error => {
        console.error('Erro ao enviar lead:', error);
        return throwError(() => new Error(
          error.error?.message || 
          error.message || 
          'Erro ao enviar formulário. Por favor, tente novamente.'
        ));
      })
    );
  }
}
