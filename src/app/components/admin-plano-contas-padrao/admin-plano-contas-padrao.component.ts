import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PlanoContasGerencialComponent } from '../plano-contas-gerencial/plano-contas-gerencial.component';

@Component({
  selector: 'app-admin-plano-contas-padrao',
  standalone: true,
  imports: [CommonModule, RouterModule, PlanoContasGerencialComponent],
  templateUrl: './admin-plano-contas-padrao.component.html',
})
export class AdminPlanoContasPadraoComponent {}
