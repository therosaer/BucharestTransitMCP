import fs from 'node:fs';
import {
  type CrowdednessLevel,
  type TransitStats,
  type Vehicle,
  type VehiclePassengerInfo,
  type VehicleType
} from '../types.js';
import { resolveDataPath } from '../utils.js';
import { TransitDataManager } from './data-manager.js';

export class LiveVehicleService {
  private static instance: LiveVehicleService;

  private readonly moBiApiUrl = 'https://mo-bi.ro/python_api/';
  private readonly rateLimitCooldownSeconds = 10.5;

  private cachedVehicles: Vehicle[] = [];
  private lastUpstreamCall = 0;
  private lastUpdateTs = 0;
  private status = 'Inițializare...';
  private queryCount = 0;
  private isLive = false;
  private isFetching = false;

  public static getInstance(): LiveVehicleService {
    if (!LiveVehicleService.instance) {
      LiveVehicleService.instance = new LiveVehicleService();
    }
    return LiveVehicleService.instance;
  }

  private constructor() {
    this.loadSnapshotFallback();
  }

  /**
   * Load cold-boot snapshot vehicles so the service starts immediately with data
   */
  private loadSnapshotFallback(): void {
    try {
      const snapshotPath = resolveDataPath('snapshot_vehicles.json');
      const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as any[];
      const processed = this.processRawList(raw, 'snapshot');
      this.cachedVehicles = processed;
      this.lastUpdateTs = Date.now();
      this.status = `Încărcat snapshot offline (${processed.length} vehicule)`;
      this.isLive = false;
    } catch (err) {
      console.warn('Could not load fallback snapshot_vehicles.json:', err);
    }
  }

  /**
   * Check if cooldown has elapsed and update live feed from mo-bi.ro if necessary
   */
  public async ensureFreshData(force = false): Promise<boolean> {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastUpstreamCall) / 1000;

    if (!force && this.cachedVehicles.length > 0 && elapsedSeconds < this.rateLimitCooldownSeconds) {
      return false; // Served from fresh cache within rate-limit window
    }

    if (this.isFetching) {
      return false;
    }

    this.isFetching = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9500);

      this.lastUpstreamCall = Date.now();
      const res = await fetch(this.moBiApiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'BucharestTransitInteractiveApp/1.0 (Mozilla/5.0)',
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        this.status = `Eroare upstream HTTP ${res.status} (folosim date din cache)`;
        return false;
      }

      const raw = (await res.json()) as any[];
      if (Array.isArray(raw) && raw.length > 0) {
        const processed = this.processRawList(raw, 'live');
        if (processed.length > 0) {
          this.cachedVehicles = processed;
          this.lastUpdateTs = Date.now();
          this.queryCount++;
          this.isLive = true;
          this.status = `Date live actualizate la ${new Date().toLocaleTimeString('ro-RO')}`;
          return true;
        }
      }
      return false;
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Timeout la interogarea mo-bi.ro' : err.message;
      this.status = `Avertisment: ${msg} (folosim date din cache)`;
      return false;
    } finally {
      this.isFetching = false;
    }
  }

  private processRawList(rawList: any[], source: 'live' | 'snapshot'): Vehicle[] {
    const dataManager = TransitDataManager.getInstance();
    const processed: Vehicle[] = [];

    for (const item of rawList) {
      const vInfo = item.vehicle || {};
      const trip = vInfo.trip || {};
      const vehIdent = vInfo.vehicle || {};
      const pos = vInfo.position || {};
      const psg = vInfo.passenger_info || {};

      const lat = typeof pos.latitude === 'number' ? pos.latitude : parseFloat(pos.latitude);
      const lon = typeof pos.longitude === 'number' ? pos.longitude : parseFloat(pos.longitude);

      // Filter coordinates strictly within Bucharest / Ilfov transit perimeter
      if (isNaN(lat) || isNaN(lon) || lat < 44.0 || lat > 44.9 || lon < 25.5 || lon > 26.8) {
        continue;
      }

      const rawVehId = vehIdent.id ?? item.id;
      if (rawVehId === undefined || rawVehId === null || String(rawVehId) === 'None') {
        continue;
      }
      const vehicleId = String(rawVehId);

      const rawPlate = vehIdent.license_plate;
      const licensePlate =
        rawPlate && rawPlate !== 'None' && rawPlate.trim() !== ''
          ? String(rawPlate).trim()
          : 'N/A';

      const routeId = trip.route_id !== undefined && trip.route_id !== null && String(trip.route_id) !== 'None'
        ? String(trip.route_id)
        : null;

      const routeShortName = trip.route_short_name || trip.route_name;

      // Match metadata
      const meta = (routeId ? dataManager.getRouteMetadata(routeId) : undefined) ||
        (routeShortName ? dataManager.getRouteMetadata(String(routeShortName)) : undefined);

      let lineName: string;
      let vType: VehicleType = 'bus';
      let color = '#007AFF';

      if (meta) {
        lineName = meta.line;
        color = meta.color || '#007AFF';
        switch ((meta.type || '').toLowerCase()) {
          case 'tram':
            vType = 'tram';
            break;
          case 'trolley':
          case 'trolleybus':
            vType = 'trolley';
            break;
          case 'regional_bus':
          case 'regional':
            vType = 'regional';
            break;
          case 'night_bus':
          case 'night':
            vType = 'night';
            break;
          case 'metro':
            vType = 'metro';
            break;
          default:
            vType = 'bus';
            break;
        }
      } else if (routeShortName && String(routeShortName) !== 'None') {
        lineName = String(routeShortName);
      } else if (routeId) {
        lineName = `R${routeId}`;
      } else {
        lineName = 'STB';
      }

      const directionId = typeof trip.direction_id === 'number' ? trip.direction_id : null;
      let direction = 'Necunoscut';
      if (directionId === 0) direction = 'Tur (Dus)';
      else if (directionId === 1) direction = 'Retur (Întors)';

      // Passenger occupancy
      const onBoard = typeof psg.on_board === 'number' ? psg.on_board : null;
      const inPsg = typeof psg.in === 'number' ? psg.in : null;
      const outPsg = typeof psg.out === 'number' ? psg.out : null;

      let crowding: CrowdednessLevel = 'unknown';
      let crowdingLabel = 'Fără date senzori';
      let occupancyPct: number | null = null;

      if (onBoard !== null) {
        if (onBoard === 0) {
          crowding = 'empty';
          crowdingLabel = 'Gol (0 călători)';
          occupancyPct = 0;
        } else if (onBoard <= 15) {
          crowding = 'low';
          crowdingLabel = `Liber (${onBoard} călători)`;
          occupancyPct = Math.min(100, Math.round((onBoard / 80) * 100));
        } else if (onBoard <= 40) {
          crowding = 'moderate';
          crowdingLabel = `Moderat (${onBoard} călători)`;
          occupancyPct = Math.min(100, Math.round((onBoard / 80) * 100));
        } else if (onBoard <= 70) {
          crowding = 'high';
          crowdingLabel = `Aglomerat (${onBoard} călători)`;
          occupancyPct = Math.min(100, Math.round((onBoard / 80) * 100));
        } else {
          crowding = 'crowded';
          crowdingLabel = `Foarte aglomerat (${onBoard} călători)`;
          occupancyPct = 100;
        }
      }

      const passengers: VehiclePassengerInfo = {
        onBoard,
        in: inPsg,
        out: outPsg,
        timestamp: psg.timestamp,
        crowding,
        crowdingLabel,
        occupancyPct
      };

      const posTimestamp = pos.timestamp || item.timestamp || null;
      let gpsAgeMinutes: number | null = null;
      let isStale = source === 'snapshot';

      if (posTimestamp) {
        const updateDate = new Date(posTimestamp);
        if (!isNaN(updateDate.getTime())) {
          gpsAgeMinutes = Math.max(0, Math.floor((Date.now() - updateDate.getTime()) / 60000));
          if (source === 'live') {
            isStale = gpsAgeMinutes > 2;
          }
        }
      }

      const speed = typeof pos.speed === 'number' ? Math.round(pos.speed * 10) / 10 : null;
      const bearing = typeof pos.bearing === 'number' ? Math.round(pos.bearing) : null;

      processed.push({
        id: `stb-${vehicleId}`,
        vehicleId,
        licensePlate,
        line: lineName,
        routeId,
        directionId,
        direction,
        latitude: lat,
        longitude: lon,
        speed,
        bearing,
        crowdedness: crowding,
        crowdednessLabel: crowdingLabel,
        occupancyPct,
        passengers,
        gpsTimestamp: posTimestamp,
        gpsAgeMinutes,
        isStaleGps: isStale,
        vehicleType: vType,
        color,
        dataSource: source
      });
    }

    return processed;
  }

  /**
   * Fetch vehicles matching filters
   */
  public async fetchVehicles(filters?: {
    line?: string;
    mode?: string;
    crowdedOnly?: boolean;
    limit?: number;
    forceRefresh?: boolean;
  }): Promise<{
    vehicles: Vehicle[];
    totalMatching: number;
    syncInfo: TransitStats['syncInfo'];
  }> {
    await this.ensureFreshData(filters?.forceRefresh);

    let list = this.cachedVehicles;

    if (filters?.mode && filters.mode !== 'all') {
      const targetMode = filters.mode.toLowerCase().trim();
      list = list.filter((v) => {
        if (targetMode === 'bus') return v.vehicleType === 'bus' || v.vehicleType === 'regional';
        return v.vehicleType === targetMode;
      });
    }

    if (filters?.line) {
      const q = filters.line.trim().toUpperCase();
      list = list.filter(
        (v) =>
          v.line.toUpperCase() === q ||
          v.line.toUpperCase().includes(q) ||
          v.licensePlate.toUpperCase().includes(q)
      );
    }

    if (filters?.crowdedOnly) {
      list = list.filter(
        (v) => v.crowdedness === 'high' || v.crowdedness === 'crowded' || v.crowdedness === 'moderate'
      );
    }

    const totalMatching = list.length;
    const limit = filters?.limit ?? 50;
    const paged = list.slice(0, limit);

    const cooldownRemaining = Math.max(
      0,
      Math.ceil(this.rateLimitCooldownSeconds - (Date.now() - this.lastUpstreamCall) / 1000)
    );

    return {
      vehicles: paged,
      totalMatching,
      syncInfo: {
        lastUpdate: new Date(this.lastUpdateTs).toISOString(),
        status: this.status,
        cooldownRemaining,
        isLive: this.isLive,
        queryCount: this.queryCount
      }
    };
  }

  /**
   * Look up a specific vehicle by ID or license plate
   */
  public async getVehicleById(idOrPlate: string): Promise<Vehicle | null> {
    await this.ensureFreshData();

    const q = idOrPlate.trim().toUpperCase();
    for (const v of this.cachedVehicles) {
      if (
        v.id.toUpperCase() === q ||
        v.vehicleId.toUpperCase() === q ||
        v.licensePlate.toUpperCase() === q ||
        v.licensePlate.toUpperCase().replace(/\s+/g, '') === q.replace(/\s+/g, '')
      ) {
        return v;
      }
    }
    return null;
  }

  /**
   * Aggregate operational fleet telemetry
   */
  public async getStats(): Promise<TransitStats> {
    await this.ensureFreshData();

    const modeCounts: Record<string, number> = {
      bus: 0,
      tram: 0,
      trolley: 0,
      regional: 0,
      night: 0,
      metro: 0
    };

    let totalOnBoard = 0;
    let vehiclesWithPsg = 0;
    let totalIn = 0;
    let totalOut = 0;
    let speedSum = 0;
    let speedCount = 0;

    const routesActive = new Set<string>();
    const lineOccupancy: Record<string, { totalPsg: number; count: number; mode: string }> = {};

    for (const v of this.cachedVehicles) {
      modeCounts[v.vehicleType] = (modeCounts[v.vehicleType] || 0) + 1;
      routesActive.add(v.line);

      if (v.speed !== null && v.speed > 0) {
        speedSum += v.speed;
        speedCount++;
      }

      if (v.passengers.onBoard !== null) {
        vehiclesWithPsg++;
        totalOnBoard += v.passengers.onBoard;

        if (!lineOccupancy[v.line]) {
          lineOccupancy[v.line] = { totalPsg: 0, count: 0, mode: v.vehicleType };
        }
        lineOccupancy[v.line].totalPsg += v.passengers.onBoard;
        lineOccupancy[v.line].count++;
      }

      if (v.passengers.in !== null) totalIn += v.passengers.in;
      if (v.passengers.out !== null) totalOut += v.passengers.out;
    }

    const topLines = Object.entries(lineOccupancy)
      .filter(([_, item]) => item.count > 0)
      .map(([line, item]) => ({
        line,
        mode: item.mode,
        totalPassengers: item.totalPsg,
        avgPerVehicle: Math.round((item.totalPsg / item.count) * 10) / 10,
        activeVehicles: item.count
      }))
      .sort((a, b) => b.totalPassengers - a.totalPassengers)
      .slice(0, 8);

    const cooldownRemaining = Math.max(
      0,
      Math.ceil(this.rateLimitCooldownSeconds - (Date.now() - this.lastUpstreamCall) / 1000)
    );

    return {
      totalVehicles: this.cachedVehicles.length,
      activeLinesCount: routesActive.size,
      modeBreakdown: modeCounts,
      avgSpeed: speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : null,
      passengerTelemetry: {
        monitoredVehicles: vehiclesWithPsg,
        totalOnBoard,
        totalInFlow: totalIn,
        totalOutFlow: totalOut,
        avgOccupancy: vehiclesWithPsg > 0 ? Math.round((totalOnBoard / vehiclesWithPsg) * 10) / 10 : 0,
        topBusiestLines: topLines
      },
      syncInfo: {
        lastUpdate: new Date(this.lastUpdateTs).toISOString(),
        status: this.status,
        cooldownRemaining,
        isLive: this.isLive,
        queryCount: this.queryCount
      }
    };
  }

  /**
   * Count active live vehicles for a given line
   */
  public getLiveVehicleCountsForLine(line: string): { total: number; tur: number; retur: number } {
    const q = line.trim().toUpperCase();
    let tur = 0;
    let retur = 0;
    let total = 0;

    for (const v of this.cachedVehicles) {
      if (v.line.toUpperCase() === q) {
        total++;
        if (v.directionId === 0) tur++;
        else if (v.directionId === 1) retur++;
      }
    }

    return { total, tur, retur };
  }
}
