import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Login } from "../Login";

it("the anonymous Login render never contains the seeded default password, including computed text", () => {
  // F1.4/F5.2: execute the real render and pin the seed source before checking absence.
  const owner = readFileSync(resolve(process.cwd(), "../website/src/platform/site-dir/new-site-owner.ts"), "utf8");
  const seed = owner.match(/export const DEFAULT_OWNER_PASSWORD = ("[^"\n]+");/);
  expect(seed).not.toBeNull();
  const password: string = JSON.parse(seed![1]);
  expect(password.length).toBeGreaterThan(0);

  // SSR executes the real initial hooks without starting their effects or making HTTP requests.
  const markup = renderToStaticMarkup(<FetchQueryProvider><Login onLogin={() => {}} /></FetchQueryProvider>);
  expect(markup).toContain('class="login-card"');
  expect(markup).toContain('type="password"');
  expect(markup).not.toContain(password);
});
