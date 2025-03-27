import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import {
  NbButtonModule,
  NbIconModule,
  NbProgressBarModule,
  NbRadioModule,
  NbFormFieldModule,
  NbInputModule,
  NbSpinnerModule,
  NbCardModule
} from '@nebular/theme';

interface Player {
  id: string;
  displayName: string;
  color: string;
  avatarUrl?: string;
}

@Component({
  selector: 'app-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NbButtonModule,
    NbIconModule,
    NbProgressBarModule,
    NbRadioModule,
    NbInputModule,
    NbSpinnerModule,
    NbFormFieldModule,
    NbCardModule
  ]
})
export class QuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Input() question: any;
  @Input() regionId: string = '';
  @Input() timeLeft: number = 0;
  @Input() phaseStartTime: any; // Firebase Timestamp
  @Input() isActivePlayer: boolean = false;
  @Input() isContestedPlayer: boolean = false;
  @Input() isProcessing: boolean = false;
  @Input() currentPhase: any; // Add current phase to monitor status
  @Input() players: Player[] = []; // Add players to get colors

  @Output() answerSubmit = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  answerForm: FormGroup;
  timeRemaining: number = 0;
  progress: number = 100;
  timerSubscription: Subscription | null = null;

  // State
  answeredAlready: boolean = false;

  // Get all player answers from current phase
  get playerAnswers(): { playerId: string, answer: any }[] {
    const answers = [];

    if (this.currentPhase?.activePlayerAnswer) {
      answers.push({
        playerId: this.currentPhase.activePlayerId,
        answer: this.currentPhase.activePlayerAnswer
      });
    }

    if (this.currentPhase?.contestedPlayerAnswer) {
      answers.push({
        playerId: this.currentPhase.contestedPlayerId,
        answer: this.currentPhase.contestedPlayerAnswer
      });
    }

    return answers;
  }

  // Get the winner(s) of the current phase
  get winners(): string[] {
    if (this.currentPhase?.status !== 'post-answer') {
      return [];
    }

    // Check the map status to see if the active player won
    const activePlayerId = this.currentPhase.activePlayerId;
    const regionId = this.currentPhase.regionId;
    const contestedPlayerId = this.currentPhase.contestedPlayerId;

    // If the map status of the region matches the active player, they won
    if (this.currentPhase.mapStatusAfter &&
      this.currentPhase.mapStatusAfter[regionId] === activePlayerId) {
      return [activePlayerId];
    } else if (contestedPlayerId && this.currentPhase.mapStatusAfter &&
      this.currentPhase.mapStatusAfter[regionId] === contestedPlayerId) {
      return [contestedPlayerId];
    }

    return [];
  }

  // Get sorted player answers for number questions (closest to correct first)
  get sortedNumberAnswers(): { playerId: string, answer: number, diff: number, player: Player }[] {
    if (this.question?.type !== 'number') {
      return [];
    }

    const correctAnswer = this.question.numberAnswer.value;
    const result = this.playerAnswers
      .filter(pa => pa.answer && pa.answer.number !== null && pa.answer.number !== undefined)
      .map(pa => {
        const diff = Math.abs(pa.answer.number - correctAnswer);
        const player = this.players.find(p => p.id === pa.playerId) || {
          id: pa.playerId,
          displayName: 'Unknown Player',
          color: '#ccc'
        };

        return {
          playerId: pa.playerId,
          answer: pa.answer.number,
          diff,
          player
        };
      })
      .sort((a, b) => a.diff - b.diff);

    return result;
  }

  // Get player by ID
  getPlayer(playerId: string): Player | undefined {
    return this.players.find(p => p.id === playerId);
  }

  // Check if a variant was selected by a player
  isVariantSelectedByPlayer(variantId: number, playerId: string): boolean {
    const playerAnswer = this.playerAnswers.find(pa => pa.playerId === playerId);
    return playerAnswer?.answer?.variant === variantId;
  }

  // Check if any player selected this variant
  hasPlayerSelectedVariant(variantId: number): boolean {
    return this.playerAnswers.some(pa => {
      if (pa.answer && 'variant' in pa.answer) {
        return pa.answer.variant === variantId;
      }
      return false;
    });
  }

  // Check if a variant is correct
  isVariantCorrect(variantId: number): boolean {
    if (!this.question || this.question.type !== 'variant') {
      return false;
    }

    return this.question.variants.some((v: any) => v.id === variantId && v.isCorrect);
  }

  // Get result message for post-answer phase
  getResultMessage(): string {
    if (this.currentPhase?.status !== 'post-answer') {
      return '';
    }

    if (this.winners.length > 0) {
      const winner = this.getPlayer(this.winners[0]);
      return `Переможець: ${winner?.displayName || 'Unknown Player'}`;
    } else {
      return 'Відповідь неправильна';
    }
  }

  constructor(private fb: FormBuilder) {
    this.answerForm = this.fb.group({
      variant: [null],
      number: [null, [Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.startTimer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question'] || changes['phaseStartTime'] || changes['currentPhase']) {
      this.resetForm();
      // Only reset answered flag when moving to a new question, not in post-answer
      if (changes['question'] && (changes['question'].isFirstChange() || changes['question'].currentValue.id != changes['question'].previousValue.id)) {
        this.answeredAlready = false;
      }
      this.startTimer();
    }
  }

  resetForm(): void {
    // Initialize form based on question type
    if (this.question) {
      if (this.question.type === 'variant') {
        this.answerForm = this.fb.group({
          variant: [null, Validators.required],
          number: [null]
        });
      } else if (this.question.type === 'number') {
        this.answerForm = this.fb.group({
          variant: [null],
          number: [null, [Validators.required, Validators.min(0)]]
        });
      }
    }
  }

  startTimer(): void {
    // Unsubscribe from previous timer if it exists
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    // Get phase start time in milliseconds
    const startTime = this.phaseStartTime ? this.phaseStartTime.toMillis() : Date.now();

    // Subscribe to interval for updating timer every second
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);

      // Calculate remaining time
      this.timeRemaining = Math.max(0, this.timeLeft - elapsedSeconds);

      // Calculate progress as percentage
      this.progress = (this.timeRemaining / this.timeLeft) * 100;

      // If time runs out, stop timer
      if (this.timeRemaining <= 0) {
        this.timerSubscription?.unsubscribe();
      }
    });
  }

  // Form submission handler
  onSubmit(): void {
    // Add check for isProcessing
    if (this.answerForm.invalid || this.answeredAlready || this.isProcessing) {
      return;
    }

    this.answeredAlready = true;

    // Submit answer
    const formValues = this.answerForm.value;
    const answer = this.question.type === 'variant'
      ? { variant: formValues.variant }
      : { number: formValues.number };

    this.answerSubmit.emit(answer);

    // Disable form fields after answering
    this.answerForm.disable();
  }

  // Format time as mm:ss
  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  // Check if current user can answer the question
  canAnswer(): boolean {
    return (this.isActivePlayer || this.isContestedPlayer) && !this.isProcessing;
  }

  // Get region display name
  getRegionDisplayName(): string {
    // This is a placeholder, could be enhanced with actual region names
    return this.regionId;
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  trackByAnswer(i: number, answer: any) {
    return answer.player.id
  }

  trackByAnswerVariant(i: number, answer: any) {
    return answer.playerId
  }
}