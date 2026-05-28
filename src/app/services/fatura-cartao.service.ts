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

export type StatusClassificacao = 'pendente' | 'sugerida' | 'classificada';

export interface LancamentoImportado {
  id: number;
  idMovimentacao?: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  categoria: string;
  confianca: NivelConfianca;
  statusClassificacao?: StatusClassificacao;
  precisaRevisao?: boolean;
  origemSugestao?: string;
  cartaoId?: number;
  cartaoNome?: string;
  contaBancariaId?: string | number;
  contaBancariaNome?: string;
  /** UI: seleção na conciliação pré-importação */
  selecionado?: boolean;
  salvarRegra?: boolean;
  textoRegra?: string;
}

export interface PreviewImportacaoResponse {
  mensagem: string;
  lancamentos: LancamentoImportado[];
  pendentesRevisao?: number;
  modo?: 'preview' | 'confirmado';
}

export interface ContaPagarGerada {
  id: number | string;
  idMovimentacao?: string;
  competencia: string;
  vencimento: string;
  descricao: string;
  valor: number;
  status: 'pendente' | 'pago' | string;
  cartaoId?: number;
  cartaoNome?: string;
}

export interface CartaoCreditoCadastro {
  id: number;
  nome: string;
  bandeira?: string | null;
  finalCartao?: string | null;
  limite?: number | null;
  diaFechamento?: number | null;
  diaVencimento?: number | null;
  contaReferencia?: string | null;
  ativo?: boolean;
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

  previewImportacao(csvContent: string, cartaoId?: number): Observable<PreviewImportacaoResponse> {
    return this.http.post<PreviewImportacaoResponse>(
      `${this.apiUrl}/preview-importacao`,
      { csvContent, cartaoId },
      { headers: this.getHeaders() }
    );
  }

  /** @deprecated Use previewImportacao + confirmarImportacao */
  importarCsv(csvContent: string, cartaoId?: number): Observable<PreviewImportacaoResponse> {
    return this.previewImportacao(csvContent, cartaoId);
  }

  confirmarImportacao(
    cartaoId: number,
    lancamentos: LancamentoImportado[]
  ): Observable<PreviewImportacaoResponse> {
    return this.http.post<PreviewImportacaoResponse>(
      `${this.apiUrl}/confirmar-importacao`,
      { cartaoId, lancamentos },
      { headers: this.getHeaders() }
    );
  }

  gerarContasPagar(
    cartaoId: number,
    nomeCartao: string,
    lancamentos: LancamentoImportado[]
  ): Observable<{ mensagem: string; contasPagar: ContaPagarGerada[] }> {
    return this.http.post<{ mensagem: string; contasPagar: ContaPagarGerada[] }>(
      `${this.apiUrl}/gerar-contas-pagar`,
      { cartaoId, nomeCartao, lancamentos },
      { headers: this.getHeaders() }
    );
  }

  listarImportadosRecentes(cartaoId?: number | null): Observable<{
    lancamentos: LancamentoImportado[];
    contasPagar: ContaPagarGerada[];
  }> {
    let params = new HttpParams();
    if (cartaoId != null) {
      params = params.set('cartaoId', String(cartaoId));
    }
    return this.http.get<{ lancamentos: LancamentoImportado[]; contasPagar: ContaPagarGerada[] }>(
      `${this.apiUrl}/importados-recentes`,
      {
        headers: this.getHeaders(),
        params,
      }
    );
  }

  listarCadastros(idsEmpresa?: number): Observable<{ itens: CartaoCreditoCadastro[] }> {
    let params = new HttpParams();
    if (idsEmpresa) params = params.set('idsEmpresa', String(idsEmpresa));
    return this.http.get<{ itens: CartaoCreditoCadastro[] }>(`${this.apiUrl}/cadastros`, {
      headers: this.getHeaders(),
      params,
    });
  }

  criarCadastro(payload: Partial<CartaoCreditoCadastro>): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cadastros`, payload, { headers: this.getHeaders() });
  }

  atualizarCadastro(id: number, payload: Partial<CartaoCreditoCadastro>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/cadastros/${id}`, payload, { headers: this.getHeaders() });
  }

  removerCadastro(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/cadastros/${id}`, { headers: this.getHeaders() });
  }
}

