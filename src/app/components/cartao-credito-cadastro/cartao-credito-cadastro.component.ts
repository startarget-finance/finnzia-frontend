import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, startWith, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import { CompanySelectorService } from '../../services/company-selector.service';
import { CartaoCreditoCadastro, FaturaCartaoService } from '../../services/fatura-cartao.service';
import { showErrorAlert, showValidationAlert } from '../../utils/sweet-alerts';
import { sincronizarResumoParametrizacao } from '../../utils/parametrizacao-sync.util';

@Component({
  selector: 'app-cartao-credito-cadastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cartao-credito-cadastro.component.html',
})
export class CartaoCreditoCadastroComponent implements OnInit, OnDestroy {
  readonly bandeiras = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Diners', 'Outra'];
  readonly dias = Array.from({ length: 31 }, (_, i) => i + 1);

  @Input() embedded = false;
  @Output() cadastroAlterado = new EventEmitter<void>();

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
  limiteDisplay = '';
  editandoId: number | null = null;
  modalAberto = false;

  form: Partial<CartaoCreditoCadastro> = this.formVazio();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly faturaCartaoService: FaturaCartaoService,
    private readonly companySelector: CompanySelectorService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$
      .pipe(startWith(null), debounceTime(50), takeUntil(this.destroy$))
      .subscribe(() => {
        this.carregar();
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
      },
      error: (err) => {
        this.erro = err?.error?.mensagem || 'Não foi possível carregar os cartões.';
        this.itens = [];
        void showErrorAlert(this.erro, 'Erro ao carregar cartões');
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
    this.mensagem = '';
    this.erro = '';
    this.modalAberto = false;
  }

  abrirNovoModal(): void {
    this.editandoId = null;
    this.form = this.formVazio();
    this.limiteDisplay = '';
    this.mensagem = '';
    this.erro = '';
    this.fieldErrors = {};
    this.modalAberto = true;
  }

  fecharModalFormulario(): void {
    if (this.salvando) return;
    this.modalAberto = false;
    this.erro = '';
    this.fieldErrors = {};
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
    };
    this.limiteDisplay = this.formatarMoedaInput(item.limite ?? null);
    this.mensagem = '';
    this.erro = '';
    this.fieldErrors = {};
    this.modalAberto = true;
  }

  onFinalCartaoInput(): void {
    const atual = String(this.form.finalCartao ?? '');
    this.form.finalCartao = atual.replace(/\D/g, '').slice(0, 4);
    this.clearFieldError('finalCartao');
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
      void showValidationAlert('Preencha os campos marcados com * antes de salvar.');
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
    };

    const req$ = this.editandoId
      ? this.faturaCartaoService.atualizarCadastro(this.editandoId, payload)
      : this.faturaCartaoService.criarCadastro(payload);

    req$.subscribe({
      next: () => {
        this.mensagem = this.editandoId ? 'Cartão atualizado com sucesso.' : 'Cartão cadastrado com sucesso.';
        this.modalAberto = false;
        this.editandoId = null;
        this.form = this.formVazio();
        this.limiteDisplay = '';
        this.fieldErrors = {};
        this.carregar();
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
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
        sincronizarResumoParametrizacao(this.embedded, this.cadastroAlterado);
      },
      error: (err) => {
        this.erro = err?.error?.mensagem || 'Não foi possível remover o cartão.';
        void showErrorAlert(this.erro, 'Erro ao remover cartão');
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
    };
  }
}
