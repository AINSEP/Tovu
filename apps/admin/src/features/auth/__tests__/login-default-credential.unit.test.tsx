import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Login } from "../Login";

it("the anonymous Login render never contains the seeded default password, including computed text", () => {
  // F1.4/F5.2: execute the real render and pin the seed source before checking absence.
  const wiring = readFileSync(resolve(process.cwd(), "../website/src/features/identity/wiring.ts"), "utf8");
  const seed = wiring.match(/export const DEFAULT_OWNER_PASSWORD = ("[^"\n]+");/);
  expect(seed).not.toBeNull();
  const password: string = JSON.parse(seed![1]);
  expect(password.length).toBeGreaterThan(0);

  // SSR executes the real initial hooks without starting their effects or making HTTP requests.
  const markup = renderToStaticMarkup(<Login onLogin={() => {}} />);
  expect(markup).toContain('class="login-card"');
  expect(markup).toContain('type="password"');
  expect(markup).not.toContain(password);
});
