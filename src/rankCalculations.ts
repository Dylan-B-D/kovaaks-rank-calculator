import type { Benchmark, Difficulty, BenchmarkApiData, RankCalculationResult } from './types/benchmarks';
import { calculateRankTemplate, getSubcategoryHighestRanks, processScenarios, getRankNumber, getRankName, calculateCompleteRank, convertApiScore, calculatePreciseRankFromScore, getTopNScoresFromCategory, interpolateValue, calculateSpecializedHarmonicRank, calculateHarmonicMean, calculateCumulativeRank, calculateHarmonicMeanRank, getOrderedScenarioNames, getScenarioData, calculateTotalRanks, getDifficultyThresholdSlice, calculateAltEnergyRankTemplate, calculateProgressToNextRank } from './rankUtils';

/**
 * Calculates overall rank for a benchmark
 */
export function calculateOverallRank(
    apiData: BenchmarkApiData,
    benchmark: Benchmark,
    difficultyName: string
): {
    rank: number;
    rankName: string;
    useComplete: boolean;
    details?: any;
    fallbackUsed?: boolean;
} {
    const difficultyConfig = benchmark.difficulties.find(
        d => d.difficultyName.toLowerCase() === difficultyName.toLowerCase()
    );

    if (!difficultyConfig || !apiData.categories || !apiData.ranks) {
        return { rank: 0, rankName: "No data", useComplete: true, fallbackUsed: false };
    }

    const completeRank = calculateCompleteRank(apiData, difficultyConfig);
    const completeRankNumber = getRankNumber(completeRank, apiData.ranks);

    const rankCalculators: Record<string, (apiData: BenchmarkApiData, config: Difficulty) => RankCalculationResult> = {
        'basic': calculateBasicRank,
        'ra-s4': calculateRaS4Rank,
        'vt-energy': calculateVtEnergyRank,
        'cb-s1': calculateCbS1Rank,
        'aplus-s1': calculateAplusS1Rank,
        'ca-s1': calculateCaS1Rank,
        'tpt': calculateTptRank,
        'ssb2': calculateSsb2Rank,
        'tsk': calculateTskRank,
        'sa-s2': calculateUnofficialSas2Rank,
        'asb': calculateAsbRank,
        'aplus-alt': calculateAplusAltRank,
        'mira': calculateMiraRank,
        'xyz': calculateXYZRank,
        'mh': calculateM0narcSHizkuRank,
        'val-energy': calculateValEnergyRank,
        'e1se': calculateE1seRank,
        'aoi': calculateAoiRank,
        'hewchy': calculateHewchyRank,
        'avasive': calculateAvasiveRank,
        'xyz2': calculateXYZ2Rank,
        'dark-rafal': calculateDarkRafalRank,
        'MIYU': calculateMiyuRank,
        'complete': calculateCompleteOnlyRank,
        'dm': calculateDeadmanStaticRank,
        'dojo': calculateDojoRank,
        'mira-apex': calculateMiraApexRank
    };

    const calculator = rankCalculators[benchmark.rankCalculation] || (() => ({
        rank: completeRankNumber,
        details: {},
        fallbackUsed: true
    }));

    // cursed code to deal with generic benchmarks
    const { rank: overallRank, details, fallbackUsed = false } =
    benchmark.rankCalculation === 'generic-energy'
        ? calculateGenericEnergyRank(apiData, difficultyConfig, benchmark.difficulties)
        : benchmark.rankCalculation === 'generic-energy-uncapped'
            ? calculateGenericEnergyUncappedRank(apiData, difficultyConfig, benchmark.difficulties)
            : benchmark.rankCalculation === 'ra-s5'
                ? calculateRaS5Rank(apiData, difficultyConfig, benchmark.difficulties)
                : calculator(apiData, difficultyConfig);
    const useOverall = overallRank > completeRankNumber;
    const finalRank = useOverall ? overallRank : completeRankNumber;
    const finalRankName = useOverall ? getRankName(overallRank, apiData.ranks) : completeRank;

    return { rank: finalRank, rankName: finalRankName, useComplete: !useOverall, details, fallbackUsed };
}

/**
 * Calculates Mira Apex rank
 * - +10 energy per rank
 * - No fake ranks below (0 energy if below first rank)
 * - No over energy (capped at highest rank energy)
 * - Uses highest energy per subcategory
 */
function calculateMiraApexRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    // Determine number of ranks for this difficulty
    const maxRanks = Object.keys(difficultyConfig.rankColors || {}).length;
    if (maxRanks === 0) return { rank: 0, details: {} };

    // Generate thresholds: 10 energy per rank
    const rankThresholds: number[] = [];
    for (let i = 0; i < maxRanks; i++) {
        rankThresholds.push((i + 1) * 10);
    }

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    let scenarioIndex = 0;
    const subcategoryEnergies: number[] = [];
    const energyDetails: Record<string, Record<string, number>> = {};
    const subcategoryEnergiesFlat: { subcategoryName: string; energy: number }[] = [];

    // Process each category and subcategory to find highest energy per subcategory
    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        energyDetails[categoryName] = {};

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            const subcategoryName = subcategoryConfig.subcategoryName;
            let maxEnergy = 0;

            // Check all scenarios in this subcategory
            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++, scenarioIndex++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);
                const score = convertApiScore(scenarioData.score);

                let energy = 0;
                if (score > 0 && scenarioData.rank_maxes && scenarioData.rank_maxes.length > 0) {
                    const rankInfo = calculatePreciseRankFromScore(score, scenarioData.rank_maxes);

                    if (rankInfo.baseRank === 0) {
                        // Below first rank: Calculate proportional energy to first threshold (not 0)
                        const firstRankThreshold = scenarioData.rank_maxes[0];
                        if (firstRankThreshold > 0) {
                            const proportion = Math.min(score / firstRankThreshold, 1);
                            energy = proportion * rankThresholds[0]; // Proportional energy to first rank (10)
                        }
                    } else if (rankInfo.isMaxed && rankInfo.baseRank === scenarioData.rank_maxes.length) {
                        // At or above max rank: cap at highest threshold
                        energy = rankThresholds[rankThresholds.length - 1];
                    } else {
                        // Between ranks: interpolate
                        const lower = rankThresholds[rankInfo.baseRank - 1] || 0;
                        const upper = rankThresholds[rankInfo.baseRank] || rankThresholds[rankThresholds.length - 1];
                        energy = lower + rankInfo.progressToNext * (upper - lower);
                    }

                    energy = Math.max(0, Math.trunc(energy));
                }

                // Track the highest energy in this subcategory
                maxEnergy = Math.max(maxEnergy, energy);
            }

            // Store the highest energy for this subcategory
            energyDetails[categoryName][subcategoryName] = maxEnergy;
            subcategoryEnergies.push(maxEnergy);
            subcategoryEnergiesFlat.push({ subcategoryName, energy: maxEnergy });
        });
    });

    const totalSubcategories = subcategoryEnergies.length;
    if (totalSubcategories === 0) {
        return { rank: 0, details: {} };
    }

    // Calculate harmonic mean of subcategory energies
    let harmonicMean = 0;
    const validEnergies = subcategoryEnergies.filter(e => e > 0);
    
    if (validEnergies.length > 0) {
        if (validEnergies.length === totalSubcategories) {
            // All subcategories have energy - use harmonic mean
            const harmonicSum = validEnergies.reduce((sum, e) => sum + 1 / e, 0);
            harmonicMean = totalSubcategories / harmonicSum;
        } else {
            // Some subcategories missing - use weighted harmonic mean
            // Treat missing subcategories as having very low energy (0.1) to penalize but not zero out
            const paddedEnergies = [...subcategoryEnergies];
            for (let i = 0; i < paddedEnergies.length; i++) {
                if (paddedEnergies[i] === 0) {
                    paddedEnergies[i] = 0.1; // Very small energy for missing subcategories
                }
            }
            const harmonicSum = paddedEnergies.reduce((sum, e) => sum + 1 / e, 0);
            harmonicMean = totalSubcategories / harmonicSum;
        }
    }
    
    harmonicMean = Math.round(harmonicMean * 10) / 10;

    // Determine rank based on harmonic mean
    let rank = 0;
    for (let i = 0; i < rankThresholds.length; i++) {
        if (harmonicMean >= rankThresholds[i]) {
            rank = i + 1;
        } else {
            break;
        }
    }

    const progressToNextRank = calculateProgressToNextRank(harmonicMean, rankThresholds, rank);

    return {
        rank,
        details: {
            subcategoryEnergies: energyDetails,
            subcategoryEnergiesFlat,
            harmonicMean,
            thresholds: rankThresholds,
            progressToNextRank
        }
    };
}

/**
 * Calculates Complete rank (only uses complete rank system)
 */
function calculateCompleteOnlyRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories || !apiData.ranks) {
        return { rank: 0, details: { completeRank: "No data" } };
    }

    const completeRank = calculateCompleteRank(apiData, difficultyConfig);
    const rank = getRankNumber(completeRank, apiData.ranks);
    
    return {
        rank,
        details: {
            completeRank,
            progressToNextRank: rank > 0 ? 1 : 0
        }
    };
}

/**
 * Calculates Dojo rank
 * Requires 4 scenarios at a rank to achieve that rank
 * Scores can be in any category or subcategory
 */
function calculateDojoRank(apiData: BenchmarkApiData, _difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    // Collect all scenario ranks
    const scenarioRanks: number[] = [];
    Object.values(apiData.categories).forEach(category => {
        Object.values(category.scenarios).forEach(scenario => {
            if (scenario.scenario_rank > 0) {
                scenarioRanks.push(scenario.scenario_rank);
            }
        });
    });

    if (scenarioRanks.length === 0) {
        return { rank: 0, details: { rankCounts: {}, progressToNextRank: 0 } };
    }

    // Count occurrences of each rank
    const rankCounts: Record<number, number> = {};
    scenarioRanks.forEach(rank => {
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });

    // Find the highest rank where we have at least 4 scenarios at that rank or higher (cumulative)
    let finalRank = 0;
    const sortedRanks = Object.keys(rankCounts)
        .map(Number)
        .sort((a, b) => b - a); // Sort descending

    for (const rank of sortedRanks) {
        // Count how many scenarios are at this rank or higher
        const cumulativeCount = sortedRanks
            .filter(r => r >= rank)
            .reduce((sum, r) => sum + rankCounts[r], 0);
        
        if (cumulativeCount >= 4) {
            finalRank = rank;
            break;
        }
    }

    // Calculate progress to next rank
    let progressToNextRank = 0;
    if (finalRank > 0) {
        const nextRank = finalRank + 1;
        // Count scenarios at next rank or higher
        const countAtNextOrHigher = sortedRanks
            .filter(r => r >= nextRank)
            .reduce((sum, r) => sum + rankCounts[r], 0);
        progressToNextRank = Math.min(countAtNextOrHigher / 4, 1);
    }

    return {
        rank: finalRank,
        details: {
            rankCounts,
            totalScenarios: scenarioRanks.length,
            progressToNextRank
        }
    };
}

/**
 * Calculates Deadman Static rank
 * - Energy thresholds start at 100 (higher for Boss ranks) and increase by 100 per rank
 * - Highest real rank only increases by 10 energy from previous
 * - No fake rank below
 * - Infinite uncapped fake ranks above, each adding +10 energy
 * - Uses highest energy scenario per subcategory
 */
function calculateDeadmanStaticRank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty
): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    // Determine number of ranks for this difficulty
    const maxRanks = Object.keys(difficultyConfig.rankColors || {}).length;
    if (maxRanks === 0) return { rank: 0, details: {} };

    // Check difficulty type and set starting energy
    const difficultyName = difficultyConfig.difficultyName.toLowerCase();
    let startEnergy = 100; // default
    
    if (difficultyName === "boss" && maxRanks === 8) {
        startEnergy = 500;
    } else if (difficultyName === "boss+") {
        startEnergy = 500;
    } else if (difficultyName === "boss++") {
        startEnergy = 900;
    }

    // Generate thresholds
    const rankThresholds: number[] = [];
    for (let i = 0; i < maxRanks; i++) {
        if (i === 0) {
            rankThresholds.push(startEnergy);
        } else if (i === maxRanks - 1) {
            // Highest rank: only +10 from previous
            rankThresholds.push(rankThresholds[i - 1] + 10);
        } else {
            // All other ranks: +100 from previous
            rankThresholds.push(rankThresholds[i - 1] + 100);
        }
    }

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    let scenarioIndex = 0;

    const subcategoryEnergies: number[] = [];
    const energyDetails: Record<string, Record<string, number>> = {};
    const subcategoryEnergiesFlat: { subcategoryName: string; energy: number }[] = [];

    // Process each category and subcategory
    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        energyDetails[categoryName] = {};

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            const subcategoryName = subcategoryConfig.subcategoryName;
            let maxEnergy = 0;

            // Check all scenarios in this subcategory
            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++, scenarioIndex++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);
                const score = convertApiScore(scenarioData.score);

                let energy = 0;
                if (score > 0) {
                    const rankInfo = calculatePreciseRankFromScore(score, scenarioData.rank_maxes);

                    if (rankInfo.baseRank === 0) {
                        // Below first rank: no fake rank below, so 0 energy
                        energy = 0;
                    } else if (rankInfo.isMaxed && rankInfo.baseRank === scenarioData.rank_maxes.length) {
                        // Above max rank: uncapped fake ranks with +10 per rank
                        const lastThreshold = rankThresholds[rankThresholds.length - 1];
                        const highestRankMaxScore = scenarioData.rank_maxes[scenarioData.rank_maxes.length - 1];
                        const secondHighestRankMaxScore = scenarioData.rank_maxes.length > 1 
                            ? scenarioData.rank_maxes[scenarioData.rank_maxes.length - 2] 
                            : 0;
                        const rankDiff = highestRankMaxScore - secondHighestRankMaxScore || 1;
                        
                        // Calculate how many fake ranks above max
                        const additionalRanks = (score - highestRankMaxScore) / rankDiff;
                        
                        // Each fake rank adds 10 energy
                        energy = lastThreshold + (additionalRanks * 10);
                    } else {
                        // Between ranks: interpolate
                        const lower = rankThresholds[rankInfo.baseRank - 1] || 0;
                        const upper = rankThresholds[rankInfo.baseRank];
                        energy = lower + rankInfo.progressToNext * (upper - lower);
                    }

                    energy = Math.max(0, Math.trunc(energy));
                }

                // Track the highest energy in this subcategory
                maxEnergy = Math.max(maxEnergy, energy);
            }

            // Store the highest energy for this subcategory
            energyDetails[categoryName][subcategoryName] = maxEnergy;
            subcategoryEnergies.push(maxEnergy);
            subcategoryEnergiesFlat.push({ subcategoryName, energy: maxEnergy });
        });
    });

    // Calculate harmonic mean of subcategory energies
    const expectedSubcategoryCount = difficultyConfig.categories.reduce(
        (sum, category) => sum + category.subcategories.length,
        0
    );

    let harmonicMean = 0;
    const validEnergies = subcategoryEnergies.filter(e => e > 0);
    
    if (validEnergies.length === expectedSubcategoryCount && subcategoryEnergies.length === expectedSubcategoryCount) {
        const harmonicSum = validEnergies.reduce((sum, e) => sum + 1 / e, 0);
        harmonicMean = expectedSubcategoryCount / harmonicSum;
    }
    
    harmonicMean = Math.round(harmonicMean * 10) / 10;

    // Determine rank based on harmonic mean
    let rank = 0;
    for (let i = 0; i < rankThresholds.length; i++) {
        if (harmonicMean >= rankThresholds[i]) {
            rank = i + 1;
        } else {
            break;
        }
    }

    const progressToNextRank = calculateProgressToNextRank(harmonicMean, rankThresholds, rank);

    return {
        rank,
        details: {
            subcategoryEnergies: energyDetails,
            subcategoryEnergiesFlat,
            harmonicMean,
            thresholds: rankThresholds,
            progressToNextRank
        }
    };
}

/**
 * Calculates rank for rA-s5 (Revosect Season 5)
 * Energy-based system with:
 * - Scenario energies calculated using energy thresholds that increase by 100 per rank
 * - Subcategory energy = average of top 2 scenario energies 
 * - Category energy = average of all subcategory energies in category (for display only)
 * - Overall energy = harmonic mean of all subcategory energies
 */
export function calculateRaS5Rank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    allDifficulties: Difficulty[]
): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    // Calculate thresholds similar to generic energy
    const totalRanks = calculateTotalRanks(allDifficulties);
    const globalThresholds = Array.from({ length: totalRanks + 1 }, (_, i) => (i + 1) * 100);
    const energyThresholds = getDifficultyThresholdSlice(globalThresholds, difficultyConfig, allDifficulties);
    // Remove fake upper bound - no fake ranks above or below
    const rankThresholds = energyThresholds.slice(0, -1);

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    
    // Calculate scenario energies
    const scenarioEnergies: Record<string, number> = {};
    const subcategoryEnergies: Record<string, number> = {};
    const categoryEnergies: Record<string, number> = {};
    let scenarioIndex = 0;

    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        const subcatKeys: string[] = [];

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            const subcategoryName = subcategoryConfig.subcategoryName;
            const isReactive = subcategoryName.toLowerCase().includes("reactive");
            const subcategoryScenarioEnergies: number[] = [];

            // Collect energies for this subcategory
            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++, scenarioIndex++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);
                const score = convertApiScore(scenarioData.score);
                
                if (score === 0) {
                    scenarioEnergies[scenarioName] = 0;
                    subcategoryScenarioEnergies.push(0);
                    continue;
                }

                const rankInfo = calculatePreciseRankFromScore(score, scenarioData.rank_maxes);
                let energy = 0;

                if (rankInfo.baseRank === 0) {
                    // Below first rank
                    const firstThreshold = scenarioData.rank_maxes[0] || 1;
                    let subtract = 0;
                    let roundDecimals = 0;
                    if (isReactive) {
                        subtract = difficultyConfig.difficultyName.toLowerCase() === 'entry' ? 800 : 830;
                        roundDecimals = 2;
                    }
                    const adjustedScore = score - subtract;
                    const adjustedFirst = firstThreshold - subtract;
                    let percentage = 0;
                    if (adjustedFirst > 0) {
                        const frac = Math.max(0, adjustedScore / adjustedFirst);
                        const perc = frac * 100;
                        percentage = Math.round(perc * Math.pow(10, roundDecimals)) / Math.pow(10, roundDecimals);
                    }
                    energy = rankThresholds[0] * (percentage / 100);
                } else if (rankInfo.isMaxed && rankInfo.baseRank === scenarioData.rank_maxes.length) {
                    // At max rank - cap at last threshold
                    energy = rankThresholds[rankThresholds.length - 1];
                } else {
                    // Between ranks - round the percentage to 0 decimals, then add to lower threshold
                    const lower = rankThresholds[rankInfo.baseRank - 1] || 0;
                    const upper = rankThresholds[rankInfo.baseRank] || rankThresholds[rankThresholds.length - 1];
                    const percentage = Math.round(rankInfo.progressToNext * 100);
                    energy = lower + (upper - lower) * (percentage / 100);
                }

                energy = Math.max(0, Math.round(energy * 100) / 100); // Round to 2 decimals for precision
                scenarioEnergies[scenarioName] = energy;
                subcategoryScenarioEnergies.push(energy);
            }

            // Calculate subcategory energy
            let subcategoryEnergy = 0;
            if (subcategoryScenarioEnergies.length === 0) {
                subcategoryEnergy = 0;
            } else if (isReactive) {
                // Special case for reactive: average of best ground and best air
                if (subcategoryScenarioEnergies.length !== 4) {
                    subcategoryEnergy = 0; // Unexpected, but handle gracefully
                } else {
                    const groundMax = Math.max(subcategoryScenarioEnergies[0], subcategoryScenarioEnergies[1]);
                    const airMax = Math.max(subcategoryScenarioEnergies[2], subcategoryScenarioEnergies[3]);
                    subcategoryEnergy = (groundMax + airMax) / 2;
                }
            } else {
                // Average of top 2 (or top 1 / 2 if only 1)
                const sorted = subcategoryScenarioEnergies.sort((a, b) => b - a);
                if (sorted.length === 1) {
                    subcategoryEnergy = sorted[0] / 2;
                } else {
                    subcategoryEnergy = (sorted[0] + sorted[1]) / 2;
                }
            }

            subcategoryEnergy = Math.round(subcategoryEnergy);
            const subcatKey = `${categoryName}:${subcategoryName}`;
            subcategoryEnergies[subcatKey] = subcategoryEnergy;
            subcatKeys.push(subcatKey);
        });

        // Calculate category energy: mean of subcategory energies in this category
        const subcatEnergies = subcatKeys.map(key => subcategoryEnergies[key] ?? 0);
        const categoryEnergy = subcatEnergies.length > 0
            ? subcatEnergies.reduce((sum, e) => sum + e, 0) / subcatEnergies.length
            : 0;
        categoryEnergies[categoryName] = Math.round(categoryEnergy);
    });

    // Calculate overall energy as harmonic mean of subcategory energies
    const subcategoryEnergyValues = Object.values(subcategoryEnergies);
    const totalCount = subcategoryEnergyValues.length;
    let overallEnergy = 0;
    if (subcategoryEnergyValues.every(e => e > 0)) {
        const harmonicSum = subcategoryEnergyValues.reduce((sum, e) => sum + 1 / e, 0);
        overallEnergy = totalCount / harmonicSum;
    }
    overallEnergy = Math.round(overallEnergy);

    // Determine rank based on overall energy
    let rank = 0;
    for (let i = 0; i < rankThresholds.length; i++) {
        if (overallEnergy >= rankThresholds[i]) {
            rank = i + 1;
        } else {
            break;
        }
    }

    const progressToNextRank = calculateProgressToNextRank(overallEnergy, rankThresholds, rank);

    return {
        rank,
        details: {
            scenarioEnergiesOrdered: Object.values(scenarioEnergies),
            scenarioEnergies,
            subcategoryEnergies,
            categoryEnergies,
            overallEnergy,
            harmonicMean: overallEnergy,
            thresholds: rankThresholds,
            progressToNextRank
        }
    };
}


function calculateMiyuRank(
  apiData: BenchmarkApiData,
  difficultyConfig: Difficulty
): RankCalculationResult {
  if (!apiData.categories) return { rank: 0, details: {} };

  const thresholds = [16, 24, 32, 40, 48, 56, 63];
  const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);

  let totalPoints = 0;
  const scenarioPoints: Record<string, number> = {};

  scenarioNames.forEach(name => {
    const data = getScenarioData(apiData, name);
    const rank = data.scenario_rank;          // 0 = unranked
    const points = rank <= 0 ? 0 : 2 + (rank - 1); // 2 for 1st, +1 each extra
    scenarioPoints[name] = points;
    totalPoints += points;
  });

  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (totalPoints >= thresholds[i]) rank = i + 1;
    else break;
  }

  const progressToNextRank =
    rank >= thresholds.length
      ? 1
      : calculateProgressToNextRank(totalPoints, thresholds, rank);

  return {
    rank,
    details: {
      totalPoints,
      scenarioPoints,
      thresholds,
      progressToNextRank
    }
  };
}

/**
 * Calculates Dark Rafal rank (Dark Rafal Benchmarks)
 * Uses  100	200	300	400	500	600 thresholds
 * overall score is the average of all the points from each scenario, based on the thresholds.
 * so if i get halfway to the first rank thats 50 points, if i get halfway between the 1st and 2nd thats 150 points etc.
 * Only 1 difficulty, no subcategories, and energy is capped at half a rank above max
 * no fake ranks below
 * points should be per scenario with same return format as calculateM0narcSHizkuRank (which may use energy but we can return as energy for frontend purposes)
 */
function calculateDarkRafalRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const thresholds = [100, 200, 300, 400, 500, 600];
    const maxEnergy = thresholds[thresholds.length - 1] + 50;

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    const scenarioEnergies: number[] = [];

    scenarioNames.forEach(scenarioName => {
        const scenarioData = getScenarioData(apiData, scenarioName);
        const score = convertApiScore(scenarioData.score);

        let energy = 0;
        if (score > 0) {
            const rankInfo = calculatePreciseRankFromScore(score, scenarioData.rank_maxes);

            if (rankInfo.baseRank === 0) {
                const firstThreshold = scenarioData.rank_maxes[0] || 1;
                energy = (score / firstThreshold) * thresholds[0];
            } else if (rankInfo.isMaxed) {
                const lastIndex = scenarioData.rank_maxes.length - 1;
                const highestThreshold = scenarioData.rank_maxes[lastIndex];
                const secondHighest = lastIndex > 0 ? scenarioData.rank_maxes[lastIndex - 1] : 0;
                const rankDiff = highestThreshold - secondHighest || 1;
                const additionalRanks = (score - highestThreshold) / rankDiff;
                const cappedAdditional = Math.min(additionalRanks, 0.5);
                energy = thresholds[thresholds.length - 1] + cappedAdditional * 100;
            } else {
                const lower = thresholds[rankInfo.baseRank - 1] || 0;
                const upper = thresholds[rankInfo.baseRank] || maxEnergy;
                energy = lower + rankInfo.progressToNext * (upper - lower);
            }

            energy = Math.min(Math.trunc(energy), maxEnergy);
        }

        scenarioEnergies.push(energy);
    });

    const totalScenarios = scenarioNames.length;
    if (totalScenarios === 0) {
        return { rank: 0, details: {} };
    }

    const sum = scenarioEnergies.reduce((acc, val) => acc + val, 0);
    const mean = sum / totalScenarios;
    const roundedMean = Math.round(mean * 10) / 10;

    let rank = 0;
    for (let i = 0; i < thresholds.length; i++) {
        if (roundedMean >= thresholds[i]) {
            rank = i + 1;
        } else {
            break;
        }
    }

    const progressToNextRank = calculateProgressToNextRank(roundedMean, thresholds, rank);

    return {
        rank,
        details: {
            scenarioEnergiesOrdered: scenarioEnergies,
            harmonicMean: roundedMean, // Using 'harmonicMean' key for format consistency, though it's arithmetic mean
            thresholds,
            progressToNextRank
        }
    };
}
/**
 * Calculates Hewchy rank
 */
function calculateHewchyRank(apiData: BenchmarkApiData): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const scenarioRanks: number[] = [];
    Object.values(apiData.categories).forEach(category => {
        Object.values(category.scenarios).forEach(scenario => {
            scenarioRanks.push(scenario.scenario_rank);
        });
    });

    let finalRank = 0;
    const maxRank = Math.max(...scenarioRanks, 0);
    for (let rank = maxRank; rank > 0; rank--) {
        const count = scenarioRanks.filter(r => r >= rank).length;
        if (count >= 12) {
            finalRank = rank;
            break;
        }
    }

    let progressToNextRank = 0;
    if (finalRank > 0) {
        const nextRank = finalRank + 1;
        const countAtNext = scenarioRanks.filter(r => r >= nextRank).length;
        progressToNextRank = Math.min(countAtNext / 12, 1);
    }

    return {
        rank: finalRank,
        details: {
            scenarioRanks,
            progressToNextRank
        }
    };
}

/**
 * Calculates AoiAim rank
 */
function calculateAoiRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    let scenarioIndex = 0;
    const subcategoryRanks: number[][] = [];

    for (const category of difficultyConfig.categories) {
        for (const sub of category.subcategories) {
            const ranks: number[] = [];
            for (let i = 0; i < sub.scenarioCount && scenarioIndex < scenarioNames.length; i++, scenarioIndex++) {
                const scenario = getScenarioData(apiData, scenarioNames[scenarioIndex]);
                if (scenario && scenario.score > 0) ranks.push(scenario.scenario_rank);
            }
            subcategoryRanks.push(ranks);
        }
    }

    const allRanks = Array.from(new Set(subcategoryRanks.flat())).filter(r => r > 0).sort((a, b) => b - a);

    let finalRank = 0;
    for (const rank of allRanks) {
        const oneScore = subcategoryRanks.filter(ranks => ranks.filter(r => r >= rank).length >= 1).length;
        const twoScores = subcategoryRanks.filter(ranks => ranks.filter(r => r >= rank).length >= 2).length;
        if (oneScore >= 4 || twoScores >= 3) {
            finalRank = rank;
            break;
        }
    }

    let progressToNextRank = 0;
    if (finalRank > 0) {
        const maxRank = allRanks.length > 0 ? allRanks[0] : finalRank;
        if (finalRank >= maxRank) {
            progressToNextRank = 1;
        } else {
            const next = finalRank + 1;
            const oneScore = subcategoryRanks.filter(ranks => ranks.filter(r => r >= next).length >= 1).length;
            const twoScores = subcategoryRanks.filter(ranks => ranks.filter(r => r >= next).length >= 2).length;
            progressToNextRank = Math.max(Math.min(oneScore / 4, 1), Math.min(twoScores / 3, 1));
        }
    }

    return {
        rank: finalRank,
        details: {
            subcategoryRanks,
            progressToNextRank
        }
    };
}

/**
 * Calculates energy-generic rank (dynamically generated thresholds)
 */
export function calculateGenericEnergyRank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    allDifficulties: Difficulty[]
): RankCalculationResult {
    // Calculate total ranks across all difficulties
    const totalRanks = calculateTotalRanks(allDifficulties);

    // Generate global thresholds: 100 per rank + 1 extra for the fake upper bound
    const globalThresholds = Array.from({ length: totalRanks + 1 }, (_, i) => (i + 1) * 100);
    // Get slice for this difficulty
    const energyThresholds = getDifficultyThresholdSlice(globalThresholds, difficultyConfig, allDifficulties);
    // Separate rank thresholds (without fake upper) from energy thresholds (with fake upper)
    const rankThresholds = energyThresholds.slice(0, -1);
    const maxEnergy = energyThresholds[energyThresholds.length - 1];

    return calculateHarmonicMeanRank(
        apiData,
        difficultyConfig,
        rankThresholds,
        () => true,
        100,
        1,
        maxEnergy
    );
}

/**
 * Calculates energy-generic-uncapped rank
 */
export function calculateGenericEnergyUncappedRank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    allDifficulties: Difficulty[]
): RankCalculationResult {
    // calculate total ranks across all difficulties
    const totalRanks = calculateTotalRanks(allDifficulties);

    // generate global thresholds: 100 per rank + 1 extra for the fake upper bound
    const globalThresholds = Array.from({ length: totalRanks + 1 }, (_, i) => (i + 1) * 100);

    // get slice for this difficulty
    const energyThresholds = getDifficultyThresholdSlice(globalThresholds, difficultyConfig, allDifficulties);

    // use rank thresholds for actual rank calculation (no clamping)
    const rankThresholds = energyThresholds.slice(0, -1);

    return calculateHarmonicMeanRank(
        apiData,
        difficultyConfig,
        rankThresholds,
        () => true,
        100,
        9999,
        undefined
    );
}

/**
 * Calculates rank for tsk (TSK Mixed Benchmarks)
 */
function calculateTskRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const difficultyName = difficultyConfig.difficultyName.toLowerCase();

    const scenarios = Object.values(apiData.categories).flatMap(category =>
        Object.values(category.scenarios).map(scenario => {
            const actualScore = convertApiScore(scenario.score);
            const rankInfo = calculatePreciseRankFromScore(actualScore, scenario.rank_maxes);
            const maxRank = scenario.rank_maxes.length;
            const isOverMax = rankInfo.isMaxed && rankInfo.baseRank === maxRank && actualScore > scenario.rank_maxes[maxRank - 1];
            return {
                rank: scenario.scenario_rank,
                score: actualScore,
                rankMaxes: scenario.rank_maxes,
                isOverMax
            };
        })
    );

    const overMaxCount = scenarios.filter(s => s.isOverMax).length;
    const rankCounts: Record<number, number> = {};
    scenarios.forEach(s => {
        if (s.rank > 0) rankCounts[s.rank] = (rankCounts[s.rank] || 0) + 1;
    });

    const config: Record<string, { overMax?: number, maxRank?: number, needed?: number }> = {
        beginner: { needed: 4 },
        main: { needed: 8 },
        ultimate: { overMax: 8, maxRank: 10, needed: 12 },
        static: { needed: 9 },
        strafes: { needed: 7 },
        "thundah's bouncesphere": { overMax: 2, maxRank: 2, needed: 4 },
        "reactive by slapped": { overMax: 2, maxRank: 4, needed: 6 },
        "beginner classic": { needed: 5 },
        "main classic": { needed: 7 },
        "extra classic": { overMax: 3, maxRank: 3, needed: 9 },
    };

    const params = config[difficultyName];
    if (!params) {
        return calculateBasicRank(apiData, difficultyConfig);
    }

    const getCumulativeRank = (needed: number): number => {
        const ranks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
        for (const rank of ranks) {
            const cumulative = ranks.filter(r => r >= rank).reduce((sum, r) => sum + (rankCounts[r] || 0), 0);
            if (cumulative >= needed) return rank;
        }
        return 0;
    };

    const getProgressToNextRank = (currentRank: number, needed: number): number => {
        if (needed === 0) return 0;

        const ranks = Object.keys(rankCounts).map(Number);
        const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;

        // if at the highest possible rank, show 100% progress
        if (currentRank >= maxRank) return 1;

        const nextRank = currentRank + 1;
        const cumulative = ranks.filter(r => r >= nextRank && r <= maxRank).reduce((sum, r) => sum + (rankCounts[r] || 0), 0);
        const neededForNext = needed - cumulative;
        const availableAtCurrent = rankCounts[currentRank] || 0;
        return availableAtCurrent > 0 ? Math.max(0, Math.min(neededForNext / availableAtCurrent, 1)) : 0;
    };

    let finalRank = 0, achievementType = 'none', progressToNextRank = 0;

    // check for singularity (overMax scenarios)
    if (params.overMax && overMaxCount >= params.overMax) {
        finalRank = apiData.ranks ? apiData.ranks.length - 1 : 10;
        achievementType = 'singularity';
    }
    // check for max rank scenarios
    else if (params.maxRank) {
        const maxRankScenarios = scenarios.filter(s => s.rankMaxes.length > 0 && s.rank === s.rankMaxes.length);
        if (maxRankScenarios.length >= params.maxRank) {
            finalRank = Math.max(...maxRankScenarios.map(s => s.rank));
            achievementType = 'max_rank';
        } else if (params.needed) {
            finalRank = getCumulativeRank(params.needed);
            if (finalRank > 0) {
                achievementType = 'rank_threshold';
                progressToNextRank = getProgressToNextRank(finalRank, params.needed);
            }
        }
    }
    // only cumulative needed
    else if (params.needed) {
        finalRank = getCumulativeRank(params.needed);
        if (finalRank > 0) {
            achievementType = 'rank_threshold';
            progressToNextRank = getProgressToNextRank(finalRank, params.needed);
        }
    }

    return {
        rank: finalRank,
        details: {
            difficulty: difficultyName,
            rankCounts,
            overMaxCount,
            achievementType,
            totalScenarios: scenarios.length,
            progressToNextRank
        }
    };
}

/**
 * Calculates SSB2 rank (Shimmy's Static Benchmark 2)
 */
function calculateSsb2Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const thresholds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

    // Collect scenario energies and details in one pass
    const scenarioEntries = Object.values(apiData.categories).flatMap(category =>
        Object.entries(category.scenarios)
    );

    const scenarioEnergies: number[] = [];
    const energyDetails: Record<string, number> = {};

    scenarioEntries.forEach(([scenarioName, scenarioData]) => {
        const actualScore = convertApiScore(scenarioData.score);
        const rankInfo = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);
        let energy = 0;

        if (rankInfo.baseRank === 0 && actualScore === 0) {
            energy = 0;
        } else if (rankInfo.isMaxed && rankInfo.baseRank === scenarioData.rank_maxes.length) {
            energy = Math.min(rankInfo.baseRank * 100 + rankInfo.progressToNext * 100, 1050);
        } else {
            energy = rankInfo.baseRank * 100 + rankInfo.progressToNext * 100;
        }

        scenarioEnergies.push(energy);
        energyDetails[scenarioName] = energy;
    });

    let harmonicMean = 0;
    try {
        harmonicMean = Math.trunc(
            calculateHarmonicMean(scenarioEnergies.filter(e => e > 0), scenarioEnergies.length)
        );
    } catch { }

    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore: harmonicMean,
        details: { scenarioEnergies: energyDetails, harmonicMean, thresholds }
    }), thresholds);
}

/**
 * Calculates TPT rank (thundah's Precision Tracking)
 */
function calculateTptRank(apiData: BenchmarkApiData, _difficultyConfig: Difficulty): RankCalculationResult {
    return calculateCumulativeRank(apiData, 5);
}

/**
 * Calculates ASB rank (AimSpeed Benchmarks)
 */
function calculateAsbRank(apiData: BenchmarkApiData, _difficultyConfig: Difficulty): RankCalculationResult {
    return calculateCumulativeRank(apiData, 8);
}

/**
 * Calculates CA-S1 rank (cryoAlchemists Season 1)
 */
function calculateCaS1Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    return calculateSpecializedHarmonicRank(apiData, difficultyConfig, 'ca-s1');
}

/**
 * Uniofficial SAS2 rank calculation (SuperbAim Season 2)
 */
function calculateUnofficialSas2Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const sas2Config = {
        thresholds: [1200, 1300, 1400, 1500, 1600],
        fakeLowerOffset: 50,
        fakeUpperCount: 1,
        filterSubcategories: (sub: { subcategoryName: string }) =>
            !sub.subcategoryName.toLowerCase().includes("strafe")
    };
    return calculateSpecializedHarmonicRank(apiData, difficultyConfig, 'custom', sas2Config);
}

/**
 * Calculates Mira rank (Mira's Benchmark)
 */
function calculateMiraRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const isEasy = difficultyConfig.difficultyName.toLowerCase() === 'easy';
    const thresholds = isEasy
        ? [100, 200, 300, 400, 500]
        : [600, 700, 800, 900, 1000];
    const miraConfig = {
        thresholds,
        fakeLowerOffset: 50,
        fakeUpperCount: 1
    };
    return calculateSpecializedHarmonicRank(apiData, difficultyConfig, 'custom', miraConfig);
}

/**
 * Calculates VT-Energy rank (Voltaic Season 4 and 5)
 */
function calculateVtEnergyRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    return calculateSpecializedHarmonicRank(apiData, difficultyConfig, 'vt-energy');
}

/**
 * Calculates basic rank (Voltaic Season 3 and Revosect Season 1)
 */
function calculateBasicRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const { subcategoryRanks } = getSubcategoryHighestRanks(apiData, difficultyConfig);
    const subcategoryHighestRanks: number[] = [];
    let hasUnrankedSubcategory = false;

    Object.values(subcategoryRanks).forEach(category => {
        Object.values(category).forEach(({ baseRank }) => {
            if (baseRank > 0) {
                subcategoryHighestRanks.push(baseRank);
            } else {
                hasUnrankedSubcategory = true;
            }
        });
    });

    const overallRank = hasUnrankedSubcategory
        ? 0
        : subcategoryHighestRanks.length > 0
            ? Math.min(...subcategoryHighestRanks)
            : 0;

    // Calculate capped progress for each subcategory
    let totalCappedProgress = 0;
    let totalSubcategoryCount = 0;
    const subcategoryProgress: Record<string, Record<string, number>> = {};

    Object.entries(subcategoryRanks).forEach(([categoryName, subcategories]) => {
        subcategoryProgress[categoryName] = {};

        Object.entries(subcategories).forEach(([subcategoryName, rankInfo]) => {
            totalSubcategoryCount++;

            // Calculate capped progress (max 100% toward next rank)
            let cappedProgress = 0;
            if (rankInfo.baseRank === 0) {
                // No score in this subcategory = 0% progress
                cappedProgress = 0;
            } else if (rankInfo.baseRank > overallRank + 1) {
                // Already at or beyond the next rank
                cappedProgress = 1;
            } else if (rankInfo.baseRank === overallRank + 1) {
                // Exactly at the next rank
                cappedProgress = 1;
            } else if (rankInfo.baseRank === overallRank) {
                // Progress toward next rank
                cappedProgress = rankInfo.progressToNext;
            } else {
                // Below current rank
                cappedProgress = 0;
            }

            subcategoryProgress[categoryName][subcategoryName] = cappedProgress;
            totalCappedProgress += cappedProgress;
        });
    });

    const maxRank = Math.max(...subcategoryHighestRanks);
    const allAtMax = subcategoryHighestRanks.length > 0 && subcategoryHighestRanks.every(r => r === maxRank);

    const avgProgress = allAtMax
        ? 1
        : totalSubcategoryCount > 0
            ? totalCappedProgress / totalSubcategoryCount
            : 0;

    return {
        rank: overallRank,
        details: {
            subcategoryRanks,
            subcategoryProgress,
            progressToNextRank: avgProgress
        }
    };
}

/**
 * Calculates Aplus-S1 rank (Aimerz+ Season 1)
 */
function calculateAplusS1Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    // Start with basic rank calculation
    const basicResult = calculateBasicRank(apiData, difficultyConfig);
    const normalRank = basicResult.rank;

    if (!apiData.categories) {
        return {
            rank: normalRank,
            details: {
                ...basicResult.details,
                normalRank,
                plusRank: 0,
                tieBreakType: "normal"
            }
        };
    }

    // Calculate plus rank: 3rd highest score in each category
    const { results } = processScenarios(apiData, difficultyConfig, (_, __, ___, scenarioData) =>
        scenarioData ? scenarioData.scenario_rank : 0
    );

    let plusRank = Infinity;
    const categoryPlusRanks: Record<string, number> = {};

    Object.entries(results).forEach(([categoryName, subcategories]) => {
        const categoryRanks: number[] = [];
        Object.values(subcategories).forEach(ranks => {
            categoryRanks.push(...ranks);
        });

        const sortedRanks = categoryRanks.filter(rank => rank > 0).sort((a, b) => b - a);
        categoryPlusRanks[categoryName] = sortedRanks.length >= 3 ? sortedRanks[2] : 0;
        plusRank = Math.min(plusRank, categoryPlusRanks[categoryName]);
    });

    if (plusRank === Infinity) plusRank = 0;

    // Final rank is the higher of normal or plus rank
    const rank = Math.max(normalRank, plusRank);
    const tieBreakType = rank === plusRank && plusRank > 0 ? "plus" : "normal";

    return {
        rank,
        details: {
            ...basicResult.details,
            normalRank,
            plusRank,
            categoryPlusRanks,
            tieBreakType
        }
    };
}

/**
 * Calculates CB-S1 rank (Community Benchmark Season 1)
 */
function calculateCbS1Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const weights = [300, 600, 900, 1200, 1500, 1800];
    const maxWeight = 1800;

    const { results } = processScenarios(
        apiData,
        difficultyConfig,
        (_, __, scenarioName, scenarioData) => {
            const actualScore = convertApiScore(scenarioData.score);
            const { baseRank, isMaxed, progressToNext } = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);
            let scenarioWeight: number;

            if (baseRank === 0) {
                scenarioWeight = (actualScore / scenarioData.rank_maxes[0]) * weights[0];
            } else if (isMaxed && baseRank === scenarioData.rank_maxes.length) {
                const highest = scenarioData.rank_maxes[baseRank - 1];
                const secondHighest = baseRank > 1 ? scenarioData.rank_maxes[baseRank - 2] : 0;
                const rankDiff = highest - secondHighest || 1;
                const additionalRanks = (actualScore - highest) / rankDiff;
                scenarioWeight = weights[Math.min(baseRank + additionalRanks, weights.length - 1)];
            } else {
                scenarioWeight = weights[baseRank - 1] + (weights[baseRank] - weights[baseRank - 1]) * progressToNext;
            }

            return { scenarioName, score: scenarioWeight, percentage: (scenarioWeight / maxWeight) * 100 };
        }
    );

    // Flatten and accumulate
    const scenarioScores: Record<string, Record<string, { score: number; percentage: number }>> = {};
    let totalScore = 0;

    Object.entries(results).forEach(([categoryName, subcategories]) => {
        scenarioScores[categoryName] = {};
        Object.values(subcategories).flat().forEach(({ scenarioName, score, percentage }) => {
            scenarioScores[categoryName][scenarioName] = { score, percentage };
            totalScore += percentage;
        });
    });

    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore,
        details: { scenarioScores }
    }), weights);
}

/**
 * Calculates RA-S4 rank (Revosect Season 4)
 */
function calculateRaS4Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const isEasy = difficultyConfig.difficultyName.toLowerCase() === 'easy';
    const weights = isEasy ? [20, 50, 80, 110, 140, 170] : [200, 235, 270, 320, 360, 400];
    const rankThresholds = isEasy ? [240, 600, 960, 1320, 1680, 2040] : [2400, 2820, 3240, 3840, 4320, 4800];

    const categoryWeightedScores: number[] = difficultyConfig.categories.map(categoryConfig => {
        const { topScenarios } = getTopNScoresFromCategory(apiData, difficultyConfig, categoryConfig.categoryName, 4);
        return topScenarios.reduce((sum, scenario) =>
            sum + interpolateValue(scenario.score, scenario.rank_maxes, weights, 3 / 2), 0);
    });

    const totalScore = categoryWeightedScores.reduce((a, b) => a + b, 0);
    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore,
        details: { categoryWeightedScores }
    }), rankThresholds);
}


/**
 * Calculates XYZ rank (XYZ Smoothness Benchmarks)
 */
function calculateXYZRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const difficultyName = difficultyConfig.difficultyName.toLowerCase();
    const configs = {
        easy: [6, 5, 4, 3, 2, 1],
        hard: [5, 4, 3, 2, 1]
    };
    const ranks = configs[difficultyName as keyof typeof configs] || [];
    if (!ranks.length) return { rank: 0, details: {} };

    const scenarioRanks: number[] = [];
    Object.values(apiData.categories).forEach(category => {
        Object.values(category.scenarios).forEach(s => {
            scenarioRanks.push(s.scenario_rank);
        });
    });
    const totalScenarios = scenarioRanks.length;
    const maxRank = ranks[0];

    if (totalScenarios > 0 && scenarioRanks.every(r => r === maxRank)) {
        return { rank: maxRank, details: { totalScenarios, pinnacle: true } };
    }

    for (const [i, rank] of ranks.entries()) {
        const required = i === 0 ? 3 : 4;
        const totalRequired = i === 0 ? 9 : 12;

        // Count per category at this rank or higher
        const perCategoryAtRank = Object.values(apiData.categories).map(category =>
            Object.values(category.scenarios).filter(s => s.scenario_rank >= rank).length
        );

        if (
            perCategoryAtRank.every(c => c >= required) &&
            scenarioRanks.filter(r => r >= rank).length >= totalRequired
        ) {
            return {
                rank,
                details: {
                    totalScenarios,
                    progressToNextRank: Math.min(scenarioRanks.filter(r => r >= rank).length / totalScenarios, 1)
                }
            };
        }
    }

    return { rank: 0, details: { totalScenarios, progressToNextRank: 0 } };
}

/**
 * Calculates Aplus-Alt rank
 */
export function calculateAplusAltRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const thresholds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

    // Count total number of scenarios
    const totalScenarios = Object.values(apiData.categories)
        .reduce((sum, category) => sum + Object.keys(category.scenarios).length, 0);

    // Avoid division by zero
    const scorePerRank = totalScenarios > 0 ? 100 / totalScenarios : 0;

    // Process all scenarios to calculate their score contributions
    const scenarioScores: Record<string, { score: number; rank: number; progress: number }> = {};
    let totalScore = 0;

    Object.values(apiData.categories).forEach(category => {
        Object.entries(category.scenarios).forEach(([scenarioName, scenarioData]) => {
            const actualScore = convertApiScore(scenarioData.score);
            const rankInfo = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);

            let scenarioScore: number;
            if (rankInfo.baseRank === 0) {
                // Linear interpolation for scores below the first rank threshold
                const firstThreshold = scenarioData.rank_maxes[0] || 1;
                scenarioScore = (actualScore / firstThreshold) * scorePerRank;
            } else {
                // Each achieved rank contributes scorePerRank points, plus lerp for progress to next
                scenarioScore = (rankInfo.baseRank + rankInfo.progressToNext) * scorePerRank;
            }

            scenarioScores[scenarioName] = {
                score: scenarioScore,
                rank: rankInfo.baseRank,
                progress: rankInfo.progressToNext
            };
            totalScore += scenarioScore;
        });
    });

    // Round total score to 2 decimal places for precision
    totalScore = Math.round(totalScore * 100) / 100;

    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore,
        details: { scenarioScores, thresholds }
    }), thresholds);
}

/**
 * Calculates M0narcS & Hizku
 */
function calculateM0narcSHizkuRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const thresholds: Record<string, number[]> = {
        easy: [100, 200, 300, 400],
        normal: [500, 600, 700, 800],
        hard: [900, 1000, 1100, 1200]
    };
    return calculateAltEnergyRankTemplate(apiData, difficultyConfig, thresholds);
}

/**
 * Calculates Avasive rank
 */
function calculateAvasiveRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const thresholds: Record<string, number[]> = {
        genesis: [100, 200, 300, 400, 500],
        ascension: [600, 700, 800, 900, 1000],
        enlightenment: [1100, 1200, 1300, 1400, 1500],
        wallhack: [100, 200, 300, 400, 500, 600, 700, 800, 900]
    };
    return calculateAltEnergyRankTemplate(apiData, difficultyConfig, thresholds);
}

/**
 * Calculates Val-Energy rank (Voltaic Energy with Easy/Medium/Hard difficulties)
 */
export function calculateValEnergyRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    const energyThresholds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];
    const ranges: Record<string, [number, number]> = {
        easy: [0, 4],
        medium: [4, 8],
        hard: [8, 12],
    };
    const [start, end] = ranges[difficultyConfig.difficultyName.toLowerCase()] ?? [0, energyThresholds.length];
    return calculateSpecializedHarmonicRank(apiData, difficultyConfig, 'custom', {
        thresholds: energyThresholds.slice(start, end),
        fakeLowerOffset: 100,
        fakeUpperCount: 1,
        filterSubcategories: () => true
    });
}

/**
 * Calculates e1SE rank (e1se Smooth Benchmarks)
 */
function calculateE1seRank(apiData: BenchmarkApiData, _difficultyConfig: Difficulty): RankCalculationResult {
    return calculateCumulativeRank(apiData, 6);
}

/**
 * Calculates XYZ2 rank (XYZ Benchmarks)
 */
function calculateXYZ2Rank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    const difficultyName = difficultyConfig.difficultyName.toLowerCase();
    const configs = {
        easy: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        hard: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    };
    const ranks = configs[difficultyName as keyof typeof configs] || [];
    if (!ranks.length) return { rank: 0, details: {} };

    // Collect scores and rank infos by category
    const categoryScores: Record<string, number[]> = {};
    const categoryRankInfos: Record<string, { baseRank: number; progressToNext: number; isMaxed: boolean }[]> = {};
    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    let scenarioIndex = 0;

    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        categoryScores[categoryName] = [];
        categoryRankInfos[categoryName] = [];

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++, scenarioIndex++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);

                if (scenarioData && scenarioData.scenario_rank > 0) {
                    const actualScore = convertApiScore(scenarioData.score);
                    const rankInfo = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);
                    categoryScores[categoryName].push(rankInfo.baseRank);
                    categoryRankInfos[categoryName].push(rankInfo);
                }
            }
        });
    });

    const totalScenarios = scenarioNames.length;

    // Pinnacle check: all scores are the highest rank
    const allScores = Object.values(categoryScores).flat();
    const maxPossibleRank = ranks[0];
    if (totalScenarios > 0 && allScores.length === totalScenarios && allScores.every(score => score === maxPossibleRank)) {
        return {
            rank: maxPossibleRank,
            details: {
                categoryScores,
                pinnacle: true,
                totalScenarios,
                progressToNextRank: 1
            }
        };
    }

    // Check for 3 scores at highest rank in every category
    const allCategoriesHaveThreeMax = Object.values(categoryScores).every(scores =>
        scores.filter(score => score === maxPossibleRank).length >= 3
    );
    if (allCategoriesHaveThreeMax) {
        return {
            rank: maxPossibleRank,
            details: {
                categoryScores,
                categoryFourthLowest: {},
                hasInsufficientScores: false,
                progressToNextRank: 1,
                achievedByThreeMax: true
            }
        };
    }
    // 4th lowest logic
    const categoryFourthLowest: Record<string, number> = {};
    let hasInsufficientScores = false;

    Object.entries(categoryScores).forEach(([categoryName, scores]) => {
        if (scores.length < 4) {
            hasInsufficientScores = true;
            categoryFourthLowest[categoryName] = 0;
        } else {
            const sortedScores = scores.sort((a, b) => b - a);
            categoryFourthLowest[categoryName] = sortedScores[3];
        }
    });

    if (hasInsufficientScores) {
        return {
            rank: 0,
            details: {
                categoryScores,
                categoryFourthLowest,
                hasInsufficientScores: true,
                progressToNextRank: 0
            }
        };
    }

    const overallRank = Math.min(...Object.values(categoryFourthLowest));

    // Percentage-based progress calculation (top 4 scores per category, capped at 100%)
    let totalProgress = 0;
    let categoryCount = 0;
    const categoryProgress: Record<string, number> = {};

    Object.entries(categoryRankInfos).forEach(([categoryName, rankInfos]) => {
        if (rankInfos.length >= 4) {
            const sortedRankInfos = [...rankInfos].sort((a, b) => b.baseRank - a.baseRank).slice(0, 4);
            let progressSum = 0;
            const nextRank = overallRank + 1;

            sortedRankInfos.forEach(info => {
                if (info.baseRank >= nextRank) {
                    progressSum += 1;
                } else {
                    progressSum += info.progressToNext;
                }
            });

            const avgProgress = progressSum / 4;
            categoryProgress[categoryName] = avgProgress;
            totalProgress += avgProgress;
            categoryCount++;
        }
    });

    const progressToNextRank = categoryCount > 0 ? totalProgress / categoryCount : 0;

    return {
        rank: overallRank,
        details: {
            categoryScores,
            categoryFourthLowest,
            hasInsufficientScores: false,
            categoryProgress,
            progressToNextRank
        }
    };
}