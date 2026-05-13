export class CancellationError extends Error {
  constructor() {
    super('Operation was cancelled by the user');
    this.name = 'CancellationError';
  }
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new CancellationError();
  }
}