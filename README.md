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

There are a few ways to set up the Python bindings:

#### Option 1: Install in Editable Mode (Recommended)
This installs the package in your current environment while keeping the files linked to the source.
```bash
pip install -e .
```

#### Option 2: Configure VS Code
If you prefer not to install the package, you can configure VS Code to recognize the bindings directory.

1. Create or edit `.vscode/settings.json` in your workspace.
2. Add the following configuration:
   ```json
   {
       "python.analysis.extraPaths": ["./bindings/python"]
   }
   ```
3. **Restart VS Code** (or run "Developer: Reload Window") for the changes to take effect.

#### Option 3: Copy the File
Simply copy `bindings/python/kovaaks_rank_api.py` directly into your project directory.

**Important:** If you move the Python file or use it from a different location, you must tell it where the executable is located (see Usage below).

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
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | .\output\kovaaks-rank-cli.exe
```

## CLI Flags

The CLI supports several flags:

```bash
# Show version
.\output\kovaaks-rank-cli.exe --version
.\output\kovaaks-rank-cli.exe -v

# Show help
.\output\kovaaks-rank-cli.exe --help
.\output\kovaaks-rank-cli.exe -h

# List all available benchmarks
.\output\kovaaks-rank-cli.exe --list-benchmarks

# Show details for a specific benchmark
.\output\kovaaks-rank-cli.exe --benchmark "Voltaic S5"
```

## License
GNU GPLv3