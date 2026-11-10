import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Normalizes Romanian strings by removing diacritics and converting to lowercase
 */
export function normalizeText(text) {
    if (!text)
        return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[șş]/gi, 's')
        .replace(/[țţ]/gi, 't')
        .replace(/[ăâ]/gi, 'a')
        .replace(/[î]/gi, 'i')
        .toLowerCase()
        .trim();
}
/**
 * Great-circle distance between two GPS coordinates in meters (Haversine formula)
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}
/**
 * Returns the current time in Europe/Bucharest timezone
 */
export function getBucharestTime(date = new Date()) {
    // Use Intl API to format in Europe/Bucharest timezone
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Bucharest',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
    }).formatToParts(date);
    let hour = 0;
    let minute = 0;
    let weekdayStr = '';
    for (const part of parts) {
        if (part.type === 'hour')
            hour = parseInt(part.value, 10);
        if (part.type === 'minute')
            minute = parseInt(part.value, 10);
        if (part.type === 'weekday')
            weekdayStr = part.value.toLowerCase();
    }
    // Handle midnight 24 edge-case in some Intl implementations
    if (hour === 24)
        hour = 0;
    const isWeekend = weekdayStr.startsWith('sat') || weekdayStr.startsWith('sun');
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return {
        hour,
        minute,
        isWeekend,
        timeString: `${hh}:${mm}`,
        dayName: weekdayStr
    };
}
/**
 * Calculate upcoming timetable departures from GTFS schedule strings
 */
export function calculateNextDepartures(scheduleWd, scheduleWe, options) {
    const bucharestTime = getBucharestTime();
    const isWeekend = options?.customIsWeekend ?? bucharestTime.isWeekend;
    const currentHour = options?.customHour ?? bucharestTime.hour;
    const currentMinute = options?.customMinute ?? bucharestTime.minute;
    const limit = options?.limit ?? 5;
    const rawSchedule = isWeekend
        ? scheduleWe || scheduleWd
        : scheduleWd || scheduleWe;
    if (!rawSchedule) {
        return { estimates: [], allTodayDepartures: [], dayType: isWeekend ? 'weekend' : 'weekday' };
    }
    const departures = rawSchedule
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .sort();
    const nowMinutes = currentHour * 60 + currentMinute;
    const estimates = [];
    for (const timeStr of departures) {
        const parts = timeStr.split(':');
        if (parts.length !== 2)
            continue;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m))
            continue;
        const depMinutes = h * 60 + m;
        if (depMinutes >= nowMinutes) {
            const diff = depMinutes - nowMinutes;
            let display;
            if (diff === 0) {
                display = 'Pleacă acum';
            }
            else if (diff === 1) {
                display = `în 1 min (la ${timeStr})`;
            }
            else if (diff < 60) {
                display = `în ${diff} min (la ${timeStr})`;
            }
            else {
                display = `la ${timeStr}`;
            }
            estimates.push({
                time: timeStr,
                minutesUntil: diff,
                display
            });
            if (estimates.length >= limit)
                break;
        }
    }
    return {
        estimates,
        allTodayDepartures: departures,
        dayType: isWeekend ? 'weekend' : 'weekday'
    };
}
/**
 * Resolves path to a bundled data file with multiple fallback locations
 */
export function resolveDataPath(filename) {
    const candidates = [];
    if (process.env.BUCHAREST_TRANSIT_DATA_DIR) {
        candidates.push(path.join(process.env.BUCHAREST_TRANSIT_DATA_DIR, filename));
    }
    // Relative to current module dist/ or src/
    candidates.push(path.resolve(__dirname, '../data', filename));
    candidates.push(path.resolve(__dirname, '../../data', filename));
    candidates.push(path.resolve(__dirname, 'data', filename));
    // Current working directory
    candidates.push(path.resolve(process.cwd(), 'data', filename));
    candidates.push(path.resolve(process.cwd(), filename));
    // System fallback
    candidates.push(path.resolve('/tmp/bucharest-transit-ref/Sources/BucharestTransit/Resources', filename));
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Bucharest transit data file "${filename}" could not be found in candidates: ${candidates.join(', ')}`);
}
//# sourceMappingURL=utils.js.map