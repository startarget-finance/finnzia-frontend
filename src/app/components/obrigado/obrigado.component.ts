import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-obrigado',
  imports: [CommonModule, RouterLink],
  templateUrl: './obrigado.component.html',
})
export class ObrigadoComponent {}
