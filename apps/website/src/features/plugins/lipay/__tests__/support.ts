/**
 * @file Shared fixtures for the lipay suite. Since the 2026-10-21 move onto Jini's payments
 * kernel, the provider is the kernel testkit's deterministic LiPay fake (`createLipayFake`) — never
 * a real network call — and credentials come through a `ProviderContextPort`, not a credential
 * bundle.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  createKernelProviderRegistry,
  createMemoryGrantStore,
  type MoneyGrantPort,
  type PaymentScope,
  type PaymentsPort,
  type ProviderContextPort,
} from "@jini-ai/commerce/payments/kernel";
import { createLipayFake, lipayFakeContext, type LipayFakeServer } from "@jini-ai/commerce/payments/testkit";
import type { LegacyLipayMapping } from "@jini-ai/commerce/payments/ledger/sql";
import type { PluginStore } from "../../plugin-store.js";
import { activateLipay } from "../lipay-plugin.js";

export const SCOPE: PaymentScope = { workspaceId: "workspace-1", siteId: "site-1", providerId: "lipay", providerAccountId: "acct_fake", mode: "test" };

/** Advanceable so ordering and timestamps are asserted, not guessed. */
export class TestClock {
  constructor(private current: number) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export function tempDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-lipay-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return { db, dbPath, dir };
}

export function cleanup(db: Database.Database, dir: string): void {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

export interface Harness {
  api: PaymentsPort;
  server: LipayFakeServer;
  grants: MoneyGrantPort;
  clock: TestClock;
}

/** A fully wired lipay adapter on `db`, with the kernel's LiPay fake registered. */
export async function lipayOn(
  db: PluginStore,
  dbPath: string,
  optional: { startAt?: number; legacyLipay?: LegacyLipayMapping } = {}
): Promise<Harness> {
  const clock = new TestClock(optional.startAt ?? Date.UTC(2026, 6, 30, 12, 0, 0));
  const now = () => clock.now();
  let seq = 0;
  const { server, provider } = createLipayFake({ now });
  const contexts: ProviderContextPort = { resolve: async () => ({ ok: true, ctx: lipayFakeContext({ now }) }) };
  const grants = createMemoryGrantStore({ now, newToken: () => `grant-${++seq}` });
  const api = await activateLipay({
    db,
    dbPath,
    providers: createKernelProviderRegistry({ items: [{ pluginId: "lipay", module: provider }] }),
    contexts,
    grants,
    now,
    newId: () => `pay-${++seq}`,
  }, optional.legacyLipay === undefined ? {} : { legacyLipay: optional.legacyLipay });
  return { api, server, grants, clock };
}

/** {@link lipayOn} against a real SQLite file. */
export async function makeLipay(): Promise<Harness & { db: Database.Database; dir: string }> {
  const { db, dbPath, dir } = tempDb();
  return { ...(await lipayOn(db, dbPath)), db, dir };
}

/** A single-use refund grant for exactly this payment, amount and key (what the approval flow mints). */
export function refundGrant(
  required: { grants: MoneyGrantPort; clock: TestClock; paymentId: string; minorUnits: number; idempotencyKey: string }
): Promise<string> {
  const { grants, clock, paymentId, minorUnits, idempotencyKey } = required;
  return grants.mint({
    binding: { op: "refund", workspaceId: SCOPE.workspaceId, mode: SCOPE.mode, paymentId, amount: { minorUnits, currency: "USD" }, idempotencyKey },
    expiresAt: clock.now() + 60_000,
  });
}
