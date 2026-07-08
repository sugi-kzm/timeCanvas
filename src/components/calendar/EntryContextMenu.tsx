import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";

export interface EntryContextMenuState {
  entryId: string;
  x: number;
  y: number;
}

interface EntryContextMenuProps {
  state: EntryContextMenuState;
  onClose: () => void;
}

export function EntryContextMenu({ state, onClose }: EntryContextMenuProps) {
  const removeEntry = useAppStore((s) => s.removeEntry);

  const remove = () => {
    onClose();
    void confirmDialog({
      title: "記録を削除",
      message: "この記録を削除しますか？",
      danger: true,
    }).then((ok) => {
      if (ok) void removeEntry(state.entryId);
    });
  };

  return (
    <>
      <div className="popover-backdrop" onPointerDown={onClose} />
      <div className="note-context-menu" style={{ left: state.x, top: state.y }} role="menu">
        <button type="button" role="menuitem" className="danger" onClick={remove}>
          削除
        </button>
      </div>
    </>
  );
}
