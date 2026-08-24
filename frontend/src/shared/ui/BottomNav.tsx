import {
  NavIconDialogs,
  NavIconFunnel,
  NavIconProfile,
  NavIconTasks
} from "./navIcons";

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

const NAV_ITEMS: Array<{
  id: MobileNavSection;
  icon: (props: { className?: string }) => JSX.Element;
}> = [
  { id: "dialogs", icon: NavIconDialogs },
  { id: "pipeline", icon: NavIconFunnel },
  { id: "tasks", icon: NavIconTasks },
  { id: "profile", icon: NavIconProfile }
];

function labelFor(id: MobileNavSection, labels: BottomNavProps["labels"]): string {
  if (id === "dialogs") return labels.dialogs;
  if (id === "pipeline") return labels.funnel;
  if (id === "tasks") return labels.tasks;
  return labels.profile;
}

export function BottomNav(props: BottomNavProps): JSX.Element {
  const { active, onChange, labels } = props;

  return (
    <nav className="bottomNav" aria-label="Главное меню">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={`bottomNavItem ${active === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className="bottomNavIcon" aria-hidden="true">
              <Icon />
            </span>
            <span className="bottomNavLabel">{labelFor(item.id, labels)}</span>
          </button>
        );
      })}
    </nav>
  );
}
