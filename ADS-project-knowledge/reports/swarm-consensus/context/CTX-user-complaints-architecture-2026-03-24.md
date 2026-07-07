# Swarm Consensus Context Packet

**Date:** 2026-03-24
**Slug:** user-complaints-architecture
**Project Type:** brownfield
**Question:** Given the WordPress-style complaint research, the current Tovu structure and todos, and the overall project goals, what architecture and build sequence should Tovu adopt first, and should it be Next.js-first or server-first with Next as an adapter?
**Intended Consumers:** Primary model + peer CLIs

## Goal
Produce a real two-model debate between Codex and Claude that converges on an architecture recommendation for Tovu. The debate must explicitly address user complaints, current repo structure, delivery sequencing, and whether Tovu should be mainly a Next.js application.

## Scope
In scope:
- Architecture direction for Tovu as a WordPress alternative
- How to map complaint clusters into bounded modules and capability tracks
- Runtime boundaries between core, server, workers, admin UI, and rendering adapters
- What the first complaint-solving slice should be
- How to reprioritize current roadmap items

Out of scope:
- Detailed implementation of every future package
- Database vendor selection finalization
- Exact UI design of the admin
- Pricing, fundraising, or go-to-market execution

## Architecture Summary
Tovu's canonical architecture is framework-agnostic and adapter-driven. The core is intended to be pure TypeScript with ports/adapters and a modular monolith structure. The architecture explicitly treats frontend frameworks and HTTP frameworks as swappable adapters rather than core dependencies.

The active implementation in `tovu/` is an early TypeScript scaffold with:
- `src/core/` for ports and event infrastructure
- `src/features/` for domain slices
- `src/server/` for the HTTP transport boundary

Current runtime reality:
- Express is the active HTTP runtime today
- the first implemented vertical slice is workspace creation
- the current flow is sync command + async outbox event

Planned future package shape in the canonical architecture includes:
- core packages (`kernel`, `content`, `auth`, `media`, `theme`, `plugin`, `ai`, `protocol`, `api`)
- adapters (`db-*`, `storage-*`, `auth-*`, `search-*`, `http-*`)
- UI bindings and starter kits including `create-tovu-next`

Next.js appears in the architecture as:
- a starter kit
- a UI/admin/rendering adapter
- a place to use React Server Components for data-heavy admin surfaces

Next.js does not appear as the canonical home of core CMS logic.

## Relevant Files And Artifacts
| Path | Why it matters |
|---|---|
| `tovu-architecture.md` | Canonical architecture and constraints |
| `tovu-architecture.md` section 13 | Complaint-solving capabilities and modularity rule |
| `tovu-architecture.md` section 14 | Spec-first, test-first, pattern-first delivery rule |
| `todos.md` | Current roadmap and active priorities |
| `tovu/PROJECT_MEMORY.md` | Current runtime assumptions and active vertical slice |
| `tovu/src/INFO.md` | Current module boundaries in the implementation scaffold |
| `tovu/src/server/app.ts` | Current Express transport composition root |
| `docs/user-complaints/DR GPT5.2 - Wordpress frustrations.md` | Ranked complaint clusters and AI-native capability mapping |
| `docs/user-complaints/DR Opus4.6 User Complaints.md` | Broad ecosystem pain map and operational complaints |
| `docs/user-complaints/DR Gemini 3 Pro - WordPress User Frustration Research Report.md` | Additional taxonomy including governance and DX friction |
| `docs/strategy/DR Tovu CMS.md` | Higher-level product thesis: AI-native CMS replacing WordPress model |

## Constraints
- Canonical source of truth is `tovu-architecture.md`
- Section 13 requires complaint-solving capabilities to be bounded, swappable modules behind stable seams
- Section 14 requires spec-first, test-first, pattern-first delivery
- Do not bypass dependency inversion or modular boundaries for speed
- Prefer ports/adapters over provider-coupled implementations in core
- The user specifically wants the debate to be Codex and Claude only; Gemini is excluded because quota is exhausted
- The user wants a saved six-round debate artifact

## Known Unknowns
- Exact long-term HTTP adapter choice remains open: Express vs Fastify vs Hono
- Exact default admin packaging is not finalized
- Exact model identity of the current Codex host session is not externally exposed by the current wrapper
- The first reliability slice still needs formal spec and ADR artifacts after the debate

## Source-of-Truth Inputs
| Source | Notes |
|---|---|
| `tovu-architecture.md` | States core has zero opinions about rendering/HTTP and treats Next.js as an adapter/starter |
| `tovu-architecture.md` section 13 | Names major complaint-driven capability tracks: reliability, trust, performance, authoring, operations |
| `tovu-architecture.md` section 14 | Requires specs, ADRs, tests, and rollback-safe delivery |
| `todos.md` | Shows current near-term tasks: split ports, route tests, persistent adapters, logging, feature flags, error taxonomy |
| `tovu/PROJECT_MEMORY.md` | Confirms current runtime is Express and current slice is workspace creation with outbox |
| complaint research docs | Show dominant pain clusters: update breakage, debugging opacity, plugin conflict, performance attribution, authoring fragility, governance/trust, migration pain |

## Shared Prompt Payload
You are participating in a brownfield architecture debate for the Tovu project, an AI-native CMS intended to replace the legacy WordPress model without becoming framework-coupled.

Base facts:
- Tovu is intended to be framework-agnostic at the core with ports/adapters and a modular monolith shape.
- The active implementation today is a TypeScript scaffold with an Express server, core ports, feature slices, and an outbox flow.
- Next.js is present in the canonical architecture as a starter/admin/rendering adapter, not as the canonical home of core CMS logic.
- The complaint corpus is dominated by operational failures: update roulette, critical-error opacity, plugin conflicts, performance diagnosis opacity, authoring breakage, governance/trust risk, migration pain, and admin clutter.
- The architecture rules require all complaint-solving capabilities to be swappable modules behind stable ports, and delivery must be spec-first and test-first.

Debate objective:
- Decide what Tovu should be architecturally, how it should handle server-side responsibilities analogous to WordPress/PHP, how it should treat Next.js, and what it should build first.

Required decision points:
1. Should Tovu be mainly a Next.js application, or a server-first CMS platform with Next.js as an adapter?
2. Which complaint clusters should drive the first architecture and roadmap decisions?
3. What top-level module or plane boundaries best map to those complaints?
4. How should server-side responsibilities be handled in Tovu?
5. What should be the first thin vertical slice that proves the architecture against real user pain?
6. How should the current roadmap be reordered?

Debate format:
- Total of 6 rounds
- Round 1 is the independent opening position
- Rounds 2-6 are rebuttal/refinement rounds based on summarized deltas
- Be concrete, architectural, and opinionated
- Do not answer as if you are designing a generic headless CMS
- End every response with `<<SWARM_END>>`
