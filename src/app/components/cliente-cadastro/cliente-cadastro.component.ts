import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CompaniaInfo, CompanySelectorService } from '../../services/company-selector.service';
import {
  ClienteCadastro,
  ClienteCadastroPayload,
  ClienteCadastroService
} from '../../services/cliente-cadastro.service';

@Component({
  selector: 'app-cliente-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cliente-cadastro.component.html'
})
export class ClienteCadastroComponent implements OnInit {
  @Input() embedded = false;
  /** Total de clientes (todas as páginas) para resumo na parametrização. */
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  linhas: ClienteCadastro[] = [];

  filtroQ = '';
  filtroEmpresaId: number | null = null;
  filtroClassificacao: number | null = null;
  filtroTipoPessoa: '' | 'PF' | 'PJ' = '';

  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  totalPages = 0;

  empresasDisponiveis: CompaniaInfo[] = [];
  isAdmin = false;

  modalAberto = false;
  editandoId: number | null = null;

  formRazaoSocial = '';
  formNomeFantasia = '';
  formCpfCnpj = '';
  formTipoPessoa: 'PF' | 'PJ' = 'PJ';
  formClassificacao = 3;
  formEmpresaIds: Record<number, boolean> = {};
  formEmail = '';
  formCelular = '';
  formEndereco = '';
  formCep = '';
  formResponsavel = '';
  formCpf = '';
  formBloqueado = false;

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
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.auth.getCurrentUser()?.role === 'admin';
    this.companySelector.empresasPermitidas$.subscribe((list) => {
      this.empresasDisponiveis = (list || []).filter((e) => e.ativo && e.idEmpresa);
      this.carregar();
    });
  }

  carregar(): void {
    this.erro = null;
    this.carregando = true;
    const idEmp =
      this.filtroEmpresaId != null && this.filtroEmpresaId > 0 ? this.filtroEmpresaId : undefined;
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
          this.resumoTotal.emit(this.totalElements);
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível carregar os clientes.';
          this.linhas = [];
          this.resumoTotal.emit(0);
        }
      });
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    this.carregar();
  }

  limparFiltros(): void {
    this.filtroQ = '';
    this.filtroEmpresaId = null;
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
    this.formEmpresaIds = {};
    for (const e of this.empresasDisponiveis) {
      if (e.idEmpresa) {
        this.formEmpresaIds[e.idEmpresa] = false;
      }
    }
    this.modalAberto = true;
  }

  abrirEditar(c: ClienteCadastro): void {
    this.editandoId = c.id;
    this.formRazaoSocial = c.razaoSocial || '';
    this.formNomeFantasia = c.nomeFantasia || '';
    this.formCpfCnpj = c.cpfCnpj || '';
    this.formTipoPessoa = c.tipoPessoa === 'PF' ? 'PF' : 'PJ';
    this.formClassificacao = c.classificacao != null ? Math.min(5, Math.max(1, c.classificacao)) : 3;
    this.formEmail = c.emailFinanceiro || '';
    this.formCelular = c.celularFinanceiro || '';
    this.formEndereco = c.enderecoCompleto || '';
    this.formCep = c.cep || '';
    this.formResponsavel = c.responsavel || '';
    this.formCpf = c.cpf || '';
    this.formBloqueado = !!c.bloqueado;
    this.formEmpresaIds = {};
    const ids = new Set(c.idEmpresas || []);
    for (const e of this.empresasDisponiveis) {
      if (e.idEmpresa) {
        this.formEmpresaIds[e.idEmpresa] = ids.has(e.idEmpresa);
      }
    }
    this.modalAberto = true;
  }

  fecharModal(): void {
    this.modalAberto = false;
  }

  coletarEmpresasSelecionadas(): number[] {
    return Object.entries(this.formEmpresaIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
  }

  montarPayload(): ClienteCadastroPayload {
    const idEmpresas = this.coletarEmpresasSelecionadas();
    return {
      razaoSocial: this.formRazaoSocial.trim(),
      nomeFantasia: this.formNomeFantasia.trim() || undefined,
      cpfCnpj: this.formCpfCnpj.trim() || undefined,
      tipoPessoa: this.formTipoPessoa,
      classificacao: this.formClassificacao,
      idEmpresas,
      emailFinanceiro: this.formEmail.trim() || undefined,
      celularFinanceiro: this.formCelular.trim() || undefined,
      enderecoCompleto: this.formEndereco.trim() || undefined,
      cep: this.formCep.trim() || undefined,
      responsavel: this.formResponsavel.trim() || undefined,
      cpf: this.formCpf.trim() || undefined,
      bloqueado: this.formBloqueado
    };
  }

  salvar(): void {
    const razao = this.formRazaoSocial.trim();
    if (!razao) {
      this.erro = 'Informe a razão social ou nome.';
      return;
    }
    const idEmpresas = this.coletarEmpresasSelecionadas();
    if (!this.isAdmin && idEmpresas.length === 0) {
      this.erro = 'Selecione pelo menos uma empresa.';
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
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Erro ao salvar o cliente.';
      }
    });
  }

  excluir(c: ClienteCadastro): void {
    const nome = c.razaoSocial || 'este cliente';
    if (!confirm(`Excluir ${nome}?`)) {
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.api.excluir(c.id).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir.';
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
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível alterar o bloqueio.';
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
          'Arquivo inválido. Use JSON: [{"razaoSocial":"...","idEmpresas":[1],...}]';
      }
    };
    reader.readAsText(file);
  }

  private importarLote(items: unknown[]): void {
    let i = 0;
    const next = (): void => {
      if (i >= items.length) {
        this.carregando = false;
        this.carregar();
        return;
      }
      const raw = items[i++] as Record<string, unknown>;
      const razaoSocial = String(raw['razaoSocial'] || '').trim();
      const idEmpresas = Array.isArray(raw['idEmpresas'])
        ? (raw['idEmpresas'] as unknown[]).map((x) => Number(x)).filter((n) => n > 0)
        : [];
      if (!razaoSocial) {
        next();
        return;
      }
      if (!this.isAdmin && idEmpresas.length === 0) {
        next();
        return;
      }
      const tp = raw['tipoPessoa'] === 'PF' ? 'PF' : 'PJ';
      const body: ClienteCadastroPayload = {
        razaoSocial,
        idEmpresas,
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
