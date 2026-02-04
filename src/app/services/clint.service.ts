import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface ClintContactRequest {
  name: string;
  ddi?: string;
  phone?: string;
  email: string;
  username?: string;
  fields?: {
    [key: string]: any;
  };
}

export interface ClintContactResponse {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class ClintService {
  // Endpoint do backend que faz proxy para o webhook da Clint
  // Isso resolve o problema de CORS, pois o backend faz a requisição
  private readonly backendUrl = `${API_CONFIG.BACKEND_API_URL}/api/clint/webhook`;

  constructor(private http: HttpClient) {}

  /**
   * Envia dados do formulário para a Clint via backend
   * O backend faz o proxy para o webhook da Clint, resolvendo problemas de CORS
   */
  createContact(contact: ClintContactRequest): Observable<ClintContactResponse> {
    console.log('Enviando formulário...', contact);
    console.log('Enviando para endpoint do backend:', this.backendUrl);

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // Chama o endpoint do backend que faz proxy para o webhook da Clint
    // Isso resolve o problema de CORS, pois o backend faz a requisição HTTP
    return this.http.post<ClintContactResponse>(this.backendUrl, contact, { headers });
  }
}
