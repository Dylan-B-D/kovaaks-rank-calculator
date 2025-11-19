// =========================================================================
//          Combined Types for augmenting Kovaaks API data
// =========================================================================

/**
 * Represents augmented benchmark data combined with Kovaaks API data
 * Fields:
 * - benchmarkName: The name of the benchmark
 * - rankCalculation: The method used to calculate ranks for this benchmark
 * - spreadsheetURL: Optional URL to a spreadsheet with additional benchmark information
 * - abbreviation: Abbreviation for the benchmark (e.g., "VT")
 * - color: Color associated with the benchmark
 * - difficulties: List of difficulties available for this benchmark, each containing API data
 */
export type BenchmarkDataResponse = {
    benchmarkName: string;
    rankCalculation: string;
    spreadsheetURL: string;
    abbreviation: string;
    color: string;
    difficulties: Array<
        Difficulty & { apiData: BenchmarkApiData }
    >;
};

/**
 * =========================================================================
 *          Types for json data to augment KovaaK's API data
 * =========================================================================
 */

/**
 * Represents a subcategory within a benchmark category
 * 
 * Fields:
 * - subcategoryName: The display name of the subcategory
 * - scenarioCount: Number of scenarios in this subcategory
 * - color: The color associated with this subcategory
 */
export type Subcategory = {
    subcategoryName: string;
    scenarioCount: number;
    color: string;
};

/**
 * Represents a main category within a benchmark containing subcategories
 * 
 * Fields:
 * - categoryName: The display name of the category
 * - color: The color associated with this category
 * - subcategories: List of subcategories in this category
 */
export type Category = {
    categoryName: string;
    color: string;
    subcategories: Subcategory[];
};

/**
 * Represents a difficulty level within a benchmark
 * 
 * Fields:
 * - difficultyName: The display name of the difficulty
 * - kovaaksBenchmarkId: Unique identifier for the benchmark in Kovaak's system
 * - sharecode: Share code for the benchmark
 * - rankColors: Mapping of rank names to their associated colors
 * - categories: List of categories associated with this difficulty
 */
export type Difficulty = {
    difficultyName: string;
    kovaaksBenchmarkId: number;
    sharecode: string;
    rankColors: Record<string, string>;
    categories: Category[];
};

/**
 * Represents a benchmark in Kovaak's
 * Fields:
 * - benchmarkName: The display name of the benchmark
 * - rankCalculation: The method used to calculate ranks for this benchmark
 * - abbreviation: Abbreviation for the benchmark (e.g., "VT")
 * - color: Color associated with the benchmark
 * - difficulties: List of difficulties available for this benchmark
 */
export type Benchmark = {
    benchmarkName: string;
    rankCalculation: string;
    abbreviation: string;
    color: string;
    spreadsheetURL: string;
    difficulties: Difficulty[];
};

/**
 * =========================================================================
 *          Kovaaks API Data Types
 * =========================================================================
 */

/**
 * Represents the API data structure for benchmark progress and ranks
 * 
 * Fields:
 * - benchmark_progress: Overall progress in the benchmark (Not useful for anything)
 * - overall_rank: The player's overall rank in the benchmark (Simplified so not useful)
 * - categories: A record of categories, each containing its own progress and ranks (Ambiguous. Can be a category or a subcategory. Do not use as a category)
 * - ranks: List of rank information objects (Technically not needed, since we use custom colours anyways, and can infer ranks)
 */
export type BenchmarkApiData = {
    benchmark_progress: number;
    overall_rank: number;
    categories: Record<string, CategoryApiData>;
    ranks: RankInfo[];
};

/**
 * Represents the API data structure for a specific category within a benchmark
 * 
 * Fields:
 * - benchmark_progress: Overall progress in the benchmark (Don't use)
 * - category_rank: The player's rank in this specific category
 * - rank_maxes: List of score thresholds for ranks for a scenarios
 * - scenarios: A record of scenarios within this category, each containing its own score and ranks
 */
export type CategoryApiData = {
    benchmark_progress: number;
    category_rank: number;
    rank_maxes: number[];
    scenarios: Record<string, ScenarioData>;
};

/**
 * Represents the API data structure for a specific scenario within a category
 * 
 * Fields:
 * - score: The player's score in this scenario
 * - leaderboard_rank: The player's rank on the leaderboard for this scenario
 * - scenario_rank: The rank threshold achieved in this scenario
 * - rank_maxes: List of score thresholds for ranks
 */
export type ScenarioData = {
    score: number;
    leaderboard_rank: number;
    scenario_rank: number;
    rank_maxes: number[];
};
 
/**
 * Represents rank information for a player in a benchmark - not relevant for much
 * 
 * Fields:
 * - icon: URL to the rank icon image
 * - name: The name of the rank
 * - color: The color associated with the rank
 * - frame: URL to the frame image for the rank
 * - description: Description of the rank
 * - playercard_large: URL to the large player card image for the rank
 * - playercard_small: URL to the small player card image for the rank
 */
export type RankInfo = {
    icon: string;
    name: string;
    color: string;
    frame: string;
    description: string;
    playercard_large: string;
    playercard_small: string;
};

/**
 * Represents the structure of the benchmark table component props
 * 
 * Fields:
 * - data: The benchmark data response containing all relevant information
 * - difficultyIndex: Optional index to specify which difficulty to display
 * - overallRankResult: Optional overall rank result for the player in this benchmark
 */
export type BenchmarkTableProps = {
  data: BenchmarkDataResponse;
  difficultyIndex?: number;
  overallRankResult?: RankCalculationResult;
};

/**
 * Represents the structure of the Steam profile data
 * 
 * Fields:
 * - steamid: The unique identifier for the Steam user
 * - personaname: The display name of the Steam user
 * - avatarfull: URL to the full avatar image of the Steam user
 * - profileUrl: URL to the user's Steam profile page
 */
export type SteamProfile = {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileUrl: string;
};

/**
 * Represents the structure of the benchmark data used in the profile page
 * Fields:
 * - message: Optional message, e.g., when no data is available
 * - difficulties: Array of difficulty objects, each containing the difficulty name and API data
 * Each difficulty object has:
 * - difficultyName: The name of the difficulty level
 * - apiData: The API data for this difficulty, containing progress and ranks
 */
export type BenchmarkData = {
  message?: string;
  difficulties?: Array<{
    difficultyName: string;
    apiData: BenchmarkApiData;
  }>;
};

/**
 * Represents the overall rank result for a player in a benchmark
 * 
 * Fields:
 * - rank: The player's rank in the benchmark
 * - rankName: The name of the rank
 * - useComplete: Indicates if the complete rank calculation was used
 * - fallbackUsed: Optional flag indicating if a fallback rank was used
 * - details: Optional additional details about the rank, such as progress to next rank or tie-break type
 */
export type OverallRankResult = {
  rank: number;
  rankName: string;
  useComplete: boolean;
  fallbackUsed?: boolean;
  details?: {
    progressToNextRank?: number;
    tieBreakType?: string;
    harmonicMean?: number;
    pinnacle?: boolean;
  };
};

/**
 * Represents a tag associated with a benchmark
 * Fields:
 * - abbreviation: The abbreviation for the tag (e.g., "VT")
 * - color: The color associated with the tag
 */
export type BenchmarkTag = {
  abbreviation: string;
  color: string;
};

/**
 * Represents a summary of benchmark information
 * Fields:
 * - name: The name of the benchmark
 * - tag: The tag associated with the benchmark
 * - difficultiesCount: The number of difficulties available for this benchmark
 * - totalScenarios: The total number of scenarios across all difficulties
 * - uniqueCategories: List of unique categories across all difficulties
 * - uniqueSubcategories: List of unique subcategories across all difficulties
 */
export type BenchmarkInfo = {
  name: string;
  tag: BenchmarkTag;
  difficultiesCount: number;
  totalScenarios: number;
  uniqueCategories: string[];
  uniqueSubcategories: string[];
};

/**
 * Represents the result of a rank calculation for a specific benchmark
 * Fields:
 * - rank: The calculated rank for the player
 * - details: Additional details about the rank calculation, such as progress to next rank or tie
 * - fallbackUsed: Optional flag indicating if a fallback rank was used
 */
export type RankCalculationResult = {
    rank: number;
    details: Record<string, any>;
    fallbackUsed?: boolean;
};

/**
 * Represents the rank information for a subcategory within a benchmark
 * Fields:
 * - baseRank: The base rank for the subcategory
 * - preciseRank: The precise rank for the subcategory
 * - progressToNext: The progress towards the next rank
 * - isMaxed: Indicates if the rank is maxed out
 * - scenarioName: The name of the scenario associated with this rank
 * - score: The score achieved in this scenario
 */
export type SubcategoryRankInfo = {
    baseRank: number;
    preciseRank: number;
    progressToNext: number;
    isMaxed: boolean;
    scenarioName: string;
    score: number;
};

/**
 * Represents the subcategory rank details for a player in a benchmark
 * Fields:
 * - category: The category of the subcategory
 * - subcategory: The name of the subcategory
 * - baseRank: The base rank for the subcategory
 * - preciseRank: The precise rank for the subcategory
 * - scenarioName: The name of the scenario associated with this subcategory
 * - score: The score achieved in this subcategory
 */
export type SubcategoryRank = {
    category: string;
    subcategory: string;
    baseRank: number;
    preciseRank: number;
    scenarioName: string;
    score: number;
};

/**
 * Represents the props for the BenchmarkDetails component
 * 
 * Fields:
 * - benchmarkData: The benchmark data response containing all relevant information
 * - selectedDifficulty: Optional difficulty name to filter the displayed data
 * - overallRankDetails: Optional overall rank details for the player in this benchmark
 */
export type BenchmarkDetailsProps = {
    benchmarkData?: BenchmarkDataResponse | null;
    selectedDifficulty?: string;
    overallRankDetails?: any;
};

/**
 * Represents the props for the RankSummary component
 * 
 * Fields:
 * - overallRank: The overall rank of the player in the benchmark
 * - limitingSubcategory: The subcategory that limits the overall rank, if applicable
 * - rankColors: Mapping of rank names to their associated colors
 */
export type RankSummaryProps = {
    overallRank: number;
    limitingSubcategory: SubcategoryRank | undefined;
    rankColors: Record<string, string>;
};

/**
 * Calculates CA-S1, VT-Energy, or custom harmonic mean ranks
 */
export type HarmonicRankConfig = {
    thresholds: number[];
    fakeLowerOffset: number;
    fakeUpperCount: number;
    filterSubcategories?: (subcategory: Subcategory) => boolean;
};

/**
 * Represents a row in the benchmark table.
 * Fields:
 * - categoryName: Name of the benchmark category
 * - categoryColor: Color associated with the category
 * - subcategoryName: Name of the benchmark subcategory
 * - subcategoryColor: Color associated with the subcategory
 * - scenarioName: Name of the benchmark scenario
 * - score: Score achieved in the scenario
 * - rank: Rank achieved in the scenario
 * - rankMaxes: Array ofd score thresholds for each rank
 */
export type TableRow = {
  categoryName: string;
  categoryColor: string;
  subcategoryName: string;
  subcategoryColor: string;
  scenarioName: string;
  score: number;
  rank: number;
  rankMaxes: number[];
};

export type IconProps = {
  size?: number;
  className?: string;
};