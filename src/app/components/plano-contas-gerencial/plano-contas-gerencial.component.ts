import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { CompaniaInfo, CompanySelectorService } from '../../services/company-selector.service';
import {
  CategoriaFinanceira,
  CategoriasFinanceirasService,
  TipoCategoriaFinanceira,
} from '../../services/categorias-financeiras.service';
import { AuthService } from '../../services/auth.service';
import { buildDeleteConfirmOptions, confirmUnsavedChanges } from '../../utils/sweet-alerts';

@Component({
  selector: 'app-plano-contas-gerencial',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plano-contas-gerencial.component.html'
})
export class PlanoContasGerencialComponent implements OnInit, OnDestroy {
  /** Quando true, usado dentro da Parametrização — sem moldura de página inteira. */
  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  categorias: CategoriaFinanceira[] = [];

  empresasDisponiveis: CompaniaInfo[] = [];

  modalAberto = false;
  /** Nova categoria (livre) ou só subcategoria em categoria existente */
  modalModo: 'categoria' | 'subcategoria' = 'categoria';
  formTipo: TipoCategoriaFinanceira = 'despesa';
  formCategoria = '';
  formSubcategoria = '';
  private modalSnapshot = '';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly categoriasApi: CategoriasFinanceirasService,
    private readonly companySelector: CompanySelectorService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresasPermitidas$.pipe(takeUntil(this.destroy$)).subscribe((list) => {
      this.empresasDisponiveis = (list || []).filter((e) => e.ativo && e.idEmpresa);
      this.carregar();
    });
    this.companySelector.empresaSelecionada$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.carregar();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregar(): void {
    this.erro = null;
    if (!this.authService.isAuthenticated() || !this.authService.getToken()) {
      this.carregando = false;
      this.categorias = [];
      this.resumoTotal.emit(0);
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.carregando = false;
      this.categorias = [];
      this.resumoTotal.emit(0);
      return;
    }
    this.carregando = true;
    this.categoriasApi.listar(idEmpresaAtual).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.resumoTotal.emit(this.categorias.length);
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.categorias = [];
        this.resumoTotal.emit(0);
        this.erro = e.error?.mensagem || 'Não foi possível carregar categorias.';
      }
    });
  }

  porTipo(tipo: TipoCategoriaFinanceira): CategoriaFinanceira[] {
    return (this.categorias || []).filter((c) => c.tipo === tipo);
  }

  abrirNovoParaTipo(tipo: TipoCategoriaFinanceira): void {
    this.modalModo = 'categoria';
    this.formTipo = tipo;
    this.formCategoria = '';
    this.formSubcategoria = '';
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirNovaSubcategoria(categoria: CategoriaFinanceira): void {
    this.modalModo = 'subcategoria';
    this.formTipo = categoria.tipo;
    this.formCategoria = categoria.nome;
    this.formSubcategoria = '';
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  async fecharModal(): Promise<void> {
    if (this.temAlteracoesModal()) {
      const deveFechar = await confirmUnsavedChanges();
      if (!deveFechar) return;
    }
    this.modalAberto = false;
    this.modalModo = 'categoria';
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      modalModo: this.modalModo,
      formTipo: this.formTipo,
      formCategoria: this.formCategoria,
      formSubcategoria: this.formSubcategoria
    });
  }

  private atualizarSnapshotModal(): void {
    this.modalSnapshot = this.estadoModalAtual();
  }

  private temAlteracoesModal(): boolean {
    if (!this.modalAberto) return false;
    return this.modalSnapshot !== this.estadoModalAtual();
  }

  salvar(): void {
    if (this.modalModo === 'subcategoria') {
      const nomeSub = this.formSubcategoria.trim();
      if (!nomeSub) {
        this.erro = 'Informe o nome da subcategoria.';
        return;
      }
      const nomeCategoria = this.formCategoria.trim();
      if (!nomeCategoria) {
        this.erro = 'Categoria inválida.';
        return;
      }
      this.persistirCategoria(nomeCategoria, nomeSub);
      return;
    }
    const nomeCategoria = this.formCategoria.trim();
    if (!nomeCategoria) {
      this.erro = 'Informe a categoria.';
      return;
    }
    this.persistirCategoria(nomeCategoria, this.formSubcategoria.trim() || undefined);
  }

  private persistirCategoria(nomeCategoria: string, nomeSubcategoria?: string): void {
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa ativa.';
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.categoriasApi
      .salvar({
        idEmpresa: idEmpresaAtual,
        tipo: this.formTipo,
        nomeCategoria,
        nomeSubcategoria,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (lista) => {
          this.categorias = lista || [];
          this.resumoTotal.emit(this.categorias.length);
          this.modalAberto = false;
          this.modalModo = 'categoria';
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível salvar categoria.';
        },
      });
  }

  async excluirCategoria(categoria: CategoriaFinanceira): Promise<void> {
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('categoria', categoria.nome));
    if (!confirmacao.isConfirmed) {
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (!idEmpresaAtual) return;
    this.erro = null;
    this.carregando = true;
    this.categoriasApi.excluirCategoria(idEmpresaAtual, categoria.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.resumoTotal.emit(this.categorias.length);
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir categoria.';
      }
    });
  }

  async excluirSubcategoria(categoria: CategoriaFinanceira, idSubcategoria: string | number): Promise<void> {
    const nomeSub = (categoria.subcategorias || []).find((s) => String(s.id) === String(idSubcategoria))?.nome || 'esta subcategoria';
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('subcategoria', nomeSub));
    if (!confirmacao.isConfirmed) {
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (!idEmpresaAtual) return;
    this.carregando = true;
    this.categoriasApi.excluirSubcategoria(
      idEmpresaAtual,
      categoria.id,
      idSubcategoria
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.resumoTotal.emit(this.categorias.length);
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir subcategoria.';
      }
    });
  }

  tipoLabel(tipo: TipoCategoriaFinanceira): string {
    return tipo === 'receita' ? 'Receita' : 'Despesa';
  }

  badgeTipo(tipo: TipoCategoriaFinanceira): string {
    return tipo === 'receita'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';
  }

  onImportarArquivo(ev: Event): void {
    const idEmpresaAtual = this.idEmpresaContexto();
    if (!idEmpresaAtual) {
      this.erro = 'Selecione uma empresa para importar categorias.';
      return;
    }
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) {
          throw new Error('JSON deve ser um array');
        }
        this.importarLote(idEmpresaAtual, arr as unknown[]);
      } catch {
        this.erro =
          'Arquivo inválido. Use JSON: [{"tipo":"despesa","categoria":"Operacional","subcategoria":"Aluguel"}]';
      }
    };
    reader.readAsText(file);
  }

  private importarLote(idEmpresaAtual: number, items: unknown[]): void {
    const itens = [...items];
    const next = (): void => {
      const item = itens.shift();
      if (!item) {
        this.carregar();
        return;
      }
      const raw = item as Record<string, unknown>;
      const tipoRaw = String(raw['tipo'] || '').toLowerCase().trim();
      const tipo: TipoCategoriaFinanceira = tipoRaw === 'receita' ? 'receita' : 'despesa';
      const categoria = String(raw['categoria'] || raw['nomeCategoria'] || '').trim();
      const subcategoria = String(raw['subcategoria'] || raw['nomeSubcategoria'] || '').trim();
      if (!categoria) {
        next();
        return;
      }
      this.categoriasApi.salvar({
        idEmpresa: idEmpresaAtual,
        tipo,
        nomeCategoria: categoria,
        nomeSubcategoria: subcategoria || undefined,
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => next(),
        error: () => next()
      });
    };
    next();
  }

  private idEmpresaContexto(): number | null {
    const selecionada = this.companySelector.obterIdEmpresaSelecionada();
    if (selecionada != null && selecionada > 0) {
      return selecionada;
    }
    const primeiraAtiva = this.companySelector.obterEmpresasAtivas()[0];
    return primeiraAtiva?.idEmpresa ?? null;
  }
}
