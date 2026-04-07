import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClienteCadastroComponent } from '../cliente-cadastro/cliente-cadastro.component';
import { ContaBancariaCadastroComponent } from '../conta-bancaria-cadastro/conta-bancaria-cadastro.component';
import { FornecedorCadastroComponent } from '../fornecedor-cadastro/fornecedor-cadastro.component';
import { FuncionarioCadastroComponent } from '../funcionario-cadastro/funcionario-cadastro.component';
import { PlanoContasGerencialComponent } from '../plano-contas-gerencial/plano-contas-gerencial.component';

type ParamTab = 'contas-bancarias' | 'plano-contas' | 'fornecedores' | 'clientes' | 'funcionarios';

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
    FuncionarioCadastroComponent
  ],
  templateUrl: './parametrizacao.component.html'
})
export class ParametrizacaoComponent {
  activeTab: ParamTab = 'plano-contas';

  /** Resumo vindo da API (aba aberta ao menos uma vez). */
  contasBancariasTotalResumo: number | null = null;
  clientesTotalResumo: number | null = null;
  fornecedoresTotalResumo: number | null = null;
  funcionariosTotalResumo: number | null = null;

  setTab(tab: ParamTab): void {
    this.activeTab = tab;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }
}
