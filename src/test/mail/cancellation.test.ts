import * as assert from 'assert';
import { CancellationError, throwIfCancelled } from '../../cancellation';

describe('CancellationError', () => {
  it('should have correct name and message', () => {
    const err = new CancellationError();
    assert.strictEqual(err.name, 'CancellationError');
    assert.strictEqual(err.message, 'Operation was cancelled by the user');
  });

  it('should be an instance of Error', () => {
    const err = new CancellationError();
    assert.ok(err instanceof Error);
  });

  it('should be distinguishable from generic errors', () => {
    const err = new CancellationError();
    const generic = new Error('something else');
    assert.ok(err instanceof CancellationError);
    assert.ok(!(generic instanceof CancellationError));
  });
});

describe('throwIfCancelled', () => {
  it('should not throw when signal is not aborted', () => {
    const ac = new AbortController();
    assert.doesNotThrow(() => throwIfCancelled(ac.signal));
  });

  it('should throw CancellationError when signal is aborted', () => {
    const ac = new AbortController();
    ac.abort();
    assert.throws(() => throwIfCancelled(ac.signal), CancellationError);
  });

  it('should throw with correct message when aborted', () => {
    const ac = new AbortController();
    ac.abort();
    try {
      throwIfCancelled(ac.signal);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof CancellationError);
      assert.strictEqual(e.message, 'Operation was cancelled by the user');
    }
  });

  it('should throw immediately on already-aborted signal', () => {
    const ac = new AbortController();
    ac.abort();
    assert.throws(() => throwIfCancelled(ac.signal), CancellationError);
  });

  it('should not throw before abort, then throw after abort', () => {
    const ac = new AbortController();
    assert.doesNotThrow(() => throwIfCancelled(ac.signal));
    ac.abort();
    assert.throws(() => throwIfCancelled(ac.signal), CancellationError);
  });
});

describe('AbortController integration', () => {
  it('should allow checking abort reason', () => {
    const ac = new AbortController();
    ac.abort('user cancelled');
    assert.strictEqual(ac.signal.reason, 'user cancelled');
  });

  it('signal.aborted should be true after abort', () => {
    const ac = new AbortController();
    assert.strictEqual(ac.signal.aborted, false);
    ac.abort();
    assert.strictEqual(ac.signal.aborted, true);
  });

  it('should support addEventListener on signal', (done) => {
    const ac = new AbortController();
    ac.signal.addEventListener('abort', () => {
      assert.strictEqual(ac.signal.aborted, true);
      done();
    });
    ac.abort();
  });

  it('abort event listener should fire when abort is called', () => {
    const ac = new AbortController();
    let fired = false;
    ac.signal.addEventListener('abort', () => { fired = true; });
    ac.abort();
    assert.strictEqual(fired, true);
  });
});

describe('Simulated CancellationToken pattern', () => {
  it('should propagate cancellation through AbortController', () => {
    const ac = new AbortController();
    const { signal } = ac;

    assert.doesNotThrow(() => throwIfCancelled(signal));

    ac.abort();

    assert.throws(() => throwIfCancelled(signal), CancellationError);
  });

  it('should work with async cancellation between await points', async () => {
    const ac = new AbortController();
    const { signal } = ac;

    assert.doesNotThrow(() => throwIfCancelled(signal));

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assert.doesNotThrow(() => throwIfCancelled(signal));

    ac.abort();

    assert.throws(() => throwIfCancelled(signal), CancellationError);
  });

  it('should handle pre-aborted signal', () => {
    const ac = new AbortController();
    ac.abort();

    assert.throws(() => throwIfCancelled(ac.signal), CancellationError);
  });
});