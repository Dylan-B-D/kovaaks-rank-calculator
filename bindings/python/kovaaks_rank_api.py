"""
KovaaK's Rank API - Python Client Library

This module provides a Python interface to the KovaaK's rank calculation system.
It communicates with the compiled CLI executable to perform rank calculations.

Usage:
    from kovaaks_rank_api import KovaaksRankAPI
    
    api = KovaaksRankAPI()
    result = api.calculate_rank(api_data, benchmark, difficulty)
    
    print(f"Rank: {result['rankName']}")
    print(f"Progress: {result['details']['progressToNextRank']:.2%}")
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Optional


class RankCalculatorError(Exception):
    """Raised when rank calculation fails"""
    pass


class KovaaksRankAPI:
    """Python client for the KovaaK's rank calculator CLI executable"""
    
    def __init__(self, executable_path: Optional[str] = None):
        """
        Initialize the API client with path to the CLI executable
        
        Args:
            executable_path: Path to the compiled kovaaks-rank-cli executable.
                           If not provided, defaults to ../../output/kovaaks-rank-cli.exe
        """
        if executable_path is None:
            # Default path relative to this file
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
        api_data: Dict[str, Any],
        benchmark: Dict[str, Any],
        difficulty: str,
        timeout: Optional[float] = 30.0
    ) -> Dict[str, Any]:
        """
        Calculate rank for given benchmark data
        
        Args:
            api_data: BenchmarkApiData object from KovaaK's API containing:
                - benchmark_progress: int
                - overall_rank: int
                - categories: dict
                - ranks: list
            benchmark: Benchmark configuration object containing:
                - benchmarkName: str
                - rankCalculation: str
                - abbreviation: str
                - color: str
                - spreadsheetURL: str
                - difficulties: list
            difficulty: Difficulty name (e.g., "novice", "intermediate", "advanced")
            timeout: Maximum time to wait for calculation (seconds)
        
        Returns:
            Dictionary containing:
                - rank: int - The calculated rank number
                - rankName: str - Human-readable rank name
                - useComplete: bool - Whether complete calculation was used
                - details: dict (optional) - Additional calculation details:
                    - harmonicMean: float - Energy-based harmonic mean
                    - progressToNextRank: float - Progress percentage (0.0-1.0)
                - fallbackUsed: bool (optional) - Whether fallback calculation was used
        
        Raises:
            RankCalculatorError: If calculation fails
            subprocess.TimeoutExpired: If calculation takes too long
        """
        # Prepare input payload
        payload = {
            'apiData': api_data,
            'benchmark': benchmark,
            'difficulty': difficulty
        }
        
        try:
            # Call the executable
            result = subprocess.run(
                [str(self.executable_path)],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False  # We'll handle errors manually
            )
            
            # Parse output
            try:
                output = json.loads(result.stdout)
            except json.JSONDecodeError:
                # If stdout isn't valid JSON, try stderr
                try:
                    output = json.loads(result.stderr)
                except json.JSONDecodeError:
                    raise RankCalculatorError(
                        f"Invalid JSON response. stdout: {result.stdout}, "
                        f"stderr: {result.stderr}"
                    )
            
            # Check for errors
            if not output.get('success', False):
                error_msg = output.get('error', 'Unknown error')
                raise RankCalculatorError(f"Calculation failed: {error_msg}")
            
            # Return the result
            return output['result']
            
        except subprocess.TimeoutExpired:
            raise RankCalculatorError(
                f"Calculation timed out after {timeout} seconds"
            )
        except FileNotFoundError:
            raise RankCalculatorError(
                f"Executable not found or not executable: {self.executable_path}"
            )
        except Exception as e:
            raise RankCalculatorError(f"Unexpected error: {str(e)}")
    
    def calculate_ranks_batch(
        self,
        calculations: list[Dict[str, Any]],
        timeout_per_calc: float = 30.0
    ) -> list[Dict[str, Any]]:
        """
        Calculate multiple ranks in batch (useful for generating graphs or analyzing multiple scenarios)
        
        Args:
            calculations: List of dicts, each containing:
                - api_data: BenchmarkApiData
                - benchmark: Benchmark config
                - difficulty: str
            timeout_per_calc: Timeout for each individual calculation
        
        Returns:
            List of result dictionaries, each containing:
                - success: bool
                - index: int - Index in the input list
                - result: dict (if successful)
                - error: str (if failed)
        """
        results = []
        
        for i, calc in enumerate(calculations):
            try:
                result = self.calculate_rank(
                    api_data=calc['api_data'],
                    benchmark=calc['benchmark'],
                    difficulty=calc['difficulty'],
                    timeout=timeout_per_calc
                )
                results.append({
                    'success': True,
                    'index': i,
                    'result': result
                })
            except Exception as e:
                results.append({
                    'success': False,
                    'index': i,
                    'error': str(e)
                })
        
        return results
