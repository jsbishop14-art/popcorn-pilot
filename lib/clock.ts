// The hub's clock for the playback engine, kid rules and snap back. Tests replace it with a fake clock.
let clockFn: () => number = () => Date.now();

export function now(): number {
  return clockFn();
}

/** Tests only: a fake clock (null puts the real one back). */
export function setClockForTests(fn: (() => number) | null): void {
  clockFn = fn ?? (() => Date.now());
}
