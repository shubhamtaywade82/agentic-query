export type QueryEventName =
  | 'query.generated'
  | 'query.repaired'
  | 'query.validated'
  | 'query.compiled'
  | 'query.executed'
  | 'query.failed';

export interface QueryEvent {
  name: QueryEventName;
  at: number;
  durationMs?: number;
  attributes?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface QueryObserver {
  onEvent(event: QueryEvent): void;
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
}

export class CompositeQueryObserver implements QueryObserver {
  constructor(private readonly observers: readonly QueryObserver[]) {}

  onEvent(event: QueryEvent): void {
    for (const observer of this.observers) observer.onEvent(event);
  }
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Number((performance.now() - startedAt).toFixed(3)));
}
