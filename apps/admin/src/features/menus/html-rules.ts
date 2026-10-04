/** Same marker shape and attribute escaping as the forms Copy HTML embed control. */
export function menuHtmlEmbed({ slug }: { slug: string }, _optional = {}): string {
  const config = JSON.stringify({ type: "menu", id: slug, mode: "html" }).replace(/'/g, "&#39;");
  return `<div data-embed-config='${config}'></div>`;
}
