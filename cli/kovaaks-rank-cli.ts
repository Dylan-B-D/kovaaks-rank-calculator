/**
 * CLI wrapper for KovaaK's rank calculation system
 * Reads JSON from stdin, calculates rank, outputs JSON to stdout
 * 
 * Usage (bash/Linux/macOS):
 *   echo '{"apiData": {...}, "benchmark": {...}, "difficulty": "novice"}' | bun run cli/kovaaks-rank-cli.ts
 * 
 * Usage (PowerShell/Windows):
 *   '{"apiData": {...}, "benchmark": {...}, "difficulty": "novice"}' | bun run cli/kovaaks-rank-cli.ts
 * 
 * Or compile to standalone executable:
 *   bun build cli/kovaaks-rank-cli.ts --compile --outfile output/kovaaks-rank-cli
 *   
 * On Windows:
 *   bun build cli/kovaaks-rank-cli.ts --compile --outfile output/kovaaks-rank-cli.exe
 */

import { calculateOverallRank } from '../src/rankCalculations';
import type { BenchmarkApiData, Benchmark } from '../src/types/benchmarks';

interface CliInput {
  apiData: BenchmarkApiData;
  benchmark: Benchmark;
  difficulty: string;
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

import { readFileSync } from 'fs';

async function main() {
  try {
    let input;
    try {
      input = readFileSync(0, 'utf-8');
    } catch (e) {
      console.error("DEBUG: Error reading stdin:", e);
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

    if (!parsed.apiData) {
      throw new Error('Missing required field: apiData');
    }
    if (!parsed.benchmark) {
      throw new Error('Missing required field: benchmark');
    }
    if (!parsed.difficulty) {
      throw new Error('Missing required field: difficulty');
    }

    // Calculate rank
    const result = calculateOverallRank(
      parsed.apiData,
      parsed.benchmark,
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
