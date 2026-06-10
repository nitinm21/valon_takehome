"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";

import { fontStack } from "../lib/fonts";
import {
  DEFAULT_RUN_STYLE,
  runsText,
  runsToFragment,
  serializeDomToRuns,
  type RunStyle
} from "../lib/richText";
import { useEditor } from "../lib/store";
import type { SlideElement } from "../lib/types";
import { DataVizView } from "./DataVizViews";
import { ImageElementView } from "./ImageElementView";

// Insert plain text (incl. "\n") at the caret as a single text node so the DOM
// stays flat — no browser-inserted <div>/<br> for the runs serializer to miss.
// The new node inherits the caret's enclosing span style.
function insertTextAtCaret(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

const PLACEHOLDER = "Text";

function placeCaretAtEnd(node: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectAllText(node: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAtPoint(node: HTMLElement, x: number, y: number) {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };

  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  if (range) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } else {
    placeCaretAtEnd(node);
  }
}

// Renders one slide element as an absolutely-positioned DOM node in LOGICAL
// artboard coordinates; the parent <Artboard> applies the scale transform.
// Text is fully editable (Phase 2); image/shape are placeholders for Phases 3-4.
export function ElementView({ element }: { element: SlideElement }) {
  const isEditing = useEditor((state) => state.editingId === element.id);
  const select = useEditor((state) => state.select);
  const startEditing = useEditor((state) => state.startEditing);
  const commitRuns = useEditor((state) => state.commitRuns);
  const editRef = useRef<HTMLDivElement>(null);
  // Guards the one-time edit setup so React StrictMode's double-invoked mount
  // effect doesn't run it twice (the second pass would clobber the selection).
  const initedRef = useRef(false);

  // On entering edit mode, fill the contentEditable from state (so React does
  // not control its content while typing) and place the caret. A brand-new box
  // gets its default text selected; otherwise the caret goes to the end (a
  // double-click further overrides this with a caret at the click point).
  useLayoutEffect(() => {
    if (element.type !== "text") {
      return;
    }
    if (!isEditing) {
      initedRef.current = false;
      return;
    }
    if (initedRef.current) {
      return;
    }
    const node = editRef.current;
    if (!node) {
      return;
    }
    initedRef.current = true;
    // Rebuild the editable's DOM from runs (styled spans), so the browser owns it
    // while typing/formatting and React isn't controlling its content.
    node.replaceChildren(runsToFragment(element.runs));
    node.focus();

    const store = useEditor.getState();
    if (store.justAddedId === element.id) {
      // Brand-new box: highlight the default text so the first keystroke wipes it.
      selectAllText(node);
      store.clearJustAdded();
    } else {
      placeCaretAtEnd(node);
    }
    // Only re-run when edit mode toggles, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const frame: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z
  };

  if (element.type === "text") {
    const showPlaceholder = !isEditing && runsText(element.runs).trim() === "";
    // Base style for the box: drives the caret/placeholder and line height.
    // Per-run <span>s override size/color/weight/style on top of this.
    const base: RunStyle = element.runs[0] ?? DEFAULT_RUN_STYLE;

    const handleDoubleClick = (event: ReactMouseEvent) => {
      const { clientX, clientY } = event;
      startEditing(element.id);
      requestAnimationFrame(() => {
        const node = editRef.current;
        if (node) {
          placeCaretAtPoint(node, clientX, clientY);
        }
      });
    };

    const handleKeyDown = (event: ReactKeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Stop the event before it reaches the global keydown listener — the
        // blur below commits and clears editingId synchronously, so the window
        // handler would otherwise treat this same Escape as "deselect".
        event.stopPropagation();
        editRef.current?.blur();
      } else if (event.key === "Enter") {
        // Enter inserts a newline inside the box (Escape/click-out commits).
        // Use insertLineBreak rather than a raw "\n" text node: in a
        // white-space:pre-wrap box a trailing "\n" is invisible and the caret
        // doesn't move to the new line, so Enter felt like a no-op. insertLineBreak
        // also drops a browser-managed trailing break so the new line renders, and
        // it's consumed once the user types — the serializer still reads plain "\n".
        event.preventDefault();
        document.execCommand("insertLineBreak");
      }
    };

    // Paste as plain text so external markup never pollutes the runs; the text
    // adopts the caret's current style.
    const handlePaste = (event: ReactClipboardEvent) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      if (text) {
        insertTextAtCaret(text);
      }
    };

    const handleBlur = (event: ReactFocusEvent) => {
      // Focus moving into the toolbar (font-size / color inputs) must NOT commit
      // or leave edit mode — the toolbar reads & re-applies to this box.
      const next = event.relatedTarget as HTMLElement | null;
      if (next?.closest("[data-toolbar]")) {
        return;
      }
      const node = editRef.current;
      if (node) {
        commitRuns(element.id, serializeDomToRuns(node, base));
      }
    };

    return (
      <div
        // Remount on edit-mode toggle: while editing, the DOM is built
        // imperatively (replaceChildren) with React rendering null children, so
        // without a fresh node React would mount the runs-spans alongside the
        // leftover edited DOM on commit — duplicating the text. A distinct key
        // forces React to discard the editing node and mount a clean view node.
        key={isEditing ? "editing" : "view"}
        contentEditable={isEditing}
        data-el-id={element.id}
        onBlur={isEditing ? handleBlur : undefined}
        onDoubleClick={handleDoubleClick}
        onKeyDown={isEditing ? handleKeyDown : undefined}
        // Only select on mousedown when NOT editing — select() clears editingId,
        // so running it while editing would exit edit mode on every click and
        // prevent the browser from placing the caret where the user clicked.
        onMouseDown={isEditing ? undefined : () => select(element.id)}
        onPaste={isEditing ? handlePaste : undefined}
        ref={editRef}
        suppressContentEditableWarning
        style={{
          ...frame,
          color: showPlaceholder ? "#9aa1ab" : base.color,
          fontSize: base.fontSize,
          fontFamily: fontStack(base.fontFamily),
          fontWeight: base.bold ? 700 : 400,
          fontStyle: base.italic ? "italic" : "normal",
          textAlign: element.align,
          lineHeight: 1.2,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "visible",
          outline: "none",
          cursor: isEditing ? "text" : "default",
          userSelect: isEditing ? "text" : "none"
        }}
      >
        {isEditing
          ? null
          : showPlaceholder
            ? PLACEHOLDER
            : element.runs.map((run, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  style={{
                    fontSize: run.fontSize,
                    color: run.color,
                    fontFamily: fontStack(run.fontFamily),
                    fontWeight: run.bold ? 700 : 400,
                    fontStyle: run.italic ? "italic" : "normal"
                  }}
                >
                  {run.text}
                </span>
              ))}
      </div>
    );
  }

  if (element.type === "image") {
    return <ImageElementView element={element} />;
  }

  // Data-viz elements (kpi/chart/table): content is agent-authored via the deck
  // API; in the editor the box is selectable/movable/resizable like any element.
  if (element.type === "kpi" || element.type === "chart" || element.type === "table") {
    return (
      <div
        data-el-id={element.id}
        onMouseDown={() => select(element.id)}
        style={frame}
      >
        <DataVizView element={element} />
      </div>
    );
  }

  // shape — Phase 4
  return (
    <div
      data-el-id={element.id}
      onMouseDown={() => select(element.id)}
      style={{
        ...frame,
        background: element.fill,
        borderRadius: element.shape === "ellipse" ? "50%" : element.radius
      }}
    />
  );
}
