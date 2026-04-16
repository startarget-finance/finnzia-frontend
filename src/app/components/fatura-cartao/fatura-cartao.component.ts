import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CartaoResumo,
  ContaPagarGerada,
  FaturaCartaoService,
  LancamentoImportado,
  PontoFatura,
} from '../../services/fatura-cartao.service';

@Component({
  selector: 'app-fatura-cartao',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fatura-cartao.component.html',
})
export class FaturaCartaoComponent implements OnInit {
  cartoes: CartaoResumo[] = [];

  cartaoSelecionadoId = 1;
  importando = false;
  nomeArquivoImportado = '';
  mensagemImportacao = '';
  mensagemGeracao = '';
  previewCsv = '';
  lancamentosImportados: LancamentoImportado[] = [];
  contasPagarGeradas: ContaPagarGerada[] = [];
  carregandoCartoes = false;
  erroTela = '';

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

  get cartaoSelecionado(): CartaoResumo {
    return this.cartoes.find(c => c.id === this.cartaoSelecionadoId) ?? this.cartaoVazio();
  }

  selecionarCartao(id: number): void {
    this.cartaoSelecionadoId = id;
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

    this.importando = true;
    this.nomeArquivoImportado = file.name;
    this.mensagemImportacao = '';
    this.mensagemGeracao = '';

    try {
      const conteudo = await file.text();
      this.previewCsv = conteudo.slice(0, 240);
      this.faturaCartaoService.importarCsv(conteudo).subscribe({
        next: (resp) => {
          this.lancamentosImportados = resp.lancamentos ?? [];
          this.mensagemImportacao = resp.mensagem ?? `${this.lancamentosImportados.length} lancamento(s) processado(s).`;
        },
        error: () => {
          this.mensagemImportacao = 'Nao foi possivel processar o CSV no backend.';
          this.lancamentosImportados = [];
        },
        complete: () => {
          this.importando = false;
          input.value = '';
        },
      });
    } catch {
      this.mensagemImportacao = 'Nao foi possivel ler o arquivo. Use CSV UTF-8.';
      this.lancamentosImportados = [];
      this.importando = false;
      input.value = '';
    }
  }

  gerarContasPagarPrototipo(): void {
    if (!this.lancamentosImportados.length) {
      this.mensagemGeracao = 'Importe uma fatura antes de gerar contas a pagar.';
      return;
    }
    this.faturaCartaoService
      .gerarContasPagar(this.cartaoSelecionado.nome, this.lancamentosImportados)
      .subscribe({
        next: (resp) => {
          this.contasPagarGeradas = resp.contasPagar ?? [];
          this.mensagemGeracao = resp.mensagem ?? `${this.contasPagarGeradas.length} conta(s) gerada(s).`;
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
    this.router.navigate(['/movimentacoes'], {
      queryParams: this.limparQueryParamsVazios({
        origem: 'fatura',
        textoPesquisa: this.cartaoSelecionado.nome,
        tipo: 'despesa',
        dataInicial: this.dateToStr(inicio),
        dataFinal: this.dateToStr(fim),
        conta,
      }),
    });
  }

  abrirLancamentoImportado(l: LancamentoImportado): void {
    const conta = this.extrairContaParaFiltro(l) ?? this.extrairContaParaFiltro(this.cartaoSelecionado);
    this.router.navigate(['/movimentacoes'], {
      queryParams: this.limparQueryParamsVazios({
        origem: 'fatura',
        textoPesquisa: l.descricao,
        tipo: 'despesa',
        categoria: l.categoria || undefined,
        conta,
      }),
    });
  }

  abrirLancamentosDoMes(ponto: PontoFatura, index: number): void {
    const periodo = this.resolverPeriodoDoPonto(ponto, index, this.cartaoSelecionado.pontos.length);
    const conta = this.extrairContaParaFiltro(this.cartaoSelecionado);
    this.router.navigate(['/movimentacoes'], {
      queryParams: this.limparQueryParamsVazios({
        origem: 'fatura',
        textoPesquisa: this.cartaoSelecionado.nome,
        tipo: 'despesa',
        dataInicial: this.dateToStr(periodo.inicio),
        dataFinal: this.dateToStr(periodo.fim),
        conta,
      }),
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
          this.cartaoSelecionadoId = this.cartoes[0].id;
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

