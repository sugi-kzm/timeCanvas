import { MiniCalendar } from "./MiniCalendar";
import { CategoryList } from "./CategoryList";
import { WeekSummary } from "./WeekSummary";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <MiniCalendar />
      <CategoryList />
      <WeekSummary />
    </aside>
  );
}
