import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './esqueci-senha.component.html',
  styleUrls: ['./esqueci-senha.component.scss']
})
export class EsqueciSenhaComponent {
  etapa: 'solicitar' | 'resetar' = 'solicitar';

  formSolicitar = {
    email: ''
  };

  formReset = {
    token: '',
    email: '',
    codigo: '',
    novaSenha: '',
    confirmarSenha: ''
  };

  mensagemSucesso: string | null = null;
  erro: string | null = null;
  emailEnviado: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private loadingService: LoadingService
  ) {
    this.route.queryParams.subscribe(params => {
      if (params['token']) {
        this.formReset.token = params['token'];
        this.etapa = 'resetar';
      }
    });
  }

  async solicitarRecuperacao() {
    if (!this.formSolicitar.email || !this.validarEmail(this.formSolicitar.email)) {
      this.erro = 'Digite um email válido.';
      return;
    }

    this.loadingService.setLoading(true);
    this.erro = null;
    this.mensagemSucesso = null;

    const sucesso = await this.authService.forgotPassword(this.formSolicitar.email);

    this.loadingService.setLoading(false);

    if (sucesso) {
      this.emailEnviado = true;
      this.mensagemSucesso =
        `Enviamos um e-mail para ${this.formSolicitar.email} com o link seguro e um código de 6 dígitos (válidos por 1 hora).`;
    } else {
      this.erro = 'Erro ao solicitar recuperação. Tente novamente em instantes.';
    }
  }

  irParaResetComCodigo() {
    this.etapa = 'resetar';
    this.formReset.token = '';
    this.formReset.email = this.formSolicitar.email || '';
    this.erro = null;
    this.mensagemSucesso = null;
  }

  async redefinirSenha() {
    const codigoOk =
      !!this.formReset.codigo?.trim() && /^\d{6}$/.test(this.formReset.codigo.trim());
    const emailOk =
      !!this.formReset.email?.trim() && this.validarEmail(this.formReset.email.trim());
    const usarCodigo = codigoOk && emailOk;
    const useToken = !!this.formReset.token?.trim() && !usarCodigo;

    if (!useToken && !usarCodigo) {
      this.erro = 'Abra o link do e-mail ou informe seu e-mail e o código de 6 dígitos que enviamos.';
      return;
    }

    if (!this.formReset.novaSenha || this.formReset.novaSenha.length < 6) {
      this.erro = 'A senha deve ter no mínimo 6 caracteres.';
      return;
    }

    if (this.formReset.novaSenha !== this.formReset.confirmarSenha) {
      this.erro = 'As senhas não coincidem.';
      return;
    }

    this.loadingService.setLoading(true);
    this.erro = null;
    this.mensagemSucesso = null;

    const sucesso = await this.authService.resetPassword(this.formReset.novaSenha, {
      token: useToken ? this.formReset.token.trim() : undefined,
      email: usarCodigo ? this.formReset.email.trim().toLowerCase() : undefined,
      codigo: usarCodigo ? this.formReset.codigo.trim() : undefined
    });

    this.loadingService.setLoading(false);

    if (sucesso) {
      this.mensagemSucesso = 'Senha redefinida com sucesso! Redirecionando para o login...';
      setTimeout(() => {
        this.router.navigate(['/login'], {
          queryParams: { senhaRedefinida: 'true' }
        });
      }, 2000);
    } else {
      this.erro =
        'Não foi possível redefinir a senha. Verifique o link ou o código (1 hora de validade) e tente de novo.';
    }
  }

  voltarParaLogin() {
    this.router.navigate(['/login']);
  }

  private validarEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
}
