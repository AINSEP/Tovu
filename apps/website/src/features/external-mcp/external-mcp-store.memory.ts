import { InMemoryExternalMcpServerRepo as HostedInMemoryExternalMcpServerRepo } from "@jini-ai/mcp/federation/hosted";
import { externalMcpVaultPorts } from "./external-mcp-vault.js";

// The in-memory repository moved to `@jini-ai/mcp/federation/hosted` (EXTRACT-S5 H1b, source blob 87595f9e).
// This subclass keeps `new InMemoryExternalMcpServerRepo()` and binds Tovu's vault ports once.
export class InMemoryExternalMcpServerRepo extends HostedInMemoryExternalMcpServerRepo {
  constructor() {
    super(externalMcpVaultPorts);
  }
}
