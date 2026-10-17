import { render, renderHook, waitFor } from "@testing-library/react";
import { useCmsSidebarLabelTooltips } from "../../hooks/use-cms-sidebar-label-tooltips.hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

it("expanded sidebar labels wrap at word boundaries and Soon badges stay whole", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const label = effectiveDeclarationsFor(stylesheet, ".cms-item > span:not(.soon)");
  expect(label).toMatch(/white-space:\s*normal;/);
  expect(label).toMatch(/overflow-wrap:\s*normal;/);
  expect(label).toMatch(/word-break:\s*normal;/);
  const badge = effectiveDeclarationsFor(stylesheet, ".cms-item .soon");
  expect(badge).toMatch(/white-space:\s*nowrap;/);
  expect(badge).toMatch(/flex-shrink:\s*0;/);
});

function Tooltips() { useCmsSidebarLabelTooltips({}); return null; }

it("tooltips keep the full translated label and follow a locale change without shortening text", async () => {
  const view = render(<nav id="admin-sidebar"><a className="cms-item" href="/admin"><span>Megfigyelhetőség</span></a><Tooltips /></nav>);
  const link = view.container.querySelector("a")!;
  expect(link.title).toBe("Megfigyelhetőség");
  view.rerender(<nav id="admin-sidebar"><a className="cms-item" href="/admin"><span>Observability</span></a><Tooltips /></nav>);
  await waitFor(() => expect(link.title).toBe("Observability"));
  expect(link.textContent).toBe("Observability");
});

it("restores existing titles and removes added titles when the hook unmounts", async () => {
  const view = render(<nav id="custom-sidebar">
    <a className="cms-item" title="Original title"><span>Pages</span></a>
    <a className="cms-item" href="/admin/posts"><span>Posts</span></a>
    <a className="cms-item" href="/admin/empty"><span /></a>
    <a className="cms-item" href="/admin/no-label">No span</a>
  </nav>);
  const [pages, posts, empty, noLabel] = view.container.querySelectorAll("a");
  const hook = renderHook(() => useCmsSidebarLabelTooltips({ navId: "custom-sidebar" }, { doc: document }));
  expect(pages!.title).toBe("Pages");
  expect(posts!.title).toBe("Posts");
  expect(empty!.hasAttribute("title")).toBe(false);
  expect(noLabel!.hasAttribute("title")).toBe(false);

  pages!.querySelector("span")!.textContent = "Seiten";
  await waitFor(() => expect(pages!.title).toBe("Seiten"));
  hook.unmount();
  expect(pages!.title).toBe("Original title");
  expect(posts!.hasAttribute("title")).toBe(false);
});

it("does nothing when the requested sidebar does not exist", () => {
  const doc = document.implementation.createHTMLDocument();
  const link = doc.createElement("a");
  link.className = "cms-item";
  link.title = "Unrelated title";
  link.innerHTML = "<span>Unrelated label</span>";
  doc.body.append(link);
  const hook = renderHook(() => useCmsSidebarLabelTooltips({ navId: "missing" }, { doc }));
  hook.unmount();
  expect(link.title).toBe("Unrelated title");
});
