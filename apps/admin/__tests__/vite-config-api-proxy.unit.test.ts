import { expect, test, vi } from "vitest";

import config from "../vite.config";
import { destroyClientWhenUpstreamCloses } from "../dev-proxy-upstream-close";

// Read the real config without loading a second Vite/esbuild service inside vitest.
vi.mock("vite", () => ({ defineConfig: (options: unknown) => options }));
vi.mock("@vitejs/plugin-react", () => ({ default: () => ({ name: "test-react" }) }));

test("the real /api proxy installs the upstream-close handler", () => {
  expect(config.server?.proxy?.["/api"]).toMatchObject({
    configure: destroyClientWhenUpstreamCloses,
  });
});
