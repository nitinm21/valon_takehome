// Shared font registry — the single source of truth for the editor's selectable
// fonts. Framework-free (no React/next imports) so the client editor, the
// rich-text serializer, AND the server-side .pptx export route can all import it.
//
// A run never stores raw CSS — it stores a stable `id` (e.g. "lora"). We resolve
// that id to:
//   - a `var(--font-x)` token for the contentEditable DOM. The bare var token
//     round-trips cleanly through inline styles (the browser preserves it
//     verbatim), so the serializer can reverse-map it back to an id exactly.
//   - a full `var(--font-x), <fallback>` stack for the React-rendered view.
//   - a real family name ("Lora") for the export (PowerPoint substitutes if the
//     viewer doesn't have it installed — standard .pptx behavior).

export type FontDef = {
  id: string; // stable key stored on a run's `fontFamily`
  label: string; // shown in the toolbar (in the font's own face)
  cssVar: string; // the next/font CSS variable, e.g. "--font-inter"
  exportName: string; // real family name used for the .pptx export
  fallback: string; // generic family appended in the rendered stack
};

// Exactly ten: seven sans-serif, three serif. Order = toolbar order.
export const FONTS: FontDef[] = [
  {
    id: "inter",
    label: "Inter",
    cssVar: "--font-inter",
    exportName: "Inter",
    fallback: "sans-serif"
  },
  {
    id: "roboto",
    label: "Roboto",
    cssVar: "--font-roboto",
    exportName: "Roboto",
    fallback: "sans-serif"
  },
  {
    id: "montserrat",
    label: "Montserrat",
    cssVar: "--font-montserrat",
    exportName: "Montserrat",
    fallback: "sans-serif"
  },
  {
    id: "poppins",
    label: "Poppins",
    cssVar: "--font-poppins",
    exportName: "Poppins",
    fallback: "sans-serif"
  },
  {
    id: "raleway",
    label: "Raleway",
    cssVar: "--font-raleway",
    exportName: "Raleway",
    fallback: "sans-serif"
  },
  {
    id: "workSans",
    label: "Work Sans",
    cssVar: "--font-work-sans",
    exportName: "Work Sans",
    fallback: "sans-serif"
  },
  {
    id: "oswald",
    label: "Oswald",
    cssVar: "--font-oswald",
    exportName: "Oswald",
    fallback: "sans-serif"
  },
  {
    id: "playfair",
    label: "Playfair Display",
    cssVar: "--font-playfair",
    exportName: "Playfair Display",
    fallback: "serif"
  },
  {
    id: "lora",
    label: "Lora",
    cssVar: "--font-lora",
    exportName: "Lora",
    fallback: "serif"
  },
  {
    id: "merriweather",
    label: "Merriweather",
    cssVar: "--font-merriweather",
    exportName: "Merriweather",
    fallback: "serif"
  }
];

export const DEFAULT_FONT_ID = "inter";

const BY_ID = new Map(FONTS.map((font) => [font.id, font]));

// Resolve an id to its definition, falling back to the default for unknown/absent
// ids (legacy decks saved before fonts existed have no `fontFamily`).
export function getFont(id: string | null | undefined): FontDef {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

// Bare `var(--font-x)` for the editing DOM — no fallback, so reverse-matching the
// inline value stays exact.
export function fontVarToken(id: string | null | undefined): string {
  return `var(${getFont(id).cssVar})`;
}

// Full stack (var + generic fallback) for the React-rendered view.
export function fontStack(id: string | null | undefined): string {
  const font = getFont(id);
  return `var(${font.cssVar}), ${font.fallback}`;
}

// Reverse-map an inline `font-family` value (e.g. "var(--font-lora)") back to a
// font id. Returns null if it doesn't reference one of our registered fonts.
export function fontIdFromCss(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/--font-[a-z-]+/i);
  if (!match) {
    return null;
  }
  const found = FONTS.find((font) => font.cssVar === match[0]);
  return found ? found.id : null;
}

// Real family name for the .pptx export.
export function exportFontName(id: string | null | undefined): string {
  return getFont(id).exportName;
}
