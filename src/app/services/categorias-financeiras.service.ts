import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export type TipoCategoriaFinanceira = 'receita' | 'despesa';

export interface SubcategoriaFinanceira {
  id: string;
  nome: string;
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
  nomeCategoria: string;
  nomeSubcategoria?: string;
  idEmpresa: number;
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

  excluirCategoria(idEmpresa: number, idCategoria: string): Observable<CategoriaFinanceira[]> {
    const params = new HttpParams().set('idEmpresa', String(idEmpresa));
    const idEnc = encodeURIComponent(idCategoria);
    return this.http.delete<CategoriaFinanceira[]>(`${this.base}/${idEnc}`, { params });
  }

  excluirSubcategoria(
    idEmpresa: number,
    idCategoria: string,
    idSubcategoria: string | number
  ): Observable<CategoriaFinanceira[]> {
    const params = new HttpParams().set('idEmpresa', String(idEmpresa));
    const idCatEnc = encodeURIComponent(idCategoria);
    return this.http.delete<CategoriaFinanceira[]>(
      `${this.base}/${idCatEnc}/subcategorias/${encodeURIComponent(String(idSubcategoria))}`,
      { params }
    );
  }
}
