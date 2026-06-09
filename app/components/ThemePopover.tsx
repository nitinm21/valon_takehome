"use client";

import { useEffect } from "react";

import { useEditor } from "../lib/store";
import { DEFAULT_THEME_ID } from "../lib/themes";
import { ThemePicker } from "./ThemePicker";

// The in-editor theme selector. Opens from the topbar "Theme" button and shows
// the same gallery as the create flow; picking one restyles every slide in place
// (see store.applyTheme) and closes. Escape dismisses without changing anything.
export function ThemePopover({ onClose }: { onClose: () => void }) {
  const themeId = useEditor((state) => state.deck.themeId ?? DEFAULT_THEME_ID);
  const applyTheme = useEditor((state) => state.applyTheme);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="theme-popover" data-toolbar role="dialog" aria-label="Deck theme">
      <div className="gen-popover-head">
        <span>Theme</span>
        <button
          aria-label="Close"
          className="gen-popover-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <p className="theme-popover-hint">Applies to every slide in this deck.</p>
      <ThemePicker
        selectedId={themeId}
        onSelect={(id) => {
          applyTheme(id);
          onClose();
        }}
      />
    </div>
  );
}
