# Setup
### Required
- **[Node.js](https://nodejs.org/)**

### Optional
- **Python 3.7+** - Only if you want to use the Python API wrapper

## Installation

```bash
npm install
```

This will install all required TypeScript dependencies and build tools.

## Building the Executable

### Build for Windows

```bash
npm run build
```

Creates: `output/kovaaks-rank-cli.exe` (~36MB)

### Build for Linux

```bash
npm run build:linux
```

Creates: `output/kovaaks-rank-cli`

### Build for macOS

```bash
npm run build:macos
```

Creates: `output/kovaaks-rank-cli`

## Running TypeScript Directly (Development)

If you don't want to build an executable, you can run the TypeScript code directly:

```bash
# Using ts-node
npx ts-node cli/kovaaks-rank-cli.ts

# Or using Bun
bun run cli/kovaaks-rank-cli.ts
```

**Example:**
```bash
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | npx ts-node cli/kovaaks-rank-cli.ts
```

## Python Setup

If you want to use the Python wrapper:
### Option 1: Copy to Your Project

1. Copy `bindings/python/kovaaks_rank_api.py` to your project
2. Copy the built executable to your project
3. Specify the executable path:

```python
from kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI(executable_path="path/to/kovaaks-rank-cli.exe")
```

### Option 2: Use in Place

The Python wrapper can find the executable automatically if you keep the default directory structure:

```python
from bindings.python.kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI()  # Automatically finds ../output/kovaaks-rank-cli.exe
```

## Verifying the Installation

### Test the CLI

**Windows (PowerShell):**
```powershell
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | .\output\kovaaks-rank-cli.exe
```

**Linux/macOS:**
```bash
echo '{"steamId": "76561198012345678", "benchmarkName": "Voltaic S5", "difficulty": "Advanced"}' | ./output/kovaaks-rank-cli
```

### Test the Python API

```python
from bindings.python.kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI()
result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced"
)
print(result)
```
