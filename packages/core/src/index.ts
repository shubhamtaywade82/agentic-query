/**
 * Public API surface for `@agentic-query/core`.
 *
 * All sibling modules import from `ast.ts`/`model.ts`/`policy.ts` directly;
 * this barrel exists for consumers only and adds no runtime dependencies.
 */
export {
  AGGREGATES,
  AST_VERSION,
  ABSOLUTE_MAX_ROWS,
  COMPARISON_OPERATORS,
  JOIN_TYPES,
  ORDER_DIRECTIONS,
  SUPPORTED_AST_VERSIONS,
  QueryValidationError,
  computeQueryComplexity,
  fieldEntities,
  queryFieldRefs,
  validateQuery,
  type Aggregate,
  type ComparisonOperator,
  type EntityRef,
  type FieldRef,
  type Filter,
  type Join,
  type JoinType,
  type OrderBy,
  type OrderDirection,
  type Query,
  type QuerySelectExpression,
  type SelectExpression,
  type SemanticQuery,
  type SemanticReference,
  type SemanticSelectExpression,
  type SupportedAstVersion
} from './ast.js';

export {
  capabilityAllowed,
  forcedFiltersFor,
  mergePolicies,
  validatePolicy,
  type QueryPolicy
} from './policy.js';

export type { EntitySchema, FieldSchema, RelationSchema, QueryAdapter, SchemaProvider } from './adapter.js';
export {
  nextRequestId,
  type ModelMessage,
  type ModelProvider,
  type ModelProviderCapabilities,
  type QueryGenerationRequest,
  type QueryGenerator,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type TraceMetadata,
  type UsageAccounting
} from './model.js';

export { StructuredQueryGenerator, QUERY_AST_SCHEMA, QueryGenerationError, type StructuredQueryGeneratorOptions } from './query-generator.js';
export { SemanticQueryGenerator, SEMANTIC_QUERY_SCHEMA, type SemanticQueryGeneratorOptions, type SemanticQueryGenerationRequest } from './semantic-generator.js';
export {
  AgenticQueryAgent,
  type AgentOptions,
  type AgentPolicy,
  type AgentResult,
  type AgentAskOptions
} from './agent.js';
export { QueryRepairer, QueryRepairError, type QueryRepairOptions } from './repair.js';
export {
  SemanticCatalog,
  SemanticResolutionError,
  type DimensionDefinition,
  type MetricDefinition,
  type MetricFormula,
  type MetricOperand,
  type SemanticCatalogDefinition,
  type SelectMetricExpression
} from './semantic.js';
export {
  resolveSemanticSelect,
  resolveSemanticQuery,
  resolveSemanticQueryDetailed,
  type ComputationNode,
  type DerivedComputation,
  type SemanticResolution
} from './semantic-query.js';
export {
  HybridSchemaRetriever,
  SimpleSchemaRetriever,
  estimateTokens,
  formatSchemaContext,
  type HybridSchemaRetrieverOptions,
  type HybridScorer,
  type SchemaRetrievalRequest,
  type SchemaRetriever,
  type SimpleSchemaRetrieverOptions
} from './schema-retriever.js';
export {
  DeterministicQueryPlanner,
  PlanValidationError,
  isDerivedComputationStep,
  isQueryPlanStep,
  planTopologicalOrder,
  serializeQueryPlan,
  validateQueryPlan,
  type DerivedComputationStep,
  type PlanContext,
  type PlanStep,
  type PlanStepId,
  type QueryPlan,
  type QueryPlanStep,
  type QueryPlanner
} from './planner.js';
export {
  applyComputations,
  evaluateComputation,
  executeQueryPlan,
  planQueryMap,
  type PlanExecutionOptions,
  type PlanExecutionResult,
  type PlanStepResult
} from './plan-executor.js';
export {
  CollectingQueryObserver,
  CompositeQueryObserver,
  NoopQueryObserver,
  OpenTelemetryBridge,
  elapsedMs,
  withMetadata,
  type EventMetadata,
  type OtelSink,
  type OtelSpanLike,
  type QueryEvent,
  type QueryEventAttributes,
  type QueryEventName,
  type QueryObserver
} from './observability.js';
export {
  capQueryResult,
  normalizeAggregateResult,
  normalizeRowsResult,
  normalizeTupleResult,
  serializeQueryResult,
  type NormalizationOptions,
  type QueryResult,
  type ResultColumn,
  type ResultColumnType,
  type ResultMetadata
} from './result.js';
export {
  AnswerSynthesizer,
  AnswerSynthesisError,
  type AnswerSynthesisContext,
  type AnswerSynthesisRequest,
  type AnswerSynthesisResult,
  type AnswerSynthesizerOptions
} from './synthesis.js';
export {
  assertConformanceCase,
  runConformanceSuite,
  type ConformanceAdapter,
  type ConformanceCase,
  type ConformanceExpectation,
  type ConformanceProbes,
  type ConformanceSuite
} from './conformance.js';
export {
  evaluateGoldenDataset,
  screenForInjection,
  type EvaluationFailure,
  type EvaluationMetrics,
  type EvaluationOptions,
  type GoldenCase,
  type GoldenDataset
} from './evaluation.js';
