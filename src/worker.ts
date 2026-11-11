import { nearestFeasible, optimalLayouts } from "./model";

// The searches can take a long time (a minute for db97531): off the page's thread, one call per worker, so a stale
// search is stopped by terminating its worker.
const fns = { optimalLayouts, nearestFeasible } as Record<string, (...args: any[]) => unknown>;
self.onmessage = (e: MessageEvent<{ fn: string; args: unknown[] }>) =>
  self.postMessage(fns[e.data.fn](...e.data.args));
