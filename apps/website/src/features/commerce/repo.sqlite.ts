import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import {
  type CommerceKernel,
  SqlCommerceOrderRepo,
  SqlCommercePriceRepo,
  SqlCommerceProductImageRepo,
  SqlCommerceProductRepo,
  SqlCommerceWebhookEventRepo,
} from "@jini-ai/commerce/repo";

/**
 * @file The commerce repos on a site's SQLite `content.db` (the one Kysely query body, `repo.ts`).
 * Kept as named classes so existing call sites that construct them from the content db handle stay
 * as they are; new code calls the `commerce…RepoFor` factories.
 */
export class SqliteCommerceProductRepo extends SqlCommerceProductRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as CommerceKernel });
  }
}

export class SqliteCommerceProductImageRepo extends SqlCommerceProductImageRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as CommerceKernel });
  }
}

export class SqliteCommercePriceRepo extends SqlCommercePriceRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as CommerceKernel });
  }
}

export class SqliteCommerceOrderRepo extends SqlCommerceOrderRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as CommerceKernel });
  }
}

export class SqliteCommerceWebhookEventRepo extends SqlCommerceWebhookEventRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as CommerceKernel });
  }
}
