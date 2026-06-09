"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { applyThemeToDeck } from "./applyTheme";
import { DEFAULT_RUN_STYLE, runsText, type RunStyle } from "./richText";
import type {
  Background,
  Deck,
  ImageElement,
  Slide,
  SlideElement,
  SlideSource,
  TextElement,
  TextRun
} from "./types";

// The fixed logical slide space. Every element's geometry is in these units; the
// artboard is scaled to fit the editor pane (see Artboard.tsx). A constant
// 1280x720 (16:9) means one coordinate set drives the editor, thumbnails, and
// the eventual .pptx export.
export const ARTBOARD_W = 1280;
export const ARTBOARD_H = 720;

// The id of the placeholder deck the store holds before a real deck is loaded
// from the library. It is never written to the deck library / localStorage.
export const SEED_DECK_ID = "seed-deck";
const MIN_W = 24;
const MIN_H = 24;

// Geometry defaults for a freshly added text box (IMPLEMENTATION_PLAN.md §5.4).
// Character styling now lives in `runs` (see DEFAULT_RUN_STYLE).
const NEW_TEXT = {
  w: 480,
  h: 96,
  align: "left" as const,
  rotation: 0
};

// A new box starts with this text pre-selected, so the first keystroke replaces
// it. If the box is committed while still holding this default (untouched), it is
// discarded like an empty box.
export const NEW_TEXT_DEFAULT = "Start typing...";

// Gradients are two-color with a single fixed diagonal angle — users pick colors,
// not the angle (kept deliberately simple).
export const GRADIENT_ANGLE = 135;
export const DEFAULT_GRADIENT = { from: "#6a8dff", to: "#c081ff" };

function uid(): string {
  return crypto.randomUUID();
}

// The seed deck uses STABLE ids (not crypto.randomUUID) so the server-rendered
// HTML and the first client render match — random ids at module load would
// differ per evaluation and trip React hydration. Runtime-created elements
// (addText) use uid() freely since they only ever exist on the client.
function initialDeck(): Deck {
  const slide: Slide = {
    id: "seed-slide",
    background: { type: "solid", color: "#ffffff" },
    elements: [
      {
        id: "seed-text",
        type: "text",
        x: 240,
        y: 300,
        w: 800,
        h: 110,
        rotation: 0,
        z: 1,
        align: "center",
        runs: [
          {
            text: "Double-click to edit",
            fontSize: 64,
            color: "#111111",
            bold: true,
            italic: false
          }
        ]
      }
    ]
  };
  return {
    id: SEED_DECK_ID,
    title: "Untitled deck",
    slides: [slide],
    selectedSlideId: slide.id
  };
}

// ---- immutable helpers (operate on the currently selected slide) ----------

function mapCurrentSlide(deck: Deck, fn: (slide: Slide) => Slide): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === deck.selectedSlideId ? fn(slide) : slide
    )
  };
}

function patchElement(
  deck: Deck,
  id: string,
  fn: (element: SlideElement) => SlideElement
): Deck {
  return mapCurrentSlide(deck, (slide) => ({
    ...slide,
    elements: slide.elements.map((element) =>
      element.id === id ? fn(element) : element
    )
  }));
}

function dropElement(deck: Deck, id: string): Deck {
  return mapCurrentSlide(deck, (slide) => ({
    ...slide,
    elements: slide.elements.filter((element) => element.id !== id)
  }));
}

// Like patchElement but searches EVERY slide, not just the selected one. Used for
// async image results: a generated slide can have several images filling in while
// the user has already navigated to another slide, so the patch must find the
// element wherever it lives (element ids are unique across the deck).
function patchElementAnywhere(
  deck: Deck,
  id: string,
  fn: (element: SlideElement) => SlideElement
): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === id ? fn(element) : element
      )
    }))
  };
}

// Deck (de)serialization, legacy migration, and image strip/merge helpers now
// live in deckStore.ts (the multi-deck persistence layer).

type EditorState = {
  deck: Deck;
  selectedId: string | null;
  editingId: string | null;
  // Id of a box just created via addText — its default text is selected on first
  // edit so typing replaces it. Transient; cleared once consumed.
  justAddedId: string | null;
  // On-screen scale of the logical artboard; updated by the Artboard's
  // ResizeObserver and read by pointer math so there is one source of truth.
  scale: number;

  setScale: (scale: number) => void;
  currentSlide: () => Slide;
  replaceDeck: (deck: Deck) => void;
  // Rename the open deck (persisted by the deck-library save subscription).
  setDeckTitle: (title: string) => void;

  select: (id: string | null) => void;
  startEditing: (id: string) => void;
  clearJustAdded: () => void;
  setBackground: (background: Background) => void;
  // Re-style EVERY slide to a curated theme (themes.ts) in place: rewrites
  // backgrounds, text colors/fonts, surface cards, and data-viz colors while
  // preserving geometry and text. Stamps the deck's themeId so the selector
  // reflects the active theme. See applyTheme.ts for the restyle pass.
  applyTheme: (themeId: string) => void;

  addSlide: () => void;
  // Insert a pre-built slide (e.g. AI-generated) and select it. Elements arrive
  // fully formed (ids, geometry, z) from the slide builder — same shape addText/
  // addImage produce — so they're immediately editable & movable.
  addGeneratedSlide: (slide: {
    background: Background;
    elements: SlideElement[];
    source?: SlideSource;
  }) => void;
  // Edit flow: replace the CURRENT slide's contents in place (same id, position,
  // and background) — used to iterate on a generated slide without adding a new one.
  editCurrentSlide: (update: {
    elements: SlideElement[];
    source?: SlideSource;
  }) => void;
  // Streaming deck fill: replace a slide's contents BY ID (not necessarily the
  // selected one) and clear its `pending` state. Called as each slide of an
  // AI-generated deck finishes, while the user may be on a different slide.
  replaceSlideContents: (
    id: string,
    update: {
      elements: SlideElement[];
      source?: SlideSource;
      background?: Background;
    }
  ) => void;
  deleteSlide: (id: string) => void;
  selectSlide: (id: string) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;

  addText: () => void;
  // Apply a character-style patch (size/color/bold/italic) to every run in a box
  // — used for whole-box formatting when a box is selected but not being edited.
  formatBox: (id: string, patch: Partial<RunStyle>) => void;
  setAlign: (id: string, align: TextElement["align"]) => void;
  // Recolor a shape element's fill — used by the shape toolbar.
  setShapeFill: (id: string, fill: string) => void;
  // Persist edited runs WITHOUT leaving edit mode (called after each in-editor
  // format op so the store stays in sync if editing ends without a blur).
  syncRuns: (id: string, runs: TextRun[]) => void;
  // Commit on blur: persist runs and leave edit mode; discard if empty.
  commitRuns: (id: string, runs: TextRun[]) => void;

  addImage: () => void;
  updateImage: (
    id: string,
    patch: Partial<Pick<ImageElement, "prompt" | "src" | "status">>
  ) => void;

  moveBy: (id: string, dx: number, dy: number) => void;
  resizeTo: (
    id: string,
    box: { x: number; y: number; w: number; h: number }
  ) => void;

  deleteSelected: () => void;
};

export const useEditor = create<EditorState>((set, get) => ({
  deck: initialDeck(),
  selectedId: null,
  editingId: null,
  justAddedId: null,
  scale: 1,

  setScale: (scale) => set({ scale }),

  currentSlide: () => {
    const { deck } = get();
    return (
      deck.slides.find((slide) => slide.id === deck.selectedSlideId) ?? deck.slides[0]
    );
  },

  replaceDeck: (deck) => set({ deck, selectedId: null, editingId: null }),

  setDeckTitle: (title) =>
    set((state) => ({ deck: { ...state.deck, title } })),

  // Single click selects; selecting always leaves edit mode (§5.2).
  select: (id) => set({ selectedId: id, editingId: null }),

  startEditing: (id) => set({ selectedId: id, editingId: id }),

  clearJustAdded: () => set({ justAddedId: null }),

  setBackground: (background) =>
    set((state) => ({
      deck: mapCurrentSlide(state.deck, (slide) => ({ ...slide, background }))
    })),

  applyTheme: (themeId) =>
    set((state) => ({ deck: applyThemeToDeck(state.deck, themeId) })),

  addSlide: () =>
    set((state) => {
      const slide: Slide = {
        id: uid(),
        background: { type: "solid", color: "#ffffff" },
        elements: []
      };
      return {
        deck: {
          ...state.deck,
          slides: [...state.deck.slides, slide],
          selectedSlideId: slide.id
        },
        selectedId: null,
        editingId: null
      };
    }),

  addGeneratedSlide: ({ background, elements, source }) =>
    set((state) => {
      const slide: Slide = { id: uid(), background, elements, source };
      return {
        deck: {
          ...state.deck,
          slides: [...state.deck.slides, slide],
          selectedSlideId: slide.id
        },
        selectedId: null,
        editingId: null
      };
    }),

  editCurrentSlide: ({ elements, source }) =>
    set((state) => ({
      // Keep the slide's id, position, and background; swap its contents + source.
      deck: mapCurrentSlide(state.deck, (slide) => ({
        ...slide,
        elements,
        source: source ?? slide.source
      })),
      // Old element ids are gone after the swap — clear any stale selection.
      selectedId: null,
      editingId: null
    })),

  replaceSlideContents: (id, { elements, source, background }) =>
    set((state) => ({
      deck: {
        ...state.deck,
        slides: state.deck.slides.map((slide) =>
          slide.id === id
            ? {
                ...slide,
                elements,
                source: source ?? slide.source,
                background: background ?? slide.background,
                // Content has arrived — drop the skeleton.
                pending: false,
                pendingTitle: undefined
              }
            : slide
        )
      }
    })),

  deleteSlide: (id) =>
    set((state) => {
      if (state.deck.slides.length <= 1) {
        return state;
      }
      const index = state.deck.slides.findIndex((slide) => slide.id === id);
      const slides = state.deck.slides.filter((slide) => slide.id !== id);
      const selectedSlideId =
        state.deck.selectedSlideId === id
          ? slides[Math.min(index, slides.length - 1)].id
          : state.deck.selectedSlideId;
      return {
        deck: { ...state.deck, slides, selectedSlideId },
        selectedId: null,
        editingId: null
      };
    }),

  selectSlide: (id) =>
    set((state) => ({
      deck: { ...state.deck, selectedSlideId: id },
      selectedId: null,
      editingId: null
    })),

  reorderSlides: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.deck.slides.length ||
        toIndex >= state.deck.slides.length
      ) {
        return state;
      }
      const slides = [...state.deck.slides];
      const [moved] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, moved);
      return { deck: { ...state.deck, slides } };
    }),

  addText: () =>
    set((state) => {
      const slide = state.currentSlide();
      const topZ = slide.elements.reduce((max, el) => Math.max(max, el.z), 0);
      const element: TextElement = {
        id: uid(),
        type: "text",
        runs: [{ text: NEW_TEXT_DEFAULT, ...DEFAULT_RUN_STYLE }],
        x: (ARTBOARD_W - NEW_TEXT.w) / 2,
        y: (ARTBOARD_H - NEW_TEXT.h) / 2,
        z: topZ + 1,
        ...NEW_TEXT
      };
      const deck = mapCurrentSlide(state.deck, (s) => ({
        ...s,
        elements: [...s.elements, element]
      }));
      // New box: auto-selected, in edit mode, with its default text selected (§5.1).
      return {
        deck,
        selectedId: element.id,
        editingId: element.id,
        justAddedId: element.id
      };
    }),

  formatBox: (id, patch) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) =>
        el.type === "text"
          ? { ...el, runs: el.runs.map((run) => ({ ...run, ...patch })) }
          : el
      )
    })),

  setAlign: (id, align) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) =>
        el.type === "text" ? { ...el, align } : el
      )
    })),

  setShapeFill: (id, fill) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) =>
        el.type === "shape" ? { ...el, fill } : el
      )
    })),

  syncRuns: (id, runs) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) =>
        el.type === "text" ? { ...el, runs: runs.length ? runs : el.runs } : el
      )
    })),

  // Discard-on-empty (§5.1): a box with no real text — or one still holding the
  // untouched default placeholder — is removed when committed.
  commitRuns: (id, runs) =>
    set((state) => {
      const plain = runsText(runs).trim();
      if (plain === "" || plain === NEW_TEXT_DEFAULT) {
        return {
          deck: dropElement(state.deck, id),
          selectedId: state.selectedId === id ? null : state.selectedId,
          editingId: null
        };
      }
      const clean = runs.filter((run) => run.text.length > 0);
      return {
        deck: patchElement(state.deck, id, (el) =>
          el.type === "text"
            ? { ...el, runs: clean.length ? clean : el.runs }
            : el
        ),
        editingId: null
      };
    }),

  addImage: () =>
    set((state) => {
      const slide = state.currentSlide();
      const topZ = slide.elements.reduce((max, el) => Math.max(max, el.z), 0);
      const w = 480;
      const h = 360;
      const element: ImageElement = {
        id: uid(),
        type: "image",
        prompt: "",
        status: "idle",
        x: (ARTBOARD_W - w) / 2,
        y: (ARTBOARD_H - h) / 2,
        w,
        h,
        rotation: 0,
        z: topZ + 1
      };
      const deck = mapCurrentSlide(state.deck, (s) => ({
        ...s,
        elements: [...s.elements, element]
      }));
      return { deck, selectedId: element.id, editingId: null };
    }),

  updateImage: (id, patch) =>
    set((state) => ({
      deck: patchElementAnywhere(state.deck, id, (el) =>
        el.type === "image" ? { ...el, ...patch } : el
      )
    })),

  moveBy: (id, dx, dy) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) => ({
        ...el,
        x: el.x + dx,
        y: el.y + dy
      }))
    })),

  // Absolute set from Moveable's reported width/height + translate (computed
  // against a start anchor), which avoids the delta double-apply on resize.
  resizeTo: (id, box) =>
    set((state) => ({
      deck: patchElement(state.deck, id, (el) => ({
        ...el,
        w: Math.max(MIN_W, box.w),
        h: Math.max(MIN_H, box.h),
        x: box.x,
        y: box.y
      }))
    })),

  deleteSelected: () =>
    set((state) => {
      if (!state.selectedId) {
        return state;
      }
      return {
        deck: dropElement(state.deck, state.selectedId),
        selectedId: null,
        editingId: null
      };
    })
}));

// ---- hooks: global keyboard -----------------------------------------------
// Deck persistence (multi-deck library) lives in deckStore.ts: usePersistDecks
// (global save subscription, mounted in the root layout) and useLoadDeck (load a
// specific deck by id into the store).

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

// Global shortcuts that only apply to a selected, non-editing element (§5.2).
export function useEditorKeyboard() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { selectedId, editingId, startEditing, deleteSelected, select } =
        useEditor.getState();

      if (editingId || !selectedId || isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        startEditing(selectedId);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        select(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
