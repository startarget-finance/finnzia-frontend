import { Injectable } from '@angular/core';

export type TipoAnexoMovimentacao = 'fatura' | 'boleto' | 'nota_fiscal' | 'comprovante' | 'outros';

export interface AnexoMovimentacaoMetadado {
  nomeArquivo: string;
  tamanhoBytes: number;
  dataIso: string;
  mimeType?: string;
}

export type AnexosPorMovimentacao = Partial<Record<TipoAnexoMovimentacao, AnexoMovimentacaoMetadado>>;

/**
 * Armazena apenas metadados dos anexos (nome, tamanho, data).
 * Persistência local por empresa até existir API de upload no backend.
 */
@Injectable({ providedIn: 'root' })
export class MovimentacoesAnexosService {
  private chave(empresaId: number | null | undefined): string {
    return `finnzia_mov_anexos_v1_${empresaId ?? 'sem_empresa'}`;
  }

  private lerMapa(empresaId: number | null | undefined): Record<string, AnexosPorMovimentacao> {
    try {
      const raw = localStorage.getItem(this.chave(empresaId));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, AnexosPorMovimentacao>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private gravarMapa(empresaId: number | null | undefined, mapa: Record<string, AnexosPorMovimentacao>): void {
    try {
      localStorage.setItem(this.chave(empresaId), JSON.stringify(mapa));
    } catch {
      // quota excedida ou modo privado
    }
  }

  obterAnexos(empresaId: number | null | undefined, movimentacaoId: string): AnexosPorMovimentacao {
    const mapa = this.lerMapa(empresaId);
    return mapa[movimentacaoId] ?? {};
  }

  salvarAnexo(
    empresaId: number | null | undefined,
    movimentacaoId: string,
    tipo: TipoAnexoMovimentacao,
    arquivo: File
  ): void {
    const mapa = this.lerMapa(empresaId);
    const atual = { ...(mapa[movimentacaoId] ?? {}) };
    atual[tipo] = {
      nomeArquivo: arquivo.name,
      tamanhoBytes: arquivo.size,
      dataIso: new Date().toISOString(),
      mimeType: arquivo.type || undefined,
    };
    mapa[movimentacaoId] = atual;
    this.gravarMapa(empresaId, mapa);
  }

  removerAnexo(empresaId: number | null | undefined, movimentacaoId: string, tipo: TipoAnexoMovimentacao): void {
    const mapa = this.lerMapa(empresaId);
    const atual = { ...(mapa[movimentacaoId] ?? {}) };
    delete atual[tipo];
    if (Object.keys(atual).length === 0) {
      delete mapa[movimentacaoId];
    } else {
      mapa[movimentacaoId] = atual;
    }
    this.gravarMapa(empresaId, mapa);
  }
}
