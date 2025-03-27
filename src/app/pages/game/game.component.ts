import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

// Nebular модулі
import { NbSpinnerModule, NbButtonModule, NbIconModule, NbProgressBarModule } from '@nebular/theme';

// Сервіси з core
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { GameService } from '../../core/services/game.service';
import { MapService } from './services/map.service';

// Компоненти
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { MapComponent } from './components/map/map.component';
import { RoundTimerComponent } from './components/round-timer/round-timer.component';
import { MovesTimelineComponent } from './components/moves-timeline/moves-timeline.component';
import { QuestionComponent } from './components/question/question.component';


interface Player {
  id: string;
  displayName: string;
  color: string;
}


@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NbSpinnerModule,
    NbButtonModule,
    NbIconModule,
    NbProgressBarModule,
    LeaderboardComponent,
    MapComponent,
    RoundTimerComponent,
    MovesTimelineComponent,
    QuestionComponent
  ],
  providers: [MapService]
})
export class GameComponent implements OnInit, OnDestroy {
  // Підписки
  private gameSubscription: Subscription | null = null;
  private mapSubscription: Subscription | null = null;

  // Дані гри та користувача
  gameId: string | null = null;
  gameData: any = null;
  userData: any = null;
  mapData: any = null;
  loading = true;
  error: string | null = null;

  // Змінні для контролю UI
  showQuestion = false;
  isProcessingAction = false; // Додаємо новий прапорець для відстеження стану обробки

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private userService: UserService,
    private gameService: GameService,
    private mapService: MapService
  ) { }

  ngOnInit(): void {
    console.log('onInit', this.loading)
    // Отримуємо параметр gameId з URL
    this.route.params.subscribe(params => {
      this.gameId = params['gameId'];
      this.loadGameData();
    });
  }

  loadGameData(): void {
    if (!this.gameId) {
      this.error = 'Game ID not provided';
      this.loading = false;
      return;
    }

    // Отримуємо поточного користувача
    this.authService.user$.subscribe((user: any) => {
      if (!user) {
        // Якщо користувач не авторизований, перенаправляємо на головну сторінку
        console.warn('unauthorized', user);
        this.router.navigate(['/']);
        return;
      }

      this.userData = {
        id: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL
      };

      // Підписуємось на дані гри через game.service
      this.gameSubscription = this.gameService.getGame(this.gameId!)
        .subscribe(
          (gameData: any) => {
            if (!gameData) {
              this.error = 'Game not found';
              this.loading = false;
              return;
            }

            this.gameData = gameData;

            // Перевіряємо стан гри
            if (gameData.status === 'lobby') {
              // Перенаправляємо на лоббі, якщо гра ще не почалась
              this.router.navigate([`/game/${this.gameId}/lobby`]);
              return;
            } else if (gameData.status === 'finished' || gameData.status === 'skipped') {
              // Перенаправляємо на результати, якщо гра закінчилась
              this.router.navigate([`/game/${this.gameId}/result`]);
              return;
            }

            // Завантажуємо дані карти
            this.loadMapData(gameData.map.id);
          },
          (error: any) => {
            console.error('Error fetching game data:', error);
            this.error = 'Error loading game data';
            this.loading = false;
          }
        );
    });
  }

  getPlayer(playerId: string): Player {
    return this.gameData.players.find((p: Player) => p.id == playerId)
  }

  loadMapData(mapId: string): void {
    // Відписуємось від попередньої підписки, якщо вона є
    if (this.mapSubscription) {
      this.mapSubscription.unsubscribe();
    }
    console.log(mapId)

    // Підписуємось на дані карти через MapService
    this.mapSubscription = this.mapService.getMapData(mapId)
      .subscribe(
        (mapData: any) => {
          if (!mapData) {
            this.error = 'Map data not found';
            this.loading = false;
            return;
          }

          try {
            // Парсимо GeoJSON
            const geoJson = JSON.parse(mapData.geoJson);
            this.mapData = geoJson;

            this.loading = false;
          } catch (e) {
            console.error('Error parsing GeoJSON:', e);
            this.error = 'Error parsing map data';
            this.loading = false;
          }
        },
        error => {
          console.error('Error fetching map data:', error);
          this.error = 'Error loading map data';
          this.loading = false;
        }
      );
  }

  // Обробник вибору регіону користувачем
  onRegionSelect(regionId: string): void {
    // Перевіряємо, чи не в процесі обробки запиту
    if (this.isProcessingAction) {
      return;
    }

    // Перевіряємо, чи зараз хід користувача
    if (this.gameData.currentPhase.activePlayerId !== this.userData.id) {
      return;
    }

    // Перевіряємо, чи стадія планування
    if (this.gameData.currentPhase.status !== 'planning') {
      return;
    }

    // Перевіряємо, чи регіон не належить користувачу
    if (this.gameData.map.status[regionId] === this.userData.id) {
      return;
    }

    // Встановлюємо статус обробки
    this.isProcessingAction = true;

    // Викликаємо сервіс для вибору регіону
    this.gameService.setPlanningResult(this.gameId!, regionId)
      .subscribe({
        next: () => {
          console.log('Region selected successfully');
          this.isProcessingAction = false; // Знімаємо прапорець після успішної обробки
        },
        error: (error: any) => {
          console.error('Error selecting region:', error);
          this.isProcessingAction = false; // Знімаємо прапорець у разі помилки
        }
      });
  }

  // Обробник відповіді користувача на запитання
  onAnswer(answerData: any): void {
    // Перевіряємо, чи не в процесі обробки запиту
    if (this.isProcessingAction) {
      return;
    }

    // Перевіряємо, чи стадія відповіді
    if (this.gameData.currentPhase.status !== 'answer') {
      return;
    }

    // Перевіряємо, чи користувач може відповідати на запитання
    const isActivePlayer = this.gameData.currentPhase.activePlayerId === this.userData.id;
    const isContestedPlayer = this.gameData.currentPhase.contestedPlayerId === this.userData.id;

    if (!isActivePlayer && !isContestedPlayer) {
      return;
    }

    // Перевіряємо, чи користувач ще не відповів
    if (isActivePlayer && this.gameData.currentPhase.activePlayerAnswer !== null) {
      return;
    }

    if (isContestedPlayer && this.gameData.currentPhase.contestedPlayerAnswer !== null) {
      return;
    }

    // Встановлюємо статус обробки
    this.isProcessingAction = true;

    // Передаємо відповідь через сервіс в залежності від типу питання
    if (this.gameData.currentPhase.question.type === 'variant') {
      this.gameService.setAnswer(this.gameId!, answerData.variant)
        .subscribe({
          next: () => {
            console.log('Answer submitted successfully');
            this.isProcessingAction = false; // Знімаємо прапорець після успішної обробки
          },
          error: (error: any) => {
            console.error('Error submitting answer:', error);
            this.isProcessingAction = false; // Знімаємо прапорець у разі помилки
          }
        });
    } else if (this.gameData.currentPhase.question.type === 'number') {
      this.gameService.setAnswer(this.gameId!, undefined, answerData.number)
        .subscribe({
          next: () => {
            console.log('Answer submitted successfully');
            this.isProcessingAction = false; // Знімаємо прапорець після успішної обробки
          },
          error: (error: any) => {
            console.error('Error submitting answer:', error);
            this.isProcessingAction = false; // Знімаємо прапорець у разі помилки
          }
        });
    }
  }

  // Визначаємо, чи є користувач активним гравцем поточної фази
  isActivePlayer(): boolean {
    if (!this.gameData || !this.userData) return false;
    return this.gameData.currentPhase.activePlayerId === this.userData.id;
  }

  // Визначаємо, чи є користувач гравцем, чий регіон атакується
  isContestedPlayer(): boolean {
    if (!this.gameData || !this.userData) return false;
    return this.gameData.currentPhase.contestedPlayerId === this.userData.id;
  }

  ngOnDestroy(): void {
    // Відписуємось від всіх підписок
    if (this.gameSubscription) {
      this.gameSubscription.unsubscribe();
    }
    if (this.mapSubscription) {
      this.mapSubscription.unsubscribe();
    }
  }
}

