// Remounts on every navigation so each page fades in. Opacity only: a
// transform here would break the menu's fixed cart bar while animating.
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="anim-fade">{children}</div>;
}
