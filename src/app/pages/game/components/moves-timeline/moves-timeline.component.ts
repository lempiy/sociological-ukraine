import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Move {
  id: number;
  playerId: string;
  round: number;
}

interface Player {
  id: string;
  displayName: string;
  avatarUrl: string;
  color: string;
}

interface GamePhase {
  id: number;
}

@Component({
  selector: 'app-moves-timeline',
  templateUrl: './moves-timeline.component.html',
  styleUrls: ['./moves-timeline.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class MovesTimelineComponent implements OnChanges {
  @Input() moves: Move[] = [];
  @Input() players: Player[] = [];
  @Input() currentPhase: GamePhase | null = null;

  // Позиції ходів для відображення: 2 минулих, 1 поточний, 2 майбутніх
  displayedMoves: Array<{ move: Move; player: Player | null; isPast: boolean; isCurrent: boolean; isFuture: boolean }> = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['moves'] || changes['players']) {
      this.updateDisplayedMoves();
    }
  }

  private updateDisplayedMoves(): void {
    this.displayedMoves = [];

    if (!this.moves || !this.players || this.moves.length === 0) {
      return;
    }

    this.displayedMoves = this.moves.map((move) => ({
      move,
      player: this.players.find(p => p.id === move.playerId) || null,
      isPast: !!(this.currentPhase && move.id < this.currentPhase?.id),
      isCurrent: !!(this.currentPhase && move.id === this.currentPhase?.id),
      isFuture: this.currentPhase ? move.id > this.currentPhase?.id : true,
    }))
  }

  // Допоміжний метод для отримання типу ходу для класів CSS
  getMoveTypeClass(index: number): string {
    if (this.displayedMoves[index].isPast) {
      return 'past-move';
    } else if (this.displayedMoves[index].isCurrent) {
      return 'current-move';
    } else {
      return 'future-move';
    }
  }
}