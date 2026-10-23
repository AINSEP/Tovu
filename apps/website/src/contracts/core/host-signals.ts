/** Shipped platform declarations are hints. Core consumers retain the final security policy. */
export interface HostSignal {
  readonly env: string;
  readonly facts: {
    readonly hosted?: boolean;
    readonly trustProxyHops?: number;
    readonly nativeToolsRestricted?: boolean;
  };
  readonly label?: string;
}

export interface HostSignalDeclaration {
  readonly signals: readonly HostSignal[];
  readonly deploymentAdvice?: string;
}

export interface HostSignals {
  readonly hosted: boolean;
  readonly nativeToolsRestricted: boolean;
  readonly trustProxyHops?: number;
  readonly labels: readonly string[];
  readonly deploymentAdvice?: string;
}

/** The host supplies facts; shared policy modules do no filesystem or plugin I/O. */
export interface HostSignalOptions { readonly hostSignals?: HostSignals }

/** Immutable legacy warning copy: deployment diagnostics must survive missing plugin metadata. */
export const LEGACY_DEPLOYMENT_ADVICE = "Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).";

/**
 * Security exception to vendor extraction (phase 4 CHECK): baseline protections cannot depend on
 * plugin discovery. Keep HEAD's exact matrix when data is missing, invalid or ambiguous; never
 * fail boot. APP identifies the edge proxy and hosted install context; MACHINE/ALLOC alone only
 * restrict native tools. Legacy truthiness includes whitespace and "0". Core owns this fallback.
 */
export const CORE_HOST_SIGNAL_FALLBACK: HostSignalDeclaration = Object.freeze({
  signals: Object.freeze([
    Object.freeze({ env: "FLY_APP_NAME", facts: Object.freeze({ hosted: true, trustProxyHops: 1, nativeToolsRestricted: true }), label: "Fly.io (FLY_APP_NAME)" }),
    Object.freeze({ env: "FLY_MACHINE_ID", facts: Object.freeze({ nativeToolsRestricted: true }) }),
    Object.freeze({ env: "FLY_ALLOC_ID", facts: Object.freeze({ nativeToolsRestricted: true }) }),
  ]),
  deploymentAdvice: LEGACY_DEPLOYMENT_ADVICE,
});

/** Compare a baseline signal's full contract without depending on JSON property order.
 * @complexity O(f) time/space for the fixed set of fact keys; pure and nonthrowing for typed data. */
function sameSecuritySignal({ signal, baseline }: { signal: HostSignal; baseline: HostSignal }, _optional = {}): boolean {
  return signal.env === baseline.env && signal.label === baseline.label &&
    Object.keys(signal.facts).length === Object.keys(baseline.facts).length &&
    Object.entries(baseline.facts).every(([key, value]) => signal.facts[key as keyof HostSignal["facts"]] === value);
}

/**
 * Keep the core baseline if a validated declaration lacks any legacy security fact or has duplicate
 * ownership. A partial valid declaration must not mask the loss of another security signal.
 * @param required Validated bundled data, or undefined when discovery failed.
 * @returns The complete declaration or the immutable HEAD fallback; no I/O or input mutation.
 * @complexity O(s) time/space for s signals and a fixed three-signal baseline.
 * @example selectCoreHostSignalDeclaration({ declaration });
 */
export function selectCoreHostSignalDeclaration(
  { declaration }: { declaration?: HostSignalDeclaration }, _optional = {},
): HostSignalDeclaration {
  if (declaration === undefined) return CORE_HOST_SIGNAL_FALLBACK;
  const names = new Set(declaration.signals.map(signal => signal.env));
  if (names.size !== declaration.signals.length) return CORE_HOST_SIGNAL_FALLBACK;
  const complete = CORE_HOST_SIGNAL_FALLBACK.signals.every(baseline =>
    declaration.signals.some(signal => sameSecuritySignal({ signal, baseline })));
  return complete ? declaration : CORE_HOST_SIGNAL_FALLBACK;
}

/**
 * Evaluate declared env names using legacy truthiness (no trimming or boolean coercion of text).
 * @param required Env snapshot and validated product-owned declaration; neither is mutated.
 * @returns Matched hints. Conflicting proxy defaults yield no trust hint; restrictions only OR.
 * @complexity O(s) time and space for s shipped signals. No I/O or thrown errors.
 * @example evaluateHostSignals({ env, declaration });
 */
export function evaluateHostSignals(
  { env, declaration }: { env: Readonly<Record<string, string | undefined>>; declaration: HostSignalDeclaration },
  _optional = {},
): HostSignals {
  const matched = declaration.signals.filter(signal => !!env[signal.env]);
  const hops = [...new Set(matched.flatMap(signal => signal.facts.trustProxyHops === undefined ? [] : [signal.facts.trustProxyHops]))];
  return {
    hosted: matched.some(signal => signal.facts.hosted === true),
    nativeToolsRestricted: matched.some(signal => signal.facts.nativeToolsRestricted === true),
    trustProxyHops: hops.length === 1 ? hops[0] : undefined,
    labels: matched.flatMap(signal => signal.label === undefined ? [] : [signal.label]),
    ...(declaration.deploymentAdvice === undefined ? {} : { deploymentAdvice: declaration.deploymentAdvice }),
  };
}
