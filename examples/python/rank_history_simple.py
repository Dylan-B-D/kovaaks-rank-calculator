"""
Rank history using CLI
"""

import json
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any, List

try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from datetime import datetime
except ImportError:
    plt = None
    mdates = None
    datetime = None

# Constants
STEAM_ID: str = "76561198218488124"
BENCHMARK_NAME: str = "Voltaic S3"
DIFFICULTY: str = "Advanced"
STATS_DIR: str = r"C:\Program Files (x86)\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"

class RankHistoryAnalyzer:
    def __init__(self, executable_path: str = None):
        if executable_path is None:
            self.executable_path = Path(__file__).parent.parent.parent / 'output' / 'kovaaks-rank-cli.exe'
        else:
            self.executable_path = Path(executable_path)
            
        if not self.executable_path.exists():
            raise FileNotFoundError(f"Executable not found: {self.executable_path}")

    def calculate_rank_history(
        self, 
        benchmark_name: str, 
        difficulty: str, 
        steam_id: str,
        stats_dir: str
    ) -> Dict[str, Any]:
        """
        Stats parsing and date aggregation is done by the CLI
        """
        payload = {
            'steamId': steam_id,
            'benchmarkName': benchmark_name,
            'difficulty': difficulty,
            'rankHistory': True,
            'config': {
                'statsDir': stats_dir
            }
        }
        
        print(f"\nCalculating rank history for {benchmark_name} ({difficulty})...")
        
        try:
            result = subprocess.run(
                [str(self.executable_path)],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                check=False,
                timeout=300
            )
            
            # Try to parse stdout first, then stderr
            try:
                output = json.loads(result.stdout)
            except json.JSONDecodeError:
                try:
                    output = json.loads(result.stderr)
                except json.JSONDecodeError:
                    raise RuntimeError(f"Invalid JSON response.\nstdout: {result.stdout}\nstderr: {result.stderr}")
            
            if not output.get('success', False):
                raise RuntimeError(f"Calculation failed: {output.get('error', 'Unknown error')}")
                
            return output
            
        except subprocess.TimeoutExpired:
            raise RuntimeError("Calculation timed out after 5 minutes")
        except Exception as e:
            raise RuntimeError(f"Error calculating rank history: {str(e)}")

    def plot_history(self, history: List[Dict[str, Any]], rank_names: List[str] = None):
        """Plot rank history using matplotlib"""
        if not history or plt is None:
            print("Cannot plot: matplotlib not available or no history data")
            return

        dates = [datetime.strptime(h['date'], "%Y-%m-%d") for h in history]
        
        # Check if we have energy data
        has_energy = any(h.get('energy') is not None and h.get('energy') > 0 for h in history)
        
        plt.figure(figsize=(12, 6))
        
        if has_energy:
            # Plot Energy
            values = [h.get('energy', 0) if h.get('energy') is not None else 0 for h in history]
            plt.plot(dates, values, marker='o', linestyle='-', color='b', label='Energy')
            plt.ylabel("Energy")
            
            # Annotate rank changes
            last_rank = None
            for i, (date, val, rank) in enumerate(zip(dates, values, [h['rankName'] for h in history])):
                if rank != last_rank:
                    plt.annotate(
                        rank, 
                        (date, val),
                        xytext=(0, 10), 
                        textcoords='offset points',
                        arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0'),
                        fontsize=8,
                        rotation=45
                    )
                    last_rank = rank
        else:
            # Plot Rank + Progress
            values = []
            for h in history:
                rank = h['rank']
                progress = h.get('progress', 0)
                
                values.append(rank + progress)

            plt.plot(dates, values, marker='o', linestyle='-', color='g', label='Rank Progress')
            plt.ylabel("Rank Level")
            
            # Set y-ticks to rank names if available
            if rank_names:
                plt.yticks(range(len(rank_names)), rank_names)
                plt.ylim(bottom=0, top=len(rank_names))
            
            # Annotate rank changes
            last_rank = None
            for i, (date, val, rank) in enumerate(zip(dates, values, [h['rankName'] for h in history])):
                if rank != last_rank:
                    plt.annotate(
                        rank, 
                        (date, val),
                        xytext=(0, 10), 
                        textcoords='offset points',
                        arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0'),
                        fontsize=8,
                        rotation=45
                    )
                    last_rank = rank

        plt.title(f"Rank History: {BENCHMARK_NAME} - {DIFFICULTY}")
        plt.xlabel("Date")
        plt.grid(True)
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        plt.gca().xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.show()

def main():
    analyzer = RankHistoryAnalyzer()
    
    try:
        # Calculate rank history
        result = analyzer.calculate_rank_history(
            BENCHMARK_NAME,
            DIFFICULTY,
            STEAM_ID,
            STATS_DIR
        )
        
        history = result.get('history', [])
        metadata = result.get('metadata', {})
        
        print(f"\n--- Results ---")
        print(f"Total dates: {metadata.get('totalDates', 0)}")
        print(f"Total scores: {metadata.get('totalScores', 0)}")
        print(f"Scenarios: {len(metadata.get('scenarios', []))}")
        
        if history:
            print(f"\nFirst rank: {history[0]['rankName']} on {history[0]['date']}")
            print(f"Latest rank: {history[-1]['rankName']} on {history[-1]['date']}")
            
            rank_names = []
            # Would need to fetch this separately from benchmarks.json
            
            analyzer.plot_history(history, rank_names)
        else:
            print("\nNo history data found.")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
