# CLI Usage Guide

The KovaaKs Rank CLI accepts JSON input via stdin and outputs JSON results to stdout. This makes it easy to use from any programming language or shell.

## Basic Concepts

- **Input:** JSON piped to stdin
- **Output:** JSON written to stdout
- **Errors:** JSON error messages written to stderr

## Input Modes

The CLI supports multiple modes of operation. See [API Modes](api-modes.md) for details.

### Mode 1: Simple Mode

Provide a Steam ID, benchmark name, and difficulty. The CLI fetches data from the KovaaK's API automatically.

**Input:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced"
}
```

**Example (PowerShell):**
```powershell
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | .\output\kovaaks-rank-cli.exe
```

**Example (Bash):**
```bash
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | ./output/kovaaks-rank-cli
```

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
      "progressToNextRank": 0.67
    }
  }
}
```

## Available Benchmarks

See `bindings/data/benchmarks.json` for the complete list.

## Error Handling

Errors are returned as JSON with `success: false`:

```json
{
  "success": false,
  "error": "Benchmark 'Invalid Name' not found. Some available: Voltaic S5, RankAim S4, ..."
}
```

## Examples

See the `examples/` directory for working examples
