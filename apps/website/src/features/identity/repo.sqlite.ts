import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

import {
  SqlApiKeyRepo,
  SqlPolicyPermissionRepo,
  SqlPolicyRepo,
  SqlPrincipalPolicyRepo,
  SqlPrincipalRepo,
  SqlPrincipalRoleRepo,
  SqlRolePolicyRepo,
  SqlRoleRepo,
  SqlSessionRepo,
  SqlUserRepo,
} from "./repo.js";

/**
 * @file The identity repo adapters on a site's SQLite `content.db`: each class is its `Sql*` repo
 * (the one Kysely query body, `repo.ts`), kept as a named class so `wiring.ts`, which builds them
 * from the content db handle, stays as it is. Each constructor takes the connection's kernel, or
 * the content db handle it is derived from.
 */

type Store = ContentKernel | ContentDb;

export class SqlitePrincipalRepo extends SqlPrincipalRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqliteUserRepo extends SqlUserRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqliteSessionRepo extends SqlSessionRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqliteRoleRepo extends SqlRoleRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqlitePolicyRepo extends SqlPolicyRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqlitePolicyPermissionRepo extends SqlPolicyPermissionRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqliteRolePolicyRepo extends SqlRolePolicyRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqlitePrincipalRoleRepo extends SqlPrincipalRoleRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqlitePrincipalPolicyRepo extends SqlPrincipalPolicyRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}

export class SqliteApiKeyRepo extends SqlApiKeyRepo {
  constructor(store: Store) {
    super(contentKernel(store));
  }
}
