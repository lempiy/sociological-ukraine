import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Player {
  id: string;
  displayName: string;
  avatarUrl: string;
  color: string;
  isCreator?: boolean;
  isWinner?: boolean;
  regionsCount?: number; // Додаємо поле для кількості регіонів
}

@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class LeaderboardComponent implements OnChanges {
  @Input() players: Player[] = [];
  @Input() mapStatus: { [key: string]: string } = {};
  @Input() currentUserId: string = '';

  sortedPlayers: Player[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['players'] || changes['mapStatus']) {
      this.updatePlayerRegionsCount();
    }
  }

  /**
   * Оновлює кількість регіонів для кожного гравця та сортує гравців
   */
  private updatePlayerRegionsCount(): void {
    // Глибоке копіювання гравців
    const updatedPlayers = JSON.parse(JSON.stringify(this.players)) as Player[];

    // Рахуємо кількість регіонів для кожного гравця
    const regionCounts: { [key: string]: number } = {};

    Object.values(this.mapStatus).forEach(playerId => {
      if (playerId) { // Пропускаємо нейтральні регіони
        regionCounts[playerId] = (regionCounts[playerId] || 0) + 1;
      }
    });

    // Оновлюємо кількість регіонів для кожного гравця
    updatedPlayers.forEach(player => {
      player.regionsCount = regionCounts[player.id] || 0;
    });

    // Сортуємо гравців за кількістю регіонів (спадання)
    this.sortedPlayers = updatedPlayers.sort((a, b) =>
      (b.regionsCount || 0) - (a.regionsCount || 0)
    );
  }

  /**
   * Визначає, чи є гравець поточним користувачем
   */
  isCurrentUser(playerId: string): boolean {
    return playerId === this.currentUserId;
  }
}