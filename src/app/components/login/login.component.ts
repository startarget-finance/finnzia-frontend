import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  // Dados do formulário
  loginForm = {
    email: '',
    password: ''
  };

  // Estados da UI
  isLoading = false;
  loadingMessage = 'Entrando...';
  showPassword = false;
  rememberMe = false;
  errorMessage = '';
  private loadingTimer?: ReturnType<typeof setTimeout>;

  // Validação
  isFormValid = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Verificar se já está logado
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Verificar query params para mensagens
    this.route.queryParams.subscribe(params => {
      if (params['expired']) {
        this.errorMessage = params['message'] || 'Sua sessão expirou. Por favor, faça login novamente.';
      }
      if (params['senhaRedefinida']) {
        this.errorMessage = 'Senha redefinida com sucesso! Faça login com sua nova senha.';
      }
      if (params['forbidden']) {
        this.errorMessage = params['message'] || 'Você não tem permissão para acessar este recurso.';
      }
    });
  }

  // Toggle de visibilidade da senha
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // Validação do formulário
  validateForm(): void {
    this.isFormValid = this.loginForm.email.length > 0 && 
                      this.loginForm.password.length > 0 &&
                      this.isValidEmail(this.loginForm.email);
  }

  // Validação de email
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }


  // Submissão do formulário
  async onSubmit(): Promise<void> {
    if (!this.isFormValid) {
      this.errorMessage = 'Por favor, preencha todos os campos corretamente.';
      return;
    }

    this.isLoading = true;
    this.loadingMessage = 'Entrando...';
    this.errorMessage = '';
    // Após alguns segundos sem resposta, mantém a UX clara sem expor detalhes de infraestrutura
    this.loadingTimer = setTimeout(() => {
      if (this.isLoading) {
        this.loadingMessage = 'Conectando...';
      }
    }, 8000);

    try {
      // Usar o serviço de autenticação
      const result = await this.authService.loginWithResult(this.loginForm.email, this.loginForm.password);

      if (result.success) {
        // Fluxo single-tenant: login bem-sucedido segue direto para o dashboard.
        this.router.navigate(['/dashboard']);
      } else if (result.timeout) {
        this.errorMessage = 'Não foi possível conectar no momento. Tente novamente em alguns segundos.';
      } else {
        this.errorMessage =
          result.backendMessage || 'Email ou senha incorretos. Tente novamente.';
      }
      
    } catch (error) {
      this.errorMessage = 'Erro interno. Tente novamente mais tarde.';
    } finally {
      this.isLoading = false;
      if (this.loadingTimer) { clearTimeout(this.loadingTimer); }
    }
  }

  ngOnDestroy(): void {
    if (this.loadingTimer) { clearTimeout(this.loadingTimer); }
  }

  // Esqueci minha senha
  onForgotPassword(): void {
    this.router.navigate(['/esqueci-senha']);
  }

  // Limpar mensagens de erro
  clearError(): void {
    this.errorMessage = '';
  }

  // Navegar para página de registro (se existir)
  onRegister(): void {
    // Implementar navegação para registro
    alert('Funcionalidade de registro será implementada em breve.');
  }
}
