"""
Example of using local stats scanning with the KovaaK's Rank API
"""

import sys
from pathlib import Path

# Add bindings to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'bindings' / 'python'))

from kovaaks_rank_api import KovaaksRankAPI, RankCalculatorError

# Constants
STEAM_ID: str = "76561198218488124"
BENCHMARK_NAME: str = "Voltaic S5"
DIFFICULTY: str = "Intermediate"

# Stats directory (adjust this to your KovaaK's installation)
STATS_DIR: str = r"C:\Program Files (x86)\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"

def main():
    # Define path to executable
    exe_path = Path(__file__).parent.parent.parent / 'output' / 'kovaaks-rank-cli.exe'

    try:
        api = KovaaksRankAPI(executable_path=str(exe_path))
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    print(f"Calculating rank for:")
    print(f"  Steam ID: {STEAM_ID}")
    print(f"  Benchmark: {BENCHMARK_NAME}")
    print(f"  Difficulty: {DIFFICULTY}")
    print(f"  Stats Dir: {STATS_DIR}")
    
    try:
        # Example 1: Normal calculation (using API data)
        print("\n--- Normal Calculation (API Data) ---")
        result = api.calculate_rank(STEAM_ID, BENCHMARK_NAME, DIFFICULTY)
        print(f"Rank: {result['rankName']}")
        details = result.get('details', {})
        if 'harmonicMean' in details:
            print(f"Energy: {details['harmonicMean']:.2f}")

        # Example 2: Using local stats with sensitivity constraint
        print("\n--- Using Local Stats (sens <= 15cm) ---")
        
        config = {
            'statsDir': STATS_DIR,
            'sensitivityLimitCm': 15.0,
            'sensitivityAboveLimit': False  # False means <= limit
        }
        
        result_stats = api.calculate_rank(
            STEAM_ID, 
            BENCHMARK_NAME, 
            DIFFICULTY, 
            config=config
        )
        
        print(f"Rank: {result_stats['rankName']}")
        details_stats = result_stats.get('details', {})
        if 'harmonicMean' in details_stats:
            print(f"Energy: {details_stats['harmonicMean']:.2f}")

        # Example 3: Using local stats with higher sensitivity
        print("\n--- Using Local Stats (sens > 30cm) ---")
        
        config_high = {
            'statsDir': STATS_DIR,
            'sensitivityLimitCm': 30.0,
            'sensitivityAboveLimit': True  # True means > limit
        }
        
        result_high_sens = api.calculate_rank(
            STEAM_ID, 
            BENCHMARK_NAME, 
            DIFFICULTY, 
            config=config_high
        )
        
        print(f"Rank: {result_high_sens['rankName']}")
        details_high = result_high_sens.get('details', {})
        if 'harmonicMean' in details_high:
            print(f"Energy: {details_high['harmonicMean']:.2f}")

        # Example 4: Manual score overrides
        print("\n--- Manual Overrides ---")
        
        manual_overrides = [806.0, 640.0, 1138.0, 1370.0, 1030.0, 610.0, 3049.0, 2880.0, 3061.0, 3256.0, 3230.0, 3385.0, 1140.0, 980.0, 480.0, 533.0, 448.0, 482.0]
        
        result_combined = api.calculate_rank(
            STEAM_ID, 
            BENCHMARK_NAME, 
            DIFFICULTY,
            score_overrides=manual_overrides
        )
        
        print(f"Rank: {result_combined['rankName']}")
        details_combined = result_combined.get('details', {})
        if 'harmonicMean' in details_combined:
            print(f"Energy: {details_combined['harmonicMean']:.2f}")

        # Example 5: Using date range filtering
        print("\n--- Using Local Stats with Date Filter (Oct 2025+) ---")
        
        config_date = {
            'statsDir': STATS_DIR,
            'startDate': '2025-10-1',
            'endDate': '2025-12-31'
        }
        
        result_date = api.calculate_rank(
            STEAM_ID, 
            BENCHMARK_NAME, 
            DIFFICULTY, 
            config=config_date
        )
        
        print(f"Rank: {result_date['rankName']}")
        details_date = result_date.get('details', {})
        if 'harmonicMean' in details_date:
            print(f"Energy: {details_date['harmonicMean']:.2f}")

    except RankCalculatorError as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
