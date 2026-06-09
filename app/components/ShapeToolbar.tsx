"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { useEditor } from "../lib/store";
import type { ShapeElement } from "../lib/types";
import { ColorPicker } from "./ColorPicker";

// A floating contextual toolbar for the selected shape element. It mirrors the
// text toolbar's anchoring (a pill just above the element) and lets the user
// recolor the shape's fill with the shared ColorPicker, opened in a popover.
export function ShapeToolbar({
  element,
  paneRef
}: {
  element: ShapeElement;
  paneRef: RefObject<HTMLDivElement | null>;
}) {
  const setShapeFill = useEditor((state) => state.setShapeFill);
  const scale = useEditor((state) => state.scale);

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);

  // Anchor the bar just above the shape. Recompute when geometry or scale change.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const node = pane.querySelector<HTMLElement>(
      `[data-el-id="${CSS.escape(element.id)}"]`
    );
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    setPos({
      left: Math.max(8, rect.left - paneRect.left),
      top: Math.max(8, rect.top - paneRect.top - 48)
    });
  }, [element.id, element.x, element.y, element.w, element.h, scale, paneRef]);

  // Close the picker popover on an outside click (anything not in a toolbar).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-toolbar]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!pos) {
    return null;
  }

  return (
    <div className="text-toolbar" data-toolbar style={{ left: pos.left, top: pos.top }}>
      <div className="tt-dd">
        <button
          className="tt-trigger st-fill-trigger"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span className="st-swatch" style={{ background: element.fill }} />
          <span className="tt-trigger-label">Fill</span>
        </button>
        {open && (
          <div className="tt-popover color-popover" data-toolbar>
            <ColorPicker
              onChange={(fill) => setShapeFill(element.id, fill)}
              value={element.fill}
            />
          </div>
        )}
      </div>
    </div>
  );
}
