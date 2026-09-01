/**
 * Observability (plan §11).
 *
 * Minimal event set, rich metadata, and an OpenTelemetry-compatible bridge
 * without hard-coupling core to any telemetry vendor.
 */

export type QueryEventName =
  | 'agent.started'
  | 'schema.retrieved'
  | 'plan.generated'
  | 'query.generated'
  | 'query.validation_failed'
  | 'query.repaired'
  | 'query.validated'
  | 'query.compiled'
  | 'query.executed'
  | 'query.failed'
  | 'answer.generated'
  | 'agent.completed';

export interface QueryEventAttributes {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface QueryEvent {
  name: QueryEventName;
  at: number;
  durationMs?: number | undefined;
  attributes?: QueryEventAttributes | undefined;
}

export interface QueryObserver {
  onEvent(event: QueryEvent): void;
}

/** Correlation metadata attached to every event of a request. */
export interface EventMetadata {
  requestId?: string | undefined;
  tenantId?: string | undefined;
  model?: string | undefined;
  provider?: string | undefined;
}

export function withMetadata(event: QueryEvent, metadata: EventMetadata): QueryEvent {
  const attributes: Record<string, string | number | boolean | null | undefined> = {
    ...event.attributes,
    ...(metadata.requestId !== undefined ? { requestId: metadata.requestId } : {}),
    ...(metadata.tenantId !== undefined ? { tenantId: metadata.tenantId } : {}),
    ...(metadata.model !== undefined ? { model: metadata.model } : {}),
    ...(metadata.provider !== undefined ? { provider: metadata.provider } : {})
  };
  return { ...event, attributes };
}

export class NoopQueryObserver implements QueryObserver {
  onEvent(_event: QueryEvent): void {}
}

export class CollectingQueryObserver implements QueryObserver {
  readonly events: QueryEvent[] = [];

  onEvent(event: QueryEvent): void {
    this.events.push(
      event.attributes ? { ...event, attributes: { ...event.attributes } } : { ...event }
    );
  }

  names(): readonly QueryEventName[] {
    return this.events.map((event) => event.name);
  }

  reset(): void {
    this.events.length = 0;
  }
}

export class CompositeQueryObserver implements QueryObserver {
  constructor(private readonly observers: readonly QueryObserver[]) {}

  onEvent(event: QueryEvent): void {
    for (const observer of this.observers) observer.onEvent(event);
  }
}

/**
 * Minimal OpenTelemetry-compatible bridge. The host supplies a span-like
 * sink; Agentic Query never imports OTel SDK packages, so core stays
 * vendor-neutral while event data lands in real telemetry pipelines.
 */
export interface OtelSpanLike {
  /** Span name; Agentic Query prefixes `agentic_query.`. */
  name: string;
  startTime?: number | undefined;
  endTime?: number | undefined;
  attributes?: Readonly<Record<string, string | number | boolean>> | undefined;
}

export interface OtelSink {
  emitSpan(span: OtelSpanLike): void;
}

export class OpenTelemetryBridge implements QueryObserver {
  private readonly sink: OtelSink;
  private readonly metadata: EventMetadata;

  constructor(sink: OtelSink, metadata: EventMetadata = {}) {
    this.sink = sink;
    this.metadata = metadata;
  }

  onEvent(event: QueryEvent): void {
    const attributes: Record<string, string | number | boolean> = {};
    if (this.metadata.requestId !== undefined) attributes['agentic_query.request_id'] = this.metadata.requestId;
    if (this.metadata.tenantId !== undefined) attributes['agentic_query.tenant_id'] = this.metadata.tenantId;
    if (this.metadata.model !== undefined) attributes['agentic_query.model'] = this.metadata.model;
    if (this.metadata.provider !== undefined) attributes['agentic_query.provider'] = this.metadata.provider;
    if (event.durationMs !== undefined) attributes['agentic_query.duration_ms'] = event.durationMs;
    for (const [key, value] of Object.entries(event.attributes ?? {})) {
      if (value !== null && value !== undefined) attributes[`agentic_query.${key}`] = value;
    }

    this.sink.emitSpan({
      name: `agentic_query.${event.name}`,
      attributes,
      ...(event.durationMs !== undefined ? { startTime: event.at - event.durationMs, endTime: event.at } : {})
    });
  }
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Number((performance.now() - startedAt).toFixed(3)));
}
