import { CONTENT } from '../src/config/content';
import { GAME } from '../src/config/game';
import type { Content } from '../src/config/schema';
import { UNITS } from '../src/config/units';
import type { SimEvent, SimEventType } from '../src/sim/types';
import { World, type WorldOptions } from '../src/sim/World';

export const DT = GAME.fixedStep;

/** Collects every event emitted while running. */
export class EventLog {
  readonly all: SimEvent[] = [];
  readonly sink = (e: SimEvent): void => void this.all.push(e);

  of<T extends SimEventType>(type: T): Array<Extract<SimEvent, { type: T }>> {
    return this.all.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
  }
  count(type: SimEventType): number {
    return this.all.filter((e) => e.type === type).length;
  }
}

/** A world with the AI disabled unless asked for, so scenarios are fully scripted. */
export function makeWorld(opts: WorldOptions = {}): World {
  return new World({ ai: false, ...opts });
}

export function run(w: World, seconds: number, log?: EventLog): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    w.step(DT);
    w.drainEvents(log ? log.sink : () => undefined);
  }
}

/** Step until `pred` is true; returns elapsed seconds or -1 on timeout. */
export function runUntil(w: World, pred: () => boolean, maxSeconds: number, log?: EventLog): number {
  const start = w.time;
  const max = Math.round(maxSeconds / DT);
  for (let i = 0; i < max; i++) {
    if (pred()) return w.time - start;
    w.step(DT);
    w.drainEvents(log ? log.sink : () => undefined);
  }
  return pred() ? w.time - start : -1;
}

export function contentWithUnit(id: string, patch: Partial<(typeof UNITS)[string]>): Content {
  return { ...CONTENT, units: { ...UNITS, [id]: { ...UNITS[id]!, ...patch } } };
}
