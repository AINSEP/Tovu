# WP-Cron — Specification

**Source files analyzed:**
- `wp-includes/cron.php`
- `wp-cron.php`

---

## 1. Overview

WP-Cron is a pseudo-cron system. There is no system-level daemon running in the background. Instead, scheduled events are triggered opportunistically: every time a visitor loads a page, WordPress checks whether any scheduled events are overdue and, if so, fires them asynchronously. The events themselves execute in a separate HTTP request to `wp-cron.php` so that the triggering visitor's page load is not delayed.

**Key consequences of this design:**

- A site that receives no traffic will never run its cron jobs.
- Multiple simultaneous page loads could race to spawn cron. A transient-based mutex lock (`doing_cron`) prevents multiple concurrent cron executions.
- All timestamps are UTC Unix timestamps.
- Events are stored in the `cron` WordPress option (a single database row), not as individual database records.
- A real system cron job (e.g. a server `crontab`) can call `wp-cron.php` directly as a bypass if reliable scheduling is required.

---

## 2. Data Structure

### Persistent Storage

All cron data is stored in a single WordPress option named `cron`. The value is a serialized PHP array (a JSON object in TypeScript terms) with the following shape:

```typescript
interface CronStore {
  version: 2;
  [timestamp: number]: CronTimestampBucket;
}

// One bucket per Unix timestamp (UTC)
interface CronTimestampBucket {
  [hookName: string]: {
    [argsHash: string]: CronEventEntry;
  };
}

// For single (non-recurring) events:
interface CronEventEntrySingle {
  schedule: false;
  args: unknown[];
}

// For recurring events:
interface CronEventEntryRecurring {
  schedule: string;   // e.g. "hourly", "daily", "weekly"
  args: unknown[];
  interval: number;   // seconds between recurrences
}

type CronEventEntry = CronEventEntrySingle | CronEventEntryRecurring;
```

### Timestamp Keys

The outer keys of the store are numeric Unix timestamps cast as object keys. When iterating, they are compared numerically. The array is sorted in natural ascending order by timestamp after every write (via `uksort` with `strnatcasecmp`).

### Args Hash

The `argsHash` key is an MD5 hash of the PHP-serialized args array. Its purpose is to allow multiple events on the same hook at the same timestamp to be distinguished by their arguments. In TypeScript, this becomes a deterministic stable hash of the JSON-serialized args array.

**Important**: The hash is computed from the serialized form of the args **array** (not a single value), so `[]` hashes differently from `['foo']`.

### Version Field

The stored option always contains a top-level `version: 2` field. When reading the option:
1. If the stored value is not an array (or is missing), return an empty object.
2. If the stored value lacks a `version` field, run a one-time migration to version 2 format (the v1 format stored args directly as values; v2 nests them under an md5 hash key).
3. Strip the `version` field before returning to callers.

When writing, always re-insert `version: 2` before saving.

### In-Memory Event Object

Functions that return event data to callers use a plain object (not the stored format):

```typescript
interface CronEvent {
  hook: string;
  timestamp: number;
  schedule: string | false;   // false = single event
  args: unknown[];
  interval?: number;          // only present for recurring events
}
```

---

## 3. Scheduling Functions

### `wp_schedule_single_event(timestamp, hook, args?, wpError?)`

Schedules a one-time event.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `timestamp` | `number` | required | Must be a positive integer Unix UTC timestamp |
| `hook` | `string` | required | Action hook name to fire when event runs |
| `args` | `unknown[]` | `[]` | Arguments passed to the hook callback |
| `wpError` | `boolean` | `false` | If true, return a structured error on failure instead of `false` |

**Returns**: `true` on success, `false` (or error object) on failure.

**Execution flow:**

1. Validate `timestamp` is a positive integer. Fail if not.
2. Construct event object: `{ hook, timestamp, schedule: false, args }`.
3. Apply `pre_schedule_event` filter. If it returns non-null, return that value (short-circuit).
4. **Duplicate detection**: Scan the cron store for an identical hook+argsHash combination within a ±10-minute window around the given timestamp:
   - If `timestamp < now + 10 minutes`: scan from timestamp 0 to `now + 10 minutes`.
   - If `timestamp >= now`: scan from `timestamp - 10 minutes` to `timestamp + 10 minutes`.
   - If a duplicate is found, fail with error code `duplicate_event`.
5. Apply `schedule_event` filter to the event object. If the filter returns falsy, fail with `schedule_event_false`.
6. Write `crons[event.timestamp][event.hook][argsHash] = { schedule: false, args }` into the store.
7. Re-sort the store by timestamp (ascending, natural sort).
8. Save via `_set_cron_array`. Return result.

---

### `wp_schedule_event(timestamp, recurrence, hook, args?, wpError?)`

Schedules a recurring event.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `timestamp` | `number` | required | UTC Unix timestamp for the first run |
| `recurrence` | `string` | required | Schedule name. Must exist in `wp_get_schedules()` result |
| `hook` | `string` | required | Action hook to fire |
| `args` | `unknown[]` | `[]` | Arguments passed to the hook callback |
| `wpError` | `boolean` | `false` | Whether to return a structured error on failure |

**Returns**: `true` on success, `false` (or error object) on failure.

**Differences from single-event scheduling:**

- Validates that `recurrence` exists in the schedules registry. Fails with `invalid_schedule` if not.
- Constructs event object with `schedule: recurrence` and `interval: schedules[recurrence].interval`.
- Does NOT perform duplicate detection (that check only happens in `wp_schedule_single_event`).
- Applies `pre_schedule_event` and `schedule_event` filters identically.
- Writes `{ schedule: recurrence, args, interval }` to the store.

---

### `wp_reschedule_event(timestamp, recurrence, hook, args?, wpError?)`

Reschedules a recurring event to its next run time. Intended for internal use by the cron runner after firing an event.

**Execution flow:**

1. Validate `timestamp`.
2. Resolve `interval`: first from `schedules[recurrence].interval`; if not found, fall back to the `interval` field stored on the existing event (handles cases where the schedule was deregistered after scheduling).
3. Construct event object with the original `timestamp`, `recurrence`, `args`, and resolved `interval`.
4. Apply `pre_reschedule_event` filter. Short-circuit if non-null returned.
5. If `interval` is still 0 after both lookups, fail with `invalid_schedule`.
6. Compute the next timestamp:
   - If `timestamp >= now`: `nextTimestamp = now + interval`
   - If `timestamp < now`: `nextTimestamp = now + (interval - ((now - timestamp) % interval))`
   - The second formula finds the next future occurrence in the recurrence sequence, even if multiple intervals have been missed.
7. Call `wp_schedule_event(nextTimestamp, recurrence, hook, args, wpError)` and return its result.

---

### `wp_unschedule_event(timestamp, hook, args?, wpError?)`

Removes a specific scheduled event identified by its exact timestamp, hook name, and args.

**Execution flow:**

1. Validate `timestamp`.
2. Apply `pre_unschedule_event` filter. Short-circuit if non-null returned.
3. Compute `argsHash = md5(serialize(args))`.
4. Delete `crons[timestamp][hook][argsHash]`.
5. If `crons[timestamp][hook]` is now empty, delete it.
6. If `crons[timestamp]` is now empty, delete it.
7. Save and return.

---

### `wp_clear_scheduled_hook(hook, args?, wpError?)`

Removes all scheduled instances of a hook with matching args across all timestamps.

**Returns**: `number` (count of events removed), `false`, or error object. Returns `0` if no events existed for that hook+args combination.

**Execution flow:**

1. Apply `pre_clear_scheduled_hook` filter. Short-circuit if non-null returned.
2. Load cron store. Return `0` if empty.
3. Compute `argsHash`.
4. Iterate all timestamps; for each that has `crons[timestamp][hook][argsHash]`, call `wp_unschedule_event(timestamp, hook, args, true)` and collect the result.
5. If any results are errors, aggregate them and return the combined error (or `false` if `wpError` is false).
6. Return the count of successful unschedulings.

---

### `wp_unschedule_hook(hook, wpError?)`

Removes all scheduled instances of a hook regardless of args or timestamp.

**Returns**: `number` (total event count removed across all timestamps and arg sets), `false`, or error object.

**Execution flow:**

1. Apply `pre_unschedule_hook` filter. Short-circuit if non-null returned.
2. Load cron store. Return `0` if empty.
3. Iterate all timestamps. For each, if `crons[timestamp][hook]` exists, record its key count, then delete the entire `crons[timestamp][hook]` subtree.
4. If `crons[timestamp]` is now empty, delete it too.
5. If no events were found, return `0` without writing to the database.
6. Save. If save succeeded, return `sum(recordedCounts)`. Otherwise return the error/false from the save.

---

### `wp_get_scheduled_event(hook, args?, timestamp?)`

Retrieves the full event object for a scheduled event.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `hook` | `string` | required | |
| `args` | `unknown[]` | `[]` | |
| `timestamp` | `number \| null` | `null` | If null, returns the next upcoming event |

**Returns**: `CronEvent` object, or `false` if not found.

**Execution flow:**

1. Apply `pre_get_scheduled_event` filter. Short-circuit if non-null returned.
2. Validate `timestamp` if provided (must be numeric).
3. Load cron store. Return `false` if empty.
4. Compute `argsHash`.
5. If `timestamp` is null: scan timestamps in ascending order, find the first where `crons[ts][hook][argsHash]` exists, use that as `timestamp`. Return `false` if none found.
6. If `timestamp` was provided: check `crons[timestamp][hook][argsHash]` exists. Return `false` if not.
7. Construct and return `CronEvent` from stored data, adding `interval` only if present in stored entry.

---

### `wp_next_scheduled(hook, args?)`

Returns the Unix timestamp of the next scheduled run for a hook+args combination.

**Returns**: `number | false`

**Execution flow:**

1. Calls `wp_get_scheduled_event(hook, args)` (no timestamp = get next).
2. If no event found, returns `false`.
3. Applies the `wp_next_scheduled` filter to the timestamp before returning.

---

### `wp_get_schedule(hook, args?)`

Returns the recurrence schedule name for the next scheduled event for a hook, or `false` if no event is scheduled or it is a single event.

**Execution flow:**

1. Calls `wp_get_scheduled_event(hook, args)`.
2. Extracts `event.schedule` (which is `false` for single events, or a schedule name string for recurring).
3. Applies the `get_schedule` filter.
4. Returns the filtered value.

---

### `wp_get_ready_cron_jobs()`

Returns the subset of cron events whose timestamps are in the past (i.e., are due or overdue).

**Returns**: Same shape as the cron store but only includes timestamp buckets where `timestamp <= now`.

**Execution flow:**

1. Apply `pre_get_ready_cron_jobs` filter. Short-circuit if non-null returned.
2. Load full cron store.
3. Get current time (with microseconds for precision).
4. Iterate timestamps in ascending order. Stop iterating at the first timestamp that exceeds current time.
5. Return object containing only the past-timestamped buckets.

---

## 4. Built-in Schedules

The following schedules are registered by default:

```typescript
const builtInSchedules: Record<string, { interval: number; display: string }> = {
  hourly:     { interval: 3600,    display: 'Once Hourly' },
  twicedaily: { interval: 43200,   display: 'Twice Daily' },
  daily:      { interval: 86400,   display: 'Once Daily' },
  weekly:     { interval: 604800,  display: 'Once Weekly' },
};
```

### `wp_get_schedules()`

Returns the merged set of all schedules: custom schedules (from the `cron_schedules` filter) merged with built-in schedules.

**Merge order**: The built-in schedules take precedence over filter-registered schedules. Specifically, the implementation calls `array_merge(filterResult, builtInSchedules)`, which means built-in schedule definitions cannot be overridden via the filter. Custom schedules must use unique names.

### Registering Custom Schedules

```typescript
// Equivalent of adding to the `cron_schedules` filter:
addFilter('cron_schedules', (schedules: Record<string, { interval: number; display: string }>) => {
  return {
    ...schedules,
    monthly: { interval: 2592000, display: 'Once Monthly' },
  };
});
```

The filter receives an object of custom-only schedules and should return that object augmented with any new entries. Do not include built-in schedule names in the filter return value; they are always appended by the core function.

---

## 5. Execution

### The wp_cron() Entry Point

`wp_cron()` is called from WordPress's main bootstrap and registers the actual executor `_wp_cron()` to run at the appropriate lifecycle moment:

- **Standard mode**: `_wp_cron()` is attached to the `shutdown` action hook. This ensures the HTML response is flushed to the browser before cron spawning begins, minimizing TTFB impact.
- **ALTERNATE_WP_CRON mode**: `_wp_cron()` runs at `wp_loaded` priority 20 instead (see Section 6).

### `_wp_cron()` — The Internal Executor

1. Bail immediately if the current request is to `wp-cron.php` itself (prevents infinite loops), or if `DISABLE_WP_CRON` is true.
2. Call `wp_get_ready_cron_jobs()`. If empty, return `0`.
3. Get current microtime.
4. Check if the earliest ready job's timestamp is still in the future. If so, return `0` (no action needed — this covers race conditions between the ready-jobs query and the current time check).
5. Iterate through ready jobs. For each timestamp bucket (up to current time), iterate hooks. If a schedule has a `callback` guard function registered (checked against `wp_get_schedules()`), invoke it and skip the hook if it returns false.
6. Call `spawn_cron(gmt_time)`. Record result.
7. Break out of both loops after successfully calling `spawn_cron` once (one spawn per `_wp_cron` invocation).
8. If any spawn returned `false`, return `false`. Otherwise return the count of spawns (0 or 1).

### `spawn_cron(gmt_time?)` — The Spawner

Attempts to trigger cron execution in a separate non-blocking HTTP request.

**Execution flow:**

1. If `gmt_time` is not provided, use `microtime(true)` (float with microseconds).
2. Bail if `DOING_CRON` is defined or if `$_GET['doing_wp_cron']` is set (already in a cron context).
3. Read the `doing_cron` transient. This is a float timestamp stored as a high-precision string.
4. If the transient value is more than 10 minutes in the future, treat it as corrupted and reset it to 0.
5. If `lock + WP_CRON_LOCK_TIMEOUT > gmt_time`, another cron process is running or ran too recently. Return `false`.
6. Call `wp_get_ready_cron_jobs()`. If empty, return `false`.
7. If the earliest ready job is still in the future, return `false`.
8. **ALTERNATE_WP_CRON path** (see Section 6): handle differently.
9. **Standard path**:
   - Set the `doing_cron` transient to the current `gmt_time` formatted as a 22-decimal float string.
   - Build the cron request: `{ url: site_url('wp-cron.php') + '?doing_wp_cron=' + key, args: { timeout: 0.01, blocking: false, sslverify: false } }`.
   - Apply the `cron_request` filter to this request object.
   - Fire `wp_remote_post(url, args)` — non-blocking (no wait for response).
   - Return `true` if the remote post did not return an error, `false` otherwise.

### `wp-cron.php` — The Cron Runner

This file is the HTTP endpoint that actually executes cron events. It runs in its own PHP process.

**Startup sequence:**

1. Set `ignore_user_abort(true)` — run to completion even if the client disconnects.
2. Send cache-prevention headers (`Expires`, `Cache-Control: no-cache`).
3. Attempt to finalize the response immediately using `fastcgi_finish_request()` or `litespeed_finish_request()` if available, so the spawning request returns before events actually fire.
4. Bail if `$_POST` is non-empty, `DOING_AJAX` is defined, or `DOING_CRON` is defined.
5. Define `DOING_CRON = true`.
6. Load WordPress bootstrap.
7. Attempt to raise PHP memory limit for cron processing.

**Lock validation:**

1. Call `wp_get_ready_cron_jobs()`. If empty, exit.
2. Get `doing_cron` transient value (bypassing object cache to get a fresh database read).
3. Determine `doing_wp_cron` (the lock key):
   - If called from `spawn_cron`, the key is passed as `$_GET['doing_wp_cron']`.
   - If called directly (no GET param), attempt to acquire a new lock: check that no unexpired lock exists, then set a new transient and use that as the key.
4. If the stored transient value does not exactly match `doing_wp_cron`, exit (another process owns the lock).

**Event execution loop:**

```
for each timestamp bucket (ascending, stop when timestamp > now):
  for each hook in the bucket:
    for each argsHash in the hook:
      1. If the event has a recurrence schedule, call wp_reschedule_event() first.
         Log and fire cron_reschedule_event_error action if it fails.
      2. Call wp_unschedule_event() to remove the current occurrence.
         Log and fire cron_unschedule_event_error action if it fails.
      3. Fire the hook with do_action_ref_array(hook, args).
      4. After each event fires, re-check the lock:
         if _get_cron_lock() !== doing_wp_cron: exit immediately
         (another process stole the lock while this event was running)
```

**Important ordering**: reschedule happens **before** execution, not after. This means the next occurrence is registered in the database before the current event fires, reducing the chance of missed recurrences if the event crashes.

**Lock cleanup**: After the loop, if the lock still matches, delete the `doing_cron` transient.

### `_get_cron_lock()`

A private helper that reads the `doing_cron` transient value directly from the database (bypassing any in-memory object cache). This is critical for the lock check after each event fires, since the object cache may be stale.

- If an external object cache is in use, forces a cache bypass read.
- If using the database transient backend, queries `wp_options` directly for `_transient_doing_cron`.

---

## 6. DISABLE_WP_CRON and ALTERNATE_WP_CRON Constants

### `DISABLE_WP_CRON`

**Type**: `boolean` constant defined in `wp-config.php`.

When `true`:
- `_wp_cron()` returns `0` immediately without checking or running any events.
- `wp-cron.php` can still be called directly and will still run events; the constant only prevents WordPress from auto-triggering cron on page loads.
- Use case: administrators who want to run cron via a real system cron job exclusively.

**Note**: Defining `DISABLE_WP_CRON` and directly calling `wp-cron.php` are deliberately mutually exclusive behaviors. The direct call does not check `DISABLE_WP_CRON`.

### `ALTERNATE_WP_CRON`

**Type**: `boolean` constant defined in `wp-config.php`.

When `true`, the cron execution model changes:
- `wp_cron()` registers `_wp_cron` at `wp_loaded` (priority 20) instead of `shutdown`.
- In `spawn_cron()`, instead of making a remote HTTP request, the current request itself is redirected and the cron execution is inline:
  1. Only applies to GET requests that are not AJAX or XML-RPC requests.
  2. Sets the `doing_cron` transient.
  3. Starts output buffering.
  4. Sends an HTTP redirect to the same URL with `?doing_wp_cron=<key>` appended.
  5. Sends `' '` (a space) as the response body.
  6. Flushes all output buffers and sends headers to the browser.
  7. Immediately `require`s `wp-cron.php` inline in the same process.
  8. Returns `true`.

This mode is intended for environments where outbound HTTP loopback requests are blocked. The trade-off is that cron runs in the main request process on redirect.

---

## 7. WP_CRON_LOCK_TIMEOUT

A PHP constant that controls the minimum interval (in seconds) between cron spawns.

**Default value**: `60` (1 minute).

**Definition** (if not already defined):
```typescript
const WP_CRON_LOCK_TIMEOUT = 60;
```

**How it is used** in `spawn_cron`:
```typescript
if (lock + WP_CRON_LOCK_TIMEOUT > gmt_time) {
  return false; // Too soon since last spawn
}
```

This prevents multiple concurrent page loads from all trying to spawn cron simultaneously. Only one spawn can occur per `WP_CRON_LOCK_TIMEOUT` seconds.

**Relationship with the lock**: the `doing_cron` transient is set when spawning begins and deleted when execution completes. `WP_CRON_LOCK_TIMEOUT` is the window during which the transient is considered "live." If a cron run takes longer than `WP_CRON_LOCK_TIMEOUT` seconds, the next page load may spawn a new cron process, potentially causing overlap.

---

## 8. Key Hooks and Filters

### Filters

| Filter name | Arguments | Purpose |
|---|---|---|
| `pre_schedule_event` | `(null \| bool \| Error, CronEvent, wpError: bool)` | Short-circuit scheduling; return non-null to override. Applies to both single and recurring events. |
| `schedule_event` | `(CronEvent \| false)` | Modify or cancel an event before it is written. Return falsy to prevent scheduling. |
| `pre_reschedule_event` | `(null \| bool \| Error, CronEvent, wpError: bool)` | Short-circuit rescheduling. |
| `pre_unschedule_event` | `(null \| bool \| Error, timestamp, hook, args, wpError: bool)` | Short-circuit unscheduling a specific event. |
| `pre_clear_scheduled_hook` | `(null \| number \| false \| Error, hook, args, wpError: bool)` | Short-circuit clearing all instances of a hook+args. |
| `pre_unschedule_hook` | `(null \| number \| false \| Error, hook, wpError: bool)` | Short-circuit removing all instances of a hook. |
| `pre_get_scheduled_event` | `(null \| false \| CronEvent, hook, args, timestamp \| null)` | Short-circuit event lookup. |
| `pre_get_ready_cron_jobs` | `(null \| CronTimestampBucket[])` | Short-circuit fetching ready jobs. Return an array to override. |
| `cron_schedules` | `(Record<string, { interval: number; display: string }>)` | Add custom schedules to the registry. |
| `get_schedule` | `(string \| false, hook, args)` | Filter the returned schedule name for a hook. |
| `wp_next_scheduled` | `(number, CronEvent, hook, args)` | Filter the returned next-scheduled timestamp. |
| `cron_request` | `({ url: string, key: string, args: object }, doing_wp_cron: string)` | Filter the HTTP request parameters used when spawning cron. |
| `https_local_ssl_verify` | `(false)` | Controls SSL verification for the local cron HTTP request. Default false. |

### Actions

| Action name | Arguments | Purpose |
|---|---|---|
| `cron_reschedule_event_error` | `(WPError, hook, eventData)` | Fires when `wp_reschedule_event` fails during cron execution. |
| `cron_unschedule_event_error` | `(WPError, hook, eventData)` | Fires when `wp_unschedule_event` fails during cron execution. |

---

## 9. TypeScript Interface Sketch

```typescript
// ---- Stored data shapes ----

interface CronEventEntry {
  schedule: string | false;
  args: unknown[];
  interval?: number;
}

// Keyed by argsHash (md5 of serialized args)
type CronHookBucket = Record<string, CronEventEntry>;

// Keyed by hook name
type CronTimestampBucket = Record<string, CronHookBucket>;

// Keyed by Unix timestamp (as string key)
type CronStore = Record<string, CronTimestampBucket>;

// ---- Runtime event object shape ----

interface CronEvent {
  hook: string;
  timestamp: number;
  schedule: string | false;
  args: unknown[];
  interval?: number;
}

// ---- Schedule registry ----

interface CronSchedule {
  interval: number;   // seconds
  display: string;    // human-readable label
  callback?: () => boolean;  // optional guard function
}

type ScheduleRegistry = Record<string, CronSchedule>;

// ---- Error type (mirrors WP_Error) ----

interface CronError {
  code: string;
  message: string;
}

// ---- Public API ----

interface CronAPI {
  // Scheduling
  wpScheduleSingleEvent(
    timestamp: number,
    hook: string,
    args?: unknown[],
    wpError?: false
  ): boolean;
  wpScheduleSingleEvent(
    timestamp: number,
    hook: string,
    args: unknown[],
    wpError: true
  ): true | CronError;

  wpScheduleEvent(
    timestamp: number,
    recurrence: string,
    hook: string,
    args?: unknown[],
    wpError?: boolean
  ): boolean | CronError;

  wpRescheduleEvent(
    timestamp: number,
    recurrence: string,
    hook: string,
    args?: unknown[],
    wpError?: boolean
  ): boolean | CronError;

  wpUnscheduleEvent(
    timestamp: number,
    hook: string,
    args?: unknown[],
    wpError?: boolean
  ): boolean | CronError;

  wpClearScheduledHook(
    hook: string,
    args?: unknown[],
    wpError?: boolean
  ): number | false | CronError;

  wpUnscheduleHook(
    hook: string,
    wpError?: boolean
  ): number | false | CronError;

  // Querying
  wpNextScheduled(hook: string, args?: unknown[]): number | false;
  wpGetScheduledEvent(hook: string, args?: unknown[], timestamp?: number | null): CronEvent | false;
  wpGetSchedule(hook: string, args?: unknown[]): string | false;
  wpGetSchedules(): ScheduleRegistry;
  wpGetReadyCronJobs(): CronStore;

  // Execution
  wpCron(): void;
  spawnCron(gmtTime?: number): boolean;
}

// ---- Config constants ----

interface CronConfig {
  DISABLE_WP_CRON: boolean;        // default false
  ALTERNATE_WP_CRON: boolean;      // default false
  WP_CRON_LOCK_TIMEOUT: number;    // default 60 (seconds)
}
```

---

## 10. Design Patterns to Carry Over

1. **Single-option persistence.** All cron state lives in one database row (`cron` option). The full state is read, mutated in memory, then written back atomically. There is no per-event database record. This keeps read/write counts low at the cost of write amplification on large cron queues.

2. **Args hash for event identity.** Events are identified by the triple `(timestamp, hookName, argsHash)`. The hash is computed from a stable serialization of the args array. In TypeScript, implement this as a deterministic JSON stringify (sorted keys) or a dedicated stable serializer, then MD5 (or any stable 32-char hex hash) the result.

3. **Natural ascending sort on every write.** After any mutation, the store is sorted by timestamp key in natural ascending order before saving. This ensures that iteration for ready-jobs is efficient (stop at the first future timestamp).

4. **Transient-based mutex with microsecond precision.** The `doing_cron` transient stores a float timestamp formatted to 22 decimal places as a string. When validating the lock, the cron runner compares the stored transient value to the key passed via the HTTP GET parameter for exact string equality, not numeric proximity. Two concurrent spawns will both read the same transient value before either sets a new one; only the one whose key matches the transient after both writes proceed.

5. **Reschedule before execute.** When running an event, the next occurrence is written to the database before `do_action` fires the callbacks. This ensures that if a callback crashes or times out, the event is not permanently lost from the schedule.

6. **Lock check after each event.** After every `do_action` call, the cron runner re-reads the lock from the database (bypassing the cache). If the lock has changed, it exits immediately. This prevents two cron runners from executing the same event if one process runs slowly.

7. **Duplicate detection for single events.** `wp_schedule_single_event` uses a ±10-minute fuzzy window to avoid scheduling duplicate events that may have been registered by two concurrent requests. The window is asymmetric: past-targeted events look forward up to 10 minutes; future events look 10 minutes in both directions.

8. **Pre-filters on every mutation.** Every scheduling/unscheduling function starts with a `pre_*` filter that can short-circuit the entire operation. This is the primary extension point for replacing the WP-Cron storage layer entirely (e.g. storing events in a real queue system) without modifying core code.

9. **Non-blocking HTTP spawn.** The default cron spawn is a POST to `wp-cron.php` with `timeout: 0.01` and `blocking: false`. The spawning request does not wait for cron execution to complete. In TypeScript, this means the HTTP client should be configured to return immediately after the request is sent, not after the response is received.

10. **Memory isolation.** Each cron execution happens in a separate HTTP request (or an in-process fork via `ALTERNATE_WP_CRON`). Events do not share heap state with the triggering page load. This should be reproduced in TypeScript by running cron callbacks in a separate async context or worker, not inline in request handlers.

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

The scheduler exists so work can happen outside the critical path of user requests. WordPress uses cron as a lightweight queue and timer system for retries, deferred cleanup, publishing, count recalculation, and other background tasks.

### 11.2 What Tovu should preserve

- A canonical scheduler abstraction instead of feature-specific timers and background-job code
- Stable event identity so duplicate scheduling and unscheduling are deterministic
- Reschedule-before-execute and lock-recheck semantics so jobs are not silently lost or double-run
- Background execution isolated from the user request that triggered it

### 11.3 What Tovu can simplify

- Tovu does not need WordPress's single-option persistence model if a real jobs table or queue backend is available
- The HTTP self-spawn trick can be replaced with workers, queues, or platform-native schedulers
- Cron storage shape can be richer as long as extension hooks and job identity remain explicit

### 11.4 Possible Tovu seams

- `src/core/scheduler/` for schedule registration and job execution orchestration
- `src/core/ports/SchedulerPort.ts` for schedule/read/mutate APIs
- `src/core/ports/DistributedLockPort.ts` for single-run protection
- `src/core/ports/BackgroundJobRunnerPort.ts` for executing jobs outside the request path

### 11.5 Suggested priority

- `V1`: scheduler abstraction, duplicate-safe job identity, distributed lock, out-of-band execution
- `Later`: richer recurrence management, alternate transport backends, and compatibility adapters
