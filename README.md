# Bucharest Transit MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.6.0-purple.svg)](https://modelcontextprotocol.io/)

A Model Context Protocol (MCP) server providing real-time telemetry, timetables, routes, stop search, and ticketing services for the public transit network of Bucharest and Ilfov, Romania (STB SA, TPBI, Metrorex, and Bilet TB).

Derived from the architecture and reverse-engineered telemetry feeds of the native iOS app [BucharestTransit](https://github.com/therosaer/BucharestTransit).

---

## Features

- **Live Fleet Telemetry (`mo-bi.ro`)**: Real-time positions, speed, bearing, route ID, license plates, and direction for thousands of buses, trams, trolleybuses, regional lines, and night buses.
- **Passenger Crowding Sensor Telemetry (APC)**: Real-time passenger count (`on_board`, `in`, `out`) and crowding categorization (`empty`, `low`, `moderate`, `high`, `crowded`).
- **Complete GTFS Timetables**: All 380+ lines with schedules for weekdays (`schedule_wd`) and weekends (`schedule_we`), dynamically resolved for Bucharest local time (`Europe/Bucharest`).
- **Real-Time Arrival Countdown**: Minute-by-minute countdowns ("Pleacă acum", "în 4 min (la 14:25)").
- **Spatial Stop Search & Geocoding**: Find stops and stations within a radius of any GPS coordinate or search stations by name with automatic Romanian diacritic normalization.
- **Direct Route Planning**: Find transit lines directly connecting any two stations in Bucharest.
- **Bilet TB & STB Backoffice Ticketing**: Official ticketing catalog, metropolitan passes, airport train connections, student/pupil free passes, and active ticket QR payloads.
- **Smart Rate-Limit & Offline Fallback**: Enforces a 10.5-second cooldown to respect upstream rate limits, seamlessly falling back to cached or bundled snapshot data.

---

## MCP Tools

| Tool | Description |
| :--- | :--- |
| `get_live_vehicles` | Query live positions, line, speed, bearing, and crowding of public transit vehicles. Supports filtering by `line`, `mode` (`bus`, `tram`, `trolley`, `regional`, `night`, `metro`), `crowded_only`, and `limit`. |
| `get_vehicle_by_id` | Look up a specific vehicle by internal ID (e.g. `stb-14`, `14`) or license plate (e.g. `B02205`). |
| `get_fleet_stats` | Overview of network operations: total active vehicles, breakdown by mode, average speed, active lines, passenger flows, and busiest lines. |
| `list_lines` | Browse and search lines across Bucharest & Ilfov (filterable by type or search query), showing terminals, color, operator, and live vehicle count. |
| `get_line_details` | Full details for a transit line (terminals, complete stop lists in Tur and Retur directions, coordinates, and live vehicle count). |
| `get_station_schedule` | Timetable departures and live arrival countdowns for a station on a given line. |
| `search_stations` | Search stations and stops by name or code with diacritic-tolerant matching, returning all serving lines. |
| `find_nearby_stops` | Locate public transport stops near GPS coordinates (`latitude`, `longitude`, `radius_meters`). |
| `plan_direct_route` | Find direct transit lines connecting an origin and destination station without transfers. |
| `bilet_tb_catalog` | Official STB / Bilet TB fares and passes (90-min metropolitan, 24h, 72h, 30 days, airport train, student passes). |
| `bilet_tb_status` | Check Bilet TB / STB ticketing account and active passes with QR codes. |

---

## MCP Resources & Prompts

### Resources
- `bucharest://transit/stats` — Real-time operational fleet statistics.
- `bucharest://transit/lines` — Complete directory of all transit lines.
- `bucharest://transit/catalog` — STB public transit ticket catalog and pricing.

### Prompts
- `next_departure` — Ask for upcoming bus, tram, or trolley departures at any station.
- `route_advice` — Ask for transit routing guidance between two locations in Bucharest.

---

## Installation & Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Build from source

```bash
git clone https://github.com/therosaer/bucharest-transit-mcp.git
cd bucharest-transit-mcp
npm install
npm run build
```

Run tests:
```bash
npm test
```

---

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bucharest-transit": {
      "command": "node",
      "args": ["/path/to/bucharest-transit-mcp/dist/index.js"]
    }
  }
}
```

Or using `npx`:
```json
{
  "mcpServers": {
    "bucharest-transit": {
      "command": "npx",
      "args": ["-y", "bucharest-transit-mcp"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "bucharest-transit": {
      "command": "node",
      "args": ["/path/to/bucharest-transit-mcp/dist/index.js"]
    }
  }
}
```

### GitHub Copilot / VS Code (`settings.json`)

```json
{
  "github.copilot.chat.mcp.servers": {
    "bucharest-transit": {
      "command": "node",
      "args": ["/path/to/bucharest-transit-mcp/dist/index.js"]
    }
  }
}
```

---

## Environment Variables (Optional)

| Variable | Description |
| :--- | :--- |
| `STB_BILET_TOKEN` | Bearer token for pre-authenticating with the STB backoffice API. |
| `STB_USERNAME` | STB / Bilet TB account email or username. |
| `STB_PASSWORD` | STB / Bilet TB account password. |
| `BUCHAREST_TRANSIT_DATA_DIR` | Custom directory containing `routes_map.json`, `line_routes_index.json`, and `snapshot_vehicles.json`. |

---

## Data Attribution & Upstream Services

- **Live Vehicle Telemetry**: `https://mo-bi.ro/python_api/` (Open Data public transit feed).
- **Timetables & Geometries**: Derived from official TPBI GTFS static feeds.
- **Ticketing & Account Data**: `https://online.stbsa.ro:8080/external/` (STB SA Backoffice).
- **Reference Application**: [BucharestTransit](https://github.com/therosaer/BucharestTransit) by `@therosaer`.

*This is an independent open-source project and is not officially affiliated with or endorsed by STB SA, TPBI, or Metrorex.*

---

## License

MIT License. See [LICENSE](LICENSE) for details.
