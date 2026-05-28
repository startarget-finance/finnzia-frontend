import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { extractHttpErrorBodyMessage } from '../../services/error.service';
import { buildDeleteConfirmOptions, confirmUnsavedChanges } from '../../utils/sweet-alerts';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';
import { PLANO_CONTAS_PADRAO_BOM_CONTROLE } from '../../data/plano-contas-padrao-bom-controle';
import { PlanoContasPadraoService } from '../../services/plano-contas-padrao.service';
import {
  adicionarFilho,
  adicionarRaiz,
  excluirNoNaArvore,
  parseArvoreJsonParaCategorias,
  parseIdRaizUtil,
  proximoIdTemporario,
  renomearNoNaArvore,
  serializarCategoriasParaJson,
  contarNosCategoriasFinanceiras,
} from '../../utils/plano-contas-padrao-tree.util';
import { sincronizarResumoParametrizacao } from '../../utils/parametrizacao-sync.util';

@Component({
  selector: 'app-plano-contas-gerencial',
  standalone: true,
  imports: [CommonModule, FormsModule, FeedbackStateComponent],
  templateUrl: './plano-contas-gerencial.component.html',
})
export class PlanoContasGerencialComponent implements OnInit, OnDestroy {
  /** Quando true, usado dentro da Parametrização — sem moldura de página inteira. */
  @Input() embedded = false;
  /** Admin: edita o modelo global (memória + salvar no servidor), sem API por empresa. */
  @Input() modoTemplateSistema = false;
  @Output() cadastroAlterado = new EventEmitter<void>();

  templateMetaAtualizacao = '';
  templateUsandoEmbutido = false;
  templateSalvando = false;
  private templateRaizSeq = 1;
  private templateNoId = 1000;

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
  /** Evita abrir o SweetAlert de oferta duas vezes no mesmo ciclo de vida do componente. */
  private ofertaPlanoPadraoAgendada = false;

  constructor(
    private readonly categoriasApi: CategoriasFinanceirasService,
    private readonly companySelector: CompanySelectorService,
    private readonly authService: AuthService,
    private readonly planoContasPadrao: PlanoContasPadraoService
  ) {}

  ngOnInit(): void {
    if (this.modoTemplateSistema) {
      this.carregarTemplateSistema();
      return;
    }
    this.companySelector.empresasPermitidas$.pipe(takeUntil(this.destroy$)).subscribe((list) => {
      this.empresasDisponiveis = (list || []).filter((e) => e.ativo && e.idEmpresa);
      this.carregar();
    });
    this.companySelector.empresaSelecionada$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.ofertaPlanoPadraoAgendada = false;
      this.carregar();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Lista carregada com sucesso e sem nenhuma conta (evita confundir com erro de API). */
  get planoVazioSucesso(): boolean {
    if (this.carregando || this.erro) return false;
    if ((this.categorias?.length ?? 0) > 0) return false;
    if (this.modoTemplateSistema) return true;
    if (!this.authService.isAuthenticated() || !this.authService.getToken()) return false;
    const idEmpresa = this.idEmpresaContexto();
    if (idEmpresa == null || idEmpresa <= 0) return false;
    return true;
  }

  carregar(): void {
    if (this.modoTemplateSistema) {
      this.carregarTemplateSistema();
      return;
    }
    this.erro = null;
    if (!this.authService.isAuthenticated() || !this.authService.getToken()) {
      this.carregando = false;
      this.categorias = [];
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.carregando = false;
      this.categorias = [];
      return;
    }
    this.carregando = true;
    this.categoriasApi.listar(idEmpresaAtual).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.limparExpansaoPlano();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
        this.carregando = false;
        this.agendarOfertaPlanoPadraoSeVazio();
      },
      error: (e: HttpErrorResponse) => {
        this.carregando = false;
        this.categorias = [];
        this.erro =
          extractHttpErrorBodyMessage(e.error) || 'Não foi possível carregar categorias.';
      },
    });
  }

  /** Conta nós em toda a floresta (raízes + descendentes). Usado no template. */
  contarNos(raizes: CategoriaFinanceira[]): number {
    return contarNosCategoriasFinanceiras(raizes);
  }

  porTipo(tipo: TipoCategoriaFinanceira): CategoriaFinanceira[] {
    return (this.categorias || []).filter((c) => c.tipo === tipo);
  }

  /** `r:id` ou `n:raiz|caminhoPai|noId` — ausente na map = expandido (padrão). */
  private readonly expansaoPlano = new Map<string, boolean>();

  chaveRaizPlano(c: CategoriaFinanceira): string {
    return `r:${String(c.id)}`;
  }

  chaveNoPlano(raiz: CategoriaFinanceira, caminhoPai: string, no: SubcategoriaFinanceira): string {
    return `n:${String(raiz.id)}:${caminhoPai}:n${String(no.id)}`;
  }

  raizTemSubcategorias(c: CategoriaFinanceira): boolean {
    return (c.subcategorias?.length ?? 0) > 0;
  }

  noTemSubnos(no: SubcategoriaFinanceira): boolean {
    return (no.children?.length ?? 0) > 0;
  }

  /** Com filhos: ausente ou `true` = aberto; `false` = fechado. */
  planoNoExpandido(chave: string, temFilhos: boolean): boolean {
    if (!temFilhos) {
      return false;
    }
    if (!this.expansaoPlano.has(chave)) {
      return true;
    }
    return this.expansaoPlano.get(chave) === true;
  }

  alternarExpansaoPlano(chave: string, temFilhos: boolean): void {
    if (!temFilhos) {
      return;
    }
    const aberto = this.planoNoExpandido(chave, true);
    this.expansaoPlano.set(chave, !aberto);
  }

  expandirColunaPlano(tipo: TipoCategoriaFinanceira): void {
    for (const c of this.porTipo(tipo)) {
      if (this.raizTemSubcategorias(c)) {
        this.expansaoPlano.set(this.chaveRaizPlano(c), true);
      }
      this.aplicarExpansaoEmSubarvore(c, c.nome, true);
    }
  }

  recolherColunaPlano(tipo: TipoCategoriaFinanceira): void {
    for (const c of this.porTipo(tipo)) {
      if (this.raizTemSubcategorias(c)) {
        this.expansaoPlano.set(this.chaveRaizPlano(c), false);
      }
      this.aplicarExpansaoEmSubarvore(c, c.nome, false);
    }
  }

  private aplicarExpansaoEmSubarvore(
    raiz: CategoriaFinanceira,
    caminhoPai: string,
    aberto: boolean
  ): void {
    for (const s of raiz.subcategorias || []) {
      if (this.noTemSubnos(s)) {
        this.expansaoPlano.set(this.chaveNoPlano(raiz, caminhoPai, s), aberto);
      }
      if (s.children?.length) {
        this.aplicarExpansaoEmChildren(raiz, caminhoPai + ' › ' + s.nome, s.children, aberto);
      }
    }
  }

  private aplicarExpansaoEmChildren(
    raiz: CategoriaFinanceira,
    caminhoPai: string,
    filhos: SubcategoriaFinanceira[],
    aberto: boolean
  ): void {
    for (const s of filhos || []) {
      if (this.noTemSubnos(s)) {
        this.expansaoPlano.set(this.chaveNoPlano(raiz, caminhoPai, s), aberto);
      }
      if (s.children?.length) {
        this.aplicarExpansaoEmChildren(raiz, caminhoPai + ' › ' + s.nome, s.children, aberto);
      }
    }
  }

  private limparExpansaoPlano(): void {
    this.expansaoPlano.clear();
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
    if (this.modoTemplateSistema) {
      this.salvarTemplateLocal(nome);
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
            sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
            this.modalAberto = false;
            this.modalModo = 'raiz';
            this.modalAcao = 'novo';
            this.formEditarId = null;
            this.carregando = false;
          },
          error: (e: HttpErrorResponse) => {
            this.carregando = false;
            this.erro = extractHttpErrorBodyMessage(e.error) || 'Não foi possível salvar.';
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
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
          this.modalAberto = false;
          this.modalModo = 'raiz';
          this.modalAcao = 'novo';
          this.formEditarId = null;
          this.carregando = false;
        },
        error: (e: HttpErrorResponse) => {
          this.carregando = false;
          this.erro = extractHttpErrorBodyMessage(e.error) || 'Não foi possível salvar.';
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
    if (this.modoTemplateSistema) {
      this.erro = null;
      if (!excluirNoNaArvore(this.categorias, nodeId)) {
        this.erro = 'Não foi possível excluir este item.';
        return;
      }
      this.categorias = [...this.categorias];
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    this.erro = null;
    this.carregando = true;
    this.categoriasApi.excluirNo(idEmpresaAtual ?? null, nodeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
        this.carregando = false;
      },
      error: (e: HttpErrorResponse) => {
        this.carregando = false;
        this.erro = extractHttpErrorBodyMessage(e.error) || 'Não foi possível excluir.';
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
    if (this.modoTemplateSistema) {
      const input = ev.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arr = JSON.parse(String(reader.result || ''));
          if (!Array.isArray(arr)) throw new Error('array');
          this.categorias = parseArvoreJsonParaCategorias(arr);
          this.syncTemplateIdCounters();
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
          this.erro = null;
        } catch {
          this.erro = 'Arquivo JSON inválido para o plano padrão.';
        }
      };
      reader.readAsText(file);
      return;
    }
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

  private importarLote(idEmpresaAtual: number, items: unknown[], onCompleto?: () => void): void {
    const itens = [...items];
    if (itens.length === 0) {
      onCompleto?.();
      this.carregar();
      return;
    }
    this.carregando = true;
    const next = (): void => {
      const item = itens.shift();
      if (!item) {
        this.carregando = false;
        onCompleto?.();
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
        const hit = (c.subcategorias || []).find(
          (s) => s.nome.toLowerCase() === nomeFilho.toLowerCase()
        );
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
        const hit = (s.children || []).find(
          (ch) => ch.nome.toLowerCase() === nomeFilho.toLowerCase()
        );
        return hit?.id ?? null;
      }
      const deep = this.findChildUnderSubs(s.children, parentId, nomeFilho);
      if (deep != null) return deep;
    }
    return null;
  }

  carregarTemplateSistema(): void {
    this.carregando = true;
    this.erro = null;
    this.planoContasPadrao
      .obterAdmin()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.aplicarRespostaTemplate(res),
        error: (err) => {
          this.carregando = false;
          this.erro =
            extractHttpErrorBodyMessage(err?.error) || 'Não foi possível carregar o plano padrão do sistema.';
        },
      });
  }

  salvarTemplateNoServidor(): void {
    const arvore = serializarCategoriasParaJson(this.categorias);
    if (!arvore.length) {
      this.erro = 'Inclua ao menos uma categoria raiz antes de salvar.';
      return;
    }
    this.templateSalvando = true;
    this.erro = null;
    this.planoContasPadrao
      .salvarAdmin(arvore)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.templateSalvando = false;
          this.aplicarRespostaTemplate(res);
          void Swal.fire({
            icon: 'success',
            title: 'Plano padrão publicado',
            text: 'Novas empresas usarão este modelo no preenchimento automático.',
            timer: 2800,
            showConfirmButton: false,
          });
        },
        error: (err) => {
          this.templateSalvando = false;
          this.erro = extractHttpErrorBodyMessage(err?.error) || 'Não foi possível salvar no servidor.';
        },
      });
  }

  async restaurarTemplateEmbutido(): Promise<void> {
    const ok = await Swal.fire({
      title: 'Restaurar modelo original?',
      text: 'Substitui o rascunho atual pelo plano embutido do finzzia.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Restaurar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    this.templateSalvando = true;
    this.planoContasPadrao
      .restaurarEmbutidoAdmin()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.templateSalvando = false;
          this.aplicarRespostaTemplate(res);
        },
        error: (err) => {
          this.templateSalvando = false;
          this.erro = extractHttpErrorBodyMessage(err?.error) || 'Falha ao restaurar.';
        },
      });
  }

  aplicarModeloEmbutidoLocal(): void {
    this.categorias = parseArvoreJsonParaCategorias([...PLANO_CONTAS_PADRAO_BOM_CONTROLE]);
    this.syncTemplateIdCounters();
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
    this.templateUsandoEmbutido = true;
    this.templateMetaAtualizacao = 'Rascunho local — modelo embutido (ainda não salvo no servidor).';
  }

  private aplicarRespostaTemplate(res: {
    arvore?: unknown[];
    dataAtualizacao?: string | null;
    atualizadoPorEmail?: string | null;
    usandoPadraoEmbutido?: boolean;
  }): void {
    this.carregando = false;
    this.templateUsandoEmbutido = !!res.usandoPadraoEmbutido;
    const arvore = Array.isArray(res.arvore) ? res.arvore : [];
    this.categorias = parseArvoreJsonParaCategorias(arvore.length ? arvore : [...PLANO_CONTAS_PADRAO_BOM_CONTROLE]);
    this.syncTemplateIdCounters();
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
    if (res.usandoPadraoEmbutido) {
      this.templateMetaAtualizacao =
        'Nenhuma versão salva no servidor — exibindo modelo embutido. Edite e clique em Publicar no servidor.';
    } else if (res.dataAtualizacao) {
      const por = res.atualizadoPorEmail ? ` por ${res.atualizadoPorEmail}` : '';
      this.templateMetaAtualizacao = `Publicado em ${new Date(res.dataAtualizacao).toLocaleString('pt-BR')}${por}`;
    } else {
      this.templateMetaAtualizacao = '';
    }
  }

  private salvarTemplateLocal(nome: string): void {
    this.erro = null;
    if (this.modalAcao === 'editar' && this.formEditarId != null) {
      if (!renomearNoNaArvore(this.categorias, this.formEditarId, nome)) {
        this.erro = 'Não foi possível renomear esta conta.';
        return;
      }
    } else if (this.modalModo === 'raiz') {
      const r = adicionarRaiz(this.categorias, this.formTipo, nome, this.templateRaizSeq, this.templateNoId);
      this.templateRaizSeq = r.raizSeq;
      this.templateNoId = r.noId;
    } else {
      const raw = this.formParentDbId;
      const parentId = raw != null ? Math.trunc(Number(raw)) : NaN;
      if (!Number.isFinite(parentId) || parentId <= 0) {
        this.erro = 'Conta superior inválida.';
        return;
      }
      this.templateNoId = adicionarFilho(this.categorias, parentId, nome, this.templateNoId);
    }
    this.categorias = [...this.categorias];
          sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
    this.modalAberto = false;
    this.modalModo = 'raiz';
    this.modalAcao = 'novo';
    this.formEditarId = null;
  }

  private syncTemplateIdCounters(): void {
    this.templateNoId = proximoIdTemporario(this.categorias);
    let maxRaiz = 0;
    for (const c of this.categorias) {
      const r = parseIdRaizUtil(String(c.id));
      if (r != null && r > maxRaiz) maxRaiz = r;
    }
    this.templateRaizSeq = maxRaiz + 1;
  }

  private idEmpresaContexto(): number | null {
    if (this.modoTemplateSistema) return 1;
    const selecionada = this.companySelector.obterIdEmpresaSelecionada();
    if (selecionada != null && selecionada > 0) {
      return selecionada;
    }
    const primeiraAtiva = this.companySelector.obterEmpresasAtivas()[0];
    return primeiraAtiva?.idEmpresa ?? null;
  }

  private chaveSessaoOfertaPlanoPadrao(idEmpresa: number): string {
    return `finnzia_oferta_plano_padrao_${idEmpresa}`;
  }

  /** Pergunta automático vs manual (fluxo semelhante ao Bom Controle) quando o plano está vazio. */
  private agendarOfertaPlanoPadraoSeVazio(): void {
    if (this.ofertaPlanoPadraoAgendada) {
      return;
    }
    if (!this.planoVazioSucesso) {
      return;
    }
    const id = this.idEmpresaContexto();
    if (id == null || id <= 0) {
      return;
    }
    if (sessionStorage.getItem(this.chaveSessaoOfertaPlanoPadrao(id))) {
      return;
    }
    this.ofertaPlanoPadraoAgendada = true;
    setTimeout(() => void this.dialogoPreencherPlanoPadrao(), 0);
  }

  private async dialogoPreencherPlanoPadrao(): Promise<void> {
    const id = this.idEmpresaContexto();
    if (id == null || id <= 0 || !this.planoVazioSucesso) {
      return;
    }
    const res = await Swal.fire({
      title: 'Plano de contas vazio',
      html:
        'Deseja <strong>preencher as categorias financeiras padrão automaticamente</strong> (modelo de gestão)?<br><br>' +
        'Você pode editar ou excluir depois. Se preferir cadastrar tudo sozinho, escolha <strong>Manual</strong>.',
      icon: 'question',
      confirmButtonText: 'Automático',
      denyButtonText: 'Manual',
      showDenyButton: true,
      cancelButtonText: 'Agora não',
      showCancelButton: true,
      focusCancel: true,
    });
    if (res.isConfirmed) {
      this.aplicarPlanoContasPadraoBomControle();
      return;
    }
    sessionStorage.setItem(this.chaveSessaoOfertaPlanoPadrao(id), '1');
  }

  /** Botão na área vazia ou ação direta do usuário. */
  aplicarPlanoContasPadraoBomControle(): void {
    const id = this.idEmpresaContexto();
    if (id == null || id <= 0) {
      this.erro = 'Selecione uma empresa para aplicar o plano padrão.';
      return;
    }
    this.erro = null;
    this.planoContasPadrao.obter().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const arvore = Array.isArray(res?.arvore) && res.arvore.length > 0
          ? [...res.arvore]
          : [...PLANO_CONTAS_PADRAO_BOM_CONTROLE];
        this.importarLote(id, arvore, () => {
          sessionStorage.setItem(this.chaveSessaoOfertaPlanoPadrao(id), 'aplicado');
          void Swal.fire({
            icon: 'success',
            title: 'Categorias padrão criadas',
            text: 'Ajuste nomes e níveis conforme a sua operação.',
            timer: 2800,
            showConfirmButton: false,
          });
        });
      },
      error: () => {
        const copia = [...PLANO_CONTAS_PADRAO_BOM_CONTROLE];
        this.importarLote(id, copia, () => {
          sessionStorage.setItem(this.chaveSessaoOfertaPlanoPadrao(id), 'aplicado');
          void Swal.fire({
            icon: 'success',
            title: 'Categorias padrão criadas',
            text: 'Ajuste nomes e níveis conforme a sua operação.',
            timer: 2800,
            showConfirmButton: false,
          });
        });
      },
    });
  }
}
