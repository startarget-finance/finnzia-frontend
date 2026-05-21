import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize, Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import {
  PluggyConexao,
  PluggyService,
  PluggySyncPayload,
} from '../../services/pluggy.service';
import { environment } from '../../../environments/environment';
import { CompanySelectorService } from '../../services/company-selector.service';
import {
  ContaBancariaCadastro,
  ContaBancariaCadastroService,
} from '../../services/conta-bancaria-cadastro.service';
import { extractHttpErrorBodyMessage, looksLikeNetworkInfrastructureMessage } from '../../services/error.service';

const MSG_SYNC_REDE =
  'A comunicação com o servidor caiu no meio da resposta (reinício da API, timeout ou rede). Tente de novo; se persistir, confira o console do backend.';

/** Lê texto útil do {@link HttpErrorResponse} (API finzzia, Spring padrão, RFC 7807). */
function mensagemErroHttp(
  err: unknown,
  opts: { fallback: string; status403?: string }
): string {
  const e = err as { status?: number; error?: unknown; message?: string };
  if (e?.status === 403 && opts.status403) {
    return opts.status403;
  }
  const raw = e?.error;
  if (typeof raw === 'string' && looksLikeNetworkInfrastructureMessage(raw)) {
    return MSG_SYNC_REDE;
  }
  const fromBody = extractHttpErrorBodyMessage(raw);
  if (fromBody) {
    return fromBody;
  }
  const status = e?.status;
  if (status === 502 || status === 503 || status === 504) {
    return MSG_SYNC_REDE;
  }
  if (status === 0 || status === undefined) {
    return MSG_SYNC_REDE;
  }
  if (typeof e?.message === 'string' && /Http failure|0 Unknown Error|network|connection reset|failed to fetch|ERR_|timeout has occurred|exceeded/i.test(e.message)) {
    return MSG_SYNC_REDE;
  }
  return opts.fallback;
}

const MAX_DIAS_SYNC_PLUGGY = 90;

function parseIsoDate(s: string): Date | null {
  const t = (s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return null;
  }
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Tipagem mínima do widget global carregado via CDN. */
type PluggyConnectCtor = new (options: Record<string, unknown>) => { init: () => Promise<void> | void };

/** O widget costuma chamar `onSuccess({ item })` — o id vem em `item.id`, não no objeto raiz. */
function extrairItemPluggyOnSuccess(payload: unknown): {
  itemId: string;
  connectorId?: string;
  connectorName?: string;
  status?: string;
} | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const root = payload as Record<string, unknown>;
  let item: Record<string, unknown>;
  if (root['item'] && typeof root['item'] === 'object') {
    item = root['item'] as Record<string, unknown>;
  } else if (root['id'] != null || root['itemId'] != null || root['uuid'] != null) {
    item = root;
  } else {
    return null;
  }
  const idVal = item['id'] ?? item['itemId'] ?? item['uuid'];
  if (idVal === undefined || idVal === null) {
    return null;
  }
  const itemId = String(idVal).trim();
  if (!itemId) {
    return null;
  }
  let connectorId: string | undefined;
  let connectorName: string | undefined;
  const conn = item['connector'];
  if (conn && typeof conn === 'object') {
    const c = conn as Record<string, unknown>;
    if (c['id'] != null) {
      connectorId = String(c['id']);
    }
    if (c['name'] != null) {
      connectorName = String(c['name']);
    }
  }
  const st = item['status'];
  const status = st != null ? String(st) : undefined;
  return { itemId, connectorId, connectorName, status };
}

@Component({
  selector: 'app-pluggy-open-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './pluggy-open-finance.component.html',
  styleUrls: ['./pluggy-open-finance.component.scss'],
})
export class PluggyOpenFinanceComponent implements OnInit, OnDestroy {
  readonly isDev = !environment.production;
  /** Dev local ou flag vinda do backend (PLUGGY_INCLUDE_SANDBOX no Render). */
  pluggyIncludeSandboxWidget = environment.pluggyIncludeSandbox;

  carregandoStatus = true;
  carregandoConexoes = true;
  abrindoWidget = false;
  pluggyConfigurado = false;
  /** Backend com PLUGGY_SANDBOX=true ou credenciais Development no dashboard Pluggy. */
  pluggySandboxBackend = false;
  conexoes: PluggyConexao[] = [];

  /** Sincronização: últimos 90 dias no backend se datas vazias. */
  syncDataInicio = '';
  syncDataFim = '';
  contasParaSync: ContaBancariaCadastro[] = [];
  contaSyncId = '';
  syncingConexaoId: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private pluggy: PluggyService,
    private companySelector: CompanySelectorService,
    private contaBancariaCadastroService: ContaBancariaCadastroService
  ) {}

  ngOnInit(): void {
    this.pluggy
      .status()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.carregandoStatus = false))
      )
      .subscribe({
        next: (s) => {
          this.pluggyConfigurado = !!s?.configured;
          this.pluggySandboxBackend = !!s?.sandboxMode;
          this.pluggyIncludeSandboxWidget =
            this.isDev || environment.pluggyIncludeSandbox || !!s?.includeSandbox;
        },
        error: () => {
          this.pluggyConfigurado = false;
          this.pluggySandboxBackend = false;
          this.pluggyIncludeSandboxWidget = this.isDev || environment.pluggyIncludeSandbox;
        },
      });
    this.recarregarConexoes();
    this.companySelector.empresaSelecionada$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.carregarContasParaSync();
    });
    this.carregarContasParaSync();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  labelConta(c: ContaBancariaCadastro): string {
    const nome = (c.nomeConta && c.nomeConta.trim()) || c.banco || 'Conta';
    const ag = [c.agencia, c.conta].filter((x) => !!x && String(x).trim()).join(' / ');
    return ag ? `${nome} (${ag})` : nome;
  }

  private contaIdSyncSelecionado(): number | null {
    const s = (this.contaSyncId || '').trim();
    if (!s) {
      return null;
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private carregarContasParaSync(): void {
    const idEmp = this.companySelector.obterIdEmpresaSelecionada();
    if (!idEmp) {
      this.contasParaSync = [];
      this.contaSyncId = '';
      return;
    }
    this.contaBancariaCadastroService
      .listar({ idEmpresa: idEmp, page: 0, size: 500, ativo: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.contasParaSync = page.content || [];
          if (
            this.contaSyncId &&
            !this.contasParaSync.some((c) => String(c.id) === this.contaSyncId)
          ) {
            this.contaSyncId = '';
          }
        },
        error: () => {
          this.contasParaSync = [];
        },
      });
  }

  recarregarConexoes(): void {
    this.carregandoConexoes = true;
    this.pluggy
      .listarConexoes()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.carregandoConexoes = false))
      )
      .subscribe({
        next: (c) => (this.conexoes = c || []),
        error: () => (this.conexoes = []),
      });
  }

  /**
   * Normaliza datas e valida período (máx. 90 dias, igual ao backend).
   * Retorna mensagem de erro ou null se ok.
   */
  validarPeriodoSync(): string | null {
    let ini = (this.syncDataInicio || '').trim();
    let fim = (this.syncDataFim || '').trim();
    if (!ini && !fim) {
      return null;
    }
    if (ini && !fim) {
      fim = toIsoDateLocal(new Date());
      this.syncDataFim = fim;
    }
    if (!ini && fim) {
      const df = parseIsoDate(fim);
      if (!df) {
        return 'Data fim inválida.';
      }
      const dIni = new Date(df);
      dIni.setDate(dIni.getDate() - MAX_DIAS_SYNC_PLUGGY + 1);
      ini = toIsoDateLocal(dIni);
      this.syncDataInicio = ini;
    }
    const dIni = parseIsoDate(ini);
    const dFim = parseIsoDate(fim);
    if (!dIni || !dFim) {
      return 'Use o seletor de data (formato AAAA-MM-DD).';
    }
    if (dIni.getTime() > dFim.getTime()) {
      return 'Data início não pode ser depois da data fim.';
    }
    const dias = Math.floor((dFim.getTime() - dIni.getTime()) / 86400000) + 1;
    if (dias > MAX_DIAS_SYNC_PLUGGY) {
      return `Período máximo de ${MAX_DIAS_SYNC_PLUGGY} dias (você selecionou ${dias}). Reduza o intervalo ou sincronize em partes.`;
    }
    return null;
  }

  montarPayloadSync(): PluggySyncPayload | undefined {
    const p: PluggySyncPayload = {};
    if (this.syncDataInicio?.trim()) {
      p.dataInicio = this.syncDataInicio.trim();
    }
    if (this.syncDataFim?.trim()) {
      p.dataFim = this.syncDataFim.trim();
    }
    const idConta = this.contaIdSyncSelecionado();
    if (idConta != null) {
      p.idContaBancaria = idConta;
      const sel = this.contasParaSync.find((c) => c.id === idConta);
      if (sel) {
        p.nomeContaExibicao = this.labelConta(sel);
      }
    }
    return Object.keys(p).length > 0 ? p : undefined;
  }

  sincronizarConexao(c: PluggyConexao): void {
    if (!this.companySelector.obterIdEmpresaSelecionada()) {
      void Swal.fire({
        icon: 'info',
        title: 'Selecione a empresa',
        text: 'Escolha a empresa no seletor do sistema antes de importar as movimentações Pluggy.',
      });
      return;
    }
    const erroPeriodo = this.validarPeriodoSync();
    if (erroPeriodo) {
      void Swal.fire({ icon: 'warning', title: 'Período inválido', text: erroPeriodo });
      return;
    }
    this.syncingConexaoId = c.id;
    const payload = this.montarPayloadSync();
    this.pluggy
      .sincronizarConexao(c.id, payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.syncingConexaoId = null))
      )
      .subscribe({
        next: (r) => {
          if (r?.erro) {
            void Swal.fire({ icon: 'error', title: 'Sincronização', text: r.mensagem || 'Falha desconhecida.' });
            return;
          }
          const imp = r.importadas ?? 0;
          const dup = r.ignoradasDuplicadas ?? 0;
          void Swal.fire({
            icon: 'success',
            title: 'Sincronização Pluggy',
            html: `Novas: <strong>${imp}</strong> · Já existentes: <strong>${dup}</strong>${
              r.importacaoId != null
                ? `<br/><small>Lote #${r.importacaoId} — aprove em <strong>Conciliação de extratos</strong> (filtro &quot;Open Finance (Pluggy)&quot;).</small>`
                : ''
            }`,
          });
        },
        error: (err) => {
          const msg = mensagemErroHttp(err, {
            fallback: 'Não foi possível sincronizar.',
            status403: 'Sem permissão (MOVIMENTACOES ou empresa).',
          });
          void Swal.fire({ icon: 'error', title: 'Sincronização', text: msg });
        },
      });
  }

  async abrirPluggyConnect(): Promise<void> {
    if (!this.pluggyConfigurado) {
      await Swal.fire({
        icon: 'info',
        title: 'Pluggy não configurado',
        text: 'Defina PLUGGY_ENABLED, PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no backend (Render ou IntelliJ) e faça deploy / reinicie a API.',
      });
      return;
    }
    const Ctor = (window as unknown as { PluggyConnect?: PluggyConnectCtor }).PluggyConnect;
    if (!Ctor) {
      await Swal.fire({
        icon: 'error',
        title: 'Widget Pluggy não carregou',
        text: 'Verifique se o script pluggy-connect.js está em index.html e se não há bloqueio de rede/adblock.',
      });
      return;
    }

    this.abrindoWidget = true;
    this.pluggy.criarConnectToken().subscribe({
      next: async (res) => {
        try {
          const opts: Record<string, unknown> = {
            connectToken: res.accessToken,
            onSuccess: (payload: unknown) => {
              const parsed = extrairItemPluggyOnSuccess(payload);
              if (!parsed) {
                void Swal.fire({
                  icon: 'warning',
                  title: 'Resposta Pluggy sem id de item',
                  text: 'Abra o console (F12) e confira o objeto retornado em onSuccess.',
                });
                console.warn('Pluggy onSuccess: payload inesperado', payload);
                this.abrindoWidget = false;
                return;
              }
              this.pluggy
                .registrarItem({
                  itemId: parsed.itemId,
                  connectorId: parsed.connectorId,
                  connectorName: parsed.connectorName,
                  status: parsed.status,
                })
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                  next: () => {
                    void Swal.fire({ icon: 'success', title: 'Conta vinculada', timer: 2200, showConfirmButton: false });
                    this.recarregarConexoes();
                  },
                  error: () => {
                    void Swal.fire({ icon: 'error', title: 'Não foi possível salvar o item no finzzia' });
                  },
                  complete: () => (this.abrindoWidget = false),
                });
            },
            onError: (err: unknown) => {
              console.error(err);
              void Swal.fire({ icon: 'error', title: 'Erro no Pluggy Connect', text: 'Veja o console para detalhes.' });
              this.abrindoWidget = false;
            },
          };
          if (this.pluggyIncludeSandboxWidget) {
            opts['includeSandbox'] = true;
          }
          const widget = new Ctor(opts);
          await Promise.resolve(widget.init());
        } catch (e) {
          console.error(e);
          void Swal.fire({ icon: 'error', title: 'Falha ao abrir o widget' });
          this.abrindoWidget = false;
        }
      },
      error: (err) => {
        console.error(err);
        if (err?.status === 503) {
          void Swal.fire({
            icon: 'info',
            title: 'Integração desligada',
            text: 'O backend indica que Pluggy não está habilitado ou faltam credenciais.',
          });
        } else {
          void Swal.fire({ icon: 'error', title: 'Não foi possível obter o connect token' });
        }
        this.abrindoWidget = false;
      },
    });
  }
}
