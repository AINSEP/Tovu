import type { JsonObject } from "../core/ports";
import type { PostRecord } from "../features/post";
import type { PresentationSettingsRecord } from "../features/presentation";
import type { WorkspaceRecord } from "../features/workspace";

/**
 * @file First-run seed content.
 *
 * Purpose:
 * Single source of truth for the demo workspace + posts + presentation settings.
 *
 * How it relates to the project:
 * - The in-memory route deps seed these into their constructors (dev/tests).
 * - The SQLite content.db seeds these once, only when the store is empty
 *   (`infra/sqlite/content-db.ts` → `seedContentDb`).
 *
 * Architectural role:
 * Keeps seed data out of both the composition root and the storage adapters so
 * the two persistence paths stay identical.
 */
export const seededWorkspace: WorkspaceRecord = {
  id: "workspace-local",
  name: "Local Tovu Workspace",
  slug: "local-tovu",
  createdAt: "2026-04-06T00:00:00.000Z",
};

const seededWelcomeDoc: JsonObject = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Welcome to Tovu" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "This editor is now using a real " },
        { type: "text", text: "TipTap", marks: [{ type: "bold" }] },
        { type: "text", text: " document with styled prose instead of an empty demo box." },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Use it to pressure-test the shell before we fill in the rest of the CMS." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Bold", marks: [{ type: "bold" }] },
                { type: "text", text: " and " },
                { type: "text", text: "italic", marks: [{ type: "italic" }] },
                { type: "text", text: " formatting should be obvious immediately." },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Lists, quotes, and code blocks should round-trip through the API." },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Switch themes in Appearance to verify the frontend actually changes." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Build the skateboard first, but make sure it actually rolls." },
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      content: [{ type: "text", text: "console.log('Tovu shell is live');" }],
    },
  ],
};

export const seededPosts: PostRecord[] = [
  {
    id: "post-home",
    workspaceId: seededWorkspace.id,
    title: "Welcome to Tovu",
    slug: "welcome",
    bodyJson: seededWelcomeDoc,
    status: "published",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 1,
  },
  {
    id: "post-glass-demo",
    workspaceId: seededWorkspace.id,
    title: "Glassmorphic Demo Notes",
    slug: "glass-demo",
    bodyJson: {
      type: "doc",
      content: [
        {
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Theme Switching Check" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Use this seeded post to verify that the frontend really changes when the active theme changes.",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Paper should feel editorial and warm." }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Atlas should feel bold and atmospheric." }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Glassmorphic should feel translucent and layered." }],
                },
              ],
            },
          ],
        },
      ],
    },
    status: "published",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 1,
  },
];

export const seededPresentation: PresentationSettingsRecord = {
  workspaceId: seededWorkspace.id,
  activeThemeId: "paper",
  updatedAt: "2026-04-06T00:00:00.000Z",
};
