# Python API Guide

The Python wrapper provides an interface to the KovaaKs Rank Calculator without dealing with JSON or subprocess calls directly.

## Installation
### Option 1: Copy to Your Project

1. Copy `bindings/python/kovaaks_rank_api.py` to your project
2. Build and copy the executable (see [Setup Guide](setup.md))
3. Specify the executable path:

```python
from kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI(executable_path="path/to/kovaaks-rank-cli.exe")
```

### Option 2: Use in Place
- Run `npm run build` to build the executable. 
- Keep the default directory structure and import directly:

```python
from bindings.python.kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI()  # Automatically finds the executable
```

## Basic Usage

### Simple Rank Calculation

```python
from bindings.python.kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI()

result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced"
)

print(f"Rank: {result['rankName']}")
print(f"Rank Index: {result['rank']}")
print(f"Energy: {result['details']['harmonicMean']:.1f}")
print(f"Progress: {result['details']['progressToNextRank']:.2%}")
```

**Output:**
```
Rank: Diamond
Rank Index: 5
Energy: 523.4
Progress: 67.00%
```

## Other Features

### Using Local Stats Files

Calculate rank using local KovaaK's stats instead of API data:

```python
result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    config={
        "statsDir": "C:/Program Files (x86)/Steam/steamapps/common/FPSAimTrainer/FPSAimTrainer/stats"
    }
)
```
This works by patching your best local scores into the KovaaK's API data and then calculating the rank.
### Filtering by Date Range

Only include scores within a specific date range:

```python
result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    config={
        "statsDir": "C:/path/to/stats",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31"
    }
)
```

### Filtering by Sensitivity

Only include scores at or below a certain sensitivity:

```python
result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    config={
        "statsDir": "C:/path/to/stats",
        "sensitivityLimitCm": 30.0,
        "sensitivityAboveLimit": False  # False = <= 30cm, True = > 30cm
    }
)
```

### Manual Score Overrides

Override specific scenario scores for "what-if" calculations:

```python
result = api.calculate_rank(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    score_overrides=[120.5, 95.3, -1, 110.0, -1, -1]  # -1 keeps original
)
```

### Fetch API Data Only

Fetch data without calculating rank (useful for caching):

```python
data = api.fetch_api_data(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced"
)

# Later, calculate rank using cached data
result = api.calculate_rank_from_data(
    api_data=data,
    benchmark_name="Voltaic S5",
    difficulty="Advanced"
)
```

### Batch Calculate for Multiple Dates

Calculate rank for multiple dates in a single call:

```python
results = api.calculate_rank_batch_dates(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    config={"statsDir": "C:/path/to/stats"},
    dates=["2024-01-01", "2024-02-01", "2024-03-01"]
)

for result in results:
    print(f"{result['date']}: {result['rankName']} ({result['rank']})")
```

### Generate Rank History Automatically

Automatically scan stats and calculate rank for each date:

```python
history = api.calculate_rank_history(
    steam_id="76561198012345678",
    benchmark_name="Voltaic S5",
    difficulty="Advanced",
    config={
        "statsDir": "C:/path/to/stats",
        "sensitivityLimitCm": 30.0,
        "sensitivityAboveLimit": False
    }
)

print(f"Total dates: {history['metadata']['totalDates']}")
print(f"Total scores: {history['metadata']['totalScores']}")

for entry in history['history']:
    print(f"{entry['date']}: {entry['rankName']} (Energy: {entry['energy']:.1f})")
```

## Error Handling

The API raises exceptions on errors:

```python
from bindings.python.kovaaks_rank_api import KovaaksRankAPI

api = KovaaksRankAPI()

try:
    result = api.calculate_rank(
        steam_id="invalid_id",
        benchmark_name="Voltaic S5",
        difficulty="Advanced"
    )
except Exception as e:
    print(f"Error: {e}")
```

## Available Methods

### `calculate_rank()`

Calculate rank using Steam ID and benchmark name.

**Parameters:**
- `steam_id` (str): Steam ID
- `benchmark_name` (str): Benchmark name
- `difficulty` (str): Difficulty name
- `config` (dict, optional): Configuration for stats scanning
- `score_overrides` (list, optional): Manual score overrides
- `fetch_only` (bool, optional): Only fetch data, don't calculate

**Returns:** Dict with rank calculation result

### `calculate_rank_from_data()`

Calculate rank using pre-fetched API data.

**Parameters:**
- `api_data` (dict): API data from KovaaK's
- `benchmark_name` (str): Benchmark name
- `difficulty` (str): Difficulty name
- `config` (dict, optional): Configuration for stats scanning
- `score_overrides` (list, optional): Manual score overrides

**Returns:** Dict with rank calculation result

### `fetch_api_data()`

Fetch API data without calculating rank.

**Parameters:**
- `steam_id` (str): Steam ID
- `benchmark_name` (str): Benchmark name
- `difficulty` (str): Difficulty name

**Returns:** Dict with API data

### `calculate_rank_batch_dates()`

Calculate rank for multiple dates.

**Parameters:**
- `steam_id` (str): Steam ID
- `benchmark_name` (str): Benchmark name
- `difficulty` (str): Difficulty name
- `config` (dict): Configuration with `statsDir`
- `dates` (list): List of ISO dates (YYYY-MM-DD)

**Returns:** Dict with results for each date

### `calculate_rank_history()`

Automatically generate rank history from stats.

**Parameters:**
- `steam_id` (str): Steam ID
- `benchmark_name` (str): Benchmark name
- `difficulty` (str): Difficulty name
- `config` (dict): Configuration with `statsDir`

**Returns:** Dict with history array and metadata

## Examples

See the `examples/python/` directory for complete working examples:

- `rank_calculator.py` - Basic rank calculation
- `config_example.py` - Using config for filtering stats
- `override_example.py` - Manual score overrides
- `rank_history_simple.py` - Rank history example using CLI
