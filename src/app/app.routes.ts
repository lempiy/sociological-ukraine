import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { GameRulesComponent } from './pages/game-rules/game-rules.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { CreateGameComponent } from './pages/create-game/create-game.component';
import { JoinGameComponent } from './pages/join-game/join-game.component';
import { GameComponent } from './pages/game/game.component';
import { GameLobbyComponent } from './pages/game-lobby/game-lobby.component';
import { GameResultComponent } from './pages/game-result/game-result.component';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'game-rules',
    component: GameRulesComponent
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'create-game',
    component: CreateGameComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'join-game',
    component: JoinGameComponent
  },
  {
    path: 'game/:gameId',
    component: GameComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'game/:gameId/lobby',
    component: GameLobbyComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'game/:gameId/result',
    component: GameResultComponent,
    canActivate: [AuthGuard]
  },
  // Перенаправлення на головну сторінку для неіснуючих маршрутів
  {
    path: '**',
    redirectTo: ''
  }
];
