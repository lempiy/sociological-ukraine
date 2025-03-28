import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import * as d3 from 'd3';
import { doc, Firestore, onSnapshot } from '@angular/fire/firestore';


interface PlayerColor {
    id: string;
    displayName: string;
    color: string;
}

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
    private originalGeoJson: d3.ExtendedFeature | d3.ExtendedFeatureCollection | d3.GeoGeometryObjects | d3.ExtendedGeometryCollection | null = null;
    private playerColors: PlayerColor[] = [];
    // Подія вибору регіону
    private regionSelectSubject = new Subject<string>();
    public regionSelect$ = this.regionSelectSubject.asObservable();

    // Кольори гравців
    private readonly NEUTRAL_COLOR = '#ccc';

    constructor(private zone: NgZone, private firestore: Firestore) { }



    // Функція ініціалізації карти
    initMap(geoJson: any, mapStatus: any, playerColors: PlayerColor[]): void {
        this.zone.runOutsideAngular(() => {
            console.log('rebuild');
            this.currentMapStatus = mapStatus;
            this.originalGeoJson = geoJson;
            this.playerColors = playerColors;

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
                    const hoverElement = d3.select(event.currentTarget);

                    // Застосовуємо затемнення, зберігаючи такий самий border
                    hoverElement
                        .attr('fill-opacity', 0.7); // Зменшуємо opacity для ефекту затемнення
                })
                .on('mouseout', (event: any, d: any) => {
                    const element = d3.select(event.currentTarget);

                    // Відновлюємо нормальну непрозорість без зміни границі
                    element
                        .attr('fill-opacity', 1); // Повертаємо повну непрозорість
                });

            // Зберігаємо посилання на регіони для швидкого доступу
            geoJson.features.forEach((feature: any) => {
                const regionId = feature.properties["iso3166-2"];
                this.regions[regionId] = this.map.select(`#region-${regionId}`);
            });
            console.log(geoJson);
            // Додаємо назви регіонів
            this.map.selectAll('text')
                .data(geoJson.features)
                .enter()
                .append('text')
                .attr('x', (d: any) => this.path.centroid(d)[0])
                .attr('y', (d: any) => this.path.centroid(d)[1])
                .attr('pointer-events', 'none')
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('fill', '#333')
                .text((d: any) => this.getRegionLabel(d.properties["name"]));
        });
    }

    // Функція виділення регіону
    highlightRegion(regionName: string, highlight: boolean = true): void {
        this.zone.runOutsideAngular(() => {
            const region = this.regions[regionName];
            if (region) {
                if (highlight) {
                    // Застосовуємо затемнення для виділення регіону без зміни границі
                    region
                        .attr('fill-opacity', 0.7);
                } else {
                    // Повертаємо нормальний стан без зміни границі
                    region
                        .attr('fill-opacity', 1);
                }
            }
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
                    region.attr('fill-opacity', 1)
                }
            });
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
        return this.playerColors.find((p) => p.id == playerId)?.color || this.NEUTRAL_COLOR;
    }

    /**
     * Отримує скорочену назву регіону для відображення на карті
     */
    private getRegionLabel(fullName: string): string {
        // Скорочуємо "область" до "обл." для кращого відображення на карті
        return fullName.replace(' область', '');
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
        if (!container || !this.svg || !this.originalGeoJson) return;

        // Отримуємо нові розміри контейнера
        this.width = container.clientWidth;
        this.height = container.clientHeight || 300;

        // Оновлюємо розміри SVG
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);

        // Важливо! Оновлюємо проекцію з новими розмірами
        this.projection.fitSize([this.width, this.height], this.originalGeoJson);

        // Оновлюємо path генератор з новою проекцією
        this.path = d3.geoPath().projection(this.projection);

        // Перемальовуємо всі шляхи з новим path генератором
        this.map.selectAll('path')
            .attr('d', this.path);

        // Перераховуємо координати для текстових міток
        this.map.selectAll('text')
            .attr('x', (d: any) => this.path.centroid(d)[0])
            .attr('y', (d: any) => this.path.centroid(d)[1]);
    }

    /**
   * Initialize a static (non-interactive) map for results page
   * @param container HTML element to render the map
   * @param geoJson GeoJSON data
   * @param mapStatus Current map status (regions ownership)
   * @param playerColors Player colors
   */
    initStaticMap(container: HTMLElement, geoJson: any, mapStatus: any, players: PlayerColor[]): void {
        this.zone.runOutsideAngular(() => {
            // Clear previous map
            d3.select(container).selectAll('*').remove();

            this.currentMapStatus = mapStatus;
            this.originalGeoJson = geoJson;
            this.playerColors = players;

            // Get container dimensions
            this.width = container.clientWidth;
            this.height = container.clientHeight;

            // Create SVG element
            const svg = d3.select(container)
                .append('svg')
                .attr('width', this.width)
                .attr('height', this.height);

            // Setup projection
            const projection = d3.geoMercator()
                .fitSize([this.width, this.height], geoJson);

            // Create path generator
            const path = d3.geoPath().projection(projection) as any;

            // Render regions
            const map = svg.append('g');

            map.selectAll('path')
                .data(geoJson.features)
                .enter()
                .append('path')
                .attr('d', path)
                .attr('id', (d: any) => `static-region-${d.properties["iso3166-2"]}`)
                .attr('fill', (d: any) => this.getRegionColor(d.properties["iso3166-2"]))
                .attr('stroke', '#fff')
                .attr('stroke-width', 0.5);

            // Add region labels
            map.selectAll('text')
                .data(geoJson.features)
                .enter()
                .append('text')
                .attr('x', (d: any) => path.centroid(d)[0])
                .attr('y', (d: any) => path.centroid(d)[1])
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('fill', '#333')
                .text((d: any) => this.getRegionLabel(d.properties["name"]));

            // Add legend
            this.addMapLegend(svg, players);
        });
    }

    /**
     * Add a legend to the map showing players and their colors
     */
    private addMapLegend(svg: any, players: PlayerColor[]): void {
        const legendGroup = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(0, 0)`);

        const legendItems = legendGroup.selectAll('.legend-item')
            .data(players)
            .enter()
            .append('g')
            .attr('class', 'legend-item')
            .attr('transform', (d: any, i: number) => `translate(0, ${i * 20})`);

        // Color boxes
        legendItems.append('rect')
            .attr('width', 15)
            .attr('height', 15)
            .attr('fill', (d: PlayerColor) => d.color);

        // Player names
        legendItems.append('text')
            .attr('x', 20)
            .attr('y', 12)
            .attr('font-size', '10px')
            .text((d: PlayerColor) => d.displayName);
    }
}