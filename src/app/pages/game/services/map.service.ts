import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import * as d3 from 'd3';
import { doc, Firestore, onSnapshot } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class MapService {
    private svg: any;
    private map: any;
    private projection: any;
    private path: any;
    private width = 0;
    private height = 0;
    private regions: any = {};
    private currentMapStatus: any = {};

    // Подія вибору регіону
    private regionSelectSubject = new Subject<string>();
    public regionSelect$ = this.regionSelectSubject.asObservable();

    // Кольори гравців
    private readonly NEUTRAL_COLOR = '#ccc';

    constructor(private zone: NgZone, private firestore: Firestore) { }

    /**
     * Ініціалізує карту з даними GeoJSON та статусами регіонів
     */
    initMap(geoJson: any, mapStatus: any): void {
        this.zone.runOutsideAngular(() => {
            console.log('rebuild')
            this.currentMapStatus = mapStatus;

            // Очищаємо попередню карту, якщо вона існує
            d3.select('#map-container').selectAll('*').remove();

            // Отримуємо розміри контейнера
            const container = document.getElementById('map-container');

            if (!container) return;

            this.width = container.clientWidth;
            this.height = container.clientHeight;

            console.log(this.width, this.height);

            // Створюємо SVG елемент
            this.svg = d3.select('#map-container')
                .append('svg')
                .attr('width', this.width)
                .attr('height', this.height);

            // Налаштовуємо проекцію
            this.projection = d3.geoMercator()
                .fitSize([this.width, this.height], geoJson);

            // Створюємо path генератор
            this.path = d3.geoPath()
                .projection(this.projection);

            // Відображаємо регіони
            this.map = this.svg.append('g');

            this.map.selectAll('path')
                .data(geoJson.features)
                .enter()
                .append('path')
                .attr('d', this.path)
                .attr('id', (d: any) => `region-${d.properties["iso3166-2"]}`)
                .attr('fill', (d: any) => this.getRegionColor(d.properties["iso3166-2"]))
                .attr('stroke', '#fff')
                .attr('stroke-width', 0.5)
                .attr('cursor', 'pointer')
                .on('click', (event: any, d: any) => {
                    // Запускаємо в зоні Angular
                    this.zone.run(() => {
                        this.onRegionClick(d.properties["iso3166-2"]);
                    });
                })
                .on('mouseover', (event: any, d: any) => {
                    d3.select(event.currentTarget)
                        .attr('stroke-width', 2)
                        .attr('stroke', '#333');
                })
                .on('mouseout', (event: any, d: any) => {
                    d3.select(event.currentTarget)
                        .attr('stroke-width', 0.5)
                        .attr('stroke', '#fff');
                });

            // Зберігаємо посилання на регіони для швидкого доступу
            geoJson.features.forEach((feature: any) => {
                const regionName = feature.properties["iso3166-2"];
                this.regions[regionName] = this.map.select(`#region-${regionName}`);
            });

            // Додаємо назви регіонів
            this.map.selectAll('text')
                .data(geoJson.features)
                .enter()
                .append('text')
                .attr('x', (d: any) => this.path.centroid(d)[0])
                .attr('y', (d: any) => this.path.centroid(d)[1])
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('fill', '#333')
                .text((d: any) => this.getRegionLabel(d.properties["iso3166-2"]));

        });
    }

    /**
     * Оновлює статус регіонів на карті
     */
    updateMapStatus(mapStatus: any): void {
        this.zone.runOutsideAngular(() => {
            this.currentMapStatus = mapStatus;

            // Оновлюємо кольори для всіх регіонів
            Object.keys(this.regions).forEach(regionName => {
                const region = this.regions[regionName];
                if (region) {
                    region.attr('fill', this.getRegionColor(regionName));
                }
            });
        });
    }

    /**
     * Виділяє регіон на карті
     */
    highlightRegion(regionName: string, highlight: boolean = true): void {
        this.zone.runOutsideAngular(() => {
            const region = this.regions[regionName];
            if (region) {
                if (highlight) {
                    region
                        .attr('stroke-width', 2)
                        .attr('stroke', '#000');
                } else {
                    region
                        .attr('stroke-width', 0.5)
                        .attr('stroke', '#fff');
                }
            }
        });
    }

    /**
     * Обробник кліку на регіон
     */
    private onRegionClick(regionName: string): void {
        this.regionSelectSubject.next(regionName);
    }

    /**
     * Отримує колір для регіону на основі статусу
     */
    private getRegionColor(regionName: string): string {
        const playerId = this.currentMapStatus[regionName];

        if (!playerId) {
            return this.NEUTRAL_COLOR; // Нейтральний регіон
        }

        // Повертаємо колір гравця з властивості map.status
        return playerId;
    }

    /**
     * Отримує скорочену назву регіону для відображення на карті
     */
    private getRegionLabel(fullName: string): string {
        // Скорочуємо "область" до "обл." для кращого відображення на карті
        return fullName.replace(' область', ' обл.');
    }

    /**
   * Отримує дані карти з Firestore
   * @param mapId Ідентифікатор карти
   * @returns Observable з даними карти
   */
    getMapData(mapId: string): Observable<any> {
        return new Observable<any>(observer => {
            const mapRef = doc(this.firestore, `maps/${mapId}`);

            return onSnapshot(mapRef,
                (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        const mapData = docSnapshot.data();
                        observer.next(mapData);
                    } else {
                        observer.error(new Error('Map not found'));
                    }
                },
                (error) => {
                    observer.error(error);
                }
            );
        });
    }

    /**
     * Змінює розмір карти при зміні розміру вікна
     */
    onResize(): void {
        const container = document.getElementById('map-container');
        if (!container || !this.svg) return;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg
            .attr('width', this.width)
            .attr('height', this.height);

        // Оновлюємо проекцію та перемальовуємо карту
        // Ця функціональність вимагатиме збереження оригінального GeoJSON
        // і може бути реалізована при необхідності
    }
}