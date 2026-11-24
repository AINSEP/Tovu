import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { DomainDnsInputError, readPublicDomain as readDiagnosticDomain, readPublicDnsName as readDiagnosticDnsName } from "@jini-ai/diagnostics/domain-dns";
import { domainDnsAgentToolCatalog, toolInputPublicNames } from "@jini-ai/devops/dns/site/tools";

/** The host's binding: the diagnostics validators, wrapped so refusals surface as ToolInputError. */
const { readPublicDomain, readPublicDnsName } = toolInputPublicNames({ validators: { readPublicDomain: readDiagnosticDomain, readPublicDnsName: readDiagnosticDnsName } });
import { dnsChangeAgentToolCatalog } from "@jini-ai/devops/dns/site/dns-tools";

/** Pins the model-facing domain/DNS catalogs byte-for-byte, so moving them cannot drift the wording. */
const PINNED_SHA256 = "5a5af5b23d790688636a1160090879ca72f64d0d99b96584c6400c290a6fd048";

test("domain-dns catalogs: ids and permissions are pinned", () => {
  assert.deepEqual([...domainDnsAgentToolCatalog, ...dnsChangeAgentToolCatalog].map((t) => [t.name, t.authorization.permission]), [
    ["domain_lookup_dns", "content.read"], ["domain_check_dns", "deployments.read"], ["domain_tls_status", "content.read"],
    ["dns_plan", "deployments.read"], ["dns_instructions", "deployments.read"], ["dns_verify", "deployments.publish"],
  ]);
});

test("domain-dns catalogs: byte-identical to the pinned output", () => {
  const digest = createHash("sha256").update(JSON.stringify({ domainDnsAgentToolCatalog, dnsChangeAgentToolCatalog })).digest("hex");
  assert.equal(digest, PINNED_SHA256);
});

test("domain-dns validators: normalize public names and refuse others as ToolInputError caused by DomainDnsInputError", () => {
  assert.equal(readPublicDomain({ value: "EXAMPLE.COM.", errorPrefix: "p" }), "example.com");
  assert.equal(readPublicDnsName({ value: "_acme-challenge.Example.com", errorPrefix: "p" }), "_acme-challenge.example.com");
  const message = "p: pass a public DNS hostname such as 'example.com', without a URL, IP address, path, or port.";
  for (const value of ["_acme-challenge.example.com", "https://example.com", "10.0.0.1", "host.local", 5]) {
    assert.throws(() => readPublicDomain({ value, errorPrefix: "p" }), (error: unknown) => error instanceof ToolInputError && error.message === message && error.cause instanceof DomainDnsInputError);
  }
  assert.throws(() => readDiagnosticDomain({ value: "a b", errorPrefix: "p" }), (error: unknown) => error instanceof DomainDnsInputError && error.name === "DomainDnsInputError");
});
