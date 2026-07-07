# Spec: `wp-cron.php`

**Source:** `wordpress/wp-cron.php`
**Lines:** 206
**Role:** Scheduled task runner (pseudo-cron daemon)

---

## Purpose

Executes WordPress scheduled events (cron jobs). Designed to be either:
- **Triggered automatically** on page loads (WordPress spawns a non-blocking HTTP request to this file)
- **Called directly** by an actual server-level cron job (e.g. `curl` or `wget` every minute)

It must not slow down the visitor that triggers it.

---

## Entry Conditions

### Abort conditions (checked before loading WordPress)

```
if (!empty($_POST) || defined('DOING_AJAX') || defined('DOING_CRON')) → die()
```

This prevents nested cron execution or AJAX requests from triggering cron.

### Pre-load headers

Sent before WordPress loads:
- `Expires: Wed, 11 Jan 1984 05:00:00 GMT`
- `Cache-Control: no-cache, must-revalidate, max-age=0`

### Response flush (fire-and-forget)

If `fastcgi_finish_request()` is available: call it (sends response to browser, PHP continues in background).
Else if `litespeed_finish_request()` is available: call it.

This allows cron to run after the HTTP response is sent, not blocking the originating request.

### Set constant

```php
define('DOING_CRON', true);
```

### Load WordPress

```php
if (!defined('ABSPATH')) {
    require_once __DIR__ . '/wp-load.php';
}
```

The `ABSPATH` guard allows this file to be included from within an already-bootstrapped environment (e.g. when WordPress spawns cron internally without a separate HTTP request).

### Raise memory limit

`wp_raise_memory_limit('cron')` — attempt to increase PHP memory for cron processing.

---

## Distributed Lock (Mutex)

Cron uses a transient-based lock to prevent multiple processes from running the same jobs simultaneously.

### `_get_cron_lock()` — internal function

Reads the `doing_cron` transient value, bypassing local object cache (forces a DB read or external cache read) to get the most current value:

- If using an external object cache: `wp_cache_get('doing_cron', 'transient', true)` (force flag)
- Otherwise: direct `SELECT option_value FROM options WHERE option_name = '_transient_doing_cron'`

Returns the stored float timestamp or 0/false.

### Lock acquisition

```
$gmt_time = microtime(true)  // high-precision current timestamp
$doing_cron_transient = get_transient('doing_cron')  // existing lock value
```

**Determining the lock value to use (`$doing_wp_cron`):**

1. If `$doing_wp_cron` global is already set (set before calling this file internally): use it
2. Else if `$_GET['doing_wp_cron']` is set (this is an externally-spawned cron request with a pre-created lock): use it
3. Else (new external call, no lock in GET):
   - If a lock exists AND it hasn't expired (`transient_value + WP_CRON_LOCK_TIMEOUT > gmt_time`): abort (`return`)
   - Otherwise: generate new lock value as `sprintf('%.22F', microtime(true))`
   - Store: `set_transient('doing_cron', $doing_wp_cron)` (no explicit TTL — persists until deleted)

**Lock validation:**
```
if ($doing_cron_transient !== $doing_wp_cron) → return (another process beat us to it)
```

### Lock release

After all jobs have run:
```
if (_get_cron_lock() === $doing_wp_cron) {
    delete_transient('doing_cron');
}
```

The re-check before deletion ensures we only delete our own lock, not a lock acquired by a concurrent process mid-run.

---

## Job Execution

### Get ready jobs

```
$crons = wp_get_ready_cron_jobs()
```

Returns all scheduled events whose timestamp ≤ current GMT time, sorted by timestamp ascending.

Structure:
```typescript
type CronJobs = {
  [timestamp: number]: {
    [hook: string]: {
      [key: string]: {
        schedule: string | false;   // recurrence schedule slug or false for one-time
        args: any[];
        interval?: number;
      }
    }
  }
}
```

If empty: `die()` immediately.

### Execution loop

For each `timestamp → hook → key → job`:
1. If `timestamp > gmt_time`: break (remaining jobs are in the future)
2. If `schedule` is truthy (recurring):
   - `wp_reschedule_event(timestamp, schedule, hook, args, true)` — calculate next run and reschedule
   - On error: log via `error_log()` and fire `cron_reschedule_event_error` action
3. `wp_unschedule_event(timestamp, hook, args, true)` — remove this occurrence
   - On error: log and fire `cron_unschedule_event_error` action
4. `do_action_ref_array($hook, $args)` — **execute the job**
5. After each job: re-check lock with `_get_cron_lock()`. If lock no longer matches `$doing_wp_cron`, another process has taken over → `return` immediately

---

## Schedules

WordPress built-in recurrence schedules:

| Slug | Interval |
|---|---|
| `hourly` | 3600 seconds |
| `twicedaily` | 43200 seconds |
| `daily` | 86400 seconds |
| `weekly` | 604800 seconds |

Plugins can register additional schedules via `cron_schedules` filter.

---

## `WP_CRON_LOCK_TIMEOUT`

Default: `60` seconds. Configurable in `wp-config.php`.

If a cron process holds the lock for longer than this without finishing, the next process may steal the lock.

---

## `DISABLE_WP_CRON`

If defined as `true` in `wp-config.php`, WordPress will not automatically spawn cron via HTTP on page loads. The operator is expected to call `wp-cron.php` directly via a real cron job.

Calling `wp-cron.php` directly always works regardless of `DISABLE_WP_CRON` — that constant only disables the automatic spawn.

---

## TypeScript Interface

```typescript
interface CronJob {
  hook: string;
  args: unknown[];
  schedule: string | false;   // false = one-time
  interval?: number;          // seconds, for recurring
  timestamp: number;          // unix timestamp
}

interface CronRunner {
  getReadyJobs(): Promise<CronJob[]>;
  acquireLock(currentTime: number): Promise<string | null>;  // returns lock key or null if another process has it
  releaseLock(lockKey: string): Promise<void>;
  reschedule(job: CronJob): Promise<void>;
  unschedule(job: CronJob): Promise<void>;
  run(): Promise<void>;
}
```

### Lock pattern

```typescript
async function run(runner: CronRunner) {
  const jobs = await runner.getReadyJobs();
  if (jobs.length === 0) return;

  const lockKey = await runner.acquireLock(Date.now() / 1000);
  if (!lockKey) return; // another process has the lock

  for (const job of jobs) {
    if (job.timestamp > Date.now() / 1000) break;

    if (job.schedule) await runner.reschedule(job);
    await runner.unschedule(job);
    await hooks.doActionArray(job.hook, job.args);

    // Verify we still hold the lock after each job
    const currentLock = await runner.getCurrentLock();
    if (currentLock !== lockKey) return;
  }

  await runner.releaseLock(lockKey);
}
```

### Separation of concerns in TypeScript

Unlike PHP where `wp-cron.php` is both the scheduler and the executor, in a TypeScript rewrite this splits into:
- A **scheduler service** that manages the cron table (add, remove, reschedule events)
- A **runner** (this file's equivalent) that reads due events and fires them
- A **lock service** backed by Redis, a DB row, or similar

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-cron.php` decomposition. The canonical Tovu-facing treatment now lives in [integrations.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/integrations.md) and [cron.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-includes/cron.md).

### What Tovu should preserve

- The scheduler/runner/lock split and background execution semantics described in the consolidated docs

### What Tovu can simplify

- Prefer the consolidated scheduler specs over this per-file archival note when planning implementation

### Possible Tovu seams

- `src/core/scheduler/`
- `src/core/ports/DistributedLockPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated integration and scheduler specs
