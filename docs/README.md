# KovaaKs rank API documentation

## Documentation Index

### Getting Started
- **[Setup Guide](setup.md)** - Installation, dependencies, and building the executable

### Usage Guides
- **[CLI Usage](cli-usage.md)** - Complete guide to using the command-line interface
- **[Python API](python-api.md)** - Using the Python wrapper for rank calculations
- **[TypeScript Usage](typescript-usage.md)** - Direct TypeScript/JavaScript usage

### Reference
- **[API Modes](api-modes.md)** - Detailed explanation of all available API modes and features

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the executable:**
   ```bash
   npm run build
   ```

3. **Use the CLI:**
   ```bash
   echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | output\kovaaks-rank-cli.exe
   ```

4. **Or use the Python API:**
   ```python
   from kovaaks_rank_api import KovaaksRankAPI
   
   api = KovaaksRankAPI()
   result = api.calculate_rank(
       steam_id="76561198012345678",
       benchmark_name="Voltaic S5",
       difficulty="Advanced"
   )
   print(f"Rank: {result['rankName']}")
   ```

## Current Features

- **Calculate ranks** for any supported KovaaK's benchmark
- **Fetch player data** from the KovaaK's API
- **Override scores** manually or from local stats files
- **Filter by date range** to calculate historical ranks
- **Filter by sensitivity** to exclude certain scores
- **Batch calculate** ranks for multiple dates
- **Generate rank history** automatically from stats files
- **Use from any language** via the CLI or language bindings

## See Also

- [Examples Directory](../examples/) - Working code examples
- [Benchmark List](../bindings/data/benchmarks.json) - All supported benchmarks
- [Main README](../README.md) - Project overview
