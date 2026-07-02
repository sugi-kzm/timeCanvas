import { useAppStore } from "../../store/appStore";

export function CategoryList() {
  const categories = useAppStore((s) => s.categories);
  const hiddenIds = useAppStore((s) => s.hiddenCategoryIds);
  const toggleHidden = useAppStore((s) => s.toggleCategoryHidden);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <section className="category-list" aria-label="カテゴリ">
      <div className="side-section-header">
        <span>カテゴリ</span>
        <button type="button" className="link-btn" onClick={() => setSettingsOpen(true)}>
          編集
        </button>
      </div>
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            <label className="category-item">
              <input
                type="checkbox"
                checked={!hiddenIds.includes(c.id)}
                onChange={() => toggleHidden(c.id)}
              />
              <span className="category-dot" style={{ background: c.color }} />
              <span className="category-name">{c.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
