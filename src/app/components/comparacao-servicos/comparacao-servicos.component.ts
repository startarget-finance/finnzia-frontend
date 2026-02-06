import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

// Interface para os dados de cada feature
export interface FeatureComparacao {
  nome: string;
  categoria: 'Estratégico' | 'Operacional' | 'Financeiro';
  bpo: boolean | string;
  sistema: boolean | string;
  finzzia: boolean | string;
  destaque?: boolean; // Para abrir por padrão no mobile
}

@Component({
  selector: 'app-comparacao-servicos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comparacao-servicos.component.html',
  styleUrls: ['./comparacao-servicos.component.scss']
})
export class ComparacaoServicosComponent implements OnInit, OnDestroy {
  @Input() titulo: string = 'Compare você mesmo';
  @Input() subtitulo: string = 'Veja como a Finzzia se diferencia das outras soluções do mercado';
  @Input() features: FeatureComparacao[] = [];

  // Estado do accordion (mobile)
  expandedFeatures: Set<string> = new Set();
  
  // Estado do modal
  modalAberto: boolean = false;

  // Dados padrão organizados por categoria
  defaultFeatures: FeatureComparacao[] = [
    // ⭐ DIFERENCIAIS ESTRATÉGICOS (abertos por padrão)
    {
      nome: 'Atendimento humanizado',
      categoria: 'Estratégico',
      bpo: true,
      sistema: 'Às vezes',
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Gerente responsável',
      categoria: 'Estratégico',
      bpo: 'Às vezes',
      sistema: false,
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Análise Estratégica',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Reunião mensal estratégica',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Análise de modelo de negócio',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Análise de processos',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Dashboard personalizado',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true,
      destaque: true
    },
    {
      nome: 'Indicadores personalizados',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Ranking empresarial',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Controle de contratos',
      categoria: 'Estratégico',
      bpo: false,
      sistema: false,
      finzzia: true
    },
    // ⚙️ OPERACIONAL
    {
      nome: 'Emissão de NFs de Serviço',
      categoria: 'Operacional',
      bpo: true,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Emissão de boletos de cobrança',
      categoria: 'Operacional',
      bpo: true,
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Cobrança humanizada de inadimplentes',
      categoria: 'Operacional',
      bpo: 'Às vezes',
      sistema: false,
      finzzia: true
    },
    {
      nome: 'Pagamento de contas',
      categoria: 'Operacional',
      bpo: 'Apenas Agendamento',
      sistema: false,
      finzzia: true
    },
    // 💰 FINANCEIRO
    {
      nome: 'Elaboração de DRE e DFC',
      categoria: 'Financeiro',
      bpo: true,
      sistema: true,
      finzzia: true
    },
    {
      nome: 'Conciliação bancária',
      categoria: 'Financeiro',
      bpo: true,
      sistema: true,
      finzzia: true
    },
    {
      nome: 'Indicador de fluxo de caixa',
      categoria: 'Financeiro',
      bpo: 'Às vezes',
      sistema: true,
      finzzia: true
    }
  ];

  // Getter para usar features do input ou padrão
  get featuresList(): FeatureComparacao[] {
    return this.features.length > 0 ? this.features : this.defaultFeatures;
  }

  // Features de destaque (para mobile - top 5-7)
  get topFeatures(): FeatureComparacao[] {
    return this.featuresList
      .filter(f => f.destaque === true)
      .slice(0, 7); // Máximo 7 features principais
  }

  // Calcular vitórias da Finzzia
  get finzziaWins(): { total: number; wins: number } {
    const features = this.featuresList;
    let wins = 0;
    const total = features.length;

    features.forEach(feature => {
      const finzziaValue = feature.finzzia;
      const bpoValue = feature.bpo;
      const sistemaValue = feature.sistema;

      // Finzzia vence se:
      // 1. Finzzia tem true e pelo menos um concorrente não tem
      // 2. Finzzia tem true e concorrentes têm "Às vezes" ou false
      if (finzziaValue === true) {
        const bpoTem = bpoValue === true;
        const sistemaTem = sistemaValue === true;
        
        // Se Finzzia tem e algum concorrente não tem, Finzzia vence
        if (!bpoTem || !sistemaTem) {
          wins++;
        } else if (typeof bpoValue === 'string' || typeof sistemaValue === 'string') {
          // Se algum concorrente tem valor string (como "Às vezes"), Finzzia vence
          wins++;
        }
      }
    });

    return { total, wins };
  }

  ngOnInit(): void {
    // Inicializar accordion com diferenciais abertos
    this.initializeAccordion();
  }

  // Inicializar accordion: abrir apenas os diferenciais principais
  initializeAccordion(): void {
    const features = this.featuresList;
    features.forEach((feature, index) => {
      if (feature.destaque || (feature.categoria === 'Estratégico' && index < 3)) {
        this.expandedFeatures.add(feature.nome);
      }
    });
  }

  // Toggle accordion
  toggleFeature(featureName: string): void {
    if (this.expandedFeatures.has(featureName)) {
      this.expandedFeatures.delete(featureName);
    } else {
      this.expandedFeatures.add(featureName);
    }
  }

  // Verificar se feature está expandida
  isExpanded(featureName: string): boolean {
    return this.expandedFeatures.has(featureName);
  }

  // Agrupar features por categoria
  get featuresByCategory(): { categoria: string; features: FeatureComparacao[] }[] {
    const features = this.featuresList;
    const grouped = features.reduce((acc, feature) => {
      const cat = feature.categoria;
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(feature);
      return acc;
    }, {} as Record<string, FeatureComparacao[]>);

    // Ordem: Estratégico, Operacional, Financeiro
    const order = ['Estratégico', 'Operacional', 'Financeiro'];
    return order
      .filter(cat => grouped[cat])
      .map(cat => ({
        categoria: cat,
        features: grouped[cat]
      }));
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

  // Ícone da categoria
  getCategoryIcon(categoria: string): string {
    switch (categoria) {
      case 'Estratégico':
        return '⭐';
      case 'Operacional':
        return '⚙️';
      case 'Financeiro':
        return '💰';
      default:
        return '•';
    }
  }

  // Abrir modal
  abrirModal(): void {
    this.modalAberto = true;
    // Prevenir scroll do body
    document.body.style.overflow = 'hidden';
  }

  // Fechar modal
  fecharModal(): void {
    this.modalAberto = false;
    // Restaurar scroll do body
    document.body.style.overflow = '';
  }

  // Fechar modal ao clicar no backdrop
  fecharModalBackdrop(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('modal-backdrop')) {
      this.fecharModal();
    }
  }

  ngOnDestroy(): void {
    // Garantir que o scroll seja restaurado ao destruir o componente
    document.body.style.overflow = '';
  }
}
