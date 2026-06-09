// Curated, Valon-internal deck themes — the "templates" users pick in the create
// flow to style a generated deck (background + fonts + colors). Each theme is just
// a ThemeSummary (the shape generation already consumes), so picking one swaps the
// hardcoded default-light look for a deliberate, on-brand one.
//
// Framework-free (no store/React imports) so it can be used anywhere. The gradient
// angle is kept as a literal to match GRADIENT_ANGLE without importing the store.

import { representativeColor, surfaceColorFor, type ThemeSummary } from "./theme";
import type { Background } from "./types";

const ANGLE = 135;
const TITLE_SIZE = 48;
const BODY_SIZE = 24;

export type DeckTheme = {
  id: string;
  name: string;
  useCase: string;
  summary: ThemeSummary;
};

const solid = (color: string): Background => ({ type: "solid", color });
const grad = (from: string, to: string): Background => ({
  type: "gradient",
  from,
  to,
  angle: ANGLE
});

function make(opts: {
  background: Background;
  titleColor: string;
  bodyColor: string;
  titleFont: string;
  bodyFont: string;
  accent: string;
}): ThemeSummary {
  return {
    background: opts.background,
    surfaceColor: surfaceColorFor(opts.background),
    palette: [
      representativeColor(opts.background),
      opts.titleColor,
      opts.bodyColor,
      opts.accent
    ],
    titleColor: opts.titleColor,
    bodyColor: opts.bodyColor,
    titleSize: TITLE_SIZE,
    bodySize: BODY_SIZE,
    titleBold: true,
    align: "left",
    titleFont: opts.titleFont,
    bodyFont: opts.bodyFont
  };
}

export const THEMES: DeckTheme[] = [
  {
    id: "deployment-review",
    name: "Deployment Review",
    useCase: "Client deployment updates",
    summary: make({
      background: solid("#FFFFFF"),
      titleColor: "#0F2740",
      bodyColor: "#5B6B82",
      titleFont: "montserrat",
      bodyFont: "inter",
      accent: "#2F6DF0"
    })
  },
  {
    id: "executive-update",
    name: "Executive Update",
    useCase: "Board / leadership reviews",
    summary: make({
      background: grad("#0B1B33", "#16315C"),
      titleColor: "#FFFFFF",
      bodyColor: "#AEC2DE",
      titleFont: "workSans",
      bodyFont: "inter",
      accent: "#5AA7EE"
    })
  },
  {
    id: "all-hands",
    name: "All-Hands",
    useCase: "Company town hall",
    summary: make({
      background: grad("#1FA4A0", "#34C06E"),
      titleColor: "#FFFFFF",
      bodyColor: "#EAFBF3",
      titleFont: "poppins",
      bodyFont: "poppins",
      accent: "#FFD25C"
    })
  },
  {
    id: "kickoff",
    name: "Kickoff",
    useCase: "Client / new-hire onboarding",
    summary: make({
      background: grad("#EAF2FF", "#DCE9FF"),
      titleColor: "#1B2A4A",
      bodyColor: "#5A6B8C",
      titleFont: "raleway",
      bodyFont: "workSans",
      accent: "#2F6DF0"
    })
  },
  {
    id: "product-demo",
    name: "Product Demo",
    useCase: "Engineering / product demos",
    summary: make({
      background: solid("#0E0F12"),
      titleColor: "#EDEFF2",
      bodyColor: "#9AA3AE",
      titleFont: "oswald",
      bodyFont: "inter",
      accent: "#2BE0C8"
    })
  },
  {
    id: "data-report",
    name: "Data Report",
    useCase: "Ops / analytics reporting",
    summary: make({
      background: solid("#EEF1F5"),
      titleColor: "#1A1D21",
      bodyColor: "#5C6470",
      titleFont: "roboto",
      bodyFont: "roboto",
      accent: "#2F6DF0"
    })
  },
  {
    id: "team-spotlight",
    name: "Team Spotlight",
    useCase: "Culture / people features",
    summary: make({
      background: solid("#F6EFE2"),
      titleColor: "#2B2A26",
      bodyColor: "#6E665A",
      titleFont: "playfair",
      bodyFont: "lora",
      accent: "#B58A3C"
    })
  },
  {
    id: "announcement",
    name: "Announcement",
    useCase: "Launches / company comms",
    summary: make({
      background: grad("#5B2EE0", "#B14AE0"),
      titleColor: "#FFFFFF",
      bodyColor: "#E9DCFB",
      titleFont: "montserrat",
      bodyFont: "inter",
      accent: "#FFD25C"
    })
  }
];

export const DEFAULT_THEME_ID = "deployment-review";

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function getTheme(id: string | null | undefined): DeckTheme {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_THEME_ID)!;
}
