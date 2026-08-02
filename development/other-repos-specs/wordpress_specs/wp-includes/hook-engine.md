# Hook Engine — Specification

**Source files analyzed:**
- `wp-includes/plugin.php`
- `wp-includes/class-wp-hook.php`

---

## 1. Overview

The hook engine is the event/middleware system at the center of WordPress. Every piece of extensibility in WordPress — from plugins overriding post titles to themes changing the login redirect — flows through this system. There are two flavors:

- **Filters**: transform a value. A caller passes a value in, registered callbacks transform it, the final value is returned.
- **Actions**: fire-and-forget events. A caller signals that something happened; registered callbacks run side effects; no return value is used.

Internally, **actions are implemented as filters**. The only difference is that `do_action` ignores the return value from callbacks. Both are stored in the same global registry under the same `WP_Hook` class.

---

## 2. Global State

Four global variables underpin the entire system:

```typescript
// Equivalent global state
const wpFilter: Record<string, WPHook> = {};         // all registered hooks
const wpActions: Record<string, number> = {};         // fire count per action hook
const wpFilters: Record<string, number> = {};         // fire count per filter hook
const wpCurrentFilter: string[] = [];                 // call stack of currently executing hooks
```

### `$wp_filter`
A map from hook name → `WP_Hook` instance. This is the authoritative registry. A `WP_Hook` entry is created on first `add_filter`/`add_action` for that hook name, and deleted when all callbacks are removed.

### `$wp_actions`
A map from hook name → integer fire count. Only tracks `do_action` calls. Used to implement `did_action()`.

### `$wp_filters`
A map from hook name → integer fire count. Only tracks `apply_filters` calls. Used to implement `did_filter()`.

### `$wp_current_filter`
A stack (array used as a stack) of hook names currently executing. The last element is the innermost running hook. Used to implement `current_filter()` / `doing_filter()`.

---

## 3. The `WP_Hook` Class

Each hook name maps to exactly one `WP_Hook` instance. It stores all registered callbacks and handles execution.

### Internal Data Structures

```typescript
interface CallbackEntry {
  function: CallableRef;  // the actual callable
  accepted_args: number;  // how many args the callback accepts
}

// Internal structure of WP_Hook:
//
// callbacks: {
//   [priority: number]: {
//     [callbackId: string]: CallbackEntry
//   }
// }
//
// priorities: number[]  — sorted array of priority keys (cached for iteration)
// iterations: number[][] — per-nesting-level copy of priorities (supports recursion)
// current_priority: number[] — which priority is being executed per nesting level
// nesting_level: number — how many times apply_filters is in the call stack for this hook
// doing_action: boolean — true while do_action is executing (suppresses value threading)
```

Callbacks are stored keyed by **callback ID** (a string derived from the callable — see Section 7). Within a priority, callbacks at the same priority execute in **insertion order** (FIFO). Priorities are sorted numerically ascending.

### Execution: `apply_filters(value, args)`

1. Snapshot `this.priorities` into `this.iterations[nesting_level]` (supports re-entrant calls).
2. Increment `nesting_level`.
3. Iterate over `priorities` in ascending order.
4. For each priority, iterate over callbacks in insertion order.
5. For each callback: call with `args[0..accepted_args-1]` and assign the return value back to `args[0]` / `value`.
6. When all priorities are exhausted, decrement `nesting_level`, clean up iteration state, return final `value`.

**Special cases during execution:**
- `accepted_args === 0`: call with no arguments.
- `accepted_args >= num_args`: pass all args.
- `accepted_args < num_args`: slice args to `accepted_args` length.

### Execution: `do_action(args)`

Sets `doing_action = true`, delegates to `apply_filters('', args)` (i.e., the value being "filtered" is an empty string that callbacks ignore), then resets `doing_action = false` after the outermost nesting level completes.

### Mid-iteration Mutation (the hard part)

Callbacks can add or remove other callbacks during execution. The engine handles this via `resort_active_iterations()`:

- When a callback is **added** mid-iteration, if its priority hasn't been reached yet, it will be called in the current run. If its priority has already passed, it won't run until next time.
- When a callback is **removed** mid-iteration, if its priority hasn't been reached yet, it will be skipped. If it's the currently executing callback, it completes its current invocation.
- `resort_active_iterations` re-points active `iterations` arrays to the new priority list while preserving the current position in the iteration.

This is a critical correctness invariant: **mutation during iteration is safe and predictable**.

---

## 4. Public API — Filters

### `add_filter(hookName, callback, priority?, acceptedArgs?)`

Register a callback on a filter hook.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `hookName` | `string` | required | The hook to register on |
| `callback` | `callable` | required | The function to run |
| `priority` | `number` | `10` | Lower = earlier. Same priority = FIFO |
| `acceptedArgs` | `number` | `1` | How many args the callback accepts |

- Always returns `true` (never throws, never fails).
- Creates a `WP_Hook` for `hookName` if one doesn't exist yet.
- If `priority` is `null`, it is coerced to `0`.

---

### `apply_filters(hookName, value, ...args)`

Apply all registered callbacks to `value` and return the result.

| Parameter | Type | Notes |
|---|---|---|
| `hookName` | `string` | The hook to fire |
| `value` | `any` | The value to filter (passed as first arg to callbacks) |
| `...args` | `any[]` | Additional read-only args passed to callbacks |

- Increments `wpFilters[hookName]`.
- If the `all` hook has callbacks, they run first (see Section 8).
- If no callbacks are registered for `hookName`, returns `value` unchanged.
- Pushes `hookName` onto `wpCurrentFilter` stack before execution, pops after.
- Returns the final filtered value.

---

### `apply_filters_ref_array(hookName, args)`

Identical to `apply_filters` but takes all arguments (including the value) as a single array. The value to filter is `args[0]`.

Used to forward dynamic argument lists without unpacking.

---

### `has_filter(hookName, callback?, priority?)`

Check if a hook has registered callbacks.

| Call signature | Returns |
|---|---|
| `has_filter(hookName)` | `boolean` — whether any callbacks exist |
| `has_filter(hookName, callback)` | `number \| false` — priority of the callback, or `false` if not registered |
| `has_filter(hookName, callback, priority)` | `boolean` — whether the callback is registered at exactly that priority |

**Important**: when checking for a specific callback, the return value may be `0` (a priority number that evaluates to falsy). Always use `=== false` to check for absence.

---

### `remove_filter(hookName, callback, priority?)`

Remove a specific callback from a filter hook.

| Parameter | Default | Notes |
|---|---|---|
| `priority` | `10` | Must match the priority used when registering |

- Returns `boolean` — `true` if the callback was found and removed, `false` if it wasn't registered.
- If removing the last callback for a priority, that priority bucket is deleted.
- If removing the last callback for the hook entirely, the `WP_Hook` entry is deleted from `wpFilter`.
- **Priority must match exactly.** A callback registered at priority `5` cannot be removed with priority `10`.

---

### `remove_all_filters(hookName, priority?)`

Remove all callbacks from a hook, optionally only at a specific priority.

| Call | Effect |
|---|---|
| `remove_all_filters(hookName)` | Clears all callbacks for the hook; deletes the `WP_Hook` entry |
| `remove_all_filters(hookName, priority)` | Clears only the callbacks at that priority |

Always returns `true`.

---

### `current_filter()`

Returns the name of the innermost currently executing hook, or `false` if no hook is running.

---

### `doing_filter(hookName?)`

| Call | Returns |
|---|---|
| `doing_filter()` | `boolean` — whether any hook is currently executing |
| `doing_filter(hookName)` | `boolean` — whether that specific hook is anywhere in the execution stack (not just the innermost) |

---

### `did_filter(hookName)`

Returns the number of times `apply_filters` has been called for `hookName` during the current request. Returns `0` if never fired.

---

### `apply_filters_deprecated(hookName, args, version, replacement?, message?)`

Variant of `apply_filters_ref_array` that first emits a deprecation notice via `_deprecated_hook()`.

- If no callbacks are registered for `hookName`, skips the deprecation notice and returns `args[0]` directly.
- Otherwise fires the notice, then runs `apply_filters_ref_array(hookName, args)`.

Used internally when WordPress retires a filter hook but keeps it working for backward compatibility.

---

## 5. Public API — Actions

Actions mirror the filter API exactly. Internally, all action functions delegate to their filter counterparts.

### `add_action(hookName, callback, priority?, acceptedArgs?)`

Alias for `add_filter`. Identical behavior.

---

### `do_action(hookName, ...args)`

Fire all callbacks registered on an action hook.

| Parameter | Type | Notes |
|---|---|---|
| `hookName` | `string` | The action to fire |
| `...args` | `any[]` | Arguments passed to callbacks (not filtered/returned) |

- Increments `wpActions[hookName]`.
- Runs the `all` hook first if registered.
- **No return value.** Callback return values are discarded.
- **Legacy handling**: if `args` is empty, a single empty string `''` is pushed as the argument (preserves PHP behavior where callbacks always receive at least one arg).
- **Legacy PHP4 compat**: if `args[0]` is an array containing a single object (i.e. `[&$this]` style), it's unwrapped to the object itself.

---

### `do_action_ref_array(hookName, args)`

Identical to `do_action` but accepts all arguments as an array. Equivalent of `apply_filters_ref_array` for actions.

---

### `has_action(hookName, callback?, priority?)`

Alias for `has_filter`. Identical behavior and return types.

---

### `remove_action(hookName, callback, priority?)`

Alias for `remove_filter`. Identical behavior.

---

### `remove_all_actions(hookName, priority?)`

Alias for `remove_all_filters`. Identical behavior.

---

### `current_action()`

Alias for `current_filter()`.

---

### `doing_action(hookName?)`

Alias for `doing_filter()`.

---

### `did_action(hookName)`

Returns the number of times `do_action` has been called for `hookName` during the current request. Returns `0` if never fired. Uses `wpActions` (separate counter from `wpFilters`).

---

### `do_action_deprecated(hookName, args, version, replacement?, message?)`

Same pattern as `apply_filters_deprecated` but for actions. Only emits the deprecation notice if callbacks are registered.

---

## 6. The `all` Hook

The string `'all'` is a special wildcard hook name. Any callback registered on `'all'` runs before **every** `apply_filters` and `do_action` call, regardless of hook name.

**Execution order when `all` is registered:**
1. Push current hook name to `wpCurrentFilter`.
2. Run all `all` callbacks via `do_all_hook($allArgs)`, passing the full argument list including the hook name as `args[0]`.
3. If the specific hook also has callbacks, run them.
4. Pop from `wpCurrentFilter`.

`do_all_hook` is a dedicated execution path that does not update `value` (actions semantics, but for a filter-shaped call).

**Use case**: debugging/tracing all hook invocations without knowing hook names in advance.

---

## 7. Callback Identity (`_wp_filter_build_unique_id`)

To deduplicate and look up callbacks in the priority map, each callback is assigned a string key:

| Callback type | Key format |
|---|---|
| String function name | The string itself, e.g. `"my_function"` |
| Static method as string | The string itself, e.g. `"MyClass::myMethod"` |
| Static method as array | `"ClassName::methodName"` |
| Object method as array | `spl_object_hash(object) + methodName` |
| Closure | `spl_object_hash(closure) + ""` |

**Implication for removal**: to remove an object method callback, you must pass the **same object instance** — not a new instance of the same class. Two closures are always distinct keys even if they have identical bodies.

---

## 8. Plugin Lifecycle Hooks

These functions let plugin files register callbacks that fire when a plugin is activated, deactivated, or uninstalled.

### `register_activation_hook(file, callback)`

Registers `callback` on the action `activate_{plugin-basename}`.

The plugin basename is derived from `file` by stripping the `WP_PLUGIN_DIR` or `WPMU_PLUGIN_DIR` prefix. For a plugin at `wp-content/plugins/myplugin/myplugin.php`, the hook name becomes `activate_myplugin/myplugin.php`.

Activation hook fires inside `wp-admin/plugins.php` when the admin activates the plugin.

### `register_deactivation_hook(file, callback)`

Same pattern. Hook name: `deactivate_{plugin-basename}`.

### `register_uninstall_hook(file, callback)`

Different mechanism from activation/deactivation. Instead of `add_action`, it stores `{ pluginBasename → callback }` in the `uninstall_plugins` option in the database (not autoloaded). The uninstaller reads this option and calls the stored callback when the admin deletes the plugin.

**Constraint**: the callback must be a static method or a plain function. Instance method callbacks are rejected at registration time (logged as `_doing_it_wrong`). Reason: the plugin would have to be included to instantiate the object, running global code during uninstall.

**Alternative**: plugins can instead create an `uninstall.php` file in their root directory. That file is included directly during uninstall; it must check `defined('WP_UNINSTALL_PLUGIN')` before executing.

---

## 9. Pre-initialization Support (`build_preinitialized_hooks`)

The global `$wp_filter` array may be populated before `plugin.php` is loaded (e.g. by a must-use plugin or advanced-cache drop-in that sets `$wp_filter` directly as a plain PHP array). When `plugin.php` loads, it checks:

```php
if ($wp_filter) {
    $wp_filter = WP_Hook::build_preinitialized_hooks($wp_filter);
}
```

`build_preinitialized_hooks` converts any plain-array entries in the format:

```
hookName → priority → [ { function, accepted_args } ]
```

…into proper `WP_Hook` instances, leaving existing `WP_Hook` instances untouched.

This is the hook engine's equivalent of a "cold start hydration" path.

---

## 10. Plugin Path Resolution (`plugin_basename`, `wp_register_plugin_realpath`)

### `plugin_basename(file)`

Given an absolute path to a plugin file, returns the plugin's "basename" — the path relative to the plugins or mu-plugins directory. Used to derive hook names for activation/deactivation and to identify plugins in the database.

Handles **symlinked plugins** via `wp_register_plugin_realpath`: plugins must call `wp_register_plugin_realpath(__FILE__)` to register their real filesystem path. `plugin_basename` then maps the real path back to the logical plugin directory path.

### `plugin_dir_path(file)` / `plugin_dir_url(file)`

Convenience helpers for plugins to get their own directory path/URL from `__FILE__`.

---

## 11. TypeScript Interface

```typescript
type HookCallback = (...args: unknown[]) => unknown;

interface HookRegistration {
  hookName: string;
  callback: HookCallback;
  priority?: number;        // default 10
  acceptedArgs?: number;    // default 1
}

interface HookEngine {
  // Filters
  addFilter(hookName: string, callback: HookCallback, priority?: number, acceptedArgs?: number): true;
  applyFilters(hookName: string, value: unknown, ...args: unknown[]): unknown;
  applyFiltersRefArray(hookName: string, args: unknown[]): unknown;
  hasFilter(hookName: string, callback?: HookCallback | false, priority?: number | false): boolean | number;
  removeFilter(hookName: string, callback: HookCallback, priority?: number): boolean;
  removeAllFilters(hookName: string, priority?: number | false): true;
  currentFilter(): string | false;
  doingFilter(hookName?: string | null): boolean;
  didFilter(hookName: string): number;
  applyFiltersDeprecated(hookName: string, args: unknown[], version: string, replacement?: string, message?: string): unknown;

  // Actions (delegates to filter equivalents)
  addAction(hookName: string, callback: HookCallback, priority?: number, acceptedArgs?: number): true;
  doAction(hookName: string, ...args: unknown[]): void;
  doActionRefArray(hookName: string, args: unknown[]): void;
  hasAction(hookName: string, callback?: HookCallback | false, priority?: number | false): boolean | number;
  removeAction(hookName: string, callback: HookCallback, priority?: number): boolean;
  removeAllActions(hookName: string, priority?: number | false): true;
  currentAction(): string | false;
  doingAction(hookName?: string | null): boolean;
  didAction(hookName: string): number;
  doActionDeprecated(hookName: string, args: unknown[], version: string, replacement?: string, message?: string): void;
}

// Internal WP_Hook equivalent
interface HookBucket {
  // priority → (callbackId → { fn, acceptedArgs })
  callbacks: Map<number, Map<string, { fn: HookCallback; acceptedArgs: number }>>;
  priorities: number[];           // sorted ascending, cached
  nestingLevel: number;
  doingAction: boolean;
  // Per nesting level:
  iterations: number[][];         // snapshots of priorities for safe re-entrant iteration
  currentPriority: number[];

  addCallback(hookName: string, callback: HookCallback, priority: number, acceptedArgs: number): void;
  removeCallback(hookName: string, callback: HookCallback, priority: number): boolean;
  hasCallbacks(): boolean;
  applyFilters(value: unknown, args: unknown[]): unknown;
  doAction(args: unknown[]): void;
  currentPriorityLevel(): number | false;
}

// Plugin lifecycle
interface PluginLifecycle {
  registerActivationHook(file: string, callback: HookCallback): void;
  registerDeactivationHook(file: string, callback: HookCallback): void;
  registerUninstallHook(file: string, callback: Function): void;  // must be static/function
}
```

---

## 12. Design Patterns to Carry Over

1. **Actions are filters with discarded return values.** One implementation, two API surfaces. This is not an accident — it eliminates duplication and ensures consistent execution semantics.

2. **Priority queue with FIFO tie-breaking.** Priorities are integers (can be negative, zero, or any integer). At the same priority, callbacks run in registration order. The sorted priority array is cached (`this.priorities`) and only re-sorted when a new priority bucket is added.

3. **Safe mid-iteration mutation.** Adding or removing callbacks while a hook is executing is safe and has defined behavior. This is fundamental to WordPress's plugin model — plugins routinely remove/re-add hooks inside other hooks. The `iterations` array snapshot + `resort_active_iterations` mechanism must be reproduced faithfully.

4. **Recursive/re-entrant hooks.** A callback can call `apply_filters` or `do_action` for the same hook it's currently inside. The `nesting_level` counter and per-level `iterations` snapshot handle this correctly.

5. **The `all` wildcard.** Must be handled as a first-class special case, not a regular hook. It sees every invocation before the named hook's own callbacks run.

6. **Callback identity by reference, not equality.** Two closures with identical code are different callbacks. An object method callback is identified by object instance + method name. This means `remove_filter` requires keeping a reference to the original callable.

7. **Lazy hook entry creation and eager cleanup.** `WP_Hook` entries are created only when first needed, and deleted when all callbacks are removed. The registry stays clean and memory usage is proportional to the number of actually-registered hooks.

8. **Pre-initialization path.** The system must support hooks being registered before the engine itself is initialized (e.g. in config files or very early bootstrap code). The `build_preinitialized_hooks` serialization format must be defined and supported.

9. **Separate fire counters for actions vs filters.** `did_action` and `did_filter` use separate counters (`wpActions` vs `wpFilters`), even though both are built on the same execution primitive. This distinction is meaningful at the API level.

10. **Uninstall hooks use the database, not the in-memory registry.** The uninstall callback must survive a PHP process end and a new process start (when the admin clicks "Delete"). This cannot be an in-memory `add_action`.

---

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

The hook engine exists because WordPress's product surface is intentionally incomplete without extension code. Actions and filters are the shared mutation and observation mechanism that let plugins alter core behavior without forking the core itself.

### 13.2 What Tovu should preserve

- Deterministic priority ordering with safe mid-iteration mutation
- One extension engine that supports both "transform a value" and "observe a lifecycle event" patterns
- Re-entrant execution semantics so nested hooks behave predictably
- Stable callback identity and lifecycle registration rules for install/uninstall behavior

### 13.3 What Tovu can simplify

- Tovu does not need to expose only stringly-typed hooks internally if typed domain events and extension contracts are clearer
- The public extension seam can be smaller than WordPress's omnipresent hooks as long as high-value mutation points are still available
- The `all` wildcard and early-bootstrap compatibility path can come later if the extension model starts narrower

### 13.4 Possible Tovu seams

- `src/core/hooks/` for the execution engine and registration store
- `src/core/ports/ExtensionHookPort.ts` for the public action/filter contract
- `src/core/ports/PluginLifecyclePort.ts` for activation, deactivation, and uninstall registration
- higher-level feature modules expose typed hook names on top of the shared engine

### 13.5 Suggested priority

- `V1`: deterministic action/filter execution, safe mutation during iteration, plugin lifecycle hooks
- `Later`: wildcard hooks, broader compatibility shims, and deeper debug/introspection tooling
