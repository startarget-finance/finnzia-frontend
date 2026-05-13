import { Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, map, filter, observeOn, asyncScheduler, debounceTime, distinctUntilChanged } from 'rxjs';
import { ErpFinanceiroService, MovimentacaoFinanceira, FiltrosMovimentacoes, CriarMovimentacaoPayload } from '../../services/erp-financeiro.service';
import { ContaBancariaCadastroService } from '../../services/conta-bancaria-cadastro.service';
import { ClienteCadastroService } from '../../services/cliente-cadastro.service';
import { FornecedorCadastroService } from '../../services/fornecedor-cadastro.service';
import { FuncionarioCadastroService, FuncionarioCadastro } from '../../services/funcionario-cadastro.service';
import { OmieService, MovimentacaoOmie, MovimentacoesOmieResponse, FiltrosMovimentacoesOmie } from '../../services/omie.service';
import { CompanySelectorService } from '../../services/company-selector.service';
import { CategoriasFinanceirasService, TipoCategoriaFinanceira } from '../../services/categorias-financeiras.service';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import {
  MovimentacoesAnexosService,
  TipoAnexoMovimentacao,
  AnexoMovimentacaoMetadado,
} from '../../services/movimentacoes-anexos.service';
import { FeedbackStateComponent } from '../../shared/components/feedback-state/feedback-state.component';

type ExportGroupId =
  | 'identificacao'
  | 'datas'
  | 'valores'
  | 'status'
  | 'classificacao'
  | 'parceiro'
  | 'conta'
  | 'parcelamento'
  | 'anexos'
  | 'origem'
  | 'auditoria';

type ExportFormat = 'csv' | 'xlsx';

interface CadastroAnexoPendente {
  tipo: TipoAnexoMovimentacao;
  file: File;
}

/** Linha da grade Produtos / Serviços (nova venda — contas a receber). */
interface CadastroLinhaVendaProduto {
  id: string;
  tipoItem: 'produto' | 'servico';
  codigo: string;
  nome: string;
  tabela: string;
  descricao: string;
  quantidade: number;
  unitario: string;
  desconto: string;
}

interface CadastroRateioLinhaOutras {
  categoriaOpcao: string;
  categoriaManual: string;
  percentual: string;
}

interface CadastroContatoReceita {
  id: string;
  nome: string;
  email: string;
  telefone: string;
}

type ReceitaCadastroFluxo = 'venda' | 'outras' | 'contrato' | 'aporte';

interface ExportColumnDef {
  id: string;
  label: string;
  groupId: ExportGroupId;
  getter: (mov: MovimentacaoFinanceira, idx: number) => string | number | boolean;
}

@Component({
  selector: 'app-movimentacoes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, FeedbackStateComponent],
  templateUrl: './movimentacoes.component.html',
})
export class MovimentacoesComponent implements OnInit, OnDestroy {
  @ViewChild('menuCriarReceita', { read: ElementRef }) menuCriarReceitaRef?: ElementRef<HTMLElement>;
  @ViewChild('menuCriarDespesa', { read: ElementRef }) menuCriarDespesaRef?: ElementRef<HTMLElement>;

  mostrarModalExportacao = false;
  abaExportacaoAtiva: ExportGroupId = 'identificacao';
  exportFormat: ExportFormat = 'xlsx';
  exportando = false;
  private readonly exportStorageKey = 'movimentacoes_export_cols_v1';

  mostrarModalCadastro = false;
  /** Reutiliza o mesmo formulário do cadastro para edição de lançamento existente. */
  cadastroModo: 'novo' | 'editar' = 'novo';
  editandoMovimentacaoId: string | null = null;
  salvandoCadastro = false;
  cadastroSnapshot = '';
  /** metadata_json carregado na edição (preservado no PUT se o JSON não for remontado). */
  metadataJsonSnapshotEdicao: string | null = null;
  /** Metadados da fila de anexos (evita serializar `File` no snapshot de alterações). */
  cadastroAnexosPendentes: CadastroAnexoPendente[] = [];
  cadastroAnexoTipoSelecionado: TipoAnexoMovimentacao = 'comprovante';
  cadastroErrors: Record<string, string> = {};
  /** Aba ativa no cadastro estilo Bom Controle (nova despesa). */
  cadastroAbaBc: 'dados' | 'repetir' | 'anexos' = 'dados';
  /** Abas estilo “Nova venda” (nova receita). */
  cadastroAbaVenda: 'vendedor' | 'produtos' | 'contrato' | 'pagamento' | 'observacao' | 'anexos' = 'vendedor';
  /** Opções 1x … 36x para condição de parcelamento na nova venda. */
  readonly vendaOpcoesNumeroParcelas = Array.from({ length: 36 }, (_, i) => i + 1);
  /** Subfluxo ao cadastrar receita (menu Criar). */
  receitaCadastroFluxo: ReceitaCadastroFluxo = 'venda';
  /** Abas “Outras receitas” / “Contrato”. */
  cadastroAbaOutras: 'dados' | 'informacoes' | 'repetir' | 'faturamento' | 'contato' | 'anexos' = 'dados';
  /** Abas “Aporte financeiro”. */
  cadastroAbaAporte: 'dados' | 'anexos' = 'dados';
  readonly contatosReceitaPorPagina = 5;
  mostrarMenuCriarReceita = false;
  mostrarMenuCriarDespesa = false;
  /** Cadastro BC: transferência entre contas (sem fornecedor). */
  cadastroBcTransferencia = false;
  readonly tipoMovimentoDespesaOpcoes: ReadonlyArray<{
    id: 'fornecedor' | 'funcionario' | 'impostos';
    label: string;
  }> = [
    { id: 'fornecedor', label: 'Fornecedor' },
    { id: 'funcionario', label: 'Funcionário' },
    { id: 'impostos', label: 'Impostos' },
  ];
  readonly formasPagamentoCadastro: string[] = [
    'Dinheiro',
    'PIX',
    'Transferência',
    'Boleto',
    'Cartão de crédito',
    'Cartão de débito',
    'Cheque',
    'Outros',
  ];
  /** Forma da transferência (aba BC “Transferência”). */
  readonly formasTransferenciaCadastro: string[] = [
    'TED',
    'DOC',
    'PIX',
    'Transferência entre contas',
    'Cheque',
    'Outros',
  ];
  novoLancamento: {
    tipo: 'receita' | 'despesa';
    descricao: string;
    clienteFornecedorOpcao: string;
    clienteFornecedorManual: string;
    valor: string;
    dataVencimento: string;
    dataCompetencia: string;
    marcarComoQuitado: boolean;
    dataQuitacao: string;
    categoria: string;
    conta: string;
    observacao: string;
    categoriaOpcao: string;
    categoriaManual: string;
    contaOpcao: string;
    contaManual: string;
    /** Conta destino (somente fluxo transferência BC). */
    bcTransferDestinoContaOpcao: string;
    bcTransferDestinoContaManual: string;
    /** nenhuma | semanal | quinzenal | mensal | bimestral | trimestral | semestral | anual */
    recorrenciaFrequencia: string;
    recorrenciaQuantidade: number;
    tipoMovimentoDespesa: 'fornecedor' | 'funcionario' | 'impostos';
    formaPagamento: string;
    tipoValor: 'definitivo' | 'estimado';
    etiqueta: string;
    numeroDocumento: string;
    desconto: string;
    acrescimo: string;
    /** Aba Repetir (BC): espelha recorrência ativa. */
    contaSeRepete: boolean;
    /** BC: com prazo = informa quantidade de parcelas; sem prazo = série longa (até 120). */
    prazoParaAcabar: boolean;
    /** BC anexos: replicar metadados em todas as parcelas da série. */
    anexosEmTodasParcelas: boolean;
    /** BC anexos: quando não for em todas, qual parcela (1-based) recebe os arquivos. */
    anexoParcelaNumero: number;
    /** Nova venda (receita): empresa do contexto da venda (id como string). */
    vendaEmpresaOpcao: string;
    vendaVendedorNome: string;
    vendaDataVenda: string;
    vendaPrevisaoEntrega: string;
    vendaEnderecoCliente: string;
    vendaLinhasProduto: CadastroLinhaVendaProduto[];
    vendaContratoRef: string;
    vendaEmitirBoleto: boolean;
    vendaContaBoletoOpcao: string;
    vendaGerarPix: boolean;
    vendaContaPixOpcao: string;
    vendaTipoPagamento: 'a_vista' | 'parcelado';
    vendaCondicaoParcelas: number;
    vendaPeriodo: string;
    vendaObservacaoParcelas: string;
    vendaDescontoGlobal: string;
    outrasDepartamento: string;
    outrasInfoComplementar: string;
    outrasRateioLinhas: CadastroRateioLinhaOutras[];
    outrasContatos: CadastroContatoReceita[];
    outrasContatoPagina: number;
    outrasContatoDraftNome: string;
    outrasContatoDraftEmail: string;
    outrasContatoDraftTelefone: string;
    outrasFaturamentoData: string;
    outrasFaturamentoEnviado: boolean;
  } = this.criarEstadoInicialCadastro('despesa');

  // UI: Date Range Picker
  mostrarRangePicker: boolean = false;
  visibleMonth: Date = new Date();
  calendarDays: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];
  private tempRangeStart: string | null = null;
  private tempRangeEnd: string | null = null;
  private hoverRangeDate: string | null = null;
  
  // Datas selecionadas
  dataInicial: string = '';
  dataFinal: string = '';

  // Dados
  movimentacoes: MovimentacaoFinanceira[] = [];
  movimentacoesFiltradas: MovimentacaoFinanceira[] = [];
  /** Lista completa filtrada quando disponível (ex.: cache Omie) — usada para ordenar sobre todos os itens */
  movimentacoesFiltradasCompleta: MovimentacaoFinanceira[] = [];
  loading: boolean = false;
  error: string | null = null;
  
  // Cache estratégico (Anti-Block) - carrega uma vez e persiste
  private cacheMovimentacoes: Map<string, { data: MovimentacaoFinanceira[], timestamp: number, totais: any }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private cacheKeyAtual: string = '';
  
  // Totais agregados (de todas as movimentações, não apenas da página atual)
  totalReceitasGeral: number = 0;
  totalDespesasGeral: number = 0;
  saldoLiquidoGeral: number = 0;

  // Paginação
  paginaAtual: number = 1;
  itensPorPagina: number = 50;
  totalItens: number = 0;
  totalPaginas: number = 0;

  // Filtros
  filtros: FiltrosMovimentacoes = {
    tipoData: 'DataVencimento',
    itensPorPagina: 50,
    numeroDaPagina: 1
  };

  // Filtros de UI (categoria, tipo, status, etc.)
  filtrosUI = {
    categoria: '',
    conta: '',
    tipo: '' as 'receita' | 'despesa' | '',
    status: '' as 'pendente' | 'quitado' | '',
    textoPesquisa: ''
  };
  origemNavegacao: string | null = null;

  /** Painel de anexos por lançamento (metadados persistidos localmente até API de upload). */
  painelAnexoMovId: string | null = null;
  tipoAnexoAlvo: TipoAnexoMovimentacao = 'comprovante';
  anexoDragDepth = 0;
  anexoDragOver = false;

  readonly tiposAnexoLista: Array<{
    id: TipoAnexoMovimentacao;
    labelCurto: string;
    labelCompleto: string;
    /** Classe Flaticon UIcons (rounded), sem o prefixo `fi` — ex.: `fi-rr-file-invoice`. */
    iconSlug: string;
    btnFilled: string;
    btnEmpty: string;
    pillSelected: string;
    pillIdle: string;
  }> = [
    {
      id: 'fatura',
      labelCurto: 'Fat.',
      labelCompleto: 'Fatura',
      iconSlug: 'fi-rr-file-invoice',
      btnFilled:
        'border-violet-400 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-300/50',
      btnEmpty:
        'border-slate-300/90 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700',
      pillSelected:
        'border-violet-400 bg-violet-50 text-violet-900 ring-2 ring-violet-300/40 shadow-sm',
      pillIdle:
        'border-slate-200/90 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/40 hover:text-violet-800',
    },
    {
      id: 'boleto',
      labelCurto: 'Bol.',
      labelCompleto: 'Boleto',
      iconSlug: 'fi-rr-barcode-read',
      btnFilled:
        'border-sky-500 bg-sky-50 text-sky-800 shadow-sm ring-2 ring-sky-300/50',
      btnEmpty:
        'border-slate-300/90 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-800',
      pillSelected:
        'border-sky-400 bg-sky-50 text-sky-900 ring-2 ring-sky-300/40 shadow-sm',
      pillIdle:
        'border-slate-200/90 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/40 hover:text-sky-900',
    },
    {
      id: 'nota_fiscal',
      labelCurto: 'NF',
      labelCompleto: 'Nota fiscal',
      iconSlug: 'fi-rr-document',
      btnFilled:
        'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm ring-2 ring-emerald-300/50',
      btnEmpty:
        'border-slate-300/90 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800',
      pillSelected:
        'border-emerald-400 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-300/40 shadow-sm',
      pillIdle:
        'border-slate-200/90 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/40 hover:text-emerald-900',
    },
    {
      id: 'comprovante',
      labelCurto: 'Comp.',
      labelCompleto: 'Comprovante',
      iconSlug: 'fi-rr-receipt',
      btnFilled:
        'border-amber-500 bg-amber-50 text-amber-900 shadow-sm ring-2 ring-amber-300/50',
      btnEmpty:
        'border-slate-300/90 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/60 hover:text-amber-900',
      pillSelected:
        'border-amber-400 bg-amber-50 text-amber-950 ring-2 ring-amber-300/40 shadow-sm',
      pillIdle:
        'border-slate-200/90 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50 hover:text-amber-950',
    },
    {
      id: 'outros',
      labelCurto: 'Out.',
      labelCompleto: 'Outros',
      iconSlug: 'fi-rr-folder',
      btnFilled:
        'border-slate-600 bg-slate-100 text-slate-900 shadow-sm ring-2 ring-slate-300/50',
      btnEmpty:
        'border-slate-300/90 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50/50 hover:text-slate-800',
      pillSelected:
        'border-slate-500 bg-slate-100 text-slate-900 ring-2 ring-slate-300/40 shadow-sm',
      pillIdle:
        'border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/40 hover:text-slate-800',
    },
  ];

  /**
   * Mensagem de erro de validação (ex.: intervalo de datas inválido).
   * Diferente de erros de API.
   */
  validationError: string | null = null;

  // Opções para filtros
  tipos = [
    { value: '', label: 'Todos os Tipos' },
    { value: 'receita', label: 'Receita' },
    { value: 'despesa', label: 'Despesa' }
  ];
  statusOpcoes = [
    { value: '', label: 'Todos os Status' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'quitado', label: 'Quitado' }
  ];

  // Ordenação da tabela
  sortBy: '' | 'tipo' | 'data' | 'valor' | 'status' = 'data';
  sortOrder: 'asc' | 'desc' = 'asc';

  // Modal de detalhes (por categoria/cliente)
  mostrarModalDetalhes = false;
  tipoModalDetalhes: 'receita' | 'despesa' = 'receita';

  // Categorias dinâmicas (serão carregadas das movimentações)
  categorias: Array<{ value: string, label: string }> = [
    { value: '', label: 'Todas as Categorias' }
  ];
  categoriasCadastro: Array<{ value: string; label: string; tipo: TipoCategoriaFinanceira }> = [];
  categoriasCadastroTipo: Array<{ value: string; label: string }> = [];
  clientesCadastro: Array<{ value: string; label: string }> = [];
  fornecedoresCadastro: Array<{ value: string; label: string }> = [];
  funcionariosCadastro: FuncionarioCadastro[] = [];
  parceirosCadastroTipo: Array<{ value: string; label: string }> = [];
  contasBancarias: Array<{ value: string, label: string }> = [
    { value: '', label: 'Todas as contas' }
  ];

  /** id cadastro (string) → nome amigável para o filtro e formulários */
  private rotuloContaPorId = new Map<string, string>();
  /** número da conta (cadastro) → mesmo rótulo (movimentações às vezes só trazem o número) */
  private rotuloContaPorNumeroConta = new Map<string, string>();

  // Fonte de dados fixa: ERP (backend próprio)
  readonly fonteDados: 'erp' = 'erp';
  readonly exportGroups: Array<{ id: ExportGroupId; label: string; icon: string }> = [
    { id: 'identificacao', label: 'Identificação', icon: 'fi-rr-id-badge' },
    { id: 'datas', label: 'Datas', icon: 'fi-rr-calendar' },
    { id: 'valores', label: 'Valores', icon: 'fi-rr-money' },
    { id: 'status', label: 'Status', icon: 'fi-rr-time-check' },
    { id: 'classificacao', label: 'Classificação', icon: 'fi-rr-tags' },
    { id: 'parceiro', label: 'Cliente/Forn.', icon: 'fi-rr-users' },
    { id: 'conta', label: 'Conta bancária', icon: 'fi-rr-bank' },
    { id: 'parcelamento', label: 'Parcelamento', icon: 'fi-rr-list-check' },
    { id: 'anexos', label: 'Anexos', icon: 'fi-rr-paperclip' },
    { id: 'origem', label: 'Origem', icon: 'fi-rr-database' },
    { id: 'auditoria', label: 'Auditoria', icon: 'fi-rr-clipboard-check' },
  ];
  readonly exportColumns: ExportColumnDef[] = [
    { id: 'seq', label: 'Nº linha', groupId: 'identificacao', getter: (_m, idx) => idx + 1 },
    { id: 'idMov', label: 'ID movimentação', groupId: 'identificacao', getter: (m) => this.idMovimentacao(m) },
    { id: 'descricao', label: 'Descrição', groupId: 'identificacao', getter: (m) => m.Nome || '' },
    { id: 'tipo', label: 'Tipo', groupId: 'identificacao', getter: (m) => (m.Debito ? 'Despesa' : 'Receita') },
    { id: 'dataVenc', label: 'Data vencimento', groupId: 'datas', getter: (m) => m.DataVencimento || '' },
    { id: 'dataComp', label: 'Data competência', groupId: 'datas', getter: (m) => m.DataCompetencia || '' },
    { id: 'dataQuit', label: 'Data quitação', groupId: 'datas', getter: (m) => m.DataQuitacao || '' },
    { id: 'valor', label: 'Valor', groupId: 'valores', getter: (m) => Number(m.Valor || 0) },
    { id: 'valorSinal', label: 'Valor c/ sinal', groupId: 'valores', getter: (m) => (m.Debito ? -Number(m.Valor || 0) : Number(m.Valor || 0)) },
    { id: 'status', label: 'Status pagamento', groupId: 'status', getter: (m) => ((m as any).DataQuitacao ? 'Quitado' : 'Pendente') },
    { id: 'categoria', label: 'Categoria', groupId: 'classificacao', getter: (m) => this.categoriaExibicao(m) },
    { id: 'nomeContaFin', label: 'Conta financeira', groupId: 'classificacao', getter: (m) => m.NomeContaFinanceira || '' },
    { id: 'clienteFornecedor', label: 'Cliente/Fornecedor', groupId: 'parceiro', getter: (m) => this.nomeParceiroExibicao(m) },
    { id: 'codigoParceiro', label: 'Código cliente/forn.', groupId: 'parceiro', getter: (m) => (m.CodigoClienteFornecedor as string | number | undefined) ?? '' },
    { id: 'contaBancaria', label: 'Conta bancária (exibição)', groupId: 'conta', getter: (m) => this.rotuloContaBancariaDisplay(String((m as any).IdContaFinanceira ?? ''), String((m as any).NomeContaFinanceira ?? '')) },
    { id: 'idConta', label: 'ID conta financeira', groupId: 'conta', getter: (m) => (m as any).IdContaFinanceira ?? '' },
    { id: 'numParcela', label: 'Nº parcela', groupId: 'parcelamento', getter: (m) => m.NumeroParcela ?? '' },
    { id: 'qtdParcela', label: 'Qtd parcelas', groupId: 'parcelamento', getter: (m) => m.QuantidadeParcela ?? '' },
    { id: 'anexoComprovante', label: 'Tem comprovante', groupId: 'anexos', getter: (m) => this.temAnexo(m, 'comprovante') ? 'Sim' : 'Não' },
    { id: 'anexoNF', label: 'Tem nota fiscal', groupId: 'anexos', getter: (m) => this.temAnexo(m, 'nota_fiscal') ? 'Sim' : 'Não' },
    { id: 'anexoBoleto', label: 'Tem boleto', groupId: 'anexos', getter: (m) => this.temAnexo(m, 'boleto') ? 'Sim' : 'Não' },
    { id: 'anexoFatura', label: 'Tem fatura', groupId: 'anexos', getter: (m) => this.temAnexo(m, 'fatura') ? 'Sim' : 'Não' },
    { id: 'anexoOutros', label: 'Tem anexo (outros)', groupId: 'anexos', getter: (m) => this.temAnexo(m, 'outros') ? 'Sim' : 'Não' },
    { id: 'formaPagto', label: 'Forma pagamento', groupId: 'origem', getter: (m) => m.NomeFormaPagamento || '' },
    { id: 'tipoMov', label: 'Tipo movimentação', groupId: 'origem', getter: (m) => m.NomeTipoMovimentacao || '' },
    { id: 'departamento', label: 'Departamento', groupId: 'classificacao', getter: (m) => (m as any).Departamento || '' },
    { id: 'empresa', label: 'Empresa', groupId: 'origem', getter: (m) => m.NomeEmpresa || '' },
    { id: 'origemDados', label: 'Fonte dados', groupId: 'origem', getter: () => this.fonteDados },
    { id: 'observacao', label: 'Observação', groupId: 'auditoria', getter: (m) => m.Observacao || '' },
    { id: 'cpfCnpjCliente', label: 'CPF/CNPJ parceiro', groupId: 'auditoria', getter: (m) => (m as any).CPFCNPJCliente || '' },
  ];
  exportSelectedCols = new Set<string>();

  private destroy$ = new Subject<void>();
  private textoPesquisaSubject = new Subject<string>();
  /** Evita vários timeouts de deep link quando o Router emite queryParamMap mais de uma vez. */
  private deepLinkCadastroTimer: ReturnType<typeof setTimeout> | null = null;
  /** Evita abrir o modal duas vezes na mesma rajada (antes de limpar a URL). */
  private processandoDeepLinkCadastro = false;

  /** Fecha menus “Criar receita/despesa” ao clicar fora (capture: mousedown). @HostListener não aceita `{ capture: true }` neste toolchain. */
  private readonly fecharMenusDropMousedownCapture = (ev: Event): void => {
    const mev = ev as MouseEvent;
    if (mev.button !== 0) {
      return;
    }
    const t = mev.target as Node | null;
    if (!t) {
      return;
    }
    const path =
      typeof mev.composedPath === 'function' ? (mev.composedPath() as EventTarget[]) : [];
    const dentro = (host: HTMLElement | undefined) => {
      if (!host) {
        return false;
      }
      if (path.length) {
        return path.includes(host);
      }
      return host.contains(t);
    };

    if (this.mostrarMenuCriarReceita && !dentro(this.menuCriarReceitaRef?.nativeElement)) {
      this.mostrarMenuCriarReceita = false;
    }
    if (this.mostrarMenuCriarDespesa && !dentro(this.menuCriarDespesaRef?.nativeElement)) {
      this.mostrarMenuCriarDespesa = false;
    }
  };

  constructor(
    private erpFinanceiroService: ErpFinanceiroService,
    private omieService: OmieService,
    private companySelectorService: CompanySelectorService,
    private movimentacoesAnexosService: MovimentacoesAnexosService,
    private contaBancariaCadastroService: ContaBancariaCadastroService,
    private clienteCadastroService: ClienteCadastroService,
    private fornecedorCadastroService: FornecedorCadastroService,
    private funcionarioCadastroService: FuncionarioCadastroService,
    private categoriasFinanceirasService: CategoriasFinanceirasService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    this.visibleMonth = new Date();
    this.buildCalendar();
    
            // Debounce para pesquisa de texto - recarrega dados quando texto mudar
            this.textoPesquisaSubject.pipe(
              debounceTime(500),
              distinctUntilChanged(),
              takeUntil(this.destroy$)
            ).subscribe((texto: string) => {
              this.filtrosUI.textoPesquisa = texto;
              this.paginaAtual = 1; // Volta para primeira página ao pesquisar
              this.carregarMovimentacoes();
            });
  }

  ngOnInit(): void {
    this.document.addEventListener('mousedown', this.fecharMenusDropMousedownCapture, true);
    this.inscreverDeepLinkCadastroPorQueryParams();

    const possuiFiltrosNavegacao = this.aplicarFiltrosDeNavegacao();
    if (!possuiFiltrosNavegacao) {
      // Pré-preencher com mês atual automaticamente
      this.preencherMesAtual();
    }
    
    // Verificar se usuário possui alguma empresa configurada
    const empresaSelecionada = this.companySelectorService.obterEmpresaSelecionada();
    
    if (!empresaSelecionada) {
      // Incrementar contador e log com informação de empresas permitidas
      const empresasPermitidas = this.companySelectorService.obterEmpresasAtivas();
      
      // Se há empresas disponíveis, selecionar a primeira ou a padrão
      if (empresasPermitidas.length > 0) {
        this.companySelectorService.selecionarEmpresaPadrao();
        // Tentar carregar novamente após seleção
        setTimeout(() => {
          this.carregarMapaNomesContasCadastro();
          this.carregarCategoriasCadastroPorEmpresa();
          this.carregarParceirosCadastroPorEmpresa();
          this.carregarMovimentacoes();
          this.agendarDeepLinkCadastroDesdeUrl();
        }, 100);
        return;
      }
      
      this.error = 'Nenhuma empresa configurada para o usuário. Acesse "Gerenciar Acessos" para configurar.';
      this.loading = false;
      return;
    }
    
    // Carrega automaticamente com filtro de data do mês atual
    // A empresa é obtida via CompanySelectorService (X-Empresa-Id header)
    this.carregarMapaNomesContasCadastro();
    this.carregarCategoriasCadastroPorEmpresa();
    this.carregarParceirosCadastroPorEmpresa();
    this.carregarMovimentacoes();

    this.companySelectorService.empresaSelecionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.painelAnexoMovId = null;
        this.anexoDragOver = false;
        this.anexoDragDepth = 0;
        this.carregarMapaNomesContasCadastro();
        this.carregarCategoriasCadastroPorEmpresa();
        this.carregarParceirosCadastroPorEmpresa();
      });
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('mousedown', this.fecharMenusDropMousedownCapture, true);
    if (this.deepLinkCadastroTimer != null) {
      clearTimeout(this.deepLinkCadastroTimer);
      this.deepLinkCadastroTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Preenche automaticamente com as datas do mês atual
   * Formato: YYYY-MM-DD
   */
  private preencherMesAtual(): void {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    
    // Primeiro dia do mês
    this.dataInicial = `${ano}-${mes}-01`;
    
    // Último dia do mês
    const ultimoDia = new Date(ano, parseInt(mes), 0).getDate();
    this.dataFinal = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
    
    // Atualizar calendário visual
    this.visibleMonth = new Date(ano, parseInt(mes) - 1);
    this.buildCalendar();
    
  }

  /**
   * Lê filtros vindos da URL (ex.: navegação da fatura para movimentações).
   */
  private aplicarFiltrosDeNavegacao(): boolean {
    const qp = this.route.snapshot.queryParamMap;
    const origem = qp.get('origem');
    const dataInicial = qp.get('dataInicial');
    const dataFinal = qp.get('dataFinal');
    const tipo = qp.get('tipo');
    const status = qp.get('status');
    const categoria = qp.get('categoria');
    const conta = qp.get('conta');
    const textoPesquisa = qp.get('textoPesquisa');

    const temFiltro =
      !!dataInicial ||
      !!dataFinal ||
      !!tipo ||
      !!status ||
      !!categoria ||
      !!conta ||
      !!textoPesquisa;

    if (!temFiltro) {
      this.origemNavegacao = origem;
      return false;
    }

    this.origemNavegacao = origem;

    if (dataInicial) this.dataInicial = dataInicial;
    if (dataFinal) this.dataFinal = dataFinal;

    if (tipo === 'receita' || tipo === 'despesa') {
      this.filtrosUI.tipo = tipo;
    }
    if (status === 'pendente' || status === 'quitado') {
      this.filtrosUI.status = status;
    }
    if (categoria) {
      this.filtrosUI.categoria = categoria;
    }
    if (conta) {
      this.filtrosUI.conta = conta;
    }
    if (textoPesquisa) {
      this.filtrosUI.textoPesquisa = textoPesquisa;
    }


    return true;
  }

  /**
   * Abre cadastro a partir de ?novo= / ?fluxo= / ?movimento= sem disparar várias vezes (Router costuma emitir queryParamMap em rajada).
   */
  private inscreverDeepLinkCadastroPorQueryParams(): void {
    this.route.queryParamMap
      .pipe(
        map((qm) => ({
          novo: (qm.get('novo') ?? '').trim(),
          fluxo: (qm.get('fluxo') ?? '').toLowerCase().trim(),
          movimento: (qm.get('movimento') ?? '').toLowerCase().trim(),
        })),
        filter((k) => k.novo === 'receita' || k.novo === 'despesa'),
        observeOn(asyncScheduler),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (this.processandoDeepLinkCadastro) {
          return;
        }
        if (!this.companySelectorService.obterEmpresaSelecionada()) {
          return;
        }
        const qm = this.route.snapshot.queryParamMap;
        const novo = (qm.get('novo') ?? '').trim();
        if (novo !== 'receita' && novo !== 'despesa') {
          return;
        }
        this.processandoDeepLinkCadastro = true;
        try {
          this.abrirCadastroDesdeQueryParamMap(qm);
          void this.limparDeepLinkCadastroNaUrl().finally(() => {
            this.processandoDeepLinkCadastro = false;
          });
        } catch {
          this.processandoDeepLinkCadastro = false;
        }
      });
  }

  /** Fluxo “selecionou empresa padrão” — abre deep link uma vez após carregar listas. */
  private agendarDeepLinkCadastroDesdeUrl(): void {
    if (this.deepLinkCadastroTimer != null) {
      clearTimeout(this.deepLinkCadastroTimer);
    }
    this.deepLinkCadastroTimer = setTimeout(() => {
      this.deepLinkCadastroTimer = null;
      const qm = this.route.snapshot.queryParamMap;
      const novo = (qm.get('novo') ?? '').trim();
      if (novo !== 'receita' && novo !== 'despesa') {
        return;
      }
      if (!this.companySelectorService.obterEmpresaSelecionada()) {
        return;
      }
      if (this.processandoDeepLinkCadastro) {
        return;
      }
      this.processandoDeepLinkCadastro = true;
      try {
        this.abrirCadastroDesdeQueryParamMap(qm);
        void this.limparDeepLinkCadastroNaUrl().finally(() => {
          this.processandoDeepLinkCadastro = false;
        });
      } catch {
        this.processandoDeepLinkCadastro = false;
      }
    }, 0);
  }

  private limparDeepLinkCadastroNaUrl(): Promise<boolean> {
    const qm = this.route.snapshot.queryParamMap;
    if (!qm.get('novo') && !qm.get('fluxo') && !qm.get('movimento')) {
      return Promise.resolve(true);
    }
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { novo: null, fluxo: null, movimento: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private abrirCadastroDesdeQueryParamMap(qm: ParamMap): void {
    const novo = (qm.get('novo') ?? '').trim();
    const fluxoRaw = (qm.get('fluxo') || '').toLowerCase().trim();
    const movimentoRaw = (qm.get('movimento') || '').toLowerCase().trim();
    const fluxoMap: Record<string, ReceitaCadastroFluxo> = {
      venda: 'venda',
      outras: 'outras',
      contrato: 'contrato',
      aporte: 'aporte',
    };
    const despesaMovimentoMap: Record<string, 'fornecedor' | 'funcionario' | 'impostos' | 'transferencia'> = {
      fornecedor: 'fornecedor',
      funcionario: 'funcionario',
      impostos: 'impostos',
      transferencia: 'transferencia',
    };
    if (novo === 'receita') {
      const fluxo = fluxoMap[fluxoRaw];
      this.abrirModalCadastro('receita', fluxo);
    } else if (novo === 'despesa') {
      const mov = despesaMovimentoMap[movimentoRaw];
      this.abrirModalCadastro('despesa', undefined, mov);
    }
  }

  private criarLinhaVendaProdutoPadrao(): CadastroLinhaVendaProduto {
    return {
      id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tipoItem: 'produto',
      codigo: '',
      nome: '',
      tabela: '',
      descricao: '',
      quantidade: 1,
      unitario: '0,00',
      desconto: '0,00',
    };
  }

  private criarEstadoInicialCadastro(tipo: 'receita' | 'despesa') {
    const hoje = this.dateToStr(new Date());
    return {
      tipo,
      descricao: '',
      clienteFornecedorOpcao: '',
      clienteFornecedorManual: '',
      valor: '',
      dataVencimento: hoje,
      dataCompetencia: this.competenciaMesAnoDeData(hoje),
      marcarComoQuitado: false,
      dataQuitacao: '',
      categoria: '',
      conta: '',
      observacao: '',
      categoriaOpcao: '',
      categoriaManual: '',
      contaOpcao: '',
      contaManual: '',
      bcTransferDestinoContaOpcao: '',
      bcTransferDestinoContaManual: '',
      recorrenciaFrequencia: 'nenhuma',
      recorrenciaQuantidade: 1,
      tipoMovimentoDespesa: 'fornecedor' as const,
      formaPagamento: tipo === 'receita' ? '' : 'Dinheiro',
      tipoValor: 'definitivo' as const,
      etiqueta: '',
      numeroDocumento: '',
      desconto: '0,00',
      acrescimo: '0,00',
      contaSeRepete: false,
      prazoParaAcabar: true,
      anexosEmTodasParcelas: false,
      anexoParcelaNumero: 1,
      vendaEmpresaOpcao: '',
      vendaVendedorNome: '',
      vendaDataVenda: hoje,
      vendaPrevisaoEntrega: '',
      vendaEnderecoCliente: '',
      vendaLinhasProduto: [this.criarLinhaVendaProdutoPadrao()],
      vendaContratoRef: '',
      vendaEmitirBoleto: false,
      vendaContaBoletoOpcao: '',
      vendaGerarPix: false,
      vendaContaPixOpcao: '',
      vendaTipoPagamento: 'parcelado' as const,
      vendaCondicaoParcelas: 1,
      vendaPeriodo: 'mensal',
      vendaObservacaoParcelas: '',
      vendaDescontoGlobal: '0,00',
      outrasDepartamento: '',
      outrasInfoComplementar: '',
      outrasRateioLinhas: [] as CadastroRateioLinhaOutras[],
      outrasContatos: [] as CadastroContatoReceita[],
      outrasContatoPagina: 1,
      outrasContatoDraftNome: '',
      outrasContatoDraftEmail: '',
      outrasContatoDraftTelefone: '',
      outrasFaturamentoData: '',
      outrasFaturamentoEnviado: false,
    };
  }

  abrirModalCadastro(
    tipo: 'receita' | 'despesa',
    receitaFluxo?: ReceitaCadastroFluxo,
    despesaInicio?: 'fornecedor' | 'funcionario' | 'impostos' | 'transferencia'
  ): void {
    this.cadastroModo = 'novo';
    this.editandoMovimentacaoId = null;
    this.cadastroAbaBc = 'dados';
    this.cadastroAbaVenda = 'vendedor';
    this.cadastroAbaOutras = 'dados';
    this.cadastroAbaAporte = 'dados';
    this.mostrarMenuCriarReceita = false;
    this.mostrarMenuCriarDespesa = false;
    this.cadastroBcTransferencia = false;
    this.metadataJsonSnapshotEdicao = null;
    this.receitaCadastroFluxo = tipo === 'receita' ? receitaFluxo ?? 'venda' : 'venda';
    this.novoLancamento = this.criarEstadoInicialCadastro(tipo);
    if (tipo === 'despesa') {
      if (despesaInicio === 'transferencia') {
        this.cadastroBcTransferencia = true;
        this.novoLancamento.tipoMovimentoDespesa = 'fornecedor';
        this.novoLancamento.formaPagamento = '';
        this.novoLancamento.contaSeRepete = false;
        this.novoLancamento.recorrenciaFrequencia = 'nenhuma';
        this.novoLancamento.recorrenciaQuantidade = 1;
        this.atualizarOpcoesParceiroCadastro('despesa', 'fornecedor');
      } else if (despesaInicio === 'fornecedor' || despesaInicio === 'funcionario' || despesaInicio === 'impostos') {
        this.onTipoMovimentoDespesaBc(despesaInicio);
      }
    }
    if (tipo === 'receita') {
      const emps = this.companySelectorService.obterEmpresasAtivas();
      const idSel = this.companySelectorService.obterIdEmpresaSelecionada();
      if (emps.length === 1) {
        this.novoLancamento.vendaEmpresaOpcao = String(emps[0].idEmpresa);
      } else if (idSel != null) {
        this.novoLancamento.vendaEmpresaOpcao = String(idSel);
      }
      if (this.receitaCadastroFluxo === 'venda') {
        this.sincronizarRecorrenciaDaVendaReceita();
        this.sincronizarValorCampoComTotaisVenda();
      }
    }
    this.cadastroErrors = {};
    this.cadastroAnexosPendentes = [];
    this.mostrarModalCadastro = true;
    this.atualizarOpcoesCategoriaCadastro(tipo);
    this.atualizarOpcoesParceiroCadastro(
      tipo,
      tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
    );
    this.atualizarSnapshotCadastro();
  }

  abrirModalEdicao(mov: MovimentacaoFinanceira): void {
    const id = mov.IdMovimentacaoFinanceiraParcela;
    if (!id) {
      return;
    }
    this.receitaCadastroFluxo = 'venda';
    const metaEx = (mov as any).MetadataJson;
    this.cadastroBcTransferencia = false;
    this.metadataJsonSnapshotEdicao =
      metaEx != null && String(metaEx).trim() !== '' ? String(metaEx).trim() : null;
    this.cadastroModo = 'editar';
    this.editandoMovimentacaoId = id;
    this.cadastroErrors = {};
    this.cadastroAnexosPendentes = [];

    const tipo: 'receita' | 'despesa' = mov.Debito ? 'despesa' : 'receita';
    const hoje = this.dateToStr(new Date());
    const catNome = (mov.NomeCategoriaFinanceira || '').trim();
    this.atualizarOpcoesCategoriaCadastro(tipo);
    const catEscolha = this.resolverOpcaoOuManual(this.categoriasCadastroTipo, catNome);
    const contaNome = (mov.NomeContaFinanceira || '').trim();
    const contaEscolha = this.resolverOpcaoOuManual(this.contasBancarias, contaNome);

    const ntm = ((mov.NomeTipoMovimentacao || '') as string).toLowerCase();
    let tipoMovDesp: 'fornecedor' | 'funcionario' | 'impostos' = 'fornecedor';
    if (ntm.includes('funcion')) {
      tipoMovDesp = 'funcionario';
    } else if (ntm.includes('impost')) {
      tipoMovDesp = 'impostos';
    }

    this.atualizarOpcoesParceiroCadastro(tipo, tipoMovDesp);

    const idFuncMov = (mov as any).IdFuncionario as number | undefined;
    let parceiroEscolha: { opcao: string; manual: string };
    if (tipo === 'despesa' && idFuncMov != null && Number(idFuncMov) > 0) {
      parceiroEscolha = { opcao: `__func__:${Number(idFuncMov)}`, manual: '' };
    } else {
      const parceiroNome = (
        mov.NomeClienteFornecedor ||
        mov.NomeFantasiaClienteFornecedor ||
        mov.RazaoSocialClienteFornecedor ||
        ''
      ).toString().trim();
      parceiroEscolha = this.resolverOpcaoOuManual(this.parceirosCadastroTipo, parceiroNome);
    }

    const venc = this.normalizarDataParaInput(mov.DataVencimento);
    const comp = this.normalizarDataParaInput(mov.DataCompetencia) || venc;
    const quit = this.normalizarDataParaInput(mov.DataQuitacao);
    const temQuit = !!quit;

    const formaPg = (mov.NomeFormaPagamento || '').trim() || 'Dinheiro';

    this.novoLancamento = {
      tipo,
      descricao: (mov.Nome || '').trim(),
      clienteFornecedorOpcao: parceiroEscolha.opcao,
      clienteFornecedorManual: parceiroEscolha.manual,
      valor: this.valorNumericoParaInputBr(mov.Valor),
      dataVencimento: venc || hoje,
      dataCompetencia: this.competenciaMesAnoDeData(comp || venc || hoje),
      marcarComoQuitado: temQuit,
      dataQuitacao: temQuit ? quit : '',
      categoria: '',
      conta: '',
      observacao: (mov.Observacao || '').toString(),
      categoriaOpcao: catEscolha.opcao,
      categoriaManual: catEscolha.manual,
      contaOpcao: contaEscolha.opcao,
      contaManual: contaEscolha.manual,
      bcTransferDestinoContaOpcao: '',
      bcTransferDestinoContaManual: '',
      recorrenciaFrequencia: 'nenhuma',
      recorrenciaQuantidade: 1,
      tipoMovimentoDespesa: tipoMovDesp,
      formaPagamento: formaPg,
      tipoValor: 'definitivo',
      etiqueta: '',
      numeroDocumento: '',
      desconto: '0,00',
      acrescimo: '0,00',
      contaSeRepete: false,
      prazoParaAcabar: true,
      anexosEmTodasParcelas: false,
      anexoParcelaNumero: 1,
      vendaEmpresaOpcao: '',
      vendaVendedorNome: '',
      vendaDataVenda: venc || hoje,
      vendaPrevisaoEntrega: '',
      vendaEnderecoCliente: '',
      vendaLinhasProduto: [this.criarLinhaVendaProdutoPadrao()],
      vendaContratoRef: '',
      vendaEmitirBoleto: false,
      vendaContaBoletoOpcao: '',
      vendaGerarPix: false,
      vendaContaPixOpcao: '',
      vendaTipoPagamento: 'parcelado',
      vendaCondicaoParcelas: 1,
      vendaPeriodo: 'mensal',
      vendaObservacaoParcelas: '',
      vendaDescontoGlobal: '0,00',
      outrasDepartamento: (mov as any).Departamento ? String((mov as any).Departamento).trim() : '',
      outrasInfoComplementar: '',
      outrasRateioLinhas: [] as CadastroRateioLinhaOutras[],
      outrasContatos: [] as CadastroContatoReceita[],
      outrasContatoPagina: 1,
      outrasContatoDraftNome: '',
      outrasContatoDraftEmail: '',
      outrasContatoDraftTelefone: '',
      outrasFaturamentoData: '',
      outrasFaturamentoEnviado: false,
    };

    this.mostrarModalCadastro = true;
    this.atualizarSnapshotCadastro();
  }

  private resolverOpcaoOuManual(
    opcoes: Array<{ value: string; label: string }>,
    valorAtual: string
  ): { opcao: string; manual: string } {
    const t = (valorAtual || '').trim();
    if (!t) {
      return { opcao: '', manual: '' };
    }
    const found = opcoes.find((c) => c.label === t && !!c.value);
    if (found) {
      return { opcao: found.value, manual: '' };
    }
    return { opcao: '__manual__', manual: t };
  }

  private normalizarDataParaInput(v: string | undefined | null): string {
    if (v == null || v === '') {
      return '';
    }
    const s = String(v);
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  private valorNumericoParaInputBr(valor: number | undefined | null): string {
    if (valor == null || !Number.isFinite(Number(valor))) {
      return '';
    }
    const cents = Math.round(Number(valor) * 100);
    return this.formatarValorBrEmDigitacao(String(cents));
  }

  async fecharModalCadastro(force = false): Promise<void> {
    if (force) {
      this.mostrarModalCadastro = false;
      this.mostrarMenuCriarReceita = false;
      this.mostrarMenuCriarDespesa = false;
      this.cadastroBcTransferencia = false;
      this.cadastroModo = 'novo';
      this.editandoMovimentacaoId = null;
      this.cadastroAnexosPendentes = [];
      return;
    }
    if (!this.temAlteracoesCadastro()) {
      this.mostrarModalCadastro = false;
      this.mostrarMenuCriarReceita = false;
      this.mostrarMenuCriarDespesa = false;
      this.cadastroBcTransferencia = false;
      this.cadastroModo = 'novo';
      this.editandoMovimentacaoId = null;
      this.cadastroAnexosPendentes = [];
      return;
    }
    const confirmacao = await Swal.fire({
      icon: 'warning',
      title: 'Descartar alterações?',
      text: 'Existem dados não salvos neste cadastro.',
      showCancelButton: true,
      confirmButtonText: 'Descartar',
      cancelButtonText: 'Continuar editando',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#334155',
      reverseButtons: true,
    });
    if (confirmacao.isConfirmed) {
      this.mostrarModalCadastro = false;
      this.mostrarMenuCriarReceita = false;
      this.mostrarMenuCriarDespesa = false;
      this.cadastroBcTransferencia = false;
      this.cadastroModo = 'novo';
      this.editandoMovimentacaoId = null;
      this.cadastroAnexosPendentes = [];
    }
  }

  private atualizarSnapshotCadastro(): void {
    this.cadastroSnapshot = this.serializarEstadoCadastro();
  }

  private temAlteracoesCadastro(): boolean {
    return this.serializarEstadoCadastro() !== this.cadastroSnapshot;
  }

  private serializarEstadoCadastro(): string {
    const anexosMeta = this.cadastroAnexosPendentes.map((a) => ({
      tipo: a.tipo,
      nome: a.file.name,
      bytes: a.file.size,
    }));
    return JSON.stringify({ ...this.novoLancamento, _anexosPendentes: anexosMeta });
  }

  private validarCadastroLancamento(): boolean {
    const errors: Record<string, string> = {};
    if (this.modalEstiloNovaVendaReceita) {
      this.sincronizarRecorrenciaDaVendaReceita();
      this.sincronizarValorCampoComTotaisVenda();
    }
    const valorBruto = String(this.novoLancamento.valor ?? '').trim();
    const valorNumerico = this.parseValorBr(valorBruto);
    const categoriaFinal = this.obterCategoriaFinalCadastro();
    const parceiroFinal = this.obterClienteFornecedorFinalCadastro();

    const podeDescricaoOpcionalVenda =
      this.modalEstiloNovaVendaReceita && this.cadastroValorBrutoItensVenda() > 0;
    const podeDescricaoOpcionalAporte = this.modalEstiloReceitaAporte;
    const podeDescricaoOpcionalTransfer =
      this.modalEstiloBomControleDespesa && this.cadastroBcTransferencia;
    if (!this.novoLancamento.descricao.trim()) {
      if (!podeDescricaoOpcionalVenda && !podeDescricaoOpcionalAporte && !podeDescricaoOpcionalTransfer) {
        errors['descricao'] = 'Informe a descrição.';
      }
    } else if (this.novoLancamento.descricao.trim().length < 3) {
      if (!podeDescricaoOpcionalAporte && !podeDescricaoOpcionalTransfer) {
        errors['descricao'] = 'A descrição precisa ter pelo menos 3 caracteres.';
      }
    }
    if (!parceiroFinal.trim()) {
      const isFunc =
        this.novoLancamento.tipo === 'despesa' && this.novoLancamento.tipoMovimentoDespesa === 'funcionario';
      const aporteSemCliente = this.modalEstiloReceitaAporte;
      if (!aporteSemCliente) {
        errors['clienteFornecedor'] = isFunc
          ? 'Informe o funcionário.'
          : this.novoLancamento.tipo === 'despesa'
            ? 'Informe o fornecedor ou favorecido.'
            : 'Informe o cliente.';
      }
    }
    if (this.modalEstiloNovaVendaReceita) {
      const emps = this.companySelectorService.obterEmpresasAtivas();
      if (emps.length > 1 && !String(this.novoLancamento.vendaEmpresaOpcao || '').trim()) {
        errors['vendaEmpresa'] = 'Selecione a empresa.';
      }
      if (!String(this.novoLancamento.vendaDataVenda || '').trim()) {
        errors['vendaDataVenda'] = 'Informe a data da venda.';
      }
      if (!(this.novoLancamento.formaPagamento || '').trim()) {
        errors['formaPagamento'] = 'Selecione a forma de pagamento.';
      }
      if (this.cadastroValorBrutoItensVenda() <= 0) {
        errors['valor'] = 'Inclua produtos ou serviços com quantidade e valor unitário.';
      }
    }
    if (!this.novoLancamento.dataVencimento) {
      errors['dataVencimento'] = 'Informe a data de vencimento.';
    }
    const dataVencimento = this.novoLancamento.dataVencimento ? this.parseLocalDateStr(this.novoLancamento.dataVencimento) : null;

    const dataCompetencia = this.competenciaMesAnoParaData(this.novoLancamento.dataCompetencia);
    if (this.novoLancamento.dataCompetencia && !dataCompetencia) {
      errors['dataCompetencia'] = 'Competência inválida. Use o mês e ano.';
    }
    if (this.novoLancamento.marcarComoQuitado && !this.novoLancamento.dataQuitacao) {
      errors['dataQuitacao'] = 'Informe a data de quitação/recebimento.';
    } else if (this.novoLancamento.marcarComoQuitado && this.novoLancamento.dataQuitacao && dataVencimento) {
      const dataQuitacao = this.parseLocalDateStr(this.novoLancamento.dataQuitacao);
      if (dataQuitacao < dataVencimento) {
        errors['dataQuitacao'] = 'A quitação/recebimento não pode ser anterior ao vencimento.';
      }
    }
    if (dataCompetencia && dataVencimento) {
      const compDate = this.parseLocalDateStr(dataCompetencia);
      const deltaMeses = (dataVencimento.getFullYear() - compDate.getFullYear()) * 12 + (dataVencimento.getMonth() - compDate.getMonth());
      if (Math.abs(deltaMeses) > 24) {
        errors['dataCompetencia'] = 'Competência muito distante da data de vencimento.';
      }
    }
    if (!categoriaFinal.trim()) {
      errors['categoria'] = 'Informe a categoria.';
    }
    if (this.modalEstiloBomControleDespesa && this.cadastroBcTransferencia) {
      const origOk = this.contaBcSelecionadaValida(
        this.novoLancamento.contaOpcao,
        this.novoLancamento.contaManual
      );
      const destOk = this.contaBcSelecionadaValida(
        this.novoLancamento.bcTransferDestinoContaOpcao,
        this.novoLancamento.bcTransferDestinoContaManual
      );
      if (!origOk) {
        errors['contaOrigem'] = 'Selecione a conta de origem.';
      }
      if (!destOk) {
        errors['bcTransferDestino'] = 'Selecione a conta de destino.';
      }
      if (!(this.novoLancamento.formaPagamento || '').trim()) {
        errors['formaPagamento'] = 'Selecione a forma da transferência.';
      }
      if (origOk && destOk && this.contasTransferenciaOrigemDestinoMesma()) {
        errors['bcTransferDestino'] = 'A conta de destino deve ser diferente da origem.';
      }
    }
    if (this.modalEstiloReceitaOutrasContrato) {
      const linhas = this.novoLancamento.outrasRateioLinhas || [];
      if (linhas.length > 0) {
        let incompleto = false;
        for (const l of linhas) {
          const nome = this.obterNomeCategoriaRateioLinha(l);
          const p = this.parseValorBr(String(l.percentual || '').trim());
          if (!nome || !Number.isFinite(p) || p <= 0) {
            incompleto = true;
            break;
          }
        }
        if (incompleto) {
          errors['outrasRateio'] = 'Preencha categoria e percentual em todas as linhas do rateio, ou remova linhas vazias.';
        } else {
          const soma = this.cadastroSomaPercentualRateioOutras();
          if (Math.abs(soma - 100) > 0.05) {
            errors['outrasRateio'] = `A soma dos percentuais do rateio deve ser 100% (atual: ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%).`;
          }
        }
      }
    }
    if (!this.novoLancamento.valor || !Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      if (!this.modalEstiloNovaVendaReceita) {
        errors['valor'] = 'Informe um valor maior que zero.';
      } else if (!errors['valor']) {
        errors['valor'] = 'O valor líquido da venda deve ser maior que zero (ajuste descontos ou itens).';
      }
    }
    if (this.modalEstiloBomControleDespesa || this.modalEstiloReceitaOutrasContrato || this.modalEstiloReceitaAporte) {
      const liq = this.cadastroValorLiquidoNumerico();
      if (Number.isFinite(valorNumerico) && valorNumerico > 0 && liq <= 0) {
        errors['valor'] = 'O valor líquido (bruto − desconto + acréscimo) deve ser maior que zero.';
      }
    }
    if (this.cadastroModo === 'novo') {
      const freq = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
      const qRaw = Number(this.novoLancamento.recorrenciaQuantidade);
      const qty = Number.isFinite(qRaw) ? Math.floor(qRaw) : 1;
      const repeteBc =
        (this.modalEstiloBomControleDespesa || this.modalEstiloReceitaOutrasContrato) &&
        this.novoLancamento.contaSeRepete;

      if (this.novoLancamento.marcarComoQuitado && (repeteBc || freq !== 'nenhuma' || qty > 1)) {
        errors['recorrencia'] =
          'Recorrência não pode ser usada junto com “quitado/recebido no cadastro”. Desmarque um dos dois.';
      }
      if (!this.novoLancamento.marcarComoQuitado) {
        if (repeteBc) {
          if (freq === 'nenhuma') {
            errors['recorrenciaFrequencia'] = 'Selecione o período da recorrência.';
          }
          if (this.novoLancamento.prazoParaAcabar && freq !== 'nenhuma' && qty < 2) {
            errors['recorrenciaQuantidade'] = 'Informe pelo menos 2 parcelas quando há prazo para acabar.';
          }
          if (this.novoLancamento.prazoParaAcabar && qty > 120) {
            errors['recorrenciaQuantidade'] = 'Máximo de 120 parcelas por série.';
          }
          if (this.novoLancamento.prazoParaAcabar && qty < 1) {
            errors['recorrenciaQuantidade'] = 'Número de parcelas inválido.';
          }
        } else {
          if (freq !== 'nenhuma' && qty < 2) {
            errors['recorrenciaQuantidade'] = 'Informe pelo menos 2 parcelas para usar recorrência.';
          }
          if (freq === 'nenhuma' && qty > 1) {
            errors['recorrenciaFrequencia'] =
              'Selecione a frequência ou deixe o número de parcelas em 1 para um lançamento único.';
          }
          if (qty > 120) {
            errors['recorrenciaQuantidade'] = 'Máximo de 120 parcelas por série.';
          }
          if (qty < 1) {
            errors['recorrenciaQuantidade'] = 'Número de parcelas inválido.';
          }
        }
      }
    }
    this.cadastroErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async salvarNovoLancamento(): Promise<void> {
    if (!this.validarCadastroLancamento()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Campos obrigatórios pendentes',
        text: 'Revise os campos destacados para continuar.',
        confirmButtonColor: '#334155',
      });
      return;
    }

    let metadataJsonPayload: string | undefined;
    try {
      metadataJsonPayload = await this.montarMetadataJsonParaSalvar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível preparar os arquivos para envio.';
      await Swal.fire({
        icon: 'error',
        title: 'Anexos / metadados',
        text: msg,
        confirmButtonColor: '#dc2626',
      });
      return;
    }
    if (
      this.cadastroModo === 'editar' &&
      (metadataJsonPayload == null || metadataJsonPayload === '') &&
      this.metadataJsonSnapshotEdicao
    ) {
      metadataJsonPayload = this.metadataJsonSnapshotEdicao;
    }

    const valorBruto = String(this.novoLancamento.valor ?? '').trim();
    const valorNumerico = this.parseValorBr(valorBruto);
    const usaLiquidoBc =
      this.modalEstiloBomControleDespesa ||
      this.modalEstiloReceitaOutrasContrato ||
      this.modalEstiloReceitaAporte;
    const valorApi = usaLiquidoBc
      ? Math.max(0.01, this.cadastroValorLiquidoNumerico())
      : this.modalEstiloNovaVendaReceita
        ? Math.max(0.01, this.cadastroValorLiquidoNovaVendaNumerico())
        : valorNumerico;
    const categoriaFinal = this.obterCategoriaFinalCadastro();
    const contaFinal = this.obterContaFinalCadastro();
    const clienteFornecedorFinal = this.obterClienteFornecedorFinalCadastro();
    let nomeSalvar = this.novoLancamento.descricao.trim();
    if (!nomeSalvar && this.modalEstiloNovaVendaReceita) {
      nomeSalvar = clienteFornecedorFinal ? `Venda — ${clienteFornecedorFinal}` : 'Venda';
    }
    if (!nomeSalvar && this.modalEstiloReceitaOutrasContrato) {
      nomeSalvar = this.receitaCadastroFluxo === 'contrato' ? 'Contrato — receita' : 'Outras receitas';
    }
    if (!nomeSalvar && this.modalEstiloReceitaAporte) {
      nomeSalvar = 'Aporte financeiro';
    }
    if (!nomeSalvar && this.cadastroBcTransferencia && this.modalEstiloBomControleDespesa) {
      nomeSalvar = 'Transferência entre contas';
    }
    const payload: CriarMovimentacaoPayload = {
      debito: this.novoLancamento.tipo === 'despesa',
      dataVencimento: this.novoLancamento.dataVencimento,
      dataCompetencia: this.competenciaMesAnoParaData(this.novoLancamento.dataCompetencia) || this.novoLancamento.dataVencimento,
      dataQuitacao: this.novoLancamento.marcarComoQuitado
        ? (this.novoLancamento.dataQuitacao || this.novoLancamento.dataVencimento)
        : undefined,
      valor: valorApi,
      nome: nomeSalvar,
      observacao: this.montarObservacaoParaSalvar() || undefined,
      nomeCategoriaFinanceira: categoriaFinal,
      nomeContaFinanceira: contaFinal || undefined,
      nomeClienteFornecedor: clienteFornecedorFinal || undefined,
    };
    if (this.modalEstiloReceitaOutrasContrato || this.modalEstiloReceitaAporte) {
      const dep = (this.novoLancamento.outrasDepartamento || '').trim();
      if (dep) {
        payload.departamento = dep;
      }
      const rj = this.montarRateioJsonOutras();
      if (rj) {
        payload.rateioJson = rj;
      }
    }
    if (metadataJsonPayload) {
      payload.metadataJson = metadataJsonPayload;
    }

    const forma = (this.novoLancamento.formaPagamento || '').trim();
    if (forma) {
      payload.nomeFormaPagamento = forma;
    }
    if (payload.debito) {
      if (this.cadastroBcTransferencia && this.modalEstiloBomControleDespesa) {
        payload.tipoMovimentoDespesa = 'TRANSFERENCIA';
      } else {
        payload.tipoMovimentoDespesa = (this.novoLancamento.tipoMovimentoDespesa || 'fornecedor').toUpperCase();
      }
    }

    const idFunc = this.obterIdFuncionarioPayload();
    if (idFunc != null) {
      payload.idFuncionario = idFunc;
    }

    const isEdicao = this.cadastroModo === 'editar' && this.editandoMovimentacaoId;
    if (!isEdicao && !this.novoLancamento.marcarComoQuitado) {
      const freq = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
      const qRaw = Number(this.novoLancamento.recorrenciaQuantidade);
      let qty = Number.isFinite(qRaw) ? Math.floor(qRaw) : 1;
      const repeteBc =
        (this.modalEstiloBomControleDespesa || this.modalEstiloReceitaOutrasContrato) &&
        this.novoLancamento.contaSeRepete;

      if (repeteBc && freq !== 'nenhuma') {
        const qSerie = this.novoLancamento.prazoParaAcabar
          ? Math.max(2, Math.min(120, qty < 2 ? 12 : qty))
          : 120;
        payload.recorrenciaFrequencia = freq.toUpperCase();
        payload.recorrenciaQuantidade = qSerie;
      } else if (!repeteBc && freq !== 'nenhuma') {
        qty = Math.max(2, Math.min(120, qty < 2 ? 12 : qty));
        payload.recorrenciaFrequencia = freq.toUpperCase();
        payload.recorrenciaQuantidade = qty;
      }
    }

    this.salvandoCadastro = true;
    const req$ = isEdicao
      ? this.erpFinanceiroService.atualizarMovimentacao(this.editandoMovimentacaoId!, payload)
      : this.erpFinanceiroService.criarMovimentacao(payload);

    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: async (res: { totalCadastrados?: number; movimentacoes?: unknown[]; mensagem?: string; movimentacao?: any }) => {
        this.salvandoCadastro = false;
        const aplicarAnexosLocais = (ids: string[]) => {
          const emp = this.empresaIdAtual();
          const pendentes = this.cadastroAnexosPendentes;
          if (!pendentes.length || !ids.length) {
            return;
          }
          for (const mid of ids) {
            if (!mid) continue;
            for (const a of pendentes) {
              this.movimentacoesAnexosService.salvarAnexo(emp, mid, a.tipo, a.file);
            }
          }
        };
        let idsMovs: string[] = [];
        if (isEdicao) {
          idsMovs = [this.editandoMovimentacaoId!];
        } else if (Array.isArray(res?.movimentacoes)) {
          idsMovs = res.movimentacoes!
            .map((m: any) => String(m?.IdMovimentacaoFinanceiraParcela ?? '').trim())
            .filter(Boolean);
        } else if (res?.movimentacao) {
          const id = String(res.movimentacao?.IdMovimentacaoFinanceiraParcela ?? '').trim();
          if (id) idsMovs = [id];
        }
        let idsAnexo = idsMovs;
        if (
          !isEdicao &&
          idsMovs.length > 1 &&
          !this.novoLancamento.anexosEmTodasParcelas &&
          this.cadastroAnexosPendentes.length > 0
        ) {
          const maxP = idsMovs.length;
          const p = Math.max(1, Math.min(maxP, Math.floor(Number(this.novoLancamento.anexoParcelaNumero) || 1)));
          idsAnexo = [idsMovs[p - 1]].filter(Boolean);
        }
        const enviouBinarioNoBackend = !!(metadataJsonPayload && metadataJsonPayload.includes('conteudoBase64'));
        if (!enviouBinarioNoBackend) {
          aplicarAnexosLocais(idsAnexo);
        }
        this.cadastroAnexosPendentes = [];
        this.fecharModalCadastro(true);
        this.carregarMovimentacoes();
        const totalNovo =
          !isEdicao && typeof res?.totalCadastrados === 'number'
            ? res.totalCadastrados
            : !isEdicao && Array.isArray(res?.movimentacoes)
              ? res.movimentacoes!.length
              : 1;
        const textoSucesso =
          !isEdicao && totalNovo > 1
            ? res?.mensagem ||
              `${totalNovo} parcelas foram cadastradas com sucesso (mesmo valor e descrição, vencimentos conforme a recorrência).`
            : isEdicao
              ? 'O lançamento foi atualizado com sucesso.'
              : res?.mensagem || 'A movimentação foi criada com sucesso.';
        await Swal.fire({
          icon: 'success',
          title: isEdicao ? 'Alterações salvas' : 'Cadastro realizado',
          text: textoSucesso,
          confirmButtonColor: '#16a34a',
        });
      },
      error: async (err) => {
        this.salvandoCadastro = false;
        await Swal.fire({
          icon: 'error',
          title: isEdicao ? 'Não foi possível salvar' : 'Não foi possível cadastrar',
          text: this.obterMensagemErro(err, 'Não foi possível concluir a operação. Tente novamente em instantes.'),
          confirmButtonColor: '#dc2626',
        });
      }
    });
  }

  onValorDigitado(valor: string): void {
    this.novoLancamento.valor = this.formatarValorBrEmDigitacao(valor);
  }

  onCategoriaOpcaoChange(): void {
    if (this.novoLancamento.categoriaOpcao !== '__manual__') {
      this.novoLancamento.categoriaManual = '';
    }
  }

  onTipoLancamentoChange(): void {
    this.atualizarOpcoesCategoriaCadastro(this.novoLancamento.tipo);
    this.atualizarOpcoesParceiroCadastro(
      this.novoLancamento.tipo,
      this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
    );
    this.novoLancamento.categoriaOpcao = '';
    this.novoLancamento.categoriaManual = '';
    this.novoLancamento.clienteFornecedorOpcao = '';
    this.novoLancamento.clienteFornecedorManual = '';
  }

  onContaOpcaoChange(): void {
    if (this.novoLancamento.contaOpcao !== '__manual__') {
      this.novoLancamento.contaManual = '';
    }
  }

  onBcTransferDestinoContaOpcaoChange(): void {
    if (this.novoLancamento.bcTransferDestinoContaOpcao !== '__manual__') {
      this.novoLancamento.bcTransferDestinoContaManual = '';
    }
  }

  onClienteFornecedorOpcaoChange(): void {
    if (this.novoLancamento.clienteFornecedorOpcao !== '__manual__') {
      this.novoLancamento.clienteFornecedorManual = '';
    }
  }

  onRecorrenciaFrequenciaChange(): void {
    const f = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
    if (this.modalEstiloBomControleDespesa || this.modalEstiloReceitaOutrasContrato) {
      this.novoLancamento.contaSeRepete = f !== 'nenhuma';
    }
    if (f === 'nenhuma') {
      this.novoLancamento.recorrenciaQuantidade = 1;
    } else if (!Number.isFinite(this.novoLancamento.recorrenciaQuantidade) || this.novoLancamento.recorrenciaQuantidade < 2) {
      this.novoLancamento.recorrenciaQuantidade = 12;
    }
    delete this.cadastroErrors['recorrenciaFrequencia'];
    delete this.cadastroErrors['recorrenciaQuantidade'];
    delete this.cadastroErrors['recorrencia'];
  }

  /** Ordem dos tipos de anexo na aba BC (Fatura, Comprovante, NF, Boleto, Outros). */
  get tiposAnexoListaOrdemBc() {
    const ordem: TipoAnexoMovimentacao[] = ['fatura', 'comprovante', 'nota_fiscal', 'boleto', 'outros'];
    return ordem
      .map((id) => this.tiposAnexoLista.find((t) => t.id === id))
      .filter((x): x is (typeof this.tiposAnexoLista)[number] => !!x);
  }

  cadastroAvisoValorBcRepetir(): boolean {
    const wideReceita =
      this.modalEstiloReceitaOutrasContrato && this.novoLancamento.contaSeRepete;
    if (!this.modalEstiloBomControleDespesa && !wideReceita) {
      return false;
    }
    const valorBruto = String(this.novoLancamento.valor ?? '').trim();
    const valorNumerico = this.parseValorBr(valorBruto);
    const liq = this.cadastroValorLiquidoNumerico();
    return (
      !valorBruto ||
      !Number.isFinite(valorNumerico) ||
      valorNumerico <= 0 ||
      !Number.isFinite(liq) ||
      liq <= 0
    );
  }

  cadastroParcelaAnexoMax(): number {
    if (this.modalEstiloNovaVendaReceita) {
      const freq = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
      if (freq === 'nenhuma') {
        return 1;
      }
      return Math.max(2, Math.min(120, Math.floor(Number(this.novoLancamento.recorrenciaQuantidade)) || 2));
    }
    const parceladoBc = this.modalEstiloBomControleDespesa && this.novoLancamento.contaSeRepete;
    const parceladoOutras = this.modalEstiloReceitaOutrasContrato && this.novoLancamento.contaSeRepete;
    if (!parceladoBc && !parceladoOutras) {
      return 1;
    }
    const freq = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
    if (freq === 'nenhuma') {
      return 1;
    }
    if (this.novoLancamento.prazoParaAcabar) {
      return Math.max(2, Math.min(120, Math.floor(Number(this.novoLancamento.recorrenciaQuantidade)) || 2));
    }
    return 120;
  }

  setCadastroContaSeRepete(sim: boolean): void {
    this.novoLancamento.contaSeRepete = sim;
    if (!sim) {
      this.novoLancamento.recorrenciaFrequencia = 'nenhuma';
      this.novoLancamento.recorrenciaQuantidade = 1;
    } else {
      if (this.novoLancamento.recorrenciaFrequencia === 'nenhuma') {
        this.novoLancamento.recorrenciaFrequencia = 'mensal';
      }
      if (!this.novoLancamento.prazoParaAcabar) {
        this.novoLancamento.recorrenciaQuantidade = 120;
      } else if (!Number.isFinite(this.novoLancamento.recorrenciaQuantidade) || this.novoLancamento.recorrenciaQuantidade < 2) {
        this.novoLancamento.recorrenciaQuantidade = 12;
      }
    }
    this.novoLancamento.anexoParcelaNumero = 1;
    delete this.cadastroErrors['recorrenciaFrequencia'];
    delete this.cadastroErrors['recorrenciaQuantidade'];
    delete this.cadastroErrors['recorrencia'];
  }

  setCadastroPrazoParaAcabar(sim: boolean): void {
    this.novoLancamento.prazoParaAcabar = sim;
    if (!sim && this.novoLancamento.contaSeRepete) {
      this.novoLancamento.recorrenciaQuantidade = 120;
    } else if (sim && this.novoLancamento.contaSeRepete) {
      if (!Number.isFinite(this.novoLancamento.recorrenciaQuantidade) || this.novoLancamento.recorrenciaQuantidade < 2) {
        this.novoLancamento.recorrenciaQuantidade = 4;
      }
      if (this.novoLancamento.recorrenciaQuantidade > 120) {
        this.novoLancamento.recorrenciaQuantidade = 120;
      }
    }
    this.novoLancamento.anexoParcelaNumero = Math.min(
      this.novoLancamento.anexoParcelaNumero,
      this.cadastroParcelaAnexoMax()
    );
  }

  setCadastroAnexosTodasParcelas(sim: boolean): void {
    this.novoLancamento.anexosEmTodasParcelas = sim;
  }

  cadastroToggleSimNaoClasse(ativo: boolean): string {
    return ativo
      ? 'bg-white text-slate-900 shadow-md shadow-slate-900/10 ring-2 ring-teal-500/35'
      : 'text-slate-600 hover:bg-white/80 hover:text-slate-900';
  }

  get modalEstiloBomControleDespesa(): boolean {
    return this.cadastroModo === 'novo' && this.novoLancamento.tipo === 'despesa';
  }

  /** Modal largo (BC ou receitas com fluxo guiado). */
  get modalCadastroLargo(): boolean {
    return (
      this.modalEstiloBomControleDespesa ||
      this.modalEstiloNovaVendaReceita ||
      this.modalEstiloReceitaOutrasContrato ||
      this.modalEstiloReceitaAporte
    );
  }

  /** Modal “Nova venda” (abas) para nova conta a receber — apenas fluxo Venda. */
  get modalEstiloNovaVendaReceita(): boolean {
    return this.cadastroModo === 'novo' && this.novoLancamento.tipo === 'receita' && this.receitaCadastroFluxo === 'venda';
  }

  /** Outras receitas ou Contrato (abas estendidas). */
  get modalEstiloReceitaOutrasContrato(): boolean {
    return (
      this.cadastroModo === 'novo' &&
      this.novoLancamento.tipo === 'receita' &&
      (this.receitaCadastroFluxo === 'outras' || this.receitaCadastroFluxo === 'contrato')
    );
  }

  get modalEstiloReceitaAporte(): boolean {
    return this.cadastroModo === 'novo' && this.novoLancamento.tipo === 'receita' && this.receitaCadastroFluxo === 'aporte';
  }

  /** Edição ou cadastro compacto (sem modais “premium”). */
  get modalCadastroFormularioSimples(): boolean {
    return this.cadastroModo === 'editar';
  }

  selecionarCadastroAbaVenda(aba: 'vendedor' | 'produtos' | 'contrato' | 'pagamento' | 'observacao' | 'anexos'): void {
    this.cadastroAbaVenda = aba;
  }

  cadastroAbaVendaAtiva(
    aba: 'vendedor' | 'produtos' | 'contrato' | 'pagamento' | 'observacao' | 'anexos'
  ): boolean {
    return this.cadastroAbaVenda === aba;
  }

  cadastroTituloNovaVenda(): string {
    return 'Nova conta a receber';
  }

  cadastroTituloReceitaFluxo(): string {
    if (this.receitaCadastroFluxo === 'outras') {
      return 'Outras receitas';
    }
    if (this.receitaCadastroFluxo === 'contrato') {
      return 'Contrato — receita';
    }
    if (this.receitaCadastroFluxo === 'aporte') {
      return 'Aporte financeiro';
    }
    return 'Nova conta a receber';
  }

  selecionarCadastroAbaOutras(aba: typeof this.cadastroAbaOutras): void {
    this.cadastroAbaOutras = aba;
  }

  cadastroAbaOutrasAtiva(aba: typeof this.cadastroAbaOutras): boolean {
    return this.cadastroAbaOutras === aba;
  }

  selecionarCadastroAbaAporte(aba: typeof this.cadastroAbaAporte): void {
    this.cadastroAbaAporte = aba;
  }

  cadastroAbaAporteAtiva(aba: typeof this.cadastroAbaAporte): boolean {
    return this.cadastroAbaAporte === aba;
  }

  private criarLinhaRateioOutrasPadrao(): CadastroRateioLinhaOutras {
    return {
      categoriaOpcao: '',
      categoriaManual: '',
      percentual: '',
    };
  }

  adicionarLinhaRateioOutras(): void {
    const linhas = [...(this.novoLancamento.outrasRateioLinhas || [])];
    linhas.push(this.criarLinhaRateioOutrasPadrao());
    this.novoLancamento.outrasRateioLinhas = linhas;
  }

  removerLinhaRateioOutras(index: number): void {
    const linhas = [...(this.novoLancamento.outrasRateioLinhas || [])];
    linhas.splice(index, 1);
    this.novoLancamento.outrasRateioLinhas = linhas;
    delete this.cadastroErrors['outrasRateio'];
  }

  onRateioCategoriaOpcaoChange(index: number, valor: string): void {
    const linhas = [...(this.novoLancamento.outrasRateioLinhas || [])];
    if (!linhas[index]) {
      return;
    }
    linhas[index] = {
      ...linhas[index],
      categoriaOpcao: valor,
      categoriaManual: valor === '__manual__' ? linhas[index].categoriaManual : '',
    };
    this.novoLancamento.outrasRateioLinhas = linhas;
    delete this.cadastroErrors['outrasRateio'];
  }

  onRateioPercentualInput(index: number, val: string): void {
    const linhas = [...(this.novoLancamento.outrasRateioLinhas || [])];
    if (!linhas[index]) {
      return;
    }
    linhas[index] = { ...linhas[index], percentual: this.formatarValorBrEmDigitacao(val) };
    this.novoLancamento.outrasRateioLinhas = linhas;
    delete this.cadastroErrors['outrasRateio'];
  }

  cadastroSomaPercentualRateioOutras(): number {
    let t = 0;
    for (const l of this.novoLancamento.outrasRateioLinhas || []) {
      const n = this.parseValorBr(String(l.percentual || '').trim().replace('%', ''));
      if (Number.isFinite(n) && n > 0) {
        t += n;
      }
    }
    return Math.round(t * 100) / 100;
  }

  private obterNomeCategoriaRateioLinha(linha: CadastroRateioLinhaOutras): string {
    if (linha.categoriaOpcao === '__manual__') {
      return (linha.categoriaManual || '').trim();
    }
    const id = (linha.categoriaOpcao || '').trim();
    if (!id) {
      return '';
    }
    const op = this.categoriasCadastroTipo.find((c) => c.value === id);
    return (op?.label || '').trim();
  }

  private montarRateioJsonOutras(): string | undefined {
    const linhas = (this.novoLancamento.outrasRateioLinhas || []).filter((l) => {
      const nome = this.obterNomeCategoriaRateioLinha(l);
      const p = this.parseValorBr(String(l.percentual || '').trim());
      return nome.length > 0 && Number.isFinite(p) && p > 0;
    });
    if (!linhas.length) {
      return undefined;
    }
    const payload = linhas.map((l) => ({
      categoria: this.obterNomeCategoriaRateioLinha(l),
      percentual: this.parseValorBr(String(l.percentual || '').trim()),
    }));
    return JSON.stringify(payload);
  }

  adicionarContatoReceitaDaFila(): void {
    const nome = (this.novoLancamento.outrasContatoDraftNome || '').trim();
    if (!nome) {
      return;
    }
    const c: CadastroContatoReceita = {
      id: `ct-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      nome,
      email: (this.novoLancamento.outrasContatoDraftEmail || '').trim(),
      telefone: (this.novoLancamento.outrasContatoDraftTelefone || '').trim(),
    };
    this.novoLancamento.outrasContatos = [...(this.novoLancamento.outrasContatos || []), c];
    this.novoLancamento.outrasContatoDraftNome = '';
    this.novoLancamento.outrasContatoDraftEmail = '';
    this.novoLancamento.outrasContatoDraftTelefone = '';
    const total = this.novoLancamento.outrasContatos.length;
    const ultimaPag = Math.max(1, Math.ceil(total / this.contatosReceitaPorPagina));
    this.novoLancamento.outrasContatoPagina = ultimaPag;
  }

  removerContatoReceita(indexGlobal: number): void {
    const arr = [...(this.novoLancamento.outrasContatos || [])];
    if (indexGlobal < 0 || indexGlobal >= arr.length) {
      return;
    }
    arr.splice(indexGlobal, 1);
    this.novoLancamento.outrasContatos = arr;
    const maxPag = Math.max(1, Math.ceil(arr.length / this.contatosReceitaPorPagina) || 1);
    if (this.novoLancamento.outrasContatoPagina > maxPag) {
      this.novoLancamento.outrasContatoPagina = maxPag;
    }
  }

  contatosReceitaSlicePagina(): CadastroContatoReceita[] {
    const arr = this.novoLancamento.outrasContatos || [];
    const p = Math.max(1, Math.floor(this.novoLancamento.outrasContatoPagina) || 1);
    const start = (p - 1) * this.contatosReceitaPorPagina;
    return arr.slice(start, start + this.contatosReceitaPorPagina);
  }

  contatosReceitaIndiceBasePagina(): number {
    const p = Math.max(1, Math.floor(this.novoLancamento.outrasContatoPagina) || 1);
    return (p - 1) * this.contatosReceitaPorPagina;
  }

  contatosReceitaTotalPaginas(): number {
    const n = (this.novoLancamento.outrasContatos || []).length;
    return Math.max(1, Math.ceil(n / this.contatosReceitaPorPagina));
  }

  /** Parcelamento com mais de uma parcela (anexos / série). */
  parcelamentoVendaAtivo(): boolean {
    if (!this.modalEstiloNovaVendaReceita) {
      return false;
    }
    const f = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
    const q = Math.floor(Number(this.novoLancamento.recorrenciaQuantidade) || 1);
    return f !== 'nenhuma' && q > 1;
  }

  totalLiquidoLinhaVenda(linha: CadastroLinhaVendaProduto): number {
    const q = Math.max(0, Number(linha.quantidade) || 0);
    const u = this.parseValorBr(String(linha.unitario || '').trim()) || 0;
    const d = this.parseValorBr(String(linha.desconto || '0').trim()) || 0;
    const raw = q * u - d;
    return Math.max(0, Math.round(raw * 100) / 100);
  }

  cadastroSubtotalProdutosVenda(): number {
    let t = 0;
    for (const l of this.novoLancamento.vendaLinhasProduto || []) {
      if (l.tipoItem === 'produto') {
        t += this.totalLiquidoLinhaVenda(l);
      }
    }
    return Math.round(t * 100) / 100;
  }

  cadastroSubtotalServicosVenda(): number {
    let t = 0;
    for (const l of this.novoLancamento.vendaLinhasProduto || []) {
      if (l.tipoItem === 'servico') {
        t += this.totalLiquidoLinhaVenda(l);
      }
    }
    return Math.round(t * 100) / 100;
  }

  cadastroValorBrutoItensVenda(): number {
    return Math.round((this.cadastroSubtotalProdutosVenda() + this.cadastroSubtotalServicosVenda()) * 100) / 100;
  }

  cadastroValorLiquidoNovaVendaNumerico(): number {
    const bruto = this.cadastroValorBrutoItensVenda();
    const dg = this.parseValorBr(String(this.novoLancamento.vendaDescontoGlobal || '0').trim()) || 0;
    return Math.max(0, Math.round((bruto - dg) * 100) / 100);
  }

  cadastroValorLiquidoNovaVendaFormatado(): string {
    return this.cadastroValorLiquidoNovaVendaNumerico().toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  sincronizarValorCampoComTotaisVenda(): void {
    if (!this.modalEstiloNovaVendaReceita) {
      return;
    }
    const liq = this.cadastroValorLiquidoNovaVendaNumerico();
    this.novoLancamento.valor = liq > 0 ? this.valorNumericoParaInputBr(liq) : '';
  }

  sincronizarRecorrenciaDaVendaReceita(): void {
    if (!this.modalEstiloNovaVendaReceita) {
      return;
    }
    const tipoPag = this.novoLancamento.vendaTipoPagamento;
    const n = Math.max(1, Math.min(120, Math.floor(Number(this.novoLancamento.vendaCondicaoParcelas) || 1)));
    const per = (this.novoLancamento.vendaPeriodo || 'mensal').toLowerCase();
    if (tipoPag === 'a_vista' || n <= 1) {
      this.novoLancamento.recorrenciaFrequencia = 'nenhuma';
      this.novoLancamento.recorrenciaQuantidade = 1;
    } else {
      this.novoLancamento.recorrenciaFrequencia = per;
      this.novoLancamento.recorrenciaQuantidade = Math.max(2, n);
    }
  }

  onVendaDataVendaChange(): void {
    const d = (this.novoLancamento.vendaDataVenda || '').trim();
    if (d.length >= 10) {
      this.novoLancamento.dataCompetencia = this.competenciaMesAnoDeData(d);
    }
  }

  onVendaDescontoGlobalInput(val: string): void {
    this.novoLancamento.vendaDescontoGlobal = this.formatarValorBrEmDigitacao(val);
    this.sincronizarValorCampoComTotaisVenda();
  }

  onVendaPagamentoCamposChange(): void {
    if (this.novoLancamento.vendaTipoPagamento === 'a_vista') {
      this.novoLancamento.vendaCondicaoParcelas = 1;
    }
    this.sincronizarRecorrenciaDaVendaReceita();
  }

  adicionarLinhaVendaProduto(): void {
    const linhas = [...(this.novoLancamento.vendaLinhasProduto || [])];
    linhas.push(this.criarLinhaVendaProdutoPadrao());
    this.novoLancamento.vendaLinhasProduto = linhas;
    this.sincronizarValorCampoComTotaisVenda();
  }

  removerLinhaVendaProduto(index: number): void {
    const linhas = [...(this.novoLancamento.vendaLinhasProduto || [])];
    if (linhas.length <= 1) {
      return;
    }
    linhas.splice(index, 1);
    this.novoLancamento.vendaLinhasProduto = linhas;
    this.sincronizarValorCampoComTotaisVenda();
  }

  onVendaLinhaCampoChange(): void {
    this.sincronizarValorCampoComTotaisVenda();
  }

  onVendaLinhaUnitario(index: number, val: string): void {
    const linhas = [...(this.novoLancamento.vendaLinhasProduto || [])];
    if (!linhas[index]) {
      return;
    }
    linhas[index] = { ...linhas[index], unitario: this.formatarValorBrEmDigitacao(val) };
    this.novoLancamento.vendaLinhasProduto = linhas;
    this.sincronizarValorCampoComTotaisVenda();
  }

  onVendaLinhaDesconto(index: number, val: string): void {
    const linhas = [...(this.novoLancamento.vendaLinhasProduto || [])];
    if (!linhas[index]) {
      return;
    }
    linhas[index] = { ...linhas[index], desconto: this.formatarValorBrEmDigitacao(val) };
    this.novoLancamento.vendaLinhasProduto = linhas;
    this.sincronizarValorCampoComTotaisVenda();
  }

  empresasOpcoesVenda(): Array<{ value: string; label: string }> {
    return this.companySelectorService.obterEmpresasAtivas().map((e) => ({
      value: String(e.idEmpresa),
      label: (e.nomeEmpresa || '').trim() || `Empresa #${e.idEmpresa}`,
    }));
  }

  selecionarCadastroAbaBc(aba: 'dados' | 'repetir' | 'anexos'): void {
    if (this.cadastroBcTransferencia && aba === 'repetir') {
      this.cadastroAbaBc = 'dados';
      return;
    }
    this.cadastroAbaBc = aba;
  }

  cadastroAbaBcAtiva(aba: 'dados' | 'repetir' | 'anexos'): boolean {
    return this.cadastroAbaBc === aba;
  }

  cadastroLabelParceiroBc(): string {
    const t = this.novoLancamento.tipoMovimentoDespesa;
    if (t === 'funcionario') return 'Funcionário';
    if (t === 'impostos') return 'Favorecido (órgão/receita)';
    return 'Fornecedor';
  }

  cadastroTituloBc(): string {
    if (this.cadastroBcTransferencia) {
      return 'Transferência';
    }
    const t = this.novoLancamento.tipoMovimentoDespesa;
    if (t === 'funcionario') return 'Despesa com funcionário';
    if (t === 'impostos') return 'Despesa (impostos)';
    return 'Despesa com fornecedor';
  }

  onTipoMovimentoDespesaBc(id: 'fornecedor' | 'funcionario' | 'impostos'): void {
    this.novoLancamento.tipoMovimentoDespesa = id;
    this.novoLancamento.clienteFornecedorOpcao = '';
    this.novoLancamento.clienteFornecedorManual = '';
    this.atualizarOpcoesParceiroCadastro('despesa', id);
  }

  onInputCadastroAnexo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) {
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (f) {
        this.cadastroAnexosPendentes.push({ tipo: this.cadastroAnexoTipoSelecionado, file: f });
      }
    }
    input.value = '';
  }

  removerAnexoPendenteCadastro(index: number): void {
    this.cadastroAnexosPendentes = this.cadastroAnexosPendentes.filter((_, j) => j !== index);
  }

  cadastroValorLiquidoNumerico(): number {
    const bruto = this.parseValorBr(String(this.novoLancamento.valor ?? '').trim());
    if (!Number.isFinite(bruto) || bruto < 0) return 0;
    const usaBc =
      this.modalEstiloBomControleDespesa ||
      this.modalEstiloReceitaOutrasContrato ||
      this.modalEstiloReceitaAporte;
    if (!usaBc) {
      return bruto;
    }
    const des = this.parseValorBr(String(this.novoLancamento.desconto ?? '0').trim()) || 0;
    const acr = this.parseValorBr(String(this.novoLancamento.acrescimo ?? '0').trim()) || 0;
    return Math.round((bruto - des + acr) * 100) / 100;
  }

  cadastroValorLiquidoFormatado(): string {
    const n = this.cadastroValorLiquidoNumerico();
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onDescontoBc(ev: string): void {
    this.novoLancamento.desconto = this.formatarValorBrEmDigitacao(ev);
  }

  onAcrescimoBc(ev: string): void {
    this.novoLancamento.acrescimo = this.formatarValorBrEmDigitacao(ev);
  }

  private montarObservacaoParaSalvar(): string {
    let o = (this.novoLancamento.observacao || '').trim();
    if (this.modalEstiloNovaVendaReceita) {
      const extras: string[] = [];
      const idEmp = (this.novoLancamento.vendaEmpresaOpcao || '').trim();
      if (idEmp) {
        extras.push(`Empresa (id): ${idEmp}`);
      }
      const vend = (this.novoLancamento.vendaVendedorNome || '').trim();
      if (vend) {
        extras.push(`Vendedor: ${vend}`);
      }
      const dv = (this.novoLancamento.vendaDataVenda || '').trim();
      if (dv) {
        extras.push(`Data venda: ${dv}`);
      }
      const pe = (this.novoLancamento.vendaPrevisaoEntrega || '').trim();
      if (pe) {
        extras.push(`Previsão entrega: ${pe}`);
      }
      const end = (this.novoLancamento.vendaEnderecoCliente || '').trim();
      if (end) {
        extras.push(`Endereço cliente: ${end}`);
      }
      const ctr = (this.novoLancamento.vendaContratoRef || '').trim();
      if (ctr) {
        extras.push(`Contrato: ${ctr}`);
      }
      if (this.novoLancamento.vendaEmitirBoleto) {
        extras.push('Emitir boleto: Sim');
        const cb = (this.novoLancamento.vendaContaBoletoOpcao || '').trim();
        if (cb) {
          extras.push(`Conta boleto: ${cb}`);
        }
      }
      if (this.novoLancamento.vendaGerarPix) {
        extras.push('Gerar Pix QR: Sim');
        const cp = (this.novoLancamento.vendaContaPixOpcao || '').trim();
        if (cp) {
          extras.push(`Conta Pix: ${cp}`);
        }
      }
      const op = (this.novoLancamento.vendaObservacaoParcelas || '').trim();
      if (op) {
        extras.push(`Obs. parcelas: ${op}`);
      }
      const linhasJson = JSON.stringify(
        (this.novoLancamento.vendaLinhasProduto || []).map((l) => ({
          tipo: l.tipoItem,
          codigo: l.codigo,
          nome: l.nome,
          tabela: l.tabela,
          descricao: l.descricao,
          qtd: l.quantidade,
          unit: l.unitario,
          desc: l.desconto,
          total: this.totalLiquidoLinhaVenda(l),
        }))
      );
      extras.push(`Itens: ${linhasJson}`);
      const bloco = extras.length ? `[Nova venda]\n${extras.join('\n')}` : '';
      if (!bloco) {
        return o;
      }
      return o ? `${o}\n\n${bloco}` : bloco;
    }
    if (this.modalEstiloReceitaOutrasContrato || this.modalEstiloReceitaAporte) {
      const extras: string[] = [];
      extras.push(`Fluxo receita: ${this.receitaCadastroFluxo}`);
      const dep = (this.novoLancamento.outrasDepartamento || '').trim();
      if (dep) {
        extras.push(`Departamento: ${dep}`);
      }
      const inf = (this.novoLancamento.outrasInfoComplementar || '').trim();
      if (inf) {
        extras.push(`Informações complementares: ${inf}`);
      }
      const rj = this.montarRateioJsonOutras();
      if (rj) {
        extras.push(`Rateio: ${rj}`);
      }
      if (this.modalEstiloReceitaOutrasContrato && (this.novoLancamento.outrasContatos || []).length > 0) {
        extras.push(`Contatos: ${JSON.stringify(this.novoLancamento.outrasContatos)}`);
      }
      if (this.modalEstiloReceitaOutrasContrato) {
        const fd = (this.novoLancamento.outrasFaturamentoData || '').trim();
        if (fd) {
          extras.push(`Faturamento (data referência): ${fd}`);
        }
        if (this.novoLancamento.outrasFaturamentoEnviado) {
          extras.push('Faturamento: enviado ao cliente (flag)');
        }
      }
      const bloco = extras.length ? `[Receita — ${this.cadastroTituloReceitaFluxo()}]\n${extras.join('\n')}` : '';
      if (!bloco) {
        return o;
      }
      return o ? `${o}\n\n${bloco}` : bloco;
    }
    if (!this.modalEstiloBomControleDespesa) {
      return o;
    }
    const meta: string[] = [];
    const e = (this.novoLancamento.etiqueta || '').trim();
    const d = (this.novoLancamento.numeroDocumento || '').trim();
    if (e) meta.push('Etiqueta: ' + e);
    if (d) meta.push('Documento nº: ' + d);
    const bruto = this.parseValorBr(String(this.novoLancamento.valor || '').trim()) || 0;
    const des = this.parseValorBr(String(this.novoLancamento.desconto || '0').trim()) || 0;
    const acr = this.parseValorBr(String(this.novoLancamento.acrescimo || '0').trim()) || 0;
    if (des > 0 || acr > 0) {
      meta.push(
        `Valor bruto R$ ${bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; desconto R$ ${des.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; acréscimo R$ ${acr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      );
    }
    if (this.novoLancamento.tipoValor === 'estimado') {
      meta.push('Tipo valor: Estimado');
    }
    if (meta.length === 0) {
      return o;
    }
    const linhaMeta = meta.join(' | ');
    return o ? `${o}\n${linhaMeta}` : linhaMeta;
  }

  private arquivoParaBase64(file: File): Promise<string> {
    const max = 950_000;
    if (file.size > max) {
      return Promise.reject(
        new Error(`Arquivo "${file.name}" é grande demais para envio no cadastro (máx. ~${Math.round(max / 1024)} KB).`)
      );
    }
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => reject(r.error || new Error('Falha ao ler o arquivo.'));
      r.readAsDataURL(file);
    });
  }

  /** Inclui bytes Base64 no metadata quando é lançamento único ou anexos replicados em todas as parcelas. */
  private incluirAnexosBinariosNoMetadataSalvar(): boolean {
    const freq = (this.novoLancamento.recorrenciaFrequencia || 'nenhuma').toLowerCase();
    const qRaw = Number(this.novoLancamento.recorrenciaQuantidade);
    const qty = Number.isFinite(qRaw) ? Math.floor(qRaw) : 1;
    const multiParcela = freq !== 'nenhuma' && qty > 1;
    if (!multiParcela) {
      return true;
    }
    if (this.novoLancamento.anexosEmTodasParcelas) {
      return true;
    }
    if (this.modalEstiloNovaVendaReceita && this.parcelamentoVendaAtivo()) {
      return false;
    }
    if (
      (this.modalEstiloBomControleDespesa || this.modalEstiloReceitaOutrasContrato) &&
      this.novoLancamento.contaSeRepete
    ) {
      return false;
    }
    return !multiParcela;
  }

  /**
   * JSON persistido em bc_movimentacoes.metadata_json (anexos, fluxo, contatos, itens de venda, etc.).
   */
  private async montarMetadataJsonParaSalvar(): Promise<string | undefined> {
    if (this.cadastroModo === 'editar') {
      return undefined;
    }
    const m: Record<string, unknown> = {};
    if (this.modalEstiloNovaVendaReceita) {
      m['fluxoReceita'] = 'venda';
      const idEmp = (this.novoLancamento.vendaEmpresaOpcao || '').trim();
      if (idEmp) {
        m['vendaEmpresaOpcao'] = idEmp;
      }
      m['itensVenda'] = (this.novoLancamento.vendaLinhasProduto || []).map((l) => ({
        tipo: l.tipoItem,
        codigo: l.codigo,
        nome: l.nome,
        tabela: l.tabela,
        descricao: l.descricao,
        qtd: l.quantidade,
        unit: l.unitario,
        desc: l.desconto,
        total: this.totalLiquidoLinhaVenda(l),
      }));
    } else if (this.modalEstiloReceitaOutrasContrato) {
      m['fluxoReceita'] = this.receitaCadastroFluxo;
      const dep = (this.novoLancamento.outrasDepartamento || '').trim();
      if (dep) {
        m['departamento'] = dep;
      }
      const inf = (this.novoLancamento.outrasInfoComplementar || '').trim();
      if (inf) {
        m['infoComplementar'] = inf;
      }
      const rj = this.montarRateioJsonOutras();
      if (rj) {
        m['rateio'] = JSON.parse(rj);
      }
      if ((this.novoLancamento.outrasContatos || []).length > 0) {
        m['contatos'] = this.novoLancamento.outrasContatos;
      }
      m['faturamento'] = {
        data: (this.novoLancamento.outrasFaturamentoData || '').trim(),
        enviado: !!this.novoLancamento.outrasFaturamentoEnviado,
      };
    } else if (this.modalEstiloReceitaAporte) {
      m['fluxoReceita'] = 'aporte';
    } else if (this.modalEstiloBomControleDespesa) {
      if (this.cadastroBcTransferencia) {
        m['fluxoDespesa'] = 'transferencia';
        m['contaOrigemOpcao'] = (this.novoLancamento.contaOpcao || '').trim() || undefined;
        m['contaOrigemLabel'] = this.obterContaFinalCadastro() || undefined;
        m['contaDestinoOpcao'] = (this.novoLancamento.bcTransferDestinoContaOpcao || '').trim() || undefined;
        m['contaDestinoLabel'] = this.obterContaDestinoBcFinal() || undefined;
        m['formaTransferencia'] = (this.novoLancamento.formaPagamento || '').trim() || undefined;
        m['transferido'] = !!this.novoLancamento.marcarComoQuitado;
      } else {
        m['fluxoDespesa'] = 'bom_controle';
        m['tipoMovimentoDespesa'] = this.novoLancamento.tipoMovimentoDespesa;
        m['etiqueta'] = (this.novoLancamento.etiqueta || '').trim() || undefined;
        m['numeroDocumento'] = (this.novoLancamento.numeroDocumento || '').trim() || undefined;
        m['tipoValor'] = this.novoLancamento.tipoValor;
      }
    }

    const comBin = this.incluirAnexosBinariosNoMetadataSalvar();
    if (this.cadastroAnexosPendentes.length > 0) {
      const anexos: unknown[] = [];
      for (const p of this.cadastroAnexosPendentes) {
        if (comBin) {
          const b64 = await this.arquivoParaBase64(p.file);
          anexos.push({
            tipo: p.tipo,
            nomeArquivo: p.file.name,
            mimeType: p.file.type || undefined,
            tamanhoBytes: p.file.size,
            conteudoBase64: b64,
          });
        } else {
          anexos.push({
            tipo: p.tipo,
            nomeArquivo: p.file.name,
            mimeType: p.file.type || undefined,
            tamanhoBytes: p.file.size,
          });
        }
      }
      m['anexos'] = anexos;
    }

    if (Object.keys(m).length === 0) {
      return undefined;
    }
    return JSON.stringify(m);
  }

  onToggleMarcarComoQuitado(): void {
    if (!this.novoLancamento.marcarComoQuitado) {
      this.novoLancamento.dataQuitacao = '';
      delete this.cadastroErrors['dataQuitacao'];
      return;
    }
    this.novoLancamento.recorrenciaFrequencia = 'nenhuma';
    this.novoLancamento.recorrenciaQuantidade = 1;
    this.novoLancamento.contaSeRepete = false;
    if (!this.novoLancamento.dataQuitacao) {
      this.novoLancamento.dataQuitacao = this.novoLancamento.dataVencimento || this.dateToStr(new Date());
    }
  }

  private obterCategoriaFinalCadastro(): string {
    if (this.novoLancamento.categoriaOpcao === '__manual__') {
      return this.novoLancamento.categoriaManual.trim();
    }
    return this.novoLancamento.categoriaOpcao.trim();
  }

  private obterClienteFornecedorFinalCadastro(): string {
    if (this.cadastroBcTransferencia && this.modalEstiloBomControleDespesa) {
      return 'Transferência interna';
    }
    const opcao = this.novoLancamento.clienteFornecedorOpcao;
    if (opcao?.startsWith('__func__:')) {
      const id = Number(opcao.slice('__func__:'.length));
      if (Number.isFinite(id)) {
        const f = this.funcionariosCadastro.find((x) => x.id === id);
        if (f) {
          return ((f.nomeCompleto || '').trim() || `Funcionário #${id}`).trim();
        }
      }
      return '';
    }
    if (opcao === '__manual__') {
      return this.novoLancamento.clienteFornecedorManual.trim();
    }
    return (opcao || '').trim();
  }

  private obterIdFuncionarioPayload(): number | undefined {
    if (this.novoLancamento.tipo !== 'despesa') {
      return undefined;
    }
    if (this.novoLancamento.tipoMovimentoDespesa !== 'funcionario') {
      return undefined;
    }
    const opcao = this.novoLancamento.clienteFornecedorOpcao;
    if (!opcao?.startsWith('__func__:')) {
      return undefined;
    }
    const id = Number(opcao.slice('__func__:'.length));
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }

  private carregarCategoriasCadastroPorEmpresa(): void {
    const idEmp = this.empresaIdAtual();
    if (!idEmp) {
      this.categoriasCadastro = [];
      this.categoriasCadastroTipo = [];
      return;
    }
    this.categoriasFinanceirasService.listar(idEmp).pipe(takeUntil(this.destroy$)).subscribe({
      next: (categorias) => {
        const opcoes: Array<{ value: string; label: string; tipo: TipoCategoriaFinanceira }> = [];
        for (const c of categorias || []) {
          const subs = c.subcategorias || [];
          if (subs.length > 0) {
            for (const s of subs) {
              const label = `${c.nome} > ${s.nome}`;
              opcoes.push({ value: label, label, tipo: c.tipo });
            }
          } else {
            opcoes.push({ value: c.nome, label: c.nome, tipo: c.tipo });
          }
        }
        this.categoriasCadastro = opcoes;
        this.atualizarOpcoesCategoriaCadastro(this.novoLancamento.tipo);
      },
      error: () => {
        this.categoriasCadastro = [];
        this.categoriasCadastroTipo = [];
      }
    });
  }

  private atualizarOpcoesCategoriaCadastro(tipo: TipoCategoriaFinanceira): void {
    this.categoriasCadastroTipo = this.categoriasCadastro
      .filter((c) => c.tipo === tipo)
      .map((c) => ({ value: c.value, label: c.label }));
  }

  private carregarParceirosCadastroPorEmpresa(): void {
    const idEmp = this.empresaIdAtual();
    if (!idEmp) {
      this.clientesCadastro = [];
      this.fornecedoresCadastro = [];
      this.funcionariosCadastro = [];
      this.parceirosCadastroTipo = [];
      return;
    }

    this.clienteCadastroService
      .listar({ idEmpresa: idEmp, page: 0, size: 500, sort: 'razaoSocial,asc' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.clientesCadastro = (page.content || [])
            .map((c) => {
              const nome = (c.nomeFantasia || '').trim() || (c.razaoSocial || '').trim();
              return nome ? { value: nome, label: nome } : null;
            })
            .filter((x): x is { value: string; label: string } => !!x);
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
        error: () => {
          this.clientesCadastro = [];
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
      });

    this.fornecedorCadastroService
      .listar({ idEmpresa: idEmp, ativo: true, page: 0, size: 500, sort: 'razaoSocial,asc' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.fornecedoresCadastro = (page.content || [])
            .map((f) => {
              const nome = (f.nomeFantasia || '').trim() || (f.razaoSocial || '').trim();
              return nome ? { value: nome, label: nome } : null;
            })
            .filter((x): x is { value: string; label: string } => !!x);
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
        error: () => {
          this.fornecedoresCadastro = [];
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
      });

    this.funcionarioCadastroService
      .listar({ idEmpresa: idEmp, ativo: true, page: 0, size: 500, sort: 'nomeCompleto,asc' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.funcionariosCadastro = page.content || [];
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
        error: () => {
          this.funcionariosCadastro = [];
          this.atualizarOpcoesParceiroCadastro(
            this.novoLancamento.tipo,
            this.novoLancamento.tipo === 'despesa' ? this.novoLancamento.tipoMovimentoDespesa : 'fornecedor'
          );
        },
      });
  }

  private atualizarOpcoesParceiroCadastro(
    tipo: 'receita' | 'despesa',
    despesaParceiroModo: 'fornecedor' | 'funcionario' | 'impostos' = 'fornecedor'
  ): void {
    if (tipo === 'receita') {
      this.parceirosCadastroTipo = this.clientesCadastro
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      return;
    }
    if (despesaParceiroModo === 'funcionario') {
      this.parceirosCadastroTipo = this.funcionariosCadastro
        .map((f) => {
          const label = (f.nomeCompleto || '').trim() || `Funcionário #${f.id}`;
          return { value: `__func__:${f.id}`, label };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      return;
    }
    this.parceirosCadastroTipo = this.fornecedoresCadastro
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  private obterContaFinalCadastro(): string {
    if (this.novoLancamento.contaOpcao === '__manual__') {
      return this.novoLancamento.contaManual.trim();
    }
    const contaId = this.novoLancamento.contaOpcao.trim();
    if (!contaId) {
      return '';
    }
    return this.rotuloContaPorId.get(contaId) || this.novoLancamento.contaManual.trim() || '';
  }

  private obterContaDestinoBcFinal(): string {
    if (this.novoLancamento.bcTransferDestinoContaOpcao === '__manual__') {
      return (this.novoLancamento.bcTransferDestinoContaManual || '').trim();
    }
    const id = (this.novoLancamento.bcTransferDestinoContaOpcao || '').trim();
    if (!id) {
      return '';
    }
    return this.rotuloContaPorId.get(id) || (this.novoLancamento.bcTransferDestinoContaManual || '').trim() || '';
  }

  private contaBcSelecionadaValida(opcao: string, manual: string): boolean {
    const o = (opcao || '').trim();
    if (!o) {
      return false;
    }
    if (o === '__manual__') {
      return !!(manual || '').trim();
    }
    return true;
  }

  private contasTransferenciaOrigemDestinoMesma(): boolean {
    const o = (this.novoLancamento.contaOpcao || '').trim();
    const d = (this.novoLancamento.bcTransferDestinoContaOpcao || '').trim();
    if (!o || !d) {
      return false;
    }
    if (o === '__manual__' && d === '__manual__') {
      return (this.novoLancamento.contaManual || '').trim() === (this.novoLancamento.bcTransferDestinoContaManual || '').trim();
    }
    return o === d;
  }

  private competenciaMesAnoParaData(valor: string): string {
    const v = (valor || '').trim();
    if (!v) return '';
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (!m) return '';
    return `${m[1]}-${m[2]}-01`;
  }

  private competenciaMesAnoDeData(valor: string): string {
    const v = (valor || '').trim();
    if (!v) return '';
    const m = /^(\d{4})-(\d{2})/.exec(v);
    if (!m) return '';
    return `${m[1]}-${m[2]}`;
  }

  cadastroTemParceiros(): boolean {
    return this.parceirosCadastroTipo.length > 0;
  }

  movimentacaoEditandoAtual(): MovimentacaoFinanceira | null {
    const id = this.editandoMovimentacaoId;
    if (!id) {
      return null;
    }
    return this.movimentacoes.find((m) => m.IdMovimentacaoFinanceiraParcela === id) || null;
  }

  private parseValorBr(valor: string): number {
    const normalizado = String(valor || '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
  }

  private formatarValorBrEmDigitacao(valor: string): string {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (!digitos) {
      return '';
    }
    const numero = Number(digitos) / 100;
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numero);
  }

  // ===== Carregamento de Dados =====
  carregarMovimentacoes(): void {
    // Validação básica de intervalo de datas quando ambos estiverem preenchidos
    if (this.dataInicial && this.dataFinal) {
      const inicio = this.parseLocalDateStr(this.dataInicial);
      const fim = this.parseLocalDateStr(this.dataFinal);
      if (inicio > fim) {
        this.validationError = 'A data inicial não pode ser maior que a data final.';
        this.loading = false;
        return;
      }
    }

    this.loading = true;
    this.error = null;
    this.validationError = null;

    this.carregarMovimentacoesErp();
  }

  private carregarMovimentacoesErp(): void {
    // Garante que temos datas preenchidas (mês atual como padrão)
    if (!this.dataInicial || !this.dataFinal) {
      this.preencherMesAtual();
    }

    // Prepara filtros - agora inclui filtros de UI também
    const statusPagamento = this.filtrosUI.status === 'quitado' ? 'recebido' as const
      : this.filtrosUI.status === 'pendente' ? 'pendente' as const : undefined;
    const filtros: FiltrosMovimentacoes = {
      ...this.filtros,
      dataInicio: this.dataInicial || undefined,
      dataTermino: this.dataFinal || undefined,
      categoria: this.filtrosUI.categoria || undefined,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      statusPagamento,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      orderBy: this.sortBy || undefined,
      orderDirection: this.sortBy ? this.sortOrder : undefined,
      numeroDaPagina: this.paginaAtual,
      itensPorPagina: this.itensPorPagina
    };

    this.erpFinanceiroService.buscarMovimentacoes(filtros)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.processarRespostaErp(response);
        },
        error: (err: any) => {
          this.error = this.obterMensagemErro(err, 'Não foi possível carregar as movimentações.');
          this.loading = false;
        }
      });
  }

  /**
   * Gera chave única para cache baseada no período de datas
   */
  private gerarChaveCache(): string {
    const inicio = this.dataInicial || 'sem_data';
    const fim = this.dataFinal || 'sem_data';
    return `${inicio}_${fim}`;
  }

  /**
   * Verifica se há cache válido para o período atual
   */
  private obterCache(): { data: MovimentacaoFinanceira[], totais: any } | null {
    const chave = this.gerarChaveCache();
    const cached = this.cacheMovimentacoes.get(chave);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return { data: cached.data, totais: cached.totais };
    }
    
    return null;
  }

  /**
   * Armazena dados no cache
   */
  private armazenarCache(data: MovimentacaoFinanceira[], totais: any): void {
    const chave = this.gerarChaveCache();
    this.cacheMovimentacoes.set(chave, {
      data: [...data], // Cópia para evitar mutação
      timestamp: Date.now(),
      totais: { ...totais }
    });
    this.cacheKeyAtual = chave;
  }

  /**
   * Busca memoizada local - filtra dados em cache sem fazer requisição
   */
  private buscarLocalMemoizada(filtros: FiltrosMovimentacoesOmie): MovimentacaoFinanceira[] {
    const cached = this.obterCache();
    if (!cached) {
      return []; // Sem cache, precisa buscar do servidor
    }

    
    let resultado = [...cached.data];

    // Aplica filtros localmente
    if (filtros.tipo) {
      const isReceita = filtros.tipo === 'receita';
      resultado = resultado.filter(mov => isReceita ? !mov.Debito : mov.Debito);
    }

    if (filtros.categoria) {
      resultado = resultado.filter(mov => 
        mov.NomeCategoriaFinanceira === filtros.categoria
      );
    }

    if (filtros.textoPesquisa) {
      const texto = filtros.textoPesquisa.toLowerCase();
      resultado = resultado.filter(mov => 
        (mov.Nome && mov.Nome.toLowerCase().includes(texto)) ||
        (mov.NomeClienteFornecedor && mov.NomeClienteFornecedor.toLowerCase().includes(texto)) ||
        (mov.Observacao && mov.Observacao.toLowerCase().includes(texto))
      );
    }

    const status = (filtros as FiltrosMovimentacoesOmie & { status?: string }).status;
    if (status === 'pendente') {
      resultado = resultado.filter(mov => !(mov as any).DataQuitacao);
    } else if (status === 'quitado') {
      resultado = resultado.filter(mov => !!(mov as any).DataQuitacao);
    }

    return resultado;
  }

  private carregarMovimentacoesOmie(): void {
    const filtros: FiltrosMovimentacoesOmie & { status?: string } = {
      dataInicio: this.dataInicial || undefined,
      dataFim: this.dataFinal || undefined,
      pagina: this.paginaAtual,
      registrosPorPagina: this.itensPorPagina,
      tipo: (this.filtrosUI.tipo === 'receita' || this.filtrosUI.tipo === 'despesa') ? this.filtrosUI.tipo : undefined,
      categoria: this.filtrosUI.categoria || undefined,
      textoPesquisa: this.filtrosUI.textoPesquisa || undefined,
      status: this.filtrosUI.status || undefined
    };

    // ESTRATÉGIA 1: Cache Agressivo (Anti-Block)
    // Se temos cache válido e apenas filtros de UI mudaram (não período), busca localmente
    const temCacheValido = this.obterCache() !== null;
    const periodoMudou = this.cacheKeyAtual !== this.gerarChaveCache();
    
    // Se período não mudou e temos cache, busca localmente (sem requisição ao servidor)
    if (temCacheValido && !periodoMudou) {
      const resultadoLocal = this.buscarLocalMemoizada(filtros);
      this.movimentacoesFiltradasCompleta = resultadoLocal;
      // Aplica paginação local (slice será aplicado na exibição após ordenação)
      const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
      const fim = inicio + this.itensPorPagina;
      this.movimentacoes = resultadoLocal.slice(inicio, fim);
      this.aplicarFiltrosUI();
      this.totalItens = resultadoLocal.length;
      this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
      
      // Usa totais do cache
      const cached = this.obterCache();
      if (cached?.totais) {
        this.totalReceitasGeral = cached.totais.totalReceitas ?? 0;
        this.totalDespesasGeral = cached.totais.totalDespesas ?? 0;
        this.saldoLiquidoGeral = cached.totais.saldoLiquido ?? 0;
      } else {
        // Se não tem totais no cache, calcula localmente
        let totalReceitas = 0;
        let totalDespesas = 0;
        resultadoLocal.forEach(mov => {
          if (mov.Debito) {
            totalDespesas += mov.Valor || 0;
          } else {
            totalReceitas += mov.Valor || 0;
          }
        });
        this.totalReceitasGeral = totalReceitas;
        this.totalDespesasGeral = totalDespesas;
        this.saldoLiquidoGeral = totalReceitas - totalDespesas;
      }
      
      this.loading = false;
      return;
    }

    // Se período mudou ou não há cache, busca do servidor
    this.loading = true;
    this.error = null;

    // Remove filtros de UI da requisição se temos cache (para buscar todos os dados)
    const filtrosServidor: FiltrosMovimentacoesOmie = temCacheValido && !periodoMudou
      ? {
          dataInicio: this.dataInicial || undefined,
          dataFim: this.dataFinal || undefined,
          pagina: 1,
          registrosPorPagina: 500 // Busca máximo para cache completo
        }
      : filtros;

    this.omieService.pesquisarMovimentacoes(filtrosServidor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.processarRespostaOmie(response);
          // Cache já é armazenado dentro de processarRespostaOmie
        },
        error: (err) => {
          this.error = this.obterMensagemErro(err, 'Não foi possível carregar as movimentações.');
          this.loading = false;
        }
      });
  }

  private processarRespostaErp(response: any): void {
    this.movimentacoesFiltradasCompleta = [];
    this.movimentacoes = response.movimentacoes || [];
    
    // Obtém o total de itens da resposta
    if (response.total !== undefined && response.total !== null) {
      this.totalItens = response.total;
    } else if (response.paginacao && response.paginacao.totalItens !== undefined) {
      this.totalItens = response.paginacao.totalItens;
    } else {
      this.totalItens = this.movimentacoes.length;
    }
    
    // Atualiza totais agregados (calculados de todas as páginas, sempre precisos)
    this.totalReceitasGeral = response.totalReceitas !== undefined ? response.totalReceitas : 0;
    this.totalDespesasGeral = response.totalDespesas !== undefined ? response.totalDespesas : 0;
    this.saldoLiquidoGeral = response.saldoLiquido !== undefined ? response.saldoLiquido : 
                              (this.totalReceitasGeral !== null && this.totalDespesasGeral !== null ? 
                               this.totalReceitasGeral - this.totalDespesasGeral : 0);
    
    // Usa o itensPorPagina retornado pelo backend se disponível
    if (response.paginacao && response.paginacao.itensPorPagina) {
      this.itensPorPagina = response.paginacao.itensPorPagina;
    }
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Extrai categorias únicas
    this.extrairCategorias();
    this.extrairContasBancarias();
    
    // Garante que filtros locais (tipo/categoria/pesquisa) também sejam aplicados
    this.aplicarFiltrosUI();
    
    this.loading = false;
  }

  private processarRespostaOmie(response: MovimentacoesOmieResponse): void {
    this.movimentacoesFiltradasCompleta = [];
    // Normaliza movimentações do OMIE para o formato esperado
    const movimentacoesOmie = response.movimentacoes || [];
    const movimentacoesNormalizadas = movimentacoesOmie.map(mov => this.normalizarMovimentacaoOmie(mov));
    
    
    // Obtém o total de itens
    this.totalItens = response.total !== undefined ? response.total : movimentacoesNormalizadas.length;
    
    // Obtém totais agregados da resposta do backend (já calculados de todas as movimentações)
    // O backend agora retorna totalReceitas, totalDespesas e saldoLiquido
    const responseAny = response as any;
    if (responseAny.totalReceitas !== undefined && responseAny.totalReceitas !== null) {
      this.totalReceitasGeral = Number(responseAny.totalReceitas);
      this.totalDespesasGeral = responseAny.totalDespesas !== undefined && responseAny.totalDespesas !== null 
        ? Number(responseAny.totalDespesas) : 0;
      this.saldoLiquidoGeral = responseAny.saldoLiquido !== undefined && responseAny.saldoLiquido !== null
        ? Number(responseAny.saldoLiquido)
        : (this.totalReceitasGeral !== null && this.totalDespesasGeral !== null 
           ? this.totalReceitasGeral - this.totalDespesasGeral : 0);
      
    } else {
      // Fallback: calcula apenas da página atual se backend não retornar os totais
      this.calcularTotaisOmie(movimentacoesOmie);
    }
    
    // Armazena todos os dados normalizados no cache (não apenas a página atual)
    // Isso permite busca local e filtros sem requisições adicionais
    const totais = {
      totalReceitas: this.totalReceitasGeral,
      totalDespesas: this.totalDespesasGeral,
      saldoLiquido: this.saldoLiquidoGeral
    };
    this.armazenarCache(movimentacoesNormalizadas, totais);
    
    // Aplica paginação para exibição
    const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
    const fim = inicio + this.itensPorPagina;
    this.movimentacoes = movimentacoesNormalizadas.slice(inicio, fim);
    
    this.totalPaginas = Math.ceil(this.totalItens / this.itensPorPagina);
    
    // Extrai categorias únicas (de todos os dados, não apenas da página)
    this.extrairCategorias();
    this.extrairContasBancarias();
    
    // Reaplica filtros locais para garantir consistência visual
    this.aplicarFiltrosUI();
    
    this.loading = false;
  }

  private normalizarMovimentacaoOmie(mov: MovimentacaoOmie): any {
    // Normaliza dados do OMIE (endpoint MF) para o formato esperado pelo componente
    const debito = mov.debito !== undefined ? mov.debito : (mov['tipo'] === 'DESPESA' || mov['natureza'] === 'P');
    
    // Prioriza valor_documento para títulos não liquidados, depois valor_liquido para liquidados
    // Se liquidado, usa valor_liquido; senão, usa valor_documento ou valor_aberto
    const isLiquidado = mov['liquidado'] === 'S' || mov['liquidado'] === true;
    let valor = 0;
    
    if (isLiquidado) {
      // Para títulos liquidados, prioriza valor_liquido
      valor = mov['valor_liquido'] ?? 
              mov['valor_pago'] ?? 
              mov['valor_documento'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    } else {
      // Para títulos não liquidados, prioriza valor_documento ou valor_aberto
      valor = mov['valor_documento'] ?? 
              mov['valor_aberto'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    }
    
    // Se ainda for 0, tenta qualquer campo disponível como último recurso
    if (valor === 0) {
      valor = mov['valor_liquido'] ?? 
              mov['valor_pago'] ?? 
              mov['valor_aberto'] ?? 
              (mov['_detalhes']?.['nValorTitulo'] ?? 0);
    }
    
    // Extrai nome do cliente/fornecedor (pode vir de diferentes campos)
    const nomeClienteFornecedor = mov['nome_cliente_fornecedor'] || 
                                  mov['nome_fantasia_cliente_fornecedor'] || 
                                  mov['razao_social_cliente_fornecedor'] || 
                                  '';
    
    // Extrai categoria (pode vir de categorias array ou campo direto)
    let categoria = mov['categoria'] || mov['codigo_categoria'] || 'Sem categoria';
    if (mov['categorias'] && Array.isArray(mov['categorias']) && mov['categorias'].length > 0) {
      const primeiraCategoria = mov['categorias'][0];
      categoria = primeiraCategoria['cCodCateg'] || primeiraCategoria['codigo_categoria'] || categoria;
    }
    
    // Extrai número da parcela (pode vir de numero_parcela, _detalhes.cNumParcela ou _movimento_completo.detalhes.cNumParcela)
    let numeroParcela = mov['numero_parcela'] || '';
    let quantidadeParcela: number | undefined = undefined;
    
    // Tenta extrair de _detalhes.cNumParcela (formato: "004/013")
    if (!numeroParcela && mov['_detalhes'] && mov['_detalhes']['cNumParcela']) {
      const parcelaStr = mov['_detalhes']['cNumParcela'];
      const partes = parcelaStr.split('/');
      if (partes.length === 2) {
        // Remove zeros à esquerda, mas mantém pelo menos um dígito
        const numParcela = parseInt(partes[0], 10);
        numeroParcela = isNaN(numParcela) ? partes[0] : numParcela.toString();
        quantidadeParcela = parseInt(partes[1], 10) || undefined;
      } else {
        numeroParcela = parcelaStr;
      }
    }
    
    // Tenta extrair de _movimento_completo.detalhes.cNumParcela como fallback
    if (!numeroParcela && mov['_movimento_completo'] && mov['_movimento_completo']['detalhes'] && mov['_movimento_completo']['detalhes']['cNumParcela']) {
      const parcelaStr = mov['_movimento_completo']['detalhes']['cNumParcela'];
      const partes = parcelaStr.split('/');
      if (partes.length === 2) {
        // Remove zeros à esquerda, mas mantém pelo menos um dígito
        const numParcela = parseInt(partes[0], 10);
        numeroParcela = isNaN(numParcela) ? partes[0] : numParcela.toString();
        quantidadeParcela = parseInt(partes[1], 10) || undefined;
      } else {
        numeroParcela = parcelaStr;
      }
    }
    
    // Status do título
    const status = mov['status_titulo'] || mov['status'] || mov['_detalhes']?.['cStatus'] || '';
    
    // Forma de pagamento (prioriza nome_forma_pagamento, depois tipo_documento)
    const formaPagamento = mov['nome_forma_pagamento'] || mov['tipo_documento'] || '';
    
    return {
      IdMovimentacaoFinanceiraParcela: mov['codigo_lancamento_omie'] || mov['codigo_lancamento_integracao'] || '',
      Debito: debito,
      DataVencimento: mov['data_vencimento'] || mov['data_pagamento'] || mov['data_previsao'] || '',
      DataCompetencia: mov['data_emissao'] || mov['data_pagamento'] || mov['data_registro'] || mov['data_vencimento'] || '',
      DataQuitacao: mov['data_pagamento'] || undefined,
      Valor: valor,
      Nome: mov['numero_documento'] || mov['numero_documento_fiscal'] || mov['numero_pedido'] || 'Movimentação OMIE',
      Observacao: mov['observacao'] || mov['numero_documento'] || '',
      NomeClienteFornecedor: nomeClienteFornecedor,
      NomeFantasiaClienteFornecedor: mov['nome_fantasia_cliente_fornecedor'] || nomeClienteFornecedor,
      RazaoSocialClienteFornecedor: mov['razao_social_cliente_fornecedor'] || '',
      NomeCategoriaFinanceira: categoria,
      Status: status,
      NumeroParcela: numeroParcela,
      QuantidadeParcela: quantidadeParcela,
      NumeroDocumento: mov['numero_documento'] || '',
      NumeroPedido: mov['numero_pedido'] || '',
      NumeroDocumentoFiscal: mov['numero_documento_fiscal'] || '',
      NomeFormaPagamento: formaPagamento,
      CodigoClienteFornecedor: mov['codigo_cliente_fornecedor'] || '',
      CPFCNPJCliente: mov['cpf_cnpj_cliente'] || '',
      tipo: mov['tipo'] || (debito ? 'DESPESA' : 'RECEITA'),
      // Campos adicionais do endpoint MF
      ValorPago: mov['valor_pago'] || 0,
      ValorAberto: mov['valor_aberto'] || 0,
      ValorDesconto: mov['valor_desconto'] || 0,
      ValorJuros: mov['valor_juros'] || 0,
      ValorMulta: mov['valor_multa'] || 0,
      ValorLiquido: mov['valor_liquido'] || valor,
      Liquidado: mov['liquidado'] === 'S',
      // Campos originais do OMIE preservados
      _omieData: mov
    };
  }

  private calcularTotaisOmie(movimentacoes: MovimentacaoOmie[]): void {
    let totalReceitas = 0;
    let totalDespesas = 0;

    movimentacoes.forEach(mov => {
      const valor = mov['valor_documento'] || mov['valor_pago'] || 0;
      const isDebito = mov.debito !== undefined ? mov.debito : (mov['tipo'] === 'DESPESA');
      
      if (isDebito) {
        totalDespesas += valor;
      } else {
        totalReceitas += valor;
      }
    });

    this.totalReceitasGeral = totalReceitas;
    this.totalDespesasGeral = totalDespesas;
    this.saldoLiquidoGeral = totalReceitas - totalDespesas;
    
  }

  private aplicarFiltrosUI(): void {
    let filtradas = [...this.movimentacoes];

    // Filtro por tipo (receita/despesa)
    if (this.filtrosUI.tipo) {
      filtradas = filtradas.filter(mov => {
        const isReceita = !mov.Debito;
        const isDespesa = !!mov.Debito;
        return this.filtrosUI.tipo === 'receita' ? isReceita : isDespesa;
      });
    }

    // Filtro por categoria
    if (this.filtrosUI.categoria) {
      const categoriaSelecionada = this.filtrosUI.categoria.toLowerCase();
      filtradas = filtradas.filter(mov => {
        const nomeCategoria = this.categoriaExibicao(mov).toLowerCase();
        const categoriaRoot = (mov.Valores?.[0]?.NomeCategoriaRoot || '').toLowerCase();
        return nomeCategoria === categoriaSelecionada || categoriaRoot === categoriaSelecionada;
      });
    }

    // Filtro por conta bancária
    if (this.filtrosUI.conta) {
      const contaSelecionada = this.filtrosUI.conta.toLowerCase();
      filtradas = filtradas.filter(mov => {
        const idConta = String((mov as any).IdContaFinanceira ?? '').toLowerCase();
        const nomeConta = String((mov as any).NomeContaFinanceira ?? '').toLowerCase();
        return idConta === contaSelecionada || nomeConta === contaSelecionada;
      });
    }

    // Filtro por status (pendente / quitado)
    if (this.filtrosUI.status) {
      filtradas = filtradas.filter(mov => {
        const quitado = !!(mov as any).DataQuitacao;
        return this.filtrosUI.status === 'quitado' ? quitado : !quitado;
      });
    }

    // Filtro por texto de pesquisa
    if (this.filtrosUI.textoPesquisa) {
      const texto = this.filtrosUI.textoPesquisa.toLowerCase();
      filtradas = filtradas.filter(mov => 
        (mov.Nome && mov.Nome.toLowerCase().includes(texto)) ||
        this.nomeParceiroExibicao(mov).toLowerCase().includes(texto) ||
        this.categoriaExibicao(mov).toLowerCase().includes(texto) ||
        (mov.Observacao && mov.Observacao.toLowerCase().includes(texto))
      );
    }

    this.movimentacoesFiltradas = filtradas;
  }

  // ===== Filtros =====
  // Os filtros agora são aplicados no backend, então quando mudarem, recarrega os dados
  onFiltroChange(): void {
    this.paginaAtual = 1; // Volta para primeira página ao mudar filtro
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  /**
   * Atalho para aplicar filtro de tipo a partir dos cards de resumo.
   * Se o tipo já estiver selecionado, limpa o filtro (toggle).
   */
  aplicarFiltroTipo(tipo: 'receita' | 'despesa'): void {
    this.filtrosUI.tipo = this.filtrosUI.tipo === tipo ? '' : tipo;
    this.paginaAtual = 1;
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  onTextoPesquisaChange(texto: string): void {
    // Atualiza o filtro e recarrega (com debounce já aplicado pelo subject)
    this.filtrosUI.textoPesquisa = texto;
    this.paginaAtual = 1; // Volta para primeira página ao pesquisar
    this.aplicarFiltrosUI();
    this.textoPesquisaSubject.next(texto);
  }

  limparFiltros(): void {
    this.filtrosUI = {
      categoria: '',
      conta: '',
      tipo: '',
      status: '',
      textoPesquisa: ''
    };
    this.origemNavegacao = null;
    this.dataInicial = '';
    this.dataFinal = '';
    this.paginaAtual = 1;
    this.validationError = null;
    this.painelAnexoMovId = null;
    this.anexoDragOver = false;
    this.anexoDragDepth = 0;
    this.aplicarFiltrosUI();
    this.carregarMovimentacoes();
  }

  idMovimentacao(mov: MovimentacaoFinanceira): string {
    const raw = (mov as any).IdMovimentacaoFinanceiraParcela;
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      return String(raw);
    }
    const nome = (mov.Nome || '').slice(0, 48);
    return `local_${mov.DataVencimento}_${mov.Debito ? 'D' : 'R'}_${mov.Valor}_${nome}`;
  }

  empresaIdAtual(): number | null {
    return this.companySelectorService.obterEmpresaSelecionada()?.idEmpresa ?? null;
  }

  anexosDoMovimento(mov: MovimentacaoFinanceira) {
    return this.movimentacoesAnexosService.obterAnexos(this.empresaIdAtual(), this.idMovimentacao(mov));
  }

  temAnexo(mov: MovimentacaoFinanceira, tipo: TipoAnexoMovimentacao): boolean {
    return !!this.anexosDoMovimento(mov)[tipo];
  }

  obterAnexo(mov: MovimentacaoFinanceira, tipo: TipoAnexoMovimentacao): AnexoMovimentacaoMetadado | undefined {
    return this.anexosDoMovimento(mov)[tipo];
  }

  painelAnexoAbertoPara(mov: MovimentacaoFinanceira): boolean {
    return this.painelAnexoMovId === this.idMovimentacao(mov);
  }

  alternarPainelAnexo(mov: MovimentacaoFinanceira, tipo: TipoAnexoMovimentacao, event?: Event): void {
    event?.stopPropagation();
    const id = this.idMovimentacao(mov);
    if (this.painelAnexoMovId === id) {
      this.tipoAnexoAlvo = tipo;
      return;
    }
    this.painelAnexoMovId = id;
    this.tipoAnexoAlvo = tipo;
  }

  fecharPainelAnexo(): void {
    this.painelAnexoMovId = null;
    this.anexoDragOver = false;
    this.anexoDragDepth = 0;
  }

  selecionarTipoAnexoAlvo(tipo: TipoAnexoMovimentacao): void {
    this.tipoAnexoAlvo = tipo;
  }

  labelTipoAnexoAlvo(): string {
    return this.tiposAnexoLista.find(t => t.id === this.tipoAnexoAlvo)?.labelCompleto ?? 'Anexo';
  }

  onDragEnterPainel(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.anexoDragDepth++;
    this.anexoDragOver = true;
  }

  onDragLeavePainel(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.anexoDragDepth = Math.max(0, this.anexoDragDepth - 1);
    if (this.anexoDragDepth === 0) {
      this.anexoDragOver = false;
    }
  }

  onDragOverPainel(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDropPainel(event: DragEvent, mov: MovimentacaoFinanceira): void {
    event.preventDefault();
    event.stopPropagation();
    this.anexoDragDepth = 0;
    this.anexoDragOver = false;
    const files = event.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    this.movimentacoesAnexosService.salvarAnexo(
      this.empresaIdAtual(),
      this.idMovimentacao(mov),
      this.tipoAnexoAlvo,
      files[0]
    );
  }

  aoSelecionarArquivoPainel(event: Event, mov: MovimentacaoFinanceira): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.movimentacoesAnexosService.salvarAnexo(
        this.empresaIdAtual(),
        this.idMovimentacao(mov),
        this.tipoAnexoAlvo,
        file
      );
    }
    input.value = '';
  }

  removerAnexoMov(mov: MovimentacaoFinanceira, tipo: TipoAnexoMovimentacao): void {
    this.movimentacoesAnexosService.removerAnexo(this.empresaIdAtual(), this.idMovimentacao(mov), tipo);
  }

  formatarTamanhoArquivo(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '—';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  extrairCategorias(): void {
    const categoriasSet = new Set<string>();
    categoriasSet.add('');

    // Usa dados do cache completo se disponível, senão usa apenas da página atual
    const dadosParaExtrair = this.obterCache()?.data || this.movimentacoes;

    dadosParaExtrair.forEach(mov => {
      const categoriaRoot = this.extrairCategoriaRoot(mov);
      if (categoriaRoot) {
        categoriasSet.add(categoriaRoot);
      }
    });

    this.categorias = [
      { value: '', label: 'Todas as Categorias' },
      ...Array.from(categoriasSet)
        .filter(c => c !== '')
        .sort()
        .map(c => ({ value: c, label: c }))
    ];
  }

  /**
   * Carrega contas cadastradas para exibir nome/descrição no filtro (em vez de só ID ou número cru).
   */
  private carregarMapaNomesContasCadastro(): void {
    const idEmp = this.empresaIdAtual();
    this.rotuloContaPorId.clear();
    this.rotuloContaPorNumeroConta.clear();
    if (!idEmp) {
      this.extrairContasBancarias();
      return;
    }
    this.contaBancariaCadastroService
      .listar({ idEmpresa: idEmp, page: 0, size: 500, ativo: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          for (const c of page.content || []) {
            const nome =
              (c.nomeConta && c.nomeConta.trim()) ||
              [c.instituicao, c.banco].filter((x) => !!x && String(x).trim()).join(' · ') ||
              'Conta';
            const agConta = [c.agencia, c.conta].filter((x) => !!x && String(x).trim()).join(' / ');
            const label = agConta ? `${nome} (${agConta})` : nome;
            this.rotuloContaPorId.set(String(c.id), label);
            if (c.conta?.trim()) {
              this.rotuloContaPorNumeroConta.set(c.conta.trim(), label);
            }
          }
          this.extrairContasBancarias();
        },
        error: () => this.extrairContasBancarias(),
      });
  }

  private rotuloContaBancariaDisplay(value: string, nomeMov: string): string {
    const porId = this.rotuloContaPorId.get(value);
    if (porId) {
      return porId;
    }
    const nt = (nomeMov || '').trim();
    if (nt) {
      const porNumero = this.rotuloContaPorNumeroConta.get(nt);
      if (porNumero) {
        return porNumero;
      }
    }
    return nt || `Conta ${value}`;
  }

  extrairContasBancarias(): void {
    const contas = new Map<string, string>();
    const dadosParaExtrair = this.obterCache()?.data || this.movimentacoes;

    dadosParaExtrair.forEach((mov: any) => {
      const idConta = mov?.IdContaFinanceira;
      const nomeConta = (mov?.NomeContaFinanceira || '').trim();
      if (!nomeConta && (idConta == null || String(idConta).trim() === '')) {
        return;
      }
      const value = idConta != null && String(idConta).trim() !== ''
        ? String(idConta)
        : nomeConta.toLowerCase();
      const label = this.rotuloContaBancariaDisplay(value, nomeConta);
      if (!contas.has(value)) {
        contas.set(value, label);
      }
    });

    this.rotuloContaPorId.forEach((label, id) => {
      if (!contas.has(id)) {
        contas.set(id, label);
      }
    });

    this.contasBancarias = [
      { value: '', label: 'Todas as contas' },
      ...Array.from(contas.entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([value, label]) => ({ value, label }))
    ];
  }

  extrairCategoriaRoot(mov: MovimentacaoFinanceira): string {
    return this.categoriaExibicao(mov);
  }

  // ===== Paginação =====
  irParaPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaAtual = pagina;
      this.filtros.numeroDaPagina = pagina;
      this.carregarMovimentacoes();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  proximaPagina(): void {
    if (this.paginaAtual < this.totalPaginas) {
      this.irParaPagina(this.paginaAtual + 1);
    }
  }

  getPaginasVisiveis(): number[] {
    const paginas: number[] = [];
    const maxPaginas = 5;
    let inicio = Math.max(1, this.paginaAtual - Math.floor(maxPaginas / 2));
    let fim = Math.min(this.totalPaginas, inicio + maxPaginas - 1);
    
    if (fim - inicio < maxPaginas - 1) {
      inicio = Math.max(1, fim - maxPaginas + 1);
    }
    
    for (let i = inicio; i <= fim; i++) {
      paginas.push(i);
    }
    
    return paginas;
  }

  get Math() {
    return Math;
  }

  paginaAnterior(): void {
    if (this.paginaAtual > 1) {
      this.irParaPagina(this.paginaAtual - 1);
    }
  }

  // ===== Date Range Picker =====
  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.tempRangeStart = null;
      this.tempRangeEnd = null;
      this.hoverRangeDate = null;
      this.visibleMonth = new Date();
      this.buildCalendar();
    }
  }

  cancelRangePicker(): void {
    this.mostrarRangePicker = false;
  }

  applyRangePicker(): void {
    if (this.tempRangeStart) {
      const rangeEnd = this.tempRangeEnd ?? this.tempRangeStart; // permite selecionar apenas um dia
      const a = this.tempRangeStart <= rangeEnd ? this.tempRangeStart : rangeEnd;
      const b = this.tempRangeStart <= rangeEnd ? rangeEnd : this.tempRangeStart;
      
      this.dataInicial = a;
      this.dataFinal = b;
      
      this.paginaAtual = 1;
      this.carregarMovimentacoes();
    }
    this.mostrarRangePicker = false;
  }

  clearRange(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
    
    const periodoMudou = this.dataInicial !== '' || this.dataFinal !== '';
    this.dataInicial = '';
    this.dataFinal = '';
    
    // Limpa cache se período mudou
    if (periodoMudou) {
      this.cacheMovimentacoes.clear();
      this.cacheKeyAtual = '';
    }
    
    this.paginaAtual = 1;
    this.carregarMovimentacoes();
  }

  prevMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() - 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  nextMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() + 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  getMonthYearLabel(): string {
    return this.visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  private buildCalendar(): void {
    const year = this.visibleMonth.getFullYear();
    const month = this.visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: Array<{ day: number, inCurrentMonth: boolean, dateStr: string }> = [];

    for (let i = startWeekDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({ day: d, inCurrentMonth: true, dateStr: this.dateToStr(date) });
    }

    while (days.length % 7 !== 0) {
      const nextIndex = days.length - (startWeekDay) - daysInMonth + 1;
      const date = new Date(year, month + 1, nextIndex);
      days.push({ day: date.getDate(), inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    this.calendarDays = days;
  }

  private dateToStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Interpreta YYYY-MM-DD como data local (evita 1 dia a menos por UTC). */
  private parseLocalDateStr(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
      return;
    }
    if (this.tempRangeStart && !this.tempRangeEnd) {
      this.tempRangeEnd = dateStr;
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  isStart(dateStr: string): boolean {
    return !!this.tempRangeStart && this.tempRangeStart === dateStr;
  }

  isEnd(dateStr: string): boolean {
    return !!this.tempRangeEnd && this.tempRangeEnd === dateStr;
  }

  isBetween(dateStr: string): boolean {
    const start = this.tempRangeStart;
    const end = this.tempRangeEnd || this.hoverRangeDate;
    if (!start || !end) return false;
    const a = start <= end ? start : end;
    const b = start <= end ? end : start;
    return dateStr > a && dateStr < b;
  }

  // ===== Cálculos =====
  getTotalReceitas(): number {
    // Retorna o total geral de receitas (de todas as movimentações, não apenas da página atual)
    // Se não houver total geral disponível, calcula apenas da página atual como fallback
    if (this.totalReceitasGeral !== null && this.totalReceitasGeral !== undefined) {
      return this.totalReceitasGeral;
    }
    // Fallback: calcula apenas da página atual se não houver total geral
    return this.movimentacoesFiltradas
      .filter(mov => !mov.Debito)
      .reduce((total, mov) => total + (mov.Valor || 0), 0);
  }

  getTotalDespesas(): number {
    // Retorna o total geral de despesas (de todas as movimentações, não apenas da página atual)
    // Se não houver total geral disponível, calcula apenas da página atual como fallback
    if (this.totalDespesasGeral !== null && this.totalDespesasGeral !== undefined) {
      return this.totalDespesasGeral;
    }
    // Fallback: calcula apenas da página atual se não houver total geral
    return this.movimentacoesFiltradas
      .filter(mov => mov.Debito)
      .reduce((total, mov) => total + (mov.Valor || 0), 0);
  }

  getSaldoLiquido(): number {
    // Retorna o saldo líquido geral (de todas as movimentações)
    if (this.saldoLiquidoGeral !== null && this.saldoLiquidoGeral !== undefined) {
      return this.saldoLiquidoGeral;
    }
    // Fallback: calcula a partir dos totais gerais ou da página atual
    return this.getTotalReceitas() - this.getTotalDespesas();
  }

  // ===== Formatação =====
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      // Detecta formato DD/MM/YYYY (formato do OMIE)
      if (dateStr.includes('/') && dateStr.length === 10) {
        const partes = dateStr.split('/');
        if (partes.length === 3) {
          // Converte DD/MM/YYYY para YYYY-MM-DD para o JavaScript parsear corretamente
          const dia = partes[0].padStart(2, '0');
          const mes = partes[1].padStart(2, '0');
          const ano = partes[2];
          const date = new Date(Number(ano), Number(mes) - 1, Number(dia));
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('pt-BR');
          }
        }
      }

      // Trata formatos ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ) sem aplicar fuso horário
      // para evitar o problema de "voltar 1 dia" em timezones negativas.
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const ano = Number(isoMatch[1]);
        const mes = Number(isoMatch[2]);
        const dia = Number(isoMatch[3]);
        const date = new Date(ano, mes - 1, dia);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('pt-BR');
        }
      }

      // Última tentativa: parse padrão
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
      
      // Se não conseguiu parsear, retorna a string original
      return dateStr;
    } catch {
      return dateStr || '';
    }
  }

  formatExtrato(value: number, isDebito: boolean): string {
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(value));
    
    return isDebito ? `-${formatted}` : `+${formatted}`;
  }

  formatarDescricaoResumida(texto: string | null | undefined): string {
    if (!texto) return '-';
    const descricaoLimpa = texto
      .replace(/\s*\(?\s*PARCELA\s+FIXA\s+TODO\s+DIA\s*\d+\s*\)?/gi, '')
      .replace(/\s*\(?\s*PARCELA\s+FIXA\s*\)?/gi, '')
      .replace(/\s*\(?\s*PARCELAMENTO\s+MENSAL\s+EM\s*\d+\s*\)?/gi, '')
      .replace(/\s*\(?\s*PARCELAMENTO\s+MENSAL\s*\)?/gi, '')
      .replace(/\s*no\s+valor\s*r\$\s*.*$/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!descricaoLimpa) return '-';

    const maxChars = 52;
    return descricaoLimpa.length > maxChars
      ? `${descricaoLimpa.slice(0, maxChars).trimEnd()}...`
      : descricaoLimpa;
  }

  formatarClienteFornecedorResumido(texto: string | null | undefined): string {
    if (!texto) return '-';
    return texto
      .replace(/\s*em\s+cliente\/fornecedor/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  nomeParceiroExibicao(mov: MovimentacaoFinanceira): string {
    const parceiroDireto =
      (mov.NomeClienteFornecedor || '').trim() ||
      (mov.NomeFantasiaClienteFornecedor || '').trim() ||
      (mov.RazaoSocialClienteFornecedor || '').trim();

    if (parceiroDireto) {
      return parceiroDireto;
    }

    const descricao = (mov.Nome || '').trim();
    if (descricao) {
      const matchFatura = descricao.match(/fatura\s*n[ºo]?\s*\.?\s*\d+\s+(.+)$/i);
      if (matchFatura?.[1]) {
        return matchFatura[1].trim();
      }
      const partes = descricao.split(' - ').map((p) => p.trim()).filter(Boolean);
      if (partes.length >= 2) {
        return partes[partes.length - 1];
      }
    }

    return '-';
  }

  categoriaExibicao(mov: MovimentacaoFinanceira): string {
    const categoria = (mov.NomeCategoriaFinanceira || '').trim() || (mov.Valores?.[0]?.NomeCategoriaRoot || '').trim();
    if (categoria) {
      return categoria;
    }
    return mov.Debito ? 'OFX - Despesa importada' : 'OFX - Receita importada';
  }

  getParcelaLabel(mov: MovimentacaoFinanceira): string {
    if (mov.NumeroParcela && mov.QuantidadeParcela) {
      return `${mov.NumeroParcela}/${mov.QuantidadeParcela}`;
    }
    return mov.NumeroParcela ? `${mov.NumeroParcela}` : '∞';
  }

  // Labels para os filtros
  getCategoriaLabel(value: string): string {
    const categoria = this.categorias.find(c => c.value === value);
    return categoria ? categoria.label : value;
  }

  getTipoLabel(value: string): string {
    const tipo = this.tipos.find(t => t.value === value);
    return tipo ? tipo.label : value;
  }

  /**
   * Quantidade de filtros atualmente ativos (tipo, categoria, texto e período).
   * Usado apenas para feedback visual na tela.
   */
  getTotalFiltrosAtivos(): number {
    let total = 0;
    if (this.filtrosUI.tipo) total++;
    if (this.filtrosUI.categoria) total++;
    if (this.filtrosUI.conta) total++;
    if (this.filtrosUI.status) total++;
    if (this.filtrosUI.textoPesquisa) total++;
    if (this.dataInicial) total++;
    if (this.dataFinal) total++;
    return total;
  }

  get origemNavegacaoLabel(): string {
    if (!this.origemNavegacao) {
      return '';
    }
    if (this.origemNavegacao === 'fatura') {
      return 'Fatura';
    }
    return this.origemNavegacao;
  }

  abrirModalExportacao(): void {
    this.mostrarModalExportacao = true;
    this.abaExportacaoAtiva = 'identificacao';
    this.hidratarSelecaoExportacao();
  }

  fecharModalExportacao(): void {
    this.mostrarModalExportacao = false;
  }

  get colunasAbaAtiva(): ExportColumnDef[] {
    return this.exportColumns.filter((c) => c.groupId === this.abaExportacaoAtiva);
  }

  colunaSelecionada(colId: string): boolean {
    return this.exportSelectedCols.has(colId);
  }

  alternarColunaExportacao(colId: string): void {
    if (this.exportSelectedCols.has(colId)) {
      this.exportSelectedCols.delete(colId);
    } else {
      this.exportSelectedCols.add(colId);
    }
    this.salvarSelecaoExportacao();
  }

  selecionarTodasAbaAtiva(): void {
    for (const c of this.colunasAbaAtiva) {
      this.exportSelectedCols.add(c.id);
    }
    this.salvarSelecaoExportacao();
  }

  limparAbaAtiva(): void {
    for (const c of this.colunasAbaAtiva) {
      this.exportSelectedCols.delete(c.id);
    }
    this.salvarSelecaoExportacao();
  }

  selecionarPresetEssencial(): void {
    const essenciais = ['idMov', 'descricao', 'tipo', 'dataVenc', 'valor', 'status', 'categoria', 'clienteFornecedor'];
    this.exportSelectedCols = new Set(essenciais);
    this.salvarSelecaoExportacao();
  }

  selecionarTodasColunas(): void {
    this.exportSelectedCols = new Set(this.exportColumns.map((c) => c.id));
    this.salvarSelecaoExportacao();
  }

  get totalColunasSelecionadas(): number {
    return this.exportSelectedCols.size;
  }

  async exportarMovimentacoes(): Promise<void> {
    if (this.totalColunasSelecionadas === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Selecione colunas',
        text: 'Marque pelo menos uma coluna para exportar.',
        confirmButtonColor: '#334155',
      });
      return;
    }

    const colunas = this.exportColumns.filter((c) => this.exportSelectedCols.has(c.id));
    const dadosFonte = this.movimentacoesOrdenadas;
    const linhas = dadosFonte.map((mov, idx) => {
      const row: Record<string, string | number | boolean> = {};
      for (const c of colunas) {
        row[c.label] = c.getter(mov, idx);
      }
      return row;
    });

    if (linhas.length === 0) {
      await Swal.fire({
        icon: 'info',
        title: 'Sem dados para exportar',
        text: 'Não há movimentações no filtro atual.',
        confirmButtonColor: '#334155',
      });
      return;
    }

    try {
      this.exportando = true;
      const sufixo = new Date().toISOString().slice(0, 10);
      if (this.exportFormat === 'xlsx') {
        const sheet = XLSX.utils.json_to_sheet(linhas);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Movimentacoes');
        XLSX.writeFile(wb, `movimentacoes_${sufixo}.xlsx`);
      } else {
        const csv = this.toCsv(linhas, colunas.map((c) => c.label));
        this.downloadBlob(csv, `movimentacoes_${sufixo}.csv`, 'text/csv;charset=utf-8;');
      }
      this.exportando = false;
      this.mostrarModalExportacao = false;
    } catch {
      this.exportando = false;
      await Swal.fire({
        icon: 'error',
        title: 'Falha ao exportar',
        text: 'Não foi possível gerar o arquivo de exportação.',
        confirmButtonColor: '#dc2626',
      });
    }
  }

  private toCsv(rows: Array<Record<string, string | number | boolean>>, headers: string[]): string {
    const escapeCell = (v: unknown): string => {
      const str = String(v ?? '');
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };
    const headerLine = headers.map(escapeCell).join(';');
    const body = rows
      .map((row) => headers.map((h) => escapeCell(row[h])).join(';'))
      .join('\r\n');
    return `${headerLine}\r\n${body}`;
  }

  private downloadBlob(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private hidratarSelecaoExportacao(): void {
    if (this.exportSelectedCols.size > 0) {
      return;
    }
    try {
      const raw = window?.localStorage?.getItem(this.exportStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.exportSelectedCols = new Set(
            parsed.filter((id: unknown) => typeof id === 'string' && this.exportColumns.some((c) => c.id === id))
          );
        }
      }
    } catch {
      // noop
    }
    if (this.exportSelectedCols.size === 0) {
      this.selecionarPresetEssencial();
    }
  }

  private salvarSelecaoExportacao(): void {
    try {
      window?.localStorage?.setItem(this.exportStorageKey, JSON.stringify(Array.from(this.exportSelectedCols)));
    } catch {
      // noop
    }
  }

  /** Lista completa ordenada (todos os itens quando há lista completa; senão só da página atual). */
  get movimentacoesOrdenadas(): MovimentacaoFinanceira[] {
    const list = this.movimentacoesFiltradasCompleta.length > 0
      ? [...this.movimentacoesFiltradasCompleta]
      : [...this.movimentacoesFiltradas];
    if (!this.sortBy) return list;
    const order = this.sortOrder === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      let va: number | string | undefined, vb: number | string | undefined;
      switch (this.sortBy) {
        case 'tipo':
          va = a.Debito ? 'despesa' : 'receita';
          vb = b.Debito ? 'despesa' : 'receita';
          break;
        case 'data':
          va = this.toTimestamp(a.DataVencimento);
          vb = this.toTimestamp(b.DataVencimento);
          break;
        case 'valor':
          va = a.Valor ?? 0;
          vb = b.Valor ?? 0;
          break;
        case 'status':
          va = (a as any).DataQuitacao ? 'quitado' : 'pendente';
          vb = (b as any).DataQuitacao ? 'quitado' : 'pendente';
          break;
        default:
          return 0;
      }
      if (typeof va === 'string' && typeof vb === 'string') return order * (va.localeCompare(vb));
      return order * ((va as number) - (vb as number));
    });
    return list;
  }

  /**
   * Converte diferentes formatos de data para timestamp comparável.
   * Suporta YYYY-MM-DD*, DD/MM/YYYY e fallback para Date nativo.
   */
  private toTimestamp(dateStr: string | null | undefined): number {
    if (!dateStr) return 0;

    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      return new Date(y, m - 1, d).getTime();
    }

    const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      const d = Number(brMatch[1]);
      const m = Number(brMatch[2]);
      const y = Number(brMatch[3]);
      return new Date(y, m - 1, d).getTime();
    }

    const parsed = new Date(dateStr).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /** Fatia da lista ordenada para a página atual (ordena sobre todos os dados quando há lista completa). */
  get movimentacoesParaExibir(): MovimentacaoFinanceira[] {
    const ordenadas = this.movimentacoesOrdenadas;
    if (this.movimentacoesFiltradasCompleta.length > 0) {
      const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
      const fim = inicio + this.itensPorPagina;
      return ordenadas.slice(inicio, fim);
    }
    return ordenadas;
  }

  toggleSort(col: 'tipo' | 'data' | 'valor' | 'status'): void {
    if (this.sortBy === col) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = col;
      this.sortOrder = 'asc';
    }
    this.paginaAtual = 1;
    this.carregarMovimentacoes();
  }

  abrirModalDetalhes(tipo: 'receita' | 'despesa'): void {
    this.tipoModalDetalhes = tipo;
    this.mostrarRangePicker = false;
    this.mostrarModalDetalhes = true;
  }

  fecharModalDetalhes(): void {
    this.mostrarModalDetalhes = false;
  }

  /** Detalhes agregados por categoria para o tipo (receita/despesa) */
  getDetalhesPorCategoria(tipo: 'receita' | 'despesa'): Array<{ nome: string; total: number; quantidade: number }> {
    const fonte = this.obterCache()?.data || this.movimentacoes;
    const isReceita = tipo === 'receita';
    const filtradas = fonte.filter(mov => (mov.Debito ? !isReceita : isReceita));
    const map = new Map<string, { total: number; quantidade: number }>();
    filtradas.forEach(mov => {
      const nome = this.categoriaExibicao(mov) || '(Sem categoria)';
      const cur = map.get(nome) || { total: 0, quantidade: 0 };
      cur.total += mov.Valor ?? 0;
      cur.quantidade += 1;
      map.set(nome, cur);
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, quantidade: v.quantidade }))
      .sort((a, b) => b.total - a.total);
  }

  /** Detalhes agregados por cliente/fornecedor para o tipo (receita/despesa) */
  getDetalhesPorCliente(tipo: 'receita' | 'despesa'): Array<{ nome: string; total: number; quantidade: number }> {
    const fonte = this.obterCache()?.data || this.movimentacoes;
    const isReceita = tipo === 'receita';
    const filtradas = fonte.filter(mov => (mov.Debito ? !isReceita : isReceita));
    const map = new Map<string, { total: number; quantidade: number }>();
    filtradas.forEach(mov => {
      const nome = this.nomeParceiroExibicao(mov);
      const cur = map.get(nome) || { total: 0, quantidade: 0 };
      cur.total += mov.Valor ?? 0;
      cur.quantidade += 1;
      map.set(nome, cur);
    });
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, quantidade: v.quantidade }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Formata valores monetários em BRL
   * Exemplo: 1234.56 → "R$ 1.234,56"
   */
  formatarMoeda(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'R$ 0,00';
    }
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  private obterMensagemErro(err: unknown, fallback: string): string {
    const errorAny = err as any;
    return (
      errorAny?.error?.mensagem ||
      errorAny?.error?.message ||
      errorAny?.message ||
      fallback
    );
  }

}
