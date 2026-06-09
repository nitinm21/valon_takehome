"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from "react";

import {
  DEFAULT_FONT_ID,
  FONTS,
  fontStack,
  fontVarToken,
  getFont
} from "../lib/fonts";
import {
  applyInlineStyleToSelection,
  clampFont,
  DEFAULT_RUN_STYLE,
  deriveStyleLabel,
  selectionColor,
  selectionFontFamily,
  selectionFontSize,
  serializeDomToRuns,
  stepFontSize,
  TEXT_STYLES,
  toHex,
  type TextStyleId
} from "../lib/richText";
import { useEditor } from "../lib/store";
import type { TextElement } from "../lib/types";

// Tristate: true (all), false (none), null (mixed selection / multiple values).
// fontFamily holds a font id (lib/fonts.ts), or null when the selection is mixed.
type Display = {
  fontSize: number | null;
  color: string;
  bold: boolean | null;
  italic: boolean | null;
  fontFamily: string | null;
};

const PREVIEW_SIZE: Record<TextStyleId, number> = {
  title: 19,
  headline: 16,
  subheadline: 15,
  normal: 14,
  small: 12
};

// Whole-box state, read from the element's runs (used when a box is selected but
// not being edited — formatting applies to the entire box).
function boxDisplay(element: TextElement): Display {
  const runs = element.runs;
  const sizes = new Set(runs.map((run) => run.fontSize));
  const colors = new Set(runs.map((run) => run.color));
  const fonts = new Set(runs.map((run) => run.fontFamily ?? DEFAULT_FONT_ID));
  const allBold = runs.length > 0 && runs.every((run) => run.bold);
  const anyBold = runs.some((run) => run.bold);
  const allItalic = runs.length > 0 && runs.every((run) => run.italic);
  const anyItalic = runs.some((run) => run.italic);
  return {
    fontSize: sizes.size === 1 ? [...sizes][0] : null,
    color: colors.size === 1 ? [...colors][0] : (runs[0]?.color ?? "#111111"),
    bold: allBold ? true : anyBold ? null : false,
    italic: allItalic ? true : anyItalic ? null : false,
    fontFamily: fonts.size === 1 ? [...fonts][0] : null
  };
}

// Live selection state while editing, read from the browser/DOM.
function editingDisplay(node: HTMLElement): Display {
  let bold = false;
  let italic = false;
  try {
    bold = document.queryCommandState("bold");
    italic = document.queryCommandState("italic");
  } catch {
    // queryCommandState can throw if the editable isn't focused — keep defaults.
  }
  return {
    fontSize: selectionFontSize(node),
    color: selectionColor(),
    bold,
    italic,
    fontFamily: selectionFontFamily(node)
  };
}

function Chevron({ dir = "down" }: { dir?: "up" | "down" }) {
  return (
    <svg aria-hidden height="10" viewBox="0 0 10 10" width="10">
      <path
        d={dir === "down" ? "M2 3.5 L5 6.5 L8 3.5" : "M2 6.5 L5 3.5 L8 6.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden className="tt-check" height="14" viewBox="0 0 14 14" width="14">
      <path
        d="M3 7.5 L6 10.5 L11 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AlignIcon({ dir }: { dir: "left" | "center" | "right" }) {
  const short = dir === "left" ? [2, 10] : dir === "right" ? [6, 14] : [4, 12];
  const rows: [number, number, number][] = [
    [2, 14, 2],
    [short[0], short[1], 5.5],
    [2, 14, 9],
    [short[0], short[1], 12.5]
  ];
  return (
    <svg aria-hidden height="15" viewBox="0 0 16 15" width="16">
      {rows.map(([x1, x2, y], i) => (
        <line
          key={i}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
        />
      ))}
    </svg>
  );
}

// Keep the contentEditable focused & its selection intact when a toolbar control
// is clicked (mousedown would otherwise blur it and collapse the selection).
const keepSelection = (event: { preventDefault: () => void }) => event.preventDefault();

// A floating contextual toolbar for the selected text box. Formatting applies to
// the highlighted characters while editing, or to the whole box when the box is
// merely selected. react-moveable is NOT involved — these are plain controls
// wired to the editor store + the box's contentEditable selection.
export function TextToolbar({
  element,
  paneRef
}: {
  element: TextElement;
  paneRef: RefObject<HTMLDivElement | null>;
}) {
  const isEditing = useEditor((state) => state.editingId === element.id);
  const formatBox = useEditor((state) => state.formatBox);
  const setAlign = useEditor((state) => state.setAlign);
  const syncRuns = useEditor((state) => state.syncRuns);
  const scale = useEditor((state) => state.scale);

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [display, setDisplay] = useState<Display>(() => boxDisplay(element));
  const [openMenu, setOpenMenu] = useState<"style" | "font" | "align" | null>(
    null
  );
  const [sizeDraft, setSizeDraft] = useState("");
  const sizeFocused = useRef(false);
  // Last non-collapsed selection inside the editable; restored before applying a
  // command from a control that steals focus (the size & color inputs).
  const savedRange = useRef<Range | null>(null);

  const getNode = useCallback(
    () =>
      paneRef.current?.querySelector<HTMLElement>(
        `[data-el-id="${CSS.escape(element.id)}"]`
      ) ?? null,
    [paneRef, element.id]
  );

  // Anchor the bar just above the box. Recompute when geometry, content (height),
  // scale, or edit mode change.
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
  }, [element.id, element.x, element.y, element.w, element.h, element.runs, scale, isEditing, paneRef]);

  // Whole-box display when not editing.
  useEffect(() => {
    if (!isEditing) {
      setDisplay(boxDisplay(element));
    }
  }, [isEditing, element]);

  // Track the live selection while editing: keep savedRange current and refresh
  // the toolbar's shown state as the caret/selection moves.
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const handler = () => {
      const node = getNode();
      if (!node) {
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (node.contains(range.commonAncestorContainer)) {
          savedRange.current = range.cloneRange();
        }
      }
      if (document.activeElement === node) {
        setDisplay(editingDisplay(node));
      }
    };
    document.addEventListener("selectionchange", handler);
    handler();
    return () => document.removeEventListener("selectionchange", handler);
  }, [isEditing, getNode]);

  // Reflect the current size in the input unless the user is mid-typing in it.
  useEffect(() => {
    if (!sizeFocused.current) {
      setSizeDraft(display.fontSize == null ? "" : String(display.fontSize));
    }
  }, [display.fontSize]);

  // Close an open menu on an outside click.
  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-toolbar]")) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  // Run an execCommand-style edit against the box's live selection, then persist
  // the result to the store (without leaving edit mode) and refresh the toolbar.
  const runInEditor = useCallback(
    (fn: () => void) => {
      const node = getNode();
      if (!node) {
        return;
      }
      node.focus();
      const selection = window.getSelection();
      if (savedRange.current && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange.current);
      }
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        // Older engines may reject the arg form — the commands below still work.
      }
      fn();
      if (selection && selection.rangeCount > 0) {
        savedRange.current = selection.getRangeAt(0).cloneRange();
      }
      syncRuns(element.id, serializeDomToRuns(node, element.runs[0] ?? DEFAULT_RUN_STYLE));
      setDisplay(editingDisplay(node));
    },
    [getNode, syncRuns, element.id, element.runs]
  );

  const applyBold = () => {
    if (isEditing) {
      runInEditor(() => document.execCommand("bold"));
    } else {
      formatBox(element.id, { bold: !(display.bold === true) });
    }
  };

  const applyItalic = () => {
    if (isEditing) {
      runInEditor(() => document.execCommand("italic"));
    } else {
      formatBox(element.id, { italic: !(display.italic === true) });
    }
  };

  const applyColor = (hex: string) => {
    if (isEditing) {
      runInEditor(() => document.execCommand("foreColor", false, hex));
    } else {
      formatBox(element.id, { color: hex });
    }
  };

  const applyFont = (fontId: string) => {
    if (isEditing) {
      runInEditor(() =>
        applyInlineStyleToSelection("font-family", fontVarToken(fontId))
      );
    } else {
      formatBox(element.id, { fontFamily: fontId });
    }
    setOpenMenu(null);
  };

  const applySize = (px: number) => {
    const size = clampFont(px);
    if (isEditing) {
      runInEditor(() => applyInlineStyleToSelection("font-size", `${size}px`));
    } else {
      formatBox(element.id, { fontSize: size });
    }
    setSizeDraft(String(size));
  };

  const applyPreset = (style: { fontSize: number; bold: boolean }) => {
    if (isEditing) {
      runInEditor(() => {
        applyInlineStyleToSelection("font-size", `${style.fontSize}px`);
        try {
          if (document.queryCommandState("bold") !== style.bold) {
            document.execCommand("bold");
          }
        } catch {
          // ignore — size still applied
        }
      });
    } else {
      formatBox(element.id, { fontSize: style.fontSize, bold: style.bold });
    }
    setOpenMenu(null);
  };

  const applyAlign = (align: TextElement["align"]) => {
    setAlign(element.id, align);
    setOpenMenu(null);
  };

  // Stepper arrows snap through the preset sizes; the input handles arbitrary
  // values.
  const step = (direction: 1 | -1) =>
    applySize(stepFontSize(display.fontSize ?? 48, direction));

  const commitSizeInput = () => {
    sizeFocused.current = false;
    const parsed = parseInt(sizeDraft, 10);
    if (Number.isNaN(parsed)) {
      setSizeDraft(display.fontSize == null ? "" : String(display.fontSize));
      return;
    }
    applySize(parsed);
  };

  if (!pos) {
    return null;
  }

  const styleLabel = deriveStyleLabel(display.fontSize, display.bold);
  const fontLabel = display.fontFamily ? getFont(display.fontFamily).label : "Mixed";

  return (
    <div className="text-toolbar" data-toolbar style={{ left: pos.left, top: pos.top }}>
      {/* Text styles */}
      <div className="tt-dd">
        <button
          className="tt-trigger"
          onClick={() => setOpenMenu((m) => (m === "style" ? null : "style"))}
          onMouseDown={keepSelection}
          type="button"
        >
          <span className="tt-trigger-label">{styleLabel}</span>
          <Chevron />
        </button>
        {openMenu === "style" && (
          <div className="tt-popover tt-style-popover" data-toolbar>
            {TEXT_STYLES.map((style) => (
              <button
                className="tt-item"
                key={style.id}
                onClick={() => applyPreset(style)}
                onMouseDown={keepSelection}
                type="button"
              >
                <span
                  className="tt-item-label"
                  style={{
                    fontSize: PREVIEW_SIZE[style.id],
                    fontWeight: style.bold ? 700 : 400
                  }}
                >
                  {style.label}
                </span>
                {styleLabel === style.label && <Check />}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="tt-divider" />

      {/* Font family */}
      <div className="tt-dd">
        <button
          className="tt-trigger tt-font-trigger"
          onClick={() => setOpenMenu((m) => (m === "font" ? null : "font"))}
          onMouseDown={keepSelection}
          title="Font"
          type="button"
        >
          <span className="tt-trigger-label">{fontLabel}</span>
          <Chevron />
        </button>
        {openMenu === "font" && (
          <div className="tt-popover tt-font-popover" data-toolbar>
            {FONTS.map((font) => (
              <button
                className="tt-item"
                key={font.id}
                onClick={() => applyFont(font.id)}
                onMouseDown={keepSelection}
                type="button"
              >
                <span
                  className="tt-item-label"
                  style={{ fontFamily: fontStack(font.id), fontSize: 15 }}
                >
                  {font.label}
                </span>
                {display.fontFamily === font.id && <Check />}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="tt-divider" />

      {/* Font size: input + steppers + dropdown */}
      <div className="tt-size">
        <input
          className="tt-size-input"
          onBlur={commitSizeInput}
          onChange={(event) => setSizeDraft(event.target.value)}
          onFocus={(event) => {
            sizeFocused.current = true;
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitSizeInput();
            }
          }}
          placeholder="–"
          value={sizeDraft}
        />
        <div className="tt-steppers">
          <button
            aria-label="Increase font size"
            className="tt-stepper"
            onClick={() => step(1)}
            onMouseDown={keepSelection}
            type="button"
          >
            <Chevron dir="up" />
          </button>
          <button
            aria-label="Decrease font size"
            className="tt-stepper"
            onClick={() => step(-1)}
            onMouseDown={keepSelection}
            type="button"
          >
            <Chevron dir="down" />
          </button>
        </div>
      </div>

      <span className="tt-divider" />

      {/* Text color — the "A" glyph with a colored underline; click opens the
          native picker (functionality unchanged, icon updated). */}
      <label className="tt-color" data-toolbar title="Text color">
        <span className="tt-color-glyph">A</span>
        <span className="tt-color-bar" style={{ background: display.color }} />
        <input
          className="tt-color-input"
          onChange={(event) => applyColor(event.target.value)}
          type="color"
          value={toHex(display.color)}
        />
      </label>

      <span className="tt-divider" />

      {/* Alignment (box-level) */}
      <div className="tt-dd">
        <button
          aria-label="Text alignment"
          className="tt-icon-btn"
          onClick={() => setOpenMenu((m) => (m === "align" ? null : "align"))}
          onMouseDown={keepSelection}
          type="button"
        >
          <AlignIcon dir={element.align} />
          <Chevron />
        </button>
        {openMenu === "align" && (
          <div className="tt-popover tt-align-popover" data-toolbar>
            {(["left", "center", "right"] as const).map((align) => (
              <button
                className="tt-item"
                key={align}
                onClick={() => applyAlign(align)}
                onMouseDown={keepSelection}
                type="button"
              >
                <AlignIcon dir={align} />
                <span className="tt-item-label">
                  {align[0].toUpperCase() + align.slice(1)}
                </span>
                {element.align === align && <Check />}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="tt-divider" />

      {/* Bold / Italic */}
      <button
        aria-label="Bold"
        aria-pressed={display.bold === true}
        className={`tt-icon-btn tt-bold ${display.bold === true ? "active" : ""}`}
        onClick={applyBold}
        onMouseDown={keepSelection}
        type="button"
      >
        B
      </button>
      <button
        aria-label="Italic"
        aria-pressed={display.italic === true}
        className={`tt-icon-btn tt-italic ${display.italic === true ? "active" : ""}`}
        onClick={applyItalic}
        onMouseDown={keepSelection}
        type="button"
      >
        I
      </button>
    </div>
  );
}
