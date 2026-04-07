import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CompaniaInfo, CompanySelectorService } from '../../services/company-selector.service';
import {
  FuncionarioCadastro,
  FuncionarioCadastroPayload,
  FuncionarioCadastroService
} from '../../services/funcionario-cadastro.service';

@Component({
  selector: 'app-funcionario-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './funcionario-cadastro.component.html'
})
export class FuncionarioCadastroComponent implements OnInit {
  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  linhas: FuncionarioCadastro[] = [];

  filtroQ = '';
  filtroEmpresaId: number | null = null;
  filtroAtivo: 'todos' | 'sim' | 'nao' = 'todos';

  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  totalPages = 0;

  empresasDisponiveis: CompaniaInfo[] = [];
  isAdmin = false;

  modalAberto = false;
  editandoId: number | null = null;
  formNomeCompleto = '';
  formCpf = '';
  formCargo = '';
  formDepartamento = '';
  formEmail = '';
  formTelefone = '';
  formAtivo = true;
  formEmpresaIds: Record<number, boolean> = {};

  constructor(
    private readonly api: FuncionarioCadastroService,
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
        ativo,
        page: this.pageIndex,
        size: this.pageSize,
        sort: 'nomeCompleto,asc'
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
          this.erro = e.error?.mensagem || 'Não foi possível carregar os funcionários.';
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
    this.filtroAtivo = 'todos';
    this.pageIndex = 0;
    this.carregar();
  }

  indiceGlobal(i: number): number {
    return this.pageIndex * this.pageSize + i + 1;
  }

  textoCargoDept(f: FuncionarioCadastro): string {
    const c = (f.cargo || '').trim();
    const d = (f.departamento || '').trim();
    if (c && d) {
      return `${c} · ${d}`;
    }
    return c || d || '—';
  }

  textoContato(f: FuncionarioCadastro): string {
    const tel = (f.telefone || '').trim();
    const em = (f.email || '').trim();
    const parts: string[] = [];
    parts.push(tel ? tel : 'Sem telefone');
    parts.push(em ? em : 'Sem e-mail');
    return parts.join(' · ');
  }

  resumoCargoContato(f: FuncionarioCadastro): string {
    return `${this.textoCargoDept(f)} · ${this.textoContato(f)}`;
  }

  subtituloEmpresas(f: FuncionarioCadastro): string {
    const nomes = (f.empresas || []).map((e) => e.nomeEmpresa).filter(Boolean);
    return nomes.length ? nomes.join(' · ') : 'Sem empresa vinculada';
  }

  /** CPF retornado pela API costuma vir só com dígitos. */
  cpfExibicao(cpf: string | null | undefined): string {
    const d = String(cpf || '').replace(/\D/g, '');
    if (d.length !== 11) {
      return cpf || '—';
    }
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formNomeCompleto = '';
    this.formCpf = '';
    this.formCargo = '';
    this.formDepartamento = '';
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

  abrirEditar(f: FuncionarioCadastro): void {
    this.editandoId = f.id;
    this.formNomeCompleto = f.nomeCompleto || '';
    this.formCpf = f.cpf ? this.cpfExibicao(f.cpf) : '';
    this.formCargo = f.cargo || '';
    this.formDepartamento = f.departamento || '';
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

  montarPayload(): FuncionarioCadastroPayload {
    return {
      nomeCompleto: this.formNomeCompleto.trim(),
      cpf: this.formCpf.trim() || undefined,
      cargo: this.formCargo.trim() || undefined,
      departamento: this.formDepartamento.trim() || undefined,
      email: this.formEmail.trim() || undefined,
      telefone: this.formTelefone.trim() || undefined,
      ativo: this.formAtivo,
      idEmpresas: this.coletarEmpresas()
    };
  }

  salvar(): void {
    const nome = this.formNomeCompleto.trim();
    if (!nome) {
      this.erro = 'Informe o nome completo.';
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
        this.erro = e.error?.mensagem || 'Erro ao salvar o funcionário.';
      }
    });
  }

  excluir(f: FuncionarioCadastro): void {
    const nome = f.nomeCompleto || 'este funcionário';
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
      error: (eError) => {
        this.carregando = false;
        this.erro = eError.error?.mensagem || 'Não foi possível excluir.';
      }
    });
  }

  alternarAtivo(f: FuncionarioCadastro): void {
    const novo = !f.ativo;
    this.erro = null;
    this.carregando = true;
    this.api.setAtivo(f.id, novo).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
      },
      error: (eError) => {
        this.carregando = false;
        this.erro = eError.error?.mensagem || 'Não foi possível alterar o status.';
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
}
