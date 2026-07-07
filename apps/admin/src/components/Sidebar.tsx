import {
  buildAdminMenuEntries,
  createEmptyAdminCurrentState,
  type AdminCurrentKey,
  type AdminMenuTarget,
} from "@tovu/admin-shell";

function targetToHash(target: AdminMenuTarget): string {
  if (target.kind === "dashboard") return "#/";
  if (target.kind === "default-post-editor") return "#/posts/post-home";
  if (target.sectionId === "posts") return "#/posts";
  return `#/section/${target.sectionId}`;
}

export function Sidebar(props: { currentKeys: AdminCurrentKey[]; onLogout: () => void }) {
  const current = createEmptyAdminCurrentState();
  for (const key of props.currentKeys) current[key] = true;

  const entries = buildAdminMenuEntries({
    current,
    resolveTargetHref: targetToHash,
  });

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Tovu</div>
      {entries.map((entry) => {
        if (entry.kind === "separator") return <hr key={entry.key} className="sidebar-sep" />;
        if (entry.kind === "promo") {
          return (
            <div key={entry.key} className="sidebar-promo">
              <div>{entry.title}</div>
              <a href={entry.href}>{entry.actionLabel}</a>
            </div>
          );
        }
        return (
          <div key={entry.key} className={`sidebar-item${entry.current ? " current" : ""}${entry.tone === "product" ? " product" : ""}`}>
            <a href={entry.href}>
              <span className="sidebar-icon">{entry.icon}</span>
              <span>{entry.label}</span>
              {entry.badge ? <span className="sidebar-badge">{entry.badge}</span> : null}
            </a>
            {entry.current && entry.children ? (
              <div className="sidebar-children">
                {entry.children.map((child) => (
                  <a key={child.key} href={child.href} className={child.current ? "current" : ""}>
                    {child.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <button className="sidebar-logout" onClick={props.onLogout}>
        Log out
      </button>
    </nav>
  );
}
