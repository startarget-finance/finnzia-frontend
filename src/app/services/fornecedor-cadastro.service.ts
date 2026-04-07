import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export type TipoPessoaFornecedor = 'PF' | 'PJ';

export interface FornecedorCadastroEmpresa {
  idEmpresa: number;
  nomeEmpresa: string;
}

export interface FornecedorCadastro {
  id: number;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cpfCnpj?: string | null;
  tipoPessoa?: TipoPessoaFornecedor;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean | null;
  idEmpresas?: number[];
  empresas?: FornecedorCadastroEmpresa[];
  dataCriacao?: string;
  dataAtualizacao?: string;
}

export interface FornecedorCadastroPage {
  content: FornecedorCadastro[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface FornecedorCadastroPayload {
  razaoSocial: string;
  nomeFantasia?: string;
  cpfCnpj?: string;
  tipoPessoa?: TipoPessoaFornecedor;
  email?: string;
  telefone?: string;
  ativo?: boolean;
  idEmpresas: number[];
}

export interface FornecedorListParams {
  q?: string;
  idEmpresa?: number;
  tipoPessoa?: TipoPessoaFornecedor;
  ativo?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class FornecedorCadastroService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/cadastro/fornecedores`;

  constructor(private readonly http: HttpClient) {}

  listar(params: FornecedorListParams): Observable<FornecedorCadastroPage> {
    let hp = new HttpParams();
    if (params.q != null && params.q.trim() !== '') {
      hp = hp.set('q', params.q.trim());
    }
    if (params.idEmpresa != null && params.idEmpresa > 0) {
      hp = hp.set('idEmpresa', String(params.idEmpresa));
    }
    if (params.tipoPessoa) {
      hp = hp.set('tipoPessoa', params.tipoPessoa);
    }
    if (params.ativo != null) {
      hp = hp.set('ativo', String(params.ativo));
    }
    const page = params.page ?? 0;
    const size = params.size ?? 20;
    hp = hp.set('page', String(page)).set('size', String(size));
    if (params.sort) {
      hp = hp.set('sort', params.sort);
    }
    return this.http.get<FornecedorCadastroPage>(this.base, { params: hp });
  }

  buscar(id: number): Observable<FornecedorCadastro> {
    return this.http.get<FornecedorCadastro>(`${this.base}/${id}`);
  }

  criar(body: FornecedorCadastroPayload): Observable<FornecedorCadastro> {
    return this.http.post<FornecedorCadastro>(this.base, body);
  }

  atualizar(id: number, body: FornecedorCadastroPayload): Observable<FornecedorCadastro> {
    return this.http.put<FornecedorCadastro>(`${this.base}/${id}`, body);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  setAtivo(id: number, ativo: boolean): Observable<FornecedorCadastro> {
    return this.http.patch<FornecedorCadastro>(`${this.base}/${id}/ativo`, { ativo });
  }
}
