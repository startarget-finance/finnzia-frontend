import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Interface para os dados de cada feature
export interface FeatureComparacao {
  nome: string;
  bpo: boolean | string; // true/false ou string como "Às vezes"
  sistema: boolean | string;
  finzzia: boolean | string;
}

@Component({
  selector: 'app-comparacao-servicos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comparacao-servicos.component.html',
  styleUrls: ['./comparacao-servicos.component.scss']
})
export class ComparacaoServicosComponent {
  @Input() titulo: string = 'Compare você mesmo';
  @Input() subtitulo: string = 'Veja como a Finzzia se diferencia das outras soluções do mercado';
  @Input() features: FeatureComparacao[] = [];

  // Dados padrão se não forem fornecidos via @Input
  defaultFeatures: FeatureComparacao[] = [
    {
      nome: 'Atendimento humanizado',
      bpo: true,
      sistema: 'Às vezes',
      finzzia: true
    },
    {
      nome: 'Gerente responsável',
      bpo: 'Às vezes',
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Análise Estratégica',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Elaboração de DRE e DFC',
      bpo: true,
      sistema: true,
      finzzia: true
    },
    {
      nome: 'Conciliação bancária',
      bpo: true,
      sistema: true,
      finzzia: true
    },
    {
      nome: 'Pagamento de contas',
      bpo: 'Apenas Agendamento',
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Emissão de NFs de Serviço',
      bpo: true,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Emissão de boletos de cobrança',
      bpo: true,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Cobrança humanizada de inadimplentes',
      bpo: 'Às vezes',
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Indicador de fluxo de caixa',
      bpo: 'Às vezes',
      sistema: true,
      finzzia: true
    },
    {
      nome: 'Indicadores personalizados',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Controle de contratos',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Ranking empresarial',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Dashboard personalizado',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Reunião mensal estratégica',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Análise de modelo de negócio',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Análise de processos',
      bpo: false,
      sistema: false,
      finzzia: true
    }
  ];

  // Getter para usar features do input ou padrão
  get featuresList(): FeatureComparacao[] {
    return this.features.length > 0 ? this.features : this.defaultFeatures;
  }

  // Métodos helper para renderizar valores
  isTrue(value: boolean | string): boolean {
    return value === true;
  }

  isFalse(value: boolean | string): boolean {
    return value === false;
  }

  isString(value: boolean | string): boolean {
    return typeof value === 'string';
  }

  getStringValue(value: boolean | string): string {
    return typeof value === 'string' ? value : '';
  }
}
