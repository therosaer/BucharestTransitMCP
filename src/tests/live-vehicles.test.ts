import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveVehicleService } from '../services/live-vehicles.js';

test('LiveVehicleService: loads fallback snapshot vehicles and returns enriched objects', async () => {
  const service = LiveVehicleService.getInstance();
  const res = await service.fetchVehicles({ limit: 20 });
  assert.ok(res.vehicles.length > 0, 'Should return vehicles from snapshot fallback or live');
  assert.ok(res.totalMatching > 0, 'Total matching should be positive');

  const first = res.vehicles[0];
  assert.ok(first.id, 'Vehicle should have an id');
  assert.ok(first.line, 'Vehicle should have a line');
  assert.ok(first.latitude >= 44.0 && first.latitude <= 44.9, 'Lat in Bucharest perimeter');
  assert.ok(first.longitude >= 25.5 && first.longitude <= 26.8, 'Lon in Bucharest perimeter');
  assert.ok(['bus', 'tram', 'trolley', 'regional', 'night', 'metro'].includes(first.vehicleType));
});

test('LiveVehicleService: filters by line', async () => {
  const service = LiveVehicleService.getInstance();
  // Fetch vehicles for line 41 or other common line
  const stats = await service.getStats();
  const popularLine = stats.passengerTelemetry.topBusiestLines[0]?.line || '41';
  const res = await service.fetchVehicles({ line: popularLine, limit: 10 });
  for (const v of res.vehicles) {
    assert.ok(
      v.line.toUpperCase().includes(popularLine.toUpperCase()) ||
        v.licensePlate.toUpperCase().includes(popularLine.toUpperCase()),
      `Vehicle line ${v.line} should match query ${popularLine}`
    );
  }
});

test('LiveVehicleService: computes fleet statistics accurately', async () => {
  const service = LiveVehicleService.getInstance();
  const stats = await service.getStats();
  assert.ok(stats.totalVehicles > 0, 'Total vehicles should be > 0');
  assert.ok(stats.activeLinesCount > 0, 'Active lines should be > 0');
  assert.ok(typeof stats.modeBreakdown === 'object', 'Should have mode breakdown');
  assert.ok(stats.modeBreakdown.tram !== undefined, 'Should count trams');
  assert.ok(stats.modeBreakdown.bus !== undefined, 'Should count buses');
});
