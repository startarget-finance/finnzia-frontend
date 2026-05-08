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
  SubcategoriaFinanceira,
  TipoCategoriaFinanceira,
} from '../../services/categorias-financeiras.service';
import { AuthService } from '../../services/auth.service';
import { buildDeleteConfirmOptions, confirmUnsavedChanges } from '../../utils/sweet-alerts';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';

@Component({
  selector: 'app-plano-contas-gerencial',
  standalone: true,
  imports: [CommonModule, FormsModule, FeedbackStateComponent],
  templateUrl: './plano-contas-gerencial.component.html',
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
  /** `novo`: inclusão; `editar`: renomear conta existente. */
  modalAcao: 'novo' | 'editar' = 'novo';
  /** Id do nó em edição (API); só em `modalAcao === 'editar'`. */
  formEditarId: number | null = null;
  /** Nova raiz (1º nível) ou filho em qualquer nível da árvore */
  modalModo: 'raiz' | 'filho' = 'raiz';
  formTipo: TipoCategoriaFinanceira = 'despesa';
  /** Nome do novo nó */
  formNomeNovo = '';
  /** null = raiz */
  formParentDbId: number | null = null;
  /** Texto para o modal (caminho do pai) */
  formPaiResumo = '';
  /**
   * Profundidade do nó que será criado: 1 = categoria (raiz), 2 = subcategoria (filho da raiz),
   * 3+ = detalhes (imposto, taxa de cartão, etc.).
   */
  formNivelAlvo = 1;
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
        this.resumoTotal.emit(this.contarNos(this.categorias));
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.categorias = [];
        this.resumoTotal.emit(0);
        this.erro = e.error?.mensagem || 'Não foi possível carregar categorias.';
      },
    });
  }

  /** Conta nós em toda a floresta (raízes + descendentes). Usado no template. */
  contarNos(raizes: CategoriaFinanceira[]): number {
    let n = 0;
    const walk = (subs: SubcategoriaFinanceira[] | undefined) => {
      for (const s of subs || []) {
        n++;
        walk(s.children);
      }
    };
    for (const c of raizes || []) {
      n++;
      walk(c.subcategorias);
    }
    return n;
  }

  porTipo(tipo: TipoCategoriaFinanceira): CategoriaFinanceira[] {
    return (this.categorias || []).filter((c) => c.tipo === tipo);
  }

  abrirNovoParaTipo(tipo: TipoCategoriaFinanceira): void {
    this.modalAcao = 'novo';
    this.formEditarId = null;
    this.modalModo = 'raiz';
    this.formTipo = tipo;
    this.formNomeNovo = '';
    this.formParentDbId = null;
    this.formPaiResumo = '';
    this.formNivelAlvo = 1;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditarRaiz(categoria: CategoriaFinanceira): void {
    const id = this.parseIdRaiz(String(categoria.id));
    if (id == null) {
      this.erro = 'Não foi possível identificar esta conta para edição.';
      return;
    }
    this.erro = null;
    this.modalAcao = 'editar';
    this.formEditarId = id;
    this.modalModo = 'raiz';
    this.formTipo = categoria.tipo;
    this.formNomeNovo = categoria.nome;
    this.formParentDbId = null;
    this.formPaiResumo = categoria.nome;
    this.formNivelAlvo = 1;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  /** `caminhoAtePai` = caminho até o pai de `no` (ex.: nome da raiz), sem incluir `no`. */
  abrirEditarNo(raiz: CategoriaFinanceira, no: SubcategoriaFinanceira, caminhoAtePai: string): void {
    const id = this.idBancoDoNo(no);
    if (id == null) {
      this.erro = 'Não foi possível identificar esta conta para edição.';
      return;
    }
    this.erro = null;
    this.modalAcao = 'editar';
    this.formEditarId = id;
    this.modalModo = 'raiz';
    this.formTipo = raiz.tipo;
    this.formNomeNovo = no.nome;
    this.formParentDbId = null;
    const prefixo = (caminhoAtePai || '').trim();
    this.formPaiResumo = prefixo ? `${prefixo} › ${no.nome}` : `${raiz.nome} › ${no.nome}`;
    this.formNivelAlvo = this.profundidadeNoNaArvore(caminhoAtePai);
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  /** Filho direto da raiz (compatível com o botão + na linha da categoria). */
  abrirNovoFilhoDaRaiz(categoria: CategoriaFinanceira): void {
    const idRaiz = this.parseIdRaiz(String(categoria.id));
    if (idRaiz == null) {
      this.erro =
        'Não foi possível identificar esta conta no plano. Atualize a página; se persistir, contate o suporte.';
      return;
    }
    this.erro = null;
    this.modalAcao = 'novo';
    this.formEditarId = null;
    this.modalModo = 'filho';
    this.formTipo = categoria.tipo;
    this.formNomeNovo = '';
    this.formParentDbId = idRaiz;
    this.formPaiResumo = categoria.nome;
    this.formNivelAlvo = 2;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  /** Filho em qualquer nível (subcategoria ou detalhes abaixo). */
  abrirNovoFilho(pai: SubcategoriaFinanceira, tipo: TipoCategoriaFinanceira, caminhoPai: string): void {
    const pid = this.idBancoDoNo(pai);
    if (pid == null) {
      this.erro =
        'Identificador da conta pai inválido. Atualize a página e use novamente o botão + na linha desejada.';
      return;
    }
    this.erro = null;
    this.modalAcao = 'novo';
    this.formEditarId = null;
    this.modalModo = 'filho';
    this.formTipo = tipo;
    this.formNomeNovo = '';
    this.formParentDbId = pid;
    this.formPaiResumo = caminhoPai;
    const partes = caminhoPai.split(' › ').map((s) => s.trim()).filter(Boolean);
    /** `caminhoPai` é o caminho até o pai (inclusive); profundidade do novo nó = profundidade do pai + 1. */
    this.formNivelAlvo = partes.length + 1;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  async fecharModal(): Promise<void> {
    if (this.temAlteracoesModal()) {
      const deveFechar = await confirmUnsavedChanges();
      if (!deveFechar) return;
    }
    this.modalAberto = false;
    this.modalModo = 'raiz';
    this.modalAcao = 'novo';
    this.formEditarId = null;
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      modalModo: this.modalModo,
      formTipo: this.formTipo,
      formNomeNovo: this.formNomeNovo,
      formParentDbId: this.formParentDbId,
      formPaiResumo: this.formPaiResumo,
      formNivelAlvo: this.formNivelAlvo,
      modalAcao: this.modalAcao,
      formEditarId: this.formEditarId,
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
    const nome = this.formNomeNovo.trim();
    if (!nome) {
      this.erro = 'Informe o nome.';
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa ativa.';
      return;
    }
    if (this.modalAcao === 'editar' && this.formEditarId != null) {
      this.erro = null;
      this.carregando = true;
      this.categoriasApi
        .renomearNo(idEmpresaAtual, this.formEditarId, nome)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (lista) => {
            this.categorias = lista || [];
            this.resumoTotal.emit(this.contarNos(this.categorias));
            this.modalAberto = false;
            this.modalModo = 'raiz';
            this.modalAcao = 'novo';
            this.formEditarId = null;
            this.carregando = false;
          },
          error: (e) => {
            this.carregando = false;
            this.erro = e.error?.mensagem || 'Não foi possível salvar.';
          },
        });
      return;
    }
    let parentId: number | undefined;
    if (this.modalModo === 'filho') {
      const raw = this.formParentDbId;
      const n = raw != null ? Math.trunc(Number(raw)) : NaN;
      if (!Number.isFinite(n) || n <= 0) {
        this.erro = 'Conta superior inválida. Feche o formulário e abra novamente pelo + na linha desejada.';
        return;
      }
      parentId = n;
    }
    this.erro = null;
    this.carregando = true;
    this.categoriasApi
      .salvar({
        idEmpresa: idEmpresaAtual,
        tipo: this.formTipo,
        nome,
        parentId: parentId ?? null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (lista) => {
          this.categorias = lista || [];
          this.resumoTotal.emit(this.contarNos(this.categorias));
          this.modalAberto = false;
          this.modalModo = 'raiz';
          this.modalAcao = 'novo';
          this.formEditarId = null;
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível salvar.';
        },
      });
  }

  async excluirRaiz(categoria: CategoriaFinanceira): Promise<void> {
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('categoria e subárvore', categoria.nome));
    if (!confirmacao.isConfirmed) return;
    const id = this.parseIdRaiz(String(categoria.id));
    if (id == null) {
      this.erro = 'Não foi possível identificar esta conta para exclusão.';
      return;
    }
    await this.excluirNoPorId(id);
  }

  async excluirNo(paiNome: string, no: SubcategoriaFinanceira): Promise<void> {
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('item do plano', `${paiNome} › ${no.nome}`));
    if (!confirmacao.isConfirmed) return;
    const id = this.idBancoDoNo(no);
    if (id == null) {
      this.erro = 'Não foi possível identificar esta conta para exclusão.';
      return;
    }
    await this.excluirNoPorId(id);
  }

  private async excluirNoPorId(nodeId: number): Promise<void> {
    const idEmpresaAtual = this.idEmpresaContexto();
    if (!idEmpresaAtual) return;
    this.erro = null;
    this.carregando = true;
    this.categoriasApi.excluirNo(idEmpresaAtual, nodeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.resumoTotal.emit(this.contarNos(this.categorias));
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir.';
      },
    });
  }

  /**
   * Id numérico da conta raiz: `receita:12` / `despesa:3`, ou apenas o número se a API enviar assim.
   */
  parseIdRaiz(idComposto: string): number | null {
    const raw = (idComposto || '').trim();
    const idx = raw.lastIndexOf(':');
    if (idx >= 0 && idx < raw.length - 1) {
      const n = Number(raw.slice(idx + 1));
      if (Number.isFinite(n) && n > 0) return n;
    }
    const plain = Number(raw);
    return Number.isFinite(plain) && plain > 0 ? plain : null;
  }

  /** Id persistido de um nó filho (API pode enviar número ou string). */
  private idBancoDoNo(no: SubcategoriaFinanceira): number | null {
    const v = no.id as unknown;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
    if (typeof v === 'string') {
      const n = Number(v.trim());
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    return null;
  }

  tipoLabel(tipo: TipoCategoriaFinanceira): string {
    return tipo === 'receita' ? 'Receita' : 'Despesa';
  }

  modalTitulo(): string {
    if (this.modalAcao === 'editar') {
      return 'Editar conta';
    }
    const t = this.tipoLabel(this.formTipo);
    if (this.modalModo === 'raiz') {
      return `Nova categoria — ${t}`;
    }
    if (this.formNivelAlvo === 2) {
      return `Nova subcategoria — ${t}`;
    }
    return `Novo detalhe — ${t}`;
  }

  modalSubtitulo(): string {
    if (this.modalAcao === 'editar') {
      return `Conta: ${this.formPaiResumo}`;
    }
    return this.modalModo === 'filho' ? `Abaixo de: ${this.formPaiResumo}` : '';
  }

  /** Rótulo do campo Nome conforme o nível. */
  rotuloCampoNome(): string {
    if (this.formNivelAlvo <= 1) return 'Nome da categoria';
    if (this.formNivelAlvo === 2) return 'Nome da subcategoria';
    return 'Nome do detalhe';
  }

  /** Tooltip do + na linha da raiz (sempre cria subcategoria). */
  tituloMaisSubcategoria(): string {
    return 'Nova subcategoria (nível 2)';
  }

  /** Profundidade dos nós listados em `subs` (caminho = até o pai da lista). */
  profundidadeNoNaArvore(caminhoAtePai: string): number {
    return caminhoAtePai.split(' › ').map((s) => s.trim()).filter(Boolean).length + 1;
  }

  /** Só categoria (1) e subcategoria (2) podem receber filhos; detalhe (3+) não. */
  mostrarBotaoAdicionarNaArvore(caminhoAtePai: string): boolean {
    return this.profundidadeNoNaArvore(caminhoAtePai) < 3;
  }

  /** Tooltip do + sob a subcategoria (cria detalhe). */
  tituloMaisDetalhe(): string {
    return 'Novo detalhe (ex.: imposto, taxa)';
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
          'Arquivo inválido. Use JSON com raízes: [{"tipo":"despesa","nome":"Custos fixos","children":[{"nome":"Aluguel"}]}] ou legado [{"tipo":"despesa","categoria":"X","subcategoria":"Y"}].';
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
      const children = raw['children'];
      if (Array.isArray(children) && children.length > 0) {
        const nomeRaiz = String(raw['nome'] || raw['categoria'] || raw['nomeCategoria'] || '').trim();
        if (!nomeRaiz) {
          next();
          return;
        }
        this.categoriasApi
          .salvar({ idEmpresa: idEmpresaAtual, tipo, nome: nomeRaiz })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (lista) => {
              const raiz = (lista || []).find(
                (c) => c.tipo === tipo && c.nome.toLowerCase() === nomeRaiz.toLowerCase()
              );
              const idPai = raiz ? this.parseIdRaiz(raiz.id) : null;
              if (idPai == null) {
                next();
                return;
              }
              this.importarFilhosSequencial(idEmpresaAtual, tipo, idPai, children as unknown[], next);
            },
            error: () => next(),
          });
        return;
      }
      const categoria = String(raw['categoria'] || raw['nomeCategoria'] || raw['nome'] || '').trim();
      const subcategoria = String(raw['subcategoria'] || raw['nomeSubcategoria'] || '').trim();
      if (!categoria) {
        next();
        return;
      }
      this.categoriasApi
        .salvar({
          idEmpresa: idEmpresaAtual,
          tipo,
          nome: categoria,
          nomeCategoria: categoria,
          nomeSubcategoria: subcategoria || undefined,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => next(),
          error: () => next(),
        });
    };
    next();
  }

  private importarFilhosSequencial(
    idEmpresaAtual: number,
    tipo: TipoCategoriaFinanceira,
    parentId: number,
    filhos: unknown[],
    done: () => void
  ): void {
    const fila = [...filhos];
    const step = (): void => {
      const el = fila.shift();
      if (!el) {
        done();
        return;
      }
      const o = el as Record<string, unknown>;
      const nome = String(o['nome'] || '').trim();
      const nested = o['children'];
      if (!nome) {
        step();
        return;
      }
      this.categoriasApi
        .salvar({ idEmpresa: idEmpresaAtual, tipo, nome, parentId })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (lista) => {
            if (Array.isArray(nested) && (nested as unknown[]).length > 0) {
              const recém = this.findDirectChildId(lista || [], tipo, parentId, nome);
              if (recém != null) {
                this.importarFilhosSequencial(idEmpresaAtual, tipo, recém, nested as unknown[], step);
                return;
              }
            }
            step();
          },
          error: () => step(),
        });
    };
    step();
  }

  private findDirectChildId(
    lista: CategoriaFinanceira[],
    tipo: TipoCategoriaFinanceira,
    parentId: number,
    nomeFilho: string
  ): number | null {
    for (const c of lista) {
      if (c.tipo !== tipo) continue;
      const rootId = this.parseIdRaiz(c.id);
      if (rootId == null) continue;
      if (rootId === parentId) {
        const hit = (c.subcategorias || []).find((s) => s.nome === nomeFilho);
        return hit?.id ?? null;
      }
      const deep = this.findChildUnderSubs(c.subcategorias, parentId, nomeFilho);
      if (deep != null) return deep;
    }
    return null;
  }

  private findChildUnderSubs(
    subs: SubcategoriaFinanceira[] | undefined,
    parentId: number,
    nomeFilho: string
  ): number | null {
    for (const s of subs || []) {
      if (s.id === parentId) {
        const hit = (s.children || []).find((ch) => ch.nome === nomeFilho);
        return hit?.id ?? null;
      }
      const deep = this.findChildUnderSubs(s.children, parentId, nomeFilho);
      if (deep != null) return deep;
    }
    return null;
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
