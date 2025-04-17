import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NbButtonModule, NbCardModule, NbIconModule, NbSpinnerModule, NbToastrModule, NbToastrService } from '@nebular/theme';
import { Subscription } from 'rxjs';
import { GameService } from '../../core/services/game.service';
import { AuthService } from '../../core/services/auth.service';
import { MapService } from '../game/services/map.service';

interface Player {
  id: string;
  displayName: string;
  avatarUrl: string;
  color: string;
  isCreator: boolean;
  isWinner?: boolean;
  regionsCount?: number;
  correctAnswers?: number,
  wrongAnswers?: number,
}

@Component({
  selector: 'app-game-result',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NbCardModule,
    NbButtonModule,
    NbIconModule,
    NbSpinnerModule,
    NbToastrModule
  ],
  templateUrl: './game-result.component.html',
  styleUrls: ['./game-result.component.scss'],
  providers: [MapService]
})
export class GameResultComponent implements OnInit, OnDestroy {
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

  // Sorted players for results table
  sortedPlayers: Player[] = [];

  // Check if current user is winner
  isCurrentUserWinner = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private gameService: GameService,
    private mapService: MapService,
    private toastrService: NbToastrService
  ) { }

  ngOnInit(): void {
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
            if (gameData.status !== 'finished' && gameData.status !== 'skipped') {
              // Redirect to game if it's not finished
              this.router.navigate([`/game/${this.gameId}`]);
              return;
            }

            // Process player data and calculate region counts
            this.processPlayerData();

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

  processPlayerData(): void {
    if (!this.gameData) return;

    // Calculate region counts for each player
    const regionCounts: { [key: string]: number } = {};

    // Count regions by player
    Object.values(this.gameData.map.status).forEach((playerId: any) => {
      if (playerId) { // Skip neutral regions
        regionCounts[playerId] = (regionCounts[playerId] || 0) + 1;
      }
    });

    // Create sorted players array with region counts
    this.sortedPlayers = this.gameData.players.map((player: Player) => ({
      ...player,
      regionsCount: regionCounts[player.id] || 0
    })).sort((a: Player, b: Player) => (b.regionsCount || 0) - (a.regionsCount || 0));

    // Check if current user is winner
    this.isCurrentUserWinner = this.sortedPlayers.length > 0 &&
      this.sortedPlayers[0].id === this.userData.id;
  }

  loadMapData(mapId: string): void {
    // Unsubscribe from previous subscription if it exists
    if (this.mapSubscription) {
      this.mapSubscription.unsubscribe();
    }

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

            // Initialize static map
            setTimeout(() => {
              this.initStaticMap();
            });

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

  initStaticMap(): void {
    if (!this.mapData || !this.gameData) return;

    // Initialize the static (non-interactive) result map
    const mapContainer = document.getElementById('result-map-container');
    if (!mapContainer) return;

    this.mapService.initStaticMap(
      mapContainer,
      this.mapData,
      this.gameData.map.status,
      this.gameData.players
    );
  }

  // Copy result link to clipboard using native browser API
  copyResultLink(): void {
    const url = window.location.href;

    // Create a temporary input element
    const tempInput = document.createElement('input');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-1000px';
    tempInput.style.top = '-1000px';
    tempInput.value = url;

    // Add to DOM, select and copy
    document.body.appendChild(tempInput);
    tempInput.select();

    try {
      // Execute copy command
      const successful = document.execCommand('copy');
      if (successful) {
        this.toastrService.success('Посилання скопійовано в буфер обміну', 'Успішно!');
      } else {
        this.toastrService.danger('Не вдалося скопіювати посилання', 'Помилка');
      }
    } catch (err) {
      this.toastrService.danger('Не вдалося скопіювати посилання', 'Помилка');
      console.error('Помилка копіювання посилання:', err);
    }

    // Clean up
    document.body.removeChild(tempInput);
  }

  // Go back to home
  goHome(): void {
    this.router.navigate(['/']);
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