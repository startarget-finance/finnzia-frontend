import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export type TipoContaBancaria = 'CORRENTE' | 'POUPANCA';
export type CategoriaContaBancaria = 'BANCARIA' | 'DINHEIRO';

export interface ContaBancariaEmpresa {
  idEmpresa: number;
  nomeEmpresa: string;
}

export interface ContaBancariaCadastro {
  id: number;
  nomeConta?: string | null;
  categoria?: CategoriaContaBancaria;
  instituicao?: string | null;
  banco: string;
  agencia: string;
  conta: string;
  tipo: TipoContaBancaria;
  saldoInicial: number;
  ativo: boolean;
  idEmpresas?: number[];
  empresas?: ContaBancariaEmpresa[];
  dataCriacao?: string;
  dataAtualizacao?: string;
}

export interface ContaBancariaCadastroPage {
  content: ContaBancariaCadastro[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface ContaBancariaCadastroPayload {
  nomeConta?: string;
  categoria?: CategoriaContaBancaria;
  instituicao?: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo?: TipoContaBancaria;
  saldoInicial: number;
  ativo?: boolean;
  idEmpresas: number[];
}

export interface ContaBancariaListParams {
  q?: string;
  idEmpresa?: number;
  ativo?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class ContaBancariaCadastroService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/cadastro/contas-bancarias`;

  constructor(private readonly http: HttpClient) {}

  listar(params: ContaBancariaListParams): Observable<ContaBancariaCadastroPage> {
    let hp = new HttpParams();
    if (params.q != null && params.q.trim() !== '') {
      hp = hp.set('q', params.q.trim());
    }
    if (params.idEmpresa != null && params.idEmpresa > 0) {
      hp = hp.set('idEmpresa', String(params.idEmpresa));
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
    return this.http.get<ContaBancariaCadastroPage>(this.base, { params: hp });
  }

  criar(body: ContaBancariaCadastroPayload): Observable<ContaBancariaCadastro> {
    return this.http.post<ContaBancariaCadastro>(this.base, body);
  }

  atualizar(id: number, body: ContaBancariaCadastroPayload): Observable<ContaBancariaCadastro> {
    return this.http.put<ContaBancariaCadastro>(`${this.base}/${id}`, body);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  setAtivo(id: number, ativo: boolean): Observable<ContaBancariaCadastro> {
    return this.http.patch<ContaBancariaCadastro>(`${this.base}/${id}/ativo`, { ativo });
  }
}
