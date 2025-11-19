"""
Example usage of the KovaaK's Rank API Python binding

This script demonstrates how to use the Python API to calculate ranks.
"""

import json
import sys
from pathlib import Path

# Add bindings to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'bindings' / 'python'))

from kovaaks_rank_api import KovaaksRankAPI, RankCalculatorError


def main():
    # Load test data
    test_data_path = Path(__file__).parent.parent / 'sample-data' / 'test-input.json'
    
    try:
        with open(test_data_path, 'r') as f:
            test_data = json.load(f)
        
        example_api_data = test_data['apiData']
        example_benchmark = test_data['benchmark']
        example_difficulty = test_data['difficulty']
        
    except FileNotFoundError:
        print(f"Error: Test data not found at {test_data_path}", file=sys.stderr)
        print("Using minimal example data instead...", file=sys.stderr)
        example_api_data = {
            'benchmark_progress': 50,
            'overall_rank': 3,
            'categories': {},
            'ranks': []
        }
        example_benchmark = {
            'benchmarkName': 'Voltaic Benchmarks',
            'rankCalculation': 'vt-energy',
            'abbreviation': 'VT',
            'color': '#FF6B6B',
            'spreadsheetURL': '',
            'difficulties': []
        }
        example_difficulty = 'novice'

    # Initialize the API client
    # The executable path is auto-detected from the default location
    try:
        api = KovaaksRankAPI()
    except FileNotFoundError as e:
        print(f"\n{e}", file=sys.stderr)
        print("\nPlease build the executable first:", file=sys.stderr)
        print("  npm run build:windows", file=sys.stderr)
        sys.exit(1)
    
    # Calculate rank
    print("Calculating rank...")
    try:
        result = api.calculate_rank(
            api_data=example_api_data,
            benchmark=example_benchmark,
            difficulty=example_difficulty
        )
        
        print(f"\nRank Name: {result['rankName']}")
        
        # Show progress and energy metrics if available
        details = result.get('details', {})
        if 'harmonicMean' in details:
            print(f"  Harmonic Mean (Energy): {details['harmonicMean']}")
        if 'progressToNextRank' in details:
            print(f"  Progress to Next Rank: {details['progressToNextRank']:.2%}")
        
        if 'subcategoryEnergies' in details:
            print("\nSubcategory Energies:")
            for subcategory, energies in details['subcategoryEnergies'].items():
                print(f"  {subcategory}:")
                for energy_type, energy in energies.items():
                    print(f"    {energy_type}: {energy}")

        # print(f"\nFull result:")
        # print(json.dumps(result, indent=2))
        
    except RankCalculatorError as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
