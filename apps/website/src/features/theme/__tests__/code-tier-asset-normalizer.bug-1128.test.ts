import assert from "node:assert/strict";
import test from "node:test";
import { planAssetRelocation, rewriteBundlerHtml } from "../code-tier-asset-normalizer.js";

test("BUG T-B09: relocating script src leaves data-src unchanged", () => {
  const html = '<link rel="stylesheet" href="styles.css"><script data-src="main.js" src="main.js"></script>';
  const plan = planAssetRelocation({ fileNames: ["styles.css", "main.js"] });

  assert.equal(rewriteBundlerHtml({ html, plan, primaryStylesheetFile: "styles.css" }),
    '<link rel="stylesheet" href="../css/styles.css" /><script data-src="main.js" src="../js/main.js"></script>');
});
