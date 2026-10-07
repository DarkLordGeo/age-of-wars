import type { SimEvent, SimEventType } from '../sim/types';

type Handler<T extends SimEventType> = (ev: Extract<SimEvent, { type: T }>) => void;

/**
 * Fan-out for simulation events. Effects, audio, UI toasts and analytics subscribe here;
 * none of them are known to the simulation.
 */
export class EventBus {
  private readonly handlers = new Map<SimEventType, Array<(ev: never) => void>>();

  on<T extends SimEventType>(type: T, fn: Handler<T>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (ev: never) => void);
    this.handlers.set(type, list);
    return () => {
      const i = list.indexOf(fn as (ev: never) => void);
      if (i >= 0) list.splice(i, 1);
    };
  }

  dispatch = (ev: SimEvent): void => {
    const list = this.handlers.get(ev.type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) (list[i] as (e: SimEvent) => void)(ev);
  };
}
