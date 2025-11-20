/**
 * CLI wrapper for KovaaK's rank calculation system
 * Reads JSON from stdin, calculates rank, outputs JSON to stdout
 * 
 * Usage (bash/Linux/macOS):
 *   echo '{"apiData": {...}, "benchmark": {...}, "difficulty": "novice"}' | npx ts-node cli/kovaaks-rank-cli.ts
 * 
 * Usage (PowerShell/Windows):
 *   '{"apiData": {...}, "benchmark": {...}, "difficulty": "novice"}' | npx ts-node cli/kovaaks-rank-cli.ts
 * 
 * Or compile to standalone executable:
 *   npm run build
 */

import { calculateOverallRank } from '../src/rankCalculations';
import type { BenchmarkApiData, Benchmark } from '../src/types/benchmarks';
import { readFileSync } from 'fs';

// Import benchmarks data directly
// @ts-ignore
import benchmarksData from '../bindings/data/benchmarks.json';

interface CliInput {
  // Required for Mode 1 Direct Data
  apiData?: BenchmarkApiData;
  benchmark?: Benchmark;
  
  // Required for Mode 2 Simplified Input
  steamId?: string;
  benchmarkName?: string;
  
  // Always required
  difficulty: string;

  // Optional score overrides (array of floats, -1 to keep original)
  scoreOverrides?: number[];
}

interface CliOutput {
  success: boolean;
  result?: {
    rank: number;
    rankName: string;
    useComplete: boolean;
    details?: any;
    fallbackUsed?: boolean;
  };
  error?: string;
}

function findBenchmark(name: string, difficulty: string): { benchmark: Benchmark, kovaaksId: number } {
  const benchmarks = benchmarksData as any[];
  
  for (const b of benchmarks) {
    if (b.benchmarkName.toLowerCase() === name.toLowerCase()) {
      for (const d of b.difficulties) {
        if (d.difficultyName.toLowerCase() === difficulty.toLowerCase()) {
          return { benchmark: b, kovaaksId: d.kovaaksBenchmarkId };
        }
      }
      
      const availableDiffs = b.difficulties.map((d: any) => d.difficultyName).join(', ');
      throw new Error(`Difficulty '${difficulty}' not found for benchmark '${name}'. Available: ${availableDiffs}`);
    }
  }
  
  // Suggest benchmarks
  const available = benchmarks.slice(0, 5).map(b => b.benchmarkName).join(', ');
  throw new Error(`Benchmark '${name}' not found. Some available: ${available}...`);
}

async function fetchApiData(steamId: string, benchmarkId: number): Promise<BenchmarkApiData> {
  const url = `https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark?benchmarkId=${benchmarkId}&steamId=${steamId}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No data found for Steam ID '${steamId}' on benchmark ID ${benchmarkId}.`);
      }
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    return await response.json() as BenchmarkApiData;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Network error: ${String(error)}`);
  }
}

function applyScoreOverrides(apiData: BenchmarkApiData, overrides: number[]) {
  if (!apiData.categories || overrides.length === 0) return;
  
  let index = 0;
  for (const category of Object.values(apiData.categories)) {
    if (!category.scenarios) continue;
    
    // Iterate over scenarios in the order they appear in the API response object
    // This matches the order used by the Python script and getOrderedScenarioNames logic
    for (const scenarioData of Object.values(category.scenarios)) {
      if (index < overrides.length) {
        const override = overrides[index];
        if (override !== -1) {
          // Convert float score (e.g. 109.08) to int score (e.g. 10908)
          scenarioData.score = Math.round(override * 100);
        }
      }
      index++;
    }
  }
}

async function main() {
  try {
    let input;
    try {
      input = readFileSync(0, 'utf-8');
    } catch (e) {
      // console.error("DEBUG: Error reading stdin:", e);
      throw e;
    }

    if (!input || input.trim() === '') {
      throw new Error('No input provided. Please pipe JSON data to stdin.');
    }

    // Parse input JSON
    let parsed: CliInput;
    try {
      parsed = JSON.parse(input);
    } catch (parseError) {
      throw new Error(`Invalid JSON input: ${(parseError as Error).message}`);
    }

    if (!parsed.difficulty) {
      throw new Error('Missing required field: difficulty');
    }

    let apiData: BenchmarkApiData;
    let benchmark: Benchmark;

    // Check which mode to use
    if (parsed.steamId && parsed.benchmarkName) {
      // Mode 2: Simplified input
      // console.error(`DEBUG: Using simplified mode for ${parsed.benchmarkName} / ${parsed.difficulty}`);
      
      const found = findBenchmark(parsed.benchmarkName, parsed.difficulty);
      benchmark = found.benchmark;
      apiData = await fetchApiData(parsed.steamId, found.kovaaksId);
      
    } else if (parsed.apiData && parsed.benchmark) {
      // Mode 1: Direct data
      apiData = parsed.apiData;
      benchmark = parsed.benchmark;
      
    } else {
      throw new Error('Invalid input. Provide either (steamId, benchmarkName, difficulty) OR (apiData, benchmark, difficulty).');
    }

    // Apply score overrides if provided
    if (parsed.scoreOverrides && Array.isArray(parsed.scoreOverrides)) {
      applyScoreOverrides(apiData, parsed.scoreOverrides);
    }

    // Calculate rank
    const result = calculateOverallRank(
      apiData,
      benchmark,
      parsed.difficulty
    );

    const output: CliOutput = {
      success: true,
      result
    };
    
    console.log(JSON.stringify(output));
    process.exit(0);

  } catch (error) {
    const output: CliOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    
    console.error(JSON.stringify(output));
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  const output: CliOutput = {
    success: false,
    error: error instanceof Error ? error.message : String(error)
  };
  console.error(JSON.stringify(output));
  process.exit(1);
});

main();
