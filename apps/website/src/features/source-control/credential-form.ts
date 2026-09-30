/**
 * @file The saved-credential form a git-host plugin declares for its host, under `credential` in its
 * `tovu-source-control.json` entry (`./provider-registry.ts`): what a person is asked for on the
 * admin Source Control page, the scope guidance shown beside it and where to create the token. Data
 * only, so the admin renders a host's form without core naming the host. Field names are the keys
 * of the saved connection (`token`, and e.g. `username` for a host that authenticates the pair).
 *
 * Mirrors the deploy target credential block (`features/deployments/deploy-targets/registry.ts`'s
 * `parseCredentialSpec`) minus its vendor-id and account-label parts, which have no use here.
 */

export interface SourceControlCredentialField {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  /** Never echoed back once saved; the form renders it as a password input. */
  readonly secret?: true;
}

export interface SourceControlCredentialForm {
  /** Person-facing guidance shown beside the form (which token, which scopes). */
  readonly help?: string;
  /** Where to create the token (https). */
  readonly tokenPageUrl?: string;
  /** Which field holds the token; always a declared, secret field. */
  readonly tokenField: string;
  readonly fields: readonly SourceControlCredentialField[];
}

const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;
const MAX_FIELDS = 10;
const MAX_LABEL_LENGTH = 100;
const MAX_HELP_LENGTH = 500;
/** A saved connection's own discriminant, so a field of that name would be ambiguous. */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set(["providerId"]);

/**
 * A provider's `credential` block (absent = none declared), or the reason it is invalid.
 *
 * @complexity O(f) in the declared field count.
 */
export function parseSourceControlCredentialForm(value: unknown, at: string): SourceControlCredentialForm | undefined | string {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return `${at} must be an object`;
  const { help, tokenPageUrl, tokenField = "token", fields } = value;
  if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) return `${at}.help must be a string of at most ${MAX_HELP_LENGTH} characters`;
  if (tokenPageUrl !== undefined && !isHttpsUrl(tokenPageUrl)) return `${at}.tokenPageUrl must be an https URL`;
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS) return `${at}.fields must be a list of 1 to ${MAX_FIELDS} fields`;

  const parsed: SourceControlCredentialField[] = [];
  for (const [index, entry] of fields.entries()) {
    const field = parseField(entry, `${at}.fields[${index}]`);
    if (typeof field === "string") return field;
    if (parsed.some((seen) => seen.name === field.name)) return `${at}.fields[${index}].name '${field.name}' is declared twice`;
    parsed.push(field);
  }
  const token = parsed.find((field) => field.name === tokenField);
  if (token === undefined || token.secret !== true) return `${at}.tokenField must name a declared secret field`;
  return {
    ...(help !== undefined ? { help: help as string } : {}),
    ...(tokenPageUrl !== undefined ? { tokenPageUrl } : {}),
    tokenField: token.name,
    fields: parsed,
  };
}

function parseField(entry: unknown, at: string): SourceControlCredentialField | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { name, label, required, secret } = entry;
  if (typeof name !== "string" || !FIELD_NAME_PATTERN.test(name)) return `${at}.name must be a camelCase identifier`;
  if (RESERVED_FIELD_NAMES.has(name)) return `${at}.name '${name}' is reserved`;
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) return `${at}.label must be a non-empty string`;
  if (required !== undefined && typeof required !== "boolean") return `${at}.required must be a boolean`;
  if (secret !== undefined && typeof secret !== "boolean") return `${at}.secret must be a boolean`;
  return { name, label, required: required === true, ...(secret === true ? { secret: true as const } : {}) };
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
