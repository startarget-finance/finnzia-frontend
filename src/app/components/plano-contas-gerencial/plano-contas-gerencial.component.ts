import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniaInfo, CompanySelectorService } from '../../services/company-selector.service';
import {
  PlanoContasGerencial,
  PlanoContasGerencialPayload,
  PlanoContasGerencialService
} from '../../services/plano-contas-gerencial.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-plano-contas-gerencial',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plano-contas-gerencial.component.html'
})
export class PlanoContasGerencialComponent implements OnInit, OnDestroy {
  /** Quando true, usado dentro da Parametrização — sem moldura de página inteira. */
  @Input() embedded = false;
  @Output() resumoTotal = new EventEmitter<number>();

  carregando = false;
  erro: string | null = null;
  planos: PlanoContasGerencial[] = [];

  empresasDisponiveis: CompaniaInfo[] = [];

  modalAberto = false;
  editandoId: number | null = null;
  formNome = '';
  formPadrao = false;
  private modalSnapshot = '';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly api: PlanoContasGerencialService,
    private readonly companySelector: CompanySelectorService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    this.companySelector.empresasPermitidas$.pipe(takeUntil(this.destroy$)).subscribe((list) => {
      this.empresasDisponiveis = (list || []).filter((e) => e.ativo && e.idEmpresa);
      this.carregar();
    });
    this.companySelector.empresaSelecionada$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.carregar();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregar(): void {
    this.erro = null;
    if (!this.authService.isAuthenticated() || !this.authService.getToken()) {
      this.carregando = false;
      this.planos = [];
      this.resumoTotal.emit(0);
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.carregando = false;
      this.planos = [];
      this.resumoTotal.emit(0);
      return;
    }
    this.carregando = true;
    const fid = idEmpresaAtual != null && idEmpresaAtual > 0 ? idEmpresaAtual : undefined;
    this.api.listar(fid).subscribe({
      next: (data) => {
        this.planos = data || [];
        this.resumoTotal.emit(this.planos.length);
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível carregar os planos.';
        this.resumoTotal.emit(0);
      }
    });
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formNome = '';
    this.formPadrao = false;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  abrirEditar(p: PlanoContasGerencial): void {
    this.editandoId = p.id;
    this.formNome = p.nome;
    this.formPadrao = !!p.padrao;
    this.atualizarSnapshotModal();
    this.modalAberto = true;
  }

  fecharModal(): void {
    if (this.temAlteracoesModal() && !confirm('Existem alterações não salvas. Deseja fechar mesmo assim?')) {
      return;
    }
    this.modalAberto = false;
  }

  private estadoModalAtual(): string {
    return JSON.stringify({
      editandoId: this.editandoId,
      formNome: this.formNome,
      formPadrao: this.formPadrao
    });
  }

  private atualizarSnapshotModal(): void {
    this.modalSnapshot = this.estadoModalAtual();
  }

  private temAlteracoesModal(): boolean {
    if (!this.modalAberto) return false;
    return this.modalSnapshot !== this.estadoModalAtual();
  }

  salvar(): void {
    const nome = this.formNome.trim();
    if (!nome) {
      this.erro = 'Informe o nome do plano.';
      return;
    }
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa do cadastro.';
      return;
    }
    const body: PlanoContasGerencialPayload = {
      nome,
      idEmpresas: [idEmpresaAtual],
      padrao: this.formPadrao
    };
    this.erro = null;
    this.carregando = true;
    const req =
      this.editandoId != null
        ? this.api.atualizar(this.editandoId, body)
        : this.api.criar(body);
    req.subscribe({
      next: () => {
        this.carregando = false;
        this.modalAberto = false;
        this.carregar();
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Erro ao salvar.';
      }
    });
  }

  marcarPadrao(p: PlanoContasGerencial): void {
    this.erro = null;
    this.carregando = true;
    this.api.marcarPadrao(p.id).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível definir como padrão.';
      }
    });
  }

  excluir(p: PlanoContasGerencial): void {
    if (!confirm(`Excluir o plano "${p.nome}"?`)) {
      return;
    }
    this.erro = null;
    this.carregando = true;
    this.api.excluir(p.id).subscribe({
      next: () => {
        this.carregando = false;
        this.carregar();
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível excluir.';
      }
    });
  }

  onImportarArquivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) {
          throw new Error('JSON deve ser um array');
        }
        this.importarLote(arr as unknown[]);
      } catch {
        this.erro = 'Arquivo inválido. Use JSON: [{"nome":"...","padrao":false}]';
      }
    };
    reader.readAsText(file);
  }

  private importarLote(items: unknown[]): void {
    const idEmpresaAtual = this.idEmpresaContexto();
    if (idEmpresaAtual == null || idEmpresaAtual <= 0) {
      this.erro = 'Não foi possível identificar a empresa para importar planos.';
      return;
    }
    let i = 0;
    const next = (): void => {
      if (i >= items.length) {
        this.carregando = false;
        this.carregar();
        return;
      }
      const raw = items[i++] as Record<string, unknown>;
      const nome = String(raw['nome'] || '').trim();
      const padrao = raw['padrao'] === true;
      if (!nome) {
        next();
        return;
      }
      this.api.criar({ nome, idEmpresas: [idEmpresaAtual], padrao }).subscribe({
        next: () => next(),
        error: () => next()
      });
    };
    this.carregando = true;
    next();
  }

  private idEmpresaContexto(): number | null {
    const selecionada = this.companySelector.obterIdEmpresaSelecionada();
    if (selecionada != null && selecionada > 0) {
      return selecionada;
    }
    const primeiraAtiva = this.companySelector.obterEmpresasAtivas()[0];
    return primeiraAtiva?.idEmpresa ?? null;
  }
}
