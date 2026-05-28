import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import Swal from 'sweetalert2';
import {
  CartaoResumo,
  ContaPagarGerada,
  FaturaCartaoService,
  LancamentoImportado,
  NivelConfianca,
  PontoFatura,
} from '../../services/fatura-cartao.service';

const CATEGORIA_A_CLASSIFICAR = 'A classificar';

@Component({
  selector: 'app-fatura-cartao',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './fatura-cartao.component.html',
})
export class FaturaCartaoComponent implements OnInit {
  cartoes: CartaoResumo[] = [];

  /** null = todos os cartões na tabela/gráfico */
  filtroCartaoId: number | null = null;
  /** cartão escolhido na importação do extrato */
  cartaoImportacaoId: number | null = null;
  importando = false;
  nomeArquivoImportado = '';
  mensagemImportacao = '';
  mensagemGeracao = '';
  previewCsv = '';
  lancamentosImportados: LancamentoImportado[] = [];
  contasPagarGeradas: ContaPagarGerada[] = [];
  paginaLancamentos = 0;
  readonly tamanhoPaginaLancamentos = 10;
  carregandoCartoes = false;
  erroTela = '';
  private readonly confiancaMinimaPdf = 0.9;

  /** Conciliação pré-importação (estilo Bom Controle). */
  previewConciliacaoAberto = false;
  previewConciliacaoLancamentos: LancamentoImportado[] = [];
  previewConciliacaoCartaoId: number | null = null;
  confirmandoImportacao = false;
  filtroSomenteRevisar = false;

  readonly categoriasImportacao: string[] = [
    CATEGORIA_A_CLASSIFICAR,
    'Alimentacao',
    'Combustivel',
    'Marketing',
    'Saude',
    'Compras',
    'Transporte',
    'Software e ferramentas',
    'Escritorio',
    'Outras despesas',
  ];

  constructor(
    private faturaCartaoService: FaturaCartaoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarCartoes();
  }

  get cartoesFiltrados(): CartaoResumo[] {
    return this.cartoes;
  }

  get exibindoTodos(): boolean {
    return this.filtroCartaoId === null;
  }

  get cartaoSelecionado(): CartaoResumo {
    if (this.filtroCartaoId === null) {
      return this.cartaoVazio();
    }
    return this.cartoes.find(c => c.id === this.filtroCartaoId) ?? this.cartaoVazio();
  }

  get cartaoParaImportacao(): CartaoResumo | null {
    if (this.cartaoImportacaoId == null) return null;
    return this.cartoes.find(c => c.id === this.cartaoImportacaoId) ?? null;
  }

  /** Com menos de 5 cartões: faixa horizontal de cartões + tabela em largura total (gráfico compacto). */
  get layoutTabelaExpandida(): boolean {
    return this.cartoesFiltrados.length > 0 && this.cartoesFiltrados.length < 5;
  }

  get totalPaginasLancamentos(): number {
    return Math.max(1, Math.ceil(this.lancamentosVisiveis.length / this.tamanhoPaginaLancamentos));
  }

  get lancamentosVisiveis(): LancamentoImportado[] {
    if (!this.filtroSomenteRevisar) {
      return this.lancamentosImportados;
    }
    return this.lancamentosImportados.filter((l) => l.precisaRevisao);
  }

  get lancamentosPaginados(): LancamentoImportado[] {
    const inicio = this.paginaLancamentos * this.tamanhoPaginaLancamentos;
    return this.lancamentosVisiveis.slice(inicio, inicio + this.tamanhoPaginaLancamentos);
  }

  get totalPendentesRevisao(): number {
    return this.lancamentosImportados.filter((l) => l.precisaRevisao).length;
  }

  get previewSelecionados(): LancamentoImportado[] {
    return this.previewConciliacaoLancamentos.filter((l) => l.selecionado !== false);
  }

  get intervaloLancamentos(): { inicio: number; fim: number; total: number } {
    const total = this.lancamentosVisiveis.length;
    if (!total) return { inicio: 0, fim: 0, total: 0 };
    const inicio = this.paginaLancamentos * this.tamanhoPaginaLancamentos + 1;
    const fim = Math.min(total, (this.paginaLancamentos + 1) * this.tamanhoPaginaLancamentos);
    return { inicio, fim, total };
  }

  selecionarCartao(id: number | null): void {
    this.filtroCartaoId = id;
    this.resetPaginaLancamentos();
    this.carregarImportadosRecentes();
  }

  irPaginaLancamentosAnterior(): void {
    if (this.paginaLancamentos > 0) this.paginaLancamentos--;
  }

  irPaginaLancamentosProxima(): void {
    if (this.paginaLancamentos < this.totalPaginasLancamentos - 1) this.paginaLancamentos++;
  }

  private resetPaginaLancamentos(): void {
    this.paginaLancamentos = 0;
  }

  private atribuirLancamentosImportados(lancamentos: LancamentoImportado[]): void {
    this.lancamentosImportados = lancamentos.map((l) => this.normalizarItemImportado(l, false));
    this.resetPaginaLancamentos();
    if (this.paginaLancamentos >= this.totalPaginasLancamentos) {
      this.paginaLancamentos = Math.max(0, this.totalPaginasLancamentos - 1);
    }
  }

  percentualUso(c: CartaoResumo): number {
    if (!c.limite || c.limite <= 0) return 0;
    const usado = c.limite - c.disponivel;
    return Math.max(0, Math.min(100, (usado / c.limite) * 100));
  }

  formatarMoeda(v: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(v);
  }

  get valorMaximo(): number {
    return Math.max(...this.cartaoSelecionado.pontos.map(p => p.valor), 1);
  }

  get polylinePoints(): string {
    const pontos = this.cartaoSelecionado.pontos;
    if (!pontos.length) return '';
    return pontos
      .map((p, i) => {
        const x = (i / Math.max(1, pontos.length - 1)) * 100;
        const y = 100 - (p.valor / this.valorMaximo) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }

  get areaPolylinePoints(): string {
    const pontos = this.polylinePoints;
    if (!pontos) return '';
    return `0,100 ${pontos} 100,100`;
  }

  get yAxisTicks(): number[] {
    const max = this.valorMaximo;
    return [1, 0.75, 0.5, 0.25, 0].map(f => max * f);
  }

  getPointX(index: number): number {
    const total = this.cartaoSelecionado.pontos.length;
    return total <= 1 ? 0 : (index / (total - 1)) * 100;
  }

  getPointY(valor: number): number {
    return 100 - (valor / this.valorMaximo) * 100;
  }

  async onImportarFatura(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const cartaoImport = this.cartaoParaImportacao;
    if (!cartaoImport?.id) {
      input.value = '';
      void Swal.fire({
        icon: 'warning',
        title: 'Cartao obrigatorio',
        text: 'Selecione o cartao de credito no campo ao lado de Importar extrato.',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      const confirmacao = await Swal.fire({
        icon: 'warning',
        title: 'Arquivo grande',
        text: 'Esse arquivo pode demorar para processar. Deseja continuar?',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#334155',
      });
      if (!confirmacao.isConfirmed) {
        input.value = '';
        return;
      }
    }

    this.importando = true;
    this.nomeArquivoImportado = file.name;
    this.mensagemImportacao = '';
    this.mensagemGeracao = '';

    try {
      const csvCanonico = await this.converterArquivoParaCsvCanonico(file);
      this.previewCsv = csvCanonico.slice(0, 240);
      this.faturaCartaoService.previewImportacao(csvCanonico, cartaoImport.id).subscribe({
        next: (resp) => {
          const lancamentos = (resp.lancamentos ?? []).map((l) => this.normalizarItemImportado(l, true));
          this.previewConciliacaoCartaoId = cartaoImport.id;
          this.previewConciliacaoLancamentos = lancamentos;
          this.previewConciliacaoAberto = true;
          const pendentes = resp.pendentesRevisao ?? lancamentos.filter((l) => l.precisaRevisao).length;
          this.mensagemImportacao =
            resp.mensagem ??
            `${lancamentos.length} lancamento(s) reconhecido(s). ${pendentes} precisam de revisao de categoria.`;
        },
        error: (err) => {
          this.mensagemImportacao = err?.error?.mensagem || 'Nao foi possivel processar o extrato no backend.';
          this.atribuirLancamentosImportados([]);
          void Swal.fire({
            icon: 'error',
            title: 'Falha na importacao',
            text: this.mensagemImportacao,
            confirmButtonColor: '#dc2626',
          });
        },
        complete: () => {
          this.importando = false;
          input.value = '';
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nao foi possivel ler o arquivo.';
      this.mensagemImportacao = msg;
      this.atribuirLancamentosImportados([]);
      this.importando = false;
      input.value = '';
      void Swal.fire({
        icon: 'error',
        title: 'Arquivo invalido',
        text: this.mensagemImportacao,
        confirmButtonColor: '#dc2626',
      });
    }
  }

  private async converterArquivoParaCsvCanonico(file: File): Promise<string> {
    const nome = file.name.toLowerCase();
    if (nome.endsWith('.csv')) {
      return file.text();
    }
    if (nome.endsWith('.ofx')) {
      const texto = await file.text();
      const itens = this.extrairTransacoesOfx(texto);
      if (!itens.length) {
        throw new Error('Nao foi possivel extrair transacoes do OFX.');
      }
      return this.gerarCsvCanonico(itens);
    }
    if (nome.endsWith('.pdf')) {
      const texto = await this.extrairTextoPdf(file);
      const parsed = this.extrairTransacoesPdf(texto);
      const itens = parsed.itens;
      if (!itens.length) {
        throw new Error('Nao foi possivel localizar lancamentos no PDF. Tente OFX ou CSV.');
      }
      if (parsed.confianca < this.confiancaMinimaPdf) {
        throw new Error(
          `PDF com baixa confianca de leitura (${Math.round(parsed.confianca * 100)}%). ` +
            'Para acuracia total, use OFX deste mesmo periodo.'
        );
      }
      return this.gerarCsvCanonico(itens);
    }
    throw new Error('Formato nao suportado. Use CSV, OFX ou PDF.');
  }

  private extrairTransacoesOfx(ofx: string): Array<{ data: string; descricao: string; valor: number }> {
    const out: Array<{ data: string; descricao: string; valor: number }> = [];
    const blocos = ofx.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
    for (const bloco of blocos) {
      const dataBruta = this.ofxTag(bloco, 'DTPOSTED');
      const memo = this.ofxTag(bloco, 'MEMO') || this.ofxTag(bloco, 'NAME') || 'Lancamento cartao';
      const valorBruto = this.ofxTag(bloco, 'TRNAMT');
      if (!dataBruta || !valorBruto) continue;
      const valor = Number(valorBruto.replace(',', '.'));
      if (Number.isNaN(valor)) continue;
      out.push({
        data: this.normalizarDataOfx(dataBruta),
        descricao: memo.replace(/\s+/g, ' ').trim(),
        valor: Math.abs(valor),
      });
    }
    return out;
  }

  private ofxTag(texto: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const match = texto.match(regex);
    return match?.[1]?.trim() ?? null;
  }

  private normalizarDataOfx(dataBruta: string): string {
    const d = dataBruta.replace(/\D/g, '');
    if (d.length < 8) return '';
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }

  private async extrairTextoPdf(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(pdfjsLib as any).version}/build/pdf.worker.min.mjs`;
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = await file.arrayBuffer();
    const doc = await (pdfjsLib as any).getDocument({ data: bytes }).promise;
    const linhas: string[] = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const itens = (content.items || []) as Array<{ str?: string; transform?: number[] }>;
      type LinhaPdf = { y: number; textos: string[] };
      const agrupadas: LinhaPdf[] = [];
      for (const item of itens) {
        const texto = String(item?.str ?? '').trim();
        if (!texto) continue;
        const y = Number(item?.transform?.[5] ?? 0);
        const existente = agrupadas.find((l) => Math.abs(l.y - y) < 2.2);
        if (existente) {
          existente.textos.push(texto);
        } else {
          agrupadas.push({ y, textos: [texto] });
        }
      }
      agrupadas
        .sort((a, b) => b.y - a.y)
        .forEach((l) => {
          const linha = l.textos.join(' ').replace(/\s+/g, ' ').trim();
          if (linha) linhas.push(linha);
        });
    }
    return linhas.join('\n');
  }

  private extrairTransacoesPdf(texto: string): {
    itens: Array<{ data: string; descricao: string; valor: number }>;
    confianca: number;
    banco: string;
  } {
    const banco = this.detectarBancoNoTexto(texto);
    const estrategias = this.estrategiasPdfPorBanco(banco);
    const linhas = texto
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length >= 8);
    let melhor: Array<{ data: string; descricao: string; valor: number }> = [];
    let melhorHits = 0;
    let melhorCobertura = 0;
    for (const r of estrategias) {
      const atual: Array<{ data: string; descricao: string; valor: number }> = [];
      for (const linha of linhas) {
        const m = linha.match(r);
        if (!m) continue;
        const data = this.normalizarDataBr(m[1], new Date().getFullYear());
        const descricao = m[2].trim();
        const valor = Number(m[3].replace(/\./g, '').replace(',', '.'));
        if (!data || Number.isNaN(valor)) continue;
        atual.push({ data, descricao, valor: Math.abs(valor) });
      }
      const hits = atual.length;
      const cobertura = linhas.length ? hits / linhas.length : 0;
      if (hits > melhorHits || (hits === melhorHits && cobertura > melhorCobertura)) {
        melhor = atual;
        melhorHits = hits;
        melhorCobertura = cobertura;
      }
    }
    const confianca = this.calcularConfiancaExtracaoPdf(melhor, linhas.length, banco);
    return { itens: melhor, confianca, banco };
  }

  private detectarBancoNoTexto(texto: string): string {
    const t = texto.toLowerCase();
    if (t.includes('nubank') || t.includes('nu pagamentos')) return 'nubank';
    if (t.includes('itau') || t.includes('itaú')) return 'itau';
    if (t.includes('bradesco')) return 'bradesco';
    if (t.includes('santander')) return 'santander';
    if (t.includes('inter')) return 'inter';
    return 'generico';
  }

  private estrategiasPdfPorBanco(banco: string): RegExp[] {
    const base = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\b/;
    const estrategias: Record<string, RegExp[]> = {
      nubank: [
        /(\d{2}\/\d{2})\s+(.+?)\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i,
        /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:D|C)?\b/i,
        base,
      ],
      itau: [
        /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:-|\+)?\s*$/i,
        base,
      ],
      bradesco: [
        /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i,
        base,
      ],
      santander: [
        /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:D|C)\b/i,
        base,
      ],
      inter: [
        /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i,
        base,
      ],
      generico: [base],
    };
    return estrategias[banco] ?? estrategias['generico'];
  }

  private calcularConfiancaExtracaoPdf(
    itens: Array<{ data: string; descricao: string; valor: number }>,
    totalLinhas: number,
    banco: string
  ): number {
    if (!itens.length || totalLinhas <= 0) return 0;
    const datasValidas = itens.filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.data)).length / itens.length;
    const descricoesValidas = itens.filter((i) => i.descricao.trim().length >= 3).length / itens.length;
    const valoresValidos = itens.filter((i) => Number.isFinite(i.valor) && i.valor > 0).length / itens.length;
    const cobertura = Math.min(1, itens.length / Math.max(10, totalLinhas * 0.3));
    const bonusBanco = banco === 'generico' ? 0 : 0.06;
    return Math.min(1, datasValidas * 0.3 + descricoesValidas * 0.25 + valoresValidos * 0.3 + cobertura * 0.15 + bonusBanco);
  }

  private normalizarDataBr(data: string, anoPadrao: number): string {
    const partes = data.split('/');
    if (partes.length < 2) return '';
    const dia = Number(partes[0]);
    const mes = Number(partes[1]);
    const anoBruto = partes[2] ? Number(partes[2]) : anoPadrao;
    const ano = anoBruto < 100 ? 2000 + anoBruto : anoBruto;
    if (!dia || !mes || mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  private gerarCsvCanonico(itens: Array<{ data: string; descricao: string; valor: number }>): string {
    const header = 'data,descricao,valor';
    const linhas = itens.map((i) => {
      const desc = `"${(i.descricao || '').replace(/"/g, '""')}"`;
      return `${i.data},${desc},${i.valor.toFixed(2)}`;
    });
    return [header, ...linhas].join('\n');
  }

  private vincularLancamentosAoCartao(
    lancamentos: LancamentoImportado[],
    cartao: CartaoResumo
  ): LancamentoImportado[] {
    return lancamentos.map((l) => ({
      ...l,
      cartaoId: l.cartaoId ?? cartao.id,
      cartaoNome: l.cartaoNome ?? cartao.nome,
      contaBancariaId: l.contaBancariaId ?? cartao.id,
      contaBancariaNome: l.contaBancariaNome ?? cartao.nome,
    }));
  }

  fecharPreviewConciliacao(): void {
    this.previewConciliacaoAberto = false;
    this.previewConciliacaoLancamentos = [];
    this.previewConciliacaoCartaoId = null;
  }

  alternarFiltroRevisar(): void {
    this.filtroSomenteRevisar = !this.filtroSomenteRevisar;
    this.resetPaginaLancamentos();
  }

  marcarTodosPreview(selecionado: boolean): void {
    for (const l of this.previewConciliacaoLancamentos) {
      l.selecionado = selecionado;
    }
  }

  aoAlterarCategoriaPreview(item: LancamentoImportado): void {
    const cat = (item.categoria || '').trim();
    item.precisaRevisao =
      !cat || cat.toLowerCase() === CATEGORIA_A_CLASSIFICAR.toLowerCase();
    item.statusClassificacao = item.precisaRevisao ? 'pendente' : 'classificada';
    item.confianca = item.precisaRevisao ? 'baixa' : 'alta';
    if (item.salvarRegra) {
      item.textoRegra = this.extrairTextoRegra(item.descricao);
    }
  }

  confirmarPreviewConciliacao(): void {
    const cartaoId = this.previewConciliacaoCartaoId;
    const selecionados = this.previewSelecionados;
    if (!cartaoId || !selecionados.length) {
      void Swal.fire({
        icon: 'warning',
        title: 'Nada selecionado',
        text: 'Marque ao menos um lancamento para importar no financeiro.',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    const payload = selecionados.map((l) => ({
      ...l,
      textoRegra: l.salvarRegra ? this.extrairTextoRegra(l.descricao) : undefined,
    }));
    this.confirmandoImportacao = true;
    this.faturaCartaoService.confirmarImportacao(cartaoId, payload).subscribe({
      next: (resp) => {
        this.confirmandoImportacao = false;
        this.fecharPreviewConciliacao();
        this.filtroCartaoId = cartaoId;
        this.carregarImportadosRecentes();
        const pendentes = resp.pendentesRevisao ?? 0;
        this.mensagemImportacao = resp.mensagem ?? `${selecionados.length} lancamento(s) importado(s).`;
        void Swal.fire({
          icon: pendentes > 0 ? 'info' : 'success',
          title: 'Importacao confirmada',
          text:
            pendentes > 0
              ? `${this.mensagemImportacao} ${pendentes} item(ns) ainda em "A classificar" — revise em Movimentacoes.`
              : this.mensagemImportacao,
          confirmButtonColor: '#7c3aed',
        });
      },
      error: (err) => {
        this.confirmandoImportacao = false;
        void Swal.fire({
          icon: 'error',
          title: 'Falha ao confirmar',
          text: err?.error?.mensagem || 'Nao foi possivel gravar os lancamentos.',
          confirmButtonColor: '#dc2626',
        });
      },
    });
  }

  labelConfianca(confianca?: NivelConfianca): string {
    if (confianca === 'alta') return 'Alta';
    if (confianca === 'media') return 'Media';
    return 'Revisar';
  }

  classeBadgeConfianca(confianca?: NivelConfianca, precisaRevisao?: boolean): string {
    if (precisaRevisao || confianca === 'baixa') {
      return 'bg-amber-100 text-amber-800 ring-amber-200/80';
    }
    if (confianca === 'media') {
      return 'bg-sky-100 text-sky-800 ring-sky-200/80';
    }
    return 'bg-emerald-100 text-emerald-800 ring-emerald-200/80';
  }

  private normalizarItemImportado(l: LancamentoImportado, paraPreview: boolean): LancamentoImportado {
    const categoria =
      !l.categoria || l.categoria.toLowerCase() === 'outras despesas'
        ? CATEGORIA_A_CLASSIFICAR
        : l.categoria;
    const precisaRevisao =
      l.precisaRevisao ??
      (categoria.toLowerCase() === CATEGORIA_A_CLASSIFICAR.toLowerCase() ||
        l.confianca === 'baixa');
    return {
      ...l,
      categoria,
      precisaRevisao,
      selecionado: paraPreview ? l.selecionado !== false : l.selecionado,
      salvarRegra: l.salvarRegra ?? false,
    };
  }

  private extrairTextoRegra(descricao: string): string {
    const t = (descricao || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 48) return t;
    return t.slice(0, 48).trim();
  }

  gerarContasPagarPrototipo(): void {
    if (!this.lancamentosImportados.length) {
      this.mensagemGeracao = 'Importe uma fatura antes de gerar contas a pagar.';
      return;
    }
    if (this.exibindoTodos) {
      void Swal.fire({
        icon: 'info',
        title: 'Selecione um cartão',
        text: 'Filtre um cartão específico (não "Todos") para gerar contas a pagar da fatura.',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    const cartaoId = this.cartaoSelecionado?.id;
    if (!cartaoId) {
      this.mensagemGeracao = 'Selecione um cartão para gerar contas a pagar.';
      return;
    }
    this.faturaCartaoService
      .gerarContasPagar(cartaoId, this.cartaoSelecionado.nome, this.lancamentosImportados)
      .subscribe({
        next: (resp) => {
          this.mensagemGeracao = resp.mensagem ?? `${(resp.contasPagar ?? []).length} conta(s) gerada(s).`;
          this.carregarImportadosRecentes();
        },
        error: () => {
          this.mensagemGeracao = 'Nao foi possivel gerar contas a pagar no backend.';
          this.contasPagarGeradas = [];
        },
      });
  }

  abrirLancamentosDaFatura(): void {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const conta = this.extrairContaParaFiltro(this.cartaoSelecionado);
    this.navegarParaMovimentacoes({
      origem: 'fatura',
      textoPesquisa: this.cartaoSelecionado.nome,
      tipo: 'despesa',
      dataInicial: this.dateToStr(inicio),
      dataFinal: this.dateToStr(fim),
      conta,
    });
  }

  abrirContaPagarEmMovimentacoes(cp: ContaPagarGerada): void {
    const idMov = String(cp.idMovimentacao ?? cp.id ?? '').trim();
    if (!idMov) {
      void Swal.fire({
        icon: 'warning',
        title: 'Registro sem vínculo',
        text: 'Não foi possível localizar o ID desta fatura no financeiro.',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    const data = (cp.vencimento || '').trim();
    this.navegarParaMovimentacoes({
      origem: 'fatura',
      editar: idMov,
      tipo: 'despesa',
      dataInicial: data || undefined,
      dataFinal: data || undefined,
      conta: cp.cartaoId != null ? String(cp.cartaoId) : cp.cartaoNome,
    });
  }

  abrirLancamentoImportado(l: LancamentoImportado): void {
    const idMov = (l.idMovimentacao || '').trim();
    if (!idMov) {
      void Swal.fire({
        icon: 'warning',
        title: 'Lançamento sem vínculo',
        text: 'Este item ainda não está vinculado ao financeiro. Reimporte o extrato se necessário.',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }
    const data = (l.data || '').trim();
    const conta =
      this.extrairContaParaFiltro(l) ??
      (l.cartaoId != null ? String(l.cartaoId) : l.cartaoNome) ??
      this.extrairContaParaFiltro(this.cartaoSelecionado);
    this.navegarParaMovimentacoes({
      origem: 'fatura',
      editar: idMov,
      tipo: 'despesa',
      dataInicial: data || undefined,
      dataFinal: data || undefined,
      conta,
    });
  }

  private navegarParaMovimentacoes(params: Record<string, string | undefined>): void {
    const queryParams = this.limparQueryParamsVazios(params);
    const url = this.router.createUrlTree(['/movimentacoes'], { queryParams });
    void this.router.navigateByUrl(url);
  }

  private periodoDoMes(dataStr: string): { inicio: string; fim: string } {
    const match = (dataStr || '').trim().match(/^(\d{4})-(\d{2})/);
    if (!match) {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      return { inicio: this.dateToStr(inicio), fim: this.dateToStr(fim) };
    }
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return {
      inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
      fim: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }

  abrirLancamentosDoMes(ponto: PontoFatura, index: number): void {
    const periodo = this.resolverPeriodoDoPonto(ponto, index, this.cartaoSelecionado.pontos.length);
    const conta = this.extrairContaParaFiltro(this.cartaoSelecionado);
    this.navegarParaMovimentacoes({
      origem: 'fatura',
      textoPesquisa: this.cartaoSelecionado.nome,
      tipo: 'despesa',
      dataInicial: this.dateToStr(periodo.inicio),
      dataFinal: this.dateToStr(periodo.fim),
      conta,
    });
  }

  private limparQueryParamsVazios(params: Record<string, string | undefined>): Record<string, string> {
    return Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>);
  }

  private extrairContaParaFiltro(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const dados = payload as Record<string, unknown>;
    const camposContaId = ['contaBancariaId', 'idContaFinanceira', 'IdContaFinanceira', 'idConta', 'contaId'];
    const camposContaNome = ['contaBancariaNome', 'nomeContaFinanceira', 'NomeContaFinanceira', 'conta', 'nomeConta'];

    for (const campo of camposContaId) {
      const valor = dados[campo];
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        return String(valor);
      }
    }
    for (const campo of camposContaNome) {
      const valor = dados[campo];
      if (typeof valor === 'string' && valor.trim() !== '') {
        return valor.trim();
      }
    }

    return undefined;
  }

  private resolverPeriodoDoPonto(
    ponto: PontoFatura,
    index: number,
    total: number
  ): { inicio: Date; fim: Date } {
    const mes = (ponto.mes || '').trim();
    const parsed = this.parseMesComAno(mes) ?? this.parseNomeMes(mes);
    let ano: number;
    let mesIndex: number;

    if (parsed) {
      ano = parsed.ano;
      mesIndex = parsed.mesIndex;
    } else {
      // Fallback: assume série cronológica até o mês atual.
      const hoje = new Date();
      const offset = Math.max(0, total - 1 - index);
      const base = new Date(hoje.getFullYear(), hoje.getMonth() - offset, 1);
      ano = base.getFullYear();
      mesIndex = base.getMonth();
    }

    const inicio = new Date(ano, mesIndex, 1);
    const fim = new Date(ano, mesIndex + 1, 0);
    return { inicio, fim };
  }

  private parseMesComAno(value: string): { ano: number; mesIndex: number } | null {
    const mmYyyy = value.match(/^(\d{1,2})[\/-](\d{2,4})$/);
    if (mmYyyy) {
      const mes = Number(mmYyyy[1]);
      const anoBruto = Number(mmYyyy[2]);
      const ano = anoBruto < 100 ? 2000 + anoBruto : anoBruto;
      if (mes >= 1 && mes <= 12) {
        return { ano, mesIndex: mes - 1 };
      }
    }

    const yyyyMm = value.match(/^(\d{4})[\/-](\d{1,2})$/);
    if (yyyyMm) {
      const ano = Number(yyyyMm[1]);
      const mes = Number(yyyyMm[2]);
      if (mes >= 1 && mes <= 12) {
        return { ano, mesIndex: mes - 1 };
      }
    }

    return null;
  }

  private parseNomeMes(value: string): { ano: number; mesIndex: number } | null {
    const nomesMeses: Record<string, number> = {
      jan: 0,
      fev: 1,
      mar: 2,
      abr: 3,
      mai: 4,
      jun: 5,
      jul: 6,
      ago: 7,
      set: 8,
      out: 9,
      nov: 10,
      dez: 11,
    };
    const token = value.toLowerCase().slice(0, 3);
    if (!(token in nomesMeses)) {
      return null;
    }
    const mesIndex = nomesMeses[token];
    const hoje = new Date();
    let ano = hoje.getFullYear();

    // Se o mês do ponto é "à frente" do mês atual, assume série do ano anterior.
    if (mesIndex > hoje.getMonth()) {
      ano -= 1;
    }

    return { ano, mesIndex };
  }

  private dateToStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private carregarCartoes(): void {
    this.carregandoCartoes = true;
    this.erroTela = '';
    this.faturaCartaoService.listarCartoes().subscribe({
      next: (resp) => {
        this.cartoes = (resp.cartoes ?? []).map((c) => ({
          ...c,
          pontos: c.pontos ?? [],
        }));
        if (this.cartoes.length) {
          this.cartaoImportacaoId = this.cartoes[0].id;
          this.carregarImportadosRecentes();
        } else {
          this.atribuirLancamentosImportados([]);
          this.contasPagarGeradas = [];
        }
      },
      error: () => {
        this.erroTela = 'Nao foi possivel carregar os cartoes.';
        this.cartoes = [];
      },
      complete: () => {
        this.carregandoCartoes = false;
      },
    });
  }

  private carregarImportadosRecentes(): void {
    if (!this.cartoes.length) {
      this.atribuirLancamentosImportados([]);
      return;
    }
    this.faturaCartaoService.listarImportadosRecentes(this.filtroCartaoId).subscribe({
      next: (resp) => {
        this.atribuirLancamentosImportados(resp?.lancamentos ?? []);
        this.contasPagarGeradas = resp?.contasPagar ?? [];
      },
      error: () => {
        this.atribuirLancamentosImportados([]);
        this.contasPagarGeradas = [];
      },
    });
  }

  private cartaoVazio(): CartaoResumo {
    return {
      id: 0,
      nome: '-',
      empresa: '-',
      disponivel: 0,
      limite: 0,
      pontos: [],
    };
  }
}

