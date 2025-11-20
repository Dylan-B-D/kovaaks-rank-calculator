"""
KovaaK's Rank API - Python Client Library
"""

import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional


class RankCalculatorError(Exception):
    """Raised when rank calculation fails"""
    pass


class KovaaksRankAPI:
    """Python client for the KovaaK's rank calculator"""
    
    def __init__(self, executable_path: Optional[str] = None):
        """
        Initialize the API client
        
        Args:
            executable_path: Path to the compiled kovaaks-rank-cli executable.
                           If not provided, defaults to ../../output/kovaaks-rank-cli.exe
        """
        if executable_path is None:
            default_path = Path(__file__).parent.parent.parent / 'output' / 'kovaaks-rank-cli.exe'
            self.executable_path = default_path
        else:
            self.executable_path = Path(executable_path)
        
        if not self.executable_path.exists():
            raise FileNotFoundError(
                f"Rank calculator executable not found at: {self.executable_path}\n"
                f"Please build the executable first using: npm run build:windows"
            )
    
    def calculate_rank(
        self,
        steam_id: str,
        benchmark_name: str,
        difficulty: str,
        timeout: Optional[float] = 30.0
    ) -> Dict[str, Any]:
        """
        Calculate rank for a player's benchmark performance
        
        Args:
            steam_id: Steam ID (e.g., "76561198218488124")
            benchmark_name: Name of the benchmark (e.g., "Voltaic S4", "Voltaic S5")
            difficulty: Difficulty level (e.g., "Novice", "Intermediate", "Advanced")
            timeout: Maximum time to wait for calculation (seconds)
        
        Returns:
            Dictionary containing:
                - rank: int - The index of the calculated rank
                - rankName: str - Human-readable rank name
                - useComplete: bool - Whether complete calculation was used
                - details: dict (optional) - Additional calculation details:
                    - harmonicMean: float - Benchmark energy (only present for energy-based calculations)
                    - progressToNextRank: float - Progress percentage (0.0-1.0)
                    - other details may be present depending on the calculation method
                - fallbackUsed: bool (optional) - Whether fallback calculation was used
        
        Raises:
            RankCalculatorError: If calculation fails
        """
        # Payload for the CLI
        payload = {
            'steamId': steam_id,
            'benchmarkName': benchmark_name,
            'difficulty': difficulty
        }
        
        try:
            result = subprocess.run(
                [str(self.executable_path)],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False
            )
            
            try:
                output = json.loads(result.stdout)
            except json.JSONDecodeError:
                try:
                    output = json.loads(result.stderr)
                except json.JSONDecodeError:
                    # If both fail, return the raw stdout/stderr for debugging
                    raise RankCalculatorError(
                        f"Invalid JSON response.\nstdout: {result.stdout}\nstderr: {result.stderr}"
                    )
            
            if not output.get('success', False):
                error_msg = output.get('error', 'Unknown error')
                raise RankCalculatorError(f"Calculation failed: {error_msg}")
            
            return output['result']
            
        except subprocess.TimeoutExpired:
            raise RankCalculatorError(f"Calculation timed out after {timeout} seconds")
        except FileNotFoundError:
            raise RankCalculatorError(f"Executable not found: {self.executable_path}")
        except Exception as e:
            raise RankCalculatorError(f"Unexpected error: {str(e)}")
