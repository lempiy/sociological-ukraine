import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NbButtonModule, NbAlertModule } from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';
import { Observable, map } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, NbButtonModule, NbAlertModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  isAuthenticated$: Observable<boolean>;

  constructor(private authService: AuthService) {
    this.isAuthenticated$ = this.authService.user$.pipe(
      map(user => !!user)
    );
  }
}