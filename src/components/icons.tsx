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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconTasks({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8.5 12l2.5 2.5 5-5" />
    </svg>
  );
}

export function IconChart({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
    </svg>
  );
}

export function IconNotebook({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <rect x="5" y="3" width="15" height="18" rx="2" />
      <path d="M9 3v18M13 8h4M13 12h4" />
    </svg>
  );
}

export function IconGear({ size = 20 }: IconProps) {
  return (
    <svg {...iconAttrs(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.2 2.6 2.8-.6 1 2.7 2.7 1-.6 2.8 2.6 1.2-2.6 1.2.6 2.8-2.7 1-1 2.7-2.8-.6L12 21.5l-1.2-2.6-2.8.6-1-2.7-2.7-1 .6-2.8L2.3 12l2.6-1.2-.6-2.8 2.7-1 1-2.7 2.8.6z" />
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
