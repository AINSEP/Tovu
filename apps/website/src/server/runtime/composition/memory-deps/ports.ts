/** Canonical Jini clocks use milliseconds; existing CMS/DB host ports still read ISO timestamps. */
export interface MemoryClock {
  nowMs: () => number;
  nowIso: () => string;
}

export interface MemoryIdGen {
  newId: () => string;
}
