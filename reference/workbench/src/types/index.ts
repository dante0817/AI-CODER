export type ModelProvider = 'codex' | 'openai-compatible' | 'ollama' | 'anthropic' | 'google-gemini' | 'custom';

export type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';

export interface ModelCapabilities {
  structured_agent_plan: CapabilityStatus;
  reasoning: CapabilityStatus;
  image_input: CapabilityStatus;
  large_context: CapabilityStatus;
  reasoning_effort: CapabilityStatus;
  streaming: CapabilityStatus;
  native_tool_calling: CapabilityStatus;
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: ModelProvider;
  providerEndpoint?: string;
  isAvailable: boolean;
  discoveredAt: string;
  source: 'static_registry' | 'provider_discovery' | 'manual_user_entry';
  contextCapacityTokens: number;
  latencyClass: 'ultra-low' | 'balanced' | 'deep-reasoning';
  costClass: 'free-local' | 'budget' | 'standard' | 'premium';
  codingProfile: 'specialized_coder' | 'general_flagship' | 'compact_fast';
  capabilities: ModelCapabilities;
  verifiedCapabilities: boolean; // false if user manually entered or auto-discovered without probe
  discoveryNotes?: string;
}

export interface RoutingTask {
  id: string;
  prompt: string;
  requiresStructuredAgentPlan: boolean;
  requiresReasoning: boolean;
  requiresImageInput: boolean;
  requiresLargeContext: boolean;
  minContextTokens: number;
  localOnlyPolicy: boolean;
  userPreference: 'balanced' | 'prefer-quality' | 'prefer-speed' | 'prefer-low-cost';
  activeFilePath?: string;
}

export interface EligibilityResult {
  isEligible: boolean;
  hardDisqualifications: string[];
  passedChecks: string[];
}

export interface SoftScoreBreakdown {
  codingQuality: number;
  debuggingQuality: number;
  latencyScore: number;
  costScore: number;
  reasoningScore: number;
  contextCapacityScore: number;
  userPreferenceAdjustment: number;
  totalScore: number;
}

export interface CandidateEvaluation {
  model: ModelMetadata;
  eligibility: EligibilityResult;
  softScores: SoftScoreBreakdown;
  selectedByOldFlawedRouter?: boolean;
  oldFlawedScore?: number;
  oldFlawedReason?: string;
}

export interface RoutingDecision {
  task: RoutingTask;
  evaluatedCandidates: CandidateEvaluation[];
  selectedModel: ModelMetadata | null;
  routingExplanation: string;
  comparisonWithOldRouter: {
    oldSelectedModelId: string;
    oldSelectedModelName: string;
    flawedReason: string;
  };
}

// Context Retrieval Types
export interface RepoFile {
  path: string;
  sizeBytes: number;
  characters: number;
  language: string;
  content: string;
  symbols: string[];
  imports: string[];
  isSensitive: boolean; // .env, secrets, keys
  isControlFile: boolean; // .ai-coder/ internal files
}

export interface RankedContextFile {
  file: RepoFile;
  relevanceScore: number;
  reasons: string[];
  includedInBudget: boolean;
  cumulativeChars: number;
}

export interface ContextRetrievalResult {
  query: string;
  activeFilePath: string;
  selectedText?: string;
  extractedKeywords: string[];
  extractedSymbols: string[];
  rankedFiles: RankedContextFile[];
  excludedSensitiveFiles: string[];
  totalCharsBudget: number;
  usedCharsBudget: number;
  filesIncludedCount: number;
  filesTotalCount: number;
  comparisonWithNaiveAlphabetical: {
    naiveIncludedCount: number;
    naiveMissedRelevantFiles: string[];
    naiveWastedBudgetOnDocsOrArchive: number;
  };
}

// In-Memory Patch Compiler Types
export type PatchOpType = 'replace_exact_text' | 'replace_range' | 'insert_after' | 'create_file' | 'delete_file';

export interface PatchOperation {
  id: string;
  type: PatchOpType;
  path: string;
  baseSha256: string; // Base file SHA-256 for staleness protection
  searchTarget?: string;
  replacementContent?: string;
  startLine?: number;
  endLine?: number;
  insertAfterPattern?: string;
}

export interface PatchCompilationResult {
  success: boolean;
  targetPath: string;
  baseSha256Provided: string;
  actualBaseSha256: string;
  hashMatch: boolean;
  originalContent: string;
  compiledContent: string;
  compiledSha256: string;
  diffHunks: DiffHunk[];
  checkpointBackupId: string;
  error?: string;
}

export interface DiffHunk {
  type: 'unchanged' | 'removed' | 'added';
  lineOld?: number;
  lineNew?: number;
  content: string;
}

// Task & Worktree Lifecycle Types
export type TaskLifecycleState = 'active' | 'review' | 'applied' | 'completed' | 'archived';

export interface TaskWorktree {
  id: string;
  title: string;
  state: TaskLifecycleState;
  branchName: string;
  worktreePath: string;
  createdAt: string;
  updatedAt: string;
  pendingChangesCount: number;
  unappliedWorktreeModifications: boolean;
  hasRecoveryCheckpoints: boolean;
  filesModified: string[];
  lastCommitMessage?: string;
  mainBranchConflictRisk: 'none' | 'low' | 'high_conflict_detected';
}

// Security Conformance Test Vectors
export interface ConformanceVector {
  id: string;
  category: 'path_traversal' | 'sensitive_data' | 'control_boundary' | 'staleness_protection' | 'worktree_isolation' | 'command_restriction';
  name: string;
  description: string;
  input: {
    targetPath?: string;
    baseSha256?: string;
    actualSha256?: string;
    allowSensitive?: boolean;
    allowControl?: boolean;
    command?: string;
  };
  expectedAction: 'reject' | 'allow' | 'require_confirmation';
  expectedErrorCode?: string;
  pythonStatus: 'pass' | 'fail';
  typescriptStatus: 'pass' | 'fail';
  securityInvariant: string;
}

// Atomic Persistence Simulator Types
export interface PersistenceWorkerLog {
  workerId: number;
  timestamp: string;
  strategy: 'naive_direct_write' | 'hardened_atomic_replace';
  outcome: 'success' | 'race_corruption_detected' | 'stale_overwrite';
  payloadVersion: number;
  details: string;
}
