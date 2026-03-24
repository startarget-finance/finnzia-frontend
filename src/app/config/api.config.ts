// Configuração da API - Opções gratuitas
// Escolha uma das opções abaixo:

export const API_CONFIG = {
  // OPÇÃO 1: Hugging Face (GRATUITA)
  HUGGINGFACE_API_KEY: 'hf_your_token_here', // Configure seu token aqui
  HUGGINGFACE_API_URL: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
  
  // OPÇÃO 2: OpenAI (Pode ter créditos gratuitos)
  OPENAI_API_KEY: 'sk-your-openai-api-key-here', // Configure sua chave aqui
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  
  // OPÇÃO 3: API Local/Simulada (SEMPRE GRATUITA)
  USE_MOCK_API: true, // Mude para false para usar APIs reais de IA

  // OPÇÃO 4: Chamar a IA via Backend (recomendado)
  // Assim você não precisa colocar chaves (OpenAI/HuggingFace) no frontend.
  USE_BACKEND_AI: true,
  
  // Configurações gerais de IA
  MODEL: 'gpt-4o-mini',
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7,

  // ===========================
  // BACKEND FINNZA / AUTENTICAÇÃO
  // ===========================

  // URL base do backend Spring Boot
  // Detecta automaticamente: localhost em dev, Render em produção
  // Você pode forçar uma URL específica definindo a variável de ambiente BACKEND_API_URL
  BACKEND_API_URL: (() => {
    // Se tiver variável de ambiente definida (útil para builds de produção), usa ela
    if (typeof process !== 'undefined' && process.env['BACKEND_API_URL']) {
      return process.env['BACKEND_API_URL'];
    }
    
    // Detecta se está rodando localmente (desenvolvimento)
    const isLocalhost = typeof window !== 'undefined' && 
                       (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '');
    
    // Em desenvolvimento: usa localhost
    // Em produção (deploy): usa a URL do Render
    return isLocalhost 
      ? 'http://localhost:8080'  // Desenvolvimento local
      : 'https://finnzia-backend.onrender.com';  // Produção (Render)
  })(),

  // Flag para usar login mockado no front (false = usar backend real)
  USE_BACKEND_MOCK_AUTH: false,

  // ===========================
  // CLINT - INTEGRAÇÃO WEBHOOK
  // ===========================
  // Webhook da Clint para integração de formulários
  // IMPORTANTE: Este webhook é público e seguro, mas não deve ser exposto em repositórios públicos
  CLINT_WEBHOOK_URL: 'https://functions-api.clint.digital/endpoints/integration/webhook/1a4381ef-bc1a-4a6f-81a9-8ce684649adb',

  // ===========================
  // GOOGLE SHEETS - INTEGRAÇÃO
  // ===========================
  // URL do Google Apps Script Web App para salvar diagnósticos
  GOOGLE_SHEETS_WEB_APP_URL: (() => {
    // Pode ser configurado via variável de ambiente
    if (typeof process !== 'undefined' && process.env['GOOGLE_SHEETS_WEB_APP_URL']) {
      return process.env['GOOGLE_SHEETS_WEB_APP_URL'];
    }
    // URL do Google Apps Script configurada
    return 'https://script.google.com/macros/s/AKfycbzzaeEpB7exFpSgQPdpLoe1nnjXag4tM2Gg58B-K1oSznDHYmFnkmiTwAaMtJkomW42/exec';
  })(),

  // ===========================
  // LANDING — DIAGNÓSTICO (sem backend Finnzia)
  // ===========================
  // URL carregada em iframe na seção "diagnóstico" da landing.
  //
  // Prioridade: variável de ambiente LANDING_DIAGNOSTICO_EMBED_URL (build/CI — ver guia no fim do arquivo).
  // Senão: use o valor em FALLBACK abaixo (cole a URL real entre aspas).
  //
  LANDING_DIAGNOSTICO_EMBED_URL: (() => {
    if (typeof process !== 'undefined' && process.env['LANDING_DIAGNOSTICO_EMBED_URL']) {
      return String(process.env['LANDING_DIAGNOSTICO_EMBED_URL']).trim();
    }
    /** Typeform — diagnóstico / leads (produção local sem env) */
    const FALLBACK = 'https://form.typeform.com/to/sgXL5eR6';
    return FALLBACK.trim();
  })()
};

// INSTRUÇÕES PARA APIs GRATUITAS:

// 1. HUGGING FACE (RECOMENDADO - GRATUITO):
//    - Acesse: https://huggingface.co/settings/tokens
//    - Crie um token gratuito
//    - Substitua 'hf_your_token_here' pelo seu token
//    - Mude USE_MOCK_API para false

// 2. OPENAI (CRÉDITOS GRATUITOS):
//    - Acesse: https://platform.openai.com/api-keys
//    - Use os créditos gratuitos iniciais
//    - Substitua 'sk-your-openai-api-key-here' pela sua chave

// 3. MOCK API (SEMPRE FUNCIONA):
//    - Mantenha USE_MOCK_API: true
//    - Respostas simuladas inteligentes
//    - Perfeito para demonstração
//
// 4. LANDING — FORMULÁRIO DE DIAGNÓSTICO (Typeform / Responde.ai / outro):
//
//    TYPEFORM
//    - Crie o form em https://www.typeform.com → publicar.
//    - Share (Compartilhar) → copie o link do typeform. Formato típico:
//        https://form.typeform.com/to/XXXXXXXX
//    - Cole essa URL em api.config.ts em FALLBACK (const FALLBACK = '...') OU defina no deploy:
//        variável de ambiente LANDING_DIAGNOSTICO_EMBED_URL com o mesmo valor.
//    - Campos ocultos: a landing envia ?segmento=agencias|restaurantes|prestadores e utm_source=finnzia-landing
//      quando o visitante veio de uma rota de segmento; no Typeform, crie hidden fields com esses nomes
//      para receber os valores (ou ignore se não precisar).
//
//    RESPONDE.AI
//    - No painel, abra o fluxo/link público ou a opção de embed/incorporar.
//    - Use a URL que abre direto o formulário/conversa no navegador, desde que o provedor permita iframe.
//      Se a página bloquear iframe (tela em branco), use só o link "Abrir em nova aba" na landing ou peça ao
//      suporte do Responde o modo embed oficial.
//
//    BUILD (produção sem commitar URL no repo)
//    - Ex.: LANDING_DIAGNOSTICO_EMBED_URL=https://form.typeform.com/to/SEU_ID npx ng build
//    - No Netlify/Vercel/GitHub Actions: adicione a mesma variável nas configurações do projeto.