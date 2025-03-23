import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NbButtonModule, NbIconModule, NbProgressBarModule, NbRadioModule, NbFormFieldModule, NbInputModule, NbSpinnerModule } from '@nebular/theme';

@Component({
  selector: 'app-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbButtonModule,
    NbIconModule,
    NbProgressBarModule,
    NbRadioModule,
    NbFormFieldModule,
    NbInputModule,
    NbSpinnerModule
  ]
})
export class QuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Input() question: any;
  @Input() regionId: string = '';
  @Input() timeLeft: number = 0;
  @Input() phaseStartTime: any; // Firebase Timestamp
  @Input() isActivePlayer: boolean = false;
  @Input() isContestedPlayer: boolean = false;
  @Input() isProcessing: boolean = false; // Новий параметр для блокування під час обробки запиту

  @Output() answerSubmit = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  answerForm: FormGroup;
  timeRemaining: number = 0;
  progress: number = 100;
  timerSubscription: Subscription | null = null;

  // Стан компонента
  answeredAlready: boolean = false;

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
    if (changes['question'] || changes['phaseStartTime']) {
      this.resetForm();
      this.answeredAlready = false;
      this.startTimer();
    }
  }

  resetForm(): void {
    // Ініціалізуємо форму в залежності від типу питання
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
    // Відписуємось від попереднього таймера, якщо він існує
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    // Отримуємо час початку фази в мілісекундах
    const startTime = this.phaseStartTime ? this.phaseStartTime.toMillis() : Date.now();

    // Підписуємось на інтервал для оновлення таймера кожну секунду
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);

      // Розраховуємо залишок часу
      this.timeRemaining = Math.max(0, this.timeLeft - elapsedSeconds);

      // Розраховуємо прогрес у відсотках
      this.progress = (this.timeRemaining / this.timeLeft) * 100;

      // Якщо час вичерпано, зупиняємо таймер
      if (this.timeRemaining <= 0) {
        this.timerSubscription?.unsubscribe();
      }
    });
  }

  // Обробник відправки форми
  onSubmit(): void {
    // Додаємо перевірку на isProcessing
    if (this.answerForm.invalid || this.answeredAlready || this.isProcessing) {
      return;
    }

    this.answeredAlready = true;

    // Відправляємо відповідь
    const formValues = this.answerForm.value;
    const answer = this.question.type === 'variant'
      ? { variant: formValues.variant }
      : { number: formValues.number };

    this.answerSubmit.emit(answer);

    // Відключаємо поля форми після відповіді
    this.answerForm.disable();
  }

  // Форматування часу у вигляді mm:ss
  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  // Перевіряємо, чи поточний користувач має відповідати на питання
  canAnswer(): boolean {
    return (this.isActivePlayer || this.isContestedPlayer) && !this.isProcessing;
  }

  // Отримуємо назву регіону для відображення
  getRegionDisplayName(): string {
    // Заглушка, по необхідності тут можна добавити логіку форматування назви регіону
    return this.regionId;
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }
}