import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NbButtonModule } from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { Observable, of } from 'rxjs';
import { User } from '@angular/fire/auth';

interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  questionsAnswered: number;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, NbButtonModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user$: Observable<User | null>;
  userStats$: Observable<UserStats>;

  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {
    this.user$ = this.authService.user$;
    this.userStats$ = of({
      gamesPlayed: 0,
      gamesWon: 0,
      questionsAnswered: 0
    });
  }

  ngOnInit(): void {
    // Отримання статистики користувача
    this.userStats$ = this.userService.getUserStats();
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}