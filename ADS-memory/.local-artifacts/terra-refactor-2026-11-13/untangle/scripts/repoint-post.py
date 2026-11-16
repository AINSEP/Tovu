#!/usr/bin/env python3
"""Turn repoint-census.cjs raw rows into a lane's .repoint.tsv (no-shells rule, owner 2026-11-15).

Usage: python3 repoint-post.py <post.json> <raw.tsv> [<raw2.tsv> ...] > <lane>.repoint.tsv

post.json keys (all optional except src_dirs):
  src_dirs:      Jini dirs the lane moves code OUT of (e.g. ["packages/http-kit/src"]). Barrel re-exports of a moved
                 name inside these dirs are shells: new_spec = DROP (delete the name from that export line).
  deleted_files: files the lane deletes; `export * from` a deleted file = DROP the line.
  renames:       {"OldName": "NewName"} -> rename column "Old->New" (importer must rename every use).
  phase_by_name: {"Name": "phase"} -> rows split per phase; default phase = default_phase ("wave").
  new_spec_by_name: {"Name": "@jini-ai/..."} overrides the census target for that name.
  c_lane_files:  {"file": "MOVE <dest>" | "SPLIT <dest>"} tests of moved code; rows get phase C-lane.
  in_src_phase_note: {"phase": "note"} rows inside src_dirs in that phase are KEEP (definition stays until then).
  note_by_name:  {"Name": "note"} extra note on rows carrying that name.
  new_spec_by_file_prefix: {"file/prefix/": {"census target": "local target"}} e.g. code moving INTO that folder.
  skip_same_spec: drop rows whose old_spec already equals new_spec (default true).

Output columns: repo, file, old_spec, names, new_spec, rename, phase, note
  new_spec = DROP          delete those names from that (re-)export line (delete the line if it becomes empty)
  new_spec = KEEP          no edit: a relative chain inside the importer's own package/app that still resolves
  new_spec = MANUAL        namespace/dynamic/mock import: a person edits it (note says what)
"""
import csv, json, sys

cfg = json.load(open(sys.argv[1]))
src_dirs = cfg['src_dirs']
deleted = set(cfg.get('deleted_files', []))
renames = cfg.get('renames', {})
phase_by = cfg.get('phase_by_name', {})
spec_by = cfg.get('new_spec_by_name', {})
default_phase = cfg.get('default_phase', 'wave')
skip_same = cfg.get('skip_same_spec', True)
c_lane = cfg.get('c_lane_files', {})   # {file: "MOVE <dest>" | "SPLIT <dest>"}: tests of moved code; the C lane moves them
in_src_phase = cfg.get('in_src_phase_note', {})  # {phase: note} for rows inside src_dirs in that phase
note_by = cfg.get('note_by_name', {})            # {Name: note} appended to rows carrying that name
spec_by_prefix = cfg.get('new_spec_by_file_prefix', {})  # {file prefix: {census target: local target}}


def base(n):
    n = n.strip()
    if n.startswith('type '):
        n = n[5:]
    return n.split(' as ')[0].split(' [')[0].strip()


def in_src(repo, f):
    return repo == 'jini' and any(f.startswith(d.rstrip('/') + '/') for d in src_dirs)


def resolve_rel(f, spec):
    import posixpath
    p = posixpath.normpath(posixpath.join(posixpath.dirname(f), spec))
    for c in (p, p.replace('.js', '.ts'), p + '.ts', p + '/index.ts'):
        if c in deleted:
            return True
    return False


out = csv.writer(sys.stdout, delimiter='\t', lineterminator='\n')
out.writerow(['repo', 'file', 'old_spec', 'names', 'new_spec', 'rename', 'phase', 'note'])
seen = set()
for raw in sys.argv[2:]:
    for r in csv.DictReader(open(raw), delimiter='\t'):
        repo, f, old, names, new = r['repo'], r['file'], r['old_spec'], r['names'], r['new_spec']
        if f in deleted:
            continue
        if f in c_lane:
            out.writerow([repo, f, old, names, new, '', 'C-lane', c_lane[f] + ' (the C lane does it with the move; relative import inside core)'])
            continue
        is_exp = old.startswith('export-from ')
        is_star = old.startswith('export * from ')
        spec = old.split(' ', 1)[1] if is_exp else (old[len('export * from '):] if is_star else old)
        rel = spec.startswith('.')
        if new == 'MANUAL':
            if is_star:
                tgt_deleted = resolve_rel(f, spec) if rel else False
                if in_src(repo, f) or tgt_deleted:
                    out.writerow([repo, f, old, names, 'DROP' if tgt_deleted else 'KEEP', '', default_phase,
                                  'export * line: delete it (target file deleted)' if tgt_deleted else
                                  'export * line stays; the moved names leave with their definitions'])
                else:
                    out.writerow([repo, f, old, names, 'MANUAL', '', default_phase, 'star re-export of moved names from another package: shell, delete the moved names'])
            else:
                out.writerow([repo, f, old, names, 'MANUAL', '', default_phase, 'namespace/dynamic/mock import: edit by hand'])
            continue
        groups = {}
        for n in names.split(','):
            b = base(n)
            ph = phase_by.get(b, default_phase)
            tgt = spec_by.get(b, new)
            for pre, m in spec_by_prefix.items():
                if f.startswith(pre) and tgt in m:
                    tgt = m[tgt]
            groups.setdefault((ph, tgt), []).append(n.strip())
        for (ph, tgt), ns in groups.items():
            rn = ','.join(f'{base(n)}->{renames[base(n)]}' for n in ns if base(n) in renames)
            if is_exp and in_src(repo, f):
                row = [repo, f, old, ','.join(ns), 'DROP', rn, ph, in_src_phase.get(ph, 'shell: delete these names from the barrel')]
            elif rel and not in_src(repo, f) and not resolve_rel(f, spec):
                row = [repo, f, old, ','.join(ns), 'KEEP', rn, ph, 'relative chain inside the importer\'s own package; resolves after the repoint of the file it names']
            else:
                if skip_same and spec == tgt:
                    continue
                note = 'export-from: keep the line, new spec' if is_exp else ''
                if in_src(repo, f) and ph in in_src_phase:
                    tgt, note = 'KEEP', in_src_phase[ph]
                extra = '; '.join(sorted({note_by[base(n)] for n in ns if base(n) in note_by}))
                note = '; '.join(x for x in (note, extra) if x)
                row = [repo, f, old, ','.join(ns), tgt, rn, ph, note]
            k = tuple(row)
            if k not in seen:
                seen.add(k)
                out.writerow(row)
