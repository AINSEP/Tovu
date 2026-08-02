# Handoff Protocol

Use this file when starting a new debate, architecture review, implementation-planning session, or LLM handoff.

## Goal

Get every participant onto the same architecture baseline quickly without forcing a full reread of the entire canonical document every time.

## Default Packet

Start with:

1. [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
2. [`LLM-NAVIGATION.md`](LLM-NAVIGATION.md)
3. the minimal read set for the task

If exact phrasing or source authority becomes important, promote the read to:

4. [`../../tovu-architecture.md`](../../tovu-architecture.md)
5. the verified extract file for the cited section

## Task Classification

- Architecture proposal or refactor:
  use the `architecture proposal` read set from [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
- Package layout / module ownership:
  use the `package/layout question` read set from [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
- Plugin, theme, or extension surface:
  use the `theme/plugin/extensibility question` read set from [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
- Planning or implementation:
  use the `planning or implementation sequencing` read set from [`CONTEXT-PACKET.md`](CONTEXT-PACKET.md)
- Pattern exploration:
  start with [`appendices/00-architectural-patterns-reference.md`](appendices/00-architectural-patterns-reference.md), then map back to active sections before recommending anything

## Required Callouts In Serious Sessions

When the session changes architecture, implementation shape, or module boundaries, explicitly call out:

- that [`../../tovu-architecture.md`](../../tovu-architecture.md) is canonical
- that Section 13 constrains solutions to swappable modules and stable seams
- that Section 14 constrains delivery to spec-first, test-first, pattern-first
- whether any cited pattern is active architecture or only appendix/reference material

## Minimal Inline Packet Template

Use this when you need to brief another LLM quickly:

```text
Canonical source: tovu-architecture.md
Start packet: ADS-memory/docs/architecture/CONTEXT-PACKET.md
Question type: <architecture proposal | package layout | theme/plugin | planning | pattern research>
Required reads: <paths from CONTEXT-PACKET.md>
Non-negotiables: dependencies point inward, core never imports adapters, no circular dependencies, no provider SDKs in core, Section 13 modular friction rules, Section 14 delivery rules
Warning: appendix/reference files are not active architecture commitments by themselves
```

## When To Refresh This Layer

Refresh the packet and handoff docs when:

- the canonical architecture changes materially
- the read sets stop matching how work is actually routed
- a new architecture area becomes important enough to deserve its own fast route
- repeated LLM sessions keep missing the same constraints
