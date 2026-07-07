import { getAdminSectionById } from "@tovu/admin-shell";

export function Placeholder(props: { sectionId: string }) {
  const section = getAdminSectionById(props.sectionId);
  if (!section) return <div className="notice error">Unknown section: {props.sectionId}</div>;

  return (
    <div>
      <h1>{section.label}</h1>
      <div className="notice">{section.description}</div>
    </div>
  );
}
