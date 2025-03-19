import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  NbCardModule,
  NbIconModule,
  NbButtonModule,
  NbAlertModule,
  NbSpinnerModule
} from '@nebular/theme';
import { Observable, Subscription } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { GameService, Game } from '../../core/services/game.service';

@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NbCardModule,
    NbIconModule,
    NbButtonModule,
    NbAlertModule,
    NbSpinnerModule
  ],
  templateUrl: './game-lobby.component.html',
  styleUrls: ['./game-lobby.component.scss']
})
export class GameLobbyComponent implements OnInit, OnDestroy {
  gameId!: string;
  game$!: Observable<Game>;
  currentUserId: string | null = null;
  isLoading: boolean = true;

  private subscriptions: Subscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private gameService: GameService
  ) { }

  ngOnInit(): void {
    // Отримуємо ID поточного користувача
    this.currentUserId = this.authService.currentUser?.uid || null;

    // Отримуємо параметр gameId з URL та підписуємося на зміни гри
    this.subscriptions.add(
      this.route.params.pipe(
        map(params => params['gameId']),
        tap(gameId => {
          this.gameId = gameId;
          this.isLoading = true;
        }),
        switchMap(gameId => this.gameService.getGame(gameId))
      ).subscribe({
        next: (game) => {
          this.isLoading = false;

          // Перевіряємо стан гри, якщо вже не лобі - перенаправляємо на відповідний екран
          if (game.status !== 'lobby') {
            this.router.navigate(['/game', this.gameId]);
          }

          // Якщо кількість гравців досягла максимуму, почати гру
          if (game.players.length === game.rules.numberOfPlayers) {
            // Автоматичний перехід на екран гри через 2 секунди
            setTimeout(() => {
              this.router.navigate(['/game', this.gameId]);
            }, 2000);
          }
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error loading game:', error);
          // Перенаправляємо на головну сторінку
          this.router.navigate(['/']);
        }
      })
    );

    // Підписуємося на потік даних гри
    this.game$ = this.gameService.getGame(this.gameId);
  }

  ngOnDestroy(): void {
    // Скасовуємо всі підписки при знищенні компонента
    this.subscriptions.unsubscribe();
  }

  /**
   * Генерує масив пустих слотів для ще не підключених гравців
   */
  getEmptySlots(game: Game): number[] {
    const emptySlots = game.rules.numberOfPlayers - game.players.length;
    return emptySlots > 0 ? Array(emptySlots).fill(0) : [];
  }

  /**
   * Виходить з поточної гри
   */
  leaveGame(): void {
    this.isLoading = true;

    this.gameService.leaveGame(this.gameId).subscribe({
      error: (error) => {
        this.isLoading = false;
        console.error('Error leaving game:', error);
      }
    });
  }
}