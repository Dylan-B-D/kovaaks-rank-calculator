# Rank Calculations

This directory contains the core TypeScript logic for the KovaaKs Rank Calculator.

This is only in Typescript because https://evxl.app is a web app, and this code was originally written for that. Ideally this would be written in something else, but re-writing it could introduce bugs, so it's left as is.

## Overview

The main rank calculation logic. Contains implementations for all benchmark-specific rank calculation methods.

**Key Function:**
- `calculateOverallRank()` - Main entry point that calculates rank for any benchmark

**How it works:**
1. Receives three data inputs: 
    - KovaaKs API data: which contains scenario names, player scores, and benchmark score thresholds
    - Benchmark JSON data: which contains the structure of the benchmark, as in the categories and subcategories
    - Difficulty: Specifies which difficulty to calculate a rank for
2. Calculates the "complete rank" (requires all scenarios at a rank)
3. Determines which specialized rank calculator to use based on which "rankCalculation" is specified in the benchmark JSON
4. Runs the specialized calculator to get an "overall rank"
5. Returns the higher of complete rank or overall rank, along with additional details (energy, progress, etc.)

**Specialized Calculators:**

Each benchmark has its own rank calculation method with unique rules:

- **Energy-based systems** (Voltaic etc.)
  - Convert scenario scores to "energy" values using thresholds
  - Aggregate energies (harmonic mean, average, etc.)
  - Map total energy to rank

- **Count-based systems**
  - Count how many scenarios reach each rank
  - Require N scenarios at a rank to achieve it

- **Point-based systems**
  - Award points based on scenario ranks
  - Sum points and map to rank

## Adding a New Benchmark

To add a new benchmark with custom rank calculation:

1. Add the benchmark definition to `bindings/data/benchmarks.json`
    - This can be tested on https://evxl.app/benchmark-builder
2. Set `rankCalculation` to a unique identifier (e.g., `"my-benchmark"`)
3. Implement the calculator function in `rankCalculations.ts`:
   ```typescript
   function calculateMyBenchmarkRank(
     apiData: BenchmarkApiData,
     difficultyConfig: Difficulty
   ): RankCalculationResult {
     // Your calculation logic here
     return {
       rank: calculatedRank,
       details: {
         // Any extra info (energy, progress, etc.)
       }
     };
   }
   ```
4. Register it in the `rankCalculators` object in `calculateOverallRank()`