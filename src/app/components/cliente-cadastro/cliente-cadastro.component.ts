import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CompanySelectorService } from '../../services/company-selector.service';
import Swal from 'sweetalert2';
import {
  ClienteCadastro,
  ClienteCadastroPayload,
  ClienteCadastroService
} from '../../services/cliente-cadastro.service';
import { CepLookupService } from '../../services/cep-lookup.service';
import { maskBrPhone, maskCep, maskCpf, maskCpfCnpj, onlyDigits } from '../../utils/input-masks';
import {
  buildDeleteConfirmOptions,
  confirmUnsavedChanges,
  showErrorAlert,
  showValidationAlert
} from '../../utils/sweet-alerts';
import { sincronizarResumoParametrizacao } from '../../utils/parametrizacao-sync.util';
import { FinzziaModalComponent } from '../../shared/components/finzzia-modal/finzzia-modal.component';

@Component({
  selector: 'app-cliente-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule, FinzziaModalComponent],
  templateUrl: './cliente-cadastro.component.html'
})
export class ClienteCadastroComponent implements OnInit {
  @Input() embedded = false;
  /** Total de clientes (todas as páginas) para resumo na parametrização. */
  @Output() cadastroAlterado = new EventEmitter<void>();

  carregando = false;
  erro: string | null = null;
  linhas: ClienteCadastro[] = [];

  filtroQ = '';
  filtroClassificacao: number | null = null;
  filtroTipoPessoa: '' | 'PF' | 'PJ' = '';

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
  formClassificacao = 3;
  formEmail = '';
  formCelular = '';
  formEndereco = '';
  formCep = '';
  formResponsavel = '';
  formCpf = '';
  formBloqueado = false;
  consultandoCnpj = false;
  consultandoCep = false;
  statusConsultaCep: string | null = null;
  private ultimoCnpjConsultado = '';
  private ultimoCepConsultado = '';
  private cnpjLookupTimer: ReturnType<typeof setTimeout> | null = null;
  private cepLookupTimer: ReturnType<typeof setTimeout> | null = null;
  private modalSnapshot = '';

  private readonly coresAvatar = [
    'bg-emerald-600',
    'bg-blue-600',
    'bg-violet-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600'
  ];

  constructor(
    private readonly api: ClienteCadastroService,
    private readonly companySelector: CompanySelectorService,
    private readonly cepLookup: CepLookupService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$.subscribe(() => {
      this.carregar();
    });
    this.companySelector.empresasPermitidas$.subscribe(() => {
      this.carregar();
    });
  }

  onCpfCnpjInput(): void {
    const digits = onlyDigits(this.formCpfCnpj);
    this.formCpfCnpj = maskCpfCnpj(digits);
    if (digits.length === 11) this.formTipoPessoa = 'PF';
    if (digits.length === 14) this.formTipoPessoa = 'PJ';
    if (digits.length === 14 && this.formTipoPessoa === 'PJ') {
      this.agendarConsultaCnpj(digits);
    }
  }

  onCpfCnpjBlur(): void {
    const digits = onlyDigits(this.formCpfCnpj);
    this.formCpfCnpj = maskCpfCnpj(digits);
    if (digits.length === 14 && this.formTipoPessoa === 'PJ') {
      this.consultarCnpjParaPreencher(digits);
    }
  }

  onCelularInput(): void {
    const digits = onlyDigits(this.formCelular);
    this.formCelular = maskBrPhone(digits);
  }

  onCelularBlur(): void {
    const digits = onlyDigits(this.formCelular);
    this.formCelular = maskBrPhone(digits);
  }

  onCepInput(): void {
    const digits = onlyDigits(this.formCep);
    this.formCep = maskCep(digits);
    this.statusConsultaCep = null;
    if (digits.length === 8) {
      this.agendarConsultaCep(digits);
    }
  }

  onCepBlur(): void {
    const digits = onlyDigits(this.formCep);
    this.formCep = maskCep(digits);
    if (digits.length === 8) {
      this.consultarCepParaPreencher(digits);
    }
  }

  onCpfContatoInput(): void {
    const digits = onlyDigits(this.formCpf);
    this.formCpf = maskCpf(digits);
  }

  onCpfContatoBlur(): void {
    const digits = onlyDigits(this.formCpf);
    this.formCpf = maskCpf(digits);
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
    const idEmp = this.idEmpresaContexto();
    if (idEmp == null || idEmp <= 0) {
      this.carregando = false;
      this.linhas = [];
      this.totalElements = 0;
      this.totalPages = 0;
      this.erro = null;
      return;
    }

    this.carregando = true;
    const cls =
      this.filtroClassificacao != null && this.filtroClassificacao >= 1 && this.filtroClassificacao <= 5
        ? this.filtroClassificacao
        : undefined;
    const tp = this.filtroTipoPessoa || undefined;
    this.api
      .listar({
        q: this.filtroQ || undefined,
        idEmpresa: idEmp,
        classificacao: cls,
        tipoPessoa: tp,
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
          this.erro = e.error?.mensagem || 'Não foi possível carregar os clientes.';
          this.linhas = [];
          void showErrorAlert(this.erro ?? 'Não foi possível carregar os clientes.', 'Erro ao carregar clientes');
        }
      });
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    this.carregar();
  }

  limparFiltros(): void {
    this.filtroQ = '';
    this.filtroClassificacao = null;
    this.filtroTipoPessoa = '';
    this.pageIndex = 0;
    this.carregar();
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formRazaoSocial = '';
    this.formNomeFantasia = '';
    this.formCpfCnpj = '';
    this.formTipoPessoa = 'PJ';
    this.formClassificacao = 3;
    this.formEmail = '';
    this.formCelular = '';
    this.formEndereco = '';
    this.formCep = '';
    this.formResponsavel = '';
    this.formCpf = '';
    this.formBloqueado = false;
    this.consultandoCnpj = false;
    this.consultandoCep = false;
    this.statusConsultaCep = null;
    this.ultimoCnpjConsultado = '';
    this.ultimoCepConsultado = '';
    if (this.cnpjLookupTimer) {
      clearTimeout(this.cnpjLookupTimer);
      this.cnpjLookupTimer = null;
    }
    if (this.cepLookupTimer) {
      clearTimeout(this.cepLookupTimer);
      this.cepLookupTimer = null;
    }
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(c: ClienteCadastro): void {
    this.editandoId = c.id;
    this.formRazaoSocial = c.razaoSocial || '';
    this.formNomeFantasia = c.nomeFantasia || '';
    this.formCpfCnpj = maskCpfCnpj(onlyDigits(c.cpfCnpj || ''));
    this.formTipoPessoa = c.tipoPessoa === 'PF' ? 'PF' : 'PJ';
    this.formClassificacao = c.classificacao != null ? Math.min(5, Math.max(1, c.classificacao)) : 3;
    this.formEmail = c.emailFinanceiro || '';
    this.formCelular = maskBrPhone(onlyDigits(c.celularFinanceiro || ''));
    this.formEndereco = c.enderecoCompleto || '';
    this.formCep = maskCep(onlyDigits(c.cep || ''));
    this.formResponsavel = c.responsavel || '';
    this.formCpf = maskCpf(onlyDigits(c.cpf || ''));
    this.formBloqueado = !!c.bloqueado;
    this.consultandoCnpj = false;
    this.consultandoCep = false;
    this.statusConsultaCep = null;
    this.ultimoCnpjConsultado = onlyDigits(c.cpfCnpj || '');
    this.ultimoCepConsultado = onlyDigits(c.cep || '');
    if (this.cnpjLookupTimer) {
      clearTimeout(this.cnpjLookupTimer);
      this.cnpjLookupTimer = null;
    }
    if (this.cepLookupTimer) {
      clearTimeout(this.cepLookupTimer);
      this.cepLookupTimer = null;
    }
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  async fecharModal(): Promise<void> {
    if (this.temAlteracoesModal()) {
      const deveFechar = await confirmUnsavedChanges();
      if (!deveFechar) return;
    }
    this.modalAberto = false;
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      editandoId: this.editandoId,
      formRazaoSocial: this.formRazaoSocial,
      formNomeFantasia: this.formNomeFantasia,
      formCpfCnpj: this.formCpfCnpj,
      formTipoPessoa: this.formTipoPessoa,
      formClassificacao: this.formClassificacao,
      formEmail: this.formEmail,
      formCelular: this.formCelular,
      formEndereco: this.formEndereco,
      formCep: this.formCep,
      formResponsavel: this.formResponsavel,
      formCpf: this.formCpf,
      formBloqueado: this.formBloqueado
    });
  }

  private atualizarSnapshotModal(): void {
    this.modalSnapshot = this.estadoModalAtual();
  }

  private temAlteracoesModal(): boolean {
    if (!this.modalAberto) return false;
    return this.modalSnapshot !== this.estadoModalAtual();
  }

  montarPayload(): ClienteCadastroPayload {
    const idEmp = this.idEmpresaContexto();
    const idEmpresas = idEmp != null && idEmp > 0 ? [idEmp] : [];
    const cpfCnpjDigits = onlyDigits(this.formCpfCnpj);
    const celularDigits = onlyDigits(this.formCelular);
    const cepDigits = onlyDigits(this.formCep);
    const cpfContatoDigits = onlyDigits(this.formCpf);
    return {
      razaoSocial: this.formRazaoSocial.trim(),
      nomeFantasia: this.formNomeFantasia.trim() || undefined,
      cpfCnpj: cpfCnpjDigits || undefined,
      tipoPessoa: this.formTipoPessoa,
      classificacao: this.formClassificacao,
      idEmpresas,
      emailFinanceiro: this.formEmail.trim() || undefined,
      celularFinanceiro: celularDigits || undefined,
      enderecoCompleto: this.formEndereco.trim() || undefined,
      cep: cepDigits || undefined,
      responsavel: this.formResponsavel.trim() || undefined,
      cpf: cpfContatoDigits || undefined,
      bloqueado: this.formBloqueado
    };
  }

  salvar(): void {
    const razao = this.formRazaoSocial.trim();
    if (!razao) {
      this.erro = 'Informe a razão social ou nome.';
      void showValidationAlert(this.erro);
      return;
    }
    const idCtx = this.idEmpresaContexto();
    if (idCtx == null || idCtx <= 0) {
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
        this.erro = e.error?.mensagem || 'Erro ao salvar o cliente.';
        void showErrorAlert(this.erro ?? 'Erro ao salvar o cliente.', 'Erro ao salvar cliente');
      }
    });
  }

  async excluir(c: ClienteCadastro): Promise<void> {
    const nome = c.razaoSocial || 'este cliente';
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('cliente', nome));
    if (!confirmacao.isConfirmed) {
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.api.excluir(c.id).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir.';
        void showErrorAlert(this.erro ?? 'Não foi possível excluir.', 'Erro ao excluir cliente');
      }
    });
  }

  alternarBloqueio(c: ClienteCadastro): void {
    const novo = !c.bloqueado;
    this.erro = null;
    this.carregando = true;
    this.api.setBloqueado(c.id, novo).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível alterar o bloqueio.';
        void showErrorAlert(this.erro ?? 'Não foi possível alterar o bloqueio.', 'Erro ao alterar bloqueio');
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

  linhasEstrelas(n: number | null | undefined): boolean[] {
    const c = n != null ? Math.min(5, Math.max(1, n)) : 3;
    return [1, 2, 3, 4, 5].map((i) => i <= c);
  }

  textoContato(c: ClienteCadastro): string {
    const tel = (c.celularFinanceiro || '').trim();
    const em = (c.emailFinanceiro || '').trim();
    const parts: string[] = [];
    parts.push(tel ? tel : 'Sem telefone');
    parts.push(em ? em : 'Sem e-mail');
    return parts.join(' · ');
  }

  corAvatar(i: number): string {
    return this.coresAvatar[i % this.coresAvatar.length];
  }

  inicial(nome: string | undefined): string {
    const t = (nome || '?').trim();
    return t ? t.charAt(0).toUpperCase() : '?';
  }

  exportarCsv(): void {
    const rows = [
      ['razaoSocial', 'nomeFantasia', 'cpfCnpj', 'classificacao', 'email', 'telefone', 'bloqueado'].join(
        ';'
      ),
      ...this.linhas.map((c) =>
        [
          this.csvEscapar(c.razaoSocial),
          this.csvEscapar(c.nomeFantasia || ''),
          this.csvEscapar(c.cpfCnpj || ''),
          String(c.classificacao ?? ''),
          this.csvEscapar(c.emailFinanceiro || ''),
          this.csvEscapar(c.celularFinanceiro || ''),
          c.bloqueado ? 'sim' : 'nao'
        ].join(';')
      )
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-pagina-${this.pageIndex + 1}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private csvEscapar(s: string): string {
    const t = (s || '').replace(/"/g, '""');
    return `"${t}"`;
  }

  private agendarConsultaCnpj(cnpjDigits: string): void {
    if (this.cnpjLookupTimer) {
      clearTimeout(this.cnpjLookupTimer);
      this.cnpjLookupTimer = null;
    }
    this.cnpjLookupTimer = setTimeout(() => {
      this.consultarCnpjParaPreencher(cnpjDigits);
    }, 500);
  }

  private agendarConsultaCep(cepDigits: string): void {
    if (this.cepLookupTimer) {
      clearTimeout(this.cepLookupTimer);
      this.cepLookupTimer = null;
    }
    this.cepLookupTimer = setTimeout(() => {
      this.consultarCepParaPreencher(cepDigits);
    }, 400);
  }

  private consultarCepParaPreencher(cepDigits: string): void {
    if (cepDigits.length !== 8) {
      return;
    }
    if (this.ultimoCepConsultado === cepDigits || this.consultandoCep) {
      return;
    }
    this.consultandoCep = true;
    this.statusConsultaCep = null;
    this.cepLookup.consultar(cepDigits).subscribe({
      next: (resp) => {
        this.consultandoCep = false;
        if (!resp) {
          this.statusConsultaCep = 'CEP não encontrado.';
          return;
        }
        this.formCep = maskCep(resp.cep);
        if (resp.enderecoFormatado) {
          this.formEndereco = resp.enderecoFormatado;
        }
        this.ultimoCepConsultado = cepDigits;
        this.statusConsultaCep = 'Endereço preenchido automaticamente.';
      },
      error: () => {
        this.consultandoCep = false;
        this.statusConsultaCep = 'Não foi possível consultar o CEP agora.';
        void showErrorAlert('Não foi possível consultar o CEP agora.', 'Erro na consulta de CEP');
      }
    });
  }

  private consultarCnpjParaPreencher(cnpjDigits: string): void {
    if (cnpjDigits.length !== 14) {
      return;
    }
    if (this.ultimoCnpjConsultado === cnpjDigits || this.consultandoCnpj) {
      return;
    }
    this.consultandoCnpj = true;
    this.api.consultarCnpj(cnpjDigits).subscribe({
      next: (resp) => {
        const razao = (resp?.razaoSocial || '').trim();
        const fantasia = (resp?.nomeFantasia || '').trim();
        if (razao) {
          this.formRazaoSocial = razao;
        }
        if (fantasia) {
          this.formNomeFantasia = fantasia;
        }
        this.ultimoCnpjConsultado = cnpjDigits;
        this.consultandoCnpj = false;
      },
      error: () => {
        this.consultandoCnpj = false;
      }
    });
  }

  onImportarArquivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) {
          throw new Error('invalid');
        }
        this.importarLote(arr as unknown[]);
      } catch {
        this.erro =
          'Arquivo inválido. Use JSON: [{"razaoSocial":"...",...}]';
      }
    };
    reader.readAsText(file);
  }

  private importarLote(items: unknown[]): void {
    const idCtx = this.idEmpresaContexto();
    if (idCtx == null || idCtx <= 0) {
      this.erro = 'Não foi possível identificar a empresa para importar clientes.';
      void showErrorAlert(this.erro, 'Empresa não identificada');
      return;
    }
    let i = 0;
    const next = (): void => {
      if (i >= items.length) {
        this.carregando = false;
        this.carregar();
        return;
      }
      const raw = items[i++] as Record<string, unknown>;
      const razaoSocial = String(raw['razaoSocial'] || '').trim();
      if (!razaoSocial) {
        next();
        return;
      }
      const tp = raw['tipoPessoa'] === 'PF' ? 'PF' : 'PJ';
      const body: ClienteCadastroPayload = {
        razaoSocial,
        idEmpresas: [idCtx],
        tipoPessoa: tp,
        nomeFantasia: String(raw['nomeFantasia'] || '').trim() || undefined,
        cpfCnpj: String(raw['cpfCnpj'] || '').trim() || undefined,
        classificacao:
          raw['classificacao'] != null ? Number(raw['classificacao']) : undefined,
        emailFinanceiro: String(raw['emailFinanceiro'] || '').trim() || undefined,
        celularFinanceiro: String(raw['celularFinanceiro'] || '').trim() || undefined,
        bloqueado: raw['bloqueado'] === true
      };
      this.api.criar(body).subscribe({
        next: () => next(),
        error: () => next()
      });
    };
    this.carregando = true;
    this.erro = null;
    next();
  }
}
