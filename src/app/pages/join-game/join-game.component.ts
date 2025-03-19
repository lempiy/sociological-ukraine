import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  NbInputModule,
  NbButtonModule,
  NbIconModule,
  NbAlertModule,
  NbSpinnerModule
} from '@nebular/theme';
import { Observable, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { GameService } from '../../core/services/game.service';

@Component({
  selector: 'app-join-game',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    NbInputModule,
    NbButtonModule,
    NbIconModule,
    NbAlertModule,
    NbSpinnerModule
  ],
  templateUrl: './join-game.component.html',
  styleUrls: ['./join-game.component.scss']
})
export class JoinGameComponent implements OnInit {
  joinForm!: FormGroup;
  isAuthenticated$: Observable<boolean>;
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private gameService: GameService
  ) {
    this.isAuthenticated$ = this.authService.user$.pipe(
      map(user => !!user)
    );
  }

  ngOnInit(): void {
    this.initForm();

    // Перевірка наявності параметра code в URL
    this.route.queryParams.subscribe(params => {
      if (params['code']) {
        const code = params['code'];
        // Перевіряємо, чи код складається тільки з цифр та має довжину 4
        if (/^\d{4}$/.test(code)) {
          this.joinForm.get('joinCode')?.setValue(code);
        }
      }
    });
  }

  /**
   * Ініціалізує форму з валідацією
   */
  initForm(): void {
    this.joinForm = this.fb.group({
      joinCode: ['', [
        Validators.required,
        Validators.minLength(4),
        Validators.maxLength(4),
        Validators.pattern('^[0-9]*$')
      ]]
    });
  }

  /**
   * Обробляє процес приєднання до гри
   */
  joinGame(): void {
    if (this.joinForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    const joinCode = this.joinForm.get('joinCode')?.value;

    // Викликаємо сервіс для приєднання до гри
    this.gameService.joinGame(joinCode).subscribe({
      error: (error) => {
        this.isLoading = false;

        // Відображаємо повідомлення про помилку
        if (error.code === 'not-found') {
          this.errorMessage = 'Гру з таким кодом не знайдено або термін приєднання закінчився';
        } else if (error.code === 'failed-precondition') {
          this.errorMessage = 'Максимальну кількість гравців для цієї гри вже досягнуто';
        } else {
          this.errorMessage = 'Помилка при приєднанні до гри. Спробуйте пізніше.';
        }

        console.error('Error joining game:', error);
      }
    });
  }
}