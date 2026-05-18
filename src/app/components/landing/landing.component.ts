import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ComparacaoServicosComponent } from '../comparacao-servicos/comparacao-servicos.component';
import { DiagnosticoLeadService } from '../../services/diagnostico-lead.service';

@Component({
  standalone: true,
  selector: 'app-landing',
  imports: [CommonModule, FormsModule, ComparacaoServicosComponent],
  templateUrl: './landing.component.html'
})
export class LandingComponent implements OnInit, AfterViewInit {
  /** Número WhatsApp Finzzia (DDI + DDD + número, só dígitos) */
  readonly whatsappNumber = '554991984101';
  readonly emailPlaceholderDiagnostico = 'nome@empresa.com.br';
  readonly opcoesSegmentoDiagnostico = [
    { value: '', label: 'Selecione o ramo de atuação' },
    { value: 'Agência de marketing ou publicidade', label: 'Agência de marketing ou publicidade' },
    { value: 'Restaurante, bar ou setor de alimentação', label: 'Restaurante, bar ou setor de alimentação' },
    { value: 'Empresa de prestação de serviços', label: 'Empresa de prestação de serviços' },
    { value: 'Outro segmento empresarial', label: 'Outro segmento empresarial' }
  ];

  readonly opcoesFaturamentoDiagnostico = [
    { value: '', label: 'Faturamento médio mensal estimado' },
    { value: 'Até R$ 50.000', label: 'Até R$ 50.000' },
    { value: 'Entre R$ 50.001 e R$ 100.000', label: 'Entre R$ 50.001 e R$ 100.000' },
    { value: 'Entre R$ 100.001 e R$ 300.000', label: 'Entre R$ 100.001 e R$ 300.000' },
    { value: 'Acima de R$ 300.000', label: 'Acima de R$ 300.000' }
  ];

  readonly opcoesContextoDiagnostico = [
    { value: '', label: 'Principal desafio financeiro hoje' },
    { value: 'Gestão do fluxo de caixa imprevisível', label: 'Gestão do fluxo de caixa imprevisível' },
    { value: 'Mistura das finanças empresariais com pessoais', label: 'Mistura das finanças empresariais com pessoais' },
    { value: 'Alta inadimplência de clientes', label: 'Alta inadimplência de clientes' },
    { value: 'Falta de tempo para realizar a gestão financeira', label: 'Falta de tempo para realizar a gestão financeira' },
    { value: 'Não sabe por onde começar a organizar as finanças', label: 'Não sabe por onde começar a organizar as finanças' },
    { value: 'Outro', label: 'Outro' }
  ];

  formDiagnostico = {
    nome: '',
    email: '',
    telefone: '',
    segmento: '',
    faturamento: '',
    contexto: ''
  };

  diagnosticoEnviado = false;
  salvandoDiagnostico = false;
  diagnosticoErro: string | null = null;
  diagnosticoCampoErro:
    | 'nome'
    | 'email'
    | 'telefone'
    | 'segmento'
    | 'faturamento'
    | 'contexto'
    | null = null;

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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private diagnosticoLeadService: DiagnosticoLeadService
  ) {}

  ngOnInit(): void {
    this.apenasDiagnostico = this.route.snapshot.data['apenasDiagnostico'] || false;
    this.segmentoAtual = this.route.snapshot.data['segmento'] || null;
    this.prefillSegmentoDiagnostico();

    if (this.segmentoAtual && !this.apenasDiagnostico) {
      setTimeout(() => {
        this.scrollToSegmento(this.segmentoAtual!);
      }, 300);
    }
  }

  mostrarSecao(secao: string): boolean {
    if (!this.segmentoAtual) {
      return false;
    }
    const mapeamento: { [key: string]: string[] } = {
      'restaurantes': ['restaurantes'],
      'prestadores': ['servicos', 'prestadores'],
      'agencias': ['agencias']
    };
    
    const secoesPermitidas = mapeamento[this.segmentoAtual] || [];
    return secoesPermitidas.includes(secao);
  }

  scrollToSegmento(segmento: string): void {
    let elementoId = '';
    switch (segmento) {
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

  proximoDepoimento(): void {
    this.depoimentoAtualIndex = (this.depoimentoAtualIndex + 1) % this.depoimentos.length;
  }

  depoimentoAnterior(): void {
    this.depoimentoAtualIndex = (this.depoimentoAtualIndex - 1 + this.depoimentos.length) % this.depoimentos.length;
  }

  irParaDepoimento(index: number): void {
    this.depoimentoAtualIndex = index;
  }

  onDepoimentoTouchStart(event: TouchEvent): void {
    this.swipeStartX = event.touches[0].clientX;
    this.swipeStartY = event.touches[0].clientY;
    this.isSwiping = false;
  }

  onDepoimentoTouchMove(event: TouchEvent): void {
    if (!this.swipeStartX || !this.swipeStartY) return;
    
    const deltaX = event.touches[0].clientX - this.swipeStartX;
    const deltaY = event.touches[0].clientY - this.swipeStartY;
    
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
    if (this.apenasDiagnostico) {
      return;
    }
    
    if (!this.segmentoAtual) {
      this.router.navigate(['/diagnostico']);
      return;
    }
    
    const el = document.getElementById('diagnostico');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  enviarDiagnostico(event?: Event): void {
    event?.preventDefault();
    this.diagnosticoErro = null;
    this.diagnosticoCampoErro = null;

    const nome = this.formDiagnostico.nome.trim();
    const email = this.formDiagnostico.email.trim().toLowerCase();
    const telefone = this.formDiagnostico.telefone.trim();
    const segmento = this.formDiagnostico.segmento.trim();
    const faturamento = this.formDiagnostico.faturamento.trim();
    const contexto = this.formDiagnostico.contexto.trim();
    const telefoneDigitos = telefone.replace(/\D/g, '');

    if (!nome) {
      this.definirErroDiagnostico('nome', 'Por favor, informe seu nome.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.definirErroDiagnostico('email', 'Digite um e-mail corporativo válido para contato.');
      return;
    }
    if (telefoneDigitos.length < 10) {
      this.definirErroDiagnostico('telefone', 'Informe um telefone ou WhatsApp válido para contato.');
      return;
    }
    if (!segmento) {
      this.definirErroDiagnostico('segmento', 'Selecione o ramo de atuação da sua empresa.');
      return;
    }
    if (!faturamento) {
      this.definirErroDiagnostico('faturamento', 'Selecione o faturamento médio mensal estimado.');
      return;
    }
    if (!contexto) {
      this.definirErroDiagnostico('contexto', 'Selecione o principal desafio financeiro.');
      return;
    }

    this.salvandoDiagnostico = true;

    this.diagnosticoLeadService
      .salvarDiagnostico({
        nome,
        email,
        telefone,
        segmento,
        faturamento,
        contexto,
        origem: 'Landing Page - Diagnóstico'
      })
      .subscribe({
        next: result => {
          this.salvandoDiagnostico = false;
          if (result.success) {
            this.diagnosticoEnviado = true;
            this.router.navigate(['/obrigado']);
            return;
          }
          this.diagnosticoErro =
            'Não foi possível registrar seu contato. Tente novamente ou fale pelo WhatsApp.';
        },
        error: () => {
          this.salvandoDiagnostico = false;
          this.diagnosticoErro =
            'Erro ao enviar. Tente novamente ou fale pelo WhatsApp.';
        }
      });
  }

  private prefillSegmentoDiagnostico(): void {
    if (!this.segmentoAtual || this.formDiagnostico.segmento) {
      return;
    }
    const mapa: Record<string, string> = {
      restaurantes: 'Restaurante, bar ou setor de alimentação',
      prestadores: 'Empresa de prestação de serviços',
      agencias: 'Agência de marketing ou publicidade'
    };
    this.formDiagnostico.segmento = mapa[this.segmentoAtual] ?? '';
  }

  private definirErroDiagnostico(
    campo: NonNullable<typeof this.diagnosticoCampoErro>,
    mensagem: string
  ): void {
    this.diagnosticoCampoErro = campo;
    this.diagnosticoErro = mensagem;
  }

  limparErroDiagnostico(campo: NonNullable<typeof this.diagnosticoCampoErro>): void {
    if (this.diagnosticoCampoErro === campo) {
      this.diagnosticoCampoErro = null;
      this.diagnosticoErro = null;
    }
  }

  diagCampoInvalido(campo: NonNullable<typeof this.diagnosticoCampoErro>): boolean {
    return this.diagnosticoCampoErro === campo;
  }

  diagFieldClasses(campo: NonNullable<typeof this.diagnosticoCampoErro>): string {
    const base =
      'w-full h-12 px-4 rounded-xl border bg-slate-950/70 text-white text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/70';
    const placeholder = 'placeholder:text-slate-500';
    const selectExtra = 'appearance-none cursor-pointer';
    const err = this.diagnosticoCampoErro === campo;
    const border = err ? 'border-red-400/70 ring-2 ring-red-500/20' : 'border-slate-700/80';
    const isSelect = campo === 'segmento' || campo === 'faturamento' || campo === 'contexto';
    return `${base} ${isSelect ? selectExtra : placeholder} ${border}`;
  }

  formatarTelefoneDiagnostico(): void {
    const digitos = this.formDiagnostico.telefone.replace(/\D/g, '').slice(0, 11);
    if (digitos.length <= 2) {
      this.formDiagnostico.telefone = digitos;
      return;
    }
    if (digitos.length <= 6) {
      this.formDiagnostico.telefone = `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
      return;
    }
    if (digitos.length <= 10) {
      this.formDiagnostico.telefone = `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
      return;
    }
    this.formDiagnostico.telefone = `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  getWhatsAppUrl(mensagem?: string): string {
    const texto =
      mensagem?.trim() ||
      'Olá! Gostaria de saber mais sobre a Finzzia e o diagnóstico financeiro.';
    return `https://wa.me/${this.whatsappNumber}?text=${encodeURIComponent(texto)}`;
  }

  getWhatsAppUrlAposFormulario(): string {
    const { nome, email, telefone, segmento, faturamento, contexto } = this.formDiagnostico;
    const msg =
      `Olá! Meu nome é ${nome.trim()}, e-mail ${email.trim()}, telefone ${telefone.trim()}.` +
      ` Segmento: ${segmento}. Faturamento: ${faturamento}. Desafio: ${contexto}.` +
      ` Vim pela landing e quero o diagnóstico financeiro.`;
    return this.getWhatsAppUrl(msg);
  }

  playingVideos: { [key: string]: boolean } = {};

  ngAfterViewInit(): void {
    this.setupVideoPosters();
  }

  setupVideoPosters(): void {
    const videoIds = this.videos.map(v => v.id);
    const agenciaVideoIds = ['video-agencia1', 'video-agencia2', 'video-agencia3'];
    const allVideoIds = [...videoIds, ...agenciaVideoIds];
    
    allVideoIds.forEach(videoId => {
      const previewVideo = document.querySelector(`video[data-video-id="${videoId}"]`) as HTMLVideoElement;
      if (!previewVideo) return;

      previewVideo.pause();
      previewVideo.currentTime = 0;
      
      previewVideo.addEventListener('loadedmetadata', () => {
        previewVideo.currentTime = 0.1;
        previewVideo.pause();
      });

      previewVideo.addEventListener('loadeddata', () => {
        previewVideo.currentTime = 0.1;
        previewVideo.pause();
      });

      previewVideo.load();
    });
  }

  onVideoMetadataLoaded(videoId: string, event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video) {
      video.currentTime = 0.1;
      video.pause();
    }
  }

  playVideo(videoId: string, event?: Event): void {
    let container = document.querySelector('.video-container') as HTMLElement;
    if (!container) {
      container = document.querySelector('.video-container-agencia') as HTMLElement;
    }
    
    if (!container) {
      console.error('Container de vídeo não encontrado');
      return;
    }
    
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
    
    let container = document.querySelector('.video-container') as HTMLElement;
    if (!container) {
      container = document.querySelector('.video-container-agencia') as HTMLElement;
    }
    
    if (!container) return;
    
    const previewVideo = container.querySelector(`video[data-video-id="${videoId}"]`) as HTMLVideoElement;
    const mainVideo = container.querySelector(`video[data-video-id="${videoId}-main"]`) as HTMLVideoElement;
    const poster = container.querySelector('.video-poster') as HTMLElement;
    
    if (poster && video.paused) {
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
