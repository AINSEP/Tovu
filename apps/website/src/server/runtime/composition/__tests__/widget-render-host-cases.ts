import type { JsonObject } from "@jini-ai/core/primitives";

/** The inputs the legacy-markup byte pin renders, shared by the recorder and the test. */
export const SOCIAL_PROPS: JsonObject = { links: [{ platform: "Mastodon", url: "https://example.org/@a" }, { platform: "RSS <feed>", url: "/feed.xml" }, "not-an-object"] };
export const ENTRY_SUMMARY_PROPS: readonly JsonObject[] = [{ slug: "hello-world", title: "Hello <World>" }, { slug: "/evil.example", title: "Bad slug" }];
export const RECENT_IR = {
  componentId: "recent-entries", props: { layout: "list" },
  children: [{ componentId: "x", props: { title: "One", href: "/one" } }, { componentId: "x", props: { title: "Two & Co", href: null } }],
};
export const RECENT_EMPTY_IR = { componentId: "recent-entries", props: { layout: "list" }, children: [] };
export const POST_PROPS: JsonObject = {
  title: "A <Post>", bodyJson: { type: "doc", content: [] }, publishAt: "2026-03-04T10:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z",
  timeZone: "UTC", postAuthorByline: '<span class="byline">By Ann</span>',
};
export const POST_NO_HEADER_PROPS: JsonObject = { ...POST_PROPS, header: false };
export const POST_DOC_RENDERING = { renderDocNode: () => "<p>body</p>", renderNodes: () => "" };
export const FORM_FIELDS = [{ name: "email", type: "email", label: "Email", required: true }, { name: "note", type: "text", label: "Note" }];
export const FORM_BUILTIN_PROPS: JsonObject = { slug: "contact", fields: FORM_FIELDS };
export const FORM_BUILTIN_MESSAGE_PROPS: JsonObject = { slug: "contact", fields: FORM_FIELDS, successMessage: "Sent <ok>" };
export const FORM_HTML_PROPS: JsonObject = { slug: "contact", mode: "html", html: "<label>Email <input name=\"email\"></label>", fields: FORM_FIELDS };
