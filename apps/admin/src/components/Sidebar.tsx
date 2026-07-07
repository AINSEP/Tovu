import { NAV, type NavItem } from "../nav";

/**
 * Grouped admin sidebar (the `.cms-nav` design). Replaces the flat,
 * WordPress-shaped menu. `activeId` matches a NavItem.id (see App.activeSectionId).
 */
function Icon(props: { markup: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      dangerouslySetInnerHTML={{ __html: props.markup }}
    />
  );
}

function Item(props: { item: NavItem; active: boolean }) {
  const { item, active } = props;

  if (item.soon || !item.href) {
    return (
      <div className="cms-item is-soon" aria-disabled="true">
        <Icon markup={item.icon} />
        <span>{item.label}</span>
        <span className="soon">Soon</span>
      </div>
    );
  }

  return (
    <a className={`cms-item${active ? " active" : ""}`} href={item.href} aria-current={active ? "page" : undefined}>
      <Icon markup={item.icon} />
      <span>{item.label}</span>
    </a>
  );
}

export function Sidebar(props: { activeId: string; onLogout: () => void }) {
  return (
    <nav className="cms-nav scroll" aria-label="Admin">
      {NAV.map((group, gi) => (
        <div className="cms-section" key={group.label ?? `top-${gi}`}>
          {group.label ? <div className="cms-group">{group.label}</div> : null}
          {group.items.map((item) => (
            <Item key={item.id} item={item} active={item.id === props.activeId} />
          ))}
        </div>
      ))}

      <div className="cms-foot">
        <button className="cms-logout" onClick={props.onLogout}>
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M7 15H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 3h3M11.5 12L15 9l-3.5-3M15 9H7" />
          </svg>
          <span>Log out</span>
        </button>
      </div>
    </nav>
  );
}
