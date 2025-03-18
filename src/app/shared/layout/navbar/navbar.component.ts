import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NbButtonModule } from '@nebular/theme';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, NbButtonModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  user$: Observable<User | null>;

  constructor(private authService: AuthService) {
    this.user$ = this.authService.user$;
  }

  login(): void {
    this.authService.loginWithGoogle().subscribe({
      error: (error) => {
        console.error('Login error:', error);
      }
    });
  }
}