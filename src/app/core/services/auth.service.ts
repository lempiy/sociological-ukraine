import { Injectable } from '@angular/core';
import { Auth, GoogleAuthProvider, User, signInWithPopup, signOut } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, from } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$: Observable<User | null> = this.userSubject.asObservable();
  public authStateReady$: Observable<void> = EMPTY;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {
    this.authStateReady$ = from(this.auth.authStateReady())
    // Підписка на зміни статусу аутентифікації
    this.auth.onAuthStateChanged(user => {
      this.userSubject.next(user);
    });
  }
  // Метод для аутентифікації через Google
  loginWithGoogle(): Observable<any> {
    const provider = new GoogleAuthProvider();

    return from(signInWithPopup(this.auth, provider)).pipe(
      switchMap(credentials => {
        const user = credentials.user;

        // Створюємо або оновлюємо запис користувача в Firestore
        return from(this.updateUserData(user)).pipe(
          tap(() => this.userSubject.next(user))
        );
      })
    );
  }

  // Метод для виходу з системи
  logout(): Observable<void> {
    return from(signOut(this.auth)).pipe(
      tap(() => {
        this.userSubject.next(null);
        this.router.navigate(['']);
      })
    );
  }

  // Метод для оновлення даних користувача в Firestore
  private updateUserData(user: User): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);

    const data = {
      id: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      updatedAt: new Date()
    };

    return setDoc(userRef, data, { merge: true });
  }

  // Метод для перевірки, чи користувач авторизований
  get isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }

  // Отримання поточного об'єкта користувача
  get currentUser(): User | null {
    return this.userSubject.value;
  }
}