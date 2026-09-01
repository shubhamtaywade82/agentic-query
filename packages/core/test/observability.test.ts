import { describe, expect, it } from 'vitest';
import { CollectingQueryObserver, CompositeQueryObserver, NoopQueryObserver } from '../src/index.js';

describe('query observability', () => {
  it('collects immutable event snapshots', () => {
    const observer = new CollectingQueryObserver();
    const attributes = { attempts: 1 };
    observer.onEvent({ name: 'query.repaired', at: 1, attributes });

    attributes.attempts = 2;
    expect(observer.events).toEqual([{ name: 'query.repaired', at: 1, attributes: { attempts: 1 } }]);
  });

  it('fans events out to all observers', () => {
    const first = new CollectingQueryObserver();
    const second = new CollectingQueryObserver();
    const composite = new CompositeQueryObserver([first, second]);

    composite.onEvent({ name: 'query.executed', at: 10 });
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(1);
  });

  it('provides a no-op observer', () => {
    expect(() => new NoopQueryObserver().onEvent({ name: 'query.failed', at: 1 })).not.toThrow();
  });
});
