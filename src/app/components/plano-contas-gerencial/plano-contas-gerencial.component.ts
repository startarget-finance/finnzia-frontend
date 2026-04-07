import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
export class PlanoContasGerencialComponent implements OnInit {
  /** Quando true, usado dentro da Parametrização — sem moldura de página inteira. */
  @Input() embedded = false;

  carregando = false;
  erro: string | null = null;
  planos: PlanoContasGerencial[] = [];
  filtroEmpresaId: number | null = null;

  empresasDisponiveis: CompaniaInfo[] = [];
  isAdmin = false;

  modalAberto = false;
  editandoId: number | null = null;
  formNome = '';
  formPadrao = false;
  formEmpresaIds: Record<number, boolean> = {};

  constructor(
    private readonly api: PlanoContasGerencialService,
    private readonly companySelector: CompanySelectorService,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.auth.getCurrentUser()?.role === 'admin';
    this.companySelector.empresasPermitidas$.subscribe((list) => {
      this.empresasDisponiveis = (list || []).filter((e) => e.ativo && e.idEmpresa);
      this.carregar();
    });
  }

  carregar(): void {
    this.erro = null;
    this.carregando = true;
    const fid = this.filtroEmpresaId != null && this.filtroEmpresaId > 0 ? this.filtroEmpresaId : undefined;
    this.api.listar(fid).subscribe({
      next: (data) => {
        this.planos = data || [];
        this.carregando = false;
      },
      error: (e) => {
        this.carregando = false;
        this.erro = e.error?.mensagem || 'Não foi possível carregar os planos.';
      }
    });
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formNome = '';
    this.formPadrao = false;
    this.formEmpresaIds = {};
    for (const e of this.empresasDisponiveis) {
      if (e.idEmpresa) {
        this.formEmpresaIds[e.idEmpresa] = false;
      }
    }
    this.modalAberto = true;
  }

  abrirEditar(p: PlanoContasGerencial): void {
    this.editandoId = p.id;
    this.formNome = p.nome;
    this.formPadrao = !!p.padrao;
    this.formEmpresaIds = {};
    for (const e of this.empresasDisponiveis) {
      if (e.idEmpresa) {
        this.formEmpresaIds[e.idEmpresa] = p.idEmpresas?.includes(e.idEmpresa) ?? false;
      }
    }
    this.modalAberto = true;
  }

  fecharModal(): void {
    this.modalAberto = false;
  }

  coletarEmpresasSelecionadas(): number[] {
    return Object.entries(this.formEmpresaIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
  }

  salvar(): void {
    const nome = this.formNome.trim();
    if (!nome) {
      this.erro = 'Informe o nome do plano.';
      return;
    }
    const idEmpresas = this.coletarEmpresasSelecionadas();
    if (!this.isAdmin && idEmpresas.length === 0) {
      this.erro = 'Selecione pelo menos uma empresa.';
      return;
    }
    const body: PlanoContasGerencialPayload = {
      nome,
      idEmpresas,
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
        this.erro = 'Arquivo inválido. Use JSON: [{"nome":"...","idEmpresas":[1],"padrao":false}]';
      }
    };
    reader.readAsText(file);
  }

  private importarLote(items: unknown[]): void {
    let i = 0;
    const next = (): void => {
      if (i >= items.length) {
        this.carregando = false;
        this.carregar();
        return;
      }
      const raw = items[i++] as Record<string, unknown>;
      const nome = String(raw['nome'] || '').trim();
      const ids = Array.isArray(raw['idEmpresas'])
        ? (raw['idEmpresas'] as unknown[]).map((x) => Number(x)).filter((n) => n > 0)
        : [];
      const padrao = raw['padrao'] === true;
      if (!nome) {
        next();
        return;
      }
      if (!this.isAdmin && ids.length === 0) {
        next();
        return;
      }
      this.api.criar({ nome, idEmpresas: ids, padrao }).subscribe({
        next: () => next(),
        error: () => next()
      });
    };
    this.carregando = true;
    next();
  }
}
