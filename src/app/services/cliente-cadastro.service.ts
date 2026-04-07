import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export type TipoPessoaCliente = 'PF' | 'PJ';

export interface ClienteCadastroEmpresa {
  idEmpresa: number;
  nomeEmpresa: string;
}

export interface ClienteCadastro {
  id: number;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cpfCnpj?: string | null;
  tipoPessoa?: TipoPessoaCliente;
  classificacao?: number | null;
  bloqueado?: boolean | null;
  celularFinanceiro?: string | null;
  emailFinanceiro?: string | null;
  enderecoCompleto?: string | null;
  cep?: string | null;
  responsavel?: string | null;
  cpf?: string | null;
  idEmpresas?: number[];
  empresas?: ClienteCadastroEmpresa[];
  dataCriacao?: string;
  dataAtualizacao?: string;
}

export interface ClienteCadastroPage {
  content: ClienteCadastro[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface ClienteCadastroPayload {
  razaoSocial: string;
  nomeFantasia?: string;
  cpfCnpj?: string;
  tipoPessoa?: TipoPessoaCliente;
  classificacao?: number;
  idEmpresas: number[];
  enderecoCompleto?: string;
  cep?: string;
  celularFinanceiro?: string;
  emailFinanceiro?: string;
  responsavel?: string;
  cpf?: string;
  bloqueado?: boolean;
}

export interface ClienteCadastroListParams {
  q?: string;
  idEmpresa?: number;
  classificacao?: number;
  tipoPessoa?: TipoPessoaCliente;
  page?: number;
  size?: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class ClienteCadastroService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/cadastro/clientes`;

  constructor(private readonly http: HttpClient) {}

  listar(params: ClienteCadastroListParams): Observable<ClienteCadastroPage> {
    let hp = new HttpParams();
    if (params.q != null && params.q.trim() !== '') {
      hp = hp.set('q', params.q.trim());
    }
    if (params.idEmpresa != null && params.idEmpresa > 0) {
      hp = hp.set('idEmpresa', String(params.idEmpresa));
    }
    if (params.classificacao != null && params.classificacao >= 1 && params.classificacao <= 5) {
      hp = hp.set('classificacao', String(params.classificacao));
    }
    if (params.tipoPessoa) {
      hp = hp.set('tipoPessoa', params.tipoPessoa);
    }
    const page = params.page ?? 0;
    const size = params.size ?? 20;
    hp = hp.set('page', String(page)).set('size', String(size));
    if (params.sort) {
      hp = hp.set('sort', params.sort);
    }
    return this.http.get<ClienteCadastroPage>(this.base, { params: hp });
  }

  buscar(id: number): Observable<ClienteCadastro> {
    return this.http.get<ClienteCadastro>(`${this.base}/${id}`);
  }

  criar(body: ClienteCadastroPayload): Observable<ClienteCadastro> {
    return this.http.post<ClienteCadastro>(this.base, body);
  }

  atualizar(id: number, body: ClienteCadastroPayload): Observable<ClienteCadastro> {
    return this.http.put<ClienteCadastro>(`${this.base}/${id}`, body);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  setBloqueado(id: number, bloqueado: boolean): Observable<ClienteCadastro> {
    return this.http.patch<ClienteCadastro>(`${this.base}/${id}/bloqueado`, { bloqueado });
  }
}
