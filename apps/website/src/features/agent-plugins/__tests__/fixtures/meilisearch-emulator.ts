import type { HttpRequest, HttpResponse } from "@jini-ai/core/primitives";

/**
 * @file A Meilisearch v1.x EMULATOR, written as the handler of a fake `HttpClientPort`
 * (`createFakeHttpClient({ handle })` from `@jini-ai/search/testkit`), so the bundled `meilisearch`
 * provider is exercised end to end with no network and no server.
 *
 * It implements exactly the endpoints the provider calls, with Meilisearch's real semantics where the
 * provider depends on them:
 * - every write (`POST /indexes`, `PATCH .../settings`, `DELETE /indexes/{uid}`, `POST .../documents`)
 *   answers `202 {taskUid}` and changes NOTHING until the task runs; tasks run in enqueue order, all
 *   pending ones up to the polled uid, when `GET /tasks/{uid}` is called (optionally only after
 *   `pollsBeforeDone` earlier polls answered `processing`);
 * - `POST .../documents` REPLACES whole documents (no field of an older version survives);
 * - `POST .../documents/fetch` and `POST .../search` answer synchronously from processed state, `404
 *   index_not_found` for a missing index, and refuse a filter on an attribute that is not in
 *   `filterableAttributes` (`400 invalid_*_filter`), as the server does;
 * - the filter grammar is exactly the subset the provider emits: `attr = value` and
 *   `attr IN [v, ...]` joined by `AND`, values being `"strings"` (with `\"`/`\\` escapes), numbers,
 *   `true` or `false`; array attributes match when any element matches;
 * - search: every query word must match a word of a searchable attribute, exactly, as a prefix (the
 *   last word only), or within Meilisearch's default typo budget (1 typo from 5 chars, 2 from 9);
 *   `_formatted.body` is cropped to `cropLength` words around the first match with `…` markers and
 *   matches wrapped in the requested highlight tags; `_rankingScore` is in 0..1; ties keep insertion
 *   order, so pages are stable.
 * Auth: every request must carry `Authorization: Bearer <apiKey>`, otherwise `401 invalid_api_key`.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Doc = Record<string, Json>;

interface Index {
  readonly uid: string;
  filterable: readonly string[];
  searchable: readonly string[];
  readonly docs: Map<string, Doc>;
}

interface Task {
  readonly taskUid: number;
  status: "enqueued" | "processing" | "succeeded" | "failed";
  error?: { code: string; type: string };
  polls: number;
  readonly run: () => { code: string; type: string } | undefined;
}

export interface MeilisearchEmulator {
  readonly handle: (input: { readonly request: HttpRequest }) => HttpResponse;
  /** Processed documents of an index (undefined when the index does not exist). */
  readonly documents: (indexUid: string) => readonly Doc[] | undefined;
  readonly taskCount: () => number;
}

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, headers: { "content-type": "application/json", ...headers }, bodyText: JSON.stringify(body) });
const error = (status: number, code: string, type = "invalid_request"): HttpResponse => reply(status, { message: `emulated ${code}`, code, type, link: `https://docs.meilisearch.com/errors#${code}` });

// ---------------------------------------------------------------------------------------------
// Filter grammar (the subset the provider emits)
// ---------------------------------------------------------------------------------------------

type Clause = { readonly attribute: string; readonly values: readonly string[] };

const TOKEN = /\s*(?:("(?:[^"\\]|\\.)*")|(\[|\]|,|=)|([A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?))/y;

function tokenize(filter: string): string[] | undefined {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < filter.length) {
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(filter);
    if (match === null) return filter.slice(start).trim() === "" ? tokens : undefined;
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

/** A filter value as the string Meilisearch compares (`"a"` -> `a`, `false` -> `false`, `3` -> `3`). */
function literal(token: string | undefined): string | undefined {
  if (token === undefined || /^[[\],=]$/.test(token)) return undefined;
  if (!token.startsWith('"')) return /^(true|false|-?\d+(\.\d+)?)$/.test(token) ? token : undefined;
  return token.slice(1, -1).replace(/\\(.)/g, "$1");
}

function parseList(tokens: readonly string[], at: number): { values: string[]; next: number } | undefined {
  if (tokens[at] !== "[") return undefined;
  const values: string[] = [];
  let index = at + 1;
  while (tokens[index] !== "]") {
    const value = literal(tokens[index]);
    if (value === undefined) return undefined;
    values.push(value);
    index += 1;
    if (tokens[index] === ",") index += 1;
    else if (tokens[index] !== "]") return undefined;
  }
  return { values, next: index + 1 };
}

function parseClause(tokens: readonly string[], at: number): { clause: Clause; next: number } | undefined {
  const attribute = tokens[at];
  if (attribute === undefined || !/^[A-Za-z_]\w*$/.test(attribute)) return undefined;
  if (tokens[at + 1] === "=") {
    const value = literal(tokens[at + 2]);
    return value === undefined ? undefined : { clause: { attribute, values: [value] }, next: at + 3 };
  }
  if (tokens[at + 1] !== "IN") return undefined;
  const list = parseList(tokens, at + 2);
  return list === undefined ? undefined : { clause: { attribute, values: list.values }, next: list.next };
}

export function parseFilter(filter: string): Clause[] | undefined {
  const tokens = tokenize(filter);
  if (tokens === undefined) return undefined;
  const clauses: Clause[] = [];
  let index = 0;
  for (;;) {
    const parsed = parseClause(tokens, index);
    if (parsed === undefined) return undefined;
    clauses.push(parsed.clause);
    index = parsed.next;
    if (index === tokens.length) return clauses;
    if (tokens[index] !== "AND") return undefined;
    index += 1;
  }
}

function asComparable(value: Json | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return value === undefined || value === null ? [] : [String(value)];
}

const matchesFilter = (doc: Doc, clauses: readonly Clause[]): boolean =>
  clauses.every((clause) => asComparable(doc[clause.attribute]).some((value) => clause.values.includes(value)));

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

const WORD = /[\p{L}\p{N}]+/gu;
const wordsOf = (text: string): string[] => (text.toLowerCase().match(WORD) ?? []);

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** Meilisearch's default typo budget: none under 5 characters, 1 from 5, 2 from 9. */
function typoBudget(term: string): number {
  if (term.length >= 9) return 2;
  return term.length >= 5 ? 1 : 0;
}

/** 1 for an exact or prefix match, 0.5 for a typo match, 0 for none. */
function termScore(term: string, word: string, isLast: boolean): number {
  if (word === term || (isLast && word.startsWith(term))) return 1;
  return editDistance(term, word) <= typoBudget(term) ? 0.5 : 0;
}

function makeMatcher(terms: readonly string[]): (word: string) => boolean {
  return (word) => terms.some((term, index) => termScore(term, word, index === terms.length - 1) > 0);
}

function scoreOf(doc: Doc, terms: readonly string[], searchable: readonly string[]): number {
  let total = 0;
  for (const [index, term] of terms.entries()) {
    const best = Math.max(0, ...searchable.flatMap((attribute) => wordsOf(String(doc[attribute] ?? "")).map((word) => termScore(term, word, index === terms.length - 1))));
    if (best === 0) return 0;
    total += best;
  }
  return total / terms.length;
}

function cropAndHighlight(text: string, matches: (word: string) => boolean, options: { cropLength: number; pre: string; post: string }): string {
  const words = [...text.matchAll(WORD)].map((found) => ({ start: found.index, end: found.index + found[0].length, hit: matches(found[0].toLowerCase()) }));
  if (words.length === 0) return text;
  const first = Math.max(0, words.findIndex((word) => word.hit));
  const from = Math.max(0, Math.min(first - Math.floor(options.cropLength / 2), words.length - options.cropLength));
  const to = Math.min(words.length, from + options.cropLength);
  let out = from > 0 ? "…" : "";
  let cursor = (words[from] as (typeof words)[number]).start;
  for (const word of words.slice(from, to)) {
    out += text.slice(cursor, word.start) + (word.hit ? `${options.pre}${text.slice(word.start, word.end)}${options.post}` : text.slice(word.start, word.end));
    cursor = word.end;
  }
  return out + (to < words.length ? "…" : "");
}

/** Meilisearch's crop/highlight defaults: 10 words, `<em>` tags. */
const cropOptions = (body: Doc) => ({ cropLength: Number(body.cropLength ?? 10), pre: String(body.highlightPreTag ?? "<em>"), post: String(body.highlightPostTag ?? "</em>") });

const project = (doc: Doc, fields: readonly string[] | undefined): Doc =>
  fields === undefined ? { ...doc } : Object.fromEntries(fields.filter((field) => field in doc).map((field) => [field, doc[field] as Json]));

// ---------------------------------------------------------------------------------------------
// The emulator
// ---------------------------------------------------------------------------------------------

/**
 * @param required.host - The origin requests must target, e.g. `https://ms.test`.
 * @param required.apiKey - The only accepted bearer key.
 * @param optional.pollsBeforeDone - `GET /tasks/{uid}` polls answered `processing` before the queue runs.
 */
export function createMeilisearchEmulator(required: { readonly host: string; readonly apiKey: string }, optional: { readonly pollsBeforeDone?: number } = {}): MeilisearchEmulator {
  const indexes = new Map<string, Index>();
  const tasks: Task[] = [];
  const pollsBeforeDone = optional.pollsBeforeDone ?? 0;

  const indexOf = (uid: string): Index => {
    const existing = indexes.get(uid);
    if (existing) return existing;
    const created: Index = { uid, filterable: [], searchable: ["*"], docs: new Map() };
    indexes.set(uid, created);
    return created;
  };

  const enqueue = (run: Task["run"]): HttpResponse => {
    const task: Task = { taskUid: tasks.length, status: "enqueued", polls: 0, run };
    tasks.push(task);
    return reply(202, { taskUid: task.taskUid, status: "enqueued", enqueuedAt: "2026-10-21T00:00:00Z" });
  };

  const runQueueUpTo = (uid: number): void => {
    for (const task of tasks.slice(0, uid + 1)) {
      if (task.status !== "enqueued" && task.status !== "processing") continue;
      const failure = task.run();
      task.status = failure === undefined ? "succeeded" : "failed";
      if (failure !== undefined) task.error = failure;
    }
  };

  const getTask = (uid: string): HttpResponse => {
    const task = /^\d+$/.test(uid) ? tasks[Number(uid)] : undefined;
    if (task === undefined) return error(404, "task_not_found");
    task.polls += 1;
    if (task.polls > pollsBeforeDone) runQueueUpTo(task.taskUid);
    else task.status = "processing";
    return reply(200, { uid: task.taskUid, status: task.status, ...(task.error ? { error: { message: "emulated", ...task.error } } : {}) });
  };

  const createIndex = (body: Doc): HttpResponse => {
    const uid = String(body.uid ?? "");
    if (!/^[A-Za-z0-9_-]{1,400}$/.test(uid)) return error(400, "invalid_index_uid");
    return enqueue(() => {
      if (indexes.has(uid)) return { code: "index_already_exists", type: "invalid_request" };
      indexOf(uid);
      return undefined;
    });
  };

  const updateSettings = (uid: string, body: Doc): HttpResponse => enqueue(() => {
    const index = indexOf(uid);
    if (Array.isArray(body.filterableAttributes)) index.filterable = body.filterableAttributes.map(String);
    if (Array.isArray(body.searchableAttributes)) index.searchable = body.searchableAttributes.map(String);
    return undefined;
  });

  const deleteIndex = (uid: string): HttpResponse => enqueue(() => (indexes.delete(uid) ? undefined : { code: "index_not_found", type: "invalid_request" }));

  const addDocuments = (uid: string, body: Json): HttpResponse => {
    if (!Array.isArray(body)) return error(400, "malformed_payload");
    const docs = body as Doc[];
    return enqueue(() => {
      if (docs.some((doc) => typeof doc.id !== "string" || !/^[A-Za-z0-9_-]{1,511}$/.test(doc.id))) return { code: "invalid_document_id", type: "invalid_request" };
      const index = indexOf(uid);
      // POST replaces whole documents: nothing of an older version survives.
      for (const doc of docs) index.docs.set(doc.id as string, { ...doc });
      return undefined;
    });
  };

  const filtered = (index: Index, filter: Json | undefined, kind: "document" | "search"): Doc[] | HttpResponse => {
    if (filter === undefined) return [...index.docs.values()];
    const clauses = typeof filter === "string" ? parseFilter(filter) : undefined;
    if (clauses === undefined) return error(400, `invalid_${kind}_filter`);
    if (clauses.some((clause) => !index.filterable.includes(clause.attribute))) return error(400, `invalid_${kind}_filter`);
    return [...index.docs.values()].filter((doc) => matchesFilter(doc, clauses));
  };

  const fetchDocuments = (uid: string, body: Doc): HttpResponse => {
    const index = indexes.get(uid);
    if (index === undefined) return error(404, "index_not_found");
    const docs = filtered(index, body.filter, "document");
    if (!Array.isArray(docs)) return docs;
    const offset = Number(body.offset ?? 0);
    const limit = Number(body.limit ?? 20);
    const fields = Array.isArray(body.fields) ? body.fields.map(String) : undefined;
    return reply(200, { results: docs.slice(offset, offset + limit).map((doc) => project(doc, fields)), offset, limit, total: docs.length });
  };

  const rank = (docs: readonly Doc[], terms: readonly string[], index: Index): { doc: Doc; score: number }[] => {
    const searchable = index.searchable.includes("*") ? ["title", "body"] : index.searchable;
    return docs.map((doc) => ({ doc, score: terms.length === 0 ? 1 : scoreOf(doc, terms, searchable) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  };

  const searchIndex = (uid: string, body: Doc): HttpResponse => {
    const index = indexes.get(uid);
    if (index === undefined) return error(404, "index_not_found");
    const docs = filtered(index, body.filter, "search");
    if (!Array.isArray(docs)) return docs;
    const terms = wordsOf(String(body.q ?? ""));
    const ranked = rank(docs, terms, index);
    const offset = Number(body.offset ?? 0);
    const limit = Number(body.limit ?? 20);
    const retrieve = Array.isArray(body.attributesToRetrieve) ? body.attributesToRetrieve.map(String) : undefined;
    const crop = cropOptions(body);
    const matcher = makeMatcher(terms);
    const hits = ranked.slice(offset, offset + limit).map(({ doc, score }) => ({
      ...project(doc, retrieve),
      _formatted: { ...project(doc, retrieve), body: cropAndHighlight(String(doc.body ?? ""), matcher, crop) },
      ...(body.showRankingScore === true ? { _rankingScore: score } : {}),
    }));
    return reply(200, { hits, query: body.q ?? "", offset, limit, estimatedTotalHits: ranked.length, processingTimeMs: 0 });
  };

  /** Route table keyed by `METHOD shape`, the index uid (or task uid) segment written `:uid`. */
  const routes: Record<string, (uid: string, body: Json | undefined, query: URLSearchParams) => HttpResponse> = {
    "GET tasks/:uid": (uid) => getTask(uid),
    "POST indexes": (_uid, body) => createIndex((body ?? {}) as Doc),
    "DELETE indexes/:uid": (uid) => deleteIndex(uid),
    "PATCH indexes/:uid/settings": (uid, body) => updateSettings(uid, (body ?? {}) as Doc),
    "POST indexes/:uid/search": (uid, body) => searchIndex(uid, (body ?? {}) as Doc),
    "POST indexes/:uid/documents/fetch": (uid, body) => fetchDocuments(uid, (body ?? {}) as Doc),
    "POST indexes/:uid/documents": (uid, body, query) => (query.get("primaryKey") === "id" ? addDocuments(uid, body ?? null) : error(400, "missing_primary_key")),
  };

  const route = (method: string, path: string, query: URLSearchParams, body: Json | undefined): HttpResponse => {
    const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    const shape = segments.map((segment, index) => (index === 1 ? ":uid" : segment)).join("/");
    const handler = routes[`${method} ${shape}`];
    return handler === undefined ? error(404, "not_found") : handler(segments[1] ?? "", body, query);
  };

  return {
    handle({ request }) {
      if (!request.url.startsWith(`${required.host}/`)) throw new Error(`emulator: request to an unexpected origin ${request.url}`);
      if (request.headers.Authorization !== `Bearer ${required.apiKey}`) return error(401, "invalid_api_key", "auth");
      const url = new URL(request.url);
      const body = typeof request.body === "string" ? (JSON.parse(request.body) as Json) : undefined;
      return route(request.method, url.pathname, url.searchParams, body);
    },
    documents: (indexUid) => {
      const index = indexes.get(indexUid);
      return index === undefined ? undefined : [...index.docs.values()];
    },
    taskCount: () => tasks.length,
  };
}
