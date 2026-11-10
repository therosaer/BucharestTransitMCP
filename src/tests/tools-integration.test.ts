import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

test('MCP Server: tools, resources, and prompts integration', async () => {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  // 1. List tools
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name);
  assert.ok(toolNames.includes('get_live_vehicles'));
  assert.ok(toolNames.includes('get_vehicle_by_id'));
  assert.ok(toolNames.includes('get_fleet_stats'));
  assert.ok(toolNames.includes('list_lines'));
  assert.ok(toolNames.includes('get_line_details'));
  assert.ok(toolNames.includes('get_station_schedule'));
  assert.ok(toolNames.includes('search_stations'));
  assert.ok(toolNames.includes('find_nearby_stops'));
  assert.ok(toolNames.includes('plan_direct_route'));
  assert.ok(toolNames.includes('bilet_tb_catalog'));
  assert.ok(toolNames.includes('bilet_tb_status'));

  // 2. Call list_lines
  const linesRes = (await client.callTool({
    name: 'list_lines',
    arguments: { type: 'tram', query: '41' }
  })) as any;
  assert.equal(linesRes.isError, undefined);
  const linesData = JSON.parse(linesRes.content[0].text);
  assert.ok(linesData.count >= 1);
  assert.equal(linesData.lines[0].line, '41');

  // 3. Call get_line_details
  const lineDetailsRes = (await client.callTool({
    name: 'get_line_details',
    arguments: { line: '41' }
  })) as any;
  const lineDetails = JSON.parse(lineDetailsRes.content[0].text);
  assert.equal(lineDetails.line, '41');
  assert.ok(lineDetails.turStations.length > 5);

  // 4. Call search_stations
  const stationsRes = (await client.callTool({
    name: 'search_stations',
    arguments: { query: 'Universitate', limit: 5 }
  })) as any;
  const stationsData = JSON.parse(stationsRes.content[0].text);
  assert.ok(stationsData.stations.length > 0);

  // 5. Call find_nearby_stops
  const nearbyRes = (await client.callTool({
    name: 'find_nearby_stops',
    arguments: { latitude: 44.4355, longitude: 26.1025, radius_meters: 500 }
  })) as any;
  const nearbyData = JSON.parse(nearbyRes.content[0].text);
  assert.ok(nearbyData.stopsCount > 0);

  // 6. Call get_station_schedule
  const schedRes = (await client.callTool({
    name: 'get_station_schedule',
    arguments: { line: '41', station: 'Presei', direction: 'tur', limit: 3 }
  })) as any;
  const schedData = JSON.parse(schedRes.content[0].text);
  assert.ok(schedData.length > 0);
  assert.equal(schedData[0].line, '41');

  // 7. Call plan_direct_route
  const routeRes = (await client.callTool({
    name: 'plan_direct_route',
    arguments: { origin: 'Ghencea', destination: 'Presei' }
  })) as any;
  const routeData = JSON.parse(routeRes.content[0].text);
  assert.ok(routeData.directOptionsCount > 0);

  // 8. Call get_fleet_stats
  const statsRes = (await client.callTool({
    name: 'get_fleet_stats',
    arguments: {}
  })) as any;
  const statsData = JSON.parse(statsRes.content[0].text);
  assert.ok(statsData.totalVehicles > 0);

  // 9. Call bilet_tb_catalog
  const catalogRes = (await client.callTool({
    name: 'bilet_tb_catalog',
    arguments: {}
  })) as any;
  const catalogData = JSON.parse(catalogRes.content[0].text);
  assert.ok(catalogData.tickets.length >= 6);

  // 10. Call bilet_tb_status without token
  const biletRes = (await client.callTool({
    name: 'bilet_tb_status',
    arguments: {}
  })) as any;
  const biletData = JSON.parse(biletRes.content[0].text);
  assert.equal(biletData.authenticated, false);

  // 11. Test resources
  const resources = await client.listResources();
  const uris = resources.resources.map((r) => r.uri);
  assert.ok(uris.includes('bucharest://transit/stats'));
  assert.ok(uris.includes('bucharest://transit/lines'));
  assert.ok(uris.includes('bucharest://transit/catalog'));

  const readCatalog = await client.readResource({ uri: 'bucharest://transit/catalog' });
  assert.ok(readCatalog.contents.length > 0);

  // 12. Test prompts
  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map((p) => p.name);
  assert.ok(promptNames.includes('next_departure'));
  assert.ok(promptNames.includes('route_advice'));

  await client.close();
  await server.close();
});
