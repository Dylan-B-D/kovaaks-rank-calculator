"""
Rank History Visualization for Multiple Voltaic Benchmarks
Plots S4, and S5 rank progression on the same graph
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime
import subprocess

try:
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
except ImportError:
    print("Error: plotly not installed. Install with: pip install plotly")
    sys.exit(1)

# Configuration
DISPLAY_NAME = "Your Display Name"
STEAM_ID = "00000000000000000" # not needed so we can use dummy
STATS_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"

# Define the benchmarks to plot
BENCHMARKS = [
    {"name": "Voltaic S3", "difficulty": "Advanced"},
    {"name": "Voltaic S4", "difficulty": "Advanced"},
    {"name": "Voltaic S5", "difficulty": "Advanced"},
    # {"name": "Viscose Benchmarks", "difficulty": "Medium"},
]

# Load benchmarks.json to get rank colors
BENCHMARKS_JSON_PATH = Path(__file__).parent.parent.parent / "bindings" / "data" / "benchmarks.json"
with open(BENCHMARKS_JSON_PATH, 'r', encoding='utf-8') as f:
    benchmarks_data = json.load(f)

def get_rank_colors(benchmark_name: str, difficulty: str) -> dict:
    """Get rank colors from benchmarks.json"""
    for bench in benchmarks_data:
        if bench['benchmarkName'] == benchmark_name:
            for diff in bench['difficulties']:
                if diff['difficultyName'] == difficulty:
                    return diff.get('rankColors', {})
    return {}

def fetch_rank_history(cli_path: Path, benchmark_name: str, difficulty: str):
    """Fetch rank history for a benchmark using CLI directly"""
    print(f"Fetching history for {benchmark_name} ({difficulty})...")
    
    try:
        # Use rankHistory mode
        payload = {
            "steamId": STEAM_ID,
            "benchmarkName": benchmark_name,
            "difficulty": difficulty,
            "rankHistory": True,
            "config": {
                "statsDir": STATS_DIR
            }
        }
        
        result = subprocess.run(
            [str(cli_path)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=60.0,
            check=False
        )
        
        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError:
            print(f"  Error: Invalid JSON response")
            print(f"  stdout: {result.stdout[:200]}")
            print(f"  stderr: {result.stderr[:200]}")
            return None
        
        if not output.get('success', False):
            error_msg = output.get('error', 'Unknown error')
            print(f"  Error: {error_msg}")
            return None
            
        history = output.get('history', [])
        print(f"  Found {len(history)} data points")
        return history
        
    except subprocess.TimeoutExpired:
        print(f"  Error: Calculation timed out")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

def create_multi_benchmark_plot(histories: dict):
    """Create energy and rank progression graph"""
    
    # Create figure with secondary y-axis
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Modern color scheme
    benchmark_colors = {
        "Voltaic S3": "#FF9900",  # Orange
        "Voltaic S4": "#00D9FF",  # Cyan
        "Voltaic S5": "#FF6B9D",   # Pink
        "Viscose Benchmarks": "#00FF00",   # Green
    }
    
    # Track min/max for scaling
    min_energy = float('inf')
    max_energy = 0
    has_energy_data = False
    
    for benchmark_name, history in histories.items():
        if not history:
            continue
            
        # Sort history by date to ensure correct plotting order
        history.sort(key=lambda x: x['date'])

        dates = [datetime.fromisoformat(entry['date']) for entry in history]
        energies = [entry.get('energy', 0) for entry in history]
        rank_names = [entry['rankName'] for entry in history]
        
        # Check if this benchmark has energy data
        # We consider it having energy data if any entry has energy > 0
        has_energy = any(e > 0 for e in energies)
        
        color = benchmark_colors.get(benchmark_name, '#888888')
        
        if has_energy:
            has_energy_data = True
            # Filter out zero energies for min/max calculation
            non_zero_energies = [e for e in energies if e > 0]
            if non_zero_energies:
                min_energy = min(min_energy, min(non_zero_energies))
                max_energy = max(max_energy, max(non_zero_energies))
            
            # Add energy trace with fill
            fig.add_trace(go.Scatter(
                x=dates,
                y=energies,
                mode='lines',
                name=f"{benchmark_name} (Energy)",
                line=dict(color=color, width=3, shape='linear'),
                fill='tozeroy',
                fillcolor=f'rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.15)',
                hovertemplate=(
                    f'<b>{benchmark_name}</b><br>' +
                    'Date: %{x|%b %d, %Y}<br>' +
                    'Energy: %{y:.1f}<br>' +
                    'Rank: %{text}<br>' +
                    '<extra></extra>'
                ),
                text=rank_names
            ), secondary_y=False)
            
            # Annotate rank changes for energy
            prev_rank = None
            for i, entry in enumerate(history):
                current_rank = entry['rankName']
                energy = entry.get('energy', 0)
                
                if energy > 0 and current_rank != prev_rank and prev_rank is not None:
                    if "Complete" not in current_rank:
                        fig.add_annotation(
                            x=dates[i],
                            y=energies[i],
                            text=current_rank,
                            showarrow=True,
                            arrowhead=2,
                            arrowsize=1,
                            arrowwidth=2,
                            arrowcolor=color,
                            ax=0,
                            ay=-40,
                            bgcolor=f'rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.9)',
                            bordercolor=color,
                            borderwidth=2,
                            borderpad=4,
                            font=dict(size=11, color='white', family='Arial Black'),
                            opacity=0.95
                        )
                prev_rank = current_rank
                
        else:
            # Calculate rank values (index + progress)
            # Assuming history entries have 'rank' (int) and 'progress' (float 0-1)
            rank_values = []
            for entry in history:
                r = entry.get('rank', 0)
                p = entry.get('progress', 0)
                rank_values.append(r + p)
                
            # Add rank trace
            fig.add_trace(go.Scatter(
                x=dates,
                y=rank_values,
                mode='lines',
                name=f"{benchmark_name} (Rank)",
                line=dict(color=color, width=3, shape='linear', dash='solid'),
                hovertemplate=(
                    f'<b>{benchmark_name}</b><br>' +
                    'Date: %{x|%b %d, %Y}<br>' +
                    'Rank Index: %{y:.2f}<br>' +
                    'Rank: %{text}<br>' +
                    '<extra></extra>'
                ),
                text=rank_names
            ), secondary_y=True)
            
            # Annotate rank changes for rank-based
            prev_rank = None
            for i, entry in enumerate(history):
                current_rank = entry['rankName']
                val = rank_values[i]
                
                if current_rank != prev_rank and prev_rank is not None:
                    fig.add_annotation(
                        x=dates[i],
                        y=val,
                        text=current_rank,
                        showarrow=True,
                        arrowhead=2,
                        arrowsize=1,
                        arrowwidth=2,
                        arrowcolor=color,
                        ax=0,
                        ay=-40,
                        bgcolor=f'rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.9)',
                        bordercolor=color,
                        borderwidth=2,
                        borderpad=4,
                        font=dict(size=11, color='white', family='Arial Black'),
                        opacity=0.95,
                        yref="y2"
                    )
                prev_rank = current_rank

    # Calculate Y-axis for Energy
    if has_energy_data and min_energy != float('inf'):
        energy_range = max_energy - min_energy
        y_min = max(0, min_energy - energy_range * 0.1)
        y_max = max_energy + energy_range * 0.1
    else:
        y_min = 0
        y_max = 1000
    
    # Layout
    fig.update_layout(
        title={
            'text': f'{DISPLAY_NAME}\'s Progression',
            'x': 0.5,
            'xanchor': 'center',
            'font': {'size': 32, 'color': '#FFFFFF', 'family': 'Arial Black'}
        },
        xaxis=dict(
            title='Date',
            gridcolor='#1a1a1a',
            color='#CCCCCC',
            showgrid=True,
            tickfont=dict(size=12)
        ),
        yaxis=dict(
            title='Energy',
            gridcolor='#1a1a1a',
            color='#CCCCCC',
            showgrid=True,
            range=[y_min, y_max] if has_energy_data else None,
            tickfont=dict(size=12),
            showline=True,
            linewidth=1,
            linecolor='#333333'
        ),
        yaxis2=dict(
            title='Rank Index (for non-energy benchmarks)',
            gridcolor='#1a1a1a',
            color='#CCCCCC',
            showgrid=False,
            tickfont=dict(size=12),
            overlaying='y',
            side='right',
            showline=True,
            linewidth=1,
            linecolor='#333333'
        ),
        plot_bgcolor='#0a0a0a',
        paper_bgcolor='#000000',
        font=dict(color='#FFFFFF', family='Arial'),
        hovermode='x unified',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="center",
            x=0.5,
            bgcolor='rgba(0,0,0,0.8)',
            bordercolor='#333333',
            borderwidth=2,
            font=dict(size=16)
        ),
        height=700,
        margin=dict(t=120, b=80, l=90, r=90)
    )
    
    return fig

def main():
    # Find CLI executable
    cli_path = Path(__file__).parent.parent.parent / "output" / "kovaaks-rank-cli.exe"
    if not cli_path.exists():
        print(f"Error: CLI not found at {cli_path}")
        print("Make sure kovaaks-rank-cli.exe is in ./output/")
        return
    
    # Fetch histories for all benchmarks
    histories = {}
    for bench in BENCHMARKS:
        history = fetch_rank_history(cli_path, bench['name'], bench['difficulty'])
        if history:
            histories[bench['name']] = history
    
    if not histories:
        print("\nNo data to plot!")
        return
    
    # Create and show plot
    print("\nGenerating plot...")
    fig = create_multi_benchmark_plot(histories)
    
    # Save to HTML
    output_file = Path(__file__).parent / "rank_history.html"
    fig.write_html(str(output_file))
    print(f"\nPlot saved to: {output_file}")
    
    # Open in browser
    import webbrowser
    webbrowser.open(f'file://{output_file}')
    print("Opening in browser...")

if __name__ == "__main__":
    main()
