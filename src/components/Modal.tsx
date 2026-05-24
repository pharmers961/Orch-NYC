import React from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

// Shared accessible dialog shell: backdrop, role="dialog"/aria-modal, focus trap,
// focus restore, and Esc-to-close (handled by useFocusTrap).
export function Modal({
  onClose,
  ariaLabel,
  panelClassName,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  panelClassName: string;
  children: React.ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}
