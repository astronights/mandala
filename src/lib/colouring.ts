/**
 * Colouring state with undo/redo, as a pure reducer.
 * Fills map region index -> palette index; a missing key is bare paper.
 */

export type Fills = Readonly<Record<number, number>>;

export interface ColouringState {
  fills: Fills;
  past: Fills[];
  future: Fills[];
}

export type ColouringAction =
  | { type: "paint"; indices: number[]; colour: number | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "load"; fills: Fills };

export const HISTORY_LIMIT = 200;

export function initialColouring(fills: Fills = {}): ColouringState {
  return { fills, past: [], future: [] };
}

function commit(state: ColouringState, next: Fills): ColouringState {
  const past = [...state.past, state.fills];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { fills: next, past, future: [] };
}

export function colouringReducer(state: ColouringState, action: ColouringAction): ColouringState {
  switch (action.type) {
    case "paint": {
      let changed = false;
      const next: Record<number, number> = { ...state.fills };
      for (const i of action.indices) {
        if (action.colour === null) {
          if (i in next) {
            delete next[i];
            changed = true;
          }
        } else if (next[i] !== action.colour) {
          next[i] = action.colour;
          changed = true;
        }
      }
      return changed ? commit(state, next) : state;
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const past = state.past.slice(0, -1);
      return {
        fills: state.past[state.past.length - 1],
        past,
        future: [state.fills, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...future] = state.future;
      return { fills: next, past: [...state.past, state.fills], future };
    }
    case "clear":
      return Object.keys(state.fills).length === 0 ? state : commit(state, {});
    case "load":
      return initialColouring(action.fills);
  }
}

/** Share of regions coloured, 0..1. */
export function progress(fills: Fills, regionCount: number): number {
  if (regionCount <= 0) return 0;
  return Math.min(1, Object.keys(fills).length / regionCount);
}
