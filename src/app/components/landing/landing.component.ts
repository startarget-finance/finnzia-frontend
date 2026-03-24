import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { API_CONFIG } from '../../config/api.config';
import { ComparacaoServicosComponent } from '../comparacao-servicos/comparacao-servicos.component';

@Component({
  standalone: true,
  selector: 'app-landing',
  imports: [CommonModule, ComparacaoServicosComponent],
  templateUrl: './landing.component.html'
})
export class LandingComponent implements OnInit, AfterViewInit {
  diagnosticoEmbedUrlSeguro: SafeResourceUrl | null = null;

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
    private sanitizer: DomSanitizer
  ) {}

  /** URL do embed (Typeform / Responde.ai / etc.) quando configurada em api.config.ts */
  get diagnosticoEmbedConfigurado(): boolean {
    const raw = API_CONFIG.LANDING_DIAGNOSTICO_EMBED_URL?.trim() ?? '';
    return raw.length > 0;
  }

  /** URL com parâmetros opcionais (ex.: segmento da rota) para mapear em campos ocultos no provedor */
  get diagnosticoEmbedUrlAbrirNovaAba(): string {
    return this.montarUrlDiagnosticoEmbed();
  }

  private montarUrlDiagnosticoEmbed(): string {
    const base = API_CONFIG.LANDING_DIAGNOSTICO_EMBED_URL?.trim() ?? '';
    if (!base) {
      return '';
    }
    const params = new URLSearchParams();
    if (this.segmentoAtual) {
      params.set('segmento', this.segmentoAtual);
      params.set('utm_source', 'finnzia-landing');
    }
    const q = params.toString();
    if (!q) {
      return base;
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${q}`;
  }

  private atualizarDiagnosticoEmbedSeguro(): void {
    const full = this.montarUrlDiagnosticoEmbed();
    this.diagnosticoEmbedUrlSeguro =
      full.length > 0 ? this.sanitizer.bypassSecurityTrustResourceUrl(full) : null;
  }

  ngOnInit(): void {
    this.apenasDiagnostico = this.route.snapshot.data['apenasDiagnostico'] || false;
    this.segmentoAtual = this.route.snapshot.data['segmento'] || null;
    this.atualizarDiagnosticoEmbedSeguro();

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
