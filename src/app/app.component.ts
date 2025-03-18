import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NbLayoutModule, NbThemeModule, NbButtonModule, NbAlertModule } from '@nebular/theme';
import { NavbarComponent } from './shared/layout/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    NbLayoutModule,
    NbButtonModule,
    NbAlertModule,
    NavbarComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Соціологічна Україна';
}