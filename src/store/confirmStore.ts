import { create } from "zustand";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

interface ConfirmStoreState {
  request: ConfirmRequest | null;
  resolve: (result: boolean) => void;
}

/**
 * window.confirm は環境（WSLg 等）によってダイアログが表示されない・
 * 即座に false を返すことがあるため、アプリ内モーダルで代替する。
 * 使い方: `if (await confirmDialog({ message: "..." })) { ... }`
 */
export const useConfirmStore = create<ConfirmStoreState>((set, get) => ({
  request: null,
  resolve: (result) => {
    get().request?.resolve(result);
    set({ request: null });
  },
}));

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { ...options, resolve } });
  });
}
