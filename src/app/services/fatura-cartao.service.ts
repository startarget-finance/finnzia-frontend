import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';

export type StatusPonto = 'paga' | 'futura';
export type TipoTransacao = 'credito' | 'debito';
export type NivelConfianca = 'alta' | 'media' | 'baixa';

export interface PontoFatura {
  mes: string;
  valor: number;
  status: StatusPonto;
}

export interface CartaoResumo {
  id: number;
  nome: string;
  empresa: string;
  disponivel: number;
  limite: number;
  pontos: PontoFatura[];
  contaBancariaId?: string | number;
  contaBancariaNome?: string;
}

export interface LancamentoImportado {
  id: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  categoria: string;
  confianca: NivelConfianca;
  contaBancariaId?: string | number;
  contaBancariaNome?: string;
}

export interface ContaPagarGerada {
  id: number;
  competencia: string;
  vencimento: string;
  descricao: string;
  valor: number;
  status: 'prototipo';
}

@Injectable({
  providedIn: 'root',
})
export class FaturaCartaoService {
  private apiUrl = `${API_CONFIG.BACKEND_API_URL}/api/fatura-cartao`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  listarCartoes(idsEmpresa?: number): Observable<{ cartoes: CartaoResumo[] }> {
    let params = new HttpParams();
    if (idsEmpresa) params = params.set('idsEmpresa', String(idsEmpresa));

    return this.http.get<{ cartoes: CartaoResumo[] }>(`${this.apiUrl}/cartoes`, {
      headers: this.getHeaders(),
      params,
    });
  }

  importarCsv(csvContent: string): Observable<{ mensagem: string; lancamentos: LancamentoImportado[] }> {
    return this.http.post<{ mensagem: string; lancamentos: LancamentoImportado[] }>(
      `${this.apiUrl}/importar-csv`,
      { csvContent },
      { headers: this.getHeaders() }
    );
  }

  gerarContasPagar(
    nomeCartao: string,
    lancamentos: LancamentoImportado[]
  ): Observable<{ mensagem: string; contasPagar: ContaPagarGerada[] }> {
    return this.http.post<{ mensagem: string; contasPagar: ContaPagarGerada[] }>(
      `${this.apiUrl}/gerar-contas-pagar`,
      { nomeCartao, lancamentos },
      { headers: this.getHeaders() }
    );
  }
}

