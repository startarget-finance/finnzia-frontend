import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ClintService } from '../../services/clint.service';
import { GoogleSheetsService } from '../../services/google-sheets.service';
import { ComparacaoServicosComponent, FeatureComparacao } from '../comparacao-servicos/comparacao-servicos.component';
import { API_CONFIG } from '../../config/api.config';

@Component({
  standalone: true,
  selector: 'app-landing',
  imports: [CommonModule, FormsModule, ComparacaoServicosComponent],
  templateUrl: './landing.component.html'
})
export class LandingComponent implements OnInit, AfterViewInit {
  // Dados do formulário de diagnóstico
  formData = {
    nome: '',
    email: '',
    telefone: '',
    segmento: '',
    faturamento: '',
    contexto: ''
  };

  // Número do WhatsApp
  readonly whatsappNumber = '554991984101';

  // Segmento atual (para mostrar apenas uma seção)
  segmentoAtual: string | null = null;

  // Se deve mostrar apenas o formulário de diagnóstico
  apenasDiagnostico: boolean = false;

  // Estado do menu mobile
  menuMobileAberto = false;

  // Estado do carousel de vídeos
  videoAtualIndex = 0;
  videos = [
    { id: 'video1', src: '/assets/videos/depoimento.mp4' },
    { id: 'video2', src: '/assets/videos/depoimento1.mp4' },
    { id: 'video3', src: '/assets/videos/depoimento2.mp4' }
  ];

  // Estado do carousel de vídeos de agências
  videoAgenciaAtualIndex = 0;
  videosAgencias = [
    { id: 'video-agencia1', src: '/assets/videos/depoimento.mp4' },
    { id: 'video-agencia2', src: '/assets/videos/depoimento2.mp4' },
    { id: 'video-agencia3', src: '/assets/videos/depoimento1.mp4' }
  ];

  // Estado do carousel de depoimentos escritos
  depoimentoAtualIndex = 0;
  swipeStartX = 0;
  swipeStartY = 0;
  isSwiping = false;
  depoimentos = [
    {
      empresa: 'Oduo',
      tipo: 'Agência de Marketing',
      texto: 'A Finzzia trouxe previsibilidade que não tínhamos. Agora sabemos exatamente quanto sobra por cliente e podemos tomar decisões com segurança.'
    },
    {
      empresa: 'Vitor',
      tipo: 'Fundador',
      texto: 'Finalmente conseguimos separar o financeiro pessoal do empresarial. A clareza que temos agora é incomparável.'
    },
    {
      empresa: 'Olavo',
      tipo: 'CEO',
      texto: 'A Finzzia transformou completamente nossa gestão financeira. Agora temos controle total e visibilidade em tempo real.'
    },
    {
      empresa: 'Karina',
      tipo: 'Diretora Financeira',
      texto: 'O suporte humanizado e a análise estratégica mensal fazem toda a diferença. Recomendo sem hesitação!'
    },
    {
      empresa: 'Vitor',
      tipo: 'Fundador',
      texto: 'Finalmente conseguimos separar o financeiro pessoal do empresarial. A clareza que temos agora é incomparável.'
    }
  ];

  // Estado de envio
  enviandoClint = false;
  salvandoDiagnostico = false;
  diagnosticoSalvo = false;

  // URL do Google Sheets para o formulário HTML
  googleSheetsUrl = API_CONFIG.GOOGLE_SHEETS_WEB_APP_URL || '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private clintService: ClintService,
    private googleSheetsService: GoogleSheetsService
  ) {}

  ngOnInit(): void {
    // Verificar se deve mostrar apenas o diagnóstico
    this.apenasDiagnostico = this.route.snapshot.data['apenasDiagnostico'] || false;
    
    // Verificar se há um segmento específico na rota
    this.segmentoAtual = this.route.snapshot.data['segmento'] || null;
    
    // Pré-preencher o segmento no formulário se houver um segmento específico
    if (this.segmentoAtual) {
      const mapeamentoSegmentos: { [key: string]: string } = {
        'restaurantes': 'Restaurante',
        'prestadores': 'Prestador de Serviço',
        'agencias': 'Agência de Marketing'
      };
      this.formData.segmento = mapeamentoSegmentos[this.segmentoAtual] || '';
    }
    
    // Se houver segmento específico, fazer scroll automático após um pequeno delay
    if (this.segmentoAtual && !this.apenasDiagnostico) {
      setTimeout(() => {
        this.scrollToSegmento(this.segmentoAtual!);
      }, 300);
    }
  }

  // Verificar se deve mostrar uma seção específica
  mostrarSecao(secao: string): boolean {
    // Só mostrar seções quando há um segmento específico (não na home)
    if (!this.segmentoAtual) {
      return false; // Não mostrar seções na home
    }
    // Mapear nomes das seções (o que vem na rota vs o ID da seção)
    const mapeamento: { [key: string]: string[] } = {
      'restaurantes': ['restaurantes'],
      'prestadores': ['servicos', 'prestadores'],
      'agencias': ['agencias']
    };
    
    const secoesPermitidas = mapeamento[this.segmentoAtual] || [];
    return secoesPermitidas.includes(secao);
  }

  // Scroll para o segmento específico
  scrollToSegmento(segmento: string): void {
    let elementoId = '';
    switch(segmento) {
      case 'restaurantes':
        elementoId = 'restaurantes';
        break;
      case 'prestadores':
        elementoId = 'servicos';
        break;
      case 'agencias':
        elementoId = 'agencias';
        break;
    }
    
    if (elementoId) {
      const el = document.getElementById(elementoId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  toggleMenuMobile(): void {
    this.menuMobileAberto = !this.menuMobileAberto;
    if (this.menuMobileAberto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  fecharMenuMobile(): void {
    this.menuMobileAberto = false;
    document.body.style.overflow = '';
  }

  // Métodos do carousel de vídeos
  proximoVideo(): void {
    this.pausarVideoAtual();
    this.videoAtualIndex = (this.videoAtualIndex + 1) % this.videos.length;
    setTimeout(() => this.setupVideoAtual(), 100);
  }

  videoAnterior(): void {
    this.pausarVideoAtual();
    this.videoAtualIndex = (this.videoAtualIndex - 1 + this.videos.length) % this.videos.length;
    setTimeout(() => this.setupVideoAtual(), 100);
  }

  private pausarVideoAtual(): void {
    const videoAtual = this.videos[this.videoAtualIndex];
    if (videoAtual) {
      const mainVideo = document.querySelector(`video[data-video-id="${videoAtual.id}-main"]`) as HTMLVideoElement;
      if (mainVideo && !mainVideo.paused) {
        mainVideo.pause();
      }
    }
  }

  private setupVideoAtual(): void {
    const videoAtual = this.videos[this.videoAtualIndex];
    if (videoAtual) {
      const previewVideo = document.querySelector(`video[data-video-id="${videoAtual.id}"]`) as HTMLVideoElement;
      const mainVideo = document.querySelector(`video[data-video-id="${videoAtual.id}-main"]`) as HTMLVideoElement;
      const poster = document.querySelector('.video-poster') as HTMLElement;
      
      if (previewVideo) {
        previewVideo.classList.remove('hidden');
        previewVideo.currentTime = 0.1;
        previewVideo.pause();
      }
      
      if (mainVideo) {
        mainVideo.classList.add('hidden');
        mainVideo.pause();
        mainVideo.currentTime = 0;
      }
      
      if (poster) {
        poster.style.display = 'flex';
      }
    }
  }

  // Métodos do carousel de vídeos de agências
  proximoVideoAgencia(): void {
    this.pausarVideoAgenciaAtual();
    this.videoAgenciaAtualIndex = (this.videoAgenciaAtualIndex + 1) % this.videosAgencias.length;
    setTimeout(() => this.setupVideoAgenciaAtual(), 100);
  }

  videoAgenciaAnterior(): void {
    this.pausarVideoAgenciaAtual();
    this.videoAgenciaAtualIndex = (this.videoAgenciaAtualIndex - 1 + this.videosAgencias.length) % this.videosAgencias.length;
    setTimeout(() => this.setupVideoAgenciaAtual(), 100);
  }

  private pausarVideoAgenciaAtual(): void {
    const videoAtual = this.videosAgencias[this.videoAgenciaAtualIndex];
    if (videoAtual) {
      const mainVideo = document.querySelector(`video[data-video-id="${videoAtual.id}-main"]`) as HTMLVideoElement;
      if (mainVideo && !mainVideo.paused) {
        mainVideo.pause();
      }
    }
  }

  private setupVideoAgenciaAtual(): void {
    const videoAtual = this.videosAgencias[this.videoAgenciaAtualIndex];
    if (videoAtual) {
      const container = document.querySelector('.video-container-agencia') as HTMLElement;
      if (!container) return;
      
      const previewVideo = container.querySelector(`video[data-video-id="${videoAtual.id}"]`) as HTMLVideoElement;
      const mainVideo = container.querySelector(`video[data-video-id="${videoAtual.id}-main"]`) as HTMLVideoElement;
      const poster = container.querySelector('.video-poster') as HTMLElement;
      
      if (previewVideo) {
        previewVideo.classList.remove('hidden');
        previewVideo.currentTime = 0.1;
        previewVideo.pause();
      }
      
      if (mainVideo) {
        mainVideo.classList.add('hidden');
        mainVideo.pause();
        mainVideo.currentTime = 0;
      }
      
      if (poster) {
        poster.style.display = 'flex';
      }
    }
  }

  // Métodos do carousel de depoimentos
  proximoDepoimento(): void {
    this.depoimentoAtualIndex = (this.depoimentoAtualIndex + 1) % this.depoimentos.length;
  }

  depoimentoAnterior(): void {
    this.depoimentoAtualIndex = (this.depoimentoAtualIndex - 1 + this.depoimentos.length) % this.depoimentos.length;
  }

  irParaDepoimento(index: number): void {
    this.depoimentoAtualIndex = index;
  }

  // Métodos para swipe nos depoimentos escritos
  onDepoimentoTouchStart(event: TouchEvent): void {
    this.swipeStartX = event.touches[0].clientX;
    this.swipeStartY = event.touches[0].clientY;
    this.isSwiping = false;
  }

  onDepoimentoTouchMove(event: TouchEvent): void {
    if (!this.swipeStartX || !this.swipeStartY) return;
    
    const deltaX = event.touches[0].clientX - this.swipeStartX;
    const deltaY = event.touches[0].clientY - this.swipeStartY;
    
    // Verificar se é um swipe horizontal (não vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      this.isSwiping = true;
    }
  }

  onDepoimentoTouchEnd(event: TouchEvent): void {
    if (!this.isSwiping || !this.swipeStartX) {
      this.swipeStartX = 0;
      this.swipeStartY = 0;
      return;
    }

    const deltaX = event.changedTouches[0].clientX - this.swipeStartX;
    const threshold = 50; // Mínimo de pixels para considerar swipe

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        // Swipe para direita - depoimento anterior
        this.depoimentoAnterior();
      } else {
        // Swipe para esquerda - próximo depoimento
        this.proximoDepoimento();
      }
    }

    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.isSwiping = false;
  }

  // Métodos para mouse drag nos depoimentos escritos
  onDepoimentoMouseDown(event: MouseEvent): void {
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
    this.isSwiping = false;
    event.preventDefault();
  }

  onDepoimentoMouseMove(event: MouseEvent): void {
    if (!this.swipeStartX || !this.swipeStartY) return;
    
    const deltaX = event.clientX - this.swipeStartX;
    const deltaY = event.clientY - this.swipeStartY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      this.isSwiping = true;
    }
  }

  onDepoimentoMouseUp(event: MouseEvent): void {
    if (!this.isSwiping || !this.swipeStartX) {
      this.swipeStartX = 0;
      this.swipeStartY = 0;
      return;
    }

    const deltaX = event.clientX - this.swipeStartX;
    const threshold = 50;

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        this.depoimentoAnterior();
      } else {
        this.proximoDepoimento();
      }
    }

    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.isSwiping = false;
  }

  scrollToDiagnostico(): void {
    // Se estiver na rota de diagnóstico, não precisa fazer nada
    if (this.apenasDiagnostico) {
      return;
    }
    
    // Se estiver na home ou em outra página, redirecionar para /diagnostico
    if (!this.segmentoAtual) {
      this.router.navigate(['/diagnostico']);
      return;
    }
    
    // Se estiver em uma página de segmento, fazer scroll
    const el = document.getElementById('diagnostico');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }


  /**
   * Envia o formulário para a Clint
   */
  enviarFormulario(event?: Event): void {
    // Prevenir comportamento padrão do formulário
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    console.log('Enviando formulário...', this.formData);

    // Validação básica
    if (!this.formData.nome || !this.formData.email) {
      alert('Por favor, preencha pelo menos o nome e email.');
      return;
    }

    // Enviar para a Clint
    this.enviarParaClint();
  }

  salvarDiagnostico(event?: Event): void {
    // Prevenir comportamento padrão do formulário
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Validação básica
    if (!this.formData.nome || !this.formData.email) {
      alert('Por favor, preencha pelo menos o nome e email.');
      return;
    }

    // Estado de loading
    this.salvandoDiagnostico = true;
    this.diagnosticoSalvo = false;

    console.log('Salvando diagnóstico...', this.formData);

    // Salvar dados no Google Sheets
    this.googleSheetsService.salvarDiagnostico({
      nome: this.formData.nome,
      email: this.formData.email,
      telefone: this.formData.telefone,
      segmento: this.formData.segmento,
      faturamento: this.formData.faturamento,
      contexto: this.formData.contexto
    }).subscribe({
      next: (result) => {
        this.salvandoDiagnostico = false;
        if (result.success) {
          console.log('Dados salvos no Google Sheets com sucesso');
          this.diagnosticoSalvo = true;
          // Limpar formulário após salvar
          this.limparFormulario();
          // Esconder mensagem de sucesso após 5 segundos
          setTimeout(() => {
            this.diagnosticoSalvo = false;
          }, 5000);
        } else {
          console.warn('Não foi possível salvar no Google Sheets:', result.message);
          alert('Erro ao salvar diagnóstico. Por favor, tente novamente.');
        }
      },
      error: (error) => {
        this.salvandoDiagnostico = false;
        console.error('Erro ao salvar no Google Sheets:', error);
        alert('Erro ao salvar diagnóstico. Por favor, tente novamente.');
      }
    });
  }

  /**
   * Extrai DDI e número do telefone
   */
  private extrairDDIeTelefone(telefone: string): { ddi: string; phone: string } {
    if (!telefone) {
      return { ddi: '', phone: '' };
    }

    // Remove caracteres não numéricos
    const numeros = telefone.replace(/\D/g, '');

    // Se começar com 55 (Brasil), extrai DDI
    if (numeros.startsWith('55') && numeros.length >= 12) {
      return {
        ddi: '55',
        phone: numeros.substring(2) // Remove o 55 do início
      };
    }

    // Se começar com 0 e depois 55, remove o 0
    if (numeros.startsWith('055') && numeros.length >= 13) {
      return {
        ddi: '55',
        phone: numeros.substring(3)
      };
    }

    // Se não tiver DDI explícito, assume Brasil (55) e usa o número completo
    if (numeros.length >= 10) {
      return {
        ddi: '55',
        phone: numeros
      };
    }

    // Caso padrão
    return {
      ddi: '55',
      phone: numeros
    };
  }

  /**
   * Envia os dados do formulário para a Clint via webhook
   */
  enviarParaClint(): void {
    this.enviandoClint = true;

    // Extrair DDI e telefone
    const { ddi, phone } = this.extrairDDIeTelefone(this.formData.telefone);

    // Preparar dados para a Clint
    // A Clint espera campos customizados dentro do objeto 'fields'
    // Os nomes dos campos devem corresponder aos campos configurados na Clint
    const contactData: any = {
      name: this.formData.nome,
      email: this.formData.email,
      username: this.formData.email.split('@')[0], // Usa a parte antes do @ como username
      fields: {}
    };

    // Adicionar telefone e DDI apenas se preenchidos
    if (phone) {
      contactData.ddi = ddi;
      contactData.phone = phone;
    }

    // Adicionar campos customizados no objeto fields
    // IMPORTANTE: Os nomes devem corresponder EXATAMENTE aos campos mapeados na Clint
    
    // Segmento → "Segmento" na Clint
    if (this.formData.segmento) {
      contactData.fields['Segmento'] = this.formData.segmento;
    }

    // Faturamento mensal aproximado → "Número de funcionários" na Clint
    if (this.formData.faturamento) {
      contactData.fields['Número de funcionários'] = this.formData.faturamento;
    }

    // Contexto / principal dor → "Notas do contato" na Clint
    if (this.formData.contexto) {
      contactData.fields['Notas do contato'] = this.formData.contexto;
    }

    // Campos adicionais de rastreamento
    contactData.fields['Origem'] = 'Landing Page - Diagnóstico';
    contactData.fields['Data de envio'] = new Date().toISOString();

    this.clintService.createContact(contactData).subscribe({
      next: (response) => {
        console.log('Contato criado na Clint com sucesso:', response);
        this.enviandoClint = false;
        
        // Mostrar mensagem de sucesso
        alert('Formulário enviado com sucesso! Entraremos em contato em breve.');
        
        // Limpar formulário após sucesso
        this.formData = {
          nome: '',
          email: '',
          telefone: '',
          segmento: '',
          faturamento: '',
          contexto: ''
        };
      },
      error: (error) => {
        console.error('Erro ao enviar para a Clint:', error);
        this.enviandoClint = false;
        
        // Mostrar mensagem de erro
        alert('Erro ao enviar formulário. Por favor, tente novamente ou entre em contato pelo WhatsApp.');
      }
    });
  }

  /**
   * Limpa o formulário de diagnóstico
   */
  limparFormulario(): void {
    this.formData = {
      nome: '',
      email: '',
      telefone: '',
      segmento: '',
      faturamento: '',
      contexto: ''
    };
  }

  // Método para obter a URL do WhatsApp para o botão flutuante
  getWhatsAppUrl(): string {
    const mensagem = 'Olá! Gostaria de saber mais sobre a Finzzia.';
    const mensagemEncoded = encodeURIComponent(mensagem);
    return `https://wa.me/${this.whatsappNumber}?text=${mensagemEncoded}`;
  }

  // Métodos para controlar reprodução de vídeos
  playingVideos: { [key: string]: boolean } = {};

  ngAfterViewInit(): void {
    // Configurar vídeos para mostrar primeiro frame como capa
    this.setupVideoPosters();
  }

  setupVideoPosters(): void {
    // IDs dos vídeos do carousel principal
    const videoIds = this.videos.map(v => v.id);
    // IDs dos vídeos das seções de agências
    const agenciaVideoIds = ['video-agencia1', 'video-agencia2', 'video-agencia3'];
    const allVideoIds = [...videoIds, ...agenciaVideoIds];
    
    allVideoIds.forEach(videoId => {
      const previewVideo = document.querySelector(`video[data-video-id="${videoId}"]`) as HTMLVideoElement;
      if (!previewVideo) return;

      // Garantir que o vídeo está pausado e no primeiro frame
      previewVideo.pause();
      previewVideo.currentTime = 0;
      
      // Quando o vídeo carregar metadados, garantir primeiro frame
      previewVideo.addEventListener('loadedmetadata', () => {
        previewVideo.currentTime = 0.1; // Pequeno offset para garantir que há frame
        previewVideo.pause();
      });

      // Quando o vídeo carregar dados suficientes, garantir primeiro frame
      previewVideo.addEventListener('loadeddata', () => {
        previewVideo.currentTime = 0.1;
        previewVideo.pause();
      });

      // Tentar carregar o primeiro frame
      previewVideo.load();
    });
  }

  onVideoMetadataLoaded(videoId: string, event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video) {
      // Garantir que o vídeo está no primeiro frame e pausado
      video.currentTime = 0.1;
      video.pause();
    }
  }

  playVideo(videoId: string, event?: Event): void {
    // Encontrar o container do vídeo (pode ser .video-container ou .video-container-agencia)
    let container = document.querySelector('.video-container') as HTMLElement;
    if (!container) {
      container = document.querySelector('.video-container-agencia') as HTMLElement;
    }
    
    if (!container) {
      console.error('Container de vídeo não encontrado');
      return;
    }
    
    // Encontrar os vídeos dentro do container (mesmo que estejam ocultos)
    const previewVideo = container.querySelector(`video[data-video-id="${videoId}"]`) as HTMLVideoElement;
    const mainVideo = container.querySelector(`video[data-video-id="${videoId}-main"]`) as HTMLVideoElement;
    const poster = container.querySelector('.video-poster') as HTMLElement;
    
    if (previewVideo) {
      previewVideo.classList.add('hidden');
    }
    
    if (poster) {
      poster.style.display = 'none';
    }
    
    if (mainVideo) {
      mainVideo.classList.remove('hidden');
      mainVideo.muted = false;
      mainVideo.play().catch(error => {
        console.error('Erro ao reproduzir vídeo:', error);
      });
    }
    
    this.playingVideos[videoId] = true;
  }

  pauseVideo(videoId: string, event: Event): void {
    const video = event.target as HTMLVideoElement;
    
    // Encontrar o container do vídeo (pode ser .video-container ou .video-container-agencia)
    let container = document.querySelector('.video-container') as HTMLElement;
    if (!container) {
      container = document.querySelector('.video-container-agencia') as HTMLElement;
    }
    
    if (!container) return;
    
    const previewVideo = container.querySelector(`video[data-video-id="${videoId}"]`) as HTMLVideoElement;
    const mainVideo = container.querySelector(`video[data-video-id="${videoId}-main"]`) as HTMLVideoElement;
    const poster = container.querySelector('.video-poster') as HTMLElement;
    
    if (poster && video.paused) {
      // Mostrar preview e poster novamente
      if (previewVideo) {
        previewVideo.classList.remove('hidden');
      }
      if (mainVideo) {
        mainVideo.classList.add('hidden');
      }
      poster.style.display = 'flex';
    }
    
    this.playingVideos[videoId] = false;
  }
  
  onPosterClick(videoId: string): void {
    this.playVideo(videoId);
  }
}

