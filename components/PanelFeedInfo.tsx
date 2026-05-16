"use client";

import { useCallback, useEffect, useId, useState } from "react";

export function PanelFeedInfo() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="panel-info-btn"
        onClick={() => setOpen(true)}
        aria-label="About contributing to the OUROBOROS burn"
      >
        <InfoIcon />
      </button>

      {open ? <PanelModal titleId={titleId} onClose={close} /> : null}
    </>
  );
}

function InfoIcon() {
  return (
    <svg
      className="panel-info-btn__icon"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        fill="currentColor"
        d="M12 10.25a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Zm-.15 1.1c-.55 0-1 .35-1 .9v4.5c0 .55.45.9 1 .9s1-.35 1-.9v-4.5c0-.55-.45-.9-1-.9Z"
      />
    </svg>
  );
}

function PanelModal(props: { titleId: string; onClose: () => void }) {
  const { titleId, onClose } = props;
  return (
    <div
      className="panel-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="panel-modal__head">
          <h3 id={titleId} className="panel-modal__title">
            optional contribution
          </h3>
          <button
            type="button"
            className="panel-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="panel-modal__body">
          Using the incinerator below is{" "}
          <strong>entirely optional</strong>. Anyone who wants to help shrink
          circulating OUROBOROS supply can connect a wallet, burn dust tokens or
          close empty accounts, route reclaimed SOL into OURO via Jupiter, and
          SPL-burn the OURO that lands in their wallet.
        </p>
        <p className="panel-modal__body">
          You approve every transaction yourself. There is no obligation to
          participate — only feed the cycle if you choose to.
        </p>
      </div>
    </div>
  );
}
