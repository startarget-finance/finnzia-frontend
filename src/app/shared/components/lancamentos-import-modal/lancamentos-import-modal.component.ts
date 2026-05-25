import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import {
  ErpFinanceiroService,
  LancamentoImportPreviewLinha,
  LancamentosImportPreviewResponse,
} from '../../../services/erp-financeiro.service';

@Component({
  selector: 'app-lancamentos-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lancamentos-import-modal.component.html',
})
export class LancamentosImportModalComponent {
  @Input({ required: true }) tipo: 'receita' | 'despesa' = 'receita';
  @Input() aberto = false;
  @Output() fechado = new EventEmitter<void>();
  @Output() importado = new EventEmitter<void>();

  etapa: 'upload' | 'preview' = 'upload';
  processando = false;
  importando = false;
  mensagem = '';
  mensagemErro = '';
  nomeArquivo = '';

  categoriaPadrao = '';
  contaPadrao = '';
  formaPagamentoPadrao = '';

  preview: LancamentosImportPreviewResponse | null = null;
  linhasPreview: LancamentoImportPreviewLinha[] = [];

  constructor(private erpFinanceiroService: ErpFinanceiroService) {}

  get tituloModal(): string {
    return this.tipo === 'receita' ? 'Importar contas a receber' : 'Importar contas a pagar';
  }

  get labelParceiro(): string {
    return this.tipo === 'receita' ? 'Cliente / origem' : 'Fornecedor';
  }

  get linhasValidasPreview(): LancamentoImportPreviewLinha[] {
    return this.linhasPreview.filter((l) => l.valido);
  }

  fechar(): void {
    this.resetar();
    this.fechado.emit();
  }

  resetar(): void {
    this.etapa = 'upload';
    this.processando = false;
    this.importando = false;
    this.mensagem = '';
    this.mensagemErro = '';
    this.nomeArquivo = '';
    this.preview = null;
    this.linhasPreview = [];
    this.categoriaPadrao = '';
    this.contaPadrao = '';
    this.formaPagamentoPadrao = '';
  }

  baixarModelo(): void {
    const headers =
      this.tipo === 'receita'
        ? [
            'Cliente / origem',
            'Vencimento',
            'Recebimento',
            'Descricao',
            'Categoria',
            'Valor',
            'Status',
            'Conta',
            'Forma pagamento',
          ]
        : [
            'Fornecedor',
            'Vencimento',
            'Pagamento',
            'Descricao',
            'Categoria',
            'Valor',
            'Status',
            'Conta',
            'Forma pagamento',
          ];

    const exemplo =
      this.tipo === 'receita'
        ? [
            'Cliente Sipag Exemplo',
            '22/05/2026',
            '',
            'Venda cartao - NSU 12345',
            'Vendas',
            '150,00',
            'PENDENTE',
            'Sipag',
            'Cartao',
          ]
        : [
            'Fornecedor Exemplo',
            '22/05/2026',
            '',
            'Compra insumos',
            'Custos',
            '89,90',
            'PENDENTE',
            'Banco',
            'PIX',
          ];

    const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    const nome = this.tipo === 'receita' ? 'modelo-contas-a-receber.xlsx' : 'modelo-contas-a-pagar.xlsx';
    XLSX.writeFile(wb, nome);
  }

  async onArquivoSelecionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.processando = true;
    this.mensagemErro = '';
    this.mensagem = '';
    this.nomeArquivo = file.name;

    try {
      const csvContent = await this.arquivoParaCsv(file);
      this.erpFinanceiroService.previewImportLancamentos(csvContent, this.tipo).subscribe({
        next: (resp) => {
          if (resp.erro) {
            this.mensagemErro = resp.mensagem || 'Não foi possível processar o arquivo.';
            this.processando = false;
            return;
          }
          this.preview = resp;
          this.linhasPreview = resp.linhas ?? [];
          this.etapa = 'preview';
          this.mensagem = `${resp.linhasValidas ?? 0} linha(s) pronta(s) para importar, ${resp.linhasInvalidas ?? 0} com erro.`;
          this.processando = false;
        },
        error: (err) => {
          this.mensagemErro = this.extrairErro(err, 'Não foi possível processar o arquivo.');
          this.processando = false;
        },
      });
    } catch (e) {
      this.mensagemErro = e instanceof Error ? e.message : 'Não foi possível ler o arquivo.';
      this.processando = false;
    } finally {
      input.value = '';
    }
  }

  voltarUpload(): void {
    this.etapa = 'upload';
    this.preview = null;
    this.linhasPreview = [];
    this.mensagem = '';
    this.mensagemErro = '';
  }

  confirmarImportacao(): void {
    const validas = this.linhasValidasPreview;
    if (!validas.length) {
      this.mensagemErro = 'Não há linhas válidas para importar.';
      return;
    }
    if (!this.categoriaPadrao.trim() && validas.some((l) => !l.categoria?.trim())) {
      this.mensagemErro = 'Informe a categoria padrão para linhas sem categoria na planilha.';
      return;
    }

    this.importando = true;
    this.mensagemErro = '';
    this.erpFinanceiroService
      .confirmarImportLancamentos({
        tipo: this.tipo,
        linhas: validas,
        categoriaPadrao: this.categoriaPadrao.trim() || undefined,
        contaPadrao: this.contaPadrao.trim() || undefined,
        formaPagamentoPadrao: this.formaPagamentoPadrao.trim() || undefined,
        nomeArquivo: this.nomeArquivo || undefined,
      })
      .subscribe({
        next: (resp) => {
          this.importando = false;
          if (resp.erro) {
            this.mensagemErro = resp.mensagem || 'Falha na importação.';
            return;
          }
          this.mensagem = resp.mensagem || `${resp.importados ?? 0} lançamento(s) importado(s).`;
          this.importado.emit();
          setTimeout(() => this.fechar(), 1200);
        },
        error: (err) => {
          this.importando = false;
          this.mensagemErro = this.extrairErro(err, 'Falha ao importar lançamentos.');
        },
      });
  }

  formatarValor(v: number | undefined): string {
    if (v == null || Number.isNaN(v)) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }

  private async arquivoParaCsv(file: File): Promise<string> {
    const nome = file.name.toLowerCase();
    const texto = await file.text();
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
      return texto;
    }
    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
    }
    throw new Error('Use arquivo CSV ou Excel (.xlsx).');
  }

  private extrairErro(err: unknown, fallback: string): string {
    const e = err as { error?: { mensagem?: string; message?: string }; message?: string };
    return e?.error?.mensagem || e?.error?.message || e?.message || fallback;
  }
}
