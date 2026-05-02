import * as React from "react";
export type IconName =
  | "chat" | "tasks" | "agents" | "connector" | "settings" | "dashboard" | "earnings"
  | "send" | "plus" | "search" | "check" | "x" | "alert" | "shield" | "globe" | "cube"
  | "key" | "database" | "play" | "pause" | "refresh" | "edit" | "chevron-right"
  | "chevron-down" | "arrow-up" | "arrow-up-right" | "bell" | "users" | "terminal" | "logout";

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "chat": return (<svg {...p}><path d="M21 12a8 8 0 0 1-12.4 6.7L3 20l1.4-5A8 8 0 1 1 21 12z"/></svg>);
    case "tasks": return (<svg {...p}><path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>);
    case "agents": return (<svg {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>);
    case "connector": return (<svg {...p}><path d="M9 17l-3 3-3-3 3-3"/><path d="M15 7l3-3 3 3-3 3"/><path d="M7 14l10-10"/></svg>);
    case "settings": return (<svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0 1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3 2 2 0 1 1-2.8-2.8 1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8 2 2 0 1 1 2.8-2.8 1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3 2 2 0 1 1 2.8 2.8 1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1z"/></svg>);
    case "dashboard": return (<svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>);
    case "earnings": return (<svg {...p}><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
    case "send": return (<svg {...p}><path d="M5 12l14-7-7 14-2-5-5-2z"/></svg>);
    case "plus": return (<svg {...p}><path d="M12 5v14M5 12h14"/></svg>);
    case "search": return (<svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>);
    case "check": return (<svg {...p}><path d="M5 12l5 5L20 7"/></svg>);
    case "x": return (<svg {...p}><path d="M6 6l12 12M18 6l-12 12"/></svg>);
    case "alert": return (<svg {...p}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>);
    case "shield": return (<svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    case "globe": return (<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>);
    case "cube": return (<svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>);
    case "key": return (<svg {...p}><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9M16 7l3 3M14 9l3 3"/></svg>);
    case "database": return (<svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>);
    case "play": return (<svg {...p}><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/></svg>);
    case "pause": return (<svg {...p}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>);
    case "refresh": return (<svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>);
    case "edit": return (<svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>);
    case "chevron-right": return (<svg {...p}><path d="M9 6l6 6-6 6"/></svg>);
    case "chevron-down": return (<svg {...p}><path d="M6 9l6 6 6-6"/></svg>);
    case "arrow-up": return (<svg {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>);
    case "arrow-up-right": return (<svg {...p}><path d="M7 17L17 7M8 7h9v9"/></svg>);
    case "bell": return (<svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>);
    case "users": return (<svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>);
    case "terminal": return (<svg {...p}><path d="M4 17l6-6-6-6M12 19h8"/></svg>);
    case "logout": return (<svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>);
    default: return (<svg {...p}><circle cx="12" cy="12" r="9"/></svg>);
  }
}
