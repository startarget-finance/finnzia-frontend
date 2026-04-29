import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, startWith, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import { CartaoCreditoCadastro, FaturaCartaoService } from '../../services/fatura-cartao.service';
import { ContaBancariaCadastroService } from '../../services/conta-bancaria-cadastro.service';

@Component({
  selector: 'app-cartao-credito-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cartao-credito-cadastro.component.html',
})
export class CartaoCreditoCadastroComponent implements OnInit, OnDestroy {
  readonly bandeiras = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Diners', 'Outra'];
  readonly dias = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly opcaoContaManual = '__manual__';

  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  salvando = false;
  mensagem = '';
  erro = '';
  readonly camposObrigatorios: Array<keyof CartaoCreditoCadastro> = [
    'nome',
    'bandeira',
    'finalCartao',
    'limite',
    'diaFechamento',
    'diaVencimento',
  ];
  fieldErrors: Partial<Record<keyof CartaoCreditoCadastro, string>> = {};

  itens: CartaoCreditoCadastro[] = [];
  contasReferencia: string[] = [];
  contaReferenciaSelect = '';
  contaReferenciaManual = false;
  limiteDisplay = '';
  editandoId: number | null = null;

  form: Partial<CartaoCreditoCadastro> = this.formVazio();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly faturaCartaoService: FaturaCartaoService,
    private readonly companySelector: CompanySelectorService,
    private readonly contaBancariaService: ContaBancariaCadastroService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$
      .pipe(startWith(null), debounceTime(50), takeUntil(this.destroy$))
      .subscribe(() => {
        this.carregar();
        this.carregarContasReferencia();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregar(): void {
    this.carregando = true;
    this.mensagem = '';
    this.erro = '';
    const idEmpresa = this.companySelector.obterIdEmpresaSelecionada() ?? undefined;
    this.faturaCartaoService.listarCadastros(idEmpresa).subscribe({
      next: (resp) => {
        this.itens = (resp?.itens ?? []).slice();
        this.resumoTotal.emit(this.itens.length);
      },
      error: (err) => {
        this.erro = err?.error?.mensagem || 'Não foi possível carregar os cartões.';
        this.itens = [];
        this.resumoTotal.emit(0);
      },
      complete: () => {
        this.carregando = false;
      },
    });
  }

  novo(): void {
    this.editandoId = null;
    this.form = this.formVazio();
    this.limiteDisplay = '';
    this.contaReferenciaSelect = '';
    this.contaReferenciaManual = false;
    this.mensagem = '';
    this.erro = '';
  }

  editar(item: CartaoCreditoCadastro): void {
    this.editandoId = item.id;
    this.form = {
      nome: item.nome,
      bandeira: item.bandeira ?? '',
      finalCartao: item.finalCartao ?? '',
      limite: item.limite ?? null,
      diaFechamento: item.diaFechamento ?? null,
      diaVencimento: item.diaVencimento ?? null,
      contaReferencia: item.contaReferencia ?? '',
    };
    this.limiteDisplay = this.formatarMoedaInput(item.limite ?? null);
    this.definirModoContaReferencia(item.contaReferencia ?? null);
    this.mensagem = '';
    this.erro = '';
  }

  onFinalCartaoInput(): void {
    const atual = String(this.form.finalCartao ?? '');
    this.form.finalCartao = atual.replace(/\D/g, '').slice(0, 4);
    this.clearFieldError('finalCartao');
  }

  onContaReferenciaSelectChange(): void {
    if (this.contaReferenciaSelect === this.opcaoContaManual) {
      this.contaReferenciaManual = true;
      this.form.contaReferencia = '';
      return;
    }
    this.contaReferenciaManual = false;
    this.form.contaReferencia = this.contaReferenciaSelect || '';
  }

  onLimiteInput(): void {
    const onlyDigits = String(this.limiteDisplay ?? '').replace(/\D/g, '');
    if (!onlyDigits) {
      this.limiteDisplay = '';
      this.form.limite = null;
      return;
    }
    const cents = Number(onlyDigits);
    this.form.limite = cents / 100;
    this.limiteDisplay = this.formatarMoedaInput(this.form.limite);
    this.clearFieldError('limite');
  }

  onLimiteBlur(): void {
    this.limiteDisplay = this.formatarMoedaInput(this.form.limite ?? null);
  }

  salvar(): void {
    if (!this.validarFormulario()) {
      this.erro = 'Preencha os campos obrigatórios para continuar.';
      void Swal.fire({
        icon: 'warning',
        title: 'Campos obrigatórios',
        text: 'Preencha os campos marcados com * antes de salvar.',
        confirmButtonText: 'Entendi',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    this.salvando = true;
    this.mensagem = '';
    this.erro = '';

    const payload: Partial<CartaoCreditoCadastro> = {
      nome: String(this.form.nome).trim(),
      bandeira: this.sanitizar(this.form.bandeira),
      finalCartao: this.sanitizar(this.form.finalCartao),
      limite: this.form.limite != null ? Number(this.form.limite) : null,
      diaFechamento: this.form.diaFechamento != null ? Number(this.form.diaFechamento) : null,
      diaVencimento: this.form.diaVencimento != null ? Number(this.form.diaVencimento) : null,
      contaReferencia: this.sanitizar(this.form.contaReferencia),
    };

    const req$ = this.editandoId
      ? this.faturaCartaoService.atualizarCadastro(this.editandoId, payload)
      : this.faturaCartaoService.criarCadastro(payload);

    req$.subscribe({
      next: () => {
        this.mensagem = this.editandoId ? 'Cartão atualizado com sucesso.' : 'Cartão cadastrado com sucesso.';
        this.novo();
        this.carregar();
        void Swal.fire({
          icon: 'success',
          title: 'Cadastro salvo',
          text: this.mensagem,
          timer: 1800,
          showConfirmButton: false,
        });
      },
      error: (err) => {
        this.erro = err?.error?.mensagem || 'Não foi possível salvar o cartão.';
        void Swal.fire({
          icon: 'error',
          title: 'Não foi possível salvar',
          text: this.erro,
          confirmButtonColor: '#dc2626',
        });
      },
      complete: () => {
        this.salvando = false;
      },
    });
  }

  async remover(item: CartaoCreditoCadastro): Promise<void> {
    if (!item?.id) return;
    const confirmacao = await Swal.fire({
      icon: 'warning',
      title: 'Excluir cartão?',
      text: `Tem certeza que deseja remover "${item.nome}"?`,
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#334155',
      reverseButtons: true,
    });
    if (!confirmacao.isConfirmed) return;

    this.faturaCartaoService.removerCadastro(item.id).subscribe({
      next: () => {
        this.mensagem = 'Cartão removido com sucesso.';
        if (this.editandoId === item.id) {
          this.novo();
        }
        this.carregar();
      },
      error: (err) => {
        this.erro = err?.error?.mensagem || 'Não foi possível remover o cartão.';
      },
    });
  }

  formatarLimiteTabela(valor: unknown): string {
    if (valor == null || valor === '') return '-';
    const numero = typeof valor === 'number'
      ? valor
      : Number(String(valor).replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(numero)) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numero);
  }

  private carregarContasReferencia(): void {
    const idEmpresa = this.companySelector.obterIdEmpresaSelecionada() ?? undefined;
    this.contaBancariaService.listar({
      idEmpresa,
      ativo: true,
      page: 0,
      size: 300,
      sort: 'banco,asc',
    }).subscribe({
      next: (resp) => {
        const nomes = (resp?.content ?? [])
          .map((c) => (c.nomeConta && c.nomeConta.trim() !== '' ? c.nomeConta : c.banco))
          .filter((v): v is string => !!v && v.trim() !== '');
        this.contasReferencia = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      },
      error: () => {
        this.contasReferencia = [];
      },
    });
  }

  private definirModoContaReferencia(contaReferencia: string | null): void {
    const valor = contaReferencia?.trim() ?? '';
    if (!valor) {
      this.contaReferenciaSelect = '';
      this.contaReferenciaManual = false;
      return;
    }
    if (this.contasReferencia.includes(valor)) {
      this.contaReferenciaSelect = valor;
      this.contaReferenciaManual = false;
    } else {
      this.contaReferenciaSelect = this.opcaoContaManual;
      this.contaReferenciaManual = true;
      this.form.contaReferencia = valor;
    }
  }

  private sanitizar(v: unknown): string | null {
    if (v == null) return null;
    const out = String(v).trim();
    return out ? out : null;
  }

  private formatarMoedaInput(valor: number | null): string {
    if (valor == null || Number.isNaN(Number(valor))) {
      return '';
    }
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(valor));
  }

  isRequiredFieldInvalid(field: keyof CartaoCreditoCadastro): boolean {
    return !!this.fieldErrors[field];
  }

  onTextFieldInput(field: keyof CartaoCreditoCadastro): void {
    this.clearFieldError(field);
  }

  private clearFieldError(field: keyof CartaoCreditoCadastro): void {
    if (this.fieldErrors[field]) {
      delete this.fieldErrors[field];
    }
  }

  private validarFormulario(): boolean {
    this.fieldErrors = {};

    const nome = String(this.form.nome ?? '').trim();
    if (!nome) this.fieldErrors.nome = 'Nome do cartão é obrigatório.';

    const bandeira = String(this.form.bandeira ?? '').trim();
    if (!bandeira) this.fieldErrors.bandeira = 'Bandeira é obrigatória.';

    const finalCartao = String(this.form.finalCartao ?? '').trim();
    if (!/^\d{4}$/.test(finalCartao)) this.fieldErrors.finalCartao = 'Informe os 4 dígitos finais.';

    const limite = this.form.limite != null ? Number(this.form.limite) : NaN;
    if (Number.isNaN(limite) || limite <= 0) this.fieldErrors.limite = 'Informe um limite maior que zero.';

    const fechamento = this.form.diaFechamento != null ? Number(this.form.diaFechamento) : NaN;
    if (Number.isNaN(fechamento) || fechamento < 1 || fechamento > 31) {
      this.fieldErrors.diaFechamento = 'Dia de fechamento deve ser entre 1 e 31.';
    }

    const vencimento = this.form.diaVencimento != null ? Number(this.form.diaVencimento) : NaN;
    if (Number.isNaN(vencimento) || vencimento < 1 || vencimento > 31) {
      this.fieldErrors.diaVencimento = 'Dia de vencimento deve ser entre 1 e 31.';
    }

    return Object.keys(this.fieldErrors).length === 0;
  }

  private formVazio(): Partial<CartaoCreditoCadastro> {
    return {
      nome: '',
      bandeira: this.bandeiras[0],
      finalCartao: '',
      limite: null,
      diaFechamento: null,
      diaVencimento: null,
      contaReferencia: '',
    };
  }
}
