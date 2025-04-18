import { Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy, SimpleChanges, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { MapService } from '../../services/map.service';
import { CommonModule } from '@angular/common';
import { NbIconModule } from '@nebular/theme';

interface Player {
  id: string;
  color: string;
  displayName: string;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [CommonModule, NbIconModule]
})
export class MapComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() mapStatus: any = {};
  @Input() mapData: any = {};
  @Input() currentUserId: string = '';
  @Input() currentPhase: any = {};
  @Input() isProcessing: boolean = false; // Новий параметр для блокування під час обробки запиту
  @Input() players: Player[] = [];

  @ViewChild('map')
  map!: ElementRef<HTMLDivElement>;

  @Output() regionSelect = new EventEmitter<string>();

  private regionSelectSubscription: Subscription | null = null;

  constructor(private mapService: MapService) { }

  ngOnInit(): void {
    // Підписуємось на події вибору регіону від сервісу
    this.regionSelectSubscription = this.mapService.regionSelect$.subscribe(regionId => {
      this.onRegionClick(regionId);
    });

    // Додаємо обробник зміни розміру вікна
    window.addEventListener('resize', this.onResize.bind(this));
  }

  ngAfterViewInit() {
    // Доступ до нативного елемента
    setTimeout(() => {
      this.mapService.initMap(this.mapData, this.mapStatus, this.players);
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Якщо змінився статус карти, оновлюємо її відображення
    if (changes['mapStatus']) {
      this.mapService.updateMapStatus(this.mapStatus);
    }

    // Якщо змінилась фаза і вибрано регіон, підсвічуємо його
    if (changes['currentPhase'] && this.currentPhase && this.currentPhase.regionId) {
      // Спочатку скидаємо всі підсвічування
      // Тут можна додати логіку для скидання підсвічування всіх регіонів

      // Потім підсвічуємо вибраний регіон
      this.mapService.highlightRegion(this.currentPhase.regionId, true);
    }
  }

  // Обробник кліку на регіон
  onRegionClick(regionId: string): void {
    // Якщо обробка вже йде, ігноруємо нові кліки
    if (this.isProcessing) {
      return;
    }

    // Перевіряємо, чи можна вибрати регіон на поточній фазі
    if (this.currentPhase.status === 'planning' &&
      this.currentPhase.activePlayerId === this.currentUserId) {

      // Перевіряємо, чи регіон не належить поточному користувачу
      if (this.mapStatus[regionId] !== this.currentUserId) {
        this.regionSelect.emit(regionId);
      }
    }
  }

  // Обробник зміни розміру вікна
  onResize(): void {
    this.mapService.onResize();
  }

  // Get region display name
  getRegionDisplayName(): string {
    if (!this.mapData) return this.currentPhase.regionId;
    const feature = this.mapData.features.find((feature: any) => {
      const regionId = feature.properties["iso3166-2"];
      return regionId == this.currentPhase.regionId;
    });
    // This is a placeholder, could be enhanced with actual region names
    return feature.properties.name;
  }

  ngOnDestroy(): void {
    // Відписуємось від всіх підписок
    if (this.regionSelectSubscription) {
      this.regionSelectSubscription.unsubscribe();
    }

    // Видаляємо обробник зміни розміру вікна
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}