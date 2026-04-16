import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuarioService, Usuario } from '../../services/usuario.service';
import { AuthService } from '../../services/auth.service';
import { ErrorService } from '../../services/error.service';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-meu-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './meu-perfil.component.html',
  styleUrls: ['./meu-perfil.component.scss']
})
export class MeuPerfilComponent implements OnInit {
  usuario: Usuario | null = null;
  
  // Formulário de edição de perfil
  formPerfil = {
    nome: ''
  };
  
  // Formulário de alteração de senha
  formSenha = {
    senhaAtual: '',
    novaSenha: '',
    confirmarSenha: ''
  };
  
  // Estados
  editandoPerfil: boolean = false;
  alterandoSenha: boolean = false;
  mensagemSucesso: string | null = null;
  erro: string | null = null;

  constructor(
    private usuarioService: UsuarioService,
    private authService: AuthService,
    private errorService: ErrorService,
    private loadingService: LoadingService
  ) {}

  ngOnInit() {
    this.carregarPerfil();
    
    // Escutar erros globais
    this.errorService.error$.subscribe(error => {
      if (error) {
        this.erro = error.message;
        setTimeout(() => this.erro = null, 5000);
      }
    });
  }

  /**
   * Carrega o perfil do usuário logado
   */
  carregarPerfil() {
    this.loadingService.setLoading(true);
    this.usuarioService.buscarMeuPerfil().subscribe({
      next: (usuario) => {
        this.usuario = usuario;
        this.formPerfil.nome = usuario.name;
        this.loadingService.setLoading(false);
      },
      error: (error) => {
        this.erro = 'Erro ao carregar perfil. Tente novamente.';
        this.loadingService.setLoading(false);
      }
    });
  }

  /**
   * Inicia edição do perfil
   */
  iniciarEdicaoPerfil() {
    this.editandoPerfil = true;
    this.erro = null;
    this.mensagemSucesso = null;
  }

  /**
   * Cancela edição do perfil
   */
  cancelarEdicaoPerfil() {
    this.editandoPerfil = false;
    if (this.usuario) {
      this.formPerfil.nome = this.usuario.name;
    }
  }

  /**
   * Salva alterações do perfil
   */
  salvarPerfil() {
    if (!this.formPerfil.nome || this.formPerfil.nome.trim().length < 3) {
      this.erro = 'Nome deve ter no mínimo 3 caracteres.';
      return;
    }

    this.loadingService.setLoading(true);
    this.usuarioService.atualizarMeuPerfil({ nome: this.formPerfil.nome }).subscribe({
      next: (usuarioAtualizado) => {
        this.usuario = usuarioAtualizado;
        // Atualizar usuário no AuthService
        const user = this.authService.getCurrentUser();
        if (user) {
          user.name = usuarioAtualizado.name;
          this.authService.updateCurrentUser(user);
        }
        this.editandoPerfil = false;
        this.mensagemSucesso = 'Perfil atualizado com sucesso!';
        this.loadingService.setLoading(false);
        setTimeout(() => this.mensagemSucesso = null, 5000);
      },
      error: (error) => {
        this.erro = error.error?.message || 'Erro ao atualizar perfil. Tente novamente.';
        this.loadingService.setLoading(false);
      }
    });
  }

  /**
   * Inicia alteração de senha
   */
  iniciarAlteracaoSenha() {
    this.alterandoSenha = true;
    this.formSenha = {
      senhaAtual: '',
      novaSenha: '',
      confirmarSenha: ''
    };
    this.erro = null;
    this.mensagemSucesso = null;
  }

  /**
   * Cancela alteração de senha
   */
  cancelarAlteracaoSenha() {
    this.alterandoSenha = false;
    this.formSenha = {
      senhaAtual: '',
      novaSenha: '',
      confirmarSenha: ''
    };
  }

  /**
   * Valida e salva nova senha
   */
  salvarSenha() {
    // Validações
    if (!this.formSenha.senhaAtual || !this.formSenha.novaSenha || !this.formSenha.confirmarSenha) {
      this.erro = 'Preencha todos os campos.';
      return;
    }

    if (this.formSenha.novaSenha.length < 6) {
      this.erro = 'A nova senha deve ter no mínimo 6 caracteres.';
      return;
    }

    if (this.formSenha.novaSenha !== this.formSenha.confirmarSenha) {
      this.erro = 'As senhas não coincidem.';
      return;
    }

    if (this.formSenha.senhaAtual === this.formSenha.novaSenha) {
      this.erro = 'A nova senha deve ser diferente da senha atual.';
      return;
    }

    this.loadingService.setLoading(true);
    this.usuarioService.alterarMinhaSenha(
      this.formSenha.senhaAtual,
      this.formSenha.novaSenha
    ).subscribe({
      next: () => {
        this.alterandoSenha = false;
        this.formSenha = {
          senhaAtual: '',
          novaSenha: '',
          confirmarSenha: ''
        };
        this.mensagemSucesso = 'Senha alterada com sucesso!';
        this.loadingService.setLoading(false);
        setTimeout(() => this.mensagemSucesso = null, 5000);
      },
      error: (error) => {
        this.erro = error.error?.message || 'Erro ao alterar senha. Verifique a senha atual.';
        this.loadingService.setLoading(false);
      }
    });
  }

  /**
   * Formata data para exibição
   */
  formatarData(data?: string): string {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  get iniciaisUsuario(): string {
    const nome = (this.usuario?.name || '').trim();
    if (!nome) return 'US';
    const partes = nome.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  }

  get papelUsuarioLabel(): string {
    return this.usuario?.role === 'admin' ? 'Administrador' : 'Cliente';
  }
}

