declare const value: unknown;
// ruleid: no-as-any
const unsafe = value as any;
// ruleid: no-as-any
const doubleCast = value as unknown as any;
// ok: no-as-any
const safe = value as { name: string };
// ok: no-as-any
const text = "as any";
// ok: no-as-any
const uncertain: unknown = value;
