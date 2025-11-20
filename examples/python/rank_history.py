"""
Rank history
Plots rank history over time by scanning local stats and re-calculating rank
"""

import json
import sys
import os
import subprocess
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor, as_completed

# Third-party imports
try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
except ImportError:
    plt = None
    mdates = None

# Add bindings to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'bindings' / 'python'))

from kovaaks_rank_api import KovaaksRankAPI, RankCalculatorError

# Constants
STEAM_ID: str = "00000000000000000" # Dummy ID for structure fetching
BENCHMARK_NAME: str = "Voltaic S3"
DIFFICULTY: str = "Advanced"
STATS_DIR: str = r"C:\Program Files (x86)\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"

class RankHistoryAnalyzer:
    def __init__(self, executable_path: Optional[str] = None):
        if executable_path is None:
            self.executable_path = Path(__file__).parent.parent.parent / 'output' / 'kovaaks-rank-cli.exe'
        else:
            self.executable_path = Path(executable_path)
            
        if not self.executable_path.exists():
            raise FileNotFoundError(f"Executable not found: {self.executable_path}")

    def fetch_benchmark_structure(self, benchmark_name: str, difficulty: str) -> Dict[str, Any]:
        """
        Fetches the benchmark structure from the API via the CLI using fetchOnly mode.
        """
        payload = {
            'steamId': STEAM_ID,
            'benchmarkName': benchmark_name,
            'difficulty': difficulty,
            'fetchOnly': True
        }
        
        try:
            result = subprocess.run(
                [str(self.executable_path)],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                check=False
            )
            
            try:
                output = json.loads(result.stdout)
            except json.JSONDecodeError:
                try:
                    output = json.loads(result.stderr)
                except json.JSONDecodeError:
                    raise RankCalculatorError(f"Invalid JSON response.\nstdout: {result.stdout}\nstderr: {result.stderr}")
            
            if not output.get('success', False):
                raise RankCalculatorError(f"Fetch failed: {output.get('error', 'Unknown error')}")
                
            return output.get('data', {})
            
        except Exception as e:
            raise RankCalculatorError(f"Error fetching benchmark structure: {str(e)}")

    def get_scenario_names(self, api_data: Dict[str, Any]) -> List[str]:
        """
        Extracts all scenario names from the API data in order.
        """
        scenarios = []
        if not api_data.get('categories'):
            return scenarios
            
        for category in api_data['categories'].values():
            if category.get('scenarios'):
                for name in category['scenarios'].keys():
                    scenarios.append(name)
        return scenarios

    def parse_all_stats(self, stats_dir: str, target_scenarios: List[str]):
        """
        Parse all stats files once and cache scores with dates.
        Returns: (Dict[scenario_name, List[(date, score)]], Set[unique_dates])
        """
        print(f"\nParsing all stats files...")
        
        stats_path = Path(stats_dir)
        if not stats_path.exists():
            raise RankCalculatorError(f"Stats directory not found: {stats_dir}")

        # Dictionary to store all scores: {scenario_name: [(date, score), ...]}
        scenario_scores: Dict[str, List[tuple]] = {name: [] for name in target_scenarios}
        target_scenarios_set = set(target_scenarios)
        unique_dates_set: Set[str] = set()
        
        file_count = 0
        match_count = 0
        
        with os.scandir(stats_dir) as entries:
            for entry in entries:
                if not entry.name.endswith(' Stats.csv'):
                    continue
                    
                file_count += 1
                
                try:
                    filename = entry.name
                    parts = filename.split(' - ')
                    if len(parts) < 3:
                        continue
                        
                    scenario_name = parts[0].strip()
                    
                    if scenario_name in target_scenarios_set:
                        # Extract date
                        date_part = parts[-1].replace(' Stats.csv', '').strip()
                        try:
                            dt = datetime.strptime(date_part, "%Y.%m.%d-%H.%M.%S")
                            date_str = dt.strftime("%Y-%m-%d")
                            unique_dates_set.add(date_str)
                            
                            # Parse the CSV file to get the score
                            full_path = os.path.join(stats_dir, filename)
                            try:
                                with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                                    for line in f:
                                        if line.startswith('Score:'):
                                            # Format is "Score:,123.45"
                                            parts_score = line.strip().split(',')
                                            if len(parts_score) >= 2:
                                                score = float(parts_score[1])
                                                scenario_scores[scenario_name].append((date_str, score))
                                                match_count += 1
                                            break
                            except (ValueError, IndexError, FileNotFoundError):
                                pass
                        except ValueError:
                            pass
                except Exception:
                    pass
        
        print(f"\n  Parsed {file_count} files. Found {match_count} scores.")
        print(f"  Unique dates: {len(unique_dates_set)}")
        return scenario_scores, sorted(list(unique_dates_set))

    def calculate_rank_history(
        self, 
        benchmark_name: str, 
        difficulty: str, 
        steam_id: str,
        scenarios: List[str],
        cached_scores: Dict[str, List[tuple]],
        unique_dates: List[str],
        batch_size: int = 50
    ):
        """
        Calculate rank history using parallel batch processing.
        """
        print(f"\n--- Calculating Rank History ---")
        print(f"Computing rank for {len(unique_dates)} unique dates...")
        
        start_time = time.time()
        history = []
        
        # Prepare all batch items
        all_batch_items = []
        for date in unique_dates:
            score_overrides = []
            for scenario_name in scenarios:
                scores_for_scenario = cached_scores.get(scenario_name, [])
                valid_scores = [score for (score_date, score) in scores_for_scenario if score_date <= date]
                
                if valid_scores:
                    score_overrides.append(max(valid_scores))
                else:
                    score_overrides.append(0)
            
            all_batch_items.append({
                'date': date,
                'scoreOverrides': score_overrides
            })
            
        # Split into chunks
        chunks = [all_batch_items[i:i + batch_size] for i in range(0, len(all_batch_items), batch_size)]
        # print(f"Split into {len(chunks)} batches")
        
        def process_batch(batch_items):
            payload = {
                'steamId': steam_id,
                'benchmarkName': benchmark_name,
                'difficulty': difficulty,
                'batchOverrides': batch_items
            }
            
            try:
                result = subprocess.run(
                    [str(self.executable_path)],
                    input=json.dumps(payload),
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=300
                )
                
                output = json.loads(result.stdout if result.stdout else result.stderr)
                if output.get('success', False):
                    return output.get('results', [])
                else:
                    print(f"Batch failed: {output.get('error')}")
                    return []
            except Exception as e:
                print(f"Batch exception: {e}")
                return []

        # Run in parallel
        results_flat = []
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_batch = {executor.submit(process_batch, chunk): chunk for chunk in chunks}
            
            completed = 0
            for future in as_completed(future_to_batch):
                results_flat.extend(future.result())
                completed += 1
                
        print(f"\nProcessed {len(results_flat)} total results.")
        
        # Map back to history format
        for item in results_flat:
            rank_result = item
            details = rank_result.get('details', {})
            
            history.append({
                'date': item.get('date'),
                'energy': details.get('harmonicMean', None),
                'progress': details.get('progressToNextRank', 0),
                'rank': rank_result.get('rank', 0),
                'rankName': rank_result.get('rankName', 'Unknown')
            })
            
        history.sort(key=lambda x: x['date'])
        
        total_time = time.time() - start_time
        if len(unique_dates) > 0:
            print(f"Completed in {total_time:.1f}s (avg {total_time/len(unique_dates):.3f}s per date)")
            
        return history

    def plot_history(self, history: List[Dict[str, Any]], rank_names: List[str] = None):
        if not history or plt is None:
            return

        dates = [datetime.strptime(h['date'], "%Y-%m-%d") for h in history]
        
        # Check if we have energy data
        has_energy = any(h['energy'] is not None and h['energy'] > 0 for h in history)
        
        plt.figure(figsize=(12, 6))
        
        if has_energy:
            # Plot Energy
            values = [h['energy'] if h['energy'] is not None else 0 for h in history]
            plt.plot(dates, values, marker='o', linestyle='-', color='b', label='Energy')
            plt.ylabel("Energy (Harmonic Mean)")
            
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
            # Calculate y-values: rank_index + progress
            # Clamp progress to 0.99 unless it's the max rank
            max_rank_index = len(rank_names) - 1 if rank_names else 999
            values = []
            for h in history:
                rank = h['rank']
                progress = h['progress']
                
                # Ensure progress is 0.0 for exact rank achievement (handled by calculation usually)
                # But clamp to 0.99 max unless we are at the absolute highest rank
                if rank < max_rank_index:
                    progress = min(progress, 0.99)
                
                values.append(rank + progress)

            plt.plot(dates, values, marker='o', linestyle='-', color='g', label='Rank Progress')
            plt.ylabel("Rank Level")
            
            # Set y-ticks to rank names if available
            if rank_names:
                # Create ticks for each rank
                plt.yticks(range(len(rank_names)), rank_names)
                plt.ylim(bottom=0, top=len(rank_names))
            
            # Annotate rank changes
            last_rank = None
            for i, (date, val, rank) in enumerate(zip(dates, values, [h['rankName'] for h in history])):
                if progress > 0.01 and rank != last_rank: # Avoid annotating if just starting
                     pass

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
    
    print(f"Fetching structure for {BENCHMARK_NAME} ({DIFFICULTY})...")
    try:
        api_data = analyzer.fetch_benchmark_structure(BENCHMARK_NAME, DIFFICULTY)
        scenarios = analyzer.get_scenario_names(api_data)
        
        # Extract rank names for plotting
        rank_names = []
        if 'ranks' in api_data:
            rank_names = [r['name'] for r in api_data['ranks']]
            print(f"Found {len(rank_names)} ranks: {', '.join(rank_names[:5])}...")
        
        if not scenarios:
            print("No scenarios found.")
            return
            
        print(f"Found {len(scenarios)} scenarios.")
        
        cached_scores, unique_dates = analyzer.parse_all_stats(STATS_DIR, scenarios)
        
        if not unique_dates:
            print("No dates found in stats.")
            return
        
        # Calculate rank history
        REAL_STEAM_ID = "76561198218488124"
        history = analyzer.calculate_rank_history(
            BENCHMARK_NAME,
            DIFFICULTY,
            REAL_STEAM_ID,
            scenarios,
            cached_scores,
            unique_dates
        )
        
        print(f"\n--- Results ---")
        print(f"Total data points: {len(history)}")
        
        if history: 
            analyzer.plot_history(history, rank_names)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
