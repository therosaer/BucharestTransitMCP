import { type TransitStats, type Vehicle } from '../types.js';
export declare class LiveVehicleService {
    private static instance;
    private readonly moBiApiUrl;
    private readonly rateLimitCooldownSeconds;
    private cachedVehicles;
    private lastUpstreamCall;
    private lastUpdateTs;
    private status;
    private queryCount;
    private isLive;
    private isFetching;
    static getInstance(): LiveVehicleService;
    private constructor();
    /**
     * Load cold-boot snapshot vehicles so the service starts immediately with data
     */
    private loadSnapshotFallback;
    /**
     * Check if cooldown has elapsed and update live feed from mo-bi.ro if necessary
     */
    ensureFreshData(force?: boolean): Promise<boolean>;
    private processRawList;
    /**
     * Fetch vehicles matching filters
     */
    fetchVehicles(filters?: {
        line?: string;
        mode?: string;
        crowdedOnly?: boolean;
        limit?: number;
        forceRefresh?: boolean;
    }): Promise<{
        vehicles: Vehicle[];
        totalMatching: number;
        syncInfo: TransitStats['syncInfo'];
    }>;
    /**
     * Look up a specific vehicle by ID or license plate
     */
    getVehicleById(idOrPlate: string): Promise<Vehicle | null>;
    /**
     * Aggregate operational fleet telemetry
     */
    getStats(): Promise<TransitStats>;
    /**
     * Count active live vehicles for a given line
     */
    getLiveVehicleCountsForLine(line: string): {
        total: number;
        tur: number;
        retur: number;
    };
}
//# sourceMappingURL=live-vehicles.d.ts.map