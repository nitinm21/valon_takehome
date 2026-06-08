"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Moveable from "react-moveable";

import { ARTBOARD_H, ARTBOARD_W, useEditor } from "../lib/store";
import { ElementView } from "./ElementView";
import { ImageToolbar } from "./ImageToolbar";
import { TextToolbar } from "./TextToolbar";

// Breathing room (screen px) kept around the slide inside the pane.
const PADDING = 48;

// The editor surface. The slide is a constant 1280x720 logical canvas scaled to
// fit the pane (§3.2). Moveable handles drag/resize; because a single target in
// a `transform: scale` container gets scale-adjusted deltas, we feed them
// straight into the store in logical units.
export function Artboard() {
  const paneRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const slide = useEditor((state) => state.currentSlide());
  const scale = useEditor((state) => state.scale);
  const setScale = useEditor((state) => state.setScale);
  const selectedId = useEditor((state) => state.selectedId);
  const editingId = useEditor((state) => state.editingId);
  const select = useEditor((state) => state.select);
  const moveBy = useEditor((state) => state.moveBy);
  const resizeTo = useEditor((state) => state.resizeTo);

  const [target, setTarget] = useState<HTMLElement | null>(null);
  // Element's top-left captured at resize start, so Moveable's cumulative
  // beforeTranslate maps to an absolute position.
  const resizeStart = useRef({ x: 0, y: 0 });

  // Scale-to-fit the pane.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const recompute = () => {
      const availW = pane.clientWidth - PADDING * 2;
      const availH = pane.clientHeight - PADDING * 2;
      setScale(Math.max(0.05, Math.min(availW / ARTBOARD_W, availH / ARTBOARD_H)));
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [setScale]);

  // Resolve the Moveable target node whenever selection changes (and never
  // while editing — handles are hidden so native text selection works, §5.2).
  useEffect(() => {
    if (!selectedId || editingId) {
      setTarget(null);
      return;
    }
    setTarget(
      paneRef.current?.querySelector<HTMLElement>(
        `[data-el-id="${CSS.escape(selectedId)}"]`
      ) ?? null
    );
  }, [selectedId, editingId, slide]);

  // Keep the control box aligned when the pane rescales or geometry changes.
  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [scale, slide]);

  const selectedElement = slide.elements.find((el) => el.id === selectedId);
  // Show the text toolbar whenever a text box is selected — including while
  // editing, so formatting can be applied to a highlighted range.
  const showToolbar = selectedElement?.type === "text" ? selectedElement : null;
  // Image toolbar (edit prompt + regenerate) only once a picture exists; an
  // empty image box uses its inline prompt instead.
  const showImageToolbar =
    selectedElement?.type === "image" && selectedElement.src
      ? selectedElement
      : null;

  const background =
    slide.background.type === "solid"
      ? slide.background.color
      : `linear-gradient(${slide.background.angle}deg, ${slide.background.from}, ${slide.background.to})`;

  // Deselect when the click lands on empty canvas — but not on an element, a
  // Moveable handle, or the toolbar.
  const handlePaneMouseDown = (event: ReactMouseEvent) => {
    const node = event.target as HTMLElement;
    if (
      node.closest("[data-el-id]") ||
      node.closest(".moveable-control-box") ||
      node.closest("[data-toolbar]")
    ) {
      return;
    }
    select(null);
  };

  return (
    <div className="stage-pane" onMouseDown={handlePaneMouseDown} ref={paneRef}>
      <div
        className="stage"
        style={{ width: ARTBOARD_W * scale, height: ARTBOARD_H * scale }}
      >
        <div
          className="artboard"
          style={{
            width: ARTBOARD_W,
            height: ARTBOARD_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background
          }}
        >
          {slide.elements.map((element) => (
            <ElementView element={element} key={element.id} />
          ))}
        </div>
      </div>

      {target && selectedId && (
        <Moveable
          // Let pointerdowns on inputs/textareas/contentEditable inside the box
          // focus & type natively instead of being swallowed by a drag gesture
          // (Moveable preventDefaults mousedown to start a drag, which otherwise
          // blocks the inline image prompt textarea from ever receiving focus).
          checkInput
          draggable
          horizontalGuidelines={[0, ARTBOARD_H / 2, ARTBOARD_H]}
          onDrag={({ delta }) => moveBy(selectedId, delta[0], delta[1])}
          onResizeStart={() => {
            const el = useEditor
              .getState()
              .currentSlide()
              .elements.find((item) => item.id === selectedId);
            if (el) {
              resizeStart.current = { x: el.x, y: el.y };
            }
          }}
          // Moveable's resize needs the size written to the DOM each frame to
          // advance; we mutate the node live (smooth, no React churn) and commit
          // the final box to the store on resize end.
          onResize={({ target, width, height, drag }) => {
            const el = target as HTMLElement;
            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
            el.style.left = `${resizeStart.current.x + drag.beforeTranslate[0]}px`;
            el.style.top = `${resizeStart.current.y + drag.beforeTranslate[1]}px`;
          }}
          onResizeEnd={({ lastEvent }) => {
            if (!lastEvent) {
              return;
            }
            const { width, height, drag } = lastEvent;
            resizeTo(selectedId, {
              w: width,
              h: height,
              x: resizeStart.current.x + drag.beforeTranslate[0],
              y: resizeStart.current.y + drag.beforeTranslate[1]
            });
          }}
          origin={false}
          ref={moveableRef}
          resizable
          snapThreshold={6}
          snappable
          target={target}
          throttleDrag={0}
          throttleResize={0}
          verticalGuidelines={[0, ARTBOARD_W / 2, ARTBOARD_W]}
        />
      )}

      {showToolbar && <TextToolbar element={showToolbar} paneRef={paneRef} />}
      {showImageToolbar && (
        <ImageToolbar element={showImageToolbar} paneRef={paneRef} />
      )}
    </div>
  );
}
