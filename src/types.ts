export const REMOTE_SOURCES = ['github', 'gitlab', 'npm', 'pypi', 'crates', 'maven', 'nuget', 'rubygems', 'packagist'] as const;
export const ECOSYSTEMS = ['auto', 'javascript', 'python', 'rust', 'java', 'dotnet', 'ruby', 'php', 'go'] as const;
export type RemoteSource = typeof REMOTE_SOURCES[number];
export type Ecosystem = typeof ECOSYSTEMS[number];
export type Source = 'local' | RemoteSource;
export type RegistrySource = Exclude<RemoteSource, 'github' | 'gitlab'>;
export interface PackageIdentity {
  source: RegistrySource;
  name: string;
  version?: string;
  url: string;
  metadataUrl?: string;
  registrationUrl?: string;
  platform?: string;
}
export interface SourceCapability {
  source: RemoteSource;
  ecosystems: string[];
  mode: 'repository_search' | 'package_search' | 'name_verification';
  limitations: string[];
}
export type SourceStatus = 'ok' | 'empty' | 'partial' | 'rate_limited' | 'timeout' | 'unavailable' | 'skipped';
export interface SearchPagination {
  pageSize: number;
  pagesFetched: number;
  itemsFetched: number;
  totalAvailable?: number;
  hasMore: boolean;
  stopReason: 'exhausted' | 'page_limit' | 'error' | 'budget' | 'no_new_candidates' | 'lookup';
  failedPage?: number;
}
export interface SourceResult {
  source: Source;
  query: string;
  effectiveQuery?: string;
  status: SourceStatus;
  candidates: Candidate[];
  elapsedMs: number;
  error?: { code: string; message: string; status?: number; retryAfterMs?: number };
  notes: string[];
  pagination?: SearchPagination;
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
  packages?: PackageIdentity[];
}
export interface Binding { sessionId: string; turnId: string }
export interface CheckInput {
  task: string;
  queries: string[];
  constraints?: string[];
  scope?: 'local' | 'full';
  ecosystem?: Ecosystem;
  sources?: RemoteSource[];
  packageNames?: string[];
  budgetMs?: number;
  maxPages?: number;
  useCache?: boolean;
  binding?: Binding;
  alignment?: AlignmentContract;
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
  analysis?: CodeAnalysis;
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
  sourcePlan?: (SourceCapability & { selected: boolean })[];
  candidates: Candidate[];
  inspections: Inspection[];
  notes: string[];
  alignmentPrompt?: string;
  alignments?: AlignmentReport[];
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
  alignmentId?: string;
}
export interface Decision extends DecisionInput {
  id: string;
  createdAt: string;
  contextHash: string;
  binding?: Binding;
  resultingFingerprint: string;
  nextAction: string;
}

export interface AlignmentContract {
  requirements: { id: string; description: string }[];
  /** Literal path/import prefixes, not regular expressions. */
  forbiddenImports?: { from: string; to: string }[];
}
export interface CodeSegment {
  id: string;
  path: string;
  kind: string;
  symbol: string;
  parentId?: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  fileHash: string;
  sha256: string;
  preview: string;
  previewTruncated: boolean;
  calls: string[];
  controls: { awaits: number; throws: number; catches: number; returns: number; branches: number };
  writes: string[];
}
export interface ImportEdge {
  from: string;
  specifier: string;
  resolvedPath?: string;
  line: number;
  kind: 'import' | 'export' | 'require' | 'dynamic';
  resolution?: 'resolved' | 'missing' | 'ambiguous' | 'external' | 'unsupported';
  targetPath?: string;
  targetModuleId?: string;
  reason?: string;
}
export interface CallEdge {
  fromSegmentId: string;
  from: string;
  line: number;
  callee: string;
  status: 'resolved' | 'unresolved';
  targetSegmentId?: string;
  // Modules traversed by an import/re-export, including the defining module.
  viaModuleIds?: string[];
  reason?: string;
}
export interface CodeLinkage {
  resolver: 'inspection-relative-v1';
  coverage: 'complete' | 'partial';
  calls: CallEdge[];
  gaps: string[];
}
export interface CodeAnalysis {
  parser: string;
  coverage: 'complete' | 'partial';
  segments: CodeSegment[];
  imports: ImportEdge[];
  gaps: string[];
  notes: string[];
  linkage?: CodeLinkage;
}
export interface AlignmentInput {
  checkId: string;
  choice: Choice;
  candidateIds: string[];
  evidenceIds: string[];
  segmentIds: string[];
  claims: { requirementId: string; verdict: 'supported' | 'conflict' | 'unknown'; rationale: string; segmentIds: string[] }[];
  alternatives: { kind: 'keep_existing' | 'selected' | 'other'; summary: string; tradeoffs: string }[];
  integration: { target: string; compatibility: string; validationPlan: string };
}
export interface AlignmentReport extends AlignmentInput {
  id: string;
  createdAt: string;
  status: 'ready' | 'blocked';
  coverage: 'complete' | 'partial';
  blockers: string[];
  gaps: string[];
  localSnapshots: { path: string; sha256: string }[];
  prompt: string;
  judgment: 'host_reported';
  callContext?: { evidenceId: string; edge: CallEdge }[];
}
