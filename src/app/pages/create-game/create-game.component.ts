import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  NbButtonModule,
  NbInputModule,
  NbRadioModule,
  NbSelectModule,
  NbIconModule,
  NbSpinnerModule
} from '@nebular/theme';
import { GameService } from '../../core/services/game.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-create-game',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    NbButtonModule,
    NbInputModule,
    NbRadioModule,
    NbSelectModule,
    NbIconModule,
    NbSpinnerModule
  ],
  templateUrl: './create-game.component.html',
  styleUrls: ['./create-game.component.scss']
})
export class CreateGameComponent implements OnInit {
  gameForm!: FormGroup;
  isLoading: boolean = false;

  // Варіанти для вибору в формі
  playerCounts: number[] = [1, 2, 3, 4, 5, 6];

  answerTimes = [
    { value: 20, label: '20 секунд' },
    { value: 30, label: '30 секунд' },
    { value: 45, label: '45 секунд' },
    { value: 60, label: '1 хвилина' },
    { value: 90, label: '1 хвилина 30 секунд' },
  ];

  planningTimes = [
    { value: 30, label: '30 секунд' },
    { value: 60, label: '1 хвилина' },
    { value: 120, label: '2 хвилини' },
    { value: 180, label: '3 хвилини' }
  ];

  maxRoundsOptions: number[] = [5, 10, 15, 20, 25, 30];

  constructor(
    private fb: FormBuilder,
    private gameService: GameService
  ) { }

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.gameForm = this.fb.group({
      gameName: ['', [Validators.required, Validators.minLength(3)]],
      numberOfPlayers: [2, Validators.required],
      timeForAnswer: [20, Validators.required],
      timeForPlanning: [60, Validators.required],
      maxRounds: [0] // 0 означає необмежену кількість раундів
    });
  }

  createGame(): void {
    if (this.gameForm.invalid) return;

    this.isLoading = true;

    const gameData = this.gameForm.value;

    this.gameService.createGame(gameData)
      .pipe(
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        error: (error) => {
          console.error('Error creating game:', error);
          // В реальному додатку тут можна було б показати повідомлення про помилку
        }
      });
  }
}
