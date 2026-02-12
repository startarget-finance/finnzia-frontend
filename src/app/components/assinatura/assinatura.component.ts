import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { CONTRATOS_MOCK, Contrato, DadosCliente } from '../../data/mock-data';

@Component({
  selector: 'app-assinatura',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assinatura.component.html',
})
export class AssinaturaComponent implements OnInit {
  contrato: Contrato | null = null;
  assinaturaDigital: string = '';
  isAssinando: boolean = false;
  assinaturaRealizada: boolean = false;
  analiseIA: string = '';
  isAnalisando: boolean = false;
  currentDate: Date = new Date();
  mostrarFormularioCliente: boolean = false;

  // Formulário de dados do cliente
  dadosCliente: DadosCliente = {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    enderecoCompleto: '',
    cep: '',
    celularFinanceiro: '',
    emailFinanceiro: '',
    responsavel: '',
    cpf: '',
    plano: '',
    descricaoNegociacao: '',
    valorRecorrencia: '',
    dataVenda: '',
    dataPrimeiraParcelaRecorrencia: ''
  };

  // Dados adicionais do contrato
  servico: string = '';
  inicioContrato: string = '';
  inicioRecorrencia: string = '';
  valorContrato: number = 0;
  valorRecorrencia: number = 0;
  formaPagamento: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private aiService: AiService
  ) {}

  ngOnInit() {
    const contratoId = this.route.snapshot.queryParams['contratoId'];
    if (contratoId) {
      this.contrato = CONTRATOS_MOCK.find(c => c.id === contratoId) || null;
      if (this.contrato) {
        this.analisarContratoComIA();
        this.preencherDadosMockados();
      }
    }
  }

  analisarContratoComIA() {
    if (!this.contrato) return;

    this.isAnalisando = true;
    this.aiService.simulateDigitalSignature(this.contrato.conteudo).subscribe({
      next: (response) => {
        this.analiseIA = response.message;
        this.isAnalisando = false;
      },
      error: (error) => {
        console.error('Erro na análise da IA:', error);
        this.analiseIA = 'Erro ao analisar o contrato. Tente novamente.';
        this.isAnalisando = false;
      }
    });
  }


  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    // Evitar problema de timezone: new Date("2026-01-20") é interpretado como UTC
    // No Brasil (UTC-3), isso vira dia anterior. Parseando manualmente como local.
    const parts = dateString.substring(0, 10).split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString('pt-BR');
  }


  gerarHashAssinatura(): string {
    // Simular geração de hash para assinatura digital
    const timestamp = new Date().getTime();
    const random = Math.random().toString(36).substring(2);
    return `SHA256:${timestamp}${random}`.substring(0, 64);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pendente': return 'status-pendente';
      case 'em_dia': return 'status-em-dia';
      case 'vencido': return 'status-vencido';
      default: return '';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'pendente': return 'Pendente';
      case 'em_dia': return 'Assinado';
      case 'vencido': return 'Vencido';
      default: return status;
    }
  }

  simularAssinatura(): void {
    if (!this.contrato) return;

    this.isAssinando = true;
    setTimeout(() => {
      this.assinaturaDigital = `Assinado por: [Seu Nome] em ${new Date().toLocaleString()}`;
      this.assinaturaRealizada = true;
      this.isAssinando = false;
      const index = CONTRATOS_MOCK.findIndex(c => c.id === this.contrato!.id);
      if (index !== -1) {
        CONTRATOS_MOCK[index].status = 'em_dia';
      }
    }, 2000);
  }

  voltarParaContratos(): void {
    this.router.navigate(['/contratos']);
  }

  // Métodos para formulário de dados do cliente
  preencherDadosMockados(): void {
    if (!this.contrato) return;

    // Preencher dados existentes se houver, senão usar dados mockados
    if (this.contrato.dadosCliente) {
      this.dadosCliente = { ...this.contrato.dadosCliente };
    } else {
      const dadosMock = this.gerarDadosMockados();
      this.dadosCliente = { ...dadosMock };
    }
    
    if (this.contrato.servico) {
      this.servico = this.contrato.servico;
    } else {
      this.servico = 'Consultoria Financeira e Implementação de ERP';
    }
    
    if (this.contrato.inicioContrato) {
      this.inicioContrato = this.contrato.inicioContrato;
    } else {
      this.inicioContrato = new Date().toISOString().split('T')[0];
    }
    
    if (this.contrato.inicioRecorrencia) {
      this.inicioRecorrencia = this.contrato.inicioRecorrencia;
    } else {
      const dataRecorrencia = new Date();
      dataRecorrencia.setMonth(dataRecorrencia.getMonth() + 1);
      this.inicioRecorrencia = dataRecorrencia.toISOString().split('T')[0];
    }
    
    if (this.contrato.valorContrato) {
      this.valorContrato = this.contrato.valorContrato;
    } else {
      this.valorContrato = this.contrato.valor;
    }
    
    if (this.contrato.valorRecorrencia) {
      this.valorRecorrencia = this.contrato.valorRecorrencia;
    } else {
      this.valorRecorrencia = Math.round(this.contrato.valor * 0.15);
    }
    
    if (this.contrato.formaPagamento) {
      this.formaPagamento = this.contrato.formaPagamento;
    } else {
      this.formaPagamento = 'pix';
    }
  }

  gerarDadosMockados(): DadosCliente {
    if (!this.contrato) return this.dadosCliente;

    const hoje = new Date();
    const dataVenda = new Date(hoje.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const dataRecorrencia = new Date(dataVenda);
    dataRecorrencia.setMonth(dataRecorrencia.getMonth() + 1);

    return {
      razaoSocial: this.contrato.cliente + ' LTDA',
      nomeFantasia: this.contrato.cliente,
      cnpj: this.gerarCNPJ(),
      enderecoCompleto: 'Rua das Flores, 123, Centro, São Paulo - SP',
      cep: '01234-567',
      celularFinanceiro: '(11) 99999-8888',
      emailFinanceiro: 'financeiro@' + this.contrato.cliente.toLowerCase().replace(/\s+/g, '') + '.com.br',
      responsavel: 'João Silva',
      cpf: '123.456.789-00',
      plano: 'TURBOLOC',
      descricaoNegociacao: `SETUP: ${this.formatCurrency(this.contrato.valor)} em ${Math.ceil(this.contrato.valor / 1000)}x de ${this.formatCurrency(Math.ceil(this.contrato.valor / Math.ceil(this.contrato.valor / 1000)))}`,
      valorRecorrencia: `${this.formatCurrency(Math.round(this.contrato.valor * 0.15))} + 15% após o 3° mês`,
      dataVenda: dataVenda.toISOString().split('T')[0],
      dataPrimeiraParcelaRecorrencia: dataRecorrencia.toISOString().split('T')[0]
    };
  }

  gerarCNPJ(): string {
    const numeros = Array.from({length: 14}, () => Math.floor(Math.random() * 10));
    return `${numeros[0]}${numeros[1]}.${numeros[2]}${numeros[3]}${numeros[4]}.${numeros[5]}${numeros[6]}${numeros[7]}/${numeros[8]}${numeros[9]}${numeros[10]}${numeros[11]}-${numeros[12]}${numeros[13]}`;
  }

  abrirFormularioCliente(): void {
    this.mostrarFormularioCliente = true;
  }

  fecharFormularioCliente(): void {
    this.mostrarFormularioCliente = false;
  }


  getDataAtual(): string {
    return new Date().toLocaleDateString('pt-BR');
  }
}
