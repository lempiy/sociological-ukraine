import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NbProgressBarModule } from '@nebular/theme';

@Component({
  selector: 'app-round-timer',
  templateUrl: './round-timer.component.html',
  styleUrls: ['./round-timer.component.scss'],
  standalone: true,
  imports: [CommonModule, NbProgressBarModule]
})
export class RoundTimerComponent implements OnChanges, OnDestroy {
  @Input() phase: any;
  @Input() rules: any;

  timeLeft: number = 0;
  progress: number = 100;
  timerSubscription: Subscription | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['phase']) {
      this.startTimer();
    }
  }

  startTimer(): void {
    // Відписуємось від попереднього таймера, якщо він існує
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    // Визначаємо загальний час для поточної фази
    let totalTime = 0;
    if (this.phase.status === 'planning') {
      totalTime = this.rules.timeForPlanning;
    } else if (this.phase.status === 'answer') {
      totalTime = this.rules.timeForAnswer;
    } else {
      return; // Для інших фаз не показуємо таймер
    }

    // Розраховуємо час початку фази в мілісекундах
    const startTime = this.phase.startAt ? this.phase.startAt.toMillis() : Date.now();

    // Підписуємось на інтервал для оновлення таймера кожну секунду
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentTime = Date.now();
      const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);

      // Розраховуємо залишок часу
      this.timeLeft = Math.max(0, totalTime - elapsedSeconds);

      // Розраховуємо прогрес у відсотках
      this.progress = (this.timeLeft / totalTime) * 100;

      // Якщо час вичерпано, зупиняємо таймер
      if (this.timeLeft <= 0) {
        this.timerSubscription?.unsubscribe();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  // Форматування часу у вигляді mm:ss
  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }
}