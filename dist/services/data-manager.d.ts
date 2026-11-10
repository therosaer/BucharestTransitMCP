import { type DirectRouteConnection, type LineDetails, type LineSummary, type NearbyStop, type RouteMetadata, type StationSchedule, type StationTransfer, type TransitAgency } from '../types.js';
export declare class TransitDataManager {
    private static instance;
    private routesMap;
    private lineIndex;
    private uniqueStops;
    private agencies;
    private gtfsStopsById;
    private stopAmenities;
    private transfersByStop;
    private initialized;
    static getInstance(): TransitDataManager;
    private constructor();
    private initialize;
    private loadGtfsSupplementaryData;
    private indexStation;
    getAgencies(): TransitAgency[];
    getTransfers(stopIdOrName: string): StationTransfer[];
    getRouteMetadata(routeIdOrLine: string): RouteMetadata | undefined;
    listLines(typeFilter?: string, query?: string): LineSummary[];
    private getDefaultTypeName;
    getLineDetails(lineName: string): LineDetails | null;
    searchStations(query: string, limit?: number): Array<{
        name: string;
        code?: string;
        description?: string;
        platformCode?: string;
        amenities?: string[];
        latitude: number;
        longitude: number;
        lines: Array<{
            line: string;
            type: string;
            direction: string;
        }>;
    }>;
    findNearbyStops(lat: number, lon: number, radiusMeters?: number, limit?: number): NearbyStop[];
    getStationSchedule(lineName: string, stationQuery: string, direction?: 'tur' | 'retur' | 'all', limit?: number, customHour?: number, customMinute?: number, customIsWeekend?: boolean): StationSchedule[];
    findDirectRoute(originQuery: string, destinationQuery: string): DirectRouteConnection[];
    private checkSequence;
}
//# sourceMappingURL=data-manager.d.ts.map