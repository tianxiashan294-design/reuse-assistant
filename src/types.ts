export type Source = 'local' | 'github' | 'npm' | 'pypi';
export type SourceStatus = 'ok' | 'empty' | 'partial' | 'rate_limited' | 'timeout' | 'unavailable' | 'skipped';
export interface SourceResult {
  source: Source;
  query: string;
  effectiveQuery?: string;
  status: SourceStatus;
  candidates: Candidate[];
  elapsedMs: number;
  error?: { code: string; message: string; status?: number; retryAfterMs?: number };
  notes: string[];
}
export interface Candidate {
  id: string;
  source: Source;
  name: string;
  url: string;
  description: string;
  repository?: string;
  version?: string;
  license?: string;
  stars?: number;
  archived?: boolean;
  updatedAt?: string;
  localPath?: string;
  line?: number;
  matchedQueries?: string[];
  sources?: Source[];
  signals?: string[];
  aliases?: string[];
  packages?: { source: 'npm' | 'pypi'; name: string; version?: string; url: string }[];
}
export interface Binding { sessionId: string; turnId: string }
export interface CheckInput {
  task: string;
  queries: string[];
  constraints?: string[];
  scope?: 'local' | 'full';
  ecosystem?: 'auto' | 'javascript' | 'python';
  packageNames?: string[];
  budgetMs?: number;
  useCache?: boolean;
  binding?: Binding;
}
export interface EvidenceFile {
  path: string;
  url: string;
  ref?: string;
  content: string;
  sha256: string;
  truncated: boolean;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
}
export interface Inspection {
  id: string;
  candidateId: string;
  createdAt: string;
  status: 'complete' | 'partial';
  files: EvidenceFile[];
  metadata: Record<string, unknown>;
  errors: string[];
  notes: string[];
}
export interface CheckReport {
  id: string;
  createdAt: string;
  projectRoot: string;
  contextHash: string;
  input: CheckInput;
  coverage: 'complete' | 'partial';
  cached: boolean;
  cacheCreatedAt?: string;
  elapsedMs: number;
  sources: SourceResult[];
  candidates: Candidate[];
  inspections: Inspection[];
  notes: string[];
}
export type Choice = 'reuse_local' | 'adopt_dependency' | 'adapt_code' | 'reference_design' | 'build_new' | 'incomplete_continue';
export interface DecisionInput {
  checkId: string;
  choice: Choice;
  rationale: string;
  candidateIds?: string[];
  evidenceIds?: string[];
  status: 'planned' | 'applied' | 'verified';
  validation?: string;
  acknowledgeIncomplete?: boolean;
  previousDecisionId?: string;
}
export interface Decision extends DecisionInput {
  id: string;
  createdAt: string;
  contextHash: string;
  binding?: Binding;
  resultingFingerprint: string;
  nextAction: string;
}
