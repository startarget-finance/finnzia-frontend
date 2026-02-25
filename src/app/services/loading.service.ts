import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = 0;
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable().pipe(distinctUntilChanged());
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  show(): void {
    this.activeRequests++;
    if (this.activeRequests === 1) {
      this.loadingSubject.next(true);
      // Safety valve: reseta após 15s para evitar tela travada
      this.safetyTimer = setTimeout(() => this.reset(), 15000);
    }
  }

  hide(): void {
    if (this.activeRequests > 0) {
      this.activeRequests--;
    }
    if (this.activeRequests === 0) {
      if (this.safetyTimer) { clearTimeout(this.safetyTimer); this.safetyTimer = null; }
      this.loadingSubject.next(false);
    }
  }

  /** Zera forçadamente (safety valve) */
  reset(): void {
    this.activeRequests = 0;
    if (this.safetyTimer) { clearTimeout(this.safetyTimer); this.safetyTimer = null; }
    this.loadingSubject.next(false);
  }

  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /** Compatibilidade com código legado */
  setLoading(loading: boolean): void {
    loading ? this.show() : this.hide();
  }
}

