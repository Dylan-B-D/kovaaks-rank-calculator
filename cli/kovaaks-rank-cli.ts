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
import { calculatePreciseRankFromScore, convertApiScore } from '../src/rankUtils';
import type { BenchmarkApiData, Benchmark } from '../src/types/benchmarks';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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

  // Optional configuration for local stats scanning and filtering
  config?: {
    statsDir: string;
    sensitivityLimitCm?: number;  // Optional: sensitivity threshold
    sensitivityAboveLimit?: boolean;  // Optional: true for > limit, false for <= limit
    startDate?: string;  // Optional: ISO date (YYYY-MM-DD) - only scores on or after
    endDate?: string;  // Optional: ISO date (YYYY-MM-DD) - only scores on or before
  };
  // Optional: Return only the API data without calculating rank
  fetchOnly?: boolean;
  
  // Optional: Batch mode - calculate rank for multiple dates
  // Scans stats once and calculates rank for each date
  batchDates?: string[];  // Array of ISO dates (YYYY-MM-DD)

  // Optional: Batch overrides mode - calculate rank for multiple sets of overrides
  // Used when overrides are pre-calculated (e.g. by Python script)
  batchOverrides?: Array<{
    date: string;
    scoreOverrides: number[];
  }>;

  // Optional: Rank history mode - automatically scan stats and calculate rank history
  // This is the simplified mode that does everything in one call
  rankHistory?: boolean;
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

function normalizeDate(dateStr: string): string | null {
  // Normalize date string to YYYY-MM-DD format
  // Accepts: YYYY-M-D, YYYY-MM-D, YYYY-M-DD, YYYY-MM-DD
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    
    const year = parts[0].padStart(4, '0');
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    return null;
  }
}

function parseStatsFile(filePath: string): { name: string, sens: number, score: number, date: string } | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    const nameMatch = content.match(/Scenario:,(.+)/);
    const sensMatch = content.match(/Horiz Sens:,\s*([\d.]+)/);
    const scoreMatch = content.match(/Score:,\s*([\d.]+)/);

    if (!nameMatch || !sensMatch || !scoreMatch) return null;

    // Extract date from filename
    // KovaaK's format: "Scenario Name - Challenge - 2024.01.15-12.34.56 Stats.csv"
    const filename = filePath.split(/[/\\]/).pop() || '';
    const dateMatch = filename.match(/(\d{4})\.(\d{2})\.(\d{2})-/);
    let dateStr = '';
    if (dateMatch) {
      // Convert to ISO format YYYY-MM-DD
      dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    return {
      name: nameMatch[1].trim(),
      sens: parseFloat(sensMatch[1]),
      score: parseFloat(scoreMatch[1]),
      date: dateStr
    };
  } catch (e) {
    return null;
  }
}

interface ParsedStat {
  scenarioName: string;
  score: number;
  date: string;
  sensitivity: number;
}

/**
 * Parse all stats files and return structured data with dates
 */
function parseAllStatsWithDates(
  statsDir: string,
  targetScenarios: Set<string>,
  config?: NonNullable<CliInput['config']>
): ParsedStat[] {
  const results: ParsedStat[] = [];
  
  try {
    const files = readdirSync(statsDir);
    
    for (const file of files) {
      if (!file.endsWith(' Stats.csv')) continue;
      
      const fullPath = join(statsDir, file);
      const data = parseStatsFile(fullPath);
      
      if (!data) continue;
      if (!targetScenarios.has(data.name)) continue;

      // Check sensitivity constraints if provided
      if (config?.sensitivityLimitCm !== undefined && config?.sensitivityAboveLimit !== undefined) {
        const limit = config.sensitivityLimitCm;
        const isAbove = config.sensitivityAboveLimit;
        
        if (isAbove) {
          if (data.sens <= limit) continue;
        } else {
          if (data.sens > limit) continue;
        }
      }

      // Check date constraints if provided
      if (config?.startDate && data.date) {
        const normalizedStart = normalizeDate(config.startDate);
        if (normalizedStart && data.date < normalizedStart) continue;
      }
      if (config?.endDate && data.date) {
        const normalizedEnd = normalizeDate(config.endDate);
        if (normalizedEnd && data.date > normalizedEnd) continue;
      }

      results.push({
        scenarioName: data.name,
        score: data.score,
        date: data.date,
        sensitivity: data.sens
      });
    }
  } catch (e) {
    throw new Error(`Error scanning stats directory: ${(e as Error).message}`);
  }
  
  return results;
}

/**
 * Group parsed stats by date and scenario, keeping max score per scenario up to each date
 */
function buildScoresByDate(
  parsedStats: ParsedStat[],
  scenarioNames: string[]
): Map<string, number[]> {
  // First, group all scores by scenario name
  const scoresByScenario = new Map<string, Array<{ date: string; score: number }>>();
  
  for (const stat of parsedStats) {
    if (!scoresByScenario.has(stat.scenarioName)) {
      scoresByScenario.set(stat.scenarioName, []);
    }
    scoresByScenario.get(stat.scenarioName)!.push({
      date: stat.date,
      score: stat.score
    });
  }
  
  // Get all unique dates and sort them
  const uniqueDates = Array.from(new Set(parsedStats.map(s => s.date))).sort();
  
  // For each date, build the score override array
  const scoresByDate = new Map<string, number[]>();
  
  for (const date of uniqueDates) {
    const scoreOverrides: number[] = [];
    
    for (const scenarioName of scenarioNames) {
      const scenarioScores = scoresByScenario.get(scenarioName) || [];
      
      // Get all scores up to and including this date
      const validScores = scenarioScores
        .filter(s => s.date <= date)
        .map(s => s.score);
      
      // Use max score, or 0 if no scores
      scoreOverrides.push(validScores.length > 0 ? Math.max(...validScores) : 0);
    }
    
    scoresByDate.set(date, scoreOverrides);
  }
  
  return scoresByDate;
}

/**
 * Get ordered scenario names from API data
 */
function getOrderedScenarioNames(apiData: BenchmarkApiData): string[] {
  const names: string[] = [];
  
  if (!apiData.categories) return names;
  
  for (const category of Object.values(apiData.categories)) {
    if (category.scenarios) {
      for (const name of Object.keys(category.scenarios)) {
        names.push(name);
      }
    }
  }
  
  return names;
}

function applyStatsOverrides(apiData: BenchmarkApiData, config: NonNullable<CliInput['config']>) {

  if (!apiData.categories) return;

  // Collect target scenarios from apiData
  const targetScenarios = new Set<string>();
  for (const category of Object.values(apiData.categories)) {
    if (category.scenarios) {
      for (const name of Object.keys(category.scenarios)) {
        targetScenarios.add(name);
      }
    }
  }

  if (targetScenarios.size === 0) return;

  // Scan stats directory
  const bestScores = new Map<string, number>();
  
  try {
    const files = readdirSync(config.statsDir);
    
    for (const file of files) {
      if (!file.endsWith(' Stats.csv')) continue;
      
      const fullPath = join(config.statsDir, file);
      const data = parseStatsFile(fullPath);
      
      if (!data) continue;
      if (!targetScenarios.has(data.name)) continue;

      // Check sensitivity constraints if provided
      if (config.sensitivityLimitCm !== undefined && config.sensitivityAboveLimit !== undefined) {
        const limit = config.sensitivityLimitCm;
        const isAbove = config.sensitivityAboveLimit;
        
        if (isAbove) {
          if (data.sens <= limit) continue;
        } else {
          if (data.sens > limit) continue;
        }
      }

      // Check date constraints if provided
      // Normalize user input dates to YYYY-MM-DD format for comparison
      if (config.startDate && data.date) {
        const normalizedStart = normalizeDate(config.startDate);
        if (normalizedStart && data.date < normalizedStart) continue;
      }
      if (config.endDate && data.date) {
        const normalizedEnd = normalizeDate(config.endDate);
        if (normalizedEnd && data.date > normalizedEnd) continue;
      }

      const currentBest = bestScores.get(data.name) || 0;
      if (data.score > currentBest) {
        bestScores.set(data.name, data.score);
      }
    }
  } catch (e) {
    throw new Error(`Error scanning stats directory: ${(e as Error).message}`);
  }

  // Apply scores to apiData and recalculate scenario_rank
  // When using config, we override ALL scenarios:
  // - If a matching score was found: use it and recalculate rank
  // - If no matching score was found: set to 0 and mark as unranked
  for (const category of Object.values(apiData.categories)) {
    if (!category.scenarios) continue;
    for (const [name, scenarioData] of Object.entries(category.scenarios)) {
      const bestScore = bestScores.get(name);
      if (bestScore !== undefined && bestScore > 0) {
        // Convert float score to int score
        const newScore = Math.round(bestScore * 100);
        scenarioData.score = newScore;
        
        // Recalculate scenario_rank based on new score
        if (scenarioData.rank_maxes && scenarioData.rank_maxes.length > 0) {
          const convertedScore = convertApiScore(newScore);
          const rankInfo = calculatePreciseRankFromScore(convertedScore, scenarioData.rank_maxes);
          scenarioData.scenario_rank = rankInfo.baseRank;
        }
      } else {
        // No matching score found - set to 0 and mark as unranked
        scenarioData.score = 0;
        scenarioData.scenario_rank = 0;
      }
    }
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
          const newScore = Math.round(override * 100);
          scenarioData.score = newScore;
          
          // Recalculate scenario_rank based on new score
          if (scenarioData.rank_maxes && scenarioData.rank_maxes.length > 0) {
            const convertedScore = convertApiScore(newScore);
            const rankInfo = calculatePreciseRankFromScore(convertedScore, scenarioData.rank_maxes);
            scenarioData.scenario_rank = rankInfo.baseRank;
          } else {
            // No rank_maxes available, mark as unranked
            scenarioData.scenario_rank = 0;
          }
        }
      }
      index++;
    }
  }
}

async function main() {
  const perfStart = performance.now();
  try {
    let input;
    try {
      const readStart = performance.now();
      input = readFileSync(0, 'utf-8');
      console.error(`[PERF] Read stdin: ${(performance.now() - readStart).toFixed(2)}ms`);
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

    // If fetchOnly is requested, return the API data directly
    if (parsed.fetchOnly) {
      console.log(JSON.stringify({ success: true, data: apiData }));
      process.exit(0);
    }

    // Rank History Mode: Automatically scan stats and calculate rank for each date
    if (parsed.rankHistory) {
      if (!parsed.config || !parsed.config.statsDir) {
        throw new Error('Rank history mode requires config.statsDir to be set');
      }

      console.error('[RANK HISTORY] Starting rank history calculation...');
      const historyStart = performance.now();

      // Get scenario names from API data
      const scenarioNames = getOrderedScenarioNames(apiData);
      const targetScenarios = new Set(scenarioNames);
      
      console.error(`[RANK HISTORY] Found ${scenarioNames.length} scenarios in benchmark`);

      // Parse all stats files
      const parseStart = performance.now();
      const parsedStats = parseAllStatsWithDates(
        parsed.config.statsDir,
        targetScenarios,
        parsed.config
      );
      console.error(`[RANK HISTORY] Parsed ${parsedStats.length} stats files in ${(performance.now() - parseStart).toFixed(2)}ms`);

      if (parsedStats.length === 0) {
        console.log(JSON.stringify({
          success: true,
          history: [],
          metadata: {
            totalDates: 0,
            totalScores: 0,
            scenarios: scenarioNames
          }
        }));
        process.exit(0);
      }

      // Build scores by date
      const groupStart = performance.now();
      const scoresByDate = buildScoresByDate(parsedStats, scenarioNames);
      const dates = Array.from(scoresByDate.keys()).sort();
      console.error(`[RANK HISTORY] Grouped into ${dates.length} unique dates in ${(performance.now() - groupStart).toFixed(2)}ms`);

      // Calculate rank for each date
      const calcStart = performance.now();
      const history = [];
      
      for (const date of dates) {
        const scoreOverrides = scoresByDate.get(date)!;
        
        // Create a copy of apiData for this date
        const apiDataCopy = JSON.parse(JSON.stringify(apiData));
        
        // Apply score overrides
        applyScoreOverrides(apiDataCopy, scoreOverrides);
        
        // Calculate rank
        const result = calculateOverallRank(
          apiDataCopy,
          benchmark,
          parsed.difficulty
        );
        
        history.push({
          date,
          rank: result.rank,
          rankName: result.rankName,
          energy: result.details?.harmonicMean,
          progress: result.details?.progressToNextRank,
          details: result.details
        });
      }
      
      console.error(`[RANK HISTORY] Calculated ranks for ${dates.length} dates in ${(performance.now() - calcStart).toFixed(2)}ms`);
      console.error(`[RANK HISTORY] Total time: ${(performance.now() - historyStart).toFixed(2)}ms`);

      const output = {
        success: true,
        history,
        metadata: {
          totalDates: dates.length,
          totalScores: parsedStats.length,
          scenarios: scenarioNames
        }
      };
      
      console.log(JSON.stringify(output));
      process.exit(0);
    }

    // Batch mode: Calculate rank for multiple dates
    if (parsed.batchDates && Array.isArray(parsed.batchDates) && parsed.batchDates.length > 0) {
      if (!parsed.config || !parsed.config.statsDir) {
        throw new Error('Batch mode requires config.statsDir to be set');
      }
      
      const results = [];
      
      for (const date of parsed.batchDates) {
        // Create a copy of apiData for this date
        const apiDataCopy = JSON.parse(JSON.stringify(apiData));
        
        // Apply stats overrides with endDate filter
        const configWithDate = { ...parsed.config, endDate: date };
        applyStatsOverrides(apiDataCopy, configWithDate);
        
        // Calculate rank
        const result = calculateOverallRank(
          apiDataCopy,
          benchmark,
          parsed.difficulty
        );
        
        results.push({
          date,
          ...result
        });
      }
      
      const output = {
        success: true,
        results
      };
      
      console.log(JSON.stringify(output));
      process.exit(0);
    }

    // Batch Overrides Mode: Calculate rank for multiple sets of overrides
    if (parsed.batchOverrides && Array.isArray(parsed.batchOverrides) && parsed.batchOverrides.length > 0) {
        const results = [];
        
        for (const item of parsed.batchOverrides) {
            if (!item.scoreOverrides) continue;

            // Create a copy of apiData for this item
            const apiDataCopy = JSON.parse(JSON.stringify(apiData));
            
            // Apply score overrides
            applyScoreOverrides(apiDataCopy, item.scoreOverrides);
            
            // Calculate rank
            const result = calculateOverallRank(
                apiDataCopy,
                benchmark,
                parsed.difficulty
            );
            
            results.push({
                date: item.date,
                ...result
            });
        }
        
        const output = {
            success: true,
            results
        };
        
        console.log(JSON.stringify(output));
        process.exit(0);
    }

    // Apply stats overrides if provided
    if (parsed.config) {
      applyStatsOverrides(apiData, parsed.config);
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
