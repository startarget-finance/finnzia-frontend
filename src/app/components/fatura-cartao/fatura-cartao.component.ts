import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CartaoResumo,
  ContaPagarGerada,
  FaturaCartaoService,
  LancamentoImportado,
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

  constructor(private faturaCartaoService: FaturaCartaoService) {}

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

