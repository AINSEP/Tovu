import { expect, it } from "vitest";
import { sidebarOwnsTitle } from "../shell-collaborators";

it.each([
  ["/admin/sites", true],
  ["/admin/posts", false],
  [null, false],
] as const)("decides tooltip ownership for href %s", (href, ownsTitle) => {
  const link = document.createElement("a");
  if (href !== null) link.setAttribute("href", href);

  expect(sidebarOwnsTitle({ link })).toBe(ownsTitle);
});
