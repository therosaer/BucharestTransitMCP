import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BiletTBService } from './services/bilet-service.js';
import { TransitDataManager } from './services/data-manager.js';
import { LiveVehicleService } from './services/live-vehicles.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'bucharest-transit-mcp',
    version: '1.0.0'
  });

  const dataManager = TransitDataManager.getInstance();
  const vehicleService = LiveVehicleService.getInstance();
  const biletService = BiletTBService.getInstance();

  // ===========================================================================
  // Tool 1: get_live_vehicles
  // ===========================================================================
  server.tool(
    'get_live_vehicles',
    'Get real-time live positions, route info, velocity, and passenger crowding levels of public transit vehicles in Bucharest & Ilfov (buses, trams, trolleybuses, regional, night, and metro) from official STB / mo-bi.ro telemetry.',
    {
      line: z.string().optional().describe('Filter by line number (e.g. "41", "335", "104", "1", "100", "M2")'),
      mode: z
        .enum(['all', 'bus', 'tram', 'trolley', 'regional', 'night', 'metro'])
        .optional()
        .describe('Filter by transit mode: all, bus, tram, trolley, regional, night, metro'),
      crowded_only: z.boolean().optional().describe('Filter only vehicles with moderate or high passenger occupancy'),
      limit: z.number().min(1).max(250).optional().describe('Maximum number of vehicles to return (default 50)'),
      force_refresh: z.boolean().optional().describe('Attempt to force refresh live feed if rate limit allows')
    },
    async ({ line, mode, crowded_only, limit, force_refresh }) => {
      try {
        const result = await vehicleService.fetchVehicles({
          line,
          mode,
          crowdedOnly: crowded_only,
          limit: limit ?? 50,
          forceRefresh: force_refresh
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: result.syncInfo.status,
                  dataSource: result.syncInfo.isLive ? 'mo-bi.ro live open data' : 'bundled snapshot fallback',
                  lastUpdate: result.syncInfo.lastUpdate,
                  rateLimitCooldownRemainingSeconds: result.syncInfo.cooldownRemaining,
                  matchingCount: result.totalMatching,
                  returnedCount: result.vehicles.length,
                  vehicles: result.vehicles
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to fetch live vehicles: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 2: get_vehicle_by_id
  // ===========================================================================
  server.tool(
    'get_vehicle_by_id',
    'Look up a specific Bucharest transit vehicle by its internal ID (e.g. "stb-14", "14") or license plate (e.g. "B02205", "B 24 STB"). Returns exact coordinates, line, heading, speed, and passenger telemetry.',
    {
      query: z.string().describe('Vehicle ID (e.g. "stb-4", "4") or license plate (e.g. "B02205")')
    },
    async ({ query }) => {
      try {
        const vehicle = await vehicleService.getVehicleById(query);
        if (!vehicle) {
          return {
            content: [
              {
                type: 'text',
                text: `No active vehicle found matching query "${query}". The vehicle might currently be in a depot, offline, or outside service hours.`
              }
            ]
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(vehicle, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error looking up vehicle: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 3: get_fleet_stats
  // ===========================================================================
  server.tool(
    'get_fleet_stats',
    'Get high-level live operational fleet telemetry for the entire Bucharest public transit network: total active vehicles, breakdown by mode (trams, trolleybuses, buses, regional, metro), active lines count, average fleet speed, total passengers on board, and busiest lines.',
    {},
    async () => {
      try {
        const stats = await vehicleService.getStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get fleet stats: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 4: list_lines
  // ===========================================================================
  server.tool(
    'list_lines',
    'Browse and search public transport lines in Bucharest and Ilfov, including urban buses, trams, trolleybuses, express lines, and regional routes. Returns line numbers, transport modes, operator, colors, and terminal stations.',
    {
      type: z
        .string()
        .optional()
        .describe('Filter by line type: bus, tram, trolley, regional, night, metro'),
      query: z
        .string()
        .optional()
        .describe('Search query for line name or terminal (e.g. "41", "Presei", "Ghencea", "Otopeni")')
    },
    async ({ type, query }) => {
      try {
        const lines = dataManager.listLines(type, query);
        // Enrich with live active vehicle count
        const enriched = lines.map((l) => {
          const counts = vehicleService.getLiveVehicleCountsForLine(l.line);
          return {
            ...l,
            activeVehicles: counts.total
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: enriched.length,
                  lines: enriched
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list transit lines: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 5: get_line_details
  // ===========================================================================
  server.tool(
    'get_line_details',
    'Get full details for a public transport line in Bucharest (e.g. "41", "335", "100"): returns terminals, complete list of stations in both directions (Tur/Dus and Retur/Întors), coordinates, and number of live vehicles currently operating on the line.',
    {
      line: z.string().describe('Line number or name (e.g. "41", "100", "335", "M2")')
    },
    async ({ line }) => {
      try {
        const details = dataManager.getLineDetails(line);
        if (!details) {
          return {
            content: [
              {
                type: 'text',
                text: `Line "${line}" was not found in Bucharest transit index. Use list_lines to browse available lines.`
              }
            ]
          };
        }

        const counts = vehicleService.getLiveVehicleCountsForLine(line);
        details.liveVehicles = counts;

        return {
          content: [{ type: 'text', text: JSON.stringify(details, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get line details: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 6: get_station_schedule
  // ===========================================================================
  server.tool(
    'get_station_schedule',
    'Get timetable departure schedules and real-time countdown for a transit station in Bucharest. Evaluates whether today is a weekday or weekend in Europe/Bucharest timezone and computes exact minutes until next departures.',
    {
      line: z.string().describe('Line number (e.g. "41", "335", "1")'),
      station: z.string().describe('Station name or station code (e.g. "Piata Presei", "Piata Romana", "3265")'),
      direction: z
        .enum(['all', 'tur', 'retur'])
        .optional()
        .describe('Direction to check: all (default), tur (outbound), retur (inbound)'),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum number of upcoming departures to return (default 5)')
    },
    async ({ line, station, direction, limit }) => {
      try {
        const schedules = dataManager.getStationSchedule(
          line,
          station,
          direction ?? 'all',
          limit ?? 5
        );

        if (schedules.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No timetable found for station "${station}" on line "${line}". Check line details or search station names.`
              }
            ]
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(schedules, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get station schedule: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 7: search_stations
  // ===========================================================================
  server.tool(
    'search_stations',
    'Search transit stations and stops across Bucharest by name or code. Returns matching stations, coordinates, and all transit lines that stop there.',
    {
      query: z.string().describe('Station name or part of name (e.g. "Romana", "Universitate", "Gara de Nord")'),
      limit: z.number().min(1).max(50).optional().describe('Maximum number of results to return (default 15)')
    },
    async ({ query, limit }) => {
      try {
        const stations = dataManager.searchStations(query, limit ?? 15);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  count: stations.length,
                  stations
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to search stations: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 8: find_nearby_stops
  // ===========================================================================
  server.tool(
    'find_nearby_stops',
    'Find public transit stops near given GPS coordinates in Bucharest or Ilfov within a search radius, including lines serving each stop and upcoming departures.',
    {
      latitude: z.number().describe('Latitude coordinate (e.g. 44.4447)'),
      longitude: z.number().describe('Longitude coordinate (e.g. 26.0975)'),
      radius_meters: z
        .number()
        .min(50)
        .max(2500)
        .optional()
        .describe('Search radius in meters (default 500, max 2500)'),
      limit: z.number().min(1).max(50).optional().describe('Maximum number of stops to return (default 10)')
    },
    async ({ latitude, longitude, radius_meters, limit }) => {
      try {
        const stops = dataManager.findNearbyStops(
          latitude,
          longitude,
          radius_meters ?? 500,
          limit ?? 10
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  searchCenter: { latitude, longitude },
                  radiusMeters: radius_meters ?? 500,
                  stopsCount: stops.length,
                  stops
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to find nearby stops: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 9: plan_direct_route
  // ===========================================================================
  server.tool(
    'plan_direct_route',
    'Find direct transit lines connecting an origin station to a destination station in Bucharest without transfers. Returns line number, mode, direction, number of stops, intermediate stations, and next departure.',
    {
      origin: z.string().describe('Origin station name (e.g. "Piata Romana")'),
      destination: z.string().describe('Destination station name (e.g. "Piata Presei")')
    },
    async ({ origin, destination }) => {
      try {
        const connections = dataManager.findDirectRoute(origin, destination);
        if (connections.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No direct lines found connecting "${origin}" to "${destination}". A transfer between lines may be needed.`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  origin,
                  destination,
                  directOptionsCount: connections.length,
                  routes: connections
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to plan route: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 10: bilet_tb_catalog
  // ===========================================================================
  server.tool(
    'bilet_tb_catalog',
    'List official Bucharest metropolitan public transport tickets, passes, airport train connections, and student subscriptions from STB / Bilet TB with prices in RON, validity duration, and conditions.',
    {},
    async () => {
      try {
        const catalog = biletService.getCatalog();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  system: 'Bilet TB / STB SA Sistem Integrat de Tarifare',
                  coverage: 'Regiunea București - Ilfov',
                  tickets: catalog
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get ticketing catalog: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Tool 11: bilet_tb_status
  // ===========================================================================
  server.tool(
    'bilet_tb_status',
    'Check Bilet TB / STB ticketing account and active passes/tickets (such as student/pupil free passes, 90-minute tickets, 24h/30-day passes) and their QR codes. Can use environment variable STB_BILET_TOKEN or provided credentials.',
    {
      token: z.string().optional().describe('Bilet TB session bearer token'),
      username: z.string().optional().describe('STB account email/username to login'),
      password: z.string().optional().describe('STB account password')
    },
    async ({ token, username, password }) => {
      try {
        let activeToken = biletService.resolveToken(token);

        if (!activeToken && username && password) {
          activeToken = await biletService.authenticate(username, password);
        }

        if (!activeToken) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    authenticated: false,
                    message:
                      'No active Bilet TB session found. Provide "token" or "username" + "password", or set STB_BILET_TOKEN environment variable. You can use bilet_tb_catalog to see official ticket prices.',
                    catalogSnippet: biletService.getCatalog().slice(0, 4)
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        const [account, tickets] = await Promise.all([
          biletService.getAccount(activeToken).catch(() => null),
          biletService.getActiveTickets(activeToken).catch(() => [])
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  authenticated: true,
                  account,
                  activeTicketsCount: tickets.length,
                  tickets
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Bilet TB status check error: ${err.message}` }]
        };
      }
    }
  );

  // ===========================================================================
  // Resources
  // ===========================================================================
  server.resource(
    'fleet_stats',
    'bucharest://transit/stats',
    { description: 'Live fleet telemetry statistics of Bucharest public transit' },
    async (uri) => {
      const stats = await vehicleService.getStats();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }
  );

  server.resource(
    'lines_directory',
    'bucharest://transit/lines',
    { description: 'Directory of all public transit lines in Bucharest and Ilfov' },
    async (uri) => {
      const lines = dataManager.listLines();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(lines, null, 2)
          }
        ]
      };
    }
  );

  server.resource(
    'ticket_catalog',
    'bucharest://transit/catalog',
    { description: 'Official STB / Bilet TB public transit ticket and pass catalog' },
    async (uri) => {
      const catalog = biletService.getCatalog();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(catalog, null, 2)
          }
        ]
      };
    }
  );

  // ===========================================================================
  // Prompts
  // ===========================================================================
  server.prompt(
    'next_departure',
    'Ask for the upcoming bus, tram, or trolley departures at a station in Bucharest',
    {
      line: z.string().describe('Transit line number (e.g. "41", "335", "104")'),
      station: z.string().describe('Station name (e.g. "Piata Presei", "Piata Romana")')
    },
    ({ line, station }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `When are the next departures for line ${line} at station ${station} in Bucharest? Please check the current timetable and upcoming arrival times.`
          }
        }
      ]
    })
  );

  server.prompt(
    'route_advice',
    'Ask how to travel by public transit between two points in Bucharest',
    {
      origin: z.string().describe('Starting location or station'),
      destination: z.string().describe('Destination location or station')
    },
    ({ origin, destination }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `What is the best way to get from ${origin} to ${destination} using Bucharest public transport (buses, trams, trolleybuses, metro)?`
          }
        }
      ]
    })
  );

  return server;
}
