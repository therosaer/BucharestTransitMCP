import fs from 'node:fs';
import {
  type DirectRouteConnection,
  type LineDetails,
  type LineSummary,
  type NearbyStop,
  type RawLineRouteEntry,
  type RouteMetadata,
  type Station,
  type StationSchedule
} from '../types.js';
import {
  calculateNextDepartures,
  getBucharestTime,
  haversineDistanceMeters,
  normalizeText,
  resolveDataPath
} from '../utils.js';

interface UniqueStopAccumulator {
  id: string;
  name: string;
  code?: string;
  lat: number;
  lon: number;
  lines: Map<
    string,
    {
      line: string;
      type: string;
      direction: string;
      scheduleWd?: string;
      scheduleWe?: string;
    }
  >;
}

export class TransitDataManager {
  private static instance: TransitDataManager;

  private routesMap: Map<string, RouteMetadata> = new Map();
  private lineIndex: Map<string, RawLineRouteEntry> = new Map();
  private uniqueStops: Map<string, UniqueStopAccumulator> = new Map();
  private initialized = false;

  public static getInstance(): TransitDataManager {
    if (!TransitDataManager.instance) {
      TransitDataManager.instance = new TransitDataManager();
    }
    return TransitDataManager.instance;
  }

  private constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (this.initialized) return;

    try {
      // 1. Load routes_map.json
      const routesMapPath = resolveDataPath('routes_map.json');
      const rawRoutes = JSON.parse(fs.readFileSync(routesMapPath, 'utf8')) as Record<
        string,
        RouteMetadata
      >;

      for (const [key, meta] of Object.entries(rawRoutes)) {
        this.routesMap.set(key.toUpperCase(), meta);
        // Also map clean line number if not present
        if (meta.line) {
          const cleanLineKey = meta.line.toUpperCase();
          if (!this.routesMap.has(cleanLineKey)) {
            this.routesMap.set(cleanLineKey, meta);
          }
        }
      }

      // 2. Load line_routes_index.json
      const lineIndexPath = resolveDataPath('line_routes_index.json');
      const rawIndex = JSON.parse(fs.readFileSync(lineIndexPath, 'utf8')) as Record<
        string,
        RawLineRouteEntry
      >;

      for (const [key, entry] of Object.entries(rawIndex)) {
        const lineKey = (entry.line || key).toUpperCase();
        this.lineIndex.set(lineKey, entry);

        const meta = this.routesMap.get(lineKey);
        const transitType = meta?.type || 'bus';

        // Index stations from Tur direction
        for (const st of entry.tur_stations || []) {
          this.indexStation(st, lineKey, transitType, 'Tur');
        }

        // Index stations from Retur direction
        for (const st of entry.retur_stations || []) {
          this.indexStation(st, lineKey, transitType, 'Retur');
        }
      }

      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize TransitDataManager:', err);
      throw err;
    }
  }

  private indexStation(
    st: { name: string; code?: string; lat: number; lon: number; schedule_wd?: string; schedule_we?: string },
    line: string,
    transitType: string,
    direction: string
  ): void {
    // Generate a deduplication key using code or rounded coordinates + normalized name
    const stopKey = st.code && st.code !== 'None'
      ? `code-${st.code}`
      : `${normalizeText(st.name)}-${st.lat.toFixed(4)}-${st.lon.toFixed(4)}`;

    let stop = this.uniqueStops.get(stopKey);
    if (!stop) {
      stop = {
        id: stopKey,
        name: st.name,
        code: st.code && st.code !== 'None' ? st.code : undefined,
        lat: st.lat,
        lon: st.lon,
        lines: new Map()
      };
      this.uniqueStops.set(stopKey, stop);
    }

    const serviceKey = `${line}-${direction}`;
    if (!stop.lines.has(serviceKey)) {
      stop.lines.set(serviceKey, {
        line,
        type: transitType,
        direction,
        scheduleWd: st.schedule_wd,
        scheduleWe: st.schedule_we
      });
    }
  }

  public getRouteMetadata(routeIdOrLine: string): RouteMetadata | undefined {
    return this.routesMap.get(routeIdOrLine.toUpperCase());
  }

  /**
   * List all lines with optional filtering by transit mode or search query
   */
  public listLines(typeFilter?: string, query?: string): LineSummary[] {
    const results: LineSummary[] = [];
    const normalizedQuery = query ? normalizeText(query) : '';
    const normalizedType = typeFilter ? normalizeText(typeFilter) : '';

    const seenLines = new Set<string>();

    for (const [lineKey, entry] of this.lineIndex.entries()) {
      if (seenLines.has(lineKey)) continue;
      seenLines.add(lineKey);

      const meta = this.routesMap.get(lineKey);
      const lineName = entry.line || meta?.line || lineKey;
      const type = meta?.type || 'bus';
      const typeName = meta?.typeName || this.getDefaultTypeName(type);
      const color = meta?.color || '#007AFF';
      const operator = meta?.operator || 'STB';

      const terminals: string[] = [];
      if (entry.tur_terminal) terminals.push(entry.tur_terminal);
      if (entry.retur_terminal && entry.retur_terminal !== entry.tur_terminal) {
        terminals.push(entry.retur_terminal);
      } else if (meta?.terminals && meta.terminals.length > 0) {
        terminals.push(...meta.terminals);
      }

      // Check type filter
      if (normalizedType && normalizedType !== 'all') {
        const matchesType =
          normalizeText(type).includes(normalizedType) ||
          normalizeText(typeName).includes(normalizedType);
        if (!matchesType) continue;
      }

      // Check search query
      if (normalizedQuery) {
        const matchesQuery =
          normalizeText(lineName).includes(normalizedQuery) ||
          terminals.some((t) => normalizeText(t).includes(normalizedQuery)) ||
          normalizeText(operator).includes(normalizedQuery);
        if (!matchesQuery) continue;
      }

      results.push({
        line: lineName,
        type,
        typeName,
        color,
        operator,
        terminals,
        activeVehicles: 0
      });
    }

    // Sort by natural alphanumeric order
    results.sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true, sensitivity: 'base' }));

    return results;
  }

  private getDefaultTypeName(type: string): string {
    switch (type.toLowerCase()) {
      case 'tram':
        return 'Tramvai';
      case 'trolley':
      case 'trolleybus':
        return 'Troleibuz';
      case 'regional_bus':
      case 'regional':
        return 'Autobuz Regional';
      case 'night_bus':
      case 'night':
        return 'Autobuz de Noapte';
      case 'metro':
        return 'Metrou';
      default:
        return 'Autobuz';
    }
  }

  /**
   * Get complete details of a specific line (stations, terminals, polylines)
   */
  public getLineDetails(lineName: string): LineDetails | null {
    const lineKey = lineName.trim().toUpperCase();
    const entry = this.lineIndex.get(lineKey);
    if (!entry) return null;

    const meta = this.routesMap.get(lineKey);
    const type = meta?.type || 'bus';
    const typeName = meta?.typeName || this.getDefaultTypeName(type);
    const color = meta?.color || '#007AFF';
    const operator = meta?.operator || 'STB';

    const mapStation = (raw: any, index: number, dir: string): Station => ({
      id: raw.code ? `${lineKey}-${dir}-${raw.code}` : `${lineKey}-${dir}-${index}`,
      name: raw.name,
      code: raw.code && raw.code !== 'None' ? raw.code : undefined,
      terminal: raw.terminal,
      lat: raw.lat,
      lon: raw.lon,
      scheduleWd: raw.schedule_wd,
      scheduleWe: raw.schedule_we
    });

    const turStations = (entry.tur_stations || []).map((s, idx) => mapStation(s, idx, 'tur'));
    const returStations = (entry.retur_stations || []).map((s, idx) => mapStation(s, idx, 'retur'));

    return {
      line: entry.line || lineKey,
      type,
      typeName,
      color,
      operator,
      turTerminal: entry.tur_terminal || null,
      returTerminal: entry.retur_terminal || null,
      turStations,
      returStations,
      turGeometry: entry.tur_geometry?.coordinates,
      returGeometry: entry.retur_geometry?.coordinates,
      liveVehicles: { total: 0, tur: 0, retur: 0 }
    };
  }

  /**
   * Search stations by name or code
   */
  public searchStations(query: string, limit = 15): Array<{
    name: string;
    code?: string;
    latitude: number;
    longitude: number;
    lines: Array<{ line: string; type: string; direction: string }>;
  }> {
    const qNorm = normalizeText(query);
    if (!qNorm) return [];

    const results: Array<{
      name: string;
      code?: string;
      latitude: number;
      longitude: number;
      lines: Array<{ line: string; type: string; direction: string }>;
      score: number;
    }> = [];

    for (const stop of this.uniqueStops.values()) {
      const stopNameNorm = normalizeText(stop.name);
      const codeNorm = stop.code ? normalizeText(stop.code) : '';

      let score = -1;
      if (stopNameNorm === qNorm || codeNorm === qNorm) {
        score = 100;
      } else if (stopNameNorm.startsWith(qNorm) || codeNorm.startsWith(qNorm)) {
        score = 75;
      } else if (stopNameNorm.includes(qNorm) || codeNorm.includes(qNorm)) {
        score = 50;
      }

      if (score > 0) {
        results.push({
          name: stop.name,
          code: stop.code,
          latitude: stop.lat,
          longitude: stop.lon,
          lines: Array.from(stop.lines.values()).map((l) => ({
            line: l.line,
            type: l.type,
            direction: l.direction
          })),
          score
        });
      }
    }

    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return results.slice(0, limit).map(({ score, ...rest }) => rest);
  }

  /**
   * Find stops near given GPS coordinates within radiusMeters
   */
  public findNearbyStops(
    lat: number,
    lon: number,
    radiusMeters = 600,
    limit = 15
  ): NearbyStop[] {
    const results: NearbyStop[] = [];

    for (const stop of this.uniqueStops.values()) {
      const dist = haversineDistanceMeters(lat, lon, stop.lat, stop.lon);
      if (dist <= radiusMeters) {
        const linesServing = Array.from(stop.lines.values()).map((l) => {
          const nextDep = calculateNextDepartures(l.scheduleWd, l.scheduleWe, { limit: 1 })
            .estimates[0]?.display;
          return {
            line: l.line,
            type: l.type,
            direction: l.direction,
            nextDeparture: nextDep
          };
        });

        results.push({
          id: stop.id,
          name: stop.name,
          code: stop.code,
          latitude: stop.lat,
          longitude: stop.lon,
          distanceMeters: dist,
          lines: linesServing
        });
      }
    }

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results.slice(0, limit);
  }

  /**
   * Get departures and real-time countdown for a station on a specific line
   */
  public getStationSchedule(
    lineName: string,
    stationQuery: string,
    direction: 'tur' | 'retur' | 'all' = 'all',
    limit = 6,
    customHour?: number,
    customMinute?: number,
    customIsWeekend?: boolean
  ): StationSchedule[] {
    const lineKey = lineName.trim().toUpperCase();
    const entry = this.lineIndex.get(lineKey);
    if (!entry) return [];

    const qNorm = normalizeText(stationQuery);
    const results: StationSchedule[] = [];

    const checkDirection = (stations: any[] | undefined, dirName: string) => {
      if (!stations) return;
      for (const st of stations) {
        const nameNorm = normalizeText(st.name);
        const codeNorm = st.code ? normalizeText(st.code) : '';

        if (nameNorm.includes(qNorm) || codeNorm === qNorm) {
          const depData = calculateNextDepartures(st.schedule_wd, st.schedule_we, {
            customHour,
            customMinute,
            customIsWeekend,
            limit
          });

          const bucharestTime = getBucharestTime();
          results.push({
            line: entry.line || lineKey,
            stationName: st.name,
            stationCode: st.code && st.code !== 'None' ? st.code : undefined,
            direction: dirName,
            dayType: depData.dayType,
            currentTimeBucharest: bucharestTime.timeString,
            nextDepartures: depData.estimates,
            allTodayDepartures: depData.allTodayDepartures
          });
        }
      }
    };

    if (direction === 'tur' || direction === 'all') {
      checkDirection(entry.tur_stations, 'Tur');
    }
    if (direction === 'retur' || direction === 'all') {
      checkDirection(entry.retur_stations, 'Retur');
    }

    return results;
  }

  /**
   * Find direct lines connecting two stations
   */
  public findDirectRoute(
    originQuery: string,
    destinationQuery: string
  ): DirectRouteConnection[] {
    const origNorm = normalizeText(originQuery);
    const destNorm = normalizeText(destinationQuery);
    if (!origNorm || !destNorm) return [];

    const connections: DirectRouteConnection[] = [];

    for (const [lineKey, entry] of this.lineIndex.entries()) {
      const meta = this.routesMap.get(lineKey);
      const lineName = entry.line || lineKey;
      const type = meta?.type || 'bus';
      const typeName = meta?.typeName || this.getDefaultTypeName(type);
      const color = meta?.color || '#007AFF';

      // Check Tur direction
      if (entry.tur_stations) {
        const conn = this.checkSequence(
          entry.tur_stations,
          origNorm,
          destNorm,
          lineName,
          type,
          typeName,
          color,
          'Tur'
        );
        if (conn) connections.push(conn);
      }

      // Check Retur direction
      if (entry.retur_stations) {
        const conn = this.checkSequence(
          entry.retur_stations,
          origNorm,
          destNorm,
          lineName,
          type,
          typeName,
          color,
          'Retur'
        );
        if (conn) connections.push(conn);
      }
    }

    // Sort by fewest stops first
    connections.sort((a, b) => a.stopsCount - b.stopsCount);
    return connections;
  }

  private checkSequence(
    stations: any[],
    origNorm: string,
    destNorm: string,
    line: string,
    type: string,
    typeName: string,
    color: string,
    direction: 'Tur' | 'Retur'
  ): DirectRouteConnection | null {
    let origIndex = -1;
    let destIndex = -1;

    for (let i = 0; i < stations.length; i++) {
      const nameNorm = normalizeText(stations[i].name);
      const codeNorm = stations[i].code ? normalizeText(stations[i].code) : '';

      if (origIndex === -1 && (nameNorm.includes(origNorm) || codeNorm === origNorm)) {
        origIndex = i;
      }
      if (origIndex !== -1 && i > origIndex && (nameNorm.includes(destNorm) || codeNorm === destNorm)) {
        destIndex = i;
        break;
      }
    }

    if (origIndex !== -1 && destIndex !== -1 && destIndex > origIndex) {
      const intermediateStops = stations
        .slice(origIndex + 1, destIndex)
        .map((s) => s.name);

      const nextDep = calculateNextDepartures(
        stations[origIndex].schedule_wd,
        stations[origIndex].schedule_we,
        { limit: 1 }
      ).estimates[0]?.display;

      return {
        line,
        type,
        typeName,
        color,
        direction,
        fromStation: stations[origIndex].name,
        toStation: stations[destIndex].name,
        stopsCount: destIndex - origIndex,
        intermediateStops,
        nextDepartureFromOrigin: nextDep
      };
    }

    return null;
  }
}
