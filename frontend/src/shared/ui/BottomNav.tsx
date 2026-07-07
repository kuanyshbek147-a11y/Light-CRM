export type MobileNavSection = "dialogs" | "pipeline" | "tasks" | "profile";

type BottomNavProps = {
  active: MobileNavSection;
  onChange: (section: MobileNavSection) => void;
  labels: {
    dialogs: string;
    funnel: string;
    tasks: string;
    profile: string;
  };
};

const NAV_ITEMS: Array<{ id: MobileNavSection; icon: string }> = [
  { id: "dialogs", icon: "💬" },
  { id: "pipeline", icon: "🔽" },
  { id: "tasks", icon: "📋" },
  { id: "profile", icon: "👤" }
];

export function BottomNav(props: BottomNavProps): JSX.Element {
  const { active, onChange, labels } = props;

  return (
    <nav className="bottomNav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottomNavItem ${active === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <span className="bottomNavIcon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottomNavLabel">
            {item.id === "dialogs"
              ? labels.dialogs
              : item.id === "pipeline"
                ? labels.funnel
                : item.id === "tasks"
                  ? labels.tasks
                  : labels.profile}
          </span>
        </button>
      ))}
    </nav>
  );
}
