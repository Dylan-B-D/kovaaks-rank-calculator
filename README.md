# KovaaK's Rank API

A standalone rank calculation system for KovaaK's benchmarks, providing both a CLI executable and language bindings for easy integration.

## Project Structure

```
KovaaKs Rank API/
├── cli/                    # CLI executable source
│   └── kovaaks-rank-cli.ts
├── src/                    # Core rank calculation library
│   ├── rankCalculations.ts
│   ├── rankUtils.ts
│   └── types/
├── bindings/               # Language bindings
│   └── python/
│       └── kovaaks_rank_api.py
├── examples/               # Usage examples
│   └── python_example.py
├── sample-data/            # Test data
└── output/                 # Compiled executables
```

## Building the Executable

You need [Bun](https://bun.sh) installed.

### Windows
```bash
npm run build:windows
```

### Linux/macOS
```bash
npm run build
```

This creates the executable at `output/kovaaks-rank-cli.exe` (Windows) or `output/kovaaks-rank-cli` (Linux/macOS).

## Usage

### CLI Direct Usage

Pipe JSON input to the executable:

**Windows (PowerShell):**
```powershell
type sample-data\test-input.json | output\kovaaks-rank-cli.exe
```

**Linux/macOS:**
```bash
cat sample-data/test-input.json | ./output/kovaaks-rank-cli
```

**Input Format:**
```json
{
  "apiData": { ... },
  "benchmark": { ... },
  "difficulty": "novice"
}
```

**Output Format:**
```json
{
  "success": true,
  "result": {
    "rank": 3,
    "rankName": "Gold",
    "useComplete": true,
    "details": {
      "harmonicMean": 1234.56,
      "progressToNextRank": 0.75
    }
  }
}
```

### Python API

Install the Python binding by adding the `bindings/python` directory to your Python path, or copy `kovaaks_rank_api.py` to your project.

**Basic Usage:**
```python
from kovaaks_rank_api import KovaaksRankAPI

# Initialize (auto-detects executable location)
api = KovaaksRankAPI()

# Calculate rank
result = api.calculate_rank(
    api_data=your_api_data,
    benchmark=your_benchmark,
    difficulty="novice"
)

print(f"Rank: {result['rankName']}")
print(f"Progress: {result['details']['progressToNextRank']:.2%}")
```

**Run the example:**
```bash
python examples/python_example.py
```

### Other Languages

The CLI executable can be called from any language that supports:
- Running subprocess/shell commands
- Piping JSON to stdin
- Reading JSON from stdout

See the Python implementation in `bindings/python/kovaaks_rank_api.py` as a reference.

## Development

The core rank calculation logic is in `src/`, which is imported by the CLI wrapper in `cli/`. To modify the calculation logic, edit files in `src/`. To modify the CLI interface, edit `cli/kovaaks-rank-cli.ts`.

## License

[Add your license here]