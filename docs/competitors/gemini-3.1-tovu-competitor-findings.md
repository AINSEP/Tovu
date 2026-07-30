<!-- Author: Gemini 3.1 Pro (High), run via agy CLI, read-only. Date: 2026-06-30.
     Independent run; used CBM-MCP + Graphify (incl. newly-graphified Open SaaS).
     Faithful copy of the model's output; not edited for content. -->

# Tovu CMS Architectural Analysis & OSS Comparative Report

## 1. Overview & Methodology

To determine the optimal architectural path for Tovu, I analyzed the local Tovu repository alongside 5 leading open-source CMS and boilerplate projects: Open SaaS, Payload, Ghost, Strapi, and Directus. I approached the analysis with no prior conclusions, strictly deriving insights from the available structural evidence.

**Evidence Sources Inspected**:
1. **Graphify Code Graphs**: I reviewed the cohesion metrics, node clusters, and isolated nodes in the `GRAPH_REPORT.md` (and underlying `graph.json`) for:
   - Tovu, Ghost, Payload, Strapi, Directus (located at `AI-Dev-Shop/ADS-memory/reports/graphify-out/`)
   - Open SaaS (located at `/Users/la/Desktop/Programming/OSS-Repos/open-saas/graphify-out/GRAPH_REPORT.md`)
2. **Codebase Memory MCP CLI**: I utilized the `list_projects` and `get_architecture` commands via the MCP CLI to extract the exact directory trees, monorepo workspace boundaries, and high-level structural breakdowns of each repository.

---

## 2. Comparative Analysis of Architectures

### Tovu (Current State)
- **MCP Architecture**: Tovu utilizes an experimental, bounded context approach within a single directory tree. The CLI outputs show a Next.js / Vue split, with a core `tovu/src` folder that houses strict boundaries: `core`, `features`, `headless`, `server`, and `admin-shell`.
- **Graphify Clusters**: The graph indicates a smaller-scale setup heavily reliant on dependency inversion and event-driven patterns. It is highly structured but currently confined to a single source tree rather than strict package isolation.

### Payload
- **MCP Architecture**: A massive, mature monorepo structure. The CLI reveals strict isolation via a `packages/` directory containing `payload`, `db-mongodb`, `db-postgres`, `richtext-lexical`, `graphql`, and `ui`. 
- **Graphify Clusters**: The graph shows deep modularity focused on separating database adapters and rich text providers from the core engine.
- **Takeaway**: Payload excels at enforcing boundaries by completely isolating database ORMs and UI frameworks into their own installable packages, preventing the core platform from being coupled to a specific technology.

### Directus
- **MCP Architecture**: Data-first engine architecture. The CLI maps out a strict separation between `api`, `app`, and `packages` (including `schema-builder`, `system-data`, `extensions-sdk`).
- **Graphify Clusters**: The graph heavily indexes on schema manipulation and database-level abstraction. The system treats itself as an API over the database.
- **Takeaway**: Directus proves that treating database introspections and extension SDKs as isolated packages allows for incredible headless flexibility, though it results in tight coupling to relational database concepts.

### Strapi
- **MCP Architecture**: Service-oriented monorepo divided predominantly into `packages/core`, `packages/plugins`, and `packages/providers`. 
- **Graphify Clusters**: The clusters are heavily middleware-oriented, with distinct boundaries drawn between the core routing engine and the plugin ecosystem.
- **Takeaway**: Strapi's architecture is highly extensible due to its un-opinionated API layer, but the graph shows that deep customizations can cause fragmentation across its massive plugin surface area.

### Ghost
- **MCP Architecture**: Composed of `ghost` (core backend) and decoupled sub-apps located in `core/server/apps` along with distinct front-end packages (`admin`, `portal`).
- **Graphify Clusters**: The graph highlights a mature JS/TS ecosystem that relies heavily on event-driven decoupling between the publishing engine and the UI layers.
- **Takeaway**: Using an event bus and distinct app boundaries provides massive stability for a content-publishing CMS.

### Open SaaS
- **MCP Architecture**: Structured around `app`, `blog`, and `template` directories rather than a complex package ecosystem.
- **Graphify Clusters**: Exhibits dense cohesion clusters (e.g., routing, authentication, and billing bridges) rather than abstracted libraries.
- **Takeaway**: While fantastic for an "out-of-the-box" cohesive boilerplate, its tight coupling makes it unsuitable as a reference architecture for a flexible, headless CMS.

---

## 3. Conclusions: What Tovu Should Adopt

Based on the evidence from the code graphs and the MCP architecture dumps, Tovu should adopt the following architectural patterns:

### A. Transition to a Formal Monorepo (`packages/*`) 
**Evidence**: Payload, Strapi, and Directus all manage their immense complexity by enforcing boundaries through a package manager (e.g., pnpm workspaces in a `packages/` directory). 
**Action**: Tovu currently uses `src/core`, `src/headless`, and `src/server`. While conceptually sound, these are just folders. Tovu should adopt Payload's pattern by migrating these boundaries into strict workspaces (e.g., `packages/tovu-core`, `packages/tovu-admin`) to physically prevent dependency bleed.

### B. Adopt the "Adapter Package" Pattern for Storage & UI
**Evidence**: Payload's MCP tree explicitly separates `db-mongodb` from `db-postgres` and `richtext-lexical` from `ui`. 
**Action**: Tovu currently uses a `core/ports.ts` file for dependency inversion. Tovu should push this further by making database providers and UI frameworks entirely separate packages that plug into the core, ensuring the CMS remains truly technology-agnostic.

### C. Implement a First-Class Extension & Schema Registry
**Evidence**: Directus uses `packages/schema-builder` and `packages/extensions-sdk` as foundational pillars of its architecture.
**Action**: Rather than hardcoding new capabilities in `src/features`, Tovu should build a centralized schema registry and extension SDK early on, mimicking the Directus approach, to ensure third-party extensibility is treated as a first-class citizen.

### D. Maintain and Expand Event-Driven Decoupling
**Evidence**: Ghost's graphify clusters highlight strong event communication across bounded contexts, preventing the core from knowing about the UI (`portal`/`admin`).
**Action**: Tovu already has a `src/core/events` structure. Tovu should lean into this heavily to facilitate communication between the Headless layer and the Admin Shell, adopting Ghost's event-driven stability.

## 4. Final Recommendation

**Tovu should adopt a Component-Based Modular (CBM) Monorepo architecture**, leaning most heavily on **Payload** for its strict isolation of database adapters/UI and **Directus** for its schema-driven abstraction layer. 

Tovu’s current directory-based bounded contexts (`src/core`, `src/headless`) serve as a strong conceptual foundation, but to achieve the scale and flexibility of a leading CMS, these contexts must be elevated into physical workspace packages to rigidly enforce the constraints outlined in Tovu's architecture specs.
