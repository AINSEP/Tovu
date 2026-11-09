import assert from "node:assert/strict";
import test from "node:test";
import type { ISODateTime, UUID } from "@jini-ai/core/primitives";
import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { SealedSecret } from "@jini-ai/platform/secrets";
import type { CredentialTokenHint } from "../../../contracts/core/credential-token.js";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import type { CustomCredentialCategoryId } from "../../../contracts/core/custom-credential-categories.js";
import type {
  CustomCredentialProjectScope, CustomCredentialScope, CustomCredentialSetRecord, CustomCredentialSetRepoPort,
  CustomCredentialSummary, CustomProviderConnectionInput,
} from "../types.js";

/**
 * @file EXTRACT-S8 C1 seam type pin. Hand-written copies of the `types.ts` shapes as they were at the
 * C0 tip (interfaces, before they became aliases of `@jini-ai/core/contracts/credentials`), checked for
 * exact key/readonly/optional identity and mutual assignability against the current exports. This is
 * a compile-time proof: run `tsc --noEmit` over this file explicitly; the runtime test is a marker.
 */

interface OldConnection { readonly token: string; readonly username?: string }
interface OldRecord {
  readonly worksFor?: readonly string[];
  readonly vaultRecord?: Parameters<VaultRepoPort["put"]>[0]["record"];
  readonly vaultExpectedRevision?: number | null;
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  readonly additionalHosts: readonly string[];
  readonly username?: string;
  readonly sealed: SealedSecret;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}
type OldScope = "site" | "project";
interface OldSummary {
  readonly credentialType: "custom";
  readonly worksFor: string[];
  readonly tokenHint?: CredentialTokenHint | null;
  readonly id: UUID;
  readonly label: string;
  readonly category: CustomCredentialCategoryId;
  readonly baseUrl: string;
  readonly additionalHosts: readonly string[];
  readonly username?: string;
  readonly configured: true;
  readonly scope?: OldScope;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}
interface OldProjectScope {
  readonly workspaceId: UUID;
  readonly repo: OldRepoPort;
  readonly replaceRepo?: OldRepoPort;
  readonly inventoryRepo?: Pick<OldRepoPort, "listByWorkspace">;
  readonly createRepo?: OldRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}
interface OldRepoPort {
  readonly vault?: VaultRepoPort;
  readonly project?: OldProjectScope;
  insert(record: OldRecord): Promise<void>;
  update(record: OldRecord): Promise<void>;
  findByLabel?(input: { workspaceId: UUID; label: string }): Promise<OldRecord | null>;
  findById(input: { workspaceId: UUID; id: UUID }): Promise<OldRecord | null>;
  listByWorkspace(input: { workspaceId: UUID }): Promise<OldRecord[]>;
  delete(input: { workspaceId: UUID; id: UUID }): Promise<void>;
}

/** Exact identity (readonly and optional modifiers included), not mere assignability. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SameKeys<A, B> = Equals<keyof A, keyof B>;
type ReadonlyKeys<T> = { [K in keyof T]-?: Equals<{ [Q in K]: T[K] }, { readonly [Q in K]: T[K] }> extends true ? K : never }[keyof T];
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];
type Shape<A, B> = [SameKeys<A, B>, Equals<ReadonlyKeys<A>, ReadonlyKeys<B>>, Equals<OptionalKeys<A>, OptionalKeys<B>>, Mutual<A, B>];

const pins: {
  connection: Shape<CustomProviderConnectionInput, OldConnection>;
  record: Shape<CustomCredentialSetRecord, OldRecord>;
  summary: Shape<CustomCredentialSummary, OldSummary>;
  scope: [Equals<CustomCredentialScope, OldScope>];
  project: Shape<CustomCredentialProjectScope, OldProjectScope>;
  repo: Shape<CustomCredentialSetRepoPort, OldRepoPort>;
  recordExact: [Equals<CustomCredentialSetRecord, OldRecord>, Equals<CustomCredentialSummary, OldSummary>, Equals<CustomProviderConnectionInput, OldConnection>];
} = {
  connection: [true, true, true, true],
  record: [true, true, true, true],
  summary: [true, true, true, true],
  scope: [true],
  project: [true, true, true, true],
  repo: [true, true, true, true],
  recordExact: [true, true, true],
};

test("old types.ts shapes are pinned at compile time (run tsc on this file)", () => {
  assert.equal(Object.keys(pins).length, 7);
});
