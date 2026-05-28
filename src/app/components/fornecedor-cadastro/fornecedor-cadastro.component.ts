import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  ConsultaCnpjResult,
  FornecedorCadastro,
  FornecedorCadastroPayload,
  FornecedorCadastroService
} from '../../services/fornecedor-cadastro.service';
import { maskBrPhone, maskCpfCnpj, onlyDigits } from '../../utils/input-masks';
import {
  buildDeleteConfirmOptions,
  confirmUnsavedChanges,
  showErrorAlert,
  showValidationAlert
} from '../../utils/sweet-alerts';
import { sincronizarResumoParametrizacao } from '../../utils/parametrizacao-sync.util';

@Component({
  selector: 'app-fornecedor-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fornecedor-cadastro.component.html'
})
export class FornecedorCadastroComponent implements OnInit {
  @Input() embedded = false;
  @Output() cadastroAlterado = new EventEmitter<void>();

  carregando = false;
  erro: string | null = null;
  linhas: FornecedorCadastro[] = [];

  filtroQ = '';
  filtroTipoPessoa: '' | 'PF' | 'PJ' = '';
  filtroAtivo: 'todos' | 'sim' | 'nao' = 'todos';

  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  totalPages = 0;

  modalAberto = false;
  editandoId: number | null = null;
  formRazaoSocial = '';
  formNomeFantasia = '';
  formCpfCnpj = '';
  formTipoPessoa: 'PF' | 'PJ' = 'PJ';
  formEmail = '';
  formTelefone = '';
  formAtivo = true;
  private modalSnapshot = '';
  consultandoCnpj = false;
  statusConsultaCnpj: string | null = null;
  private ultimoCnpjConsultado = '';

  private readonly coresAvatar = [
    'bg-emerald-600',
    'bg-blue-600',
    'bg-violet-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600'
  ];

  constructor(
    private readonly api: FornecedorCadastroService,
    private readonly companySelector: CompanySelectorService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$.subscribe(() => {
      this.carregar();
    });
    this.companySelector.empresasPermitidas$.subscribe(() => {
      this.carregar();
    });
  }

  private idEmpresaContexto(): number | null {
    const selecionada = this.companySelector.obterIdEmpresaSelecionada();
    if (selecionada != null && selecionada > 0) {
      return selecionada;
    }
    const primeiraAtiva = this.companySelector.obterEmpresasAtivas()[0];
    return primeiraAtiva?.idEmpresa ?? null;
  }

  carregar(): void {
    this.erro = null;
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.carregando = false;
      this.linhas = [];
      this.totalElements = 0;
      this.totalPages = 0;
      this.erro = null;
      return;
    }
    this.carregando = true;
    const tp = this.filtroTipoPessoa || undefined;
    let ativo: boolean | undefined;
    if (this.filtroAtivo === 'sim') {
      ativo = true;
    } else if (this.filtroAtivo === 'nao') {
      ativo = false;
    }
    this.api
      .listar({
        q: this.filtroQ || undefined,
        idEmpresa: idEmpresaAtual,
        tipoPessoa: tp,
        ativo,
        page: this.pageIndex,
        size: this.pageSize,
        sort: 'razaoSocial,asc'
      })
      .subscribe({
        next: (page) => {
          this.linhas = page?.content ?? [];
          this.totalElements = page?.totalElements ?? 0;
          this.totalPages = page?.totalPages ?? 0;
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível carregar os fornecedores.';
          this.linhas = [];
          void showErrorAlert(this.erro ?? 'Não foi possível carregar os fornecedores.', 'Erro ao carregar fornecedores');
        }
      });
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    this.carregar();
  }

  limparFiltros(): void {
    this.filtroQ = '';
    this.filtroTipoPessoa = '';
    this.filtroAtivo = 'todos';
    this.pageIndex = 0;
    this.carregar();
  }

  indiceGlobal(i: number): number {
    return this.pageIndex * this.pageSize + i + 1;
  }

  subtitulo(f: FornecedorCadastro): string {
    const fant = (f.nomeFantasia || '').trim();
    return fant || (f.tipoPessoa === 'PF' ? 'Pessoa física' : 'Pessoa jurídica');
  }

  textoContato(f: FornecedorCadastro): string {
    const tel = (f.telefone || '').trim();
    const em = (f.email || '').trim();
    const parts: string[] = [];
    parts.push(tel ? tel : 'Sem telefone');
    parts.push(em ? em : 'Sem e-mail');
    return parts.join(' · ');
  }

  subtituloEmpresas(f: FornecedorCadastro): string {
    const nomes = (f.empresas || []).map((e) => e.nomeEmpresa).filter(Boolean);
    return nomes.length ? nomes.join(' · ') : 'Sem empresa vinculada';
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formRazaoSocial = '';
    this.formNomeFantasia = '';
    this.formCpfCnpj = '';
    this.formTipoPessoa = 'PJ';
    this.formEmail = '';
    this.formTelefone = '';
    this.formAtivo = true;
    this.statusConsultaCnpj = null;
    this.consultandoCnpj = false;
    this.ultimoCnpjConsultado = '';
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(f: FornecedorCadastro): void {
    this.editandoId = f.id;
    this.formRazaoSocial = f.razaoSocial || '';
    this.formNomeFantasia = f.nomeFantasia || '';
    this.formCpfCnpj = maskCpfCnpj(onlyDigits(f.cpfCnpj || ''));
    this.formTipoPessoa = f.tipoPessoa === 'PF' ? 'PF' : 'PJ';
    this.formEmail = f.email || '';
    this.formTelefone = maskBrPhone(onlyDigits(f.telefone || ''));
    this.formAtivo = f.ativo !== false;
    this.statusConsultaCnpj = null;
    this.consultandoCnpj = false;
    this.ultimoCnpjConsultado = onlyDigits(this.formCpfCnpj);
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  async fecharModal(): Promise<void> {
    if (this.temAlteracoesModal()) {
      const deveFechar = await confirmUnsavedChanges();
      if (!deveFechar) return;
    }
    this.modalAberto = false;
    this.consultandoCnpj = false;
    this.statusConsultaCnpj = null;
    this.ultimoCnpjConsultado = '';
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      editandoId: this.editandoId,
      formRazaoSocial: this.formRazaoSocial,
      formNomeFantasia: this.formNomeFantasia,
      formCpfCnpj: this.formCpfCnpj,
      formTipoPessoa: this.formTipoPessoa,
      formEmail: this.formEmail,
      formTelefone: this.formTelefone,
      formAtivo: this.formAtivo
    });
  }

  private atualizarSnapshotModal(): void {
    this.modalSnapshot = this.estadoModalAtual();
  }

  private temAlteracoesModal(): boolean {
    if (!this.modalAberto) return false;
    return this.modalSnapshot !== this.estadoModalAtual();
  }

  onCpfCnpjBlur(): void {
    const digits = onlyDigits(this.formCpfCnpj);
    this.formCpfCnpj = maskCpfCnpj(digits);
    this.atualizarTipoPessoaPorDocumento(digits);
    this.tentarConsultaCnpj(digits);
  }

  onCpfCnpjInput(): void {
    const digits = onlyDigits(this.formCpfCnpj).slice(0, 14);
    this.formCpfCnpj = maskCpfCnpj(digits);
    this.atualizarTipoPessoaPorDocumento(digits);

    if (digits.length < 14) {
      this.statusConsultaCnpj = null;
      return;
    }

    this.tentarConsultaCnpj(digits);
  }

  private aplicarDadosCnpj(cnpj: string, dados: ConsultaCnpjResult): void {
    const razao = (dados.razaoSocial || '').trim();
    const fantasia = (dados.nomeFantasia || '').trim();

    if (razao) {
      this.formRazaoSocial = razao;
    }
    if (fantasia) {
      this.formNomeFantasia = fantasia;
    }

    this.ultimoCnpjConsultado = cnpj;
    if (razao || fantasia) {
      this.statusConsultaCnpj = 'Dados preenchidos automaticamente pelo CNPJ.';
    } else {
      this.statusConsultaCnpj = 'CNPJ encontrado, mas sem dados de razao social/fantasia.';
    }
  }

  onTelefoneInput(): void {
    const digits = onlyDigits(this.formTelefone);
    this.formTelefone = maskBrPhone(digits);
  }

  onTelefoneBlur(): void {
    const digits = onlyDigits(this.formTelefone);
    this.formTelefone = maskBrPhone(digits);
  }

  private atualizarTipoPessoaPorDocumento(digits: string): void {
    if (digits.length === 11) {
      this.formTipoPessoa = 'PF';
      return;
    }
    if (digits.length === 14) {
      this.formTipoPessoa = 'PJ';
    }
  }

  private tentarConsultaCnpj(digits: string): void {
    if (digits.length !== 14 || this.consultandoCnpj) {
      return;
    }

    if (digits === this.ultimoCnpjConsultado && this.formRazaoSocial.trim()) {
      return;
    }

    this.consultandoCnpj = true;
    this.statusConsultaCnpj = null;
    this.api
      .consultarCnpj(digits)
      .pipe(finalize(() => (this.consultandoCnpj = false)))
      .subscribe({
        next: (dados) => this.aplicarDadosCnpj(digits, dados),
        error: () => {
          this.statusConsultaCnpj = 'Não foi possível consultar o CNPJ automaticamente no momento. Preencha os dados manualmente.';
          void showErrorAlert(
            'Não foi possível consultar o CNPJ automaticamente no momento. Preencha os dados manualmente.',
            'Erro na consulta de CNPJ'
          );
        }
      });
  }

  montarPayload(): FornecedorCadastroPayload {
    const idEmpresaAtual = this.idEmpresaContexto();
    const documento = onlyDigits(this.formCpfCnpj);
    const telefone = onlyDigits(this.formTelefone);
    return {
      razaoSocial: this.formRazaoSocial.trim(),
      nomeFantasia: this.formNomeFantasia.trim() || undefined,
      cpfCnpj: documento || undefined,
      tipoPessoa: this.formTipoPessoa,
      email: this.formEmail.trim() || undefined,
      telefone: telefone || undefined,
      ativo: this.formAtivo,
      idEmpresas: idEmpresaAtual != null && idEmpresaAtual > 0 ? [idEmpresaAtual] : []
    };
  }

  salvar(): void {
    const razao = this.formRazaoSocial.trim();
    if (!razao) {
      this.erro = 'Informe a razão social ou nome.';
      void showValidationAlert(this.erro);
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa do cadastro.';
      void showErrorAlert(this.erro, 'Empresa não identificada');
      return;
    }
    const body = this.montarPayload();
    this.erro = null;
    this.carregando = true;
    const req =
      this.editandoId != null ? this.api.atualizar(this.editandoId, body) : this.api.criar(body);
    req.subscribe({
      next: () => {
        this.carregando = false;
        this.modalAberto = false;
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Erro ao salvar o fornecedor.';
        void showErrorAlert(this.erro ?? 'Erro ao salvar o fornecedor.', 'Erro ao salvar fornecedor');
      }
    });
  }

  async excluir(f: FornecedorCadastro): Promise<void> {
    const nome = f.razaoSocial || 'este fornecedor';
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('fornecedor', nome));
    if (!confirmacao.isConfirmed) {
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.api.excluir(f.id).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir.';
        void showErrorAlert(this.erro ?? 'Não foi possível excluir.', 'Erro ao excluir fornecedor');
      }
    });
  }

  alternarAtivo(f: FornecedorCadastro): void {
    const novo = !f.ativo;
    this.erro = null;
    this.carregando = true;
    this.api.setAtivo(f.id, novo).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível alterar o status.';
        void showErrorAlert(this.erro ?? 'Não foi possível alterar o status.', 'Erro ao alterar status');
      }
    });
  }

  irPrimeira(): void {
    if (this.pageIndex !== 0) {
      this.pageIndex = 0;
      this.carregar();
    }
  }

  irAnterior(): void {
    if (this.pageIndex > 0) {
      this.pageIndex -= 1;
      this.carregar();
    }
  }

  irProxima(): void {
    if (this.pageIndex < this.totalPages - 1) {
      this.pageIndex += 1;
      this.carregar();
    }
  }

  irUltima(): void {
    const last = Math.max(0, this.totalPages - 1);
    if (this.pageIndex !== last) {
      this.pageIndex = last;
      this.carregar();
    }
  }

  rangeExibicao(): { from: number; to: number } {
    if (this.totalElements === 0) {
      return { from: 0, to: 0 };
    }
    const from = this.pageIndex * this.pageSize + 1;
    const to = Math.min(this.totalElements, (this.pageIndex + 1) * this.pageSize);
    return { from, to };
  }

  corAvatar(i: number): string {
    return this.coresAvatar[i % this.coresAvatar.length];
  }

  inicial(nome: string | undefined): string {
    const t = (nome || '?').trim();
    return t ? t.charAt(0).toUpperCase() : '?';
  }
}
