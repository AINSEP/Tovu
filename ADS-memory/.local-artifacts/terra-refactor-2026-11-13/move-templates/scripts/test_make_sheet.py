import os, subprocess, tempfile, unittest, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sheet as m


class Analyze(unittest.TestCase):
    def test_pure_reexport_file(self):
        a = m.analyze('// c\nexport { a, type B } from "@jini-ai/x/y";\nexport * from "./z.js";\n')
        self.assertEqual(a["code_lines"], 0)
        self.assertFalse(a["has_body"])
        self.assertEqual([r[0] for r in a["reexports"]], ["a", "B", "*"])
        self.assertTrue(a["reexports"][1][3])

    def test_import_then_export_counts_as_reexport(self):
        a = m.analyze('import { make } from "@jini-ai/x";\nexport { make };\n')
        self.assertEqual(a["code_lines"], 0)
        self.assertEqual(a["reexports"][0][2], "@jini-ai/x")

    def test_real_bodies_and_lines(self):
        a = m.analyze('/* x\n y */\nexport const K = 1;\nexport function f() { return 1; }\nexport async function g() {}\n')
        self.assertTrue(a["has_body"])
        self.assertEqual([(n, l) for n, l, _ in a["exports"]], [("K", 3), ("f", 4), ("g", 5)])

    def test_comment_stripping_keeps_lines(self):
        self.assertEqual(m.strip_comments("a\n/* x\ny */\nb // c\n").count("\n"), 4)


class Resolve(unittest.TestCase):
    def test_specifiers(self):
        self.assertEqual(m.resolve("apps/website/src/a/b.ts", "../c/d.js"), "apps/website/src/c/d.js")
        self.assertEqual(m.resolve("x.ts", "#src/a/b"), "apps/website/src/a/b")
        self.assertEqual(m.resolve("x.ts", "@/lib/q"), "apps/admin/src/lib/q")
        self.assertIsNone(m.resolve("x.ts", "node:fs"))

    def test_use_classes(self):
        self.assertEqual(m.classify_use('import * as x from "./a"'), "namespace")
        self.assertEqual(m.classify_use('vi.mock("./a")'), "MOCK")
        self.assertEqual(m.classify_use('export { a } from "./a"'), "reexport")
        self.assertEqual(m.classify_use('const x = await import("./a")'), "dynamic")


class Census(unittest.TestCase):
    """Builds a throwaway git repo; the census must NOT match another folder's identically named ./render."""
    def setUp(self):
        self.d = tempfile.mkdtemp()
        def w(p, t):
            os.makedirs(os.path.dirname(os.path.join(self.d, p)), exist_ok=True)
            open(os.path.join(self.d, p), "w").write(t)
        w("apps/website/src/feat/render.ts", "export function r() { return 1; }\n")
        w("apps/website/src/feat/use.ts", 'import { r } from "./render.js";\n')
        w("apps/website/src/other/render.ts", "export const o = 1;\n")
        w("apps/website/src/other/use.ts", 'import { o } from "./render.js";\n')
        w("apps/website/src/elsewhere/t.ts", 'import { r } from "#src/feat/render";\n')
        for c in (["git", "init", "-q"],):
            subprocess.run(c, cwd=self.d, check=True)

    def test_scoped_to_target(self):
        _, hits = m.census(self.d, "apps/website/src/feat/render.ts")
        self.assertEqual(sorted(h[0] for h in hits), ["apps/website/src/elsewhere/t.ts", "apps/website/src/feat/use.ts"])

    def test_index_forms(self):
        os.makedirs(os.path.join(self.d, "apps/website/src/pkg"))
        open(os.path.join(self.d, "apps/website/src/pkg/index.ts"), "w").write("export const a = 1;\n")
        open(os.path.join(self.d, "apps/website/src/pkg/inner.ts"), "w").write('import { a } from "./index.js";\n')
        open(os.path.join(self.d, "apps/website/src/elsewhere/p.ts"), "w").write('import { a } from "#src/pkg/index";\nimport "../pkg";\n')
        _, hits = m.census(self.d, "apps/website/src/pkg/index.ts")
        self.assertEqual(sorted({h[0] for h in hits}), ["apps/website/src/elsewhere/p.ts", "apps/website/src/pkg/inner.ts"])

    def test_blob_missing(self):
        self.assertEqual(m.blob(self.d, "nope.ts"), "MISSING")
        self.assertEqual(len(m.blob(self.d, "apps/website/src/feat/use.ts")), 40)


class Suspects(unittest.TestCase):
    def _fi(self, kind, text, **row):
        fi = m.FileInfo.__new__(m.FileInfo)
        fi.a, fi.kind, fi.row, fi.suspect, fi.rel = m.analyze(text), kind, dict(row, note=""), [], "x.ts"
        return fi

    def test_delete_with_bodies_is_suspect(self):
        fi = self._fi("DELETE", 'export { a } from "@jini-ai/x";\nexport function g() { return 1; }\n')
        m.suspects(".", ".", fi)
        self.assertTrue(any("KIND-SUSPECT DELETE" in s for s in fi.suspect))

    def test_delete_pure_reexport_is_fine(self):
        fi = self._fi("DELETE", 'export { a } from "@jini-ai/x";\n')
        m.suspects(".", ".", fi)
        self.assertEqual(fi.suspect, [])

    def test_repoint_with_code_is_suspect(self):
        fi = self._fi("REPOINT", 'export { a } from "@jini-ai/x";\nexport const k = 1;\n')
        m.suspects(".", ".", fi)
        self.assertTrue(any("KIND-SUSPECT REPOINT" in s for s in fi.suspect))


if __name__ == "__main__":
    unittest.main()
