import type { DepartureEstimate } from './types.js';
/**
 * Normalizes Romanian strings by removing diacritics and converting to lowercase
 */
export declare function normalizeText(text: string): string;
/**
 * Great-circle distance between two GPS coordinates in meters (Haversine formula)
 */
export declare function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number;
export interface BucharestTimeInfo {
    hour: number;
    minute: number;
    isWeekend: boolean;
    timeString: string;
    dayName: string;
}
/**
 * Returns the current time in Europe/Bucharest timezone
 */
export declare function getBucharestTime(date?: Date): BucharestTimeInfo;
/**
 * Calculate upcoming timetable departures from GTFS schedule strings
 */
export declare function calculateNextDepartures(scheduleWd?: string, scheduleWe?: string, options?: {
    customHour?: number;
    customMinute?: number;
    customIsWeekend?: boolean;
    limit?: number;
}): {
    estimates: DepartureEstimate[];
    allTodayDepartures: string[];
    dayType: 'weekday' | 'weekend';
};
/**
 * Resolves path to a bundled data file with multiple fallback locations
 */
export declare function resolveDataPath(filename: string): string;
//# sourceMappingURL=utils.d.ts.map