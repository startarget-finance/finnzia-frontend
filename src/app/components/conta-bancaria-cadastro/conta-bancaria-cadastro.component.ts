import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  CategoriaContaBancaria,
  ContaBancariaCadastro,
  ContaBancariaCadastroPayload,
  ContaBancariaCadastroService,
  TipoContaBancaria
} from '../../services/conta-bancaria-cadastro.service';

@Component({
  selector: 'app-conta-bancaria-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conta-bancaria-cadastro.component.html'
})
export class ContaBancariaCadastroComponent implements OnInit {
  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  linhas: ContaBancariaCadastro[] = [];

  filtroQ = '';
  filtroAtivo: 'todos' | 'sim' | 'nao' = 'todos';

  pageIndex = 0;
  pageSize = 20;
  totalElements = 0;
  totalPages = 0;

  modalAberto = false;
  editandoId: number | null = null;
  formNomeConta = '';
  formCategoria: CategoriaContaBancaria = 'BANCARIA';
  formInstituicao = '';
  formBanco = '';
  formAgencia = '';
  formConta = '';
  formTipo: TipoContaBancaria = 'CORRENTE';
  formSaldoInicial = 0;
  formAtivo = true;
  instituicaoSelecionada = '';
  private modalSnapshot = '';

  readonly gruposInstituicoes = [
    {
      tipo: 'Bancos tradicionais',
      itens: [
        { banco: 'Banco do Brasil', instituicao: 'Banco do Brasil S.A.' },
        { banco: 'Caixa', instituicao: 'Caixa Econômica Federal' },
        { banco: 'Bradesco', instituicao: 'Banco Bradesco S.A.' },
        { banco: 'Itaú', instituicao: 'Itaú Unibanco S.A.' },
        { banco: 'Santander', instituicao: 'Banco Santander (Brasil) S.A.' },
        { banco: 'Safra', instituicao: 'Banco Safra S.A.' }
      ]
    },
    {
      tipo: 'Bancos digitais',
      itens: [
        { banco: 'Nubank', instituicao: 'Nu Pagamentos S.A. (Nubank)' },
        { banco: 'Inter', instituicao: 'Banco Inter S.A.' },
        { banco: 'C6 Bank', instituicao: 'Banco C6 S.A.' },
        { banco: 'PagBank', instituicao: 'PagSeguro Internet S.A. (PagBank)' },
        { banco: 'Mercado Pago', instituicao: 'Mercado Pago Instituição de Pagamento Ltda.' },
        { banco: 'PicPay', instituicao: 'PicPay Instituição de Pagamento S.A.' }
      ]
    }
  ];

  private readonly coresAvatar = [
    'bg-emerald-600',
    'bg-blue-600',
    'bg-violet-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600'
  ];

  constructor(
    private readonly api: ContaBancariaCadastroService,
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
        idEmpresa: idEmpresaAtual,
        ativo,
        page: this.pageIndex,
        size: this.pageSize,
        sort: 'banco,asc'
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
          this.erro = e.error?.mensagem || 'Não foi possível carregar as contas.';
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

  tituloConta(c: ContaBancariaCadastro): string {
    const n = (c.nomeConta || '').trim();
    return n || c.banco;
  }

  subtituloEmpresas(c: ContaBancariaCadastro): string {
    const nomes = (c.empresas || []).map((e) => e.nomeEmpresa).filter(Boolean);
    return nomes.length ? nomes.join(' · ') : 'Sem empresa vinculada';
  }

  labelCategoria(c: ContaBancariaCadastro): string {
    return c.categoria === 'DINHEIRO' ? 'Dinheiro' : 'Bancária';
  }

  linhaInstituicao(c: ContaBancariaCadastro): string {
    const inst = (c.instituicao || '').trim();
    return inst || c.banco || '—';
  }

  detalheTipoConta(c: ContaBancariaCadastro): string {
    if (c.categoria === 'DINHEIRO') {
      return 'Caixa / dinheiro em espécie';
    }
    return this.labelTipo(c.tipo);
  }

  textoSaldo(c: ContaBancariaCadastro): string {
    const v = Number(c.saldoInicial ?? 0);
    if (Math.abs(v) < 0.005) {
      return 'Sem saldo de abertura';
    }
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    return fmt;
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formNomeConta = '';
    this.formCategoria = 'BANCARIA';
    this.formInstituicao = '';
    this.formBanco = '';
    this.formAgencia = '';
    this.formConta = '';
    this.formTipo = 'CORRENTE';
    this.formSaldoInicial = 0;
    this.formAtivo = true;
    this.instituicaoSelecionada = '';
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(c: ContaBancariaCadastro): void {
    this.editandoId = c.id;
    this.formNomeConta = (c.nomeConta || '').trim();
    this.formCategoria =
      c.categoria === 'DINHEIRO' ? 'DINHEIRO' : 'BANCARIA';
    this.formInstituicao = (c.instituicao || '').trim();
    this.formBanco = c.banco;
    this.formAgencia = c.agencia === '0' && c.categoria === 'DINHEIRO' ? '' : c.agencia;
    this.formConta = c.conta === '0' && c.categoria === 'DINHEIRO' ? '' : c.conta;
    this.formTipo = c.tipo === 'POUPANCA' ? 'POUPANCA' : 'CORRENTE';
    this.formSaldoInicial = Number(c.saldoInicial ?? 0);
    this.formAtivo = c.ativo !== false;
    this.instituicaoSelecionada = this.formInstituicao;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  selecionarInstituicao(): void {
    this.formInstituicao = this.instituicaoSelecionada;
    const item = this.gruposInstituicoes
      .flatMap((g) => g.itens)
      .find((opt) => opt.instituicao === this.instituicaoSelecionada);
    if (item) {
      this.formBanco = item.banco;
    }
  }

  fecharModal(): void {
    if (this.temAlteracoesModal() && !confirm('Existem alterações não salvas. Deseja fechar mesmo assim?')) {
      return;
    }
    this.modalAberto = false;
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      editandoId: this.editandoId,
      formNomeConta: this.formNomeConta,
      formCategoria: this.formCategoria,
      formInstituicao: this.formInstituicao,
      formBanco: this.formBanco,
      formAgencia: this.formAgencia,
      formConta: this.formConta,
      formTipo: this.formTipo,
      formSaldoInicial: this.formSaldoInicial,
      formAtivo: this.formAtivo,
      instituicaoSelecionada: this.instituicaoSelecionada
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
    if (!this.formBanco.trim()) {
      this.erro = 'Preencha o nome da instituição ou descrição (campo obrigatório).';
      return;
    }
    if (this.formCategoria === 'BANCARIA') {
      if (!this.formAgencia.trim() || !this.formConta.trim()) {
        this.erro = 'Para conta bancária, informe agência e conta.';
        return;
      }
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa do cadastro.';
      return;
    }
    const ag = this.formCategoria === 'BANCARIA' ? this.formAgencia.trim() : this.formAgencia.trim() || '0';
    const ct = this.formCategoria === 'BANCARIA' ? this.formConta.trim() : this.formConta.trim() || '0';
    const body: ContaBancariaCadastroPayload = {
      nomeConta: this.formNomeConta.trim() || undefined,
      categoria: this.formCategoria,
      instituicao: this.formInstituicao.trim() || undefined,
      banco: this.formBanco.trim(),
      agencia: ag,
      conta: ct,
      tipo: this.formCategoria === 'BANCARIA' ? this.formTipo : undefined,
      saldoInicial: Number(this.formSaldoInicial) || 0,
      ativo: this.formAtivo,
      idEmpresas: [idEmpresaAtual]
    };
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
        this.erro = e.error?.mensagem || 'Erro ao salvar.';
      }
    });
  }

  excluir(c: ContaBancariaCadastro): void {
    if (!confirm(`Excluir "${this.tituloConta(c)}"?`)) {
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

  alternarAtivo(c: ContaBancariaCadastro): void {
    const novo = !c.ativo;
    this.erro = null;
    this.carregando = true;
    this.api.setAtivo(c.id, novo).subscribe({
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

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }

  labelTipo(t: TipoContaBancaria): string {
    return t === 'POUPANCA' ? 'Poupança' : 'Corrente';
  }

  corAvatar(i: number): string {
    return this.coresAvatar[i % this.coresAvatar.length];
  }

  inicial(nome: string | undefined): string {
    const t = (nome || '?').trim();
    return t ? t.charAt(0).toUpperCase() : '?';
  }
}
