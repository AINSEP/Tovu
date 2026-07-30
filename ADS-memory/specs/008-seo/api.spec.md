# API Contract Spec: seo

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-008`
- Feature: `FEAT-008-seo`
- Version: `1.0.0`
- Content Hash: `sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128`
- Last Edited: `2026-07-13T20:18:23Z`

## Purpose
This file is the source of truth for API behavior for the SEO admin section and its two public routes, independent of implementation language.

Routing note: this repo mounts admin routes at `/api/admin/v1/workspaces/:workspaceId/...` and checks `req.params.workspaceId === deps.workspaceId` (single-workspace-per-process dev deployment — see `presentation/get.ts`, `settings/get-effective.ts`). Public site routes (`sitemap.xml`, `robots.txt`) resolve the workspace implicitly from `deps.workspaceId` with no path param, matching the existing public-site-serving composition root.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `SEO_GET_ENTRY_META` | `GET` | `/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId` | Read an entry's SEO overrides plus effective (resolved) meta | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_PUT_ENTRY_META` | `PUT` | `/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId` | Write (partial) SEO override fields for an entry | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_GET_ENTRY_ANALYZE` | `GET` | `/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId/analyze` | Compute SEO score + issues for an entry (admin panel only) | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_GET_SETTINGS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/seo/settings` | Read workspace-level `seo.*` settings | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_PUT_SETTINGS` | `PUT` | `/api/admin/v1/workspaces/:workspaceId/seo/settings` | Write workspace-level `seo.*` settings | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_POST_SITEMAP_REGENERATE` | `POST` | `/api/admin/v1/workspaces/:workspaceId/seo/sitemap/regenerate` | Force-rebuild the cached sitemap now | `SEO_ADMIN` | `ADMIN_STANDARD` |
| `SEO_GET_SITEMAP` | `GET` | `/sitemap.xml` | Public sitemap for the workspace's site | `SEO_PUBLIC` | `PUBLIC_READ` |
| `SEO_GET_ROBOTS` | `GET` | `/robots.txt` | Public robots policy for the workspace's site | `SEO_PUBLIC` | `PUBLIC_READ` |

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `SEO_ADMIN` | `true` | Dev-auth session principal (`getAuthedPrincipal`, matches every existing admin route) | `admin.seo.manage` | `editor` (per ADR-021 §9 non-normative seed mapping, folded per the project-wide `admin` + section + verb namespace convention), `admin`, `owner` (`*`) | Single permission gates both read and write for this admin surface, mirroring `theme.set`/`admin.redirects.manage`/`admin.integrations.manage` precedent — see `feature.spec.md` mismatch notes on the superseded `seo.*` flat-string permission list still present in `src/seo/types.ts`. |
| `SEO_PUBLIC` | `false` | none | none | none (public) | `sitemap.xml`/`robots.txt` are intentionally unauthenticated per REQ-08/09 — matches every SEO plugin precedent (Yoast/RankMost) and carries no PII. |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `ADMIN_STANDARD` | `60` | `30` | `5` | `userId` | Not enforced by any middleware in the current v1 dev server (no rate-limiting infra exists yet anywhere in this repo); profile is reserved for the future rate-limiting feature, consistent with the Article VI standing exception. |
| `PUBLIC_READ` | `60` | `300` | `50` | `ip` | Same not-yet-enforced status as `ADMIN_STANDARD`; public routes have no per-IP throttling today. |

## 4) Request Contracts

### Endpoint: `SEO_GET_ENTRY_META` (`GET /api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
entryId:
  type: string
  format: uuid
  required: true
```
- Query Params:
```yaml
{}
```

### Endpoint: `SEO_PUT_ENTRY_META` (`PUT /api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
entryId:
  type: string
  format: uuid
  required: true
```
- Body (all fields optional; `null` clears a field back to "derive"; unknown keys are rejected — REQ-03):
```yaml
title:
  type: string
  maxLength: 500
  required: false
description:
  type: string
  maxLength: 500
  required: false
canonical:
  type: string
  format: uri
  maxLength: 2048
  required: false
noindex:
  type: boolean
  required: false
nofollow:
  type: boolean
  required: false
schemaType:
  type: string
  maxLength: 500
  required: false
ogTitle:
  type: string
  maxLength: 500
  required: false
ogDescription:
  type: string
  maxLength: 500
  required: false
ogImage:
  type: string
  maxLength: 2048
  required: false
ogType:
  type: string
  enum: [website, article, profile]
  required: false
twitterCard:
  type: string
  enum: [summary, summary_large_image]
  required: false
twitterTitle:
  type: string
  maxLength: 500
  required: false
twitterDescription:
  type: string
  maxLength: 500
  required: false
twitterImage:
  type: string
  maxLength: 2048
  required: false
```

### Endpoint: `SEO_GET_ENTRY_ANALYZE` (`GET /api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId/analyze`)
- Path Params: same as `SEO_GET_ENTRY_META`.

### Endpoint: `SEO_GET_SETTINGS` (`GET /api/admin/v1/workspaces/:workspaceId/seo/settings`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
```

### Endpoint: `SEO_PUT_SETTINGS` (`PUT /api/admin/v1/workspaces/:workspaceId/seo/settings`)
- Path Params: same as `SEO_GET_SETTINGS`.
- Body (`seo.base_url`/`baseUrl` is intentionally NOT a field here — retired per ADR-032 Round-3 fold; REQ-12/INV-07):
```yaml
titleTemplate:
  type: string
  required: false
  pattern: "contains literal '%s' exactly once"
defaultDescription:
  type: string
  maxLength: 500
  required: false
defaultOgImage:
  type: string
  maxLength: 2048
  required: false
twitterSite:
  type: string
  maxLength: 100
  required: false
defaultRobots:
  type: object
  required: false
  properties:
    noindex: { type: boolean }
    nofollow: { type: boolean }
sitemapEnabled:
  type: boolean
  required: false
robotsRules:
  type: array
  required: false
  maxItems: 50
  items:
    userAgent: { type: string, required: true }
    allow: { type: array, items: { type: string } }
    disallow: { type: array, items: { type: string } }
```

### Endpoint: `SEO_POST_SITEMAP_REGENERATE` (`POST /api/admin/v1/workspaces/:workspaceId/seo/sitemap/regenerate`)
- Path Params: same as `SEO_GET_SETTINGS`.
- Body: `{}` (no payload).

### Endpoint: `SEO_GET_SITEMAP` (`GET /sitemap.xml`)
- Path Params: `{}` — workspace resolved from `deps.workspaceId` (see Purpose note).

### Endpoint: `SEO_GET_ROBOTS` (`GET /robots.txt`)
- Path Params: `{}` — workspace resolved from `deps.workspaceId`.

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `SEO_GET_ENTRY_META` | `200` | `SeoEntryMetaResponse` | Returns overrides + effective meta |
| `SEO_PUT_ENTRY_META` | `200` | `SeoEntryMetaResponse` | Returns the entry's overrides + effective meta after the write |
| `SEO_GET_ENTRY_ANALYZE` | `200` | `SeoAnalysisResponse` | |
| `SEO_GET_SETTINGS` | `200` | `SeoSettingsResponse` | |
| `SEO_PUT_SETTINGS` | `200` | `SeoSettingsResponse` | Returns settings after the write |
| `SEO_POST_SITEMAP_REGENERATE` | `202` | `SeoSitemapRegenerateResponse` | Accepted — rebuild may complete asynchronously relative to the response |
| `SEO_GET_SITEMAP` | `200` | `text/xml` body (not JSON) | `<urlset>` document per REQ-08 |
| `SEO_GET_ROBOTS` | `200` | `text/plain` body (not JSON) | Standard `robots.txt` grammar per REQ-09 |

### Contract Definitions
```yaml
SeoExtFieldsOverrides:
  title: { type: string, nullable: true }
  description: { type: string, nullable: true }
  canonical: { type: string, format: uri, nullable: true }
  noindex: { type: boolean, nullable: true }
  nofollow: { type: boolean, nullable: true }
  schemaType: { type: string, nullable: true }
  ogTitle: { type: string, nullable: true }
  ogDescription: { type: string, nullable: true }
  ogImage: { type: string, nullable: true }
  ogType: { type: string, enum: [website, article, profile], nullable: true }
  twitterCard: { type: string, enum: [summary, summary_large_image], nullable: true }
  twitterTitle: { type: string, nullable: true }
  twitterDescription: { type: string, nullable: true }
  twitterImage: { type: string, nullable: true }

SeoEffectiveMeta:
  title: { type: string }
  description: { type: string, nullable: true }
  canonical: { type: string, format: uri }
  robots: { noindex: boolean, nofollow: boolean }
  openGraph: { title: string, description: string, type: string, url: string, image: string, siteName: string }
  twitter: { card: string, title: string, description: string, image: string, site: string }
  jsonLd: { type: array, items: { type: object } }

SeoEntryMetaResponse:
  entryId: { type: string, format: uuid }
  overrides: { $ref: SeoExtFieldsOverrides }
  effective: { $ref: SeoEffectiveMeta }

SeoIssue:
  code: { type: string }
  severity: { type: string, enum: [error, warning, info] }
  message: { type: string }
  field: { type: string, nullable: true }

SeoAnalysisResponse:
  entryId: { type: string, format: uuid }
  score: { type: number }
  issues: { type: array, items: { $ref: SeoIssue } }

RobotsRule:
  userAgent: { type: string }
  allow: { type: array, items: { type: string }, nullable: true }
  disallow: { type: array, items: { type: string }, nullable: true }

SeoSettingsResponse:
  titleTemplate: { type: string }
  defaultDescription: { type: string, nullable: true }
  defaultOgImage: { type: string, nullable: true }
  twitterSite: { type: string, nullable: true }
  defaultRobots: { noindex: boolean, nofollow: boolean }
  sitemapEnabled: { type: boolean }
  robotsRules: { type: array, items: { $ref: RobotsRule } }

SeoSitemapRegenerateResponse:
  status: { type: string, enum: [accepted] }
  workspaceId: { type: string, format: uuid }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `SEO_GET_ENTRY_META` | `401` | `UNAUTHENTICATED` |
| `SEO_GET_ENTRY_META` | `403` | `FORBIDDEN` |
| `SEO_GET_ENTRY_META` | `404` | `SEO_ENTRY_NOT_FOUND` |
| `SEO_GET_ENTRY_META` | `500` | `INTERNAL_ERROR` |
| `SEO_PUT_ENTRY_META` | `400` | `SEO_FIELD_VALIDATION_ERROR, SEO_INVALID_CANONICAL_URL` |
| `SEO_PUT_ENTRY_META` | `401` | `UNAUTHENTICATED` |
| `SEO_PUT_ENTRY_META` | `403` | `FORBIDDEN` |
| `SEO_PUT_ENTRY_META` | `404` | `SEO_ENTRY_NOT_FOUND` |
| `SEO_PUT_ENTRY_META` | `500` | `INTERNAL_ERROR` |
| `SEO_GET_ENTRY_ANALYZE` | `401` | `UNAUTHENTICATED` |
| `SEO_GET_ENTRY_ANALYZE` | `403` | `FORBIDDEN` |
| `SEO_GET_ENTRY_ANALYZE` | `404` | `SEO_ENTRY_NOT_FOUND` |
| `SEO_GET_SETTINGS` | `401` | `UNAUTHENTICATED` |
| `SEO_GET_SETTINGS` | `403` | `FORBIDDEN` |
| `SEO_PUT_SETTINGS` | `400` | `SEO_SETTINGS_VALIDATION_ERROR` |
| `SEO_PUT_SETTINGS` | `401` | `UNAUTHENTICATED` |
| `SEO_PUT_SETTINGS` | `403` | `FORBIDDEN` |
| `SEO_POST_SITEMAP_REGENERATE` | `401` | `UNAUTHENTICATED` |
| `SEO_POST_SITEMAP_REGENERATE` | `403` | `FORBIDDEN` |
| `SEO_POST_SITEMAP_REGENERATE` | `500` | `INTERNAL_ERROR` |
| `SEO_GET_SITEMAP` | `500` | `INTERNAL_ERROR` |
| `SEO_GET_ROBOTS` | `500` | `INTERNAL_ERROR` |

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
