import { expect, it } from "vitest";
import { chatPackageKind } from "../hooks/chat-package-kind";
import { zipFolderFiles } from "../../InstallTabCard/folder-zip";

async function archive(paths: string[]) {
  const files = paths.map(path => {
    const file = new File(["manifest"], path.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: `chosen/${path}` });
    return file;
  });
  return zipFolderFiles({ files, maxBytes: 1024 * 1024 });
}

it.each([[["SKILL.md"], "skill"], [["wrapped/SKILL.md"], "skill"], [["one/two/SKILL.md"], "attachment"],
  [["plugin.json", "SKILL.md"], "agent-plugin"], [["tovu.plugin.json", "SKILL.md"], "site-plugin"],
  [["wrapped/plugin.json"], "agent-plugin"], [["wrapped/tovu.plugin.json"], "site-plugin"], [["README.md"], "attachment"],
] as const)("classifies %j from central-directory names as %s", async (paths, kind) => {
  expect(await chatPackageKind({ file: await archive([...paths]) })).toBe(kind);
});

it("routes truncated central directories to chat", async () => {
  const file = await archive(["SKILL.md"]);
  expect(await chatPackageKind({ file: new File([file.slice(0, file.size - 1)], "broken.zip") })).toBe("attachment");
});
