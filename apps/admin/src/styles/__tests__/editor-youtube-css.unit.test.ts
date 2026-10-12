import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("constrains fixed YouTube dimensions only inside the editable TipTap surface", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8");
  document.head.append(style);
  const root = document.createElement("div");
  root.innerHTML = '<div class="editor-body" style="width:375px"><div class="tiptap"><div data-youtube-video><iframe width="640" height="480"></iframe></div></div></div><div data-youtube-video><iframe width="640" height="480"></iframe></div>';
  document.body.append(root);
  try {
    const frame = root.querySelector<HTMLIFrameElement>(".tiptap iframe")!;
    const css = getComputedStyle(frame);
    expect([css.width, css.maxWidth, css.height, css.aspectRatio]).toEqual(["100%", "100%", "auto", "16 / 9"]);
    const publicFrame = root.lastElementChild!.querySelector("iframe")!;
    expect(getComputedStyle(publicFrame).aspectRatio).not.toBe("16 / 9");
    expect([publicFrame.getAttribute("width"), publicFrame.getAttribute("height")]).toEqual(["640", "480"]);
  } finally { root.remove(); style.remove(); }
});
