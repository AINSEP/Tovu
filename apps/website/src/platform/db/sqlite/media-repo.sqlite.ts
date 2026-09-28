import { type ContentKernel, contentKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";
import {
  SqlAssetBlobRepo,
  SqlAssetRenditionRepo,
  SqlMediaContentTypeStore,
  SqlMediaRepo,
  SqlTransformDefinitionRepo,
} from "../repos/media-repo.js";

/**
 * @file The media repos on a site's SQLite `content.db`: the one Kysely query body each
 * (`repos/media-repo.ts`), kept under the `Sqlite*` names so the composition root that builds them
 * from the content db handle stays as it is. Each constructor takes the connection's kernel, or the
 * content db handle it is derived from.
 */

export class SqliteMediaRepo extends SqlMediaRepo {
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteAssetBlobRepo extends SqlAssetBlobRepo {
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteMediaContentTypeStore extends SqlMediaContentTypeStore {
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteAssetRenditionRepo extends SqlAssetRenditionRepo {
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteTransformDefinitionRepo extends SqlTransformDefinitionRepo {
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
