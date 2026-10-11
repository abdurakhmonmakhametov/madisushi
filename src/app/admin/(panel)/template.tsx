// Remounts on every navigation, so each admin page slides in gently.
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="anim-rise">{children}</div>;
}
