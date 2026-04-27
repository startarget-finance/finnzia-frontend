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
  totalReceitas?: number;
  totalDespesas?: number;
  saldoLiquido?: number;
  dataInicio?: string;
  dataTermino?: string;
  tipoData?: string;
  endpointUsado: string;
  paginacao: {
    itensPorPagina: number;
    numeroDaPagina: number;
    totalItens: number;
  };
}

export interface BlocoResumoFinanceiro {
  totalGeral: number;
  totalLiquidado: number;
  totalPendente: number;
  totalContas: number;
  contasPendentes: number;
}

export interface ResumoFinanceiroResponse {
  periodo: {
    dataInicio: string;
    dataTermino: string;
  };
  contasReceber: BlocoResumoFinanceiro;
  contasPagar: BlocoResumoFinanceiro;
  saldoDisponivel: number;
  saldoProjetado: number;
  totalMovimentacoes: number;
  usandoCache: boolean;
  fonteDados: string;
  atualizadoEm: string;

  // KPIs opcionais (preenchidos somente se o backend calcular)
  mediaNovosContratosReais3m?: number | null;
  mediaNovosContratosUnidades3m?: number | null;
  custoFinanceiroInvestimento?: number | null;
  mediaCustoFixo?: number | null;
  mediaCustoVariavel?: number | null;
  mediaCustoEstrategico?: number | null;
  totalClientesAtivos?: number | null;
  churnPercent?: number | null;
  ltvMeses?: number | null;
  inadimplenciaValor?: number | null;
  inadimplenciaTaxa?: number | null;
}

export interface DfcLinha {
  nome: string;
  tipo: 'SECAO' | 'RECEITA' | 'DESPESA' | 'RESULTADO' | 'FATURAMENTO' | 'SUBTOTAL_RECEITA' | 'SUBTOTAL_DESPESA';
  nivel: number;
  grupo?: string;
  valores: Array<number | null>;
  total: number;
  media: number;
}

export interface DfcIndicadores {
  faturamentoNovosContratos: number;
  receitasOperacionais: number;
  outrasEntradas: number;
  custosOperacionais: number;
  despesasOperacionais: number;
  atividadesEstrategicas: number;
  investimentos: number;
  financiamentos: number;
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
  margemPercentual: number;
  ticketMedio: number;
  burnRateMensal: number;
}

export interface DfcResponse {
  periodo: {
    dataInicio: string;
    dataTermino: string;
  };
  meses: string[];
  linhas: DfcLinha[];
  indicadores: DfcIndicadores;
  fonteDados: string;
  fallbackAtivo: boolean;
  fallbackMetadata?: Record<string, unknown>;
  totalMovimentacoesProcessadas: number;
  totalMovimentacoesDisponiveis: number;
  paginasProcessadas: number;
  paginasEstimadas: number;
  tempoProcessamentoMs: number;
  usandoCache: boolean;
  atualizadoEm: string;
}

export interface DfcFiltros {
  dataInicio: string;
  dataTermino: string;
  usarCache?: boolean;
  forcarAtualizacao?: boolean;
}

export interface OfxImportResponse {
  erro: boolean;
  mensagem?: string;
  importacaoId?: number;
  totalTransacoes?: number;
  importadas?: number;
  ignoradasDuplicadas?: number;
  conta?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface ConciliacaoOfxItem {
  id: number;
  idEmpresa: number;
  nomeEmpresa?: string | null;
  arquivoNome?: string | null;
  tipo: 'MANUAL' | 'AUTOMATICO' | string;
  status: 'CONCILIADO' | 'PARCIAL' | 'PENDENTE' | string;
  dataImportacao?: string | null;
  banco?: string | null;
  conta?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  conciliadas?: number | null;
  ignoradas?: number | null;
  pendentes?: number | null;
  total?: number | null;
}

export interface ConciliacoesOfxResponse {
  erro: boolean;
  itens: ConciliacaoOfxItem[];
}

export interface AprovarConciliacaoOfxResponse {
  erro: boolean;
  mensagem?: string;
  importacaoId?: number;
  status?: string;
  aprovadasAgora?: number;
  conciliadasTotal?: number;
  pendentesTotal?: number;
  totalMovimentacoes?: number;
}

export interface FiltrosMovimentacoes {
  dataInicio?: string;
  dataTermino?: string;
  tipoData?: 'DataCriacao' | 'DataVencimento' | 'DataCompetencia';
  idsEmpresa?: number;
  textoPesquisa?: string;
  categoria?: string;
  tipo?: 'receita' | 'despesa';
  statusPagamento?: 'pendente' | 'recebido' | 'pago';
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  itensPorPagina?: number;
  numeroDaPagina?: number;
}

export interface CriarMovimentacaoPayload {
  debito: boolean;
  dataVencimento: string;
  dataCompetencia?: string;
  dataQuitacao?: string;
  valor: number;
  nome: string;
  observacao?: string;
  nomeCategoriaFinanceira: string;
  nomeContaFinanceira?: string;
  nomeClienteFornecedor?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ErpFinanceiroService {
  private apiUrl = `${API_CONFIG.BACKEND_API_URL}/api/erp`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getAuthHeadersOnly(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
    });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  buscarMovimentacoes(filtros: FiltrosMovimentacoes = {}): Observable<MovimentacoesResponse> {
    let params = new HttpParams();

    if (filtros.dataInicio) params = params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataTermino) params = params.set('dataTermino', filtros.dataTermino);
    if (filtros.tipoData) params = params.set('tipoData', filtros.tipoData);
    if (filtros.categoria) params = params.set('categoria', filtros.categoria);
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros.statusPagamento) params = params.set('statusPagamento', filtros.statusPagamento);
    if (filtros.orderBy) params = params.set('orderBy', filtros.orderBy);
    if (filtros.orderDirection) params = params.set('orderDirection', filtros.orderDirection);
    if (filtros.textoPesquisa) params = params.set('textoPesquisa', filtros.textoPesquisa);
    if (filtros.itensPorPagina) params = params.set('itensPorPagina', String(filtros.itensPorPagina));
    if (filtros.numeroDaPagina) params = params.set('numeroDaPagina', String(filtros.numeroDaPagina));

    // Empresa é enviada via header X-Empresa-Id (CompanyInterceptor) — não via query param.
    return this.http.get<MovimentacoesResponse>(`${this.apiUrl}/movimentacoes`, {
      headers: this.getHeaders(),
      params
    });
  }

  criarMovimentacao(payload: CriarMovimentacaoPayload): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/movimentacoes`, payload, {
      headers: this.getHeaders()
    });
  }

  atualizarMovimentacao(idMovimentacao: string, payload: CriarMovimentacaoPayload): Observable<any> {
    const idEnc = encodeURIComponent(idMovimentacao);
    return this.http.put<any>(`${this.apiUrl}/movimentacoes/${idEnc}`, payload, {
      headers: this.getHeaders()
    });
  }

  obterResumoFinanceiro(filtros: FiltrosMovimentacoes = {}): Observable<ResumoFinanceiroResponse> {
    let params = new HttpParams();
    if (filtros.dataInicio) params = params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataTermino) params = params.set('dataTermino', filtros.dataTermino);
    return this.http.get<ResumoFinanceiroResponse>(`${this.apiUrl}/resumo-financeiro`, {
      headers: this.getHeaders(),
      params
    });
  }

  gerarDFC(filtros: DfcFiltros): Observable<DfcResponse> {
    const params = new HttpParams()
      .set('dataInicio', filtros.dataInicio)
      .set('dataTermino', filtros.dataTermino);
    return this.http.get<DfcResponse>(`${this.apiUrl}/dfc`, {
      headers: this.getHeaders(),
      params
    });
  }

  listarEmpresas(): Observable<{ empresas: Array<{ Id: number; Nome: string }> }> {
    return this.http.get<{ empresas: Array<{ Id: number; Nome: string }> }>(`${this.apiUrl}/empresas`, {
      headers: this.getHeaders(),
    });
  }

  importarOfx(
    file: File,
    opts?: { idContaBancaria?: number; nomeContaExibicao?: string }
  ): Observable<OfxImportResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (opts?.idContaBancaria != null && opts.idContaBancaria > 0) {
      form.append('idContaBancaria', String(opts.idContaBancaria));
    }
    if (opts?.nomeContaExibicao != null && opts.nomeContaExibicao.trim() !== '') {
      form.append('nomeContaExibicao', opts.nomeContaExibicao.trim());
    }
    // Não setar Content-Type manualmente; o browser coloca boundary.
    return this.http.post<OfxImportResponse>(`${this.apiUrl}/import/ofx`, form, {
      headers: this.getAuthHeadersOnly(),
    });
  }

  listarConciliacoesOfx(filtros: {
    dataInicio?: string;
    dataFim?: string;
    status?: string;
    tipo?: string;
    conta?: string;
  } = {}): Observable<ConciliacoesOfxResponse> {
    let params = new HttpParams();
    if (filtros.dataInicio) params = params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params = params.set('dataFim', filtros.dataFim);
    if (filtros.status) params = params.set('status', filtros.status);
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros.conta) params = params.set('conta', filtros.conta);

    return this.http.get<ConciliacoesOfxResponse>(`${this.apiUrl}/conciliacoes-ofx`, {
      headers: this.getHeaders(),
      params,
    });
  }

  excluirConciliacaoOfx(id: number): Observable<{ erro: boolean; removido: boolean }> {
    return this.http.delete<{ erro: boolean; removido: boolean }>(`${this.apiUrl}/conciliacoes-ofx/${id}`, {
      headers: this.getHeaders(),
    });
  }

  aprovarConciliacaoOfx(id: number): Observable<AprovarConciliacaoOfxResponse> {
    return this.http.post<AprovarConciliacaoOfxResponse>(`${this.apiUrl}/conciliacoes-ofx/${id}/aprovar`, {}, {
      headers: this.getHeaders(),
    });
  }
}

