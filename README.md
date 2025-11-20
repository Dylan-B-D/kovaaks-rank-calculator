# KovaaKs rank calculator

A rank calculation system for KovaaK's benchmarks.
Includes a standalone CLI executable and Python bindings.

## Documentation
- **[Setup Guide](docs/setup.md)** - Installation and building
- **[CLI Usage](docs/cli-usage.md)** - Command-line interface guide
- **[Python API](docs/python-api.md)** - Python wrapper documentation
- **[TypeScript Usage](docs/typescript-usage.md)** - Direct TypeScript usage
- **[API Modes Reference](docs/api-modes.md)** - All available modes and features

**Examples:**
- [Python Examples](examples/python/) - Python scripts
- [PowerShell Examples](examples/powershell/) - PowerShell usage examples

If needed, an up-to-date version of the benchmarks.json file found in `bindings/data/benchmarks.json` can be found on https://evxl.app/data/benchmarks

## Build the Executable

First, you'll need to build the CLI executable. This handles all logic such as fetching data, calculating ranks etc.

**Prerequisites:** [Node.js](https://nodejs.org/)

```bash
# Install dependencies
npm install

# Build for Windows (creates output/kovaaks-rank-cli.exe)
npm run build

# Build for Linux (creates output/kovaaks-rank-cli)
npm run build:linux

# Build for macOS (creates output/kovaaks-rank-cli)
npm run build:macos
```

The executable will be created in the `output/` directory (~36MB cause typsecript is bad).

## Python API

You can use the Python wrapper to calculate ranks.

### Setup

Either:
1. Copy `bindings/python/kovaaks_rank_api.py` to your project.
2. Or add `bindings/python` to your Python path.

**Important:** If you move the Python file, you must tell it where the executable is located.

### Usage

```python
from kovaaks_rank_api import KovaaksRankAPI

# Option A: works if using original directory structure
api = KovaaksRankAPI()

# Option B: Specify executable path (RECOMMENDED if copying files)
api = KovaaksRankAPI(executable_path="path/to/kovaaks-rank-cli.exe")

try:
    result = api.calculate_rank(
        steam_id="76561198012345678",
        benchmark_name="Voltaic S5",
        difficulty="Advanced"
    )

    print(f"Rank: {result['rankName']}")
    print(f"Progress: {result['details']['progressToNextRank']:.2%}")

except Exception as e:
    print(f"Error: {e}")
```

### Available Benchmarks
See `bindings/data/benchmarks.json` for the complete list of supported benchmarks and difficulties.

## CLI Usage

You can also use the executable directly from any language by piping JSON to it.

**Simple Mode:**
```json
{
  "steamId": "76561198012345678",
  "benchmarkName": "Voltaic S5",
  "difficulty": "Advanced"
}
```

**Advanced Mode:**
You can also provide the raw API data and benchmark definition if you want to avoid the CLI fetching data itself.
```json
{
  "apiData": { ... },
  "benchmark": { ... },
  "difficulty": "Advanced"
}
```

**Example (Windows PowerShell):**
```powershell
echo '{"steamId": "...", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | output\kovaaks-rank-cli.exe
```

## Development structure
- `src/`: Core TypeScript logic
- `cli/`: CLI wrapper code
- `bindings/`: Language bindings (Python) and data
- `examples/`: Example scripts
- `docs/`: Documentation
- `output/`: Compiled executables

## License
GNU GPLv3