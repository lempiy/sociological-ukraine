import { Injectable } from '@angular/core';
import { Firestore, collection, doc, getDoc, onSnapshot } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface Game {
  id: string;
  status: 'lobby' | 'running' | 'finished' | 'skipped';
  name: string;
  map: {
    id: string;
    updatedAt: Date;
    status: Record<string, string>;
  };
  players: Array<{
    id: string;
    displayName: string;
    avatarUrl: string;
    color: string;
    isCreator: boolean;
    isWinner?: boolean;
  }>;
  moves: Array<{
    playerId: string;
    round: number;
  }>;
  rules: {
    timeForPlanning: number;
    timeForPostPlanning: number;
    timeForAnswer: number;
    timeForPostAnswer: number;
    numberOfPlayers: number;
    maxRounds: number;
  };
  currentRound: number;
  currentPhase: any;
  phases: any[];
  joinCode: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateGameParams {
  gameName: string;
  timeForPlanning: number;
  timeForAnswer: number;
  numberOfPlayers: number;
  maxRounds: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {

  constructor(
    private firestore: Firestore,
    private functions: Functions,
    private router: Router
  ) { }

  // Створення нової гри
  createGame(params: CreateGameParams): Observable<{ gameId: string }> {
    const createGameFn = httpsCallable(this.functions, 'createGame');

    return from(createGameFn(params)).pipe(
      map(result => result.data as { gameId: string }),
      tap(({ gameId }) => {
        this.router.navigate(['/game', gameId, 'lobby']);
      }),
      catchError(error => {
        console.error('Error creating game', error);
        return throwError(() => error);
      })
    );
  }

  // Приєднання до існуючої гри
  joinGame(joinCode: string): Observable<{ gameId: string }> {
    const joinGameFn = httpsCallable(this.functions, 'joinGame');

    return from(joinGameFn({ joinCode })).pipe(
      map(result => result.data as { gameId: string }),
      tap(({ gameId }) => {
        this.router.navigate(['/game', gameId, 'lobby']);
      }),
      catchError(error => {
        console.error('Error joining game', error);
        return throwError(() => error);
      })
    );
  }

  // Вихід з гри
  leaveGame(gameId: string): Observable<{ success: boolean }> {
    const leaveGameFn = httpsCallable(this.functions, 'leaveGame');

    return from(leaveGameFn({ gameId })).pipe(
      map(result => result.data as { success: boolean }),
      tap(() => {
        this.router.navigate(['']);
      }),
      catchError(error => {
        console.error('Error leaving game', error);
        return throwError(() => error);
      })
    );
  }

  // Отримання інформації про гру
  getGame(gameId: string): Observable<Game> {
    return new Observable<Game>(observer => {
      const gameRef = doc(this.firestore, `games/${gameId}`);

      return onSnapshot(gameRef,
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const gameData = docSnapshot.data() as Game;
            observer.next(gameData);
          } else {
            observer.error(new Error('Game not found'));
          }
        },
        (error) => {
          observer.error(error);
        }
      );
    });
  }

  // Вибір регіону у фазі планування
  setPlanningResult(gameId: string, regionId: string): Observable<{ success: boolean }> {
    const setPlanningResultFn = httpsCallable(this.functions, 'setPlanningResult');

    return from(setPlanningResultFn({ gameId, regionId })).pipe(
      map(result => result.data as { success: boolean }),
      catchError(error => {
        console.error('Error setting planning result', error);
        return throwError(() => error);
      })
    );
  }

  // Відповідь на питання
  setAnswer(gameId: string, variant?: number, number?: number): Observable<{ success: boolean }> {
    const setAnswerFn = httpsCallable(this.functions, 'setAnswer');

    return from(setAnswerFn({ gameId, variant, number })).pipe(
      map(result => result.data as { success: boolean }),
      catchError(error => {
        console.error('Error setting answer', error);
        return throwError(() => error);
      })
    );
  }
}