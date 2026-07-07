# Abilities API - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/abilities-api.php`
- `wp-includes/abilities.php`
- `wp-includes/abilities-api/class-wp-ability.php`
- `wp-includes/abilities-api/class-wp-ability-category.php`
- `wp-includes/abilities-api/class-wp-abilities-registry.php`
- `wp-includes/abilities-api/class-wp-ability-categories-registry.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-abilities-v1-list-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-abilities-v1-categories-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-abilities-v1-run-controller.php`
- `wp-includes/default-filters.php`

---

## 1. Overview

The Abilities API is a registry-driven runtime for named, callable operations with schema, permission, and REST exposure metadata. It adds a structured layer above ad hoc function calls so WordPress can describe, validate, discover, and execute discrete capabilities in a uniform way.

In practice, an ability is:

- named with a namespace
- grouped into a category
- validated with input and output schemas
- guarded by a permission callback
- optionally exposed through REST

The current core abilities are deliberately small and diagnostic:

- `core/get-site-info`
- `core/get-user-info`
- `core/get-environment-info`

---

## 2. Registration Lifecycle

### 2.1 Hook boundaries

Abilities must be registered on `wp_abilities_api_init`.

Ability categories must be registered on `wp_abilities_api_categories_init`.

If registration happens outside those hooks, WordPress throws `_doing_it_wrong()` warnings and refuses the registration.

### 2.2 Core bootstrapping

`wp-includes/default-filters.php` wires:

- `wp_register_core_ability_categories` to `wp_abilities_api_categories_init`
- `wp_register_core_abilities` to `wp_abilities_api_init`

That means the base runtime has a predictable core catalog before plugins add their own abilities.

### 2.3 Registry contract

The public helpers are:

- `wp_register_ability()`
- `wp_unregister_ability()`
- `wp_has_ability()`
- `wp_get_ability()`
- `wp_get_abilities()`
- `wp_register_ability_category()`
- `wp_unregister_ability_category()`
- `wp_has_ability_category()`
- `wp_get_ability_category()`
- `wp_get_ability_categories()`

The registry objects themselves are singletons and the public API is the intended entry surface.

---

## 3. `WP_Ability` Contract

### 3.1 Required fields

An ability requires:

- `label`
- `description`
- `category`
- `execute_callback`
- `permission_callback`

Optional fields include:

- `input_schema`
- `output_schema`
- `meta`

### 3.2 Meta annotations

The runtime keeps three semantic annotations:

- `readonly`
- `destructive`
- `idempotent`

They are hints for tooling and routing, not hard guarantees about safety.

The other important meta flag is:

- `show_in_rest`

which controls whether the ability is discoverable or callable through REST.

### 3.3 Input/output validation

`WP_Ability` normalizes and validates payloads in order:

1. normalize input using the input schema default if no input was supplied
2. validate input against `rest_validate_value_from_schema()`
3. run the permission callback with the normalized input
4. execute the callback
5. validate the returned output against the output schema

If no input schema exists, the ability can only accept `null`. That prevents silent drift between the declared contract and the actual execution path.

### 3.4 Execution hooks

The runtime fires:

- `wp_before_execute_ability`
- `wp_after_execute_ability`

These hooks wrap the validated execution boundary, not the raw callback.

---

## 4. Core Ability Definitions

### 4.1 Core categories

`wp_register_core_ability_categories()` registers:

- `site`
- `user`

Each category has a label and a description and is exposed as a readonly registry object.

### 4.2 `core/get-site-info`

This ability returns selected site-level settings such as:

- name
- description
- URL
- WordPress install URL
- admin email
- charset
- language
- version

Its permission callback requires `current_user_can( 'manage_options' )`.

### 4.3 `core/get-user-info`

This ability returns the authenticated user’s profile data:

- ID
- display name
- nicename
- login
- roles
- locale

Its permission gate is simply `is_user_logged_in()`.

### 4.4 `core/get-environment-info`

This ability returns runtime diagnostics:

- environment type
- PHP version
- database server info
- WordPress version

It is gated by `manage_options`.

---

## 5. REST Controllers

### 5.1 Ability discovery routes

`WP_REST_Abilities_V1_List_Controller` exposes:

- `GET /wp-abilities/v1/abilities`
- `GET /wp-abilities/v1/abilities/{name}`

Both routes require `current_user_can( 'read' )` and only expose abilities whose meta has `show_in_rest = true`.

The list endpoint supports:

- pagination
- `category` filtering
- HEAD requests for count-only probes

The item response includes a `wp:action-run` link so clients can discover the execution endpoint from the ability record itself.

### 5.2 Ability category routes

`WP_REST_Abilities_V1_Categories_Controller` exposes:

- `GET /wp-abilities/v1/categories`
- `GET /wp-abilities/v1/categories/{slug}`

Category responses also link back to the ability collection for that category.

### 5.3 Execution route

`WP_REST_Abilities_V1_Run_Controller` exposes:

- `/{name}/run`

under the same `wp-abilities/v1/abilities` namespace.

The route is registered with `WP_REST_Server::ALLMETHODS` because route registration happens before the runtime knows which abilities exist or which annotations they will have.

The execution controller enforces:

- ability existence
- `show_in_rest`
- method matching based on annotations
- input normalization
- input schema validation
- permission callback success

Method selection is annotation-driven:

- `readonly` abilities use `GET`
- destructive idempotent abilities use `DELETE`
- everything else uses `POST`

### 5.4 REST error behavior

The controller returns structured errors for:

- missing abilities
- missing categories
- invalid methods
- invalid input
- permission failures
- missing REST exposure

That keeps discovery and execution failures machine-readable.

---

## 6. TypeScript Rewrite Notes

### 6.1 Interface sketch

```typescript
interface AbilityMeta {
  annotations: {
    readonly?: boolean | null;
    destructive?: boolean | null;
    idempotent?: boolean | null;
  };
  show_in_rest: boolean;
}

interface AbilityDefinition {
  name: string;
  label: string;
  description: string;
  category: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  meta: AbilityMeta;
}
```

### 6.2 Carry-over patterns

- Keep registration and execution in separate layers.
- Require explicit hook timing for registry population.
- Treat `show_in_rest` as a discovery gate, not just a serialization flag.
- Make method choice derive from ability annotations instead of hard-coding it in the route.
- Keep category and ability registries independent so plugin modules can be swapped without changing the runtime contract.

## Tovu Reconstruction Notes

### Why this exists

The Abilities API exists to turn ad hoc callable behavior into a registry of named operations with schema, permission, and discovery metadata. The useful lesson for Tovu is the separation between ability definition, authorization, and execution.

### What Tovu should preserve

- A registry for named operations with explicit input and output contracts
- Separate category and ability registries so modules can be added or removed cleanly
- Permission checks before execution, not after side effects begin
- REST exposure as a projection of the runtime contract, not the contract itself

### What Tovu can simplify

- Tovu does not need WordPress's exact hook timing or the same core ability catalog
- The runtime can be smaller if it keeps the registry shape and drops the legacy compatibility surface
- REST discovery can be deferred until the execution layer is stable

### Possible Tovu seams

- `src/abilities/registry/` for ability and category catalogs
- `src/abilities/runtime/` for validation, permission checks, and execution
- `src/api/abilities/` for transport-facing discovery and run endpoints
- ports should keep execution swappable from the registry definition

### Suggested priority

- `V1`: registry, validation, permission gate, and execution path
- `Later`: REST discovery, richer metadata, and capability catalogs beyond the core set
