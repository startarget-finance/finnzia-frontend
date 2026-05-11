import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export type TipoCategoriaFinanceira = 'receita' | 'despesa';

export interface SubcategoriaFinanceira {
  id: number;
  nome: string;
  children?: SubcategoriaFinanceira[];
}

export interface CategoriaFinanceira {
  id: string;
  tipo: TipoCategoriaFinanceira;
  nome: string;
  subcategorias: SubcategoriaFinanceira[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface SalvarCategoriaPayload {
  tipo: TipoCategoriaFinanceira;
  nome: string;
  /** null ou omitido = raiz (1º nível). */
  parentId?: number | null;
  idEmpresa: number;
  /** Legado (import). */
  nomeCategoria?: string;
  nomeSubcategoria?: string;
}

@Injectable({ providedIn: 'root' })
export class CategoriasFinanceirasService {
  private readonly base = `${API_CONFIG.BACKEND_API_URL}/api/categorias-financeiras`;

  constructor(private readonly http: HttpClient) {}

  listar(idEmpresa: number): Observable<CategoriaFinanceira[]> {
    const params = new HttpParams().set('idEmpresa', String(idEmpresa));
    return this.http.get<CategoriaFinanceira[]>(this.base, { params });
  }

  salvar(payload: SalvarCategoriaPayload): Observable<CategoriaFinanceira[]> {
    return this.http.post<CategoriaFinanceira[]>(this.base, payload);
  }

  renomearNo(idEmpresa: number | null, nodeId: number, nome: string): Observable<CategoriaFinanceira[]> {
    let params = new HttpParams();
    if (idEmpresa != null && idEmpresa > 0) {
      params = params.set('idEmpresa', String(idEmpresa));
    }
    return this.http.patch<CategoriaFinanceira[]>(`${this.base}/nos/${nodeId}`, { nome }, { params });
  }

  /** Exclui o nó (raiz ou qualquer nível) e toda a subárvore. */
  excluirNo(idEmpresa: number | null, nodeId: number): Observable<CategoriaFinanceira[]> {
    let params = new HttpParams();
    if (idEmpresa != null && idEmpresa > 0) {
      params = params.set('idEmpresa', String(idEmpresa));
    }
    return this.http.delete<CategoriaFinanceira[]>(`${this.base}/nos/${nodeId}`, { params });
  }
}
