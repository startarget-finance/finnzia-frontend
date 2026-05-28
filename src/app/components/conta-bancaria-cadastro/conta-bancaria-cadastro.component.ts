import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  CategoriaContaBancaria,
  ContaBancariaCadastro,
  ContaBancariaCadastroPayload,
  ContaBancariaCadastroService,
  TipoContaBancaria
} from '../../services/conta-bancaria-cadastro.service';
import { InstituicoesFinanceirasService } from '../../services/instituicoes-financeiras.service';
import {
  buildDeleteConfirmOptions,
  confirmUnsavedChanges,
  showErrorAlert,
  showValidationAlert
} from '../../utils/sweet-alerts';
import { sincronizarResumoParametrizacao } from '../../utils/parametrizacao-sync.util';

@Component({
  selector: 'app-conta-bancaria-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conta-bancaria-cadastro.component.html'
})
export class ContaBancariaCadastroComponent implements OnInit {
  @Input() embedded = false;
  @Output() cadastroAlterado = new EventEmitter<void>();

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
  formSaldoInicialInput = '0,00';
  formAtivo = true;
  instituicaoSelecionada = '';
  buscaInstituicao = '';
  mostrarSugestoesInstituicao = false;
  instituicoesFlat: Array<{ banco: string; instituicao: string; grupo: string }> = [];
  instituicoesFiltradas: Array<{ banco: string; instituicao: string; grupo: string }> = [];
  private modalSnapshot = '';

  gruposInstituicoes: Array<{ tipo: string; itens: Array<{ banco: string; instituicao: string }> }> = [];
  carregandoInstituicoes = false;

  private readonly fallbackGruposInstituicoes = [
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
  private readonly maxSafeCents = BigInt(Number.MAX_SAFE_INTEGER);

  constructor(
    private readonly api: ContaBancariaCadastroService,
    private readonly companySelector: CompanySelectorService,
    private readonly instituicoesService: InstituicoesFinanceirasService
  ) {}

  ngOnInit(): void {
    this.carregarInstituicoes();
    this.companySelector.empresaSelecionada$.subscribe(() => {
      this.carregar();
    });
    this.companySelector.empresasPermitidas$.subscribe(() => {
      this.carregar();
    });
  }

  private carregarInstituicoes(): void {
    this.carregandoInstituicoes = true;
    this.instituicoesService.listar(undefined, 1000).subscribe({
      next: (res) => {
        const itens = res?.itens ?? [];
        if (!itens.length) {
          this.gruposInstituicoes = this.fallbackGruposInstituicoes;
          this.carregandoInstituicoes = false;
          return;
        }
        const map = new Map<string, Array<{ banco: string; instituicao: string }>>();
        for (const item of itens) {
          const grupo = (item.grupo || 'Outros').trim();
          const lista = map.get(grupo) ?? [];
          lista.push({ banco: item.banco, instituicao: item.instituicao });
          map.set(grupo, lista);
        }
        this.gruposInstituicoes = Array.from(map.entries()).map(([tipo, itensGrupo]) => ({
          tipo,
          itens: itensGrupo
        }));
        this.atualizarInstituicoesFlat();
        this.carregandoInstituicoes = false;
      },
      error: () => {
        this.gruposInstituicoes = this.fallbackGruposInstituicoes;
        this.atualizarInstituicoesFlat();
        this.carregandoInstituicoes = false;
      }
    });
  }

  private atualizarInstituicoesFlat(): void {
    this.instituicoesFlat = this.gruposInstituicoes.flatMap((g) =>
      g.itens.map((i) => ({ banco: i.banco, instituicao: i.instituicao, grupo: g.tipo }))
    );
    this.filtrarInstituicoes();
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
          this.carregando = false;
        },
        error: (e) => {
          this.carregando = false;
          this.erro = e.error?.mensagem || 'Não foi possível carregar as contas.';
          this.linhas = [];
          void showErrorAlert(this.erro ?? 'Não foi possível carregar as contas.', 'Erro ao carregar contas');
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
    this.formSaldoInicialInput = this.formatarMoedaBr(this.formSaldoInicial);
    this.formAtivo = true;
    this.instituicaoSelecionada = '';
    this.buscaInstituicao = '';
    this.mostrarSugestoesInstituicao = false;
    this.instituicoesFiltradas = [...this.instituicoesFlat].slice(0, 80);
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(c: ContaBancariaCadastro): void {
    this.editandoId = c.id;
    this.formNomeConta = (c.nomeConta || '').trim();
    this.formCategoria = 'BANCARIA';
    this.formInstituicao = (c.instituicao || '').trim();
    this.formBanco = c.banco;
    this.formAgencia = c.agencia === '0' ? '' : c.agencia;
    this.formConta = c.conta === '0' ? '' : c.conta;
    this.formTipo = c.tipo === 'POUPANCA' ? 'POUPANCA' : 'CORRENTE';
    this.formSaldoInicial = Number(c.saldoInicial ?? 0);
    this.formSaldoInicialInput = this.formatarMoedaBr(this.formSaldoInicial);
    this.formAtivo = c.ativo !== false;
    this.instituicaoSelecionada = this.formInstituicao;
    this.buscaInstituicao = this.formBanco || this.formInstituicao || '';
    this.filtrarInstituicoes();
    this.mostrarSugestoesInstituicao = false;
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

  abrirSugestoesInstituicao(): void {
    this.mostrarSugestoesInstituicao = true;
    this.filtrarInstituicoes();
  }

  onBuscaInstituicaoChange(): void {
    this.mostrarSugestoesInstituicao = true;
    this.filtrarInstituicoes();
  }

  escolherInstituicao(item: { banco: string; instituicao: string }): void {
    this.formInstituicao = item.instituicao;
    this.formBanco = item.banco;
    this.instituicaoSelecionada = item.instituicao;
    this.buscaInstituicao = item.banco;
    this.mostrarSugestoesInstituicao = false;
  }

  fecharSugestoesInstituicaoComDelay(): void {
    setTimeout(() => {
      this.mostrarSugestoesInstituicao = false;
      const texto = this.buscaInstituicao.trim();
      if (!texto) return;
      // Se digitou manualmente, usamos o mesmo valor para banco e instituição.
      if (!this.formBanco.trim()) {
        this.formBanco = texto;
      }
      if (!this.formInstituicao.trim()) {
        this.formInstituicao = texto;
      }
    }, 120);
  }

  private filtrarInstituicoes(): void {
    const q = this.buscaInstituicao.trim().toLowerCase();
    const base = this.instituicoesFlat;
    if (!q) {
      this.instituicoesFiltradas = base.slice(0, 80);
      return;
    }
    this.instituicoesFiltradas = base
      .filter((i) =>
        i.banco.toLowerCase().includes(q) ||
        i.instituicao.toLowerCase().includes(q) ||
        i.grupo.toLowerCase().includes(q)
      )
      .slice(0, 80);
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
      formNomeConta: this.formNomeConta,
      formCategoria: this.formCategoria,
      formInstituicao: this.formInstituicao,
      formBanco: this.formBanco,
      formAgencia: this.formAgencia,
      formConta: this.formConta,
      formTipo: this.formTipo,
      formSaldoInicial: this.formSaldoInicial,
      formSaldoInicialInput: this.formSaldoInicialInput,
      formAtivo: this.formAtivo,
      instituicaoSelecionada: this.instituicaoSelecionada
    });
  }

  onSaldoInicialInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.formSaldoInicialInput = this.aplicarMascaraMoedaBr(input.value);
    const parse = this.parseMoedaBrSeguro(this.formSaldoInicialInput);
    if (!parse.excedeLimite) {
      this.formSaldoInicial = parse.valor;
    }
  }

  onSaldoInicialBlur(): void {
    const parse = this.parseMoedaBrSeguro(this.formSaldoInicialInput);
    if (!parse.excedeLimite) {
      this.formSaldoInicial = parse.valor;
    }
    this.formSaldoInicialInput = this.formatarMoedaBr(this.formSaldoInicial);
  }

  private atualizarSnapshotModal(): void {
    this.modalSnapshot = this.estadoModalAtual();
  }

  private temAlteracoesModal(): boolean {
    if (!this.modalAberto) return false;
    return this.modalSnapshot !== this.estadoModalAtual();
  }

  salvar(): void {
    const bancoResolvido = (
      this.formBanco ||
      this.buscaInstituicao ||
      this.formInstituicao
    ).trim();
    if (!bancoResolvido) {
      this.erro = 'Selecione ou informe uma instituição.';
      void showValidationAlert(this.erro);
      return;
    }
    this.formBanco = bancoResolvido;
    this.formCategoria = 'BANCARIA';
    if (!this.formAgencia.trim() || !this.formConta.trim()) {
      this.erro = 'Informe agência e conta.';
      void showValidationAlert(this.erro);
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa do cadastro.';
      void showErrorAlert(this.erro);
      return;
    }
    const ag = this.formAgencia.trim();
    const ct = this.formConta.trim();
    const saldo = this.parseMoedaBrSeguro(this.formSaldoInicialInput);
    if (saldo.excedeLimite) {
      this.erro = 'Saldo inicial muito alto para processamento seguro. Use até R$ 90.071.992.547.409,91.';
      void showValidationAlert(this.erro, 'Valor inválido');
      return;
    }
    const body: ContaBancariaCadastroPayload = {
      nomeConta: this.formNomeConta.trim() || undefined,
      categoria: this.formCategoria,
      instituicao: this.formInstituicao.trim() || undefined,
      banco: this.formBanco.trim(),
      agencia: ag,
      conta: ct,
      tipo: this.formCategoria === 'BANCARIA' ? this.formTipo : undefined,
      saldoInicial: saldo.valor,
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
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Erro ao salvar.';
        void showErrorAlert(this.erro ?? 'Erro ao salvar conta.', 'Erro ao salvar conta');
      }
    });
  }

  async excluir(c: ContaBancariaCadastro): Promise<void> {
    const confirmacao = await Swal.fire(buildDeleteConfirmOptions('conta bancária', this.tituloConta(c)));
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
        void showErrorAlert(this.erro ?? 'Não foi possível excluir.', 'Erro ao excluir conta');
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
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível alterar o status.';
        void showErrorAlert(this.erro ?? 'Não foi possível alterar o status.', 'Erro ao atualizar status');
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

  private parseMoedaBrSeguro(valor: string): { valor: number; excedeLimite: boolean } {
    const digits = (valor || '').replace(/\D/g, '');
    if (!digits) {
      return { valor: 0, excedeLimite: false };
    }
    const cents = BigInt(digits);
    if (cents > this.maxSafeCents) {
      return { valor: this.formSaldoInicial, excedeLimite: true };
    }
    return { valor: Number(cents) / 100, excedeLimite: false };
  }

  private formatarMoedaBr(valor: number): string {
    const numero = Number.isFinite(valor) ? valor : 0;
    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  private aplicarMascaraMoedaBr(valor: string): string {
    const digits = (valor || '').replace(/\D/g, '');
    if (!digits) {
      return '0,00';
    }
    const normalizado = digits.replace(/^0+(?=\d)/, '');
    const completo = normalizado.padStart(3, '0');
    const inteiro = completo.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const centavos = completo.slice(-2);
    return `${inteiro},${centavos}`;
  }
}
