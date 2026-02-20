import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Serviço para gerenciar a empresa selecionada no contexto da aplicação
 * 
 * Responsabilidades:
 * - Armazenar empresa padrão/selecionada do usuário
 * - Notificar componentes sobre mudanças
 * - Persistir seleção em sessionStorage
 * - Validar acesso à empresa
 */
@Injectable({
  providedIn: 'root'
})
export class CompanySelectorService {

  // Subject para notificar mudanças de empresa
  private empresaSelecionadaSubject = new BehaviorSubject<CompaniaInfo | null>(this.carregarDoStorage());
  public empresaSelecionada$ = this.empresaSelecionadaSubject.asObservable();

  // Subject para lista de empresas permitidas
  private empresasPermitidas = new BehaviorSubject<CompaniaInfo[]>([]);
  public empresasPermitidas$ = this.empresasPermitidas.asObservable();

  // Flag para indicar se está carregando
  private carregandoSubject = new BehaviorSubject<boolean>(false);
  public carregando$ = this.carregandoSubject.asObservable();

  private readonly STORAGE_KEY = 'empresa_selecionada';
  private readonly STORAGE_KEY_LISTA = 'empresas_permitidas';

  constructor() {
    this.atualizarEmpresas();
  }

  /**
   * Obtém a empresa atualmente selecionada
   */
  obterEmpresaSelecionada(): CompaniaInfo | null {
    return this.empresaSelecionadaSubject.value;
  }

  /**
   * Obtém o ID da empresa selecionada
   */
  obterIdEmpresaSelecionada(): number | null {
    return this.empresaSelecionadaSubject.value?.idEmpresa || null;
  }

  /**
   * Define uma nova empresa como selecionada
   * Persiste em sessionStorage
   */
  selecionarEmpresa(empresa: CompaniaInfo): void {
    if (!empresa || !empresa.idEmpresa) {
      console.error('Empresa inválida:', empresa);
      return;
    }

    this.empresaSelecionadaSubject.next(empresa);
    this.salvarNoStorage(empresa);
    console.log(`✅ Empresa selecionada: ${empresa.nomeEmpresa} (ID: ${empresa.idEmpresa})`);
  }

  /**
   * Define a empresa padrão do usuário como selecionada
   */
  selecionarEmpresaPadrao(): void {
    const empresas = this.empresasPermitidas.value;
    const padrao = empresas.find(e => e.padrao);
    
    if (padrao) {
      this.selecionarEmpresa(padrao);
    } else if (empresas.length > 0) {
      // Fallback: selecionar primeira empresa se não houver padrão
      this.selecionarEmpresa(empresas[0]);
    }
  }

  /**
   * Carrega lista de empresas permitidas
   * Busca da API (será implementado em integração real)
   */
  atualizarEmpresas(empresas?: CompaniaInfo[]): void {
    if (empresas) {
      this.empresasPermitidas.next(empresas);
      this.salvarListaNoStorage(empresas);
      this.selecionarEmpresaPadrao();
    } else {
      // Carregar do storage
      const empsStorage = this.carregarListaDoStorage();
      if (empsStorage.length > 0) {
        this.empresasPermitidas.next(empsStorage);
        this.selecionarEmpresaPadrao();
      }
    }
  }

  /**
   * Verifica se o usuário tem acesso a uma empresa específica
   */
  temAcesso(idEmpresa: number): boolean {
    return this.empresasPermitidas.value.some(e => e.idEmpresa === idEmpresa && e.ativo);
  }

  /**
   * Obtém empresas ativas
   */
  obterEmpresasAtivas(): CompaniaInfo[] {
    return this.empresasPermitidas.value.filter(e => e.ativo);
  }

  /**
   * Obtém empresa por ID
   */
  obterEmpresa(idEmpresa: number): CompaniaInfo | undefined {
    return this.empresasPermitidas.value.find(e => e.idEmpresa === idEmpresa && e.ativo);
  }

  /**
   * Define se está carregando
   */
  setCarregando(carregando: boolean): void {
    this.carregandoSubject.next(carregando);
  }

  /**
   * Limpa dados de sessão (logout)
   */
  limparSessao(): void {
    this.empresaSelecionadaSubject.next(null);
    this.empresasPermitidas.next([]);
    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.STORAGE_KEY_LISTA);
  }

  // ==================== Private Methods ====================

  private carregarDoStorage(): CompaniaInfo | null {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as CompaniaInfo;
      }
    } catch (e) {
      console.error('Erro ao carregar empresa do storage:', e);
    }
    return null;
  }

  private carregarListaDoStorage(): CompaniaInfo[] {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY_LISTA);
      if (stored) {
        return JSON.parse(stored) as CompaniaInfo[];
      }
    } catch (e) {
      console.error('Erro ao carregar lista de empresas do storage:', e);
    }
    return [];
  }

  private salvarNoStorage(empresa: CompaniaInfo): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(empresa));
    } catch (e) {
      console.error('Erro ao salvar empresa no storage:', e);
    }
  }

  private salvarListaNoStorage(empresas: CompaniaInfo[]): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY_LISTA, JSON.stringify(empresas));
    } catch (e) {
      console.error('Erro ao salvar lista de empresas no storage:', e);
    }
  }
}

/**
 * Interface para dados de uma empresa/compania
 */
export interface CompaniaInfo {
  id?: number;           // ID da relação EmpresaUsuario (se houver)
  idEmpresa: number;     // ID da empresa no BOMControle
  nomeEmpresa: string;
  padrao?: boolean;      // Se é empresa padrão do usuário
  ativo?: boolean;       // Se acesso está ativo
  dataCriacao?: string;
}
