export type VehicleType = 'bus' | 'tram' | 'trolley' | 'regional' | 'night' | 'metro';

export type CrowdednessLevel = 'empty' | 'low' | 'moderate' | 'high' | 'crowded' | 'unknown';

export interface VehiclePassengerInfo {
  onBoard: number | null;
  in: number | null;
  out: number | null;
  timestamp?: string;
  crowding: CrowdednessLevel;
  crowdingLabel: string;
  occupancyPct: number | null;
}

export interface Vehicle {
  id: string;
  vehicleId: string;
  licensePlate: string;
  line: string;
  routeId: string | null;
  directionId: number | null;
  direction: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  bearing: number | null;
  crowdedness: CrowdednessLevel;
  crowdednessLabel: string;
  occupancyPct: number | null;
  passengers: VehiclePassengerInfo;
  gpsTimestamp: string | null;
  gpsAgeMinutes: number | null;
  isStaleGps: boolean;
  vehicleType: VehicleType;
  color: string;
  dataSource: 'live' | 'snapshot';
}

export interface TransitStats {
  totalVehicles: number;
  activeLinesCount: number;
  modeBreakdown: Record<string, number>;
  avgSpeed: number | null;
  passengerTelemetry: {
    monitoredVehicles: number;
    totalOnBoard: number;
    totalInFlow: number;
    totalOutFlow: number;
    avgOccupancy: number;
    topBusiestLines: Array<{
      line: string;
      mode: string;
      totalPassengers: number;
      avgPerVehicle: number;
      activeVehicles: number;
    }>;
  };
  syncInfo: {
    lastUpdate: string;
    status: string;
    cooldownRemaining: number;
    isLive: boolean;
    queryCount: number;
  };
}

export interface RouteMetadata {
  route_id: string;
  line: string;
  type: string;
  typeName?: string;
  color?: string;
  operator?: string;
  terminals?: string[];
  max_fleet?: number;
  headway_min?: number;
}

export interface RawStation {
  name: string;
  code?: string;
  terminal?: string;
  lat: number;
  lon: number;
  schedule_wd?: string;
  schedule_we?: string;
}

export interface RawGeometry {
  type?: string;
  coordinates?: [number, number][];
}

export interface RawLineRouteEntry {
  line?: string;
  tur_geometry?: RawGeometry;
  retur_geometry?: RawGeometry;
  tur_terminal?: string;
  retur_terminal?: string;
  tur_stations?: RawStation[];
  retur_stations?: RawStation[];
}

export interface Station {
  id: string;
  name: string;
  code?: string;
  terminal?: string;
  lat: number;
  lon: number;
  scheduleWd?: string;
  scheduleWe?: string;
}

export interface DepartureEstimate {
  time: string;
  minutesUntil: number;
  display: string;
}

export interface StationSchedule {
  line: string;
  stationName: string;
  stationCode?: string;
  direction: string;
  dayType: 'weekday' | 'weekend';
  currentTimeBucharest: string;
  nextDepartures: DepartureEstimate[];
  allTodayDepartures: string[];
}

export interface NearbyStop {
  id: string;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  lines: Array<{
    line: string;
    type: string;
    direction: string;
    nextDeparture?: string;
  }>;
}

export interface LineSummary {
  line: string;
  type: string;
  typeName: string;
  color: string;
  operator: string;
  terminals: string[];
  activeVehicles: number;
}

export interface LineDetails {
  line: string;
  type: string;
  typeName: string;
  color: string;
  operator: string;
  turTerminal: string | null;
  returTerminal: string | null;
  turStations: Station[];
  returStations: Station[];
  turGeometry?: [number, number][];
  returGeometry?: [number, number][];
  liveVehicles: {
    total: number;
    tur: number;
    retur: number;
  };
}

export interface DirectRouteConnection {
  line: string;
  type: string;
  typeName: string;
  color: string;
  direction: 'Tur' | 'Retur';
  fromStation: string;
  toStation: string;
  stopsCount: number;
  intermediateStops: string[];
  nextDepartureFromOrigin?: string;
}

export interface BiletCatalogItem {
  id: number;
  name: string;
  group: string;
  fareRon: number;
  validMinutes: number;
  description: string;
}

export interface BiletTicket {
  id: string;
  title: string;
  type: string;
  seriesCode?: string;
  validFromDate?: string;
  validToDate?: string;
  remainingSeconds?: number;
  isStudentOrPupil: boolean;
  status: string;
  qrPayload?: string;
}

export interface BiletAccountInfo {
  id?: number | string;
  login?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  category?: string;
  isStudent?: boolean;
}
