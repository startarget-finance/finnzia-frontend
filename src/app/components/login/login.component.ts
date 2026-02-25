import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { UsuarioService } from '../../services/usuario.service';
import { CompanySelectorService, CompaniaInfo } from '../../services/company-selector.service';
import { API_CONFIG } from '../../config/api.config';

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
    private usuarioService: UsuarioService,
    private companySelectorService: CompanySelectorService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Verificar se já está logado
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Pré-aquece o backend apenas no browser (evita SSR block)
    if (isPlatformBrowser(this.platformId)) {
      this.preAquecerBackend();
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
    // Após 5s sem resposta, avisa que o servidor pode estar iniciando
    this.loadingTimer = setTimeout(() => {
      if (this.isLoading) {
        this.loadingMessage = 'Aguarde, servidor iniciando...';
      }
    }, 5000);

    try {
      // Usar o serviço de autenticação
      const success = await this.authService.login(this.loginForm.email, this.loginForm.password);
      
      if (success) {
        await this.sincronizarEmpresasPosLogin();
        // Redirecionar para dashboard
        this.router.navigate(['/dashboard']);
      } else {
        this.errorMessage = 'Email ou senha incorretos. Tente novamente.';
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

  private preAquecerBackend(): void {
    const healthUrl = `${API_CONFIG.BACKEND_API_URL}/actuator/health`;
    this.http.get(healthUrl, { headers: { 'X-Skip-Loading': 'true' } }).subscribe({ error: () => {} });
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

  /**
   * Após login, sincroniza empresas do usuário no seletor global
   * para evitar depender de um reload completo da aplicação
   */
  private async sincronizarEmpresasPosLogin(): Promise<void> {
    try {
      const usuarioAtual = await firstValueFrom(this.usuarioService.buscarMeuPerfil());
      if (!usuarioAtual?.id) {
        this.companySelectorService.limparSessao();
        return;
      }

      const empresas = await firstValueFrom(this.usuarioService.obterEmpresasUsuario(usuarioAtual.id));
      const empresasInfo: CompaniaInfo[] = (empresas || [])
        .filter(empresa => empresa.ativo)
        .map(empresa => ({
          id: empresa.id,
          idEmpresa: empresa.idEmpresa,
          nomeEmpresa: empresa.nomeEmpresa,
          padrao: empresa.padrao,
          ativo: empresa.ativo,
          dataCriacao: empresa.dataCriacao
        }));

      if (empresasInfo.length > 0) {
        this.companySelectorService.atualizarEmpresas(empresasInfo);
      } else {
        this.companySelectorService.limparSessao();
      }
    } catch (error) {
      console.error('Erro ao sincronizar empresas após login:', error);
      this.companySelectorService.limparSessao();
    }
  }
}
