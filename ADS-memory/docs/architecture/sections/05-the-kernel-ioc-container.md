## 5. The Kernel (IoC Container)

The kernel is the DI container that wires everything together. No framework, no external dependencies. Pure TypeScript.

```typescript
// packages/kernel/src/tovu.ts

export class Tovu {
  private services = new Map<symbol, unknown>();
  private hooks: HookSystem;
  private plugins: PluginRuntime;
  private _booted = false;

  constructor(private config: TovuConfig) {
    this.hooks = new HookSystem();
    this.plugins = new PluginRuntime(this);
  }

  // ─── Service Registration (Dependency Injection) ────────────

  /**
   * Register a service implementation for a port.
   * This is how adapters plug in.
   */
  register<T>(token: ServiceToken<T>, implementation: T): void {
    if (this._booted) {
      throw new Error(`Cannot register services after boot. Register '${token.description}' earlier.`);
    }
    this.services.set(token, implementation);
  }

  /**
   * Resolve a service. Throws if not registered — fail fast.
   */
  resolve<T>(token: ServiceToken<T>): T {
    const service = this.services.get(token);
    if (!service) {
      throw new Error(
        `Service '${token.description}' not registered. ` +
        `Did you forget to install an adapter?`
      );
    }
    return service as T;
  }

  /**
   * Check if a service is available (for optional dependencies).
   */
  has<T>(token: ServiceToken<T>): boolean {
    return this.services.has(token);
  }

  // ─── Boot Lifecycle ──────────────────────────────────────────

  async boot(): Promise<void> {
    // 1. Validate required services are registered
    this.validateRequired();

    // 2. Emit beforeBoot hook — adapters can do async setup here
    await this.hooks.emit('tovu.beforeBoot', this);

    // 3. Load plugins in dependency order
    await this.plugins.loadAll(this.config.plugins);

    // 4. Run migrations if needed
    if (this.config.autoMigrate) {
      await this.resolve(TOKENS.database).migrateSchema(
        this.resolve(TOKENS.schemaRegistry).getMigrationPlan()
      );
    }

    // 5. Signal ready
    this._booted = true;
    await this.hooks.emit('tovu.booted', this);
  }

  async shutdown(): Promise<void> {
    await this.hooks.emit('tovu.beforeShutdown', this);
    await this.hooks.emit('tovu.shutdown', this);
  }

  private validateRequired(): void {
    const required = [TOKENS.database, TOKENS.storage, TOKENS.auth];
    for (const token of required) {
      if (!this.has(token)) {
        throw new Error(
          `Required service '${token.description}' not registered.\n` +
          `Install an adapter: e.g., @tovu/db-postgres, @tovu/db-sqlite`
        );
      }
    }
  }
}

// Service tokens — typed symbols used for DI
export const TOKENS = {
  database:   Symbol.for('tovu.database') as ServiceToken<DatabasePort>,
  storage:    Symbol.for('tovu.storage')  as ServiceToken<StoragePort>,
  auth:       Symbol.for('tovu.auth')     as ServiceToken<AuthPort>,
  search:     Symbol.for('tovu.search')   as ServiceToken<SearchPort>,
  llm:        Symbol.for('tovu.llm')      as ServiceToken<LLMPort>,
  hooks:      Symbol.for('tovu.hooks')    as ServiceToken<HookSystem>,
} as const;

// Type-safe service token
export type ServiceToken<T> = symbol & { __type?: T };
```

---

