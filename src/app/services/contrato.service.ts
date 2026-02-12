import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';

// Interfaces baseadas no backend
export interface ClienteDTO {
  id: number;
  razaoSocial: string;
  nomeFantasia?: string;
  cpfCnpj: string;
  emailFinanceiro?: string;
  celularFinanceiro?: string;
}

export interface CobrancaDTO {
  id: number;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH_UNDONE' | 
          'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' |
          'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS';
  linkPagamento?: string | null;
  codigoBarras?: string;
  numeroParcela?: number;
  asaasPaymentId?: string;
}

export interface ContratoDTO {
  id: number;
  titulo: string;
  descricao?: string;
  conteudo?: string;
  cliente: ClienteDTO;
  valorContrato: number;
  valorRecorrencia?: number;
  dataVencimento: string;
  status: 'PENDENTE' | 'EM_DIA' | 'VENCIDO' | 'PAGO' | 'CANCELADO';
  tipoPagamento: 'UNICO' | 'RECORRENTE';
  servico?: string;
  inicioContrato?: string;
  inicioRecorrencia?: string;
  whatsapp?: string;
  asaasSubscriptionId?: string;
  cobrancas?: CobrancaDTO[];
  categoria?: 'EM_DIA' | 'PENDENTE' | 'EM_ATRASO' | 'INADIMPLENTE';
  dataCriacao: string;
  dataAtualizacao?: string;
}

export interface TotaisPorCategoria {
  totalContratos: number;
  totalValor: number;
  emDia: number;
  pendente: number;
  emAtraso: number;
  inadimplente: number;
  valorEmDia?: number;
  valorPendente?: number;
  valorEmAtraso?: number;
  valorInadimplente?: number;
}

export interface CriarContratoRequest {
  titulo: string;
  descricao?: string;
  conteudo?: string;
  dadosCliente: {
    clienteId?: number;
    razaoSocial: string;
    nomeFantasia?: string;
    cpfCnpj: string;
    enderecoCompleto?: string;
    cep?: string;
    celularFinanceiro?: string;
    emailFinanceiro?: string;
    responsavel?: string;
    cpf?: string;
  };
  valorContrato: number;
  valorRecorrencia?: number;
  dataVencimento: string;
  tipoPagamento: 'UNICO' | 'RECORRENTE';
  servico?: string;
  inicioContrato?: string;
  inicioRecorrencia?: string;
  whatsapp?: string;
  // Configurações de pagamento (Asaas)
  formaPagamento?: string; // BOLETO, PIX, CREDIT_CARD, DEBIT_CARD
  numeroParcelas?: number; // 1-12 (apenas para UNICO)
  jurosAoMes?: number; // Percentual de juros ao mês
  multaPorAtraso?: number; // Percentual de multa por atraso
  descontoPercentual?: number; // Percentual de desconto
  descontoValorFixo?: number; // Valor fixo de desconto
  prazoMaximoDesconto?: number; // Dias para aplicar desconto
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ContratoService {
  private baseUrl = `${API_CONFIG.BACKEND_API_URL}/api/contratos`;
  private contratosSubject = new BehaviorSubject<ContratoDTO[]>([]);
  public contratos$ = this.contratosSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  /**
   * Lista todos os contratos com paginação
   */
  listarTodos(page: number = 0, size: number = 10, sort: string = 'dataCriacao,desc'): Observable<PageResponse<ContratoDTO>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('sort', sort);

    return this.http.get<PageResponse<ContratoDTO>>(this.baseUrl, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map(response => {
        this.contratosSubject.next(response.content);
        return response;
      }),
      catchError(error => {
        console.error('Erro ao listar contratos:', error);
        throw error;
      })
    );
  }

  /**
   * Busca contrato por ID
   */
  buscarPorId(id: number): Observable<ContratoDTO> {
    return this.http.get<ContratoDTO>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Erro ao buscar contrato:', error);
        throw error;
      })
    );
  }

  /**
   * Busca contratos por cliente
   */
  buscarPorCliente(clienteId: number, page: number = 0, size: number = 10): Observable<PageResponse<ContratoDTO>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<PageResponse<ContratoDTO>>(`${this.baseUrl}/cliente/${clienteId}`, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map(response => {
        this.contratosSubject.next(response.content);
        return response;
      }),
      catchError(error => {
        console.error('Erro ao buscar contratos por cliente:', error);
        throw error;
      })
    );
  }

  /**
   * Busca contratos por status
   */
  buscarPorStatus(status: string, page: number = 0, size: number = 10): Observable<PageResponse<ContratoDTO>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<PageResponse<ContratoDTO>>(`${this.baseUrl}/status/${status}`, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map(response => {
        this.contratosSubject.next(response.content);
        return response;
      }),
      catchError(error => {
        console.error('Erro ao buscar contratos por status:', error);
        throw error;
      })
    );
  }

  /**
   * Busca contratos com filtros (igual ao Asaas)
   */
  buscarComFiltros(
    clienteId?: number,
    status?: string,
    termo?: string,
    page: number = 0,
    size: number = 10,
    billingType?: string,
    dueDateInicio?: string,
    dueDateFim?: string,
    paymentDateInicio?: string,
    paymentDateFim?: string
  ): Observable<PageResponse<ContratoDTO>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    // Só adiciona parâmetros se tiverem valores válidos
    if (clienteId !== undefined && clienteId !== null) {
      params = params.set('clienteId', clienteId.toString());
    }
    if (status && status.trim() !== '') {
      params = params.set('status', status.trim());
    }
    if (termo && termo.trim() !== '') {
      params = params.set('termo', termo.trim());
    }
    if (billingType && billingType !== 'todos' && billingType.trim() !== '') {
      params = params.set('billingType', billingType.trim());
    }
    if (dueDateInicio && dueDateInicio.trim() !== '') {
      params = params.set('dueDateGe', dueDateInicio.trim());
    }
    if (dueDateFim && dueDateFim.trim() !== '') {
      params = params.set('dueDateLe', dueDateFim.trim());
    }
    if (paymentDateInicio && paymentDateInicio.trim() !== '') {
      params = params.set('paymentDateGe', paymentDateInicio.trim());
    }
    if (paymentDateFim && paymentDateFim.trim() !== '') {
      params = params.set('paymentDateLe', paymentDateFim.trim());
    }

    return this.http.get<PageResponse<ContratoDTO>>(`${this.baseUrl}/filtros`, {
      headers: this.getHeaders(),
      params
    }).pipe(
      map(response => {
        this.contratosSubject.next(response.content);
        return response;
      }),
      catchError(error => {
        console.error('Erro ao buscar contratos com filtros:', error);
        throw error;
      })
    );
  }

  /**
   * Cria um novo contrato
   */
  criarContrato(request: CriarContratoRequest): Observable<ContratoDTO> {
    return this.http.post<ContratoDTO>(this.baseUrl, request, {
      headers: this.getHeaders()
    }).pipe(
      map(contrato => {
        // Atualiza a lista local
        const current = this.contratosSubject.value;
        this.contratosSubject.next([contrato, ...current]);
        return contrato;
      }),
      catchError(error => {
        console.error('Erro ao criar contrato:', error);
        throw error;
      })
    );
  }

  /**
   * Remove contrato (soft delete)
   */
  removerContrato(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, {
      headers: this.getHeaders()
    }).pipe(
      map(() => {
        // Remove da lista local
        const current = this.contratosSubject.value;
        this.contratosSubject.next(current.filter(c => c.id !== id));
      }),
      catchError(error => {
        console.error('Erro ao remover contrato:', error);
        throw error;
      })
    );
  }

  /**
   * Sincroniza status de um contrato com o Asaas
   */
  sincronizarStatusComAsaas(id: number): Observable<ContratoDTO> {
    return this.http.post<ContratoDTO>(`${this.baseUrl}/${id}/sincronizar`, {}, {
      headers: this.getHeaders()
    }).pipe(
      map(contrato => {
        // Atualiza na lista local
        const current = this.contratosSubject.value;
        const index = current.findIndex(c => c.id === contrato.id);
        if (index !== -1) {
          current[index] = contrato;
          this.contratosSubject.next([...current]);
        }
        return contrato;
      }),
      catchError(error => {
        console.error('Erro ao sincronizar contrato com Asaas:', error);
        throw error;
      })
    );
  }

  /**
   * Importa contratos do Asaas para o banco de dados
   */
  importarDoAsaas(): Observable<{ contratosImportados: number; mensagem: string }> {
    return this.http.post<{ contratosImportados: number; mensagem: string }>(`${this.baseUrl}/importar-asaas`, {}, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Erro ao importar contratos do Asaas:', error);
        throw error;
      })
    );
  }

  /**
   * Re-sincroniza TODOS os contratos com o Asaas.
   * Atualiza status de cobranças que podem estar desatualizadas (ex: pagas no Asaas mas PENDING no sistema).
   */
  sincronizarTodos(): Observable<{ totalContratos: number; contratosAtualizados: number; cobrancasAtualizadas: number; erros: number; mensagem: string }> {
    return this.http.post<{ totalContratos: number; contratosAtualizados: number; cobrancasAtualizadas: number; erros: number; mensagem: string }>(`${this.baseUrl}/sincronizar-todos`, {}, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Erro ao sincronizar contratos com Asaas:', error);
        throw error;
      })
    );
  }

  /**
   * Busca totais por categoria de contratos
   */
  getTotaisPorCategoria(): Observable<TotaisPorCategoria> {
    return this.http.get<TotaisPorCategoria>(`${this.baseUrl}/totais-categorias`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Erro ao buscar totais por categoria:', error);
        throw error;
      })
    );
  }

  /**
   * Converte ContratoDTO para formato usado no componente (compatibilidade)
   */
  converterParaFormatoComponente(contrato: ContratoDTO): any {
    return {
      id: contrato.id.toString(),
      titulo: contrato.titulo,
      cliente: contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia || 'Cliente',
      valor: contrato.valorContrato,
      dataVencimento: contrato.dataVencimento,
      status: this.mapearStatus(contrato.status),
      categoria: contrato.categoria ? this.mapearCategoria(contrato.categoria) : undefined,
      descricao: contrato.descricao || '',
      conteudo: contrato.conteudo || '',
      whatsapp: contrato.whatsapp || '',
      servico: contrato.servico,
      inicioContrato: contrato.inicioContrato,
      inicioRecorrencia: contrato.inicioRecorrencia,
      valorContrato: contrato.valorContrato,
      valorRecorrencia: contrato.valorRecorrencia,
      tipoPagamento: contrato.tipoPagamento,
      cobrancas: contrato.cobrancas || [], // Incluir cobranças para uso no Kanban
      dadosCliente: {
        razaoSocial: contrato.cliente.razaoSocial,
        nomeFantasia: contrato.cliente.nomeFantasia,
        cnpj: contrato.cliente.cpfCnpj,
        emailFinanceiro: contrato.cliente.emailFinanceiro,
        celularFinanceiro: contrato.cliente.celularFinanceiro
      }
    };
  }

  /**
   * Mapeia categoria do backend para formato do componente
   */
  mapearCategoria(categoria: string): 'em-dia' | 'pendente' | 'em-atraso' | 'inadimplente' {
    const categoriaMap: Record<string, 'em-dia' | 'pendente' | 'em-atraso' | 'inadimplente'> = {
      'EM_DIA': 'em-dia',
      'PENDENTE': 'pendente',
      'EM_ATRASO': 'em-atraso',
      'INADIMPLENTE': 'inadimplente'
    };
    return categoriaMap[categoria] || 'pendente';
  }

  /**
   * Mapeia status do backend para formato do componente
   */
  mapearStatus(status: string): 'pendente' | 'em_dia' | 'vencido' | 'pago' | 'cancelado' {
    const statusMap: Record<string, 'pendente' | 'em_dia' | 'vencido' | 'pago' | 'cancelado'> = {
      'PENDENTE': 'pendente',
      'EM_DIA': 'em_dia',
      'VENCIDO': 'vencido',
      'PAGO': 'pago',
      'CANCELADO': 'cancelado'
    };
    return statusMap[status] || 'pendente';
  }
}

