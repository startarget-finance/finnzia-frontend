import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';

export interface MovimentacaoFinanceira {
  IdMovimentacaoFinanceiraParcela: string;
  Debito: boolean;
  DataVencimento: string;
  DataCompetencia: string;
  DataQuitacao?: string;
  DataConciliacao?: string;
  Valor: number;
  FormaPagamento: number;
  NomeFormaPagamento: string;
  TipoMovimentacao: number;
  NomeTipoMovimentacao: string;
  Nome: string;
  Observacao?: string;
  NumeroParcela?: number;
  QuantidadeParcela?: number;
  IdCategoriaFinanceira: number;
  NomeCategoriaFinanceira: string;
  IdContaFinanceira: number;
  NomeContaFinanceira: string;
  IdEmpresa: number;
  NomeEmpresa: string;
  IdCliente?: number;
  IdFornecedor?: number;
  NomeClienteFornecedor?: string;
  NomeFantasiaClienteFornecedor?: string;
  RazaoSocialClienteFornecedor?: string;
  CodigoClienteFornecedor?: string | number;
  Valores?: Array<{
    Despesa: boolean;
    Categoria: string;
    NomeCategoriaRoot: string;
    CentroCusto?: string;
    Valor: number;
  }>;
}

export interface MovimentacoesResponse {
  movimentacoes: MovimentacaoFinanceira[];
  total: number;
  totalReceitas?: number; // Total de receitas de todas as movimentações
  totalDespesas?: number; // Total de despesas de todas as movimentações
  saldoLiquido?: number; // Saldo líquido (receitas - despesas)
  dataInicio?: string;
  dataTermino?: string;
  tipoData?: string;
  endpointUsado: string;
  paginacao: {
    itensPorPagina: number;
    numeroDaPagina: number;
    totalItens: number;
  };
  idsMovimentacaoFinanceiraParcela?: string[];
}

export interface DFCResponse {
  dfc: Array<{
    tipo: string;
    nome: string;
    nivel: number;
    valor: number;
    valoresMensais?: number[]; // Valores por mês
    porcentagensMensais?: number[]; // Porcentagens por mês
  }>;
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
  dataInicio?: string;
  dataTermino?: string;
  totalMovimentacoes: number;
  meses?: string[]; // Lista de meses no formato "MMM/yy"
  totalMovimentacoesColetadas?: number;
  totalMovimentacoesDisponiveis?: number;
  usandoCache?: boolean;
  tempoDecorrido?: number;
  rateLimitAtingido?: boolean;
  timeoutOcorrido?: boolean;
  aviso?: string;
}

export interface FiltrosMovimentacoes {
  dataInicio?: string;
  dataTermino?: string;
  tipoData?: 'DataCriacao' | 'DataVencimento' | 'DataCompetencia';
  idsEmpresa?: number;
  idsCliente?: number;
  idsFornecedor?: number;
  textoPesquisa?: string;
  categoria?: string;
  tipo?: 'receita' | 'despesa';
  itensPorPagina?: number;
  numeroDaPagina?: number;
}

@Injectable({
  providedIn: 'root'
})
export class BomControleService {
  private apiUrl = `${API_CONFIG.BACKEND_API_URL}/api/bomcontrole`;

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
   * Busca movimentações financeiras com filtros e paginação
   */
  buscarMovimentacoes(filtros: FiltrosMovimentacoes = {}): Observable<MovimentacoesResponse> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataTermino) {
      params = params.set('dataTermino', filtros.dataTermino);
    }
    if (filtros.tipoData) {
      params = params.set('tipoData', filtros.tipoData);
    }
    if (filtros.categoria) {
      params = params.set('categoria', filtros.categoria);
    }
    if (filtros.tipo) {
      params = params.set('tipo', filtros.tipo);
    }
    if (filtros.textoPesquisa) {
      params = params.set('textoPesquisa', filtros.textoPesquisa);
    }
    if (filtros.itensPorPagina) {
      params = params.set('itensPorPagina', filtros.itensPorPagina.toString());
    }
    if (filtros.numeroDaPagina) {
      params = params.set('numeroDaPagina', filtros.numeroDaPagina.toString());
    }

    return this.http.get<MovimentacoesResponse>(`${this.apiUrl}/movimentacoes`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Pesquisa movimentações com filtros avançados
   */
  pesquisarMovimentacoes(filtros: FiltrosMovimentacoes = {}): Observable<MovimentacoesResponse> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataTermino) {
      params = params.set('dataTermino', filtros.dataTermino);
    }
    if (filtros.tipoData) {
      params = params.set('tipoData', filtros.tipoData);
    }
    if (filtros.idsEmpresa) {
      params = params.set('idsEmpresa', filtros.idsEmpresa.toString());
    }
    if (filtros.idsCliente) {
      params = params.set('idsCliente', filtros.idsCliente.toString());
    }
    if (filtros.idsFornecedor) {
      params = params.set('idsFornecedor', filtros.idsFornecedor.toString());
    }
    if (filtros.textoPesquisa) {
      params = params.set('textoPesquisa', filtros.textoPesquisa);
    }
    if (filtros.itensPorPagina) {
      params = params.set('itensPorPagina', filtros.itensPorPagina.toString());
    }
    if (filtros.numeroDaPagina) {
      params = params.set('numeroDaPagina', filtros.numeroDaPagina.toString());
    }

    return this.http.get<MovimentacoesResponse>(`${this.apiUrl}/movimentacoes/pesquisar`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Gera DFC (Demonstrativo de Fluxo de Caixa)
   * @param usarCache Se true, usa cache local (padrão: true)
   * @param forcarAtualizacao Se true, força busca na API mesmo com cache (padrão: false)
   */
  gerarDFC(
    dataInicio: string, 
    dataTermino: string, 
    usarCache: boolean = true, 
    forcarAtualizacao: boolean = false
  ): Observable<DFCResponse> {
    let params = new HttpParams()
      .set('dataInicio', dataInicio)
      .set('dataTermino', dataTermino)
      .set('usarCache', usarCache.toString())
      .set('forcarAtualizacao', forcarAtualizacao.toString());

    return this.http.get<DFCResponse>(`${this.apiUrl}/dfc`, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Sincroniza movimentações de um período específico
   */
  sincronizarPeriodo(
    dataInicio?: string, 
    dataTermino?: string, 
    idEmpresa: number = 6
  ): Observable<any> {
    let params = new HttpParams().set('idEmpresa', idEmpresa.toString());
    if (dataInicio) {
      params = params.set('dataInicio', dataInicio);
    }
    if (dataTermino) {
      params = params.set('dataTermino', dataTermino);
    }

    return this.http.post(`${this.apiUrl}/sync/periodo`, null, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Sincronização incremental - busca apenas movimentações modificadas
   */
  sincronizarIncremental(idEmpresa: number = 6): Observable<any> {
    const params = new HttpParams().set('idEmpresa', idEmpresa.toString());

    return this.http.post(`${this.apiUrl}/sync/incremental`, null, {
      headers: this.getHeaders(),
      params
    });
  }

  /**
   * Status do cache - informações sobre movimentações armazenadas
   */
  statusCache(): Observable<any> {
    return this.http.get(`${this.apiUrl}/cache/status`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Exporta movimentações para Excel
   */
  exportarExcel(filtros: FiltrosMovimentacoes = {}): Observable<Blob> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataTermino) {
      params = params.set('dataTermino', filtros.dataTermino);
    }
    if (filtros.tipoData) {
      params = params.set('tipoData', filtros.tipoData);
    }
    if (filtros.idsEmpresa) {
      params = params.set('idsEmpresa', filtros.idsEmpresa.toString());
    }
    if (filtros.idsCliente) {
      params = params.set('idsCliente', filtros.idsCliente.toString());
    }
    if (filtros.idsFornecedor) {
      params = params.set('idsFornecedor', filtros.idsFornecedor.toString());
    }
    if (filtros.textoPesquisa) {
      params = params.set('textoPesquisa', filtros.textoPesquisa);
    }

    return this.http.get(`${this.apiUrl}/movimentacoes/exportar/excel`, {
      headers: this.getHeaders(),
      params,
      responseType: 'blob'
    });
  }

  /**
   * Exporta movimentações para PDF
   */
  exportarPDF(filtros: FiltrosMovimentacoes = {}): Observable<Blob> {
    let params = new HttpParams();
    
    if (filtros.dataInicio) {
      params = params.set('dataInicio', filtros.dataInicio);
    }
    if (filtros.dataTermino) {
      params = params.set('dataTermino', filtros.dataTermino);
    }
    if (filtros.tipoData) {
      params = params.set('tipoData', filtros.tipoData);
    }
    if (filtros.idsEmpresa) {
      params = params.set('idsEmpresa', filtros.idsEmpresa.toString());
    }
    if (filtros.idsCliente) {
      params = params.set('idsCliente', filtros.idsCliente.toString());
    }
    if (filtros.idsFornecedor) {
      params = params.set('idsFornecedor', filtros.idsFornecedor.toString());
    }
    if (filtros.textoPesquisa) {
      params = params.set('textoPesquisa', filtros.textoPesquisa);
    }

    return this.http.get(`${this.apiUrl}/movimentacoes/exportar/pdf`, {
      headers: this.getHeaders(),
      params,
      responseType: 'blob'
    });
  }

  /**
   * Lista empresas do Bom Controle
   */
  listarEmpresas(pesquisa?: string): Observable<any> {
    let params = new HttpParams();
    if (pesquisa) {
      params = params.set('pesquisa', pesquisa);
    }

    return this.http.get(`${this.apiUrl}/empresas`, {
      headers: this.getHeaders(),
      params
    });
  }
}

