import type { BenchmarkApiData, Difficulty, Category, Subcategory, ScenarioData, RankInfo, RankCalculationResult, SubcategoryRankInfo, HarmonicRankConfig } from './types/benchmarks';

/**
 * Utility to calculate progress to the next rank based on a score and thresholds.
 */
export function calculateProgressToNextRank(score: number, thresholds: number[], rank: number): number {
    const floor2 = (val: number) => Math.floor(val * 100) / 100;
    if (rank === 0) return thresholds[0] ? floor2(Math.min(score / thresholds[0], 1)) : 0;
    if (rank >= thresholds.length) return 1;
    const lower = thresholds[rank - 1] || 0;
    return floor2(Math.max(0, Math.min((score - lower) / (thresholds[rank] - lower), 1)));
}

/**
 * Safely accesses scenario data with default fallback.
 */
export function getScenarioData(apiData: BenchmarkApiData, scenarioName: string): ScenarioData {
    if (!apiData.categories) return createDefaultScenario();
    for (const category of Object.values(apiData.categories)) {
        if (category.scenarios[scenarioName]) return category.scenarios[scenarioName];
    }
    return createDefaultScenario();
}

/**
 * Generic rank calculation template.
 */
export function calculateRankTemplate(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    calculateScore: (data: BenchmarkApiData, config: Difficulty) => { totalScore: number; details: Record<string, any> },
    thresholds: number[]
): RankCalculationResult {
    const { totalScore, details } = calculateScore(apiData, difficultyConfig);
    let rank = 0;
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (totalScore >= thresholds[i]) {
            rank = i + 1;
            break;
        }
    }
    const progressToNextRank = calculateProgressToNextRank(totalScore, thresholds, rank);
    return { rank, details: { ...details, totalScore, rankThresholds: thresholds, progressToNextRank } };
}

/**
 * Processes scenarios with a custom processor function.
 */
export function processScenarios<T>(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    processor: (
        category: Category,
        subcategory: Subcategory,
        scenarioName: string,
        scenarioData: ScenarioData,
        scenarioIndex: number
    ) => T
): {
    results: Record<string, Record<string, T[]>>;
    scenarioNames: string[];
} {
    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    const results: Record<string, Record<string, T[]>> = {};
    let scenarioIndex = 0;

    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        results[categoryName] = {};

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            const subcategoryName = subcategoryConfig.subcategoryName;
            results[categoryName][subcategoryName] = [];

            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);
                results[categoryName][subcategoryName].push(
                    processor(categoryConfig, subcategoryConfig, scenarioName, scenarioData, scenarioIndex)
                );
                scenarioIndex++;
            }
        });
    });

    return { results, scenarioNames };
}

/**
 * Calculates energy for a scenario.
 */
export function calculateEnergy(
    rankInfo: SubcategoryRankInfo,
    thresholds: number[],
    apiData: BenchmarkApiData,
    fakeLowerOffset: number,
    fakeUpperCount: number
): number {
    if (rankInfo.baseRank === 0 && rankInfo.preciseRank === 0) {
        const score = rankInfo.score;
        let rankMaxes: number[] = [];
        if (score > 0 && apiData.categories) {
            for (const apiCat of Object.values(apiData.categories)) {
                if (apiCat.scenarios[rankInfo.scenarioName]) {
                    rankMaxes = apiCat.scenarios[rankInfo.scenarioName].rank_maxes;
                    break;
                }
            }
        }
        if (rankMaxes.length < 2) return 0;

        const lowestThreshold = rankMaxes[0];
        const secondLowestThreshold = rankMaxes[1];
        const thresholdDiff = secondLowestThreshold - lowestThreshold;
        const fakeLowerThreshold = lowestThreshold - thresholdDiff;
        const fakeEnergy = thresholds[0] - fakeLowerOffset;
        const firstEnergy = thresholds[0];

        const energy = score < fakeLowerThreshold
            ? (score / fakeLowerThreshold) * fakeEnergy
            : fakeEnergy + ((score - fakeLowerThreshold) / (lowestThreshold - fakeLowerThreshold)) * (firstEnergy - fakeEnergy);
        return Math.trunc(energy);
    }

    const N = thresholds.length;
    const fakeLowerThreshold = thresholds[0] - fakeLowerOffset;
    const lastThreshold = thresholds[N - 1];
    const secondLastThreshold = thresholds[N - 2];
    const rankDifference = lastThreshold - secondLastThreshold || 100;
    const fakeUpperThreshold = lastThreshold + rankDifference;

    if (rankInfo.preciseRank <= 0) return 0;
    if (rankInfo.preciseRank < 1) {
        const energy = fakeLowerThreshold + rankInfo.preciseRank * (thresholds[0] - fakeLowerThreshold);
        return Math.trunc(energy);
    }
    if (rankInfo.preciseRank < N) {
        const k = Math.floor(rankInfo.preciseRank);
        const fraction = rankInfo.preciseRank - k;
        const lowerThreshold = k === 0 ? fakeLowerThreshold : thresholds[k - 1];
        const upperThreshold = thresholds[k];
        const energy = lowerThreshold + fraction * (upperThreshold - lowerThreshold);
        return Math.trunc(energy);
    }
    if (rankInfo.preciseRank < N + fakeUpperCount) {
        const fraction = rankInfo.preciseRank - N;
        const energy = lastThreshold + fraction * (fakeUpperThreshold - lastThreshold);
        return Math.trunc(energy);
    }
    return Math.trunc(fakeUpperThreshold);
}

/**
 * Interpolates a value based on thresholds.
 */
export function interpolateValue(
    value: number,
    thresholds: number[],
    outputValues: number[],
    extrapolateFactor: number = 1
): number {
    if (thresholds.length < 2 || outputValues.length < 2 || thresholds.length !== outputValues.length) {
        return 0;
    }

    if (value < thresholds[1]) {
        const delta = thresholds[1] - thresholds[0];
        const outputDelta = (outputValues[2] - outputValues[1]) / (2 / 3);
        return Math.max(0, Math.ceil(outputValues[1] + ((value - thresholds[1]) / delta) * outputDelta));
    }

    for (let i = 1; i < thresholds.length - 1; i++) {
        if (value <= thresholds[i + 1]) {
            return outputValues[i] +
                ((value - thresholds[i]) / (thresholds[i + 1] - thresholds[i])) *
                (outputValues[i + 1] - outputValues[i]);
        }
    }

    const last = thresholds.length - 1;
    return outputValues[last] +
        ((value - thresholds[last]) / (thresholds[last] - thresholds[last - 1])) *
        (outputValues[last] - outputValues[last - 1]) / extrapolateFactor;
}

/**
 * Calculates precise rank from score.
 */
export function calculatePreciseRankFromScore(score: number, rankMaxes: number[]): {
    baseRank: number;
    preciseRank: number;
    progressToNext: number;
    isMaxed: boolean;
    isValid: boolean;
} {
    // Handle zero/undefined scores
    if (!score || score <= 0 || !rankMaxes?.length) {
        return {
            baseRank: 0,
            preciseRank: 0,
            progressToNext: 0,
            isMaxed: false,
            isValid: false
        };
    }

    let baseRank = 0;
    for (let i = rankMaxes.length - 1; i >= 0; i--) {
        if (score >= rankMaxes[i]) {
            baseRank = i + 1;
            break;
        }
    }

    if (baseRank === 0) {
        return {
            baseRank: 0,
            preciseRank: 0,
            progressToNext: Math.min(score / rankMaxes[0], 0.99),
            isMaxed: false,
            isValid: true
        };
    }

    if (baseRank === rankMaxes.length) {
        const highestThreshold = rankMaxes[rankMaxes.length - 1];
        const secondHighestThreshold = rankMaxes.length > 1 ? rankMaxes[rankMaxes.length - 2] : 0;
        const rankDifference = highestThreshold - secondHighestThreshold || 1;
        const additionalRanks = (score - highestThreshold) / rankDifference;
        return {
            baseRank,
            preciseRank: baseRank + additionalRanks,
            progressToNext: additionalRanks % 1,
            isMaxed: true,
            isValid: true
        };
    }

    const currentThreshold = rankMaxes[baseRank - 1];
    const nextThreshold = rankMaxes[baseRank];
    const progressInRange = (score - currentThreshold) / (nextThreshold - currentThreshold);

    return {
        baseRank,
        preciseRank: baseRank + progressInRange,
        progressToNext: progressInRange,
        isMaxed: false,
        isValid: true
    };
}

/**
 * Gets VT-Energy thresholds.
 */
export function getVtEnergyThresholds(difficulty: string): number[] {
    const energyThresholds = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];
    const ranges: Record<string, [number, number]> = {
        "novice": [0, 4],
        "intermediate": [4, 8],
        "advanced": [8, 12],
        "elite (unofficial)": [9, 15]
    };
    const [start, end] = ranges[difficulty] || [0, energyThresholds.length];
    return energyThresholds.slice(start, end);
}

/**
 * Calculates harmonic mean.
 */
export function calculateHarmonicMean(values: number[], expectedCount: number): number {
    if (values.length !== expectedCount || values.some(v => v === 0)) return 0;
    return values.length / values.reduce((sum, value) => sum + 1 / value, 0);
}

/**
 * Converts API score to actual score.
 */
export function convertApiScore(apiScore: number): number {
    return apiScore / 100;
}

/**
 * Gets highest ranking scenarios per subcategory.
 */
export function getSubcategoryHighestRanks(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    useEnergyTieBreaker?: boolean,
    energyThresholds?: number[],
    fakeLowerOffset?: number,
    fakeUpperCount?: number
): {
    subcategoryRanks: Record<string, Record<string, SubcategoryRankInfo>>;
    hasUnrankedSubcategory: boolean;
} {
    if (!apiData.categories) return { subcategoryRanks: {}, hasUnrankedSubcategory: true };

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    const subcategoryRanks: Record<string, Record<string, SubcategoryRankInfo>> = {};
    let scenarioIndex = 0;
    let hasUnrankedSubcategory = false;

    difficultyConfig.categories.forEach(categoryConfig => {
        const categoryName = categoryConfig.categoryName;
        subcategoryRanks[categoryName] = {};

        categoryConfig.subcategories.forEach(subcategoryConfig => {
            const subcategoryName = subcategoryConfig.subcategoryName;
            let highestPreciseRank = -1;
            let bestScenario: SubcategoryRankInfo = {
                baseRank: 0,
                preciseRank: 0,
                progressToNext: 0,
                isMaxed: false,
                scenarioName: '',
                score: 0
            };
            for (let i = 0; i < subcategoryConfig.scenarioCount && scenarioIndex < scenarioNames.length; i++) {
                const scenarioName = scenarioNames[scenarioIndex];
                const scenarioData = getScenarioData(apiData, scenarioName);

                if (scenarioData && scenarioData.score !== 0) {
                    const actualScore = convertApiScore(scenarioData.score);
                    const rankInfo = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);

                    // Check if this is better than current best
                    let isBetter = false;

                    if (highestPreciseRank === -1) {
                        // First valid scenario
                        isBetter = true;
                    } else if (rankInfo.baseRank > 0 && bestScenario.baseRank === 0) {
                        // This scenario is ranked, current best is unranked
                        isBetter = true;
                    } else if (rankInfo.baseRank > 0 && bestScenario.baseRank > 0) {
                        // Both ranked, pick higher precise rank
                        isBetter = rankInfo.preciseRank > bestScenario.preciseRank;
                    } else if (rankInfo.baseRank === 0 && bestScenario.baseRank === 0) {
                        // Both unranked, use appropriate tie-breaker
                        if (useEnergyTieBreaker && energyThresholds && fakeLowerOffset !== undefined && fakeUpperCount !== undefined) {
                            // For energy calculations, compare actual energy values
                            const currentRankInfo: SubcategoryRankInfo = {
                                baseRank: rankInfo.baseRank,
                                preciseRank: rankInfo.preciseRank,
                                progressToNext: rankInfo.progressToNext,
                                isMaxed: rankInfo.isMaxed,
                                scenarioName,
                                score: actualScore
                            };
                            const currentEnergy = calculateEnergy(currentRankInfo, energyThresholds, apiData, fakeLowerOffset, fakeUpperCount);
                            const bestEnergy = calculateEnergy(bestScenario, energyThresholds, apiData, fakeLowerOffset, fakeUpperCount);
                            isBetter = currentEnergy > bestEnergy;
                        } else {
                            // For non-energy calculations, compare progress to first rank threshold
                            const currentProgress = scenarioData.rank_maxes.length > 0
                                ? actualScore / scenarioData.rank_maxes[0]
                                : 0;

                            // Get best scenario's data to calculate its progress
                            const bestScenarioData = getScenarioData(apiData, bestScenario.scenarioName);
                            const bestProgress = bestScenarioData.rank_maxes.length > 0
                                ? bestScenario.score / bestScenarioData.rank_maxes[0]
                                : 0;

                            // Pick the one with higher progress percentage to first rank
                            isBetter = currentProgress > bestProgress;
                        }
                    }

                    if (isBetter) {
                        highestPreciseRank = rankInfo.preciseRank;
                        bestScenario = {
                            baseRank: rankInfo.baseRank,
                            preciseRank: rankInfo.preciseRank,
                            progressToNext: rankInfo.progressToNext,
                            isMaxed: rankInfo.isMaxed,
                            scenarioName,
                            score: actualScore
                        };
                    }
                }
                scenarioIndex++;
            }

            if (highestPreciseRank === -1) hasUnrankedSubcategory = true;
            if (bestScenario.baseRank === 0) hasUnrankedSubcategory = true;
            subcategoryRanks[categoryName][subcategoryName] = bestScenario;
        });
    });

    return { subcategoryRanks, hasUnrankedSubcategory };
}

/**
 * Gets top N scoring scenarios from a category.
 */
export function getTopNScoresFromCategory(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    categoryName: string,
    n: number
): {
    topScenarios: Array<{
        scenarioName: string;
        score: number;
        baseRank: number;
        preciseRank: number;
        progressToNext: number;
        isMaxed: boolean;
        rank_maxes: number[];
    }>;
    hasUnrankedScenario: boolean;
} {
    if (!apiData.categories) return { topScenarios: [], hasUnrankedScenario: true };

    const categoryConfig = difficultyConfig.categories.find(c => c.categoryName === categoryName);
    if (!categoryConfig) {
        console.warn(`Category ${categoryName} not found in config`);
        return { topScenarios: [], hasUnrankedScenario: true };
    }

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    let scenarioIndex = 0;
    for (const cat of difficultyConfig.categories) {
        if (cat.categoryName === categoryName) break;
        scenarioIndex += cat.subcategories.reduce((sum, sub) => sum + sub.scenarioCount, 0);
    }

    const scenarios: Array<{
        scenarioName: string;
        score: number;
        baseRank: number;
        preciseRank: number;
        progressToNext: number;
        isMaxed: boolean;
        rank_maxes: number[];
    }> = [];

    const totalScenarios = categoryConfig.subcategories.reduce((sum, sub) => sum + sub.scenarioCount, 0);
    for (let i = 0; i < totalScenarios && scenarioIndex < scenarioNames.length; i++) {
        const scenarioName = scenarioNames[scenarioIndex];
        const scenarioData = getScenarioData(apiData, scenarioName);

        if (scenarioData) {
            const actualScore = convertApiScore(scenarioData.score);
            const rankInfo = calculatePreciseRankFromScore(actualScore, scenarioData.rank_maxes);
            scenarios.push({
                scenarioName,
                score: actualScore,
                baseRank: rankInfo.baseRank,
                preciseRank: rankInfo.preciseRank,
                progressToNext: rankInfo.progressToNext,
                isMaxed: rankInfo.isMaxed,
                rank_maxes: scenarioData.rank_maxes
            });
        }
        scenarioIndex++;
    }

    const topScenarios = scenarios.sort((a, b) => b.preciseRank - a.preciseRank).slice(0, n);
    return {
        topScenarios,
        hasUnrankedScenario: topScenarios.some(s => s.baseRank === 0)
    };
}

/**
 * Creates default scenario data.
 */
export function createDefaultScenario(): ScenarioData {
    return {
        score: 0,
        leaderboard_rank: 0,
        scenario_rank: 0,
        rank_maxes: []
    };
}

/**
 * Gets ordered scenario names.
 */
export function getOrderedScenarioNames(apiData: BenchmarkApiData, difficultyConfig: Difficulty): string[] {
    const apiScenarioNames = apiData.categories
        ? Object.values(apiData.categories).flatMap(category => Object.keys(category.scenarios || {}))
        : [];

    const scenarioNames: string[] = [];
    let scenarioIndex = 0;

    difficultyConfig.categories.forEach(categoryConfig => {
        categoryConfig.subcategories.forEach(subcategoryConfig => {
            for (let i = 0; i < subcategoryConfig.scenarioCount; i++) {
                scenarioNames.push(
                    scenarioIndex < apiScenarioNames.length
                        ? apiScenarioNames[scenarioIndex]
                        : `Unknown_Scenario_${categoryConfig.categoryName}_${subcategoryConfig.subcategoryName}_${i}`
                );
                scenarioIndex++;
            }
        });
    });

    return scenarioNames;
}

/**
 * Converts rank name to number.
 */
export function getRankNumber(rankName: string, ranks: RankInfo[]): number {
    if (["No data", "Unranked", "Not Complete"].includes(rankName)) return 0;
    const cleanRankName = rankName.replace(" Complete", "").trim();
    return ranks.findIndex(rank => rank.name === cleanRankName) >= 0
        ? ranks.findIndex(rank => rank.name === cleanRankName)
        : 0;
}

/**
 * Converts rank number to name.
 */
export function getRankName(rankNumber: number, ranks: RankInfo[]): string {
    return rankNumber <= 0 || rankNumber >= ranks.length
        ? "Unranked"
        : ranks[rankNumber].name;
}

/**
 * Calculates complete rank.
 */
export function calculateCompleteRank(apiData: BenchmarkApiData, difficultyConfig: Difficulty): string {
    if (!apiData?.categories || !apiData?.ranks) return "No data";

    let minRank = Infinity;
    let allScenariosRanked = true;

    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);

    scenarioNames.forEach(scenarioName => {
        const scenarioData = getScenarioData(apiData, scenarioName);
        if (scenarioData) {
            const rank = scenarioData.scenario_rank;
            if (rank > 0) minRank = Math.min(minRank, rank);
            else allScenariosRanked = false;
        }
    });

    if (!allScenariosRanked || minRank === Infinity) return "Unranked";
    if (minRank >= apiData.ranks.length || minRank < 0) return "Rank out of bounds";

    const rankName = apiData.ranks[minRank].name;
    // Only skip " Complete" for Trainee- or Prodigy- (case-insensitive, ignore whitespace)
    const trimmedRankName = rankName.trim().toLowerCase();
    if (trimmedRankName.endsWith("trainee-") || trimmedRankName.endsWith("prodigy-")) {
        return rankName;
    }
    return `${rankName} Complete`;
}

/**
 * Calculates specialized harmonic mean ranks based on the rank type.
 */
export function calculateSpecializedHarmonicRank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    rankType: 'vt-energy' | 'ca-s1' | 'custom',
    customConfig?: HarmonicRankConfig
): RankCalculationResult {
    let config: HarmonicRankConfig;

    if (rankType === 'ca-s1') {
        config = {
            thresholds: [1500, 1550, 1600, 1650, 1700, 1750, 1800],
            fakeLowerOffset: 50,
            fakeUpperCount: 2,
            filterSubcategories: sub => !sub.subcategoryName.toLowerCase().includes("strafe")
        };
    } else if (rankType === 'vt-energy') {
        const isNovice = difficultyConfig.difficultyName.toLowerCase() === 'novice';
        config = {
            thresholds: getVtEnergyThresholds(difficultyConfig.difficultyName.toLowerCase()),
            fakeLowerOffset: isNovice ? 0 : 100,
            fakeUpperCount: 1,
            filterSubcategories: sub => !sub.subcategoryName.toLowerCase().includes("strafe")
        };
    } else if (rankType === 'custom' && customConfig) {
        config = customConfig;
    } else {
        throw new Error("Invalid rankType or missing customConfig");
    }

    return calculateHarmonicMeanRank(
        apiData,
        difficultyConfig,
        config.thresholds,
        config.filterSubcategories ?? (() => true),
        config.fakeLowerOffset,
        config.fakeUpperCount
    );
}

/**
 * Calculates harmonic mean-based ranks
 */
export function calculateHarmonicMeanRank(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    thresholds: number[],
    filterSubcategories: (subcategory: Subcategory) => boolean = () => true,
    fakeLowerOffset: number,
    fakeUpperCount: number,
    clampMaxEnergy?: number
): RankCalculationResult {
    // Pass energy parameters to getSubcategoryHighestRanks for proper tie-breaking
    const { subcategoryRanks } = getSubcategoryHighestRanks(
        apiData,
        difficultyConfig,
        true, // useEnergyTieBreaker
        thresholds,
        fakeLowerOffset,
        fakeUpperCount
    );

    const subcategoryEnergies: number[] = [];
    const energyDetails: Record<string, Record<string, number>> = {};
    const subcategoryEnergiesFlat: { subcategoryName: string; energy: number }[] = [];

    // Check if difficulty is "advanced"
    const isAdvanced = difficultyConfig.difficultyName?.toLowerCase() === "advanced";
    const maxEnergy = typeof clampMaxEnergy === "number" ? clampMaxEnergy : (isAdvanced ? 1200 : undefined);

    Object.entries(subcategoryRanks).forEach(([categoryName, subcategories]) => {
        energyDetails[categoryName] = {};
        Object.entries(subcategories).forEach(([subcategoryName, rankInfo]) => {
            if (!filterSubcategories({ subcategoryName } as Subcategory)) return;
            let energy = calculateEnergy(rankInfo, thresholds, apiData, fakeLowerOffset, fakeUpperCount);
            // Clamp energy to maxEnergy if provided
            if (typeof maxEnergy === "number" && energy > maxEnergy) {
                energy = maxEnergy;
            }
            energyDetails[categoryName][subcategoryName] = energy;
            subcategoryEnergies.push(energy);
            subcategoryEnergiesFlat.push({ subcategoryName, energy });
        });
    });

    const expectedSubcategoryCount = difficultyConfig.categories.reduce(
        (sum, category) => sum + category.subcategories.filter(filterSubcategories).length,
        0
    );

    const harmonicMean = subcategoryEnergies.length === expectedSubcategoryCount
        ? Math.round(calculateHarmonicMean(subcategoryEnergies.filter(energy => energy > 0), expectedSubcategoryCount) * 10) / 10
        : 0;

    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore: harmonicMean,
        details: {
            subcategoryEnergies: energyDetails,
            subcategoryEnergiesFlat,
            harmonicMean,
            thresholds
        }
    }), thresholds);
}

/**
 * Helper to calculate cumulative rank based on a threshold.
 */
export function calculateCumulativeRank(
    apiData: BenchmarkApiData,
    threshold: number
): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: {} };

    // Gather all scenario ranks > 0
    const scenarioRanks = Object.values(apiData.categories)
        .flatMap(category => Object.values(category.scenarios))
        .map(scenario => scenario.scenario_rank)
        .filter(rank => rank > 0);

    // Count occurrences of each rank
    const rankCounts = scenarioRanks.reduce<Record<number, number>>(
        (acc, rank) => ((acc[rank] = (acc[rank] || 0) + 1), acc),
        {}
    );

    // Calculate cumulative counts for each rank from highest to lowest
    const ranks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
    let cumulativeCount = 0;
    let maxRank = 0;

    for (const rank of ranks) {
        cumulativeCount += rankCounts[rank] || 0;
        if (cumulativeCount >= threshold) {
            maxRank = rank;
            break;
        }
    }

    // Calculate progress to next rank
    const nextRankCount = rankCounts[maxRank + 1] || 0;
    const progressToNextRank = Math.max(0, Math.min(nextRankCount / threshold, 1));

    return { rank: maxRank, details: { rankCounts, progressToNextRank } };
}

/**
 * Calculates the maximum number of ranks for a specific difficulty
 */
function calculateMaxRanksForDifficulty(difficulty: Difficulty): number {
    return Object.keys(difficulty.rankColors || {}).length;
}

/**
 * Calculates total number of ranks across all difficulties
 */
export function calculateTotalRanks(allDifficulties: Difficulty[]): number {
    return allDifficulties.reduce((total, difficulty) =>
        total + calculateMaxRanksForDifficulty(difficulty), 0
    );
}

/**
 * Gets the slice of global thresholds for a specific difficulty
 */
export function getDifficultyThresholdSlice(
    globalThresholds: number[],
    currentDifficulty: Difficulty,
    allDifficulties: Difficulty[]
): number[] {
    let startIndex = 0;

    // Calculate start index based on previous difficulties
    for (const difficulty of allDifficulties) {
        if (difficulty.difficultyName === currentDifficulty.difficultyName) {
            break;
        }
        const maxRanks = calculateMaxRanksForDifficulty(difficulty);
        startIndex += maxRanks;
    }

    const currentMaxRanks = calculateMaxRanksForDifficulty(currentDifficulty);
    // Slice includes actual ranks + 1 fake rank
    const slice = globalThresholds.slice(startIndex, startIndex + currentMaxRanks + 1);
    return slice;
}

/** 
 * Calculates alternative energy rank template
 */
export function calculateAltEnergyRankTemplate(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    thresholds: Record<string, number[]>
): RankCalculationResult {
    if (!apiData.categories) return { rank: 0, details: { scenarioEnergiesOrdered: [] } };

    const energyThresholds = thresholds[difficultyConfig.difficultyName.toLowerCase()] || thresholds.easy;
    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    const scenarioEnergies = scenarioNames.map(scenarioName => {
        const scenarioData = getScenarioData(apiData, scenarioName);
        const score = convertApiScore(scenarioData.score);
        const rankInfo = calculatePreciseRankFromScore(score, scenarioData.rank_maxes);
        if (rankInfo.baseRank === 0) {
            const first = scenarioData.rank_maxes[0] || 1;
            return Math.trunc((score / first) * energyThresholds[0]);
        }
        if (rankInfo.isMaxed && rankInfo.baseRank === scenarioData.rank_maxes.length) {
            const hi = scenarioData.rank_maxes[scenarioData.rank_maxes.length - 1] ?? 1;
            const lo = scenarioData.rank_maxes[scenarioData.rank_maxes.length - 2] ?? 0;
            const diff = hi - lo || 1;
            return Math.trunc(energyThresholds[energyThresholds.length - 1] + ((score - hi) / diff) * 100);
        }
        const lower = energyThresholds[rankInfo.baseRank - 1] || 0;
        const upper = energyThresholds[rankInfo.baseRank];
        return Math.trunc(lower + rankInfo.progressToNext * (upper - lower));
    });

    if (scenarioNames.length === 0) {
        return { rank: 0, details: { error: "No scenarios found", scenarioEnergiesOrdered: scenarioEnergies } };
    }
    const missing = scenarioNames.find((_, i) => scenarioEnergies[i] === 0);
    if (missing) {
        return { rank: 0, details: { error: `Missing score for scenario: ${missing}`, scenarioEnergiesOrdered: scenarioEnergies } };
    }

    let harmonicMean = 0, rank = 0, progressToNextRank = 0;
    try {
        harmonicMean = Math.round(calculateHarmonicMean(scenarioEnergies, scenarioNames.length) * 10) / 10;
        rank = energyThresholds.filter(t => harmonicMean >= t).length;
        progressToNextRank = calculateProgressToNextRank(harmonicMean, energyThresholds, rank);
    } catch (e) {
        return { rank: 0, details: { error: (e as Error).message, scenarioEnergiesOrdered: scenarioEnergies } };
    }

    return calculateRankTemplate(apiData, difficultyConfig, () => ({
        totalScore: harmonicMean,
        details: {
            scenarioEnergiesOrdered: scenarioEnergies,
            harmonicMean,
            thresholds: energyThresholds,
            progressToNextRank
        }
    }), energyThresholds);
}

/**
 * Calculates volts for a single scenario
 */
export function calculateScenarioVolts(score: number, rankMaxes: number[]): number {
    if (!rankMaxes || rankMaxes.length === 0) return 0;
    if (score <= 0) return 0;
    
    const lastThreshold = rankMaxes[rankMaxes.length - 1];
    
    if (lastThreshold === 0) return 0;
    
    const volts = (score / lastThreshold) * 100;
    return Math.max(0, volts);
}

/**
 * Calculates total volts for a benchmark difficulty
 */
export function calculateTotalVolts(
    apiData: BenchmarkApiData,
    difficultyConfig: Difficulty,
    scoreOverrides: Record<string, number> = {}
): number {
    if (!apiData?.categories) return 0;
    
    let totalVolts = 0;
    const scenarioNames = getOrderedScenarioNames(apiData, difficultyConfig);
    
    scenarioNames.forEach(scenarioName => {
        const scenarioData = getScenarioData(apiData, scenarioName);
        if (!scenarioData) return;
        
        const rawScore = scoreOverrides[scenarioName] ?? scenarioData.score;
        const score = convertApiScore(rawScore);
        
        const scenarioVolts = calculateScenarioVolts(score, scenarioData.rank_maxes);
        totalVolts += scenarioVolts;
    });
    
    return Math.round(totalVolts);
}