import { describe, expect, it } from "vitest";

import {
  ancestorFolderPaths,
  buildPackageFileTree,
  packageFileIconKind,
  packageFileTreeKeyAction,
  visiblePackageFileRows,
  type PackageFileTreeNode,
} from "../package-file-tree";

/** @file The file tree's pure helpers — grouping, visible rows, keyboard mapping, icon families. */

const DEPLOY_PATHS = [
  "mcp.json",
  "plugin.json",
  "tovu-deploy-targets.json",
  "deploy-configs/fly.mjs",
  "deploy-configs/railway.mjs",
  "targets/vercel.mjs",
  "targets/cloudflare-pages.mjs",
  "skills/deploy/SKILL.md",
  "skills/deploy/references/fly-deploy.template.yml",
  "skills/deploy/references/cloudflare-pages.md",
];

/** A compact outline: folders end in `/`, children indented two spaces. */
function outline(nodes: readonly PackageFileTreeNode[], indent = ""): string[] {
  return nodes.flatMap((node) =>
    node.kind === "folder" ? [`${indent}${node.name}/`, ...outline(node.children, `${indent}  `)] : [`${indent}${node.name}`],
  );
}

describe("buildPackageFileTree", () => {
  it("groups paths into folders, files first then folders, each alphabetical", () => {
    expect(outline(buildPackageFileTree(DEPLOY_PATHS))).toEqual([
      "mcp.json",
      "plugin.json",
      "tovu-deploy-targets.json",
      "deploy-configs/",
      "  fly.mjs",
      "  railway.mjs",
      "skills/",
      "  deploy/",
      "    SKILL.md",
      "    references/",
      "      cloudflare-pages.md",
      "      fly-deploy.template.yml",
      "targets/",
      "  cloudflare-pages.mjs",
      "  vercel.mjs",
    ]);
  });

  it("gives folders their full path and files their path exactly as listed", () => {
    const [configs] = buildPackageFileTree(["deploy-configs/fly.mjs"]);
    expect(configs).toEqual({
      kind: "folder",
      name: "deploy-configs",
      path: "deploy-configs",
      children: [{ kind: "file", name: "fly.mjs", path: "deploy-configs/fly.mjs" }],
    });
  });

  it("sorts case-insensitively and numerically, like VS Code", () => {
    expect(outline(buildPackageFileTree(["b.md", "A.md", "file10.md", "file2.md"]))).toEqual(["A.md", "b.md", "file2.md", "file10.md"]);
  });

  it("ignores stray slashes when grouping, and drops empty and duplicate paths", () => {
    const tree = buildPackageFileTree(["/a//b.md", "a/b.md", "", "/", "c/"]);
    expect(outline(tree)).toEqual(["c", "a/", "  b.md"]);
    const a = tree[1];
    expect(a?.kind === "folder" && a.children[0]?.path).toBe("/a//b.md");
  });

  it("returns an empty tree for no paths", () => {
    expect(buildPackageFileTree([])).toEqual([]);
  });
});

describe("ancestorFolderPaths", () => {
  it("lists every containing folder, outermost first", () => {
    expect(ancestorFolderPaths("skills/deploy/references/x.md")).toEqual(["skills", "skills/deploy", "skills/deploy/references"]);
  });

  it("is empty for a root file", () => {
    expect(ancestorFolderPaths("plugin.json")).toEqual([]);
  });
});

describe("visiblePackageFileRows", () => {
  const tree = buildPackageFileTree(DEPLOY_PATHS);

  it("shows only root entries while every folder is collapsed", () => {
    const rows = visiblePackageFileRows(tree, () => false);
    expect(rows.map((row) => row.node.path)).toEqual([
      "mcp.json",
      "plugin.json",
      "tovu-deploy-targets.json",
      "deploy-configs",
      "skills",
      "targets",
    ]);
    expect(rows.every((row) => row.depth === 0 && row.parentPath === null && row.setSize === 6)).toBe(true);
    expect(rows.map((row) => row.posInSet)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("walks into expanded folders with depth, parent and position within the folder", () => {
    const open = new Set(["skills", "skills/deploy"]);
    const rows = visiblePackageFileRows(tree, (path) => open.has(path));
    const skillRows = rows.slice(4, 8).map(({ node, depth, parentPath, setSize, posInSet }) => [node.path, depth, parentPath, setSize, posInSet]);
    expect(skillRows).toEqual([
      ["skills", 0, null, 6, 5],
      ["skills/deploy", 1, "skills", 1, 1],
      ["skills/deploy/SKILL.md", 2, "skills/deploy", 2, 1],
      ["skills/deploy/references", 2, "skills/deploy", 2, 2],
    ]);
  });

  it("hides a collapsed folder's descendants even when a nested folder is open", () => {
    const open = new Set(["skills/deploy"]);
    const rows = visiblePackageFileRows(tree, (path) => open.has(path));
    expect(rows.some((row) => row.node.path.startsWith("skills/"))).toBe(false);
  });
});

describe("packageFileTreeKeyAction", () => {
  const tree = buildPackageFileTree(DEPLOY_PATHS);
  const open = new Set(["skills", "skills/deploy"]);
  const isExpanded = (path: string) => open.has(path);
  const rows = visiblePackageFileRows(tree, isExpanded);
  const act = (current: string, key: string) => packageFileTreeKeyAction(rows, current, key, isExpanded);

  it("moves down and up, stopping at the ends", () => {
    expect(act("deploy-configs", "ArrowDown")).toEqual({ focus: "skills" });
    expect(act("skills", "ArrowUp")).toEqual({ focus: "deploy-configs" });
    expect(act("mcp.json", "ArrowUp")).toEqual({ focus: "mcp.json" });
    expect(act("targets", "ArrowDown")).toEqual({ focus: "targets" });
  });

  it("jumps with Home and End", () => {
    expect(act("skills", "Home")).toEqual({ focus: "mcp.json" });
    expect(act("skills", "End")).toEqual({ focus: "targets" });
  });

  it("Right expands a closed folder, then steps into an open one", () => {
    expect(act("targets", "ArrowRight")).toEqual({ focus: "targets", setExpanded: { path: "targets", expanded: true } });
    expect(act("skills", "ArrowRight")).toEqual({ focus: "skills/deploy" });
  });

  it("Right on a file stays put", () => {
    expect(act("mcp.json", "ArrowRight")).toEqual({ focus: "mcp.json" });
  });

  it("Left collapses an open folder, else steps out to the parent", () => {
    expect(act("skills/deploy", "ArrowLeft")).toEqual({ focus: "skills/deploy", setExpanded: { path: "skills/deploy", expanded: false } });
    expect(act("skills/deploy/SKILL.md", "ArrowLeft")).toEqual({ focus: "skills/deploy" });
    expect(act("targets", "ArrowLeft")).toEqual({ focus: "targets" });
  });

  it("Enter and Space open a file and toggle a folder", () => {
    expect(act("mcp.json", "Enter")).toEqual({ focus: "mcp.json", open: "mcp.json" });
    expect(act("mcp.json", " ")).toEqual({ focus: "mcp.json", open: "mcp.json" });
    expect(act("skills", "Enter")).toEqual({ focus: "skills", setExpanded: { path: "skills", expanded: false } });
    expect(act("targets", "Enter")).toEqual({ focus: "targets", setExpanded: { path: "targets", expanded: true } });
  });

  it("ignores other keys and an empty tree", () => {
    expect(act("mcp.json", "a")).toEqual({});
    expect(packageFileTreeKeyAction([], "x", "ArrowDown", () => false)).toEqual({});
  });

  it("treats an unknown current path as the first row", () => {
    expect(act("gone.md", "ArrowDown")).toEqual({ focus: "plugin.json" });
  });
});

describe("packageFileIconKind", () => {
  it.each([
    ["mcp.json", "json"],
    ["SKILL.md", "markdown"],
    ["fly.mjs", "javascript"],
    ["index.ts", "typescript"],
    ["fly-deploy.template.yml", "config"],
    ["logo.PNG", "image"],
    ["run.sh", "shell"],
    [".env", "config"],
    ["LICENSE", "file"],
    ["archive.xyz", "file"],
  ] as const)("%s -> %s", (name, kind) => {
    expect(packageFileIconKind(name)).toBe(kind);
  });
});
