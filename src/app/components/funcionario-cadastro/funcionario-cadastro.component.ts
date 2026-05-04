import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  FuncionarioCadastro,
  FuncionarioCadastroPayload,
  FuncionarioCadastroService
} from '../../services/funcionario-cadastro.service';
import { maskBrPhone, maskCpf, onlyDigits } from '../../utils/input-masks';
import { buildDeleteConfirmOptions, confirmUnsavedChanges } from '../../utils/sweet-alerts';

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
  filtroAtivo: 'todos' | 'sim' | 'nao' = 'todos';

  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  totalPages = 0;

  modalAberto = false;
  editandoId: number | null = null;
  formNomeCompleto = '';
  formCpf = '';
  formCargo = '';
  formDepartamento = '';
  formEmail = '';
  formTelefone = '';
  formAtivo = true;
  private modalSnapshot = '';

  constructor(
    private readonly api: FuncionarioCadastroService,
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

  onCpfInput(): void {
    const digits = onlyDigits(this.formCpf);
    this.formCpf = maskCpf(digits);
  }

  onCpfBlur(): void {
    const digits = onlyDigits(this.formCpf);
    this.formCpf = maskCpf(digits);
  }

  onTelefoneInput(): void {
    const digits = onlyDigits(this.formTelefone);
    this.formTelefone = maskBrPhone(digits);
  }

  onTelefoneBlur(): void {
    const digits = onlyDigits(this.formTelefone);
    this.formTelefone = maskBrPhone(digits);
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
      this.resumoTotal.emit(0);
      this.erro = null;
      return;
    }

    this.carregando = true;
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
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(f: FuncionarioCadastro): void {
    this.editandoId = f.id;
    this.formNomeCompleto = f.nomeCompleto || '';
    this.formCpf = maskCpf(onlyDigits(f.cpf || ''));
    this.formCargo = f.cargo || '';
    this.formDepartamento = f.departamento || '';
    this.formEmail = f.email || '';
    this.formTelefone = maskBrPhone(onlyDigits(f.telefone || ''));
    this.formAtivo = f.ativo !== false;
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
      formNomeCompleto: this.formNomeCompleto,
      formCpf: this.formCpf,
      formCargo: this.formCargo,
      formDepartamento: this.formDepartamento,
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

  montarPayload(): FuncionarioCadastroPayload {
    const idEmp = this.idEmpresaContexto();
    const cpf = onlyDigits(this.formCpf);
    const telefone = onlyDigits(this.formTelefone);
    const body: FuncionarioCadastroPayload = {
      nomeCompleto: this.formNomeCompleto.trim(),
      cpf: cpf || undefined,
      cargo: this.formCargo.trim() || undefined,
      departamento: this.formDepartamento.trim() || undefined,
      email: this.formEmail.trim() || undefined,
      telefone: telefone || undefined,
      ativo: this.formAtivo
    };
    if (idEmp != null && idEmp > 0) {
      body.idEmpresas = [idEmp];
    }
    return body;
  }

  salvar(): void {
    const nome = this.formNomeCompleto.trim();
    if (!nome) {
      this.erro = 'Informe o nome completo.';
      return;
    }
    const idEmp = this.idEmpresaContexto();
    if (idEmp == null || idEmp <= 0) {
      this.erro = 'Não foi possível identificar a empresa do cadastro.';
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

  async excluir(f: FuncionarioCadastro): Promise<void> {
    const nome = f.nomeCompleto || 'este funcionário';
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('funcionário', nome));
    if (!confirmacao.isConfirmed) {
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
