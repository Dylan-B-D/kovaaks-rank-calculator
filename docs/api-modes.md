# API Modes Reference

This document provides a comprehensive reference for all available modes and features of the KovaaKs Rank Calculator API.

## Overview

The API supports multiple modes of operation, each designed for specific use cases. All modes accept JSON input via stdin and return JSON output via stdout.

## Mode Summary

| Mode | Use Case | Features |
|------|----------|--------------|
| **Simple** | Basic rank calculation | Auto-fetches API data |
| **Advanced** | Custom data handling | Use manually fetched API data |
| **Config** | Local stats scanning | Date/sensitivity filtering |
| **Score Overrides** | Many, such as local scores | Score replacement |
| **Fetch Only** | Data caching | Get API data without calculation |
| **Batch Dates** | Historical analysis | Multiple dates in one call |
| **Batch Overrides** | Pre-calculated overrides | Multiple override sets |
| **Rank History** | Automatic history | Scan stats and calculate all dates |

---

## Mode 1: Simple Mode

**Use Case:** Basic rank calculation with automatic API data fetching.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced"
}
```

**Required Fields:**
- `steamId` - Steam ID (17-digit number as string)
- `benchmarkName` - Exact benchmark name (case-insensitive)
- `difficulty` - Difficulty name (case-insensitive)

**Output:**
```json
{
  "success": true,
  "result": {
    "rank": 5,
    "rankName": "Diamond",
    "useComplete": false,
    "details": {
      "harmonicMean": 523.4,
      "progressToNextRank": 0.67,
      "subcategoryEnergies": { ... }
    }
  }
}
```

---

## Mode 2: Advanced Mode

**Input:**
```json
{
  "apiData": {
    "categories": { ... },
    "ranks": [ ... ]
  },
  "benchmark": {
    "benchmarkName": "Voltaic S5",
    "rankCalculation": "vt-energy",
    "difficulties": [ ... ]
  },
  "difficulty": "Advanced"
}
```

**Required Fields:**
- `apiData` - API response from KovaaK's backend
- `benchmark` - Benchmark definition from `binding/data/benchmarks.json`
- `difficulty` - Difficulty name

**Use Cases:**
- Modifying API data before calculation

---

## Mode 3: Config Mode (Local Stats)

**Use Case:** Calculate rank using local KovaaK's stats files instead of API data.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "config": {
    "statsDir": "C:/Program Files (x86)/Steam/steamapps/common/FPSAimTrainer/FPSAimTrainer/stats",
    "sensitivityLimitCm": 30.0,
    "sensitivityAboveLimit": false,
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

**Config Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `statsDir` | string | Yes | Path to KovaaK's stats directory |
| `sensitivityLimitCm` | number | No | Sensitivity threshold in cm/360 |
| `sensitivityAboveLimit` | boolean | No | `true` for > limit, `false` for ≤ limit |
| `startDate` | string | No | ISO date (YYYY-MM-DD) - only scores on or after |
| `endDate` | string | No | ISO date (YYYY-MM-DD) - only scores on or before |

**Behavior:**
- Scans all `.csv` files in `statsDir`
- Matches scenario names from the benchmark
- Applies sensitivity and date filters
- Uses the best score for each scenario
- Replaces API scores with local scores

**Use Cases:**
- Calculate rank at a specific date
- Filter out scores at high/low sensitivity
- Use local data instead of API data
- Historical rank analysis

---

## Mode 4: Score Overrides

**Use Case:** Manually override specific scenario scores.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "scoreOverrides": [120.5, 95.3, -1, 110.0, -1, -1, 88.2]
}
```

**Score Override Format:**
- Array of numbers in the same order as scenarios in the API response
- Array length must match number of scenarios
- Use `-1` to keep the original score
- Scores are in **float format** (e.g., `120.5`)
- The CLI converts float to int internally (multiplies by 100)

**Getting Scenario Order:**
Use `fetchOnly` mode to see the scenario order, or check the API response.

---

## Mode 5: Fetch Only

**Use Case:** Fetch API data without calculating rank.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "fetchOnly": true
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "categories": {
      "Clicking": {
        "scenarios": {
          "Scenario Name": {
            "score": 10500,
            "scenario_rank": 4,
            "rank_maxes": [8000, 9000, 10000, 11000, 12000]
          }
        }
      }
    },
    "ranks": ["Unranked", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond"]
  }
}
```

---

## Mode 6: Batch Dates

**Use Case:** Calculate rank for multiple dates in a single call.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "config": {
    "statsDir": "C:/path/to/stats"
  },
  "batchDates": ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"]
}
```

**Output:**
```json
{
  "success": true,
  "results": [
    {
      "date": "2024-01-01",
      "rank": 3,
      "rankName": "Platinum",
      "useComplete": false,
      "details": { ... }
    },
    {
      "date": "2024-02-01",
      "rank": 4,
      "rankName": "Diamond",
      "useComplete": false,
      "details": { ... }
    }
  ]
}
```

**Behavior:**
- Scans stats directory **once**
- For each date, calculates rank using scores up to that date
- Much faster than calling the CLI multiple times

---

## Mode 7: Batch Overrides

**Use Case:** Calculate rank for multiple sets of pre-calculated score overrides.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "batchOverrides": [
    {
      "date": "2024-01-01",
      "scoreOverrides": [100, 95, 90, 85, 80, 75]
    },
    {
      "date": "2024-02-01",
      "scoreOverrides": [105, 98, 92, 88, 83, 78]
    }
  ]
}
```

**Output:**
```json
{
  "success": true,
  "results": [
    {
      "date": "2024-01-01",
      "rank": 3,
      "rankName": "Platinum",
      "details": { ... }
    },
    {
      "date": "2024-02-01",
      "rank": 4,
      "rankName": "Diamond",
      "details": { ... }
    }
  ]
}
```

---

## Mode 8: Rank History (Automatic)

**Use Case:** Automatically scan stats, identify dates, and calculate rank for each date.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "rankHistory": true,
  "config": {
    "statsDir": "C:/path/to/stats",
    "sensitivityLimitCm": 30.0,
    "sensitivityAboveLimit": false,
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

**Output:**
```json
{
  "success": true,
  "history": [
    {
      "date": "2024-01-15",
      "rank": 3,
      "rankName": "Platinum",
      "energy": 345.2,
      "progress": 0.45,
      "details": {
        "harmonicMean": 345.2,
        "progressToNextRank": 0.45,
        "subcategoryEnergies": { ... }
      }
    },
    {
      "date": "2024-02-20",
      "rank": 4,
      "rankName": "Diamond",
      "energy": 456.8,
      "progress": 0.23,
      "details": { ... }
    }
  ],
  "metadata": {
    "totalDates": 2,
    "totalScores": 150,
    "scenarios": ["Scenario 1", "Scenario 2", ...]
  }
}
```

**Behavior:**
1. Scans stats directory for benchmark scenarios
2. Extracts dates from filenames
3. Groups scores by date
4. For each date, calculates rank using best scores up to that date
5. Returns complete history with metadata

---

## Combining Modes

You can combine certain modes:

### Config + Score Overrides
```json
{
  "steamId": "...",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "config": {
    "statsDir": "C:/path/to/stats",
    "endDate": "2024-06-01"
  },
  "scoreOverrides": [120.5, -1, -1, 110.0]
}
```
- First applies config (scans stats with filters)
- Then applies score overrides on top

### Fetch Only + Config
```json
{
  "steamId": "...",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced",
  "fetchOnly": true,
  "config": {
    "statsDir": "C:/path/to/stats"
  }
}
```
- Fetches API data
- Applies config overrides
- Returns modified data without calculating rank

---

## Output Format

### Success Response
```json
{
  "success": true,
  "result": {
    "rank": 5,
    "rankName": "Diamond",
    "useComplete": false,
    "details": {
      "harmonicMean": 523.4,
      "progressToNextRank": 0.67,
      "subcategoryEnergies": { ... },
      "thresholds": [100, 200, 300, 400, 500, 600]
    },
    "fallbackUsed": false
  }
}
```

**Fields:**
- `rank` - Numeric rank (0 = unranked, 1+ = ranked)
- `rankName` - Human-readable rank name
- `useComplete` - Whether complete rank was used instead of energy rank
- `details` - Additional calculation details (varies by benchmark)
- `fallbackUsed` - Whether fallback calculation was used

### Error Response
```json
{
  "success": false,
  "error": "Benchmark 'Invalid Name' not found. Some available: Voltaic S5, RankAim S4, ..."
}
```

---

## Available Benchmarks

See `bindings/data/benchmarks.json` for the complete list. 

## Performance Considerations

### Fastest to Slowest

1. **Advanced Mode** - No API fetch, no stats scan
2. **Simple Mode** - One API fetch
3. **Config Mode** - One API fetch + one stats scan
4. **Batch Modes** - One API fetch + one stats scan, multiple calculations
5. **Rank History** - One API fetch + one stats scan + many calculations

### Optimization

- Use **Batch Dates** or **Rank History** instead of multiple CLI calls
- Use **Fetch Only** to cache API data if calculating multiple times
- Use **Batch Overrides** if you've pre-calculated overrides
- The CLI logs performance metrics to stderr for debugging


