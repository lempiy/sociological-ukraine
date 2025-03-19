import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, from, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor(
    private firestore: Firestore,
    private authService: AuthService
  ) { }

  // Отримати повну інформацію про користувача
  getUserData(userId: string): Observable<any> {
    const userRef = doc(this.firestore, `users/${userId}`);
    return from(getDoc(userRef)).pipe(
      switchMap(docSnap => {
        if (docSnap.exists()) {
          return of(docSnap.data());
        } else {
          return of(null);
        }
      })
    );
  }

  // Отримати статистику поточного користувача
  getUserStats(): Observable<any> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (user) {
          return this.getUserData(user.uid).pipe(
            switchMap(userData => {
              // Якщо у користувача є статистика, повертаємо її,
              // якщо ні - повертаємо стандартну заготовку
              if (userData && userData.stats) {
                return of(userData.stats);
              } else {
                return of({
                  gamesPlayed: 0,
                  gamesWon: 0,
                  questionsAnswered: 0
                });
              }
            })
          );
        } else {
          return of(null);
        }
      })
    );
  }

  // Оновити статистику користувача
  updateUserStats(userId: string, stats: any): Observable<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    return from(updateDoc(userRef, { stats }));
  }
}