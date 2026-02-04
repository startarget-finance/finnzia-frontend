import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';

export interface MovimentacaoOmie {
  codigo_lancamento?: string;
  codigo_lancamento_omie?: number;
  codigo_lancamento_integracao?: string;
  codigo_cliente_fornecedor?: string | number;
  nome_cliente_fornecedor?: string;
  data_vencimento?: string;
  data_emissao?: string;
  data_pagamento?: string;
  data_previsao?: string;
  data_registro?: string;
  valor_documento?: number;
  valor_desconto?: number;
  valor_juros?: number;
  valor_multa?: number;
  valor_pago?: number;
  status?: string;
  status_titulo?: string; // Status do título do Omie (ATRASADO, VENCE HOJE, A VENCER, etc)
  observacao?: string;
  tipo?: string; // "DESPESA" ou "RECEITA"
  debito?: boolean; // true para despesa, false para receita
  numero_documento?: string;
  numero_parcela?: string;
  numero_pedido?: string;
  codigo_categoria?: string;
  descricao_categoria?: string;
  recebimentos?: any[]; // Array de recebimentos/baixas
  baixas?: any[]; // Array de baixas
  // Campos adicionais que podem vir do OMIE
  [key: string]: any;
}

export interface MovimentacoesOmieResponse {
  movimentacoes?: MovimentacaoOmie[];
  total?: number;
  total_contas_pagar?: number;
  total_contas_receber?: number;
  totalReceitas?: number; // Total de receitas de todas as movimentações
  totalDespesas?: number; // Total de despesas de todas as movimentações
  saldoLiquido?: number; // Saldo líquido (receitas - despesas)
  dataInicio?: string;
  dataFim?: string;
  endpointUsado?: string;
  mock?: boolean;
}

export interface ContasPagarResponse {
  tipo: string;
  total_de_registros: number;
  total_de_paginas?: number;
  pagina?: number;
  registros: MovimentacaoOmie[];
  mock?: boolean;
}

export interface ContasReceberResponse {
  tipo: string;
  total_de_registros: number;
  total_de_paginas?: number;
  pagina?: number;
  registros: MovimentacaoOmie[];
  mock?: boolean;
}

export interface FiltrosMovimentacoesOmie {
  dataInicio?: string;
  dataFim?: string;
  pagina?: number;
  registrosPorPagina?: number;
  tipo?: 'receita' | 'despesa'; // Filtro por tipo
  categoria?: string; // Filtro por categoria
  textoPesquisa?: string; // Filtro por texto (busca em nome, observação, etc)
}

@Injectable({
  providedIn: 'root'
})
export class OmieService {
  private apiUrl = `${API_CONFIG.BACKEND_API_URL}/api/omie`

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Testa a conexão com a API do OMIE
   */
  testarConexao(): Observable<any> {
    return this.http.get(`${this.apiUrl}/testar`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Lista empresas do OMIE
   */
  listarEmpresas(): Observable<any> {
    return this.http.get(`${this.apiUrl}/empresas`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Lista contas a pagar do OMIE
   */
  listarContasPagar(filtros: FiltrosMovimentacoesOmie = {}): Observable<ContasPagarResponse> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataFim) {
      params = params.set('dataFim', filtros.dataFim);
    }
    if (filtros.pagina) {
      params = params.set('pagina', filtros.pagina.toString());
    }
    if (filtros.registrosPorPagina) {
      params = params.set('registrosPorPagina', filtros.registrosPorPagina.toString());
    }

    return this.http.get<ContasPagarResponse>(`${this.apiUrl}/contas-pagar`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Lista contas a receber do OMIE
   */
  listarContasReceber(filtros: FiltrosMovimentacoesOmie = {}): Observable<ContasReceberResponse> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataFim) {
      params = params.set('dataFim', filtros.dataFim);
    }
    if (filtros.pagina) {
      params = params.set('pagina', filtros.pagina.toString());
    }
    if (filtros.registrosPorPagina) {
      params = params.set('registrosPorPagina', filtros.registrosPorPagina.toString());
    }

    return this.http.get<ContasReceberResponse>(`${this.apiUrl}/contas-receber`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Pesquisa movimentações financeiras do OMIE (combina contas a pagar e receber)
   */
  pesquisarMovimentacoes(filtros: FiltrosMovimentacoesOmie = {}): Observable<MovimentacoesOmieResponse> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataFim) {
      params = params.set('dataFim', filtros.dataFim);
    }
    if (filtros.pagina) {
      params = params.set('pagina', filtros.pagina.toString());
    }
    if (filtros.registrosPorPagina) {
      params = params.set('registrosPorPagina', filtros.registrosPorPagina.toString());
    }
    if (filtros.tipo) {
      params = params.set('tipo', filtros.tipo);
    }
    if (filtros.categoria) {
      params = params.set('categoria', filtros.categoria);
    }
    if (filtros.textoPesquisa) {
      params = params.set('textoPesquisa', filtros.textoPesquisa);
    }

    return this.http.get<MovimentacoesOmieResponse>(`${this.apiUrl}/movimentacoes`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Busca movimentações financeiras (alias para pesquisarMovimentacoes)
   */
  buscarMovimentacoes(filtros: FiltrosMovimentacoesOmie = {}): Observable<MovimentacoesOmieResponse> {
    return this.pesquisarMovimentacoes(filtros);
  }
}

