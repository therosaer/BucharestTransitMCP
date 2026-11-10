import test from 'node:test';
import assert from 'node:assert/strict';
import { TransitDataManager } from '../services/data-manager.js';

test('TransitDataManager: initializes and loads lines and stops', () => {
  const manager = TransitDataManager.getInstance();
  const lines = manager.listLines();
  assert.ok(lines.length > 50, `Expected over 50 lines, got ${lines.length}`);

  // Check line 41 exists
  const line41 = lines.find((l) => l.line === '41');
  assert.ok(line41, 'Line 41 should exist');
  assert.equal(line41?.type, 'tram');
  assert.equal(line41?.typeName, 'Tramvai');
});

test('TransitDataManager: getLineDetails returns full line info with stations', () => {
  const manager = TransitDataManager.getInstance();
  const details = manager.getLineDetails('41');
  assert.ok(details, 'Details for line 41 should not be null');
  assert.equal(details?.line, '41');
  assert.equal(details?.typeName, 'Tramvai');
  assert.ok(details?.turStations.length > 5, 'Should have multiple Tur stations');
  assert.ok(details?.returStations.length > 5, 'Should have multiple Retur stations');
  assert.ok(details?.turTerminal, 'Should have Tur terminal');
});

test('TransitDataManager: searchStations finds stations by name', () => {
  const manager = TransitDataManager.getInstance();
  const results = manager.searchStations('Romana', 10);
  assert.ok(results.length > 0, 'Should find stations matching Romana');
  const found = results.some((s) => s.name.toLowerCase().includes('romana'));
  assert.ok(found, 'Should find Piata Romana');
  assert.ok(results[0].lines.length > 0, 'Station should list serving lines');
});

test('TransitDataManager: findNearbyStops finds stations near coordinates', () => {
  const manager = TransitDataManager.getInstance();
  // Near Piața Universității: 44.4355, 26.1025
  const stops = manager.findNearbyStops(44.4355, 26.1025, 600, 10);
  assert.ok(stops.length > 0, 'Should find stops near Universitate');
  assert.ok(stops[0].distanceMeters <= 600, 'Distance should be within radius');
  assert.ok(stops[0].lines.length > 0, 'Should have lines listed');
});

test('TransitDataManager: getStationSchedule returns timetable', () => {
  const manager = TransitDataManager.getInstance();
  const schedules = manager.getStationSchedule('41', 'Presei', 'tur', 4);
  assert.ok(schedules.length > 0, 'Should find schedule for Piata Presei on line 41');
  assert.equal(schedules[0].line, '41');
  assert.ok(schedules[0].allTodayDepartures.length > 10, 'Should have full daily schedule');
});

test('TransitDataManager: findDirectRoute finds direct connection between stations', () => {
  const manager = TransitDataManager.getInstance();
  // Line 41 connects Ghencea and Piata Presei
  const routes = manager.findDirectRoute('Ghencea', 'Presei');
  assert.ok(routes.length > 0, 'Should find direct line 41 from Ghencea to Piata Presei');
  const line41Route = routes.find((r) => r.line === '41');
  assert.ok(line41Route, 'Direct route 41 should be in the list');
  assert.ok(line41Route?.stopsCount > 5, 'Should have intermediate stops');
});

test('TransitDataManager: GTFS agencies are loaded', () => {
  const manager = TransitDataManager.getInstance();
  const agencies = manager.getAgencies();
  assert.ok(agencies.length >= 5, `Expected at least 5 agencies, got ${agencies.length}`);
  const stb = agencies.find((a) => a.id === 'STB' || a.name.includes('STB'));
  assert.ok(stb, 'STB agency should exist');
  const metrorex = agencies.find((a) => a.id === 'METROREX' || a.name.includes('METROREX'));
  assert.ok(metrorex, 'Metrorex agency should exist');
});

test('TransitDataManager: GTFS stop enrichment and transfers', () => {
  const manager = TransitDataManager.getInstance();
  // Check enriched stop data
  const stations = manager.searchStations('Presei', 5);
  assert.ok(stations.length > 0);
  assert.ok(stations[0].description, 'Stop should have street address description from GTFS');

  // Check transfers
  const transfers = manager.getTransfers('Gara de Nord');
  assert.ok(transfers.length > 0, 'Should find transfers at Gara de Nord');
  assert.ok(transfers[0].fromStopId, 'Transfer should have fromStopId');
  assert.ok(transfers[0].toStopId, 'Transfer should have toStopId');
});

