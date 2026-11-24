import assert from "node:assert/strict";
import test from "node:test";
import { servingAddressOf, sitePreviewTargets, type PreviewableLocalSite } from "@jini-ai/cms/admin-http/routes/sites/site-previews";

function local(state: Partial<PreviewableLocalSite> & { name: string }): PreviewableLocalSite {
  return { status: "running", pid: 10, adminUrl: "https://localhost:3101/admin/", ...state };
}

test("targets are the served site at its own socket address plus every running local site's public root", () => {
  const targets = sitePreviewTargets({ servingName: "owner", localSites: [
    local({ name: "alpha" }),
    local({ name: "beta", status: "starting" }),
    local({ name: "gamma", status: "stopped", pid: null, adminUrl: null }),
    local({ name: "delta", pid: 12, adminUrl: "http://localhost:3104/admin/" }),
    local({ name: "owner" }),
  ] }, { serving: { scheme: "https", port: 3000, pid: 7 } });
  assert.deepEqual(targets, [
    { name: "owner", url: "https://localhost:3000/", lifecycle: "serving:7" },
    { name: "alpha", url: "https://localhost:3101/", lifecycle: "pid:10" },
    { name: "delta", url: "http://localhost:3104/", lifecycle: "pid:12" },
  ]);
  assert.deepEqual(sitePreviewTargets({ servingName: "owner", localSites: [] }), []);
});

test("servingAddressOf reads the socket, never a forwarded header, and is undefined without one", () => {
  assert.deepEqual(servingAddressOf({ req: { socket: { localPort: 3000, encrypted: true } } as never }, { pid: 7 }), { scheme: "https", port: 3000, pid: 7 });
  assert.deepEqual(servingAddressOf({ req: { socket: { localPort: 3000 } } as never }, { pid: 7 }), { scheme: "http", port: 3000, pid: 7 });
  assert.equal(servingAddressOf({ req: {} as never }), undefined);
});
