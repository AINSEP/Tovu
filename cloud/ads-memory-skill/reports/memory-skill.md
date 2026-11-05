# memory-skill — completed draft

Status: draft delivered; installation intentionally left to the separate installing session. All tracked changes are under `cloud/ads-memory-skill/` in Tovu. No application code, installed toolkit files, dependencies, tests, schema, or runtime configuration changed.

## Branches and commits

- Tovu: `cloud/memory-skill`, based on required `e327c07c8fc220fa8612ba1eb60c81c28b8a900f` even though `origin/night-1105` has advanced.
- Pushed content: `bf6f61b937a3239da89b1c06d1eb2c8f5028fa77` — seven checks, Electron/evidence references, three-persona patch, registry text.
- Pushed correction: `2cf57acc1cf92f05f80e2204df9f335a3581ff31` — strip blank patch-context whitespace; patch applicability remains verified.
- This report is a subsequent documentation commit on the same branch; resolve its SHA with `git log -1 --format=%H -- cloud/ads-memory-skill/reports/memory-skill.md`. Final handoff names that pushed SHA.
- Jini: no commits or pushed branches. Instructions read from `origin/cloud-plans-1105` at `a2e6fe163f47309cda7d576a624dd511faea035d` after the requested fetch.

The first pull-before-push attempt reported a missing remote `cloud/memory-skill` ref, confirmed absent with `git ls-remote --heads origin cloud/memory-skill`; the initial push created it. Subsequent pushes use `git pull --rebase origin cloud/memory-skill` immediately before `git push origin HEAD:refs/heads/cloud/memory-skill`. No force push or main push.

## Delivered

- `skills/memory-performance-discipline/SKILL.md`: seven checks, 36 lines / 647 whitespace-delimited words; one canonical `Cost:` contract, related-skill ownership links, conditional references, no session names or provenance narrative.
- `skills/memory-performance-discipline/references/electron.md`: one page, 503 words; desktop-only trigger, process-mode attribution, guarded view release, thumbnail/IPC cost, shared sampling, process replacement, comparable memory metrics, official Electron links and repository incidents.
- `skills/memory-performance-discipline/references/evidence.md`: 20 lines; immutable commit/path anchors and measurement limits. Historical source/comments are distinguished from executed measurements.
- `persona-wiring.patch`: Programmer, Software Architect, Code Inspection skill/Cost pointers plus version/date updates. It is an unapplied proposal against the supplied toolkit snapshot.
- `registry-row.md`: exact three-consumer mapping and load strategy, with the missing registry/table-shape limitation disclosed.

Loaded `/workspace/cloud/ai-dev-shop/AGENTS.md` and the Software Architect, Programmer, TDD personas as required. Reused `coding-foundations`, `implementation-guardrails`, and `performance-engineering` ownership instead of duplicating their workflows.

## Verification

No code tests, TypeScript builds, complexity lint, application startup, benchmark, or Electron runtime executed: the job explicitly requires draft files only and no code tests; no touched package contains code. Existing tests and checks were not weakened. Pre-push hook reported no desktop changes and skipped desktop gates.

The commands below passed from this container. The link check resolves repository objects locally at their cited revisions; it does not claim that private GitHub URLs are publicly accessible. Official Electron process-model, environment-variable, process-memory, and performance documentation was also opened and checked through the web tool.

```bash
git -C /workspace/Tovu diff --check e327c07c8 HEAD
wc -l -w -c /workspace/Tovu/cloud/ads-memory-skill/skills/memory-performance-discipline/SKILL.md /workspace/Tovu/cloud/ads-memory-skill/skills/memory-performance-discipline/references/electron.md /workspace/Tovu/cloud/ads-memory-skill/skills/memory-performance-discipline/references/evidence.md
git -C /workspace/cloud/ai-dev-shop apply --check /workspace/Tovu/cloud/ads-memory-skill/persona-wiring.patch
python3 - <<'PY'
from pathlib import Path
import re, subprocess, tempfile, shutil
root = Path('/workspace/Tovu/cloud/ads-memory-skill')
skill = (root/'skills/memory-performance-discipline/SKILL.md').read_text()
assert len(skill.splitlines()) <= 55 and len(skill.split()) <= 650
assert re.findall(r'^([1-7])\. \*\*', skill, re.M) == list('1234567')
assert not re.search(r'/Users/|session|provenance|prov2|2026-11-04', skill, re.I)
links = 0
for p in (root/'skills').rglob('*.md'):
    for url in re.findall(r'\]\(([^)]+)\)', p.read_text()):
        if url.startswith('https://github.com/AINSEP/'):
            repo, kind, sha, path = re.fullmatch(r'https://github.com/AINSEP/(Tovu|Jini)/(blob|commit)/([^/]+)(?:/(.+))?', url).groups()
            obj = sha + (':' + path if kind == 'blob' else '^{commit}')
            subprocess.run(['git', '-C', '/workspace/'+repo, 'cat-file', '-e', obj], check=True)
            links += 1
        elif not url.startswith('https://'):
            target = (p.parent/url.split('#')[0]).resolve()
            assert target.exists() or (Path('/workspace/cloud/ai-dev-shop/skills')/target.relative_to(root/'skills')).exists()
assert links == 22
with tempfile.TemporaryDirectory(prefix='memory-skill-check-') as directory:
    tmp = Path(directory)
    for role in ['programmer', 'software-architect', 'code-inspection']:
        relative = Path('agents')/role/'skills.md'
        (tmp/relative).parent.mkdir(parents=True)
        shutil.copy2(Path('/workspace/cloud/ai-dev-shop')/relative, tmp/relative)
    subprocess.run(['git', '-C', str(tmp), 'apply', str(root/'persona-wiring.patch')], check=True)
    for role in ['programmer', 'software-architect', 'code-inspection']:
        content = (tmp/'agents'/role/'skills.md').read_text()
        assert content.count('/skills/memory-performance-discipline/SKILL.md') == 2
        assert '#cost-output' in content and '- Last Updated: 2026-11-05' in content
changed = subprocess.check_output(['git', '-C', '/workspace/Tovu', 'diff', '--name-only', 'e327c07c8', 'HEAD'], text=True).splitlines()
assert all(p.startswith('cloud/ads-memory-skill/') for p in changed)
assert not subprocess.check_output(['git', '-C', '/workspace/Jini', 'status', '--porcelain'], text=True)
print('PASS: seven checks, length, 22 citations, relative links, three-persona patch, draft-only scope')
PY
```

The first whitespace check flagged unified-patch blank context lines; the correction above fixed them. An initial ad hoc relative-link checker failed to normalize `..`; the corrected check resolves those paths before checking the supplied sibling skills. Neither was an application failure.

## Open items and findings

Installation remains for the separate session: locate the authoritative toolkit source, inspect its real registry columns, apply/reconcile the persona patch, add the row, run its existing validator, and sync only the seven toolkit files. No source checkout was invented or installed into.

Tooling finding: the supplied archive contains no `framework/routing/skills-registry.md`; row placement and registry validation remain unverified.

Setup finding: `/workspace/shared/dev-env.sh` and `/workspace/shared/start-postgres.sh` are absent. The requested setup command stopped at the missing environment script; no database work is needed for these drafts.

Measurement finding: supplied historical memory buckets sum to about 3.28 GB versus a stated 3.23 GB; raw samples, attribution, packaged behavior, and savings remain unverified. The draft makes no performance result claim.

New application bugs found: none; historical incidents are supporting examples only.

Scope resolution: COMMON requests `cloud/reports/memory-skill.md`, but the job file explicitly overrides COMMON and permits writes ONLY under `cloud/ads-memory-skill/`. This report therefore lives at `cloud/ads-memory-skill/reports/memory-skill.md`.

Architecture/scope review: PASS for the draft-only boundary; installed persona/registry files are untouched. Runtime validation is N/A. No live/owner data accessed. Work completed within the two-hour cap.

Cost: N/A — documentation-only; no runtime I/O added.
