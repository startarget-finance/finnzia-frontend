import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    pathMatch: 'full'
  },
  {
    path: 'restaurantes',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    data: { segmento: 'restaurantes' }
  },
  {
    path: 'prestadores',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    data: { segmento: 'prestadores' }
  },
  {
    path: 'agencias',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    data: { segmento: 'agencias' }
  },
  {
    path: 'diagnostico',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
    data: { apenasDiagnostico: true }
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'esqueci-senha',
    loadComponent: () => import('./components/esqueci-senha/esqueci-senha.component').then(m => m.EsqueciSenhaComponent)
  },
  {
    path: 'meu-perfil',
    loadComponent: () => import('./components/meu-perfil/meu-perfil.component').then(m => m.MeuPerfilComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'relatorio',
    loadComponent: () => import('./components/relatorio/relatorio.component').then(m => m.RelatorioComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'chat',
    loadComponent: () => import('./components/chatbot/chatbot.component').then(m => m.ChatbotComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'gerenciar-acessos',
    loadComponent: () => import('./components/gerenciar-acessos/gerenciar-acessos.component').then(m => m.GerenciarAcessosComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'contratos',
    loadComponent: () => import('./components/contratos/contratos.component').then(m => m.ContratosComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'assinatura',
    loadComponent: () => import('./components/assinatura/assinatura.component').then(m => m.AssinaturaComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'fluxo-caixa',
    loadComponent: () => import('./components/fluxo-caixa/fluxo-caixa.component').then(m => m.FluxoCaixaComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'movimentacoes',
    loadComponent: () => import('./components/movimentacoes/movimentacoes.component').then(m => m.MovimentacoesComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'contas-a-pagar',
    loadComponent: () => import('./components/contas-a-pagar/contas-a-pagar.component').then(m => m.ContasAPagarComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'contas-a-receber',
    loadComponent: () => import('./components/contas-a-receber/contas-a-receber.component').then(m => m.ContasAReceberComponent),
    canActivate: [AuthGuard]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
