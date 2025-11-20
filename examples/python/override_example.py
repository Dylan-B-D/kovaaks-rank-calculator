"""
Example of using score overrides with the KovaaK's Rank API
"""

import sys
from pathlib import Path

# Add bindings to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'bindings' / 'python'))

from kovaaks_rank_api import KovaaksRankAPI, RankCalculatorError

# Constants
STEAM_ID: str = "76561198218488124"
BENCHMARK_NAME: str = "Voltaic S5"
DIFFICULTY: str = "Advanced"

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
    
    try:
        # 1. Normal Calculation
        print("\n--- Normal Calculation ---")
        result = api.calculate_rank(STEAM_ID, BENCHMARK_NAME, DIFFICULTY)
        print(f"Rank: {result['rankName']}")
        details = result.get('details', {})
        if 'harmonicMean' in details:
            print(f"Energy: {details['harmonicMean']:.2f}")

        # 2. Override Calculation
        # Use -1.0 to keep the original score for other scenarios
        print("\n--- Override Calculation ---")
        
        # Order MUST match the benchmark scenario order

        overrides = [
            # CLICKING — Dynamic
            1200.0,   # VT Pasu Advanced S5
            -1.0,     # VT Popcorn Advanced S5    (keep original)
            
            # CLICKING — Static
            1600.0,   # VT TwTzS Advanced S5
            1500.0,   # VT wwST Advanced S5
            
            # LINEAR — Dynamic
            -1.0,     # VT Frogtagon Advanced S5  (keep original)
            1000.0,   # VT Floating Heads Adv S5
            
            # TRACKING — Precise
            -1.0,     # VT PGT Advanced S5        (keep original)
            4000.0,   # VT Snake Track Adv S5
            
            # TRACKING — Reactive
            3200.0,   # VT Aether Advanced S5
            -1.0,     # VT Ground Advanced S5     (keep original)
            
            # TRACKING — Control
            3600.0,   # VT Raw Control Advanced
            -1.0,     # VT Controlsphere Adv      (keep original)
            
            # SPEED
            1400.0,   # VT DoTS Advanced
            -1.0,     # VT EdoEts Advanced        (keep original)
            
            # SWITCHING — Evasive
            600.0,    # VT DrifTTS Advanced
            800.0,    # VT FlyTS Advanced
            
            # STABILITY — Passive
            -1.0,     # VT ControlTS Advanced     (keep original)
            650.0,    # VT Penta Bounce Advanced
        ]

        
        result_override = api.calculate_rank(
            STEAM_ID, 
            BENCHMARK_NAME, 
            DIFFICULTY, 
            score_overrides=overrides
        )
        
        print(f"Rank: {result_override['rankName']}")
        details_override = result_override.get('details', {})
        if 'harmonicMean' in details_override:
            print(f"Energy: {details_override['harmonicMean']:.2f}")

    except RankCalculatorError as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
