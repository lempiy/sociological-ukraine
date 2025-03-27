import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

// Nebular modules
import { NbSpinnerModule, NbButtonModule, NbIconModule, NbProgressBarModule } from '@nebular/theme';

// Core services
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { GameService } from '../../core/services/game.service';
import { MapService } from './services/map.service';

// Components
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { MapComponent } from './components/map/map.component';
import { RoundTimerComponent } from './components/round-timer/round-timer.component';
import { MovesTimelineComponent } from './components/moves-timeline/moves-timeline.component';
import { QuestionComponent } from './components/question/question.component';


interface Player {
  id: string;
  displayName: string;
  color: string;
  avatarUrl?: string;
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
  // Subscriptions
  private gameSubscription: Subscription | null = null;
  private mapSubscription: Subscription | null = null;

  // Game and user data
  gameId: string | null = null;
  gameData: any = null;
  userData: any = null;
  mapData: any = null;
  loading = true;
  error: string | null = null;

  // UI control variables
  showQuestion = false;
  isProcessingAction = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private userService: UserService,
    private gameService: GameService,
    private mapService: MapService
  ) { }

  ngOnInit(): void {
    console.log('onInit', this.loading);
    // Get gameId parameter from URL
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

    // Get current user
    this.authService.user$.subscribe((user: any) => {
      if (!user) {
        // If user is not authenticated, redirect to home page
        console.warn('unauthorized', user);
        this.router.navigate(['/']);
        return;
      }

      this.userData = {
        id: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL
      };

      // Subscribe to game data via game.service
      this.gameSubscription = this.gameService.getGame(this.gameId!)
        .subscribe(
          (gameData: any) => {
            if (!gameData) {
              this.error = 'Game not found';
              this.loading = false;
              return;
            }

            this.gameData = gameData;

            // Check game status
            if (gameData.status === 'lobby') {
              // Redirect to lobby if game has not started
              this.router.navigate([`/game/${this.gameId}/lobby`]);
              return;
            } else if (gameData.status === 'finished' || gameData.status === 'skipped') {
              // Redirect to results if game is finished
              this.router.navigate([`/game/${this.gameId}/result`]);
              return;
            }

            // Process any post-answer phase data
            if (gameData.currentPhase && gameData.currentPhase.status === 'post-answer') {
              // Add mapStatusAfter to the currentPhase for winner determination
              if (!gameData.currentPhase.mapStatusAfter) {
                gameData.currentPhase.mapStatusAfter = { ...gameData.map.status };
              }
            }

            // Load map data
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
    return this.gameData.players.find((p: Player) => p.id === playerId);
  }

  loadMapData(mapId: string): void {
    // Unsubscribe from previous subscription if it exists
    if (this.mapSubscription) {
      this.mapSubscription.unsubscribe();
    }
    console.log(mapId);

    // Subscribe to map data via MapService
    this.mapSubscription = this.mapService.getMapData(mapId)
      .subscribe(
        (mapData: any) => {
          if (!mapData) {
            this.error = 'Map data not found';
            this.loading = false;
            return;
          }

          try {
            // Parse GeoJSON
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

  // Handler for region selection by user
  onRegionSelect(regionId: string): void {
    // Check if not already processing a request
    if (this.isProcessingAction) {
      return;
    }

    // Check if it's the user's turn
    if (this.gameData.currentPhase.activePlayerId !== this.userData.id) {
      return;
    }

    // Check if planning phase
    if (this.gameData.currentPhase.status !== 'planning') {
      return;
    }

    // Check if region doesn't belong to user
    if (this.gameData.map.status[regionId] === this.userData.id) {
      return;
    }

    // Set processing status
    this.isProcessingAction = true;

    // Call service to select region
    this.gameService.setPlanningResult(this.gameId!, regionId)
      .subscribe({
        next: () => {
          console.log('Region selected successfully');
          this.isProcessingAction = false;
        },
        error: (error: any) => {
          console.error('Error selecting region:', error);
          this.isProcessingAction = false;
        }
      });
  }

  // Handler for user answer to a question
  onAnswer(answerData: any): void {
    // Check if not already processing a request
    if (this.isProcessingAction) {
      return;
    }

    // Check if answer phase
    if (this.gameData.currentPhase.status !== 'answer') {
      return;
    }

    // Check if user can answer the question
    const isActivePlayer = this.gameData.currentPhase.activePlayerId === this.userData.id;
    const isContestedPlayer = this.gameData.currentPhase.contestedPlayerId === this.userData.id;

    if (!isActivePlayer && !isContestedPlayer) {
      return;
    }

    // Check if user has not already answered
    if (isActivePlayer && this.gameData.currentPhase.activePlayerAnswer !== null) {
      return;
    }

    if (isContestedPlayer && this.gameData.currentPhase.contestedPlayerAnswer !== null) {
      return;
    }

    // Set processing status
    this.isProcessingAction = true;

    // Submit answer via service depending on question type
    if (this.gameData.currentPhase.question.type === 'variant') {
      this.gameService.setAnswer(this.gameId!, answerData.variant)
        .subscribe({
          next: () => {
            console.log('Answer submitted successfully');
            this.isProcessingAction = false;
          },
          error: (error: any) => {
            console.error('Error submitting answer:', error);
            this.isProcessingAction = false;
          }
        });
    } else if (this.gameData.currentPhase.question.type === 'number') {
      this.gameService.setAnswer(this.gameId!, undefined, answerData.number)
        .subscribe({
          next: () => {
            console.log('Answer submitted successfully');
            this.isProcessingAction = false;
          },
          error: (error: any) => {
            console.error('Error submitting answer:', error);
            this.isProcessingAction = false;
          }
        });
    }
  }

  // Check if user is the active player in current phase
  isActivePlayer(): boolean {
    if (!this.gameData || !this.userData) return false;
    return this.gameData.currentPhase.activePlayerId === this.userData.id;
  }

  // Check if user is the contested player
  isContestedPlayer(): boolean {
    if (!this.gameData || !this.userData) return false;
    return this.gameData.currentPhase.contestedPlayerId === this.userData.id;
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    if (this.gameSubscription) {
      this.gameSubscription.unsubscribe();
    }
    if (this.mapSubscription) {
      this.mapSubscription.unsubscribe();
    }
  }
}