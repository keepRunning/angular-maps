﻿import { Component, EventEmitter, OnChanges, OnInit, OnDestroy, SimpleChange, ViewChild, Input, ElementRef } from "@angular/core";
import { MapServiceFactory } from "../services/mapservicefactory";
import { MapService } from "../services/mapservice";
import { MarkerService } from "../services/markerservice";
import { BingMarkerService } from "../services/bingmarkerservice";
import { InfoBoxService } from "../services/infoboxservice";
import { LayerService } from "../services/layerservice";
import { BingInfoBoxService } from "../services/binginfoboxservice";
import { BingMapService } from "../services/bingmapservice";
import { ILatLong } from "../interfaces/ilatlong";
import { IBox } from "../interfaces/ibox";
import { IMapOptions } from "../interfaces/imapoptions";
import { MapTypeId } from "../models/maptypeid";

///
/// Map renders a Bing Map.
/// **Important note**: To be able see a map in the browser, you have to define a height for the CSS
/// class `bing-map-container`.
///
/// ### Example
/// ```typescript
/// import {Component} from '@angular/core';
/// import {BingMap} from '...';
///
/// @Component({
///  selector: 'my-map',
///  styles: [`
///    .map-container { height: 300px; }
/// `],
///  template: `
///    <map [latitude]="lat" [longitude]="lng" [zoom]="zoom"></map>
///  `
/// })
/// ```
///
@Component({
    selector: 'x-map',
    providers: [
        { provide: MapService, deps: [MapServiceFactory], useFactory: (f: MapServiceFactory) => f.Create() },
        { provide: MarkerService, deps: [MapServiceFactory], useFactory: (f: MapServiceFactory) => f.CreateMarkerService() }, 
        { provide: InfoBoxService, deps: [MapServiceFactory], useFactory: (f: MapServiceFactory) => f.CreateInfoBoxService() },
        { provide: LayerService, deps: [MapServiceFactory], useFactory: (f: MapServiceFactory) => f.CreateLayerService() }  
    ],
    template: `
        <div #container class='map-container-inner'></div>
        <div class='map-content'>
            <ng-content></ng-content>
        </div>
    `,
    outputs: ['MapClick', 'MapRightClick', 'MapDblClick', 'ViewChange', 'ZoomChange', 'CenterChange'],
    host: { '[class.map-container]': 'true' },
    styles: [`
        .map-container-inner { width: inherit; height: inherit; }
        .map-content { display:none; }
    `]
})
export class Map implements OnChanges, OnInit, OnDestroy {
    private _longitude: number = 0;
    private _latitude: number = 0;
    private _zoom: number = 0;
    private _clickTimeout: number | NodeJS.Timer;
    private _options: IMapOptions = {};
    private _box: IBox = null;
    private _mapPromise: Promise<void>;

    @ViewChild('container') _container: ElementRef;

    ///
    /// Map Options
    ///
    @Input()
    public set Options(val: IMapOptions) { this._options = val; }
    public get Options(): IMapOptions { return this._options };

    ///
    /// Maximum and minimum bounding box for map. 
    ///
    @Input()
    public set Box(val: IBox) { this._box = val; }
    public get Box(): IBox { return this._box; }

    ///
    /// This event emitter gets emitted when the user clicks on the map (but not when they click on a
    /// marker or infoWindow).
    ///
    MapClick: EventEmitter<MouseEvent> = new EventEmitter<MouseEvent>();

    ///
    /// This event emitter gets emitted when the user right-clicks on the map (but not when they click
    /// on a marker or infoWindow).
    ///
    MapRightClick: EventEmitter<MouseEvent> = new EventEmitter<MouseEvent>();

    ///
    /// This event emitter gets emitted when the user double-clicks on the map (but not when they click
    /// on a marker or infoWindow).
    ///
    MapDblClick: EventEmitter<MouseEvent> = new EventEmitter<MouseEvent>();

    ///
    /// This event emitter is fired when the map center changes.
    ///
    CenterChange: EventEmitter<ILatLong> = new EventEmitter<ILatLong>();

    ///
    /// This event emiiter is fired when the map zoom changes
    ///
    ZoomChange: EventEmitter<Number> = new EventEmitter<Number>();

    ///
    /// Sets the zoom level of the map. The default value is `8`.
    ///
    @Input()
    public set Zoom(value: number | string) {
        this._zoom = this.ConvertToDecimal(value, 8);
        if (typeof this._zoom === 'number') {
            this._mapService.SetZoom(this._zoom);
        }
    }
    public get Zoom(): number | string { return this._zoom; }

    ///
    /// Sets the longitude that sets the center of the map.
    ///
    @Input()
    public set Longitude(value: number | string) {
        this._longitude = this.ConvertToDecimal(value);
        this.UpdateCenter();
    }
    public get Longitude(): number| string { return this._longitude; }

    ///
    /// Sets the latitude that sets the center of the map.
    ///
    @Input()
    public set Latitude(value: number | string) {
        this._latitude = this.ConvertToDecimal(value);
        this.UpdateCenter();
    }
    public get Latitude(): number | string { return this._longitude; }

    constructor(private _mapService: MapService) {}

    public ngOnInit() {
        this.InitMapInstance(this._container.nativeElement);
    }

    public ngOnChanges(changes: { [propName: string]: SimpleChange }) {
        if(this._mapPromise){
            if (changes['Box']) {
                if (this._box != null) {
                    this._mapService.SetViewOptions(<IMapOptions>{
                        bounds: this._box
                    });
                }
            }
            if (changes['Options']) {
                this._mapService.SetMapOptions(this._options);
            }
        }
    }

    public ngOnDestroy() {
        this._mapService.DisposeMap();
    }

    ///
    /// Triggers a resize event on the map instance.
    /// Returns a promise that gets resolved after the event was triggered.
    ///
    public TriggerResize(): Promise<void> {
        // Note: When we would trigger the resize event and show the map in the same turn (which is a
        // common case for triggering a resize event), then the resize event would not
        // work (to show the map), so we trigger the event in a timeout.
        return new Promise<void>((resolve) => {
            setTimeout(
                () => { return this._mapService.TriggerMapEvent('resize').then(() => resolve()); });
        });
    }


    private InitMapInstance(el: HTMLElement) {
        if (this._options.center == null) this._options.center = { latitude: this._latitude, longitude: this._longitude }
        if (this._options.zoom == null) this._options.zoom = this._zoom;
        if (this._options.mapTypeId == null) this._options.mapTypeId = MapTypeId.aerial;
        this._mapPromise = this._mapService.CreateMap(el, this._options);
        this.HandleMapCenterChange();
        this.HandleMapZoomChange();
        this.HandleMapClickEvents();
    }


    private ConvertToDecimal(value: string | number, defaultValue: number = null): number {
        if (typeof value === 'string') {
            return parseFloat(value);
        }
        else if (typeof value === 'number') {
            return <number>value;
        }
        return defaultValue;
    }

    private UpdateCenter(): void {
        if (typeof this._latitude !== 'number' || typeof this._longitude !== 'number') {
            return;
        }
        this._mapService.SetCenter({
            latitude: this._latitude,
            longitude: this._longitude,
        });
    }

    private HandleMapClickEvents(): void {
        this._mapService.SubscribeToMapEvent<any>('click').subscribe(e => {
            //
            // this is necessary since bing will treat a doubleclick first as two clicks...'
            ///
            this._clickTimeout = setTimeout(() => {
                this.MapClick.emit(<MouseEvent>e);
            }, 300)
        });
        this._mapService.SubscribeToMapEvent<any>('dblclick').subscribe(e => {
            if (this._clickTimeout) clearTimeout(<NodeJS.Timer>this._clickTimeout);
            this.MapDblClick.emit(<MouseEvent>e);
        });
        this._mapService.SubscribeToMapEvent<any>('rightclick').subscribe(e => {
            this.MapRightClick.emit(<MouseEvent>e);
        });
    }

    private HandleMapCenterChange(): void {
        this._mapService.SubscribeToMapEvent<void>('viewchangeend').subscribe(() => {
            this._mapService.GetCenter().then((center: ILatLong) => {
                if (this._latitude !== center.latitude || this._longitude !== center.longitude) {
                    this._latitude = center.latitude;
                    this._longitude = center.longitude;
                    this.CenterChange.emit(<ILatLong>{ latitude: this._latitude, longitude: this._longitude });
                }
            });
        });
    }

    private HandleMapZoomChange(): void {
        this._mapService.SubscribeToMapEvent<void>('viewchangeend').subscribe(() => {
            this._mapService.GetZoom().then((z: number) => {
                if (this._zoom !== z) {
                    this._zoom = z;
                    this.ZoomChange.emit(z);
                }
            });
        });
    }
}