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
      <div className="category-chip-row">
        {categories.map((c) => {
          const hidden = hiddenIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`category-chip ${hidden ? "hidden" : ""}`}
              aria-pressed={!hidden}
              title={hidden ? `${c.name} を表示` : `${c.name} を非表示`}
              onClick={() => toggleHidden(c.id)}
            >
              <span className="category-dot" style={{ background: c.color }} />
              <span className="category-name">{c.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
