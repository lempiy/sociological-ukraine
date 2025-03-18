import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  canActivate(): Observable<boolean | UrlTree> {
    return this.authService.user$.pipe(
      take(1),
      map(user => {
        const isAuthenticated = !!user;
        if (isAuthenticated) {
          return true;
        }

        // Якщо користувач не автентифікований, перенаправляємо на головну сторінку
        return this.router.createUrlTree(['']);
      })
    );
  }
}