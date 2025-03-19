import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Move {
  playerId: string;
  round: number;
}

interface Player {
  id: string;
  displayName: string;
  avatarUrl: string;
  color: string;
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

    // Знаходимо індекс поточного ходу (перший у списку)
    const currentMoveIndex = 0;

    // Визначаємо діапазон ходів для відображення
    const startIndex = Math.max(0, currentMoveIndex - 2);
    const endIndex = Math.min(this.moves.length - 1, currentMoveIndex + 2);

    // Заповнюємо масив displayedMoves
    for (let i = startIndex; i <= endIndex; i++) {
      const move = this.moves[i];
      const player = this.players.find(p => p.id === move.playerId) || null;

      this.displayedMoves.push({
        move,
        player,
        isPast: i < currentMoveIndex,
        isCurrent: i === currentMoveIndex,
        isFuture: i > currentMoveIndex
      });
    }
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