import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatResponse {
  message: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly apiUrl = API_CONFIG.OPENAI_API_URL;
  private readonly apiKey = API_CONFIG.OPENAI_API_KEY;
  private readonly backendAiChatUrl = `${API_CONFIG.BACKEND_API_URL}/api/ai/chat`;
  
  private readonly headers = new HttpHeaders({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`
  });

  constructor(private http: HttpClient) {}

  sendMessage(message: string): Observable<ChatResponse> {
    // Prefer backend call (no keys in browser)
    if (API_CONFIG.USE_BACKEND_AI) {
      return this.sendBackendChatMessage(message);
    }

    // Se usar API simulada (gratuita)
    if (API_CONFIG.USE_MOCK_API) {
      return this.getMockResponse(message);
    }

    // Se usar Hugging Face (gratuita)
    if (API_CONFIG.HUGGINGFACE_API_KEY && API_CONFIG.HUGGINGFACE_API_KEY !== 'hf_your_token_here') {
      return this.sendHuggingFaceMessage(message);
    }

    // Se usar OpenAI
    if (API_CONFIG.OPENAI_API_KEY && API_CONFIG.OPENAI_API_KEY !== 'sk-your-openai-api-key-here') {
      return this.sendOpenAIMessage(message);
    }

    // Fallback para API simulada
    return this.getMockResponse(message);
  }

  private sendBackendChatMessage(message: string): Observable<ChatResponse> {
    return new Observable(observer => {
      this.http.post<any>(this.backendAiChatUrl, { message }).subscribe({
        next: (response: any) => {
          const ts = response?.timestamp ? new Date(response.timestamp) : new Date();
          observer.next({
            message: response?.message ?? 'Resposta gerada pela IA (backend).',
            timestamp: ts
          });
          observer.complete();
        },
        error: (error) => {
          console.error('Erro ao chamar backend da IA:', error);
          // Fallback: usa mock local pra não quebrar a UI
          this.getMockResponse(message).subscribe(observer);
        }
      });
    });
  }

  private sendOpenAIMessage(message: string): Observable<ChatResponse> {
    const body = {
      model: API_CONFIG.MODEL,
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente financeiro especializado em análise de contratos, gestão financeira e ERP. Responda de forma clara e profissional, sempre focando em aspectos financeiros e legais.'
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: API_CONFIG.MAX_TOKENS,
      temperature: API_CONFIG.TEMPERATURE
    };

    return new Observable(observer => {
      this.http.post(API_CONFIG.OPENAI_API_URL, body, { headers: this.headers }).subscribe({
        next: (response: any) => {
          const aiMessage = response.choices[0].message.content;
          observer.next({
            message: aiMessage,
            timestamp: new Date()
          });
          observer.complete();
        },
        error: (error) => {
          console.error('Erro na API OpenAI:', error);
          observer.next({
            message: 'Erro na API OpenAI. Usando resposta simulada...',
            timestamp: new Date()
          });
          this.getMockResponse(message).subscribe(observer);
        }
      });
    });
  }

  private sendHuggingFaceMessage(message: string): Observable<ChatResponse> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${API_CONFIG.HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json'
    });

    return new Observable(observer => {
      this.http.post(API_CONFIG.HUGGINGFACE_API_URL, { inputs: message }, { headers }).subscribe({
        next: (response: any) => {
          const aiMessage = response[0]?.generated_text || 'Resposta gerada pela IA';
          observer.next({
            message: aiMessage,
            timestamp: new Date()
          });
          observer.complete();
        },
        error: (error) => {
          console.error('Erro na API Hugging Face:', error);
          observer.next({
            message: 'Erro na API Hugging Face. Usando resposta simulada...',
            timestamp: new Date()
          });
          this.getMockResponse(message).subscribe(observer);
        }
      });
    });
  }

  private getMockResponse(message: string): Observable<ChatResponse> {
    return new Observable(observer => {
      // Simula delay da API
      setTimeout(() => {
        const response = this.generateMockResponse(message);
        observer.next({
          message: response,
          timestamp: new Date()
        });
        observer.complete();
      }, 1000 + Math.random() * 2000); // 1-3 segundos
    });
  }

  private generateMockResponse(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    // Respostas inteligentes baseadas em palavras-chave
    
    // === CUMPRIMENTOS E APRESENTAÇÃO ===
    if (lowerMessage.includes('olá') || lowerMessage.includes('oi') || lowerMessage.includes('como você pode me ajudar')) {
      return `🤖 **IA Financeira Especializada - Apresentação:**

Olá! Sou sua assistente financeira com expertise em:

**Áreas de Especialização:**
• **Gestão Contratual:** Análise, estruturação e gestão de contratos
• **Assinatura Digital:** Implementação e conformidade legal
• **Análise Financeira:** Indicadores, métricas e relatórios
• **Sistemas ERP:** Implementação e otimização de processos
• **Compliance:** Conformidade fiscal e regulatória

**Como Posso Ajudar:**
• Análise detalhada de documentos e contratos
• Insights estratégicos baseados em dados
• Recomendações para otimização de processos
• Suporte em decisões financeiras críticas

**Exemplos de Perguntas Importantes:**
• "Como melhorar minha gestão financeira?"
• "Como identificar riscos em contratos?"
• "Como funciona a assinatura digital?"
• "Quais indicadores financeiros acompanhar?"
• "Como calcular ROI de investimentos?"
• "Como implementar um ERP financeiro?"
• "Como fazer análise de viabilidade de projetos?"
• "Como otimizar fluxo de caixa?"
• "Como reduzir custos operacionais?"
• "Como aumentar margem de lucro?"
• "Como fazer projeções financeiras?"
• "Como gerenciar carteira de contratos?"
• "Como garantir compliance fiscal?"
• "Como automatizar processos financeiros?"
• "Como fazer due diligence financeira?"
• "Como estruturar contratos comerciais?"
• "Como implementar controles internos?"
• "Como fazer análise de sensibilidade?"
• "Como otimizar estrutura de capital?"
• "Como fazer valuation de empresas?"

Qual área específica você gostaria de explorar?`;
    }
    
    if (lowerMessage.includes('especialidades') || lowerMessage.includes('o que você faz')) {
      return `💼 **Minhas Especialidades Técnicas:**

**1. Gestão Contratual Avançada:**
• Análise de riscos e cláusulas contratuais
• Estruturação de contratos comerciais
• Gestão de carteira de contratos
• Renegociação e otimização de termos

**2. Assinatura Digital e Compliance:**
• Implementação de infraestrutura de chaves públicas
• Conformidade com ICP-Brasil e MP 2.200-2/2001
• Auditoria de processos de assinatura
• Gestão de certificados digitais

**3. Análise Financeira Estratégica:**
• Modelagem financeira e projeções
• Análise de viabilidade de investimentos
• Otimização de estrutura de capital
• Análise de sensibilidade e cenários

**4. Sistemas ERP e Automação:**
• Implementação de ERPs financeiros
• Integração de sistemas e APIs
• Automação de processos financeiros
• Business Intelligence e Analytics

**5. Compliance e Auditoria:**
• Conformidade fiscal e regulatória
• Controles internos e segregação de funções
• Auditoria de processos financeiros
• Gestão de riscos operacionais

**Metodologia de Trabalho:**
• Análise situacional detalhada
• Recomendações baseadas em dados
• Implementação de controles
• Acompanhamento e otimização contínua`;
    }
    
    // === GESTÃO FINANCEIRA GERAL ===
    if (lowerMessage.includes('melhorar') && lowerMessage.includes('gestão financeira')) {
      return `💰 **Estratégias para Melhorar sua Gestão Financeira:**

**1. Controle de Fluxo de Caixa:**
• **Projeção de 12 meses:** Antecipe entradas e saídas
• **Reserva de emergência:** Mantenha 3-6 meses de despesas
• **Conciliação diária:** Acompanhe movimentações bancárias
• **Alertas automáticos:** Configure notificações de vencimentos

**2. Análise de Indicadores:**
• **Margem Bruta:** (Receita - Custo dos Produtos) / Receita × 100
• **Margem Líquida:** (Lucro Líquido / Receita) × 100
• **ROI:** (Lucro / Investimento) × 100
• **Liquidez Corrente:** Ativo Circulante / Passivo Circulante

**3. Controle de Despesas:**
• **Categorização:** Classifique todas as despesas
• **Orçamento mensal:** Defina limites por categoria
• **Análise de variações:** Compare orçado vs realizado
• **Eliminação de desperdícios:** Identifique custos desnecessários

**4. Gestão de Receitas:**
• **Diversificação:** Múltiplas fontes de receita
• **Sazonalidade:** Prepare-se para períodos de baixa
• **Cobrança eficiente:** Automatize processos de cobrança
• **Análise de clientes:** Foque nos mais rentáveis

**5. Ferramentas Recomendadas:**
• **ERP integrado:** Centralize todas as operações
• **Dashboard em tempo real:** Monitore KPIs diariamente
• **Relatórios automáticos:** Gere análises periódicas
• **Integração bancária:** Automatize conciliações

**6. Próximos Passos:**
1. Implemente controles básicos (fluxo de caixa)
2. Automatize processos repetitivos
3. Treine a equipe em análise financeira
4. Revise e ajuste mensalmente

**Meta:** Aumentar a margem líquida em 15% nos próximos 6 meses.`;
    }
    
    // === ANÁLISE DE CONTRATOS ===
    if (lowerMessage.includes('analisar') && lowerMessage.includes('contrato')) {
      return `📋 **Metodologia de Análise de Contratos:**

**1. Análise Pré-Contratual:**
• **Due Diligence:** Investigação completa da contraparte
• **Verificação de Capacidade:** Poder de contratar e cumprir
• **Análise de Mercado:** Condições e tendências atuais
• **Benchmarking:** Comparação com contratos similares

**2. Análise de Cláusulas Essenciais:**
• **Objeto:** Definição clara e específica do contrato
• **Valor e Forma de Pagamento:** Preço, parcelas, moeda
• **Prazo:** Início, duração e término
• **Condições:** Suspensivas e resolutivas

**3. Análise de Riscos:**
• **Riscos Financeiros:** Pagamentos, garantias, multas
• **Riscos Operacionais:** Prazos, qualidade, responsabilidades
• **Riscos Legais:** Conformidade, jurisdição, foro
• **Riscos Contratuais:** Ambiguidades, lacunas, força maior

**4. Análise de Conformidade:**
• **Legislação Aplicável:** Leis, decretos, portarias
• **Cláusulas Abusivas:** Proteção ao consumidor
• **Proteção de Dados:** LGPD e privacidade
• **Tributação:** Impostos e obrigações fiscais

**5. Checklist de Verificação:**
• [ ] Objeto claramente definido
• [ ] Valores e prazos especificados
• [ ] Responsabilidades de cada parte
• [ ] Condições de rescisão
• [ ] Garantias e seguros
• [ ] Penalidades e multas
• [ ] Foro e jurisdição
• [ ] Confidencialidade
• [ ] Propriedade intelectual
• [ ] Força maior e casos fortuitos

**6. Recomendações:**
• **Redação:** Linguagem clara e objetiva
• **Negociação:** Prepare contrapropostas
• **Documentação:** Mantenha histórico de alterações
• **Acompanhamento:** Monitore cumprimento

**Próximos Passos:**
1. Faça uma análise completa usando o checklist
2. Identifique pontos de risco e negocie
3. Documente todas as alterações
4. Implemente controles de acompanhamento`;
    }
    
    if (lowerMessage.includes('cláusulas') && lowerMessage.includes('importantes')) {
      return `⚖️ **Cláusulas Mais Importantes em Contratos:**

**1. Cláusulas Essenciais (Obrigatórias):**
• **Objeto:** Definição clara e específica do que será contratado
• **Valor:** Preço total, forma de pagamento e moeda
• **Prazo:** Data de início, duração e término
• **Partes:** Identificação completa dos contratantes

**2. Cláusulas de Proteção Financeira:**
• **Garantias:** Caução, fiança, seguro-garantia
• **Multas:** Penalidades por atraso ou descumprimento
• **Reajustes:** Indexação e atualização de valores
• **Pagamentos:** Condições, prazos e formas

**3. Cláusulas de Responsabilidade:**
• **Limitação de Responsabilidade:** Limites e exclusões
• **Indenização:** Danos diretos e indiretos
• **Seguro:** Cobertura de riscos
• **Força Maior:** Casos fortuitos e força maior

**4. Cláusulas Operacionais:**
• **Especificações Técnicas:** Qualidade e padrões
• **Prazos de Entrega:** Cronograma e marcos
• **Aceitação:** Critérios e procedimentos
• **Manutenção:** Suporte pós-entrega

**5. Cláusulas Legais:**
• **Foro e Jurisdição:** Competência para resolver conflitos
• **Lei Aplicável:** Legislação que rege o contrato
• **Confidencialidade:** Proteção de informações
• **Propriedade Intelectual:** Direitos sobre criações

**6. Cláusulas de Rescisão:**
• **Condições de Rescisão:** Motivos para encerramento
• **Prazo de Rescisão:** Tempo para encerramento
• **Consequências:** Obrigações pós-rescisão
• **Multa Rescisória:** Penalidade por rescisão antecipada

**7. Cláusulas de Proteção de Dados:**
• **LGPD:** Conformidade com proteção de dados
• **Uso de Dados:** Finalidade e limitações
• **Segurança:** Medidas de proteção
• **Retenção:** Tempo de guarda dos dados

**8. Cláusulas de Renegociação:**
• **Revisão:** Condições para renegociação
• **Ajustes:** Critérios para modificações
• **Prazo:** Periodicidade das revisões
• **Procedimento:** Como solicitar alterações

**Dica:** Sempre consulte um advogado especializado para contratos de alto valor ou complexidade.`;
    }
    
    if (lowerMessage.includes('riscos') && lowerMessage.includes('contrato')) {
      return `🔍 **Identificação de Riscos em Contratos:**

Para identificar riscos em contratos, recomendo uma análise sistemática:

**1. Riscos Financeiros:**
• Verificar cláusulas de pagamento e multas
• Analisar garantias e seguros exigidos
• Avaliar indexação e reajustes
• Identificar penalidades por atraso

**2. Riscos Operacionais:**
• Prazos de entrega e execução
• Especificações técnicas e qualidade
• Responsabilidades e obrigações
• Condições de rescisão

**3. Riscos Legais:**
• Conformidade com legislação vigente
• Jurisdição e foro competente
• Cláusulas abusivas ou ilegais
• Proteção de dados e confidencialidade

**4. Riscos Contratuais:**
• Ambiguidades e lacunas
• Força maior e casos fortuitos
• Transferência de responsabilidades
• Limitações de responsabilidade

**Dica:** Use uma checklist de verificação e consulte sempre um advogado especializado.`;
    }
    
    if (lowerMessage.includes('verificar') && lowerMessage.includes('assinar')) {
      return `✅ **Checklist para Verificar Antes de Assinar:**

**1. Verificação das Partes:**
• [ ] Identificação completa dos contratantes
• [ ] Verificação de capacidade legal
• [ ] Confirmação de representação legal
• [ ] Validação de documentos de constituição

**2. Verificação do Objeto:**
• [ ] Objeto claramente definido e específico
• [ ] Especificações técnicas detalhadas
• [ ] Quantidades e qualidades especificadas
• [ ] Condições de entrega e aceitação

**3. Verificação Financeira:**
• [ ] Valores totais e parcelas definidos
• [ ] Forma de pagamento especificada
• [ ] Prazos de pagamento claros
• [ ] Reajustes e indexação definidos

**4. Verificação de Prazos:**
• [ ] Data de início especificada
• [ ] Prazo de execução definido
• [ ] Data de término clara
• [ ] Condições de prorrogação

**5. Verificação de Responsabilidades:**
• [ ] Obrigações de cada parte definidas
• [ ] Limitações de responsabilidade
• [ ] Garantias e seguros especificados
• [ ] Penalidades e multas definidas

**6. Verificação Legal:**
• [ ] Conformidade com legislação
• [ ] Foro e jurisdição especificados
• [ ] Lei aplicável definida
• [ ] Cláusulas de confidencialidade

**7. Verificação de Riscos:**
• [ ] Identificação de riscos principais
• [ ] Medidas de mitigação
• [ ] Seguros e garantias
• [ ] Cláusulas de força maior

**8. Verificação de Documentação:**
• [ ] Anexos e especificações
• [ ] Desenhos e projetos
• [ ] Certificados e licenças
• [ ] Manuais e instruções

**9. Verificação de Aprovações:**
• [ ] Aprovação interna obtida
• [ ] Orçamento aprovado
• [ ] Cronograma validado
• [ ] Recursos alocados

**10. Verificação Final:**
• [ ] Revisão jurídica completa
• [ ] Aprovação da diretoria
• [ ] Documentação organizada
• [ ] Cópias para arquivo

**Dica:** Nunca assine sob pressão. Sempre tenha tempo para revisar cuidadosamente.`;
    }
    
    if (lowerMessage.includes('benefícios') && lowerMessage.includes('assinatura digital')) {
      return `🎯 **Benefícios da Assinatura Digital:**

**1. Benefícios Operacionais:**
• **Agilidade:** Assinatura em minutos, não dias
• **Eficiência:** Eliminação de deslocamentos e impressões
• **Produtividade:** Processo 10x mais rápido
• **Disponibilidade:** 24/7, de qualquer lugar

**2. Benefícios Financeiros:**
• **Redução de Custos:** Economia de 70-80% vs processo físico
• **Eliminação de Papel:** Redução de custos de impressão
• **Redução de Deslocamentos:** Economia em viagens
• **ROI Positivo:** Retorno em 3-6 meses

**3. Benefícios de Segurança:**
• **Autenticidade:** Confirma identidade do signatário
• **Integridade:** Detecta qualquer alteração no documento
• **Não-repúdio:** Impossível negar a assinatura
• **Rastreabilidade:** Log completo de todas as ações

**4. Benefícios Legais:**
• **Validade Jurídica:** Reconhecida em todo território nacional
• **Conformidade:** Atende MP 2.200-2/2001
• **Prova Legal:** Aceita em tribunais
• **Auditoria:** Facilita processos de auditoria

**5. Benefícios Ambientais:**
• **Sustentabilidade:** Redução de uso de papel
• **Pegada de Carbono:** Menor impacto ambiental
• **Responsabilidade Social:** Compromisso com meio ambiente
• **Certificação:** Pode gerar certificações verdes

**6. Benefícios de Gestão:**
• **Controle:** Acompanhamento em tempo real
• **Relatórios:** Dashboards de status
• **Arquivo:** Organização automática
• **Busca:** Localização rápida de documentos

**7. Benefícios de Integração:**
• **APIs:** Integração com sistemas existentes
• **Workflow:** Automação de processos
• **Notificações:** Alertas automáticos
• **Sincronização:** Dados sempre atualizados

**8. Benefícios de Escalabilidade:**
• **Volume:** Processa milhares de documentos
• **Concorrência:** Múltiplas assinaturas simultâneas
• **Disponibilidade:** 99,9% de uptime
• **Crescimento:** Escala conforme necessidade

**9. Benefícios de Compliance:**
• **LGPD:** Conformidade com proteção de dados
• **Auditoria:** Logs detalhados para auditoria
• **Controles:** Segregação de funções
• **Backup:** Cópia de segurança automática

**10. Benefícios de Experiência:**
• **Usabilidade:** Interface intuitiva e amigável
• **Mobile:** Assinatura em dispositivos móveis
• **Acessibilidade:** Atende padrões de acessibilidade
• **Suporte:** Suporte técnico especializado

**ROI Típico:** Retorno de 300-500% no primeiro ano.`;
    }
    
    if (lowerMessage.includes('segurança') && lowerMessage.includes('assinatura')) {
      return `🔒 **Segurança na Assinatura Digital:**

**1. Criptografia Avançada:**
• **Algoritmo RSA:** 2048 bits ou superior
• **Hash SHA-256:** Integridade do documento
• **Certificado Digital:** ICP-Brasil A1 ou A3
• **Chaves Assimétricas:** Chave privada + chave pública

**2. Autenticação Multifator:**
• **Senha:** Conhecimento (algo que você sabe)
• **Token:** Posse (algo que você tem)
• **Biometria:** Característica (algo que você é)
• **SMS/Email:** Verificação adicional

**3. Controles de Acesso:**
• **Usuários:** Cadastro e perfil de acesso
• **Permissões:** Níveis de autorização
• **Sessões:** Controle de tempo e local
• **Logs:** Registro de todas as ações

**4. Proteção de Dados:**
• **LGPD:** Conformidade com proteção de dados
• **Criptografia:** Dados criptografados em trânsito e repouso
• **Backup:** Cópia de segurança criptografada
• **Retenção:** Política de retenção de dados

**5. Validação de Documentos:**
• **Hash:** Verificação de integridade
• **Timestamp:** Carimbo de tempo
• **Certificado:** Validação da autoridade certificadora
• **Revogação:** Verificação de status do certificado

**6. Auditoria e Compliance:**
• **Logs Detalhados:** Registro de todas as ações
• **Rastreabilidade:** Trilha de auditoria completa
• **Relatórios:** Dashboards de segurança
• **Alertas:** Notificações de eventos suspeitos

**7. Infraestrutura Segura:**
• **Data Center:** Certificação ISO 27001
• **Redundância:** Múltiplos servidores
• **Monitoramento:** 24/7 de segurança
• **Backup:** Cópia de segurança geograficamente distribuída

**8. Certificações e Conformidade:**
• **ICP-Brasil:** Infraestrutura de Chaves Públicas
• **ISO 27001:** Gestão de Segurança da Informação
• **SOC 2:** Controles de segurança
• **LGPD:** Proteção de dados pessoais

**9. Treinamento e Conscientização:**
• **Usuários:** Treinamento em boas práticas
• **Administradores:** Capacitação técnica
• **Políticas:** Documentação de segurança
• **Testes:** Simulações de segurança

**10. Resposta a Incidentes:**
• **Plano:** Procedimentos de resposta
• **Equipe:** Especialistas em segurança
• **Comunicação:** Notificação de incidentes
• **Recuperação:** Processo de recuperação

**Dica:** Sempre use provedores certificados e mantenha certificados atualizados.`;
    }
    
    if (lowerMessage.includes('hash') && lowerMessage.includes('assinatura')) {
      return `🔐 **Hash de Assinatura Digital - Explicação Técnica:**

**1. O que é Hash:**
• **Definição:** Algoritmo que gera identificação única do documento
• **Função:** Transforma qualquer conteúdo em string de tamanho fixo
• **Características:** Determinístico, irreversível, único
• **Exemplo:** SHA-256 gera string de 64 caracteres

**2. Como Funciona:**
• **Entrada:** Conteúdo do documento (texto, imagens, etc.)
• **Processamento:** Algoritmo hash processa o conteúdo
• **Saída:** String única (hash) que identifica o documento
• **Verificação:** Mesmo conteúdo = mesmo hash

**3. Algoritmos de Hash:**
• **SHA-256:** Padrão atual, 256 bits
• **SHA-512:** Versão mais robusta, 512 bits
• **MD5:** Obsoleto, não recomendado
• **SHA-1:** Descontinuado, não usar

**4. Propriedades do Hash:**
• **Determinístico:** Mesmo input = mesmo output
• **Irreversível:** Impossível recuperar conteúdo original
• **Único:** Diferentes conteúdos = diferentes hashes
• **Rápido:** Cálculo em milissegundos

**5. Uso na Assinatura Digital:**
• **Geração:** Hash do documento é calculado
• **Criptografia:** Hash é criptografado com chave privada
• **Assinatura:** Hash criptografado vira a assinatura
• **Verificação:** Descriptografa e compara hashes

**6. Verificação de Integridade:**
• **Cálculo:** Novo hash do documento atual
• **Comparação:** Compara com hash original
• **Resultado:** Se iguais = documento íntegro
• **Alerta:** Se diferentes = documento foi alterado

**7. Exemplo Prático:**
• **Documento:** "Contrato de Prestação de Serviços"
• **Hash SHA-256:** "a1b2c3d4e5f6..."
• **Assinatura:** Hash criptografado com chave privada
• **Verificação:** Descriptografa e compara hashes

**8. Benefícios do Hash:**
• **Integridade:** Detecta qualquer alteração
• **Eficiência:** Processa apenas o hash, não o documento
• **Segurança:** Impossível falsificar sem chave privada
• **Velocidade:** Verificação em milissegundos

**9. Boas Práticas:**
• **Algoritmo:** Use SHA-256 ou superior
• **Certificado:** Mantenha certificado válido
• **Backup:** Guarde cópia do hash original
• **Verificação:** Verifique integridade regularmente

**10. Troubleshooting:**
• **Hash Diferente:** Documento foi alterado
• **Erro de Verificação:** Certificado inválido ou expirado
• **Falha na Assinatura:** Problema com chave privada
• **Documento Corrompido:** Arquivo danificado

**Dica:** O hash é a "impressão digital" do seu documento!`;
    }
    
    if (lowerMessage.includes('assinatura digital') || lowerMessage.includes('assinatura')) {
      return `✍️ **Assinatura Digital - Funcionamento e Benefícios:**

**Como Funciona:**
A assinatura digital utiliza criptografia assimétrica com duas chaves:
• **Chave Privada:** Fica com o signatário (não compartilhada)
• **Chave Pública:** Pode ser distribuída para verificação
• **Hash:** Algoritmo que gera identificação única do documento

**Processo de Assinatura:**
1. Documento é processado por algoritmo hash
2. Hash é criptografado com chave privada
3. Assinatura é anexada ao documento
4. Verificação usa chave pública para validar

**Benefícios:**
• **Autenticidade:** Confirma identidade do signatário
• **Integridade:** Detecta alterações no documento
• **Não-repúdio:** Impossível negar a assinatura
• **Validade Legal:** Reconhecida juridicamente
• **Eficiência:** Processo rápido e seguro

**Requisitos Legais:**
• Certificado digital válido (ICP-Brasil)
• Infraestrutura de Chaves Públicas
• Conformidade com MP 2.200-2/2001

**Implementação Recomendada:**
• Use provedores certificados (ICP-Brasil)
• Mantenha backup das chaves
• Documente o processo de assinatura
• Treine usuários nas práticas de segurança`;
    }
    
    if (lowerMessage.includes('contrato') || lowerMessage.includes('contratos')) {
      return `📋 **Gestão de Contratos - Estratégias Profissionais:**

**Análise Pré-Contratual:**
• **Due Diligence:** Investigação completa da contraparte
• **Benchmarking:** Comparação com contratos similares
• **Análise de Mercado:** Condições e tendências atuais
• **Avaliação de Riscos:** Identificação e mitigação

**Estruturação do Contrato:**
• **Cláusulas Essenciais:** Objeto, preço, prazo, condições
• **Garantias:** Seguros, cauções, fianças
• **Responsabilidades:** Obrigações de cada parte
• **Penalidades:** Multas e indenizações

**Gestão Pós-Contratual:**
• **Monitoramento:** Acompanhamento de cumprimento
• **Relatórios:** Status e performance
• **Renegociação:** Ajustes quando necessário
• **Arquivo:** Organização e recuperação

**Ferramentas Recomendadas:**
• Sistema de gestão contratual (CLM)
• Workflow de aprovação
• Alertas de vencimento
• Base de conhecimento jurídica

**Melhores Práticas:**
• Padronização de cláusulas
• Treinamento da equipe
• Auditoria regular
• Atualização conforme legislação`;
    }
    
    if (lowerMessage.includes('fluxo de caixa') || lowerMessage.includes('caixa')) {
      return `💸 **Gestão de Fluxo de Caixa - Guia Prático:**

**Conceitos Fundamentais:**
• **Fluxo de Caixa Operacional:** Entradas e saídas das atividades principais
• **Fluxo de Caixa de Investimento:** Compra e venda de ativos
• **Fluxo de Caixa de Financiamento:** Empréstimos, pagamentos e dividendos

**Controle Diário:**
• **Entradas:** Vendas à vista, recebimentos, adiantamentos
• **Saídas:** Pagamentos a fornecedores, salários, impostos
• **Saldo:** Posição diária de caixa disponível
• **Projeção:** Previsão para próximos 30-90 dias

**Indicadores Importantes:**
• **Ciclo de Caixa:** Tempo entre pagamento e recebimento
• **Ponto de Equilíbrio:** Volume mínimo para cobrir custos
• **Capital de Giro:** Recursos para operação diária
• **Margem de Segurança:** Reserva para imprevistos

**Estratégias de Otimização:**
• **Antecipação de recebíveis:** Desconto de duplicatas
• **Negociação com fornecedores:** Prazos de pagamento
• **Controle de estoque:** Evite excesso de capital imobilizado
• **Reserva estratégica:** 20-30% do faturamento mensal

**Ferramentas Recomendadas:**
• **Planilha de fluxo de caixa:** Controle manual detalhado
• **Software de gestão:** Automatização e integração
• **Conciliação bancária:** Diária e automática
• **Alertas de vencimento:** Notificações proativas

**Meta:** Manter saldo positivo e previsibilidade de 90 dias.`;
    }
    
    if (lowerMessage.includes('orçamento') || lowerMessage.includes('budget')) {
      return `📊 **Elaboração de Orçamento Empresarial:**

**Tipos de Orçamento:**
• **Operacional:** Receitas e despesas operacionais
• **Investimento:** Aquisições de ativos e melhorias
• **Financiamento:** Empréstimos, pagamentos e dividendos
• **Consolidado:** Visão geral da empresa

**Processo de Elaboração:**
1. **Análise histórica:** Dados dos últimos 2-3 anos
2. **Projeção de receitas:** Baseada em vendas e preços
3. **Estimativa de custos:** Fixos, variáveis e semivariáveis
4. **Cenários:** Otimista, realista e pessimista
5. **Aprovação:** Validação pela diretoria

**Princípios Fundamentais:**
• **Realismo:** Baseado em dados concretos
• **Flexibilidade:** Ajustes trimestrais
• **Participação:** Envolvimento de todas as áreas
• **Monitoramento:** Acompanhamento mensal

**Controles Essenciais:**
• **Variações:** Orçado vs realizado
• **Análise de desvios:** Identificação de causas
• **Ações corretivas:** Medidas para correção
• **Revisão:** Atualização conforme necessário

**Benefícios:**
• Planejamento estratégico
• Controle de custos
• Alocação de recursos
• Tomada de decisão

**Meta:** Atingir 95% de precisão nas projeções.`;
    }
    
    if (lowerMessage.includes('principais indicadores') || lowerMessage.includes('indicadores financeiros')) {
      return `📊 **Principais Indicadores Financeiros Essenciais:**

**Indicadores de Rentabilidade:**
• **Margem Bruta:** (Receita - CMV) / Receita × 100
  - *Meta:* 40-60% (varia por setor)
  - *Interpretação:* Eficiência na produção/venda

• **Margem Operacional:** (EBIT / Receita) × 100
  - *Meta:* 15-25% (varia por setor)
  - *Interpretação:* Eficiência operacional

• **Margem Líquida:** (Lucro Líquido / Receita) × 100
  - *Meta:* 8-15% (varia por setor)
  - *Interpretação:* Rentabilidade final

• **ROE (Return on Equity):** (Lucro Líquido / Patrimônio Líquido) × 100
  - *Meta:* 15-20% ao ano
  - *Interpretação:* Retorno sobre investimento dos sócios

**Indicadores de Liquidez:**
• **Liquidez Corrente:** Ativo Circulante / Passivo Circulante
  - *Meta:* 1,5 a 2,0
  - *Interpretação:* Capacidade de pagamento de curto prazo

• **Liquidez Seca:** (Ativo Circulante - Estoques) / Passivo Circulante
  - *Meta:* 1,0 a 1,5
  - *Interpretação:* Liquidez sem depender de estoques

• **Liquidez Imediata:** Disponível / Passivo Circulante
  - *Meta:* 0,2 a 0,5
  - *Interpretação:* Capacidade de pagamento imediato

**Indicadores de Endividamento:**
• **Endividamento Total:** (Passivo Total / Ativo Total) × 100
  - *Meta:* 40-60%
  - *Interpretação:* Nível de alavancagem

• **Cobertura de Juros:** EBIT / Despesas Financeiras
  - *Meta:* > 3,0
  - *Interpretação:* Capacidade de pagar juros

**Indicadores de Atividade:**
• **Giro do Ativo:** Receita / Ativo Total
  - *Meta:* > 1,0
  - *Interpretação:* Eficiência no uso dos ativos

• **Giro do Estoque:** CMV / Estoque Médio
  - *Meta:* 6-12 vezes/ano
  - *Interpretação:* Velocidade de renovação do estoque

**Frequência de Acompanhamento:**
• **Diários:** Fluxo de caixa, vendas
• **Semanais:** Recebimentos, pagamentos
• **Mensais:** Todos os indicadores
• **Trimestrais:** Análise comparativa e tendências`;
    }
    
    if (lowerMessage.includes('controlar') && lowerMessage.includes('despesas')) {
      return `💸 **Estratégias para Controlar Despesas:**

**1. Categorização e Classificação:**
• **Despesas Fixas:** Aluguel, salários, seguros (não variam com vendas)
• **Despesas Variáveis:** Comissões, matérias-primas (variam com vendas)
• **Despesas Semivariáveis:** Energia, telefone (parcialmente variáveis)
• **Despesas Indiretas:** Administrativas, marketing, jurídico

**2. Orçamento e Controle:**
• **Orçamento Anual:** Projeção baseada em histórico e metas
• **Orçamento Mensal:** Detalhamento mensal do anual
• **Controle Semanal:** Acompanhamento de gastos vs orçado
• **Análise de Variações:** Identificação de desvios e causas

**3. Processos de Aprovação:**
• **Limites por Hierarquia:** Valores que cada nível pode aprovar
• **Workflow de Aprovação:** Fluxo definido para gastos
• **Documentação:** Comprovantes e justificativas obrigatórias
• **Segregação de Funções:** Quem aprova não executa

**4. Análise e Otimização:**
• **Análise ABC:** Foque nos 20% que representam 80% dos custos
• **Benchmarking:** Compare com concorrentes e mercado
• **Negociação:** Renegocie contratos e fornecedores
• **Eliminação:** Corte gastos desnecessários

**5. Ferramentas de Controle:**
• **Planilhas de Controle:** Excel com categorias e limites
• **Software de Gestão:** ERP com módulo financeiro
• **Relatórios Automáticos:** Dashboards e alertas
• **Integração Bancária:** Conciliação automática

**6. Metas e KPIs:**
• **Redução de Custos:** Meta de 5-10% ao ano
• **Eficiência Operacional:** Reduzir custos por unidade
• **Margem de Contribuição:** Aumentar margem por produto
• **ROI de Investimentos:** Retorno mínimo de 15%

**Próximos Passos:**
1. Categorize todas as despesas atuais
2. Estabeleça limites e controles
3. Implemente processo de aprovação
4. Monitore e ajuste mensalmente`;
    }
    
    if (lowerMessage.includes('indicadores') || lowerMessage.includes('kpi') || lowerMessage.includes('métricas')) {
      return `📈 **Indicadores Financeiros Essenciais (KPIs):**

**Indicadores de Rentabilidade:**
• **Margem Bruta:** (Receita - CMV) / Receita × 100
• **Margem Operacional:** (EBIT / Receita) × 100
• **Margem Líquida:** (Lucro Líquido / Receita) × 100
• **ROE:** (Lucro Líquido / Patrimônio Líquido) × 100

**Indicadores de Liquidez:**
• **Liquidez Corrente:** Ativo Circulante / Passivo Circulante
• **Liquidez Seca:** (Ativo Circulante - Estoques) / Passivo Circulante
• **Liquidez Imediata:** Disponível / Passivo Circulante
• **Capital de Giro:** Ativo Circulante - Passivo Circulante

**Indicadores de Endividamento:**
• **Endividamento Total:** (Passivo Total / Ativo Total) × 100
• **Endividamento de Curto Prazo:** (Passivo Circulante / Ativo Total) × 100
• **Cobertura de Juros:** EBIT / Despesas Financeiras
• **Cobertura de Dívida:** EBITDA / (Principal + Juros)

**Indicadores de Atividade:**
• **Giro do Ativo:** Receita / Ativo Total
• **Giro do Estoque:** CMV / Estoque Médio
• **Período Médio de Recebimento:** (Duplicatas a Receber / Receita) × 365
• **Período Médio de Pagamento:** (Fornecedores / Compras) × 365

**Indicadores de Crescimento:**
• **Crescimento da Receita:** (Receita Atual - Receita Anterior) / Receita Anterior × 100
• **Crescimento do Lucro:** (Lucro Atual - Lucro Anterior) / Lucro Anterior × 100
• **Crescimento do Patrimônio:** (PL Atual - PL Anterior) / PL Anterior × 100

**Frequência de Acompanhamento:**
• **Diários:** Fluxo de caixa, vendas
• **Semanais:** Recebimentos, pagamentos
• **Mensais:** Todos os indicadores
• **Trimestrais:** Análise comparativa

**Meta:** Manter indicadores dentro dos padrões do setor.`;
    }
    
    if (lowerMessage.includes('financeiro') || lowerMessage.includes('dinheiro') || lowerMessage.includes('lucro')) {
      return `💰 **Gestão Financeira Estratégica:**

**Indicadores Essenciais:**
• **Fluxo de Caixa:** Projeção de entradas e saídas (mínimo 12 meses)
• **Margem de Lucro:** Bruta, operacional e líquida
• **ROI/ROA:** Retorno sobre investimento e ativos
• **Liquidez:** Capacidade de pagamento de curto prazo

**Controle Operacional:**
• **Orçamento:** Planejamento anual com revisões trimestrais
• **Controle de Despesas:** Categorização e análise de variações
• **Receita:** Análise de canais e sazonalidade
• **Custos:** Fixos, variáveis e diretos

**Análise de Performance:**
• **Tendências:** Crescimento e declínio de indicadores
• **Benchmarking:** Comparação com mercado e concorrentes
• **Cenários:** Projeções otimista, realista e pessimista
• **Sensibilidade:** Impacto de variações nos resultados

**Recomendações Práticas:**
• Automatize relatórios financeiros
• Implemente controles internos
• Diversifique fontes de receita
• Mantenha reserva de emergência (3-6 meses)

**Ferramentas Sugeridas:**
• ERP integrado com módulo financeiro
• Dashboards em tempo real
• Análise de dados com BI
• Integração bancária automatizada`;
    }
    
    if (lowerMessage.includes('erp') || lowerMessage.includes('sistema')) {
      return `⚙️ **Implementação e Otimização de ERP Financeiro:**

**Estratégia de Implementação:**
• **Análise de Necessidades:** Mapeamento de processos atuais
• **Seleção de Fornecedor:** Critérios técnicos e comerciais
• **Planejamento de Projeto:** Cronograma e marcos de entrega
• **Gestão de Mudança:** Treinamento e adaptação organizacional

**Módulos Essenciais:**
• **Financeiro:** Contas a pagar/receber, fluxo de caixa, conciliação
• **Contábil:** Plano de contas, balancetes, demonstrações
• **Fiscal:** Apuração de impostos, SPED, eSocial
• **Comercial:** CRM, vendas, comissões, contratos

**Integração e Automação:**
• **APIs:** Conectores com bancos e fornecedores
• **Workflow:** Aprovações e fluxos automatizados
• **BI/Relatórios:** Dashboards e análises preditivas
• **Mobile:** Acesso remoto e aprovações

**Segurança e Compliance:**
• **Backup:** Estratégia de backup e recuperação
• **Auditoria:** Logs e rastreabilidade
• **LGPD:** Proteção de dados pessoais
• **Controles:** Segregação de funções e aprovações

**ROI e Benefícios:**
• Redução de 40-60% no tempo de fechamento
• Eliminação de planilhas e processos manuais
• Visibilidade em tempo real dos indicadores
• Conformidade fiscal e contábil automatizada`;
    }
    
    // === DASHBOARD E MÉTRICAS ===
    if (lowerMessage.includes('interpretar') && lowerMessage.includes('gráficos')) {
      return `📊 **Como Interpretar Gráficos do Dashboard:**

**1. Gráfico de Receitas:**
• **Tendência:** Linha ascendente = crescimento, descendente = declínio
• **Sazonalidade:** Picos e vales regulares indicam padrões sazonais
• **Comparação:** Compare com períodos anteriores
• **Meta:** Verifique se está atingindo objetivos

**2. Gráfico de Despesas:**
• **Categorias:** Identifique maiores gastos
• **Tendência:** Aumento pode indicar necessidade de controle
• **Orçamento:** Compare com valores orçados
• **Eficiência:** Despesas vs receitas

**3. Gráfico de Lucro:**
• **Margem:** Lucro / Receita = % de margem
• **Crescimento:** Compare com períodos anteriores
• **Sazonalidade:** Identifique períodos de maior lucratividade
• **Meta:** Verifique se está atingindo metas

**4. Gráfico de Fluxo de Caixa:**
• **Positivo/Negativo:** Saldo positivo = saudável
• **Tendência:** Projeção para próximos meses
• **Sazonalidade:** Prepare-se para períodos de baixa
• **Reserva:** Mantenha reserva de emergência

**5. Gráfico de Contratos:**
• **Status:** Pendentes, em dia, vencidos
• **Valores:** Total por status
• **Tendência:** Crescimento da carteira
• **Ações:** Identifique contratos que precisam de atenção

**6. Indicadores de Performance:**
• **Verde:** Dentro da meta
• **Amarelo:** Atenção necessária
• **Vermelho:** Fora da meta, ação imediata

**7. Análise Comparativa:**
• **Mês Anterior:** Crescimento ou declínio
• **Ano Anterior:** Evolução anual
• **Meta:** Atingimento de objetivos
• **Benchmark:** Comparação com mercado

**8. Alertas e Notificações:**
• **Vencimentos:** Contratos próximos do vencimento
• **Metas:** Aproximação de limites
• **Anomalias:** Valores fora do padrão
• **Oportunidades:** Identificação de melhorias

**Dica:** Monitore os gráficos diariamente e identifique tendências para tomar decisões proativas.`;
    }
    
    if (lowerMessage.includes('margem') && lowerMessage.includes('lucro')) {
      return `💰 **Margem de Lucro - Análise Detalhada:**

**1. Tipos de Margem:**
• **Margem Bruta:** (Receita - CMV) / Receita × 100
  - *Fórmula:* (R$ 100.000 - R$ 60.000) / R$ 100.000 × 100 = 40%
  - *Interpretação:* Eficiência na produção/venda

• **Margem Operacional:** (EBIT / Receita) × 100
  - *Fórmula:* (R$ 20.000 / R$ 100.000) × 100 = 20%
  - *Interpretação:* Eficiência operacional

• **Margem Líquida:** (Lucro Líquido / Receita) × 100
  - *Fórmula:* (R$ 15.000 / R$ 100.000) × 100 = 15%
  - *Interpretação:* Rentabilidade final

**2. Análise de Margem:**
• **Comparação Histórica:** Evolução ao longo do tempo
• **Benchmarking:** Comparação com concorrentes
• **Meta:** Estabeleça metas realistas
• **Tendência:** Identifique padrões

**3. Fatores que Afetam a Margem:**
• **Preço de Venda:** Aumento = maior margem
• **Custo dos Produtos:** Redução = maior margem
• **Despesas Operacionais:** Controle = maior margem
• **Volume:** Economia de escala

**4. Estratégias para Melhorar Margem:**
• **Precificação:** Ajuste de preços
• **Redução de Custos:** Otimização de processos
• **Mix de Produtos:** Foque nos mais rentáveis
• **Eficiência:** Melhore produtividade

**5. Metas por Setor:**
• **Varejo:** 20-40% margem bruta
• **Serviços:** 30-60% margem bruta
• **Indústria:** 15-35% margem bruta
• **Tecnologia:** 40-80% margem bruta

**6. Monitoramento:**
• **Frequência:** Mensal
• **Relatórios:** Dashboards automáticos
• **Alertas:** Notificações de variações
• **Ações:** Planos de melhoria

**7. Análise de Variações:**
• **Favoráveis:** Identifique causas de sucesso
• **Desfavoráveis:** Investigue problemas
• **Ações:** Implemente correções
• **Acompanhamento:** Monitore resultados

**8. Ferramentas:**
• **Planilhas:** Cálculos manuais
• **ERP:** Relatórios automáticos
• **BI:** Dashboards interativos
• **Análise:** Software especializado

**Meta:** Aumentar margem líquida em 2-5% ao ano.`;
    }
    
    if (lowerMessage.includes('calcular') && lowerMessage.includes('roi')) {
      return `📈 **Como Calcular ROI (Return on Investment):**

**1. Fórmula Básica:**
• **ROI = (Lucro do Investimento - Custo do Investimento) / Custo do Investimento × 100**
• **Exemplo:** (R$ 50.000 - R$ 30.000) / R$ 30.000 × 100 = 66,67%

**2. Tipos de ROI:**
• **ROI Simples:** Investimento único, retorno único
• **ROI Anualizado:** Retorno por ano
• **ROI Periódico:** Retorno por período específico
• **ROI Acumulado:** Retorno total acumulado

**3. Cálculo com Período:**
• **ROI Anual = (Lucro Anual / Investimento) × 100**
• **Exemplo:** (R$ 12.000 / R$ 30.000) × 100 = 40% ao ano

**4. Cálculo com Tempo:**
• **ROI = (Lucro Total / Investimento) × 100 / Período em Anos**
• **Exemplo:** (R$ 24.000 / R$ 30.000) × 100 / 2 anos = 40% ao ano

**5. ROI de Projetos:**
• **Investimento:** Custo total do projeto
• **Retorno:** Benefícios financeiros gerados
• **Período:** Tempo de retorno
• **Cálculo:** ROI = (Benefícios - Custos) / Custos × 100

**6. ROI de Marketing:**
• **Investimento:** Gastos com marketing
• **Retorno:** Receita gerada
• **Cálculo:** ROI = (Receita - Investimento) / Investimento × 100
• **Exemplo:** (R$ 100.000 - R$ 20.000) / R$ 20.000 × 100 = 400%

**7. ROI de Treinamento:**
• **Investimento:** Custo do treinamento
• **Retorno:** Aumento de produtividade
• **Cálculo:** ROI = (Produtividade - Investimento) / Investimento × 100

**8. ROI de Tecnologia:**
• **Investimento:** Custo do sistema
• **Retorno:** Economia gerada
• **Cálculo:** ROI = (Economia - Investimento) / Investimento × 100

**9. Interpretação do ROI:**
• **ROI > 0:** Investimento rentável
• **ROI = 0:** Investimento neutro
• **ROI < 0:** Investimento prejuízo
• **ROI > 15%:** Investimento excelente

**10. Limitações do ROI:**
• **Não considera tempo:** Valor do dinheiro no tempo
• **Não considera risco:** Probabilidade de retorno
• **Não considera inflação:** Poder de compra
• **Não considera custos:** Custos de oportunidade

**11. Alternativas ao ROI:**
• **NPV (Valor Presente Líquido):** Considera tempo
• **IRR (Taxa Interna de Retorno):** Considera tempo
• **Payback:** Tempo de retorno
• **ROA (Return on Assets):** Retorno sobre ativos

**12. Boas Práticas:**
• **Consistência:** Use mesma metodologia
• **Período:** Defina período de análise
• **Custos:** Inclua todos os custos
• **Benefícios:** Quantifique benefícios

**Meta:** ROI mínimo de 15% ao ano para novos investimentos.`;
    }
    
    if (lowerMessage.includes('métricas') && lowerMessage.includes('importantes')) {
      return `🎯 **Métricas Mais Importantes para Acompanhar:**

**1. Métricas Financeiras:**
• **Receita Líquida:** Crescimento mensal e anual
• **Margem Bruta:** Eficiência na produção/venda
• **Margem Líquida:** Rentabilidade final
• **Fluxo de Caixa:** Entradas vs saídas

**2. Métricas Operacionais:**
• **Produtividade:** Receita por funcionário
• **Eficiência:** Custos por unidade produzida
• **Qualidade:** Taxa de retorno/reclamações
• **Tempo:** Tempo de ciclo de processos

**3. Métricas de Clientes:**
• **Satisfação:** NPS (Net Promoter Score)
• **Retenção:** Taxa de retenção de clientes
• **Aquisição:** Custo de aquisição de clientes
• **Lifetime Value:** Valor vitalício do cliente

**4. Métricas de Vendas:**
• **Volume:** Quantidade vendida
• **Ticket Médio:** Valor médio por venda
• **Conversão:** Taxa de conversão
• **Crescimento:** Crescimento de vendas

**5. Métricas de Marketing:**
• **ROI:** Retorno sobre investimento
• **CAC:** Custo de aquisição de clientes
• **LTV:** Lifetime value do cliente
• **Engajamento:** Taxa de engajamento

**6. Métricas de Recursos Humanos:**
• **Turnover:** Taxa de rotatividade
• **Satisfação:** Satisfação dos funcionários
• **Produtividade:** Receita por funcionário
• **Treinamento:** Investimento em capacitação

**7. Métricas de Qualidade:**
• **Defeitos:** Taxa de defeitos
• **Retrabalho:** Tempo gasto em retrabalho
• **Reclamações:** Número de reclamações
• **Certificação:** Manutenção de certificações

**8. Métricas de Inovação:**
• **Novos Produtos:** Lançamentos por ano
• **Pesquisa:** Investimento em P&D
• **Patentes:** Número de patentes
• **Melhorias:** Implementação de melhorias

**9. Métricas de Sustentabilidade:**
• **Emissões:** Redução de emissões
• **Resíduos:** Redução de resíduos
• **Energia:** Eficiência energética
• **Reciclagem:** Taxa de reciclagem

**10. Métricas de Compliance:**
• **Auditoria:** Resultados de auditorias
• **Conformidade:** Taxa de conformidade
• **Treinamento:** Funcionários treinados
• **Documentação:** Documentos atualizados

**11. Frequência de Acompanhamento:**
• **Diárias:** Vendas, fluxo de caixa
• **Semanais:** Produtividade, qualidade
• **Mensais:** Todas as métricas
• **Trimestrais:** Análise comparativa

**12. Dashboards:**
• **Executivo:** Visão geral da empresa
• **Operacional:** Métricas por área
• **Financeiro:** Indicadores financeiros
• **Estratégico:** Metas e objetivos

**Dica:** Foque nas 10-15 métricas mais importantes para sua empresa.`;
    }
    
    if (lowerMessage.includes('dashboard') || lowerMessage.includes('gráfico')) {
      return `📊 **Dashboard Financeiro - Análise e Interpretação:**

**Métricas Principais:**
• **Receita Líquida:** Crescimento mensal e tendências
• **Margem Bruta:** Rentabilidade dos produtos/serviços
• **EBITDA:** Lucro antes de juros, impostos e depreciação
• **Fluxo de Caixa:** Entradas vs saídas em tempo real

**Análise de Despesas:**
• **Por Categoria:** Identificação de maiores custos
• **Variações:** Comparação com períodos anteriores
• **Orçamento vs Realizado:** Controle de desvios
• **Eficiência:** ROI por área de investimento

**Indicadores de Performance:**
• **Crescimento:** Taxa de crescimento mensal/anual
• **Liquidez:** Capacidade de pagamento
• **Endividamento:** Nível de alavancagem
• **Rentabilidade:** Retorno sobre patrimônio

**Gráficos e Visualizações:**
• **Tendências:** Linhas de evolução temporal
• **Comparativos:** Barras e colunas
• **Distribuição:** Pizza e rosca
• **Correlações:** Scatter plots e heatmaps

**Ações Recomendadas:**
• Configure alertas para indicadores críticos
• Automatize relatórios executivos
• Implemente drill-down para análises detalhadas
• Integre com ferramentas de BI avançadas`;
    }
    
    // Resposta padrão inteligente - apenas quando não há palavras-chave específicas
    const responses = [
      `🤖 **IA Financeira Especializada:**

Olá! Sou sua assistente financeira com expertise em:

**Áreas de Especialização:**
• **Gestão Contratual:** Análise, estruturação e gestão de contratos
• **Assinatura Digital:** Implementação e conformidade legal
• **Análise Financeira:** Indicadores, métricas e relatórios
• **Sistemas ERP:** Implementação e otimização de processos
• **Compliance:** Conformidade fiscal e regulatória

**Como Posso Ajudar:**
• Análise detalhada de documentos e contratos
• Insights estratégicos baseados em dados
• Recomendações para otimização de processos
• Suporte em decisões financeiras críticas

**Exemplos de Perguntas:**
• "Como melhorar minha gestão financeira?"
• "Como identificar riscos em contratos?"
• "Como funciona a assinatura digital?"
• "Quais indicadores financeiros acompanhar?"

Qual área específica você gostaria de explorar?`,

      `💡 **Consultoria Estratégica:**

Com base na sua consulta, recomendo uma abordagem estruturada:

**Análise Situacional:**
• **Diagnóstico:** Avaliação do estado atual
• **Benchmarking:** Comparação com melhores práticas
• **Gap Analysis:** Identificação de lacunas e oportunidades
• **Priorização:** Foco nas iniciativas de maior impacto

**Plano de Ação:**
• **Objetivos SMART:** Metas específicas e mensuráveis
• **Cronograma:** Marcos e entregas definidas
• **Recursos:** Alocação de pessoas e ferramentas
• **Monitoramento:** KPIs e controles de performance

**Próximos Passos:**
• Defina claramente o escopo do projeto
• Estabeleça métricas de sucesso
• Implemente controles de qualidade
• Revise e ajuste regularmente

Precisa de orientação em algum aspecto específico?`,

      `📈 **Insights Financeiros Avançados:**

Para elevar sua gestão financeira ao próximo nível:

**Análise Quantitativa:**
• **Modelagem Financeira:** Projeções e cenários
• **Análise de Sensibilidade:** Impacto de variáveis
• **Otimização:** Alocação eficiente de recursos
• **Valor Presente:** Avaliação de investimentos

**Análise Qualitativa:**
• **Análise SWOT:** Forças, fraquezas, oportunidades e ameaças
• **Análise de Stakeholders:** Impacto de partes interessadas
• **Análise de Riscos:** Identificação e mitigação
• **Análise de Mercado:** Tendências e competitividade

**Ferramentas Recomendadas:**
• **BI/Analytics:** Tableau, Power BI, QlikView
• **Modelagem:** Excel avançado, Python, R
• **ERP/CRM:** SAP, Oracle, Microsoft Dynamics
• **Compliance:** Ferramentas de auditoria e controle

**Implementação:**
• Comece com projetos piloto
• Treine a equipe adequadamente
• Monitore resultados continuamente
• Escale sucessos comprovados

Gostaria de aprofundar algum desses aspectos?`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Método para simular assinatura digital usando IA
  simulateDigitalSignature(contractText: string): Observable<ChatResponse> {
    const prompt = `Analise o seguinte contrato e simule uma assinatura digital segura. 
    Forneça um resumo dos pontos principais e confirme se o contrato está pronto para assinatura:
    
    ${contractText}
    
    Responda como um especialista em assinatura digital e análise contratual.`;

    return this.sendMessage(prompt);
  }

  // Método para análise financeira
  analyzeFinancialData(data: any): Observable<ChatResponse> {
    const prompt = `Analise os seguintes dados financeiros e forneça insights e recomendações:
    
    ${JSON.stringify(data, null, 2)}
    
    Foque em tendências, riscos e oportunidades de melhoria.`;

    return this.sendMessage(prompt);
  }
}
