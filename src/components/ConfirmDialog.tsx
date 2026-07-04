import { useEffect, useRef } from "react";
import { useConfirmStore } from "../store/confirmStore";

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const resolve = useConfirmStore((s) => s.resolve);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request !== null) confirmRef.current?.focus();
  }, [request]);

  if (request === null) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") resolve(false);
  };

  return (
    <div className="modal-backdrop" onPointerDown={() => resolve(false)}>
      <div
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title ?? "確認"}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {request.title !== undefined && <h2 className="dialog-title">{request.title}</h2>}
        <p className="confirm-message">{request.message}</p>
        <div className="dialog-actions">
          <div className="spacer" />
          <button type="button" className="btn" onClick={() => resolve(false)}>
            {request.cancelLabel ?? "キャンセル"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${request.danger === true ? "danger" : "primary"}`}
            onClick={() => resolve(true)}
          >
            {request.confirmLabel ?? "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}
