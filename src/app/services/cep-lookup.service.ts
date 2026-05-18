import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { formatEnderecoFromCepParts } from '../utils/format-endereco-cep';

export interface CepLookupResult {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  enderecoFormatado: string;
}

interface BrasilApiCepResponse {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CepLookupService {
  constructor(private readonly http: HttpClient) {}

  consultar(cep: string): Observable<CepLookupResult | null> {
    const digits = (cep || '').replace(/\D/g, '');
    if (digits.length !== 8) {
      return of(null);
    }
    return this.http
      .get<BrasilApiCepResponse>(`https://brasilapi.com.br/api/cep/v1/${digits}`)
      .pipe(
        map((d) => this.fromBrasilApi(d, digits)),
        catchError(() => this.consultarViaCep(digits))
      );
  }

  private consultarViaCep(digits: string): Observable<CepLookupResult | null> {
    return this.http.get<ViaCepResponse>(`https://viacep.com.br/ws/${digits}/json/`).pipe(
      map((d) => (d?.erro ? null : this.fromViaCep(d, digits))),
      catchError(() => of(null))
    );
  }

  private fromBrasilApi(d: BrasilApiCepResponse, digits: string): CepLookupResult | null {
    const cidade = (d.city || '').trim();
    const uf = (d.state || '').trim();
    if (!cidade && !uf) {
      return null;
    }
    const logradouro = (d.street || '').trim();
    const bairro = (d.neighborhood || '').trim();
    return {
      cep: digits,
      logradouro,
      bairro,
      cidade,
      uf,
      enderecoFormatado: formatEnderecoFromCepParts(logradouro, bairro, cidade, uf)
    };
  }

  private fromViaCep(d: ViaCepResponse, digits: string): CepLookupResult | null {
    const cidade = (d.localidade || '').trim();
    const uf = (d.uf || '').trim();
    if (!cidade && !uf) {
      return null;
    }
    const logradouro = (d.logradouro || '').trim();
    const bairro = (d.bairro || '').trim();
    return {
      cep: digits,
      logradouro,
      bairro,
      cidade,
      uf,
      enderecoFormatado: formatEnderecoFromCepParts(logradouro, bairro, cidade, uf)
    };
  }
}
