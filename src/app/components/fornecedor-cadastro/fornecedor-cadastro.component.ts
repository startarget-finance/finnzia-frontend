import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CompaniaInfo, CompanySelectorService } from '../../services/company-selector.service';
import {
  FornecedorCadastro,
  FornecedorCadastroPayload,
  FornecedorCadastroService
} from '../../services/fornecedor-cadastro.service';

@Component({
  selector: 'app-fornecedor-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fornecedor-cadastro.component.html'
})
export class FornecedorCadastroComponent implements OnInit {
  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  linhas: FornecedorCadastro[] = [];

  filtroQ = '';
  filtroEmpresaId: number | null = null;
  filtroTipoPessoa: '' | 'PF' | 'PJ' = '';
  filtroAtivo: 'todos' | 'sim' | 'nao' = 'todos';

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
  formEmail = '';
  formTelefone = '';
  formAtivo = true;
  formEmpresaIds: Record<number, boolean> = {};

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
        idEmpresa: idEmp,
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
          this.resumoTotal.emit(this.totalElements);
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível carregar os fornecedores.';
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
    this.formEmpresaIds = {};
    for (const e of this.empresasDisponiveis) {
      if (e.idEmpresa) {
        this.formEmpresaIds[e.idEmpresa] = false;
      }
    }
    this.modalAberto = true;
  }

  abrirEditar(f: FornecedorCadastro): void {
    this.editandoId = f.id;
    this.formRazaoSocial = f.razaoSocial || '';
    this.formNomeFantasia = f.nomeFantasia || '';
    this.formCpfCnpj = f.cpfCnpj || '';
    this.formTipoPessoa = f.tipoPessoa === 'PF' ? 'PF' : 'PJ';
    this.formEmail = f.email || '';
    this.formTelefone = f.telefone || '';
    this.formAtivo = f.ativo !== false;
    this.formEmpresaIds = {};
    const ids = new Set(f.idEmpresas || []);
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

  coletarEmpresas(): number[] {
    return Object.entries(this.formEmpresaIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
  }

  montarPayload(): FornecedorCadastroPayload {
    return {
      razaoSocial: this.formRazaoSocial.trim(),
      nomeFantasia: this.formNomeFantasia.trim() || undefined,
      cpfCnpj: this.formCpfCnpj.trim() || undefined,
      tipoPessoa: this.formTipoPessoa,
      email: this.formEmail.trim() || undefined,
      telefone: this.formTelefone.trim() || undefined,
      ativo: this.formAtivo,
      idEmpresas: this.coletarEmpresas()
    };
  }

  salvar(): void {
    const razao = this.formRazaoSocial.trim();
    if (!razao) {
      this.erro = 'Informe a razão social ou nome.';
      return;
    }
    const idEmpresas = this.coletarEmpresas();
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
        this.erro = e.error?.mensagem || 'Erro ao salvar o fornecedor.';
      }
    });
  }

  excluir(f: FornecedorCadastro): void {
    const nome = f.razaoSocial || 'este fornecedor';
    if (!confirm(`Excluir ${nome}?`)) {
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.api.excluir(f.id).subscribe({
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

  alternarAtivo(f: FornecedorCadastro): void {
    const novo = !f.ativo;
    this.erro = null;
    this.carregando = true;
    this.api.setAtivo(f.id, novo).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível alterar o status.';
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
