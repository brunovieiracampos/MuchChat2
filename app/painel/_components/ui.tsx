"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export function Icon({ d, size = 16, color = "currentColor", width = 1.7, style }: { d: string; size?: number; color?: string; width?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", ...style }} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <span className="pn-dot" style={{ background: color, width: size, height: size }} />;
}

export function Badge({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`pn-badge${tone ? ` is-${tone}` : ""}`}>{children}</span>;
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled}
      className={`pn-toggle${on ? " is-on" : ""}`} onClick={onChange}>
      <span />
    </button>
  );
}

/* ---------- toast ---------- */

type ToastTone = "green" | "amber" | "red" | "violet";
const TONE: Record<ToastTone, string> = { green: "#2FA37A", amber: "#E0A526", red: "#E4544F", violet: "#7C3AED" };
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; tone: ToastTone; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, tone: ToastTone = "green") => {
    clearTimeout(timer.current);
    setToast({ text, tone, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite">
        {toast && (
          <div className="pn-toast" key={toast.key}>
            <Dot color={TONE[toast.tone]} />
            {toast.text}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- modal / drawer ---------- */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function ConfirmModal({ title, body, confirmLabel, tone = "primary", busy, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "warn" | "danger"; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  useEscape(onClose);
  const cls = tone === "warn" ? "is-warn-solid" : tone === "danger" ? "is-danger-solid" : "is-primary";
  return (
    <div className="pn-modal-wrap" onClick={onClose}>
      <div className="pn-modal" role="dialog" aria-modal="true" aria-labelledby="pn-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="pn-modal-title" id="pn-modal-title">{title}</div>
        <div className="pn-modal-body">{body}</div>
        <div className="pn-modal-actions">
          <button type="button" className="pn-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className={`pn-btn ${cls}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="pn-drawer-wrap" onClick={onClose}>
      <aside className="pn-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="pn-row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <div className="pn-card-title" style={{ fontSize: 15 }}>{title}</div>
          <button type="button" className="pn-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {subtitle && <div className="pn-small pn-muted" style={{ marginTop: 5, fontSize: 12.5 }}>{subtitle}</div>}
        {children}
      </aside>
    </div>
  );
}
