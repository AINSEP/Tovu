#!/usr/bin/env python3
"""
Code-quality metrics runner.

Runs established measurement tools against a target tree and emits one markdown
report plus a machine-readable JSON dump. Read-only: it never modifies the repo,
never runs the test suite, and never regenerates coverage.

Usage:
    python3 development/scripts/code-metrics.py
    python3 development/scripts/code-metrics.py --target apps/website/src
    python3 development/scripts/code-metrics.py --skip jscpd,knip --since 2025-01-01

Tool provenance is recorded for every number. A metric that could not be measured
is reported as UNAVAILABLE with the reason — never estimated, never faked.

External tools (all optional; missing ones degrade to UNAVAILABLE):
    lizard          pip install lizard          cyclomatic complexity, LOC, params
    jscpd           npx jscpd                   copy-paste duplication
    knip            npx knip                    unused exports / dead files
    type-coverage   npx type-coverage           % of expressions with real types
    depcruise       already in node_modules     dependency graph (fan-in/out, cycles)

Churn, hotspots, and change coupling are computed directly from `git log` in this
script rather than shelling out to code-maat, so they need no extra tooling.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGET = "apps/website/src"

# Commit subjects matching these are mechanical (renames, codemods, formatting).
# Churn computed over them is noise: a 230-file import codemod makes every file
# look equally "hot". Hotspots are reported over substantive commits only, and
# both numbers are shown so the correction is auditable rather than hidden.
#
# Deliberately NOT "restructure": a 2026-08-28 swarm debate found this word matching a
# whole-repo folder reorganization's own commit subjects excluded exactly the commits that
# carry the rename information churn/hotspot data needs to attribute history to current file
# paths — on a branch literally named `restructure/apps-website-phased`, every renamed file's
# pre-restructure identity looked "hot" and its current identity looked untouched. See
# `ADS-memory/reports/swarm-consensus/runs/2026-08-28T2358-apps-website-architecture-debate-consensus-report.md`.
MECHANICAL_SUBJECT_RE = re.compile(
    r"\b(rename|renamed|move|moved|relocat|codemod|reformat|formatting|lint fix|"
    r"import (cleanup|rewrite|path)|convert .* imports|re-?export|"
    r"barrel|whitespace|prettier|biome)\b",
    re.IGNORECASE,
)

CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"}
TEST_PATH_RE = re.compile(r"(^|/)(__tests__|__mocks__)/|\.(test|spec)\.[cm]?[jt]sx?$")


@dataclass
class MetricResult:
    """One metric's outcome. `available` False means it was not measured, not zero."""

    name: str
    available: bool
    tool: str = ""
    command: str = ""
    summary: dict = field(default_factory=dict)
    detail: list = field(default_factory=list)
    reason: str = ""
    duration_s: float = 0.0
    # Full per-file data for downstream metrics (hotspots, coverage cross-ref).
    # Kept out of `detail` so the markdown report doesn't render a 1400-row table.
    raw: dict = field(default_factory=dict)


def run(cmd: list[str], timeout: int = 600, cwd: Path | None = None) -> tuple[int, str, str]:
    """Run a command, capturing output. Returns (returncode, stdout, stderr).

    A returncode of -1 means the command could not be started or timed out; the
    reason is in stderr. Many analysis tools exit non-zero when they find issues,
    so callers must not treat a non-zero code as failure on its own.
    """
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd or REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return -1, "", f"timed out after {timeout}s"
    except FileNotFoundError as exc:
        return -1, "", f"not found: {exc}"
    except Exception as exc:  # noqa: BLE001 - report, never crash the whole run
        return -1, "", f"{type(exc).__name__}: {exc}"


def have(binary: str) -> bool:
    return shutil.which(binary) is not None


def pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 2) if whole else 0.0


# --------------------------------------------------------------------------
# Complexity, size (lizard)
# --------------------------------------------------------------------------


CCN_MESSAGE_RE = re.compile(r"has a complexity of (\d+)")
CCN_NAME_RE = re.compile(r"'([^']+)'")


def metric_complexity(target: str, top: int) -> MetricResult:
    """Cyclomatic complexity via ESLint's own CORE `complexity` rule, real TypeScript parsing.

    Replaces `lizard` (2026-08-29, following a 2026-08-28 swarm debate finding, independently
    confirmed by 3 reviewers): lizard has no real TypeScript parser — it applies a JS tokenizer
    that loses function boundaries on regex literals. A reported CCN-63, 944-line function
    (`render.ts#safeHref`) was verified to actually be complexity 8, ~17 lines. ESLint's own
    CORE `complexity` rule (not a plugin — needs no `@typescript-eslint` plugin load, unlike
    `sonarjs/cognitive-complexity` below, so the same "`--rule` override hard-errors on config
    blocks without the plugin loaded" problem that blocks a full cognitive-complexity
    distribution does NOT apply here) gives a full, un-censored distribution directly from
    this codebase's real TypeScript parser — verified against the same known-corrupted lizard
    rows (`safeHref`→8, `safeImageSrc`→7, both small and believable, matching direct reading).

    Function LENGTH/LOC and parameter counts are NOT reported here — ESLint's `complexity` rule
    gives a complexity score and one line number per function, not a line span, and this script
    does not estimate what it cannot measure. Those sub-metrics are UNAVAILABLE until a real
    TS-aware source for them exists too (lizard's `length`/`nloc` were confirmed wrong on the
    same functions where CCN was wrong, so they are not a fallback).
    """
    started = time.time()
    cmd = [
        "npx", "eslint", target, "--format", "json", "--no-error-on-unmatched-pattern",
        "--rule", '{"complexity":["warn",0]}',
    ]
    code, out, err = run(cmd, timeout=1800)
    if not out.strip().startswith("["):
        return MetricResult(
            "complexity", False, tool="eslint (core complexity rule)", command=" ".join(cmd),
            reason=f"eslint produced no JSON ({(err or out).strip()[:300] or 'empty'})",
            duration_s=time.time() - started,
        )
    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        return MetricResult(
            "complexity", False, tool="eslint (core complexity rule)", command=" ".join(cmd),
            reason=f"unparseable: {exc}", duration_s=time.time() - started,
        )

    rows = []
    for f in data:
        rel = os.path.relpath(f.get("filePath", ""), REPO_ROOT)
        if "/node_modules/" in rel:
            continue
        for msg in f.get("messages", []):
            if msg.get("ruleId") != "complexity":
                continue
            m = CCN_MESSAGE_RE.search(msg.get("message", ""))
            if not m:
                continue
            name_m = CCN_NAME_RE.search(msg.get("message", ""))
            rows.append({
                "file": rel,
                "func": name_m.group(1) if name_m else "(anonymous)",
                "ccn": int(m.group(1)),
                "start": msg.get("line"),
            })

    if not rows:
        return MetricResult(
            "complexity", False, tool="eslint (core complexity rule)", command=" ".join(cmd),
            reason="eslint ran but reported no complexity scores — the message format may have "
                   "changed in this ESLint version",
            duration_s=time.time() - started,
        )

    ccns = sorted(r["ccn"] for r in rows)

    def q(vals: list[int], p: float) -> int:
        return vals[min(int(len(vals) * p), len(vals) - 1)]

    max_ccn_by_file: dict[str, int] = collections.defaultdict(int)
    for r in rows:
        max_ccn_by_file[r["file"]] = max(max_ccn_by_file[r["file"]], r["ccn"])

    worst = sorted(rows, key=lambda r: -r["ccn"])[:top]

    return MetricResult(
        "complexity",
        True,
        tool="eslint (core complexity rule)",
        command=" ".join(cmd),
        summary={
            "functions_analysed": len(rows),
            "files_analysed": len(max_ccn_by_file),
            "ccn_median": q(ccns, 0.50),
            "ccn_p90": q(ccns, 0.90),
            "ccn_p99": q(ccns, 0.99),
            "ccn_max": ccns[-1],
            "functions_over_ccn_10": sum(1 for c in ccns if c > 10),
            "functions_over_ccn_20": sum(1 for c in ccns if c > 20),
            "NOTE_length_unavailable": "function length/nloc/params are not reported — no "
                                       "verified-correct TS-aware source for them exists yet "
                                       "(lizard's numbers for these were also confirmed wrong)",
        },
        detail=[{"kind": "worst_ccn", "items": worst}],
        raw={"max_ccn_by_file": dict(max_ccn_by_file)},
        duration_s=time.time() - started,
    )


def metric_cognitive_complexity(target: str, top: int) -> MetricResult:
    """Cognitive complexity via eslint-plugin-sonarjs (SonarSource's metric).

    Distinct from cyclomatic: it weights NESTING, so a flat 20-case switch scores
    low while a triply-nested conditional scores high. Never approximated from
    cyclomatic — the two disagree precisely where the interesting code is.

    Runs eslint with the repo's OWN config. A `--rule` override that lowers the
    threshold to 0 would report every function's score, but eslint applies such
    an override to ALL config blocks — including ones that don't load the sonarjs
    plugin — and hard-errors with "could not find plugin". So the numbers below
    cover only functions that BREACH the repo's configured threshold (15 in most
    of the tree, 9 in stricter areas). That is a censored sample, not a full
    distribution, and the report says so rather than implying otherwise.
    """
    started = time.time()
    cmd = [
        "npx", "eslint", target,
        "--format", "json", "--no-error-on-unmatched-pattern",
    ]
    code, out, err = run(cmd, timeout=1800)
    if not out.strip().startswith("["):
        return MetricResult(
            "cognitive_complexity", False, tool="eslint-plugin-sonarjs",
            command=" ".join(cmd),
            reason=f"eslint produced no JSON ({(err or out).strip()[:300] or 'empty'})",
            duration_s=time.time() - started,
        )
    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        return MetricResult(
            "cognitive_complexity", False, tool="eslint-plugin-sonarjs",
            command=" ".join(cmd), reason=f"unparseable: {exc}",
            duration_s=time.time() - started,
        )

    # "Refactor this function to reduce its Cognitive Complexity from 41 to the 15 allowed."
    score_re = re.compile(r"Cognitive Complexity from (\d+)")
    rows = []
    for f in data:
        rel = os.path.relpath(f.get("filePath", ""), REPO_ROOT)
        if "/node_modules/" in rel:
            continue
        for msg in f.get("messages", []):
            if msg.get("ruleId") != "sonarjs/cognitive-complexity":
                continue
            m = score_re.search(msg.get("message", ""))
            if m:
                rows.append({"file": rel, "line": msg.get("line"),
                             "cognitive": int(m.group(1))})

    if not rows:
        return MetricResult(
            "cognitive_complexity", False, tool="eslint-plugin-sonarjs",
            command=" ".join(cmd),
            reason="rule ran but reported no scores — the message format may have "
                   "changed in this plugin version",
            duration_s=time.time() - started,
        )

    scores = sorted(r["cognitive"] for r in rows)
    by_file: dict[str, int] = collections.defaultdict(int)
    for r in rows:
        by_file[r["file"]] = max(by_file[r["file"]], r["cognitive"])

    def q(v: list[int], p: float) -> int:
        return v[min(int(len(v) * p), len(v) - 1)]

    return MetricResult(
        "cognitive_complexity", True, tool="eslint-plugin-sonarjs",
        command=" ".join(cmd),
        summary={
            "CENSORED_SAMPLE": "only functions BREACHING the repo's configured "
                               "threshold (15 most places, 9 in stricter areas) are "
                               "counted — this is not a full distribution, and the "
                               "median/percentiles below describe breaching "
                               "functions only",
            "functions_breaching_threshold": len(rows),
            "files_affected": len(by_file),
            "median_of_breaching": q(scores, 0.50),
            "p90_of_breaching": q(scores, 0.90),
            "max": scores[-1],
            "over_30": sum(1 for s in scores if s > 30),
            "over_50": sum(1 for s in scores if s > 50),
        },
        detail=[{"kind": "worst_cognitive",
                 "items": sorted(rows, key=lambda r: -r["cognitive"])[:top]}],
        raw={"max_cognitive_by_file": dict(by_file)},
        duration_s=time.time() - started,
    )


# --------------------------------------------------------------------------
# Duplication (jscpd)
# --------------------------------------------------------------------------


def metric_duplication(target: str, top: int, scratch: Path) -> MetricResult:
    started = time.time()
    out_dir = scratch / "jscpd"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Generated files MUST be excluded or the number is meaningless. Drizzle writes
    # cumulative migration snapshots where each file is the previous one plus a diff
    # — 53 files, ~249k lines, near-identical by design. Left in, they were 78% of
    # all reported duplication and turned a real 4.4% into a false 22.3%.
    # The `drizzle*` wildcard matters: a plain `drizzle` glob misses the sibling
    # `drizzle-database-journal/` directory.
    ignore = ",".join([
        "**/node_modules/**",
        "**/drizzle*/**",
        "**/dist/**",
        "**/.vite/**",
        "**/*.snap",
        "**/schema.postgres.ts",  # generated from schema.ts; identical by design
    ])
    cmd = [
        "npx", "--yes", "jscpd", target,
        "--min-tokens", "50",
        "--ignore", ignore,
        "--reporters", "json",
        "--output", str(out_dir),
        "--silent",
    ]
    code, out, err = run(cmd, timeout=900)
    report = out_dir / "jscpd-report.json"
    if not report.exists():
        return MetricResult(
            "duplication", False, tool="jscpd", command=" ".join(cmd),
            reason=f"no report produced ({err.strip()[:300] or 'unknown'})",
            duration_s=time.time() - started,
        )
    try:
        data = json.loads(report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return MetricResult(
            "duplication", False, tool="jscpd", command=" ".join(cmd),
            reason=f"unparseable report: {exc}", duration_s=time.time() - started,
        )

    stats = data.get("statistics", {}).get("total", {})
    clones = data.get("duplicates", [])
    biggest = sorted(clones, key=lambda c: -c.get("lines", 0))[:top]
    return MetricResult(
        "duplication", True, tool="jscpd", command=" ".join(cmd),
        summary={
            "min_tokens": 50,
            "percent_duplicated_lines": stats.get("percentage"),
            "duplicated_lines": stats.get("duplicatedLines"),
            "total_lines": stats.get("lines"),
            "clone_count": len(clones),
        },
        detail=[{
            "kind": "largest_clones",
            "items": [
                {
                    "lines": c.get("lines"),
                    "a": f'{c.get("firstFile", {}).get("name")}:{c.get("firstFile", {}).get("start")}',
                    "b": f'{c.get("secondFile", {}).get("name")}:{c.get("secondFile", {}).get("start")}',
                }
                for c in biggest
            ],
        }],
        duration_s=time.time() - started,
    )


# --------------------------------------------------------------------------
# Type safety (type-coverage)
# --------------------------------------------------------------------------


def metric_type_safety(target: str, top: int) -> MetricResult:
    started = time.time()
    cmd = ["npx", "--yes", "type-coverage", "--detail", "--strict"]
    code, out, err = run(cmd, timeout=900)
    blob = out + err
    m = re.search(r"(\d+)\s*/\s*(\d+)\s+([\d.]+)%", blob)

    # AST-based type-escape counts are a useful cross-check and work even if type-coverage fails.
    suppressions = grep_counts(target)

    if not m:
        return MetricResult(
            "type_safety", bool(suppressions), tool="ts-escape-metrics.mjs (AST)" if suppressions else "",
            command=" ".join(cmd),
            summary=suppressions,
            reason="type-coverage produced no percentage; suppression counts from "
                   "the AST-based scan only" if suppressions else
                   f"type-coverage failed: {blob.strip()[:300]}",
            duration_s=time.time() - started,
        )

    typed, total, percent = int(m.group(1)), int(m.group(2)), float(m.group(3))
    anys = [ln.strip() for ln in blob.splitlines() if re.search(r":\d+:\d+: ", ln)]
    return MetricResult(
        "type_safety", True, tool="type-coverage", command=" ".join(cmd),
        summary={
            "typed_expressions": typed,
            "total_expressions": total,
            "percent_typed": percent,
            "untyped_expressions": total - typed,
            **suppressions,
        },
        detail=[{"kind": "untyped_locations_sample", "items": anys[:top]}],
        duration_s=time.time() - started,
    )


def grep_counts(target: str) -> dict:
    """Count type-escape hatches: `any`/non-null via a real TypeScript AST walk, `@ts-ignore`/
    `@ts-expect-error` via plain grep.

    Split by tool deliberately, not laziness (2026-08-29). `explicit_any`/`non_null_assertion`:
    a textual `\\bany\\b` grep was found (2026-08-28 swarm debate, independently confirmed by 3
    reviewers) to match the English word "any" in comments/strings — this codebase is ~37% comment
    lines — and over-report `explicit_any` by ~30x (1,532 reported vs. single digits real). AST-only
    for these two; delegates to `ts-escape-metrics.mjs`.

    `ts_ignore`/`ts_expect_error`: A FIRST attempt at AST-walking these too (comment trivia, not a
    real node) introduced 4 new bugs in review — a non-global regex under-counting a comment with
    two directives, wrong line numbers (comment-block start, not directive position), counting
    PROSE ABOUT a directive as a real one (`widgets/resolvers/index.ts` mentions `@ts-expect-error`
    twice in a JSDoc explanation, zero real directives there), and missing at least one genuine
    directive entirely. `@ts-ignore`/`@ts-expect-error` are unambiguous literal tokens that do not
    occur in English prose the way "any" does — the plain grep was never the broken half of the
    original metric, so it is kept, not replaced. Do not re-add a comment-trivia walker for these
    without fixing all 4 of those failure modes first.
    """
    counts: dict = {}

    script = REPO_ROOT / "development" / "scripts" / "ts-escape-metrics.mjs"
    code, out, err = run(["node", str(script), str(REPO_ROOT / target)], timeout=120)
    if code != -1 and out.strip():
        try:
            data = json.loads(out)
            counts["explicit_any"] = data.get("totals", {}).get("explicit_any")
            counts["non_null_assertion"] = data.get("totals", {}).get("non_null_assertion")
            counts["explicit_any_production_only"] = data.get("totals_production", {}).get("explicit_any")
            counts["non_null_assertion_production_only"] = data.get("totals_production", {}).get("non_null_assertion")
        except json.JSONDecodeError:
            pass

    for label, pat in (("ts_ignore", r"@ts-ignore"), ("ts_expect_error", r"@ts-expect-error")):
        gcode, gout, _ = run(["grep", "-rEc", pat, target, "--include=*.ts", "--include=*.tsx"])
        if gcode == -1:
            continue
        total = 0
        for line in gout.splitlines():
            _, _, n = line.rpartition(":")
            try:
                total += int(n)
            except ValueError:
                continue
        counts[label] = total

    return counts


# --------------------------------------------------------------------------
# Dead code (knip)
# --------------------------------------------------------------------------


def metric_dead_code(target: str, top: int) -> MetricResult:
    """Unused exports and files, as CANDIDATES only — never a delete list.

    Two corrections learned the hard way, both of which inflated an earlier run:

    1. Without `--directory`, knip scans the WHOLE repo. An earlier run reported
       1,619 "unused exports in apps/website/src" that actually included
       apps/admin, apps/site-chat, development/, and gitignored artifact dirs.
    2. Unused FILES are nested under `issues[].files[]`, not a top-level `files`
       key. Reading the wrong key silently reported 0 unused files when the real
       number was in the hundreds.

    Even correctly scoped, expect a low true-positive rate (~15% measured here).
    Knip cannot see dynamic import(), string-based registration, Vite/worker
    entry points, CLI `--config=` targets, or symbols used only inside their own
    file. Treat every row as a candidate to verify, never as a finding.
    """
    started = time.time()
    root = target.split("/src")[0] if "/src" in target else target
    cmd = ["npx", "--yes", "knip", "--directory", root,
           "--reporter", "json", "--no-exit-code"]
    code, out, err = run(cmd, timeout=900)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return MetricResult(
            "dead_code", False, tool="knip", command=" ".join(cmd),
            reason=f"no parseable JSON ({(err or out).strip()[:300] or 'empty'}). "
                   "knip usually needs a knip.json config in a repo this size.",
            duration_s=time.time() - started,
        )

    # knip's JSON puts BOTH unused files and unused exports under `issues[]`.
    # A top-level `files` key does not exist in this version; reading it returned 0.
    issues = data.get("issues", []) if isinstance(data, dict) else data
    if not isinstance(issues, list):
        issues = []
    files, exports = [], []
    for entry in issues:
        if not isinstance(entry, dict):
            continue
        f = entry.get("file", "")
        for item in entry.get("files", []) or []:
            files.append(item if isinstance(item, str) else item.get("name", ""))
        for kind in ("exports", "types", "duplicates", "enumMembers", "classMembers"):
            for item in entry.get(kind, []) or []:
                name = item.get("name") if isinstance(item, dict) else str(item)
                line = item.get("line") if isinstance(item, dict) else None
                exports.append({"file": f, "symbol": name, "line": line, "kind": kind})

    return MetricResult(
        "dead_code", True, tool="knip", command=" ".join(cmd),
        summary={
            "unused_file_candidates": len(files),
            "unused_export_candidates": len(exports),
            "measured_true_positive_rate": "~15% (sample of 40, 2026-08-28) — "
                                           "divide the raw count by ~7 for a "
                                           "realistic estimate",
            "caveat": "CANDIDATES ONLY — verify against dynamic imports, "
                      "string-based registration, Vite/worker entry points, CLI "
                      "--config targets, and same-file internal usage before acting",
        },
        detail=[
            {"kind": "unused_file_candidates", "items": files[:top]},
            {"kind": "unused_export_candidates", "items": exports[:top]},
        ],
        duration_s=time.time() - started,
    )


# --------------------------------------------------------------------------
# Structure: fan-in/out, cycles, blast radius, API surface (dependency-cruiser)
# --------------------------------------------------------------------------


def load_dep_graph(target: str, scratch: Path) -> tuple[dict | None, str, str]:
    """Dump the dependency graph as JSON via the repo's own dependency-cruiser."""
    config = REPO_ROOT / ".dependency-cruiser.mjs"
    cmd = ["npx", "depcruise", "--output-type", "json"]
    if config.exists():
        cmd += ["--config", str(config)]
    cmd.append(target)
    code, out, err = run(cmd, timeout=1200)
    if not out.strip():
        return None, " ".join(cmd), err.strip()[:300] or "empty output"
    try:
        return json.loads(out), " ".join(cmd), ""
    except json.JSONDecodeError as exc:
        return None, " ".join(cmd), f"unparseable JSON: {exc}"


def metric_structure(graph: dict, cmd: str, top: int) -> list[MetricResult]:
    """Fan-in/fan-out, cycles, blast radius, and layering, from one graph dump."""
    started = time.time()
    modules = graph.get("modules", [])

    deps: dict[str, set[str]] = {}
    barrel_edges = 0
    real_edges = 0
    for m in modules:
        src = m.get("source", "")
        outs = set()
        for d in m.get("dependencies", []) or []:
            tgt = d.get("resolved", "")
            if not tgt:
                continue
            outs.add(tgt)
            # A barrel/index re-export edge is structurally different from a real
            # logic edge. A prior audit found a raw hub count here was mostly an
            # artifact of one barrel pattern, so both are counted separately.
            if re.search(r"(^|/)(index|barrel)\.[cm]?[jt]sx?$", tgt):
                barrel_edges += 1
            else:
                real_edges += 1
        deps[src] = outs

    rdeps: dict[str, set[str]] = collections.defaultdict(set)
    for src, outs in deps.items():
        for tgt in outs:
            rdeps[tgt].add(src)

    fan_out = {s: len(o) for s, o in deps.items()}
    fan_in = {s: len(rdeps.get(s, ())) for s in deps}

    # Blast radius: transitive dependents. "If I change this, what can break?"
    def transitive_dependents(node: str, limit: int = 100000) -> int:
        seen, stack = set(), [node]
        while stack and len(seen) < limit:
            cur = stack.pop()
            for parent in rdeps.get(cur, ()):
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        return len(seen)

    hot = sorted(fan_in, key=lambda s: -fan_in[s])[: max(top * 3, 60)]
    blast = sorted(
        ({"module": s, "direct_dependents": fan_in[s],
          "transitive_dependents": transitive_dependents(s)} for s in hot),
        key=lambda r: -r["transitive_dependents"],
    )[:top]

    structure = MetricResult(
        "coupling", True, tool="dependency-cruiser", command=cmd,
        summary={
            "modules": len(deps),
            "edges_total": sum(fan_out.values()),
            "edges_via_barrel_index": barrel_edges,
            "edges_real_logic": real_edges,
            "fan_out_max": max(fan_out.values(), default=0),
            "fan_in_max": max(fan_in.values(), default=0),
            "fan_out_mean": round(sum(fan_out.values()) / len(fan_out), 2) if fan_out else 0,
        },
        detail=[
            {"kind": "highest_fan_in", "items": [
                {"module": s, "fan_in": fan_in[s]}
                for s in sorted(fan_in, key=lambda s: -fan_in[s])[:top]]},
            {"kind": "highest_fan_out", "items": [
                {"module": s, "fan_out": fan_out[s]}
                for s in sorted(fan_out, key=lambda s: -fan_out[s])[:top]]},
        ],
        duration_s=time.time() - started,
    )

    blast_res = MetricResult(
        "blast_radius", True, tool="dependency-cruiser (transitive closure)",
        command=cmd,
        summary={"note": "transitive dependents of the highest fan-in modules"},
        detail=[{"kind": "highest_blast_radius", "items": blast}],
    )

    # Cycles: computed here by DFS rather than trusting the config to check them.
    # Whether the repo's own config detects cycles is reported alongside.
    cycles = find_cycles(deps)
    config_flags_cycles = any(
        "cycle" in (v.get("rule", {}).get("name", "") or "").lower()
        for m in modules for v in (m.get("dependencies", []) or [])
        for _ in [0]
    ) or "no-circular" in json.dumps(graph.get("summary", {}).get("ruleSetUsed", {}))[:200000]

    cycles_res = MetricResult(
        "circular_dependencies", True, tool="dependency-cruiser + DFS in this script",
        command=cmd,
        summary={
            "cycles_found": len(cycles),
            "longest_cycle_len": max((len(c) for c in cycles), default=0),
            "repo_config_has_cycle_rule": bool(config_flags_cycles),
        },
        detail=[{"kind": "cycles", "items": [" -> ".join(c) for c in cycles[:top]]}],
    )

    # API surface proxy: how many distinct modules import *into* each directory,
    # and how many modules each directory exposes as import targets.
    surface: dict[str, set[str]] = collections.defaultdict(set)
    for src, outs in deps.items():
        for tgt in outs:
            tgt_dir = str(Path(tgt).parent)
            if Path(src).parts[:3] != Path(tgt).parts[:3]:
                surface[tgt_dir].add(tgt)
    api_res = MetricResult(
        "api_surface", True, tool="dependency-cruiser (import-target proxy)",
        command=cmd,
        summary={
            "note": "proxy metric: distinct modules in each directory that are "
                    "imported from OUTSIDE that directory's top-level area. "
                    "Not a true exported-symbol count.",
            "directories_measured": len(surface),
        },
        detail=[{"kind": "widest_surfaces", "items": [
            {"directory": d, "externally_imported_modules": len(v)}
            for d, v in sorted(surface.items(), key=lambda kv: -len(kv[1]))[:top]]}],
    )

    return [structure, blast_res, cycles_res, api_res]


def find_cycles(deps: dict[str, set[str]], cap: int = 200) -> list[list[str]]:
    """Iterative DFS returning distinct simple cycles, capped for tractability."""
    cycles: list[list[str]] = []
    seen_sigs: set[frozenset] = set()
    colour: dict[str, int] = {}

    for root in deps:
        if colour.get(root):
            continue
        stack = [(root, iter(deps.get(root, ())))]
        path = [root]
        colour[root] = 1
        while stack:
            node, it = stack[-1]
            advanced = False
            for nxt in it:
                if nxt not in deps:
                    continue
                state = colour.get(nxt, 0)
                if state == 1:  # back-edge => cycle
                    if nxt in path:
                        cyc = path[path.index(nxt):] + [nxt]
                        sig = frozenset(cyc)
                        if sig not in seen_sigs:
                            seen_sigs.add(sig)
                            cycles.append([short(x) for x in cyc])
                            if len(cycles) >= cap:
                                return cycles
                elif state == 0:
                    colour[nxt] = 1
                    path.append(nxt)
                    stack.append((nxt, iter(deps.get(nxt, ()))))
                    advanced = True
                    break
            if not advanced:
                colour[node] = 2
                stack.pop()
                if path:
                    path.pop()
    return cycles


def short(p: str) -> str:
    return p.replace("apps/website/src/", "…/")


# --------------------------------------------------------------------------
# Churn, hotspots, change coupling (git)
# --------------------------------------------------------------------------


def legacy_paths(target: str) -> list[str]:
    """Pre-restructure locations of `target`, so history survives the rename.

    `apps/website/src` was `src` until commit 708e81b2. Scoping git log to the
    NEW path alone finds only post-rename commits — which silently produced a
    9-commit "12 month" history and an empty hotspot list on the first run.
    """
    known = {"apps/website/src": ["src"]}
    return known.get(target.rstrip("/"), [])


def normalise_path(path: str, target: str) -> str:
    """Map a pre-restructure path onto its current location.

    Without this, `src/features/foo.ts` and `apps/website/src/features/foo.ts`
    count as two unrelated files and every long-lived file's history looks half
    as long as it is.
    """
    for old in legacy_paths(target):
        if path == old or path.startswith(old + "/"):
            return target.rstrip("/") + path[len(old):]
    return path


def parse_git_log(target: str, since: str) -> tuple[list[dict], str]:
    """Parse `git log --numstat` into per-commit file lists, with rename following."""
    sep = "\x1e"
    cmd = [
        "git", "log", f"--since={since}", "--numstat", "-M", "-C",
        f"--pretty=format:{sep}%H%x1f%an%x1f%ad%x1f%s", "--date=short",
        "--", target, *legacy_paths(target),
    ]
    code, out, err = run(cmd, timeout=600)
    if code == -1:
        return [], f"git log failed: {err}"

    commits = []
    for chunk in out.split(sep):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        head, _, rest = chunk.partition("\n")
        parts = head.split("\x1f")
        if len(parts) < 4:
            continue
        sha, author, date, subject = parts[0], parts[1], parts[2], parts[3]
        files = []
        for line in rest.splitlines():
            bits = line.split("\t")
            if len(bits) != 3:
                continue
            add, dele, path = bits
            # `{old => new}` rename syntax: keep the new path.
            if "=>" in path:
                path = re.sub(r"\{[^}]*=>\s*([^}]*)\}", r"\1", path).replace("//", "/")
            path = normalise_path(path, target)
            if Path(path).suffix not in CODE_SUFFIXES:
                continue
            if "/node_modules/" in path:
                continue
            try:
                churn = (0 if add == "-" else int(add)) + (0 if dele == "-" else int(dele))
            except ValueError:
                churn = 0
            files.append({"path": path, "churn": churn})
        if files:
            commits.append({
                "sha": sha, "author": author, "date": date, "subject": subject,
                "files": files,
                "mechanical": bool(MECHANICAL_SUBJECT_RE.search(subject)) or len(files) > 60,
            })
    return commits, ""


def path_currently_exists(path: str) -> bool:
    """A file's git history is real even after it's gone, but a churn/hotspot RANKING of
    "today's riskiest files" is not — a path git can no longer find on disk is either deleted
    or was renamed in a way `-M`/`-C` couldn't bridge (verified 2026-08-28: some file moves in
    this repo's history changed too much for git's own rename-similarity threshold to link old
    and new identity; `git log --follow` on the old path returns nothing). Keeping such a path in
    a ranking presented as current risk is misleading regardless of how real its OLD history is.
    """
    return (REPO_ROOT / path).exists()


def metric_churn(commits: list[dict], complexity: MetricResult, top: int, since: str) -> list[MetricResult]:
    started = time.time()
    substantive = [c for c in commits if not c["mechanical"]]

    def tally(cs: list[dict]) -> tuple[dict, dict]:
        lines, times = collections.Counter(), collections.Counter()
        for c in cs:
            for f in c["files"]:
                lines[f["path"]] += f["churn"]
                times[f["path"]] += 1
        return lines, times

    all_lines, all_times = tally(commits)
    sub_lines, sub_times = tally(substantive)

    # Rank only over paths that exist today — see path_currently_exists()'s doc. Their history
    # (churn/commit counts) is still real; a stale-path ranking would just be misleading. This
    # necessarily undercounts files whose rename git couldn't follow: their pre-rename history is
    # dropped rather than merged in, since merging it would risk falsely attributing an unrelated
    # deleted file's history to a similarly-timed new one.
    sub_times_live = collections.Counter({f: n for f, n in sub_times.items() if path_currently_exists(f)})
    all_times_live = collections.Counter({f: n for f, n in all_times.items() if path_currently_exists(f)})

    churn_res = MetricResult(
        "churn", True, tool="git log --numstat -M -C (parsed in this script)",
        command=f"git log --since={since} --numstat -M -C",
        summary={
            "window_since": since,
            "commits_total": len(commits),
            "commits_mechanical_excluded": len(commits) - len(substantive),
            "commits_substantive": len(substantive),
            "files_touched_substantive": len(sub_times),
            "stale_paths_excluded_from_rankings": len(sub_times) - len(sub_times_live),
            "classification_rule": "subject matches rename/codemod/import-rewrite/"
                                   "format keywords, OR touches >60 files",
        },
        detail=[
            {"kind": "most_changed_substantive", "items": [
                {"file": f, "commits": n, "lines_changed": sub_lines[f]}
                for f, n in sub_times_live.most_common(top)]},
            {"kind": "most_changed_raw_incl_mechanical", "items": [
                {"file": f, "commits": n, "lines_changed": all_lines[f]}
                for f, n in all_times_live.most_common(top)]},
        ],
        duration_s=time.time() - started,
    )

    # Hotspots need a complexity signal per file; without lizard there is none,
    # and a churn-only "hotspot" list would be misleading.
    if not complexity.available:
        hot_res = MetricResult(
            "hotspots", False,
            reason="needs complexity data (lizard unavailable). Churn alone is not "
                   "a hotspot — the whole point is the intersection.",
        )
    else:
        per_file_ccn: dict[str, int] = complexity.raw.get("max_ccn_by_file", {})
        scored = []
        for f, n in sub_times_live.items():
            ccn = per_file_ccn.get(f)
            if ccn:
                scored.append({"file": f, "commits": n, "max_ccn": ccn, "score": n * ccn})
        scored.sort(key=lambda r: -r["score"])
        hot_res = MetricResult(
            "hotspots", True, tool="churn x complexity",
            summary={
                "note": "score = substantive commit count x max function CCN in file",
                "files_scored": len(scored),
            },
            detail=[{"kind": "top_hotspots", "items": scored[:top]}],
        )

    return [churn_res, hot_res]


def metric_change_coupling(commits: list[dict], deps: dict | None, top: int, min_pairs: int) -> MetricResult:
    """Files that change together WITHOUT importing each other — hidden coupling.

    Pairs with a direct import link are filtered out: those are expected and
    uninteresting. Mechanical commits are excluded entirely, since a single
    large codemod would otherwise couple every file to every other file.
    """
    started = time.time()
    substantive = [c for c in commits if not c["mechanical"]]
    pair_counts: collections.Counter = collections.Counter()
    file_counts: collections.Counter = collections.Counter()

    for c in substantive:
        paths = sorted({f["path"] for f in c["files"] if not TEST_PATH_RE.search(f["path"])})
        if len(paths) > 30:  # still too broad to be meaningful evidence
            continue
        for p in paths:
            file_counts[p] += 1
        for i, a in enumerate(paths):
            for b in paths[i + 1:]:
                pair_counts[(a, b)] += 1

    linked: set[tuple[str, str]] = set()
    if deps:
        for m in deps.get("modules", []):
            src = m.get("source", "")
            for d in m.get("dependencies", []) or []:
                tgt = d.get("resolved", "")
                if tgt:
                    linked.add(tuple(sorted((src, tgt))))

    rows = []
    stale_pairs_excluded = 0
    for (a, b), n in pair_counts.items():
        if n < min_pairs:
            continue
        if (a, b) in linked:
            continue
        if not (path_currently_exists(a) and path_currently_exists(b)):
            stale_pairs_excluded += 1
            continue
        denom = min(file_counts[a], file_counts[b]) or 1
        rows.append({
            "a": a, "b": b, "co_changes": n,
            "confidence_pct": round(100.0 * n / denom, 1),
        })
    rows.sort(key=lambda r: (-r["co_changes"], -r["confidence_pct"]))

    return MetricResult(
        "change_coupling", True,
        tool="git log co-change (this script), import-linked pairs filtered out",
        summary={
            "commits_considered": len(substantive),
            "pairs_over_threshold": len(rows),
            "min_co_changes": min_pairs,
            "import_links_known": len(linked),
            "stale_pairs_excluded": stale_pairs_excluded,
            "note": "pairs WITH a direct import edge are excluded — those are expected. Pairs "
                    "naming a file that no longer exists (a stale pre-rename path) are also "
                    "excluded — see path_currently_exists()'s doc. What remains is coupling "
                    "invisible to static analysis, between files that exist today.",
        },
        detail=[{"kind": "strongest_hidden_coupling", "items": rows[:top]}],
        duration_s=time.time() - started,
    )


# --------------------------------------------------------------------------
# Coverage (read existing artifact only — never regenerate)
# --------------------------------------------------------------------------


def metric_coverage(target: str, complexity: MetricResult, top: int) -> MetricResult:
    """Parse an existing lcov.info. Never regenerates: doing so is a known trap here.

    Reports staleness loudly — an lcov whose paths predate the tree layout is
    describing a codebase that no longer exists.
    """
    started = time.time()
    lcov = REPO_ROOT / "development" / "coverage" / "lcov.info"
    if not lcov.exists():
        return MetricResult(
            "coverage", False,
            reason=f"no coverage artifact at {lcov.relative_to(REPO_ROOT)}. "
                   "NOT regenerated on purpose — coverage runs are a documented "
                   "corruption trap in this repo.",
            duration_s=time.time() - started,
        )

    files: dict[str, dict] = {}
    cur = None
    try:
        for line in lcov.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("SF:"):
                cur = line[3:].strip()
                try:
                    cur = os.path.relpath(cur, REPO_ROOT)
                except ValueError:
                    pass
                files[cur] = {"lines_found": 0, "lines_hit": 0, "branches_found": 0, "branches_hit": 0}
            elif cur and line.startswith("LF:"):
                files[cur]["lines_found"] = int(line[3:] or 0)
            elif cur and line.startswith("LH:"):
                files[cur]["lines_hit"] = int(line[3:] or 0)
            elif cur and line.startswith("BRF:"):
                files[cur]["branches_found"] = int(line[4:] or 0)
            elif cur and line.startswith("BRH:"):
                files[cur]["branches_hit"] = int(line[4:] or 0)
    except OSError as exc:
        return MetricResult("coverage", False, reason=f"unreadable: {exc}")

    if not files:
        return MetricResult("coverage", False, reason="lcov.info parsed to zero files")

    age_days = round((time.time() - lcov.stat().st_mtime) / 86400, 1)

    # The artifact may predate the src/ -> apps/website/src/ rename, in which
    # case NOTHING matches the target path. Remap legacy prefixes so the data is
    # usable, but only count a remap as valid if the file actually exists now —
    # otherwise a stale entry would masquerade as live coverage.
    remapped = 0
    normalised: dict[str, dict] = {}
    for f, rec in files.items():
        nf = normalise_path(f, target)
        if nf != f:
            if not (REPO_ROOT / nf).exists():
                continue  # genuinely gone: deleted or moved elsewhere since
            remapped += 1
        normalised[nf] = rec
    files = normalised

    in_target = [f for f in files if f.startswith(target)]
    stale = len(files) - len(in_target)

    lf = sum(files[f]["lines_found"] for f in in_target)
    lh = sum(files[f]["lines_hit"] for f in in_target)

    danger = []
    if complexity.available:
        per_file_ccn: dict[str, int] = complexity.raw.get("max_ccn_by_file", {})
        # Only complex files are worth cross-referencing: a CCN-1 file with no
        # coverage is not a risk worth reporting next to a CCN-40 one.
        for f, ccn in ((k, v) for k, v in per_file_ccn.items() if v >= 8):
            rec = files.get(f)
            if not rec or not rec["lines_found"]:
                danger.append({"file": f, "max_ccn": ccn, "line_coverage_pct": None,
                               "note": "not present in coverage data at all"})
            else:
                cov = pct(rec["lines_hit"], rec["lines_found"])
                if cov < 60:
                    danger.append({"file": f, "max_ccn": ccn, "line_coverage_pct": cov})
        danger.sort(key=lambda r: (-(r["max_ccn"] or 0), r["line_coverage_pct"] or 0))

    warn = ""
    if stale and not in_target:
        warn = ("CRITICAL: no file in the coverage artifact is under the target "
                "path. This lcov predates the current tree layout — treat every "
                "number here as describing a codebase that no longer exists.")
    elif stale:
        warn = (f"{stale} files in the artifact are outside the target path "
                "(likely stale pre-restructure entries).")

    return MetricResult(
        "coverage", True, tool="existing lcov.info (parsed, NOT regenerated)",
        command=f"read {lcov.relative_to(REPO_ROOT)}",
        summary={
            "artifact_age_days": age_days,
            "files_in_artifact": len(files),
            "files_matching_target": len(in_target),
            "files_outside_target": stale,
            "paths_remapped_from_pre_rename": remapped,
            "line_coverage_pct": pct(lh, lf),
            "lines_found": lf,
            "staleness_warning": warn or "none",
        },
        detail=[{"kind": "high_complexity_low_coverage", "items": danger[:top]}],
        duration_s=time.time() - started,
    )


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------


def write_report(results: list[MetricResult], target: str, out_md: Path, out_json: Path) -> None:
    out_md.parent.mkdir(parents=True, exist_ok=True)
    ok = [r for r in results if r.available]
    missing = [r for r in results if not r.available]

    L: list[str] = []
    L.append(f"# Code metrics — `{target}`")
    L.append("")
    L.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}  ")
    L.append(f"Repo: `{REPO_ROOT}`  ")
    code, sha, _ = run(["git", "rev-parse", "--short", "HEAD"])
    branch_code, branch, _ = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    L.append(f"Commit: `{sha.strip()}` on `{branch.strip()}`")
    L.append("")
    L.append(f"**{len(ok)} of {len(results)} metrics measured.** "
             "Every number below names the tool and command that produced it. "
             "Unmeasured metrics are listed as gaps, never estimated.")
    L.append("")

    if missing:
        L.append("## Not measured")
        L.append("")
        for r in missing:
            L.append(f"- **{r.name}** — {r.reason}")
        L.append("")

    L.append("## Summary")
    L.append("")
    L.append("| Metric | Tool | Headline |")
    L.append("|---|---|---|")
    for r in ok:
        head = "; ".join(
            f"{k}={v}" for k, v in list(r.summary.items())[:3]
            if not isinstance(v, str) or len(str(v)) < 40
        )
        L.append(f"| {r.name} | {r.tool} | {head} |")
    L.append("")

    for r in ok:
        L.append(f"## {r.name}")
        L.append("")
        L.append(f"- **Tool:** `{r.tool}`")
        if r.command:
            L.append(f"- **Command:** `{r.command}`")
        L.append(f"- **Took:** {r.duration_s:.1f}s")
        L.append("")
        for k, v in r.summary.items():
            L.append(f"- **{k}:** {v}")
        L.append("")
        for block in r.detail:
            items = block.get("items", [])
            if not items:
                continue
            L.append(f"### {block['kind']}")
            L.append("")
            if isinstance(items[0], dict):
                cols = list(items[0].keys())
                L.append("| " + " | ".join(cols) + " |")
                L.append("|" + "|".join(["---"] * len(cols)) + "|")
                for it in items:
                    L.append("| " + " | ".join(str(it.get(c, ""))[:120] for c in cols) + " |")
            else:
                for it in items:
                    L.append(f"- `{str(it)[:200]}`")
            L.append("")

    out_md.write_text("\n".join(L), encoding="utf-8")
    out_json.write_text(
        json.dumps([asdict(r) for r in results], indent=2, default=str), encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Run code-quality metrics.")
    ap.add_argument("--target", default=DEFAULT_TARGET)
    ap.add_argument("--since", default="12 months ago", help="git history window")
    ap.add_argument("--top", type=int, default=20, help="rows per worst-offender table")
    ap.add_argument("--min-co-changes", type=int, default=4)
    ap.add_argument("--skip", default="", help="comma-separated metric names to skip")
    ap.add_argument("--out", default="ADS-memory/.local-artifacts/metrics")
    args = ap.parse_args()

    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    target = args.target
    if not (REPO_ROOT / target).exists():
        print(f"target not found: {target}", file=sys.stderr)
        return 2

    scratch = Path(os.environ.get("TMPDIR", "/tmp")) / "code-metrics"
    scratch.mkdir(parents=True, exist_ok=True)

    results: list[MetricResult] = []

    def step(name: str, fn):
        if name in skip:
            results.append(MetricResult(name, False, reason="skipped via --skip"))
            return None
        print(f"  … {name}", file=sys.stderr, flush=True)
        r = fn()
        if isinstance(r, list):
            results.extend(r)
            return r
        results.append(r)
        return r

    print(f"Measuring {target} …", file=sys.stderr)

    complexity = step("complexity", lambda: metric_complexity(target, args.top))
    step("cognitive_complexity", lambda: metric_cognitive_complexity(target, args.top))
    step("duplication", lambda: metric_duplication(target, args.top, scratch))
    step("type_safety", lambda: metric_type_safety(target, args.top))
    step("dead_code", lambda: metric_dead_code(target, args.top))

    graph = None
    if "structure" not in skip:
        print("  … dependency graph", file=sys.stderr, flush=True)
        graph, gcmd, gerr = load_dep_graph(target, scratch)
        if graph:
            results.extend(metric_structure(graph, gcmd, args.top))
        else:
            for n in ("coupling", "blast_radius", "circular_dependencies", "api_surface"):
                results.append(MetricResult(n, False, tool="dependency-cruiser",
                                            command=gcmd, reason=gerr))

    print("  … git history", file=sys.stderr, flush=True)
    commits, gerr = parse_git_log(target, args.since)
    if gerr:
        for n in ("churn", "hotspots", "change_coupling"):
            results.append(MetricResult(n, False, reason=gerr))
    else:
        cx = complexity if isinstance(complexity, MetricResult) else MetricResult("complexity", False)
        results.extend(metric_churn(commits, cx, args.top, args.since))
        results.append(metric_change_coupling(commits, graph, args.top, args.min_co_changes))

    cx = complexity if isinstance(complexity, MetricResult) else MetricResult("complexity", False)
    step("coverage", lambda: metric_coverage(target, cx, args.top))

    stamp = time.strftime("%Y-%m-%d")
    out_md = REPO_ROOT / args.out / f"{stamp}-code-metrics.md"
    out_json = REPO_ROOT / args.out / f"{stamp}-code-metrics.json"
    write_report(results, target, out_md, out_json)

    ok = sum(1 for r in results if r.available)
    print(f"\n{ok}/{len(results)} metrics measured", file=sys.stderr)
    print(f"report: {out_md}", file=sys.stderr)
    for r in results:
        if not r.available:
            print(f"  GAP  {r.name}: {r.reason[:110]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
