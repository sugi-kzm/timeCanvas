interface IconProps {
  size?: number;
}

function iconAttrs(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconCalendar({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.2M16 3v3.2" />
      <path d="M7.5 13.2h2M11 13.2h2M14.5 13.2h2M7.5 16.6h2M11 16.6h2" />
    </svg>
  );
}

export function IconTasks({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M4.5 6.5l1.6 1.6L9 5" />
      <path d="M4.5 12.5l1.6 1.6L9 11" />
      <path d="M4.5 18.5l1.6 1.6L9 17" />
      <path d="M12.5 6.5h7M12.5 12.5h7M12.5 18.5h7" />
    </svg>
  );
}

export function IconSubtasks({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M4 6h6M4 12h6M4 18h6" />
      <path d="M13 6h7M13 12h7M13 18h7" />
    </svg>
  );
}

export function IconChart({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M4 4v16h16" />
      <path d="M7.5 17.5v-5M12 17.5v-9M16.5 17.5v-3.5" />
    </svg>
  );
}

export function IconNotebook({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M6.5 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M9.3 3.5v17" />
      <path d="M12.7 8.2h4.6M12.7 12h4.6M12.7 15.8h3" />
    </svg>
  );
}

export function IconGear({ size = 20 }: IconProps) {
  // 歯付きのコグ（Lucide "settings" 相当）。放射線タイプは太陽に見えるため不採用
  return (
    <svg {...iconAttrs(size)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconChevronLeft({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

export function IconArrowLeft({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

export function IconArrowRight({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

export function IconChevronRight({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}

export function IconClose({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconSearch({ size = 18 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5L16 16" />
    </svg>
  );
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconDoc({ size = 16 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

export function IconFolder({ size = 16 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconHistory({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M3.2 3.5v4.3h4.3" />
      <path d="M12 8.2v4.1l3 1.8" />
    </svg>
  );
}

export function IconSidebar({ size = 18 }: IconProps) {
  // 外枠 + 縦仕切りのみのアウトライン型（Claude Code のサイドバートグル風）
  return (
    <svg {...iconAttrs(size)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}
