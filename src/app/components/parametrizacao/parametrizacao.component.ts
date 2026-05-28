import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, map, startWith, takeUntil } from 'rxjs/operators';
import { ClienteCadastroComponent } from '../cliente-cadastro/cliente-cadastro.component';
import { ContaBancariaCadastroComponent } from '../conta-bancaria-cadastro/conta-bancaria-cadastro.component';
import { FornecedorCadastroComponent } from '../fornecedor-cadastro/fornecedor-cadastro.component';
import { FuncionarioCadastroComponent } from '../funcionario-cadastro/funcionario-cadastro.component';
import { CartaoCreditoCadastroComponent } from '../cartao-credito-cadastro/cartao-credito-cadastro.component';
import { PlanoContasGerencialComponent } from '../plano-contas-gerencial/plano-contas-gerencial.component';
import { MovimentacoesHistoricoComponent } from '../movimentacoes-historico/movimentacoes-historico.component';
import { CompanySelectorService } from '../../services/company-selector.service';
import { CategoriasFinanceirasService } from '../../services/categorias-financeiras.service';
import { ContaBancariaCadastroService } from '../../services/conta-bancaria-cadastro.service';
import { contarNosCategoriasFinanceiras } from '../../utils/plano-contas-padrao-tree.util';
import { FornecedorCadastroService } from '../../services/fornecedor-cadastro.service';
import { ClienteCadastroService } from '../../services/cliente-cadastro.service';
import { FuncionarioCadastroService } from '../../services/funcionario-cadastro.service';
import { FaturaCartaoService } from '../../services/fatura-cartao.service';

type ParamTab = 'contas-bancarias' | 'plano-contas' | 'fornecedores' | 'clientes' | 'funcionarios' | 'cartoes-credito' | 'historico-movimentacoes';

@Component({
  selector: 'app-parametrizacao',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PlanoContasGerencialComponent,
    ClienteCadastroComponent,
    ContaBancariaCadastroComponent,
    FornecedorCadastroComponent,
    FuncionarioCadastroComponent,
    CartaoCreditoCadastroComponent,
    MovimentacoesHistoricoComponent
  ],
  templateUrl: './parametrizacao.component.html'
})
export class ParametrizacaoComponent implements OnInit, OnDestroy {
  activeTab: ParamTab = 'plano-contas';

  planoContasTotalResumo: number | null = null;
  contasBancariasTotalResumo: number | null = null;
  clientesTotalResumo: number | null = null;
  fornecedoresTotalResumo: number | null = null;
  funcionariosTotalResumo: number | null = null;
  cartoesCreditoTotalResumo: number | null = null;

  resumosCarregando = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly companySelector: CompanySelectorService,
    private readonly categoriasFinanceirasService: CategoriasFinanceirasService,
    private readonly contaBancariaService: ContaBancariaCadastroService,
    private readonly fornecedorService: FornecedorCadastroService,
    private readonly clienteService: ClienteCadastroService,
    private readonly funcionarioService: FuncionarioCadastroService,
    private readonly faturaCartaoService: FaturaCartaoService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresaSelecionada$
      .pipe(startWith(null), debounceTime(50), takeUntil(this.destroy$))
      .subscribe(() => this.carregarResumos());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: ParamTab): void {
    this.activeTab = tab;
  }

  /** Recarrega KPIs após alteração em qualquer aba (mesma fonte em todas as telas). */
  aoCadastroAlterado(): void {
    this.carregarResumos();
  }

  /** Totais para os cards do topo — fonte única, independente da aba ativa ou filtros locais. */
  carregarResumos(): void {
    const idEmp = this.companySelector.obterIdEmpresaSelecionada();
    const idEmpresa = idEmp != null && idEmp > 0 ? idEmp : undefined;

    this.resumosCarregando = true;
    const pageProbe = { page: 0, size: 1 } as const;

    forkJoin({
      plano:
        idEmpresa != null && idEmpresa > 0
          ? this.categoriasFinanceirasService.listar(idEmpresa).pipe(
              map((lista) => contarNosCategoriasFinanceiras(lista ?? [])),
              catchError(() => of(0))
            )
          : of(0),
      contas: this.contaBancariaService
        .listar({
          idEmpresa: idEmpresa,
          page: pageProbe.page,
          size: pageProbe.size,
          sort: 'banco,asc'
        })
        .pipe(
          map((p) => p?.totalElements ?? 0),
          catchError(() => of(0))
        ),
      fornecedores: this.fornecedorService
        .listar({
          idEmpresa: idEmpresa,
          page: pageProbe.page,
          size: pageProbe.size,
          sort: 'razaoSocial,asc'
        })
        .pipe(
          map((p) => p?.totalElements ?? 0),
          catchError(() => of(0))
        ),
      clientes: this.clienteService
        .listar({
          idEmpresa: idEmpresa,
          page: pageProbe.page,
          size: pageProbe.size,
          sort: 'razaoSocial,asc'
        })
        .pipe(
          map((p) => p?.totalElements ?? 0),
          catchError(() => of(0))
        ),
      funcionarios: this.funcionarioService
        .listar({
          idEmpresa: idEmpresa,
          page: pageProbe.page,
          size: pageProbe.size,
          sort: 'nomeCompleto,asc'
        })
        .pipe(
          map((p) => p?.totalElements ?? 0),
          catchError(() => of(0))
        ),
      cartoes: this.faturaCartaoService.listarCadastros(idEmpresa ?? undefined).pipe(
        map((resp) => resp?.itens?.length ?? 0),
        catchError(() => of(0))
        )
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.planoContasTotalResumo = r.plano;
          this.contasBancariasTotalResumo = r.contas;
          this.fornecedoresTotalResumo = r.fornecedores;
          this.clientesTotalResumo = r.clientes;
          this.funcionariosTotalResumo = r.funcionarios;
          this.cartoesCreditoTotalResumo = r.cartoes;
          this.resumosCarregando = false;
        },
        error: () => {
          this.resumosCarregando = false;
        }
      });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }
}
