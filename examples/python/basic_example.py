"""
Example usage of the KovaaK's Rank API Python binding
"""

import sys
from pathlib import Path

from kovaaks_rank_api import KovaaksRankAPI, RankCalculatorError

# Constants
STEAM_ID: str = "76561198218488124"
BENCHMARK_NAME: str = "Voltaic S5"
DIFFICULTY: str = "Advanced"

def main():
    # Define path to executable
    # If this is not passed, it will default to the output directory
    exe_path = Path(__file__).parent.parent.parent / 'output' / 'kovaaks-rank-cli.exe'

    # Initialize the API client
    try:
        api = KovaaksRankAPI(executable_path=str(exe_path))
    except FileNotFoundError as e:
        print(f"\n{e}", file=sys.stderr)
        print("\nPlease build the executable first:", file=sys.stderr)
        print("  npm run build:windows", file=sys.stderr)
        sys.exit(1)
    
    print(f"Calculating rank for:")
    print(f"  Steam ID: {STEAM_ID}")
    print(f"  Benchmark: {BENCHMARK_NAME}")
    print(f"  Difficulty: {DIFFICULTY}")
    print()
    
    try:
        result = api.calculate_rank(
            steam_id=STEAM_ID,
            benchmark_name=BENCHMARK_NAME,
            difficulty=DIFFICULTY
        )
        
        print(f"Rank: {result['rankName']}")
        
        details = result.get('details', {})
        if 'harmonicMean' in details:
            print(f"Harmonic Mean (Energy): {details['harmonicMean']:.2f}")
        if 'progressToNextRank' in details:
            print(f"Progress to Next Rank: {details['progressToNextRank']:.2%}")
        
        if 'subcategoryEnergies' in details:
            print("\nSubcategory Energies:")
            for subcategory, energies in details['subcategoryEnergies'].items():
                print(f"  {subcategory}:")
                for energy_type, energy in energies.items():
                    print(f"    {energy_type}: {energy:.2f}")
        
    except RankCalculatorError as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
