import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { API_CONFIG } from '../../config/api.config';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy, AfterViewInit {
  loginForm = {
    email: '',
    password: '',
  };

  isLoading = false;
  loadingMessage = 'Entrando...';
  showPassword = false;
  rememberMe = false;
  errorMessage = '';
  private loadingTimer?: ReturnType<typeof setTimeout>;

  isFormValid = false;

  readonly googleClientId = API_CONFIG.GOOGLE_OAUTH_CLIENT_ID;

  @ViewChild('googleSignInButton', { static: false })
  googleSignInButton?: ElementRef<HTMLElement>;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      const destino = this.authService.hasRole('admin') ? '/dashboard' : '/rotina';
      void this.router.navigate([destino]);
      return;
    }

    this.route.queryParams.subscribe((params) => {
      if (params['expired']) {
        this.errorMessage =
          params['message'] || 'Sua sessão expirou. Por favor, faça login novamente.';
      }
      if (params['senhaRedefinida']) {
        this.errorMessage =
          'Senha redefinida com sucesso! Faça login com sua nova senha.';
      }
      if (params['forbidden']) {
        this.errorMessage =
          params['message'] || 'Você não tem permissão para acessar este recurso.';
      }
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || !this.googleClientId) {
      return;
    }
    queueMicrotask(() => this.initGoogleSignIn());
  }

  private initGoogleSignIn(): void {
    const host = this.googleSignInButton?.nativeElement;
    if (!host) {
      return;
    }
    const w = window as unknown as {
      google?: {
        accounts?: {
          id?: {
            initialize: (cfg: Record<string, unknown>) => void;
            renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          };
        };
      };
    };

    const render = () => {
      const id = w.google?.accounts?.id;
      if (!id) {
        return;
      }
      id.initialize({
        client_id: this.googleClientId,
        callback: (resp: { credential?: string }) =>
          this.ngZone.run(() => void this.onGoogleCredential(resp.credential)),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      id.renderButton(host, {
        theme: 'filled_blue',
        size: 'large',
        text: 'continue_with',
        width: 384,
        locale: 'pt-BR',
      });
    };

    if (w.google?.accounts?.id) {
      render();
      return;
    }
    const existing = document.querySelector('script[data-finnzia-gsi]');
    if (existing) {
      existing.addEventListener('load', () => render());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-finnzia-gsi', '1');
    s.onload = () => render();
    document.head.appendChild(s);
  }

  private async onGoogleCredential(credential?: string): Promise<void> {
    if (!credential) {
      this.errorMessage = 'Não foi possível concluir o login com Google.';
      return;
    }
    this.isLoading = true;
    this.loadingMessage = 'Entrando com Google...';
    this.errorMessage = '';
    this.loadingTimer = setTimeout(() => {
      if (this.isLoading) {
        this.loadingMessage = 'Conectando...';
      }
    }, 8000);
    try {
      const result = await this.authService.loginWithGoogle(credential);
      if (result.success) {
        const destino = this.authService.hasRole('admin') ? '/dashboard' : '/rotina';
        void this.router.navigate([destino]);
      } else if (result.timeout) {
        this.errorMessage =
          'Não foi possível conectar no momento. Tente novamente em alguns segundos.';
      } else {
        this.errorMessage =
          result.backendMessage ||
          'Não foi possível entrar com Google. Verifique se a conta está autorizada.';
      }
    } catch {
      this.errorMessage = 'Erro ao entrar com Google. Tente novamente.';
    } finally {
      this.isLoading = false;
      if (this.loadingTimer) {
        clearTimeout(this.loadingTimer);
      }
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  validateForm(): void {
    this.isFormValid =
      this.loginForm.email.length > 0 &&
      this.loginForm.password.length > 0 &&
      this.isValidEmail(this.loginForm.email);
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async onSubmit(): Promise<void> {
    if (!this.isFormValid) {
      this.errorMessage = 'Por favor, preencha todos os campos corretamente.';
      return;
    }

    this.isLoading = true;
    this.loadingMessage = 'Entrando...';
    this.errorMessage = '';
    this.loadingTimer = setTimeout(() => {
      if (this.isLoading) {
        this.loadingMessage = 'Conectando...';
      }
    }, 8000);

    try {
      const result = await this.authService.loginWithResult(
        this.loginForm.email,
        this.loginForm.password
      );

      if (result.success) {
        const destino = this.authService.hasRole('admin') ? '/dashboard' : '/rotina';
        void this.router.navigate([destino]);
      } else if (result.timeout) {
        this.errorMessage =
          'Não foi possível conectar no momento. Tente novamente em alguns segundos.';
      } else {
        this.errorMessage =
          result.backendMessage || 'Email ou senha incorretos. Tente novamente.';
      }
    } catch {
      this.errorMessage = 'Erro interno. Tente novamente mais tarde.';
    } finally {
      this.isLoading = false;
      if (this.loadingTimer) {
        clearTimeout(this.loadingTimer);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
    }
  }

  onForgotPassword(): void {
    this.router.navigate(['/esqueci-senha']);
  }

  clearError(): void {
    this.errorMessage = '';
  }

  onRegister(): void {
    alert('Funcionalidade de registro será implementada em breve.');
  }
}
