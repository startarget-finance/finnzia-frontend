import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface FuncionarioCadastroEmpresa {
  idEmpresa: number;
  nomeEmpresa: string;
}

export interface FuncionarioCadastro {
  id: number;
  nomeCompleto: string;
  cpf?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean | null;
  idEmpresas?: number[];
  empresas?: FuncionarioCadastroEmpresa[];
  dataCriacao?: string;
  dataAtualizacao?: string;
}

export interface FuncionarioCadastroPage {
  content: FuncionarioCadastro[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface FuncionarioCadastroPayload {
  nomeCompleto: string;
  cpf?: string;
  cargo?: string;
  departamento?: string;
  email?: string;
  telefone?: string;
  ativo?: boolean;
  /** Opcional: o backend usa X-Empresa-Id quando omitido. */
  idEmpresas?: number[];
}

export interface FuncionarioListParams {
  q?: string;
  idEmpresa?: number;
  ativo?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class FuncionarioCadastroService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/cadastro/funcionarios`;

  constructor(private readonly http: HttpClient) {}

  listar(params: FuncionarioListParams): Observable<FuncionarioCadastroPage> {
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
    return this.http.get<FuncionarioCadastroPage>(this.base, { params: hp });
  }

  buscar(id: number): Observable<FuncionarioCadastro> {
    return this.http.get<FuncionarioCadastro>(`${this.base}/${id}`);
  }

  criar(body: FuncionarioCadastroPayload): Observable<FuncionarioCadastro> {
    return this.http.post<FuncionarioCadastro>(this.base, body);
  }

  atualizar(id: number, body: FuncionarioCadastroPayload): Observable<FuncionarioCadastro> {
    return this.http.put<FuncionarioCadastro>(`${this.base}/${id}`, body);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  setAtivo(id: number, ativo: boolean): Observable<FuncionarioCadastro> {
    return this.http.patch<FuncionarioCadastro>(`${this.base}/${id}/ativo`, { ativo });
  }
}
