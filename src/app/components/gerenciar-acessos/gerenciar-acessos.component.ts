import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import Swal from 'sweetalert2';
import { UsuarioService, Usuario, CriarUsuarioRequest, AtualizarUsuarioRequest, AtualizarPermissoesRequest, PageResponse } from '../../services/usuario.service';
import { ErpFinanceiroService } from '../../services/erp-financeiro.service';
import { CompanySelectorService, CompaniaInfo } from '../../services/company-selector.service';
import { EmpresaConfigService } from '../../services/empresa-config.service';

interface EmpresaResumoUsuario {
  idEmpresa: number | null;
  nomeEmpresa: string;
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  emailEmpresa?: string;
  telefoneEmpresa?: string;
  taxaCartaoCredito?: number;
  taxaAntecipacaoCredito?: number;
  carregando: boolean;
  erro?: string;
}

@Component({
  selector: 'app-gerenciar-acessos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gerenciar-acessos.component.html',
  styleUrls: ['./gerenciar-acessos.component.scss']
})
export class GerenciarAcessosComponent implements OnInit {
  usuarios: Usuario[] = [];
  usuariosFiltrados: Usuario[] = [];
  
  // Paginação
  paginaAtual: number = 0;
  tamanhoPagina: number = 10;
  totalElementos: number = 0;
  totalPaginas: number = 0;
  carregando: boolean = false;
  erro: string | null = null;
  
  // Expor Math para o template
  Math = Math;
  
  // Filtros
  filtroTexto: string = '';
  filtroRole: string = 'todos';
  filtroStatus: string = 'todos';
  usarFiltrosAvancados: boolean = false;
  
  // Modal de edição
  usuarioEditando: Usuario | null = null;
  isModalAberto: boolean = false;
  formEdicao: AtualizarUsuarioRequest = {};
  
  // Modal de permissões
  usuarioPermissoes: Usuario | null = null;
  isPermissoesAberto: boolean = false;
  permissoesEditando: { [key: string]: boolean } = {};
  
  // Formulário de novo usuário
  novoUsuario: CriarUsuarioRequest = {
    nome: '',
    email: '',
    senha: '',
    role: 'CLIENTE'
  };
  novoUsuarioEmpresa = {
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    emailEmpresa: '',
    telefoneEmpresa: ''
  };
  isModalNovoAberto: boolean = false;

  // Gerenciamento de empresas (BOMControle)
  empresasDisponiveis: any[] = [];
  empresasUsuario: { [key: number]: boolean } = {};
  empresaPadraoSelecionada: number | null = null;
  empresaUnicaSelecionada: number | null = null;
  carregandoEmpresas: boolean = false;
  
  // Expor Object para o template
  Object = Object;

  // Configuração Asaas por empresa
  empresaSelecionadaParaConfig: number | null = null;
  asaasApiKeyInput = '';
  asaasBaseUrlInput = '';
  taxaCartaoCreditoInput: number | null = null;
  taxaAntecipacaoCreditoInput: number | null = null;
  configAsaasStatus: 'idle' | 'loading' | 'saved' | 'error' = 'idle';
  configAsaasMessage = '';
  asaasConfiguradoParaEmpresa = false;
  consultandoCnpjNovoUsuario = false;
  cnpjNovoUsuarioStatus: string | null = null;
  private ultimoCnpjNovoUsuarioConsultado = '';
  fieldErrorsNovoUsuario: Record<string, string> = {};
  empresaResumoPorUsuario: Record<number, EmpresaResumoUsuario> = {};
  usuarioEmpresaDetalhes: Usuario | null = null;
  isModalEmpresaAberto = false;

  constructor(
    private usuarioService: UsuarioService,
    private erpFinanceiroService: ErpFinanceiroService,
    private companySelectorService: CompanySelectorService,
    private empresaConfigService: EmpresaConfigService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.carregarUsuarios();
    this.carregarEmpresas();
    this.carregarEmpresasUsuarioLogado();
  }

  /**
   * Carrega empresas do usuário atualmente logado e atualiza o seletor
   */
  private carregarEmpresasUsuarioLogado() {
    this.usuarioService.buscarMeuPerfil().subscribe({
      next: (usuarioAtual: Usuario) => {
        this.usuarioService.obterEmpresasUsuario(usuarioAtual.id).subscribe({
          next: (empresas: any[]) => {
            // Converter para CompaniaInfo[]
            const empresasInfo: CompaniaInfo[] = empresas
              .filter(e => e.ativo)
              .map(e => ({
                id: e.id,
                idEmpresa: e.idEmpresa,
                nomeEmpresa: e.nomeEmpresa,
                padrao: e.padrao,
                ativo: e.ativo,
                dataCriacao: e.dataCriacao
              }));

            // Atualiza o seletor de empresas com as empresas do usuário
            if (empresasInfo.length > 0) {
              this.companySelectorService.atualizarEmpresas(empresasInfo);
              console.log(`✅ Empresas do usuário sincronizadas no seletor -> ${empresasInfo.length} empresa(s)`);
            }
          },
          error: (error) => {
            console.error('Erro ao carregar empresas do usuário logado:', error);
          }
        });
      },
      error: (error) => {
        console.error('Erro ao obter perfil do usuário:', error);
      }
    });
  }

  /**
   * Carrega empresas disponíveis no BOMControle
   */
  carregarEmpresas() {
    this.carregandoEmpresas = true;
    this.erpFinanceiroService.listarEmpresas().subscribe({
      next: (response: any) => {
        this.empresasDisponiveis = response.empresas || [];
        console.log(`📦 ${this.empresasDisponiveis.length} empresas carregadas do ERP`);
        this.carregandoEmpresas = false;
      },
      error: (error: any) => {
        console.error('Erro ao carregar empresas:', error);
        this.empresasDisponiveis = [];
        this.carregandoEmpresas = false;
      }
    });
  }

  /**
   * Carrega usuários do backend com paginação
   */
  carregarUsuarios() {
    this.carregando = true;
    this.erro = null;

    if (this.usarFiltrosAvancados && (this.filtroTexto || this.filtroRole !== 'todos' || this.filtroStatus !== 'todos')) {
      // Usar filtros avançados do backend
      const filtros: any = {
        page: this.paginaAtual,
        size: this.tamanhoPagina,
        sort: 'nome'
      };

      if (this.filtroTexto) {
        filtros.nome = this.filtroTexto;
        filtros.email = this.filtroTexto;
      }
      if (this.filtroRole !== 'todos') {
        filtros.role = this.filtroRole.toUpperCase();
      }
      if (this.filtroStatus !== 'todos') {
        filtros.status = this.filtroStatus.toUpperCase();
      }

      this.usuarioService.listarComFiltros(filtros).subscribe({
        next: (response: PageResponse<Usuario>) => {
          this.processarResposta(response);
        },
        error: (error) => {
          this.erro = 'Erro ao carregar usuários. Tente novamente.';
          console.error('Erro ao carregar usuários:', error);
          this.carregando = false;
        }
      });
    } else {
      // Listagem simples com paginação
      this.usuarioService.listarUsuarios(this.paginaAtual, this.tamanhoPagina, 'nome').subscribe({
        next: (response: PageResponse<Usuario>) => {
          this.processarResposta(response);
        },
        error: (error) => {
          this.erro = 'Erro ao carregar usuários. Tente novamente.';
          console.error('Erro ao carregar usuários:', error);
          this.carregando = false;
        }
      });
    }
  }

  /**
   * Processa a resposta paginada do backend
   */
  private processarResposta(response: PageResponse<Usuario>) {
    this.usuarios = response.content || [];
    this.usuariosFiltrados = [...this.usuarios];
    this.totalElementos = response.totalElements || 0;
    this.totalPaginas = response.totalPages || 0;
    this.paginaAtual = response.number || 0;
    this.carregarResumoEmpresasDaPagina(this.usuarios);
    this.carregando = false;
  }

  private carregarResumoEmpresasDaPagina(usuarios: Usuario[]): void {
    this.empresaResumoPorUsuario = {};
    usuarios.forEach((usuario) => this.carregarResumoEmpresaUsuario(usuario.id));
  }

  private carregarResumoEmpresaUsuario(usuarioId: number): void {
    this.empresaResumoPorUsuario[usuarioId] = {
      idEmpresa: null,
      nomeEmpresa: 'Carregando empresa...',
      carregando: true
    };

    this.usuarioService.obterEmpresasUsuario(usuarioId).subscribe({
      next: (empresas: any[]) => {
        const primeiraAtiva = (empresas || []).find((e) => !!e?.ativo) || (empresas || [])[0];
        const idEmpresa = Number(primeiraAtiva?.idEmpresa || usuarioId);
        const nomeEmpresa = String(primeiraAtiva?.nomeEmpresa || `Empresa ${idEmpresa}`).trim();
        this.empresaResumoPorUsuario[usuarioId] = {
          idEmpresa,
          nomeEmpresa: nomeEmpresa || `Empresa ${idEmpresa}`,
          carregando: false
        };
        if (idEmpresa > 0) {
          this.carregarDadosEmpresaConfig(usuarioId, idEmpresa);
        }
      },
      error: () => {
        const idEmpresa = Number(usuarioId);
        this.empresaResumoPorUsuario[usuarioId] = {
          idEmpresa,
          nomeEmpresa: `Empresa ${idEmpresa}`,
          carregando: false,
          erro: 'Não foi possível carregar vínculo da empresa.'
        };
        this.carregarDadosEmpresaConfig(usuarioId, idEmpresa);
      }
    });
  }

  private carregarDadosEmpresaConfig(usuarioId: number, idEmpresa: number): void {
    this.empresaConfigService.getConfig(idEmpresa).subscribe({
      next: (config) => {
        const atual = this.empresaResumoPorUsuario[usuarioId];
        if (!atual) return;
        this.empresaResumoPorUsuario[usuarioId] = {
          ...atual,
          cnpj: config.cnpj || undefined,
          razaoSocial: config.razaoSocial || undefined,
          nomeFantasia: config.nomeFantasia || undefined,
          emailEmpresa: config.emailEmpresa || undefined,
          telefoneEmpresa: config.telefoneEmpresa || undefined,
          taxaCartaoCredito: this.normalizarTaxa(config.taxaCartaoCredito),
          taxaAntecipacaoCredito: this.normalizarTaxa(config.taxaAntecipacaoCredito)
        };
      },
      error: () => {
        // Sem config detalhada ainda: mantém nome e vínculo já carregados.
      }
    });
  }

  getResumoEmpresa(usuarioId: number): EmpresaResumoUsuario | null {
    return this.empresaResumoPorUsuario[usuarioId] || null;
  }

  abrirModalEmpresa(usuario: Usuario): void {
    this.usuarioEmpresaDetalhes = usuario;
    this.isModalEmpresaAberto = true;
    if (!this.empresaResumoPorUsuario[usuario.id]) {
      this.carregarResumoEmpresaUsuario(usuario.id);
    }
  }

  fecharModalEmpresa(): void {
    this.isModalEmpresaAberto = false;
    this.usuarioEmpresaDetalhes = null;
  }

  formatarCnpj(cnpj?: string): string {
    const digits = (cnpj || '').replace(/\D/g, '');
    if (digits.length !== 14) return cnpj || '-';
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  }

  /**
   * Aplica filtros localmente (para busca rápida enquanto digita)
   */
  aplicarFiltros() {
    this.usuariosFiltrados = this.usuarios.filter(usuario => {
      const matchTexto = !this.filtroTexto || 
        usuario.name.toLowerCase().includes(this.filtroTexto.toLowerCase()) ||
        usuario.email.toLowerCase().includes(this.filtroTexto.toLowerCase());
      
      const matchRole = this.filtroRole === 'todos' || usuario.role === this.filtroRole;
      const matchStatus = this.filtroStatus === 'todos' || usuario.status === this.filtroStatus;
      
      return matchTexto && matchRole && matchStatus;
    });
  }

  /**
   * Quando filtros mudam, recarrega do backend
   */
  onFiltroChange() {
    this.paginaAtual = 0; // Reset para primeira página
    this.carregarUsuarios();
  }

  /**
   * Navegação de páginas
   */
  irParaPagina(pagina: number) {
    if (pagina >= 0 && pagina < this.totalPaginas) {
      this.paginaAtual = pagina;
      this.carregarUsuarios();
    }
  }

  /**
   * Abre modal de edição
   */
  abrirModalEdicao(usuario: Usuario) {
    this.usuarioEditando = usuario;
    this.formEdicao = {
      nome: usuario.name,
      email: usuario.email,
      role: usuario.role.toUpperCase() as 'ADMIN' | 'CLIENTE',
      status: usuario.status.toUpperCase() as 'ATIVO' | 'INATIVO'
    };
    this.isModalAberto = true;
  }

  fecharModal() {
    this.isModalAberto = false;
    this.usuarioEditando = null;
    this.formEdicao = {};
  }

  /**
   * Salva alterações do usuário
   */
  salvarUsuario() {
    if (!this.usuarioEditando) return;

    this.carregando = true;
    this.usuarioService.atualizarUsuario(this.usuarioEditando.id, this.formEdicao).subscribe({
      next: (usuarioAtualizado) => {
        this.carregarUsuarios(); // Recarrega lista
        this.fecharModal();
      },
      error: (error) => {
        this.erro = 'Erro ao atualizar usuário. Tente novamente.';
        console.error('Erro ao atualizar usuário:', error);
        this.carregando = false;
      }
    });
  }

  /**
   * Abre modal de permissões
   */
  abrirModalPermissoes(usuario: Usuario) {
    this.usuarioPermissoes = usuario;
    this.permissoesEditando = usuario.permissions ? { ...usuario.permissions } : {
      dashboard: false,
      relatorio: false,
      movimentacoes: false,
      fluxoCaixa: false,
      contratos: false,
      chat: false,
      assinatura: false,
      gerenciarAcessos: false
    };

    this.empresaSelecionadaParaConfig = null;
    this.asaasApiKeyInput = '';
    this.asaasBaseUrlInput = '';
    this.asaasConfiguradoParaEmpresa = false;
    this.configAsaasStatus = 'idle';
    this.configAsaasMessage = '';
    
    // Carregar empresas do usuário
    this.carregarEmpresasUsuario(usuario.id);
    this.isPermissoesAberto = true;
  }

  /**
   * Carrega empresas permite para um usuário
   */
  carregarEmpresasUsuario(usuarioId: number) {
    this.carregandoEmpresas = true;
    
    // GET /api/usuarios/{id}/empresas
    this.usuarioService.obterEmpresasUsuario(usuarioId).subscribe({
      next: (empresas: any[]) => {
        this.empresasUsuario = {};
        this.empresaPadraoSelecionada = null;
        this.empresaUnicaSelecionada = null;
        
        empresas.forEach(empresa => {
          this.empresasUsuario[empresa.idEmpresa] = empresa.ativo;
          if (empresa.padrao) {
            this.empresaPadraoSelecionada = empresa.idEmpresa;
          }
        });
        
        // Novo modelo: 1 empresa por usuário.
        if (this.empresaPadraoSelecionada) {
          this.empresaUnicaSelecionada = this.empresaPadraoSelecionada;
        } else {
          const primeiraAtiva = empresas.find(e => !!e.ativo);
          this.empresaUnicaSelecionada = primeiraAtiva?.idEmpresa ?? null;
        }

        // Regra operacional atual: 1 usuário = 1 empresa.
        // Se não houver vínculo retornado, usa o ID do usuário como ID da empresa.
        if (!this.empresaUnicaSelecionada) {
          this.empresaUnicaSelecionada = usuarioId;
        }

        this.empresaSelecionadaParaConfig = this.empresaUnicaSelecionada;
        if (this.empresaSelecionadaParaConfig) {
          this.onEmpresaConfigChange();
        } else {
          this.asaasConfiguradoParaEmpresa = false;
          this.asaasApiKeyInput = '';
          this.asaasBaseUrlInput = '';
          this.configAsaasStatus = 'idle';
          this.configAsaasMessage = '';
        }

        console.log(`✅ Carregadas ${Object.keys(this.empresasUsuario).length} empresas do usuário`);
        this.carregandoEmpresas = false;
      },
      error: (error) => {
        console.error('Erro ao carregar empresas do usuário:', error);
        this.empresasUsuario = {};
        // Fallback para manter o fluxo de configuração Asaas no modelo 1:1.
        this.empresaUnicaSelecionada = usuarioId;
        this.empresaSelecionadaParaConfig = usuarioId;
        this.onEmpresaConfigChange();
        this.carregandoEmpresas = false;
      }
    });
  }

  fecharModalPermissoes() {
    this.isPermissoesAberto = false;
    this.usuarioPermissoes = null;
    this.permissoesEditando = {};
    this.empresaUnicaSelecionada = null;
    this.empresaSelecionadaParaConfig = null;
    this.asaasApiKeyInput = '';
    this.asaasBaseUrlInput = '';
    this.asaasConfiguradoParaEmpresa = false;
    this.configAsaasStatus = 'idle';
    this.configAsaasMessage = '';
  }

  /**
   * Salva permissões do usuário
   */
  salvarPermissoes() {
    if (!this.usuarioPermissoes) return;

    this.carregando = true;
    const request: AtualizarPermissoesRequest = {
      permissions: this.permissoesEditando
    };

    this.usuarioService.atualizarPermissoes(this.usuarioPermissoes.id, request).subscribe({
      next: () => {
        // Agora este modal cuida apenas de permissões.
        this.carregarUsuarios();
        this.fecharModalPermissoes();
      },
      error: (error) => {
        this.erro = 'Erro ao atualizar permissões. Tente novamente.';
        console.error('Erro ao atualizar permissões:', error);
        this.carregando = false;
      }
    });
  }

  /**
   * Salva empresas atribuídas ao usuário
   * PUT /api/usuarios/{id}/empresas
   */
  salvarEmpresasUsuario(usuarioId: number) {
    const empresaId = this.empresaUnicaSelecionada;
    const empresasSelecionadas = empresaId ? [empresaId] : [];

    const payload = {
      empresaIds: empresasSelecionadas,
      idEmpresaPadrao: empresaId
    };

    this.usuarioService.atualizarEmpresasUsuario(usuarioId, payload).subscribe({
      next: (empresas) => {
        console.log('✅ Empresas do usuário atualizadas com sucesso');
        this.carregarUsuarios(); // Recarrega lista
        this.fecharModalPermissoes();
      },
      error: (error) => {
        this.erro = 'Erro ao atualizar empresas. Tente novamente.';
        console.error('Erro ao atualizar empresas:', error);
        this.carregando = false;
      }
    });
  }

  /**
   * Abre modal de novo usuário
   */
  abrirModalNovo() {
    this.novoUsuario = {
      nome: '',
      email: '',
      senha: '',
      role: 'CLIENTE'
    };
    this.novoUsuarioEmpresa = {
      cnpj: '',
      razaoSocial: '',
      nomeFantasia: '',
      emailEmpresa: '',
      telefoneEmpresa: ''
    };
    this.consultandoCnpjNovoUsuario = false;
    this.cnpjNovoUsuarioStatus = null;
    this.ultimoCnpjNovoUsuarioConsultado = '';
    this.fieldErrorsNovoUsuario = {};
    this.isModalNovoAberto = true;

    // Para single-tenant: usar automaticamente a primeira empresa disponível
    // apenas para vincular a chave Asaas (sem exibir na UI).
    if (this.empresasDisponiveis.length > 0) {
      this.empresaSelecionadaParaConfig = this.empresasDisponiveis[0].Id;
      this.onEmpresaConfigChange();
    } else {
      this.empresaSelecionadaParaConfig = null;
      this.asaasConfiguradoParaEmpresa = false;
      this.asaasApiKeyInput = '';
      this.asaasBaseUrlInput = '';
    }
  }

  fecharModalNovo() {
    this.isModalNovoAberto = false;
    this.consultandoCnpjNovoUsuario = false;
    this.cnpjNovoUsuarioStatus = null;
    this.ultimoCnpjNovoUsuarioConsultado = '';
  }

  /**
   * Cria novo usuário
   */
  criarUsuario() {
    const cnpj = this.apenasDigitos(this.novoUsuarioEmpresa.cnpj);
    const razaoSocial = (this.novoUsuarioEmpresa.razaoSocial || '').trim();
    const nomeFantasia = (this.novoUsuarioEmpresa.nomeFantasia || '').trim();
    const emailEmpresa = (this.novoUsuarioEmpresa.emailEmpresa || '').trim().toLowerCase();
    const telefoneEmpresa = (this.novoUsuarioEmpresa.telefoneEmpresa || '').trim();
    const nomeResponsavel = (this.novoUsuario.nome || '').trim();
    const senha = this.novoUsuario.senha || '';
    this.fieldErrorsNovoUsuario = {};
    if (cnpj.length !== 14) {
      this.fieldErrorsNovoUsuario['cnpj'] = 'Informe um CNPJ válido.';
    }
    if (!razaoSocial) {
      this.fieldErrorsNovoUsuario['razaoSocial'] = 'Razão social é obrigatória.';
    }
    if (!emailEmpresa) {
      this.fieldErrorsNovoUsuario['emailEmpresa'] = 'Email da empresa é obrigatório.';
    } else if (!this.emailValido(emailEmpresa)) {
      this.fieldErrorsNovoUsuario['emailEmpresa'] = 'Informe um email válido.';
    }
    if (!nomeResponsavel) {
      this.fieldErrorsNovoUsuario['nomeResponsavel'] = 'Nome do responsável é obrigatório.';
    }
    if (!senha) {
      this.fieldErrorsNovoUsuario['senha'] = 'Senha é obrigatória.';
    } else if (senha.length < 6) {
      this.fieldErrorsNovoUsuario['senha'] = 'A senha deve ter pelo menos 6 caracteres.';
    }

    if (Object.keys(this.fieldErrorsNovoUsuario).length > 0) {
      this.erro = 'Preencha os campos obrigatórios para continuar.';
      return;
    }

    this.novoUsuario.nome = nomeResponsavel;
    this.novoUsuario.email = emailEmpresa;

    this.carregando = true;
    this.erro = null;
    this.usuarioService.criarUsuario(this.novoUsuario).subscribe({
      next: (novoUsuario) => {
        const idEmpresa = Number(novoUsuario?.id);
        const nomeEmpresa = razaoSocial || nomeFantasia || this.novoUsuario.nome.trim();
        this.usuarioService
          .atribuirEmpresaUsuario(novoUsuario.id, {
            idEmpresa,
            nomeEmpresa,
            padrao: true
          })
          .subscribe({
            next: () => {
              this.empresaConfigService
                .saveConfig(
                  idEmpresa,
                  this.asaasApiKeyInput?.trim() || '',
                  this.asaasBaseUrlInput?.trim() || undefined,
                  {
                    cnpj,
                    razaoSocial,
                    nomeFantasia,
                    emailEmpresa: emailEmpresa || undefined,
                    telefoneEmpresa: telefoneEmpresa || undefined
                  }
                )
                .subscribe({
                  next: () => {
                    this.carregarUsuarios();
                    this.fecharModalNovo();
                    this.carregando = false;
                    Swal.fire({
                      icon: 'success',
                      title: 'Conta criada com sucesso',
                      text: 'Usuário e empresa foram cadastrados corretamente.',
                      confirmButtonText: 'Perfeito'
                    });
                  },
                  error: (error) => {
                    this.erro = error.error?.message || 'Usuário criado, mas falhou ao salvar dados da empresa.';
                    this.carregarUsuarios();
                    this.carregando = false;
                    const mensagem = this.erro || 'Usuário criado, mas houve falha ao salvar dados complementares.';
                    Swal.fire({
                      icon: 'warning',
                      title: 'Conta criada parcialmente',
                      text: mensagem,
                      confirmButtonText: 'Entendi'
                    });
                  }
                });
            },
            error: (error) => {
              this.erro = error.error?.erro || 'Usuário criado, mas falhou ao vincular empresa.';
              this.carregarUsuarios();
              this.carregando = false;
              const mensagem = this.erro || 'Usuário criado, mas houve falha no vínculo da empresa.';
              Swal.fire({
                icon: 'warning',
                title: 'Conta criada parcialmente',
                text: mensagem,
                confirmButtonText: 'Entendi'
              });
            }
          });
      },
      error: (error) => {
        this.erro = error.error?.message || 'Erro ao criar usuário. Tente novamente.';
        console.error('Erro ao criar usuário:', error);
        this.carregando = false;
        const mensagem = this.erro || 'Erro inesperado ao criar a conta.';
        Swal.fire({
          icon: 'error',
          title: 'Não foi possível criar a conta',
          text: mensagem,
          confirmButtonText: 'Fechar'
        });
      }
    });
  }

  onNovoUsuarioCnpjInput(): void {
    const digits = this.apenasDigitos(this.novoUsuarioEmpresa.cnpj).slice(0, 14);
    this.novoUsuarioEmpresa.cnpj = this.aplicarMascaraCnpj(digits);
    this.clearFieldErrorNovoUsuario('cnpj');
    if (digits.length < 14) {
      this.cnpjNovoUsuarioStatus = null;
      return;
    }
    this.consultarCnpjNovoUsuario(digits);
  }

  onNovoUsuarioEmailEmpresaChange(): void {
    this.novoUsuario.email = (this.novoUsuarioEmpresa.emailEmpresa || '').trim().toLowerCase();
    this.clearFieldErrorNovoUsuario('emailEmpresa');
  }

  private apenasDigitos(valor: string): string {
    return (valor || '').replace(/\D/g, '');
  }

  private aplicarMascaraCnpj(digits: string): string {
    if (!digits) {
      return '';
    }
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  }

  private consultarCnpjNovoUsuario(cnpj: string): void {
    if (cnpj.length !== 14 || this.consultandoCnpjNovoUsuario) {
      return;
    }
    if (cnpj === this.ultimoCnpjNovoUsuarioConsultado && this.novoUsuarioEmpresa.razaoSocial.trim()) {
      return;
    }

    this.consultandoCnpjNovoUsuario = true;
    this.cnpjNovoUsuarioStatus = null;
    this.http
      .get<{ razao_social?: string; nome_fantasia?: string }>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
      .pipe(finalize(() => (this.consultandoCnpjNovoUsuario = false)))
      .subscribe({
        next: (dados) => {
          const razao = (dados?.razao_social || '').trim();
          const fantasia = (dados?.nome_fantasia || '').trim();
          if (razao) {
            this.novoUsuarioEmpresa.razaoSocial = razao;
          }
          if (fantasia) {
            this.novoUsuarioEmpresa.nomeFantasia = fantasia;
          }
          this.ultimoCnpjNovoUsuarioConsultado = cnpj;
          this.cnpjNovoUsuarioStatus =
            razao || fantasia
              ? 'Razão social e nome fantasia preenchidos automaticamente.'
              : 'CNPJ encontrado, mas sem dados de razão/fantasia.';
        },
        error: () => {
          this.cnpjNovoUsuarioStatus = 'Não foi possível consultar o CNPJ agora.';
        }
      });
  }

  private emailValido(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  clearFieldErrorNovoUsuario(field: string): void {
    if (this.fieldErrorsNovoUsuario[field]) {
      delete this.fieldErrorsNovoUsuario[field];
    }
  }

  hasFieldErrorNovoUsuario(field: string): boolean {
    return !!this.fieldErrorsNovoUsuario[field];
  }

  /**
   * Alterna status do usuário (ativo/inativo)
   */
  alternarStatus(usuario: Usuario) {
    const novoStatus = usuario.status === 'ativo' ? 'INATIVO' : 'ATIVO';
    
    this.carregando = true;
    this.usuarioService.atualizarUsuario(usuario.id, { status: novoStatus }).subscribe({
      next: () => {
        this.carregarUsuarios(); // Recarrega lista
      },
      error: (error) => {
        this.erro = 'Erro ao alterar status. Tente novamente.';
        console.error('Erro ao alterar status:', error);
        this.carregando = false;
      }
    });
  }

  /**
   * Exclui usuário (soft delete)
   */
  excluirUsuario(usuario: Usuario) {
    if (confirm(`Tem certeza que deseja excluir o usuário ${usuario.name}?`)) {
      this.carregando = true;
      this.usuarioService.deletarUsuario(usuario.id).subscribe({
        next: () => {
          this.carregarUsuarios(); // Recarrega lista
        },
        error: (error) => {
          this.erro = 'Erro ao excluir usuário. Tente novamente.';
          console.error('Erro ao excluir usuário:', error);
          this.carregando = false;
        }
      });
    }
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

  /**
   * Classes CSS para badges de status
   */
  getStatusBadgeClass(status: string): string {
    const normalizado = (status || '').toLowerCase();
    return normalizado === 'ativo'
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  }

  /**
   * Classes CSS para badges de role
   */
  getRoleBadgeClass(role: string): string {
    const normalizado = (role || '').toLowerCase();
    return normalizado === 'admin'
      ? 'bg-purple-100 text-purple-800' 
      : 'bg-blue-100 text-blue-800';
  }

  getRoleLabel(role: string): string {
    return (role || '').toLowerCase() === 'admin' ? 'Administrador' : 'Cliente';
  }

  getStatusLabel(status: string): string {
    return (status || '').toLowerCase() === 'ativo' ? 'Ativo' : 'Inativo';
  }

  getIniciais(nome: string): string {
    const valor = (nome || '').trim();
    if (!valor) return 'US';
    const partes = valor.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  }

  temFiltrosAtivos(): boolean {
    return !!(this.filtroTexto || this.filtroRole !== 'todos' || this.filtroStatus !== 'todos');
  }

  limparFiltros(): void {
    this.filtroTexto = '';
    this.filtroRole = 'todos';
    this.filtroStatus = 'todos';
    this.onFiltroChange();
  }

  /**
   * Gera array de números para paginação
   */
  getPaginas(): number[] {
    const paginas: number[] = [];
    const inicio = Math.max(0, this.paginaAtual - 2);
    const fim = Math.min(this.totalPaginas - 1, this.paginaAtual + 2);
    
    for (let i = inicio; i <= fim; i++) {
      paginas.push(i);
    }
    return paginas;
  }

  /**
   * Retorna a contagem de empresas selecionadas
   */
  getContagemEmpresasSelecionadas(): number {
    return Object.values(this.empresasUsuario).filter(v => v).length;
  }

  /**
   * Retorna o nome da empresa padrão selecionada
   */
  getEmpresaPadraoNome(): string | undefined {
    const id = this.empresaUnicaSelecionada || this.empresaPadraoSelecionada;
    if (!id) return undefined;
    const empresa = this.empresasDisponiveis.find(e => e.Id === id);
    return empresa?.Nome;
  }

  getEmpresaConfigLabel(): string {
    if (!this.empresaSelecionadaParaConfig) {
      return 'Empresa não vinculada';
    }
    const nome = this.getEmpresaPadraoNome();
    if (nome) {
      return nome;
    }
    const nomeConta = (this.usuarioPermissoes?.name || '').trim();
    if (nomeConta) {
      return nomeConta;
    }
    return 'Conta vinculada';
  }

  /**
   * Ao selecionar empresa para config Asaas, carrega status atual
   */
  onEmpresaConfigChange() {
    this.asaasApiKeyInput = '';
    this.configAsaasStatus = 'idle';
    this.configAsaasMessage = '';
    if (!this.empresaSelecionadaParaConfig) {
      this.asaasConfiguradoParaEmpresa = false;
      return;
    }
    this.configAsaasStatus = 'loading';
    this.empresaConfigService.getConfig(this.empresaSelecionadaParaConfig).subscribe({
      next: (res) => {
        this.asaasConfiguradoParaEmpresa = res.asaasConfigurado;
        this.asaasBaseUrlInput = res.asaasBaseUrl || '';
        this.taxaCartaoCreditoInput = this.normalizarTaxa(res.taxaCartaoCredito) ?? null;
        this.taxaAntecipacaoCreditoInput = this.normalizarTaxa(res.taxaAntecipacaoCredito) ?? null;
        this.configAsaasStatus = 'idle';
      },
      error: () => {
        this.asaasConfiguradoParaEmpresa = false;
        this.taxaCartaoCreditoInput = null;
        this.taxaAntecipacaoCreditoInput = null;
        this.configAsaasStatus = 'idle';
      }
    });
  }

  /**
   * Salva chave API Asaas para a empresa selecionada
   */
  salvarConfigAsaas() {
    if (this.empresaSelecionadaParaConfig == null) {
      this.configAsaasMessage = 'Selecione uma empresa.';
      this.configAsaasStatus = 'error';
      return;
    }
    if (!this.asaasApiKeyInput?.trim() && !this.asaasConfiguradoParaEmpresa) {
      this.configAsaasMessage = 'Informe a chave API do Asaas (obrigatório na primeira vez).';
      this.configAsaasStatus = 'error';
      return;
    }
    this.configAsaasStatus = 'loading';
    this.configAsaasMessage = '';
    this.empresaConfigService.saveConfig(
      this.empresaSelecionadaParaConfig,
      this.asaasApiKeyInput?.trim() || '',
      this.asaasBaseUrlInput?.trim() || undefined,
      {
        taxaCartaoCredito: this.normalizarTaxa(this.taxaCartaoCreditoInput),
        taxaAntecipacaoCredito: this.normalizarTaxa(this.taxaAntecipacaoCreditoInput)
      }
    ).subscribe({
      next: (res: { message?: string; contratosImportados?: number; importacaoErro?: string }) => {
        this.configAsaasStatus = 'saved';
        if (res.contratosImportados != null && res.contratosImportados >= 0) {
          this.configAsaasMessage = `Chave salva. ${res.contratosImportados} contrato(s) importado(s) do Asaas.`;
        } else if (res.importacaoErro) {
          this.configAsaasMessage = `Chave salva. Importação do Asaas falhou: ${res.importacaoErro}`;
        } else {
          this.configAsaasMessage = res.message || 'Chave salva com sucesso.';
        }
        this.asaasApiKeyInput = '';
        this.asaasConfiguradoParaEmpresa = true;
      },
      error: (err) => {
        this.configAsaasStatus = 'error';
        const msg = err.error?.message || err.message;
        if (err.status === 403) {
          this.configAsaasMessage = 'Sem permissão. Seu usuário precisa da permissão "Gerenciar Acessos".';
        } else if (msg) {
          this.configAsaasMessage = msg;
        } else {
          this.configAsaasMessage = 'Erro ao salvar. Verifique se o backend está online e tente novamente.';
        }
      }
    });
  }

  private normalizarTaxa(valor: number | null | undefined): number | undefined {
    if (valor == null || Number.isNaN(Number(valor))) {
      return undefined;
    }
    const taxa = Number(valor);
    if (taxa < 0) {
      return 0;
    }
    return Number(taxa.toFixed(4));
  }
}
