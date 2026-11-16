import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTaxonomy, AdminTaxonomyWithTerms } from "@/features/taxonomy/api/taxonomy-api.types";
import { adminFailureChannel } from "@/lib/admin-failure-channel";
import { useTaxonomyHtmlEmbed } from "../hooks/use-taxonomy-html-embed.hooks";

/** Copy writes the saved-identity embed and shows translated feedback for success and failure. */

const t = (key: string) => `«${key}»`;
const tax = (id: string, name: string): AdminTaxonomy => ({ id, name, hierarchical: false, status: "active", updatedAt: "2026-10-04", version: 1 });
const group = (taxonomy: AdminTaxonomy): AdminTaxonomyWithTerms => ({ taxonomy, terms: [] });

afterEach(() => { vi.unstubAllGlobals(); adminFailureChannel.reset(); });

describe("useTaxonomyHtmlEmbed", () => {
  it("copies an embed keyed by the unique saved name and confirms", async () => {
    const writes: string[] = [];
    const clipboard = { writeText: async (text: string) => { writes.push(text); } };
    const topics = tax("tx_1", "Topics");
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: [group(topics), group(tax("tx_2", "Tags"))], t }, { clipboard }));
    expect(result.current.copyFeedback).toBeNull();
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: topics }); });
    expect(writes).toEqual([`<div data-embed-config='{"type":"taxonomy","id":"Topics","mode":"html"}'></div>`]);
    expect(result.current.copyFeedback).toBe("«Copied!»");
  });

  it("falls back to the id when the saved name is shared", async () => {
    const writes: string[] = [];
    const clipboard = { writeText: async (text: string) => { writes.push(text); } };
    const a = tax("tx_a", "Topics");
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: [group(a), group(tax("tx_b", "Topics"))], t }, { clipboard }));
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: a }); });
    expect(writes).toEqual([`<div data-embed-config='{"type":"taxonomy","id":"tx_a","mode":"html"}'></div>`]);
  });

  it("treats a not-yet-loaded list as empty: the copied taxonomy is then keyed by id", async () => {
    const writes: string[] = [];
    const clipboard = { writeText: async (text: string) => { writes.push(text); } };
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: null, t }, { clipboard }));
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: tax("tx_9", "Topics") }); });
    expect(writes).toEqual([`<div data-embed-config='{"type":"taxonomy","id":"tx_9","mode":"html"}'></div>`]);
    expect(result.current.copyFeedback).toBe("«Copied!»");
  });

  it("shows the failure message when the clipboard refuses", async () => {
    adminFailureChannel.reset();
    const clipboard = { writeText: async () => { throw new DOMException("denied", "NotAllowedError"); } };
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: [], t }, { clipboard }));
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: tax("tx_1", "Topics") }); });
    expect(result.current.copyFeedback).toBe("«Could not copy embed»");
    expect(adminFailureChannel.getSnapshot()).toBeNull();
  });

  it("publishes redacted details for an unexpected clipboard failure", async () => {
    adminFailureChannel.reset();
    const clipboard = { writeText: async () => { throw new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"); } };
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: [], t }, { clipboard }));
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: tax("tx_1", "Topics") }); });
    expect(result.current.copyFeedback).toBe("«Could not copy embed»");
    const failure = adminFailureChannel.getSnapshot();
    expect(failure?.message).toBe("The taxonomy embed code could not be copied.");
    expect(failure?.step).toBe("Copy taxonomy embed code");
    expect(failure?.copyText).toContain("boom");
    expect(failure?.copyText).not.toContain("SECRETSECRETSECRETSECRET");
    expect(failure?.copyText).toContain(`Error ID: ${failure?.errorId}`);
    expect(failure?.copyText).toMatch(/App version: Tovu Admin /);
    expect(failure?.copyText).toMatch(/Jini version: \d+\.\d+\.\d+/);
    expect(failure?.copyText).toMatch(/Time: \d{4}-\d{2}-\d{2}T/);
  });

  it("uses the browser clipboard when no port is injected", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const topics = tax("tx_1", "Topics");
    const { result } = renderHook(() => useTaxonomyHtmlEmbed({ taxonomies: [group(topics)], t }));
    await act(async () => { await result.current.copyHtmlEmbed({ taxonomy: topics }); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(`<div data-embed-config='{"type":"taxonomy","id":"Topics","mode":"html"}'></div>`);
    expect(result.current.copyFeedback).toBe("«Copied!»");
  });
});
