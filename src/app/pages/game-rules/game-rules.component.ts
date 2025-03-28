import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NbCardModule, NbAccordionModule, NbLayoutModule, NbButtonModule, NbIconModule } from '@nebular/theme';

@Component({
  selector: 'app-game-rules',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NbCardModule,
    NbAccordionModule,
    NbLayoutModule,
    NbButtonModule,
    NbIconModule
  ],
  templateUrl: './game-rules.component.html',
  styleUrl: './game-rules.component.scss'
})
export class GameRulesComponent {

}