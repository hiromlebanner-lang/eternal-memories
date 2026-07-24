import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "compact" | "wide";
  footer?: ReactNode;
}

export function Modal({
  title,
  children,
  onClose,
  size = "compact",
  footer,
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-sheet modal-sheet--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="閉じる">
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
