// Semantic deck authoring — the agent-facing write path.
//
// Agents author slides at SEMANTIC altitude: a template id + per-slot content
// (text, KPI data, chart series...). They never place coordinates — buildSlide()
// owns geometry deterministically, so an agent-authored deck always lands inside
// the 1280x720 artboard, on-theme, with no overlap. Raw element patching exists
// as an escape hatch in the PATCH route, but this is the intended altitude.
//
// Validation collects EVERY problem and writes error messages for an LLM reader:
// each one names the offending path, what was expected, and the allowed values,
// so an agent can fix its payload in a single retry.

import {
  buildSlide,
  TEMPLATE_IDS,
  TEMPLATES,
  type ChartContent,
  type KpiContent,
  type SlideContent,
  type SlotContent,
  type TableContent
} from "../layouts";
import { getTheme, THEMES } from "../themes";
import type { ThemeSummary } from "../theme";
import type { Citation, Deck, Slide } from "../types";

// Per-slot copy budgets (chars) — mirrors the generate-slide route so agent
// payloads obey the same fit rules as LLM output.
const LIMITS = {
  title: 120,
  body: 700,
  boxHeading: 40,
  boxText: 200,
  prompt: 400,
  kpiLabel: 48,
  kpiValue: 18,
  kpiDelta: 28,
  chartLabels: 12,
  chartSeries: 4,
  tableColumns: 6,
  tableRows: 10,
  tableCell: 80,
  slides: 20
};

export type AuthoredSlide = {
  template: string;
  slots: SlideContent;
  citations?: Citation[];
  notes?: string;
};

export type AuthorDeckRequest = {
  title: string;
  themeId?: string;
  customer?: string;
  id?: string;
  slides: AuthoredSlide[];
};

export type AuthorResult =
  | { ok: true; deck: Deck }
  | { ok: false; errors: string[] };

export type SlideResult =
  | { ok: true; slide: Slide }
  | { ok: false; errors: string[] };

const THEME_IDS = THEMES.map((theme) => theme.id);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkLen(
  errors: string[],
  path: string,
  value: string,
  max: number
): void {
  if (value.trim().length > max) {
    errors.push(
      `${path} is ${value.trim().length} chars; keep it under ${max} so it fits its slot (it will be clamped otherwise). Tighten the copy or split across slides.`
    );
  }
}

// ---- per-slot validators ----------------------------------------------------

function validateKpi(errors: string[], path: string, raw: unknown): KpiContent | null {
  if (!isRecord(raw)) {
    errors.push(
      `${path} must be an object like {"label": "ACH timeout rate", "value": "0.8%", "delta": "-40% WoW", "trend": "down", "good": true}.`
    );
    return null;
  }
  let ok = true;
  if (!isNonEmptyString(raw.label)) {
    errors.push(`${path}.label is required (short metric name, e.g. "Escrow accuracy").`);
    ok = false;
  } else {
    checkLen(errors, `${path}.label`, raw.label, LIMITS.kpiLabel);
  }
  if (!isNonEmptyString(raw.value)) {
    errors.push(`${path}.value is required (the headline figure as a string, e.g. "99.2%").`);
    ok = false;
  } else {
    checkLen(errors, `${path}.value`, raw.value, LIMITS.kpiValue);
  }
  if (raw.delta !== undefined && !isNonEmptyString(raw.delta)) {
    errors.push(`${path}.delta must be a string like "+12% WoW" when provided.`);
    ok = false;
  } else if (typeof raw.delta === "string") {
    checkLen(errors, `${path}.delta`, raw.delta, LIMITS.kpiDelta);
  }
  if (
    raw.trend !== undefined &&
    raw.trend !== "up" &&
    raw.trend !== "down" &&
    raw.trend !== "flat"
  ) {
    errors.push(`${path}.trend must be "up", "down" or "flat" when provided.`);
    ok = false;
  }
  if (raw.good !== undefined && typeof raw.good !== "boolean") {
    errors.push(
      `${path}.good must be a boolean: true when the trend is favorable (renders green), false when it needs attention (renders red).`
    );
    ok = false;
  }
  if (!ok) {
    return null;
  }
  return {
    label: (raw.label as string).trim(),
    value: (raw.value as string).trim(),
    delta: typeof raw.delta === "string" ? raw.delta.trim() : undefined,
    trend: raw.trend as KpiContent["trend"],
    good: raw.good as boolean | undefined
  };
}

function validateChart(
  errors: string[],
  path: string,
  raw: unknown
): ChartContent | null {
  if (!isRecord(raw)) {
    errors.push(
      `${path} must be an object like {"chartType": "line", "labels": ["W19","W20","W21"], "series": [{"name": "Tickets", "values": [42, 31, 18]}]}.`
    );
    return null;
  }
  const before = errors.length;
  if (raw.chartType !== "bar" && raw.chartType !== "line") {
    errors.push(`${path}.chartType must be "bar" or "line".`);
  }
  const labels = Array.isArray(raw.labels)
    ? raw.labels.filter(isNonEmptyString).map((label) => label.trim())
    : null;
  if (!labels || labels.length === 0) {
    errors.push(`${path}.labels must be a non-empty array of x-axis label strings.`);
  } else if (labels.length > LIMITS.chartLabels) {
    errors.push(
      `${path}.labels has ${labels.length} entries; keep it to ${LIMITS.chartLabels} or fewer so labels stay readable. Aggregate older periods.`
    );
  }
  const seriesRaw = Array.isArray(raw.series) ? raw.series : null;
  if (!seriesRaw || seriesRaw.length === 0) {
    errors.push(
      `${path}.series must be a non-empty array of {name?, values: number[]}.`
    );
  } else if (seriesRaw.length > LIMITS.chartSeries) {
    errors.push(
      `${path}.series has ${seriesRaw.length} series; keep it to ${LIMITS.chartSeries} or fewer.`
    );
  }
  const series: ChartContent["series"] = [];
  if (labels && seriesRaw) {
    seriesRaw.forEach((entry, index) => {
      if (!isRecord(entry) || !Array.isArray(entry.values)) {
        errors.push(`${path}.series[${index}] must be {name?, values: number[]}.`);
        return;
      }
      const values = entry.values;
      if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
        errors.push(
          `${path}.series[${index}].values must contain only finite numbers (no strings or nulls).`
        );
        return;
      }
      if (values.length !== labels.length) {
        errors.push(
          `${path}.series[${index}].values has ${values.length} numbers but labels has ${labels.length} — they must match one-to-one.`
        );
        return;
      }
      series.push({
        name: isNonEmptyString(entry.name) ? entry.name.trim() : undefined,
        values
      });
    });
  }
  if (errors.length > before) {
    return null;
  }
  return {
    chartType: raw.chartType as "bar" | "line",
    labels: labels as string[],
    series,
    yLabel: isNonEmptyString(raw.yLabel) ? raw.yLabel.trim() : undefined
  };
}

function validateTable(
  errors: string[],
  path: string,
  raw: unknown
): TableContent | null {
  if (!isRecord(raw)) {
    errors.push(
      `${path} must be an object like {"columns": ["Milestone", "Status", "ETA"], "rows": [["Escrow migration", "80%", "W24"]]}.`
    );
    return null;
  }
  const before = errors.length;
  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter(isNonEmptyString).map((c) => c.trim())
    : null;
  if (!columns || columns.length === 0) {
    errors.push(`${path}.columns must be a non-empty array of header strings.`);
  } else if (columns.length > LIMITS.tableColumns) {
    errors.push(
      `${path}.columns has ${columns.length} columns; keep it to ${LIMITS.tableColumns} or fewer so the table stays readable.`
    );
  }
  const rows = Array.isArray(raw.rows) ? raw.rows : null;
  if (!rows || rows.length === 0) {
    errors.push(`${path}.rows must be a non-empty array of string arrays.`);
  } else if (rows.length > LIMITS.tableRows) {
    errors.push(
      `${path}.rows has ${rows.length} rows; keep it to ${LIMITS.tableRows} or fewer — move the rest to another slide or aggregate.`
    );
  }
  const cleanRows: string[][] = [];
  if (columns && rows) {
    rows.forEach((row, index) => {
      if (!Array.isArray(row) || !row.every((cell) => typeof cell === "string")) {
        errors.push(`${path}.rows[${index}] must be an array of strings.`);
        return;
      }
      if (row.length !== columns.length) {
        errors.push(
          `${path}.rows[${index}] has ${row.length} cells but there are ${columns.length} columns — they must match.`
        );
        return;
      }
      row.forEach((cell, cellIndex) =>
        checkLen(errors, `${path}.rows[${index}][${cellIndex}]`, cell, LIMITS.tableCell)
      );
      cleanRows.push(row.map((cell) => cell.trim()));
    });
  }
  if (errors.length > before) {
    return null;
  }
  return { columns: columns as string[], rows: cleanRows };
}

function validateCitations(
  errors: string[],
  path: string,
  raw: unknown
): Citation[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    errors.push(
      `${path} must be an array of {"artifact": "usage_telemetry.csv", "lines": "12-18", "quote": "...", "note": "why this backs the slide"}.`
    );
    return undefined;
  }
  const out: Citation[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || !isNonEmptyString(entry.artifact)) {
      errors.push(
        `${path}[${index}].artifact is required — the bundle file the claim comes from, e.g. "integration_log.txt".`
      );
      return;
    }
    out.push({
      artifact: entry.artifact.trim(),
      lines: isNonEmptyString(entry.lines) ? entry.lines.trim() : undefined,
      quote: isNonEmptyString(entry.quote) ? entry.quote.trim() : undefined,
      note: isNonEmptyString(entry.note) ? entry.note.trim() : undefined
    });
  });
  return out;
}

// ---- slide validation ---------------------------------------------------------

function describeSlot(name: string, role: string): string {
  switch (role) {
    case "kpi":
      return `"${name}": {"kpi": {label, value, delta?, trend?, good?}}`;
    case "chart":
      return `"${name}": {"chart": {chartType, labels, series, yLabel?}}`;
    case "table":
      return `"${name}": {"table": {columns, rows}}`;
    case "box":
      return `"${name}": {"heading": "...", "text": "..."}`;
    case "image":
      return `"${name}": {"prompt": "image description"}`;
    default:
      return `"${name}": {"text": "..."}`;
  }
}

function templateHelp(templateId: string): string {
  const template = TEMPLATES[templateId];
  const slots = Object.entries(template.slots)
    .map(([name, slot]) => describeSlot(name, slot.role))
    .join(", ");
  return `Template "${templateId}" slots: ${slots}.`;
}

/**
 * Validate one authored slide and build it into a real Slide (geometry applied,
 * theme colors picked). Returns all problems found, never just the first.
 */
export function authorSlide(
  input: unknown,
  theme: ThemeSummary,
  path = "slide"
): SlideResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        `${path} must be an object: {"template": "...", "slots": {...}, "citations": [...], "notes": "..."}.`
      ]
    };
  }

  const templateId = input.template;
  if (!isNonEmptyString(templateId) || !TEMPLATES[templateId]) {
    return {
      ok: false,
      errors: [
        `${path}.template "${String(templateId)}" is not a template. Available: ${TEMPLATE_IDS.join(", ")}. Use "cover" only for slide 1; use "kpis"/"chart"/"table" for data from the customer bundle.`
      ]
    };
  }
  const template = TEMPLATES[templateId];

  if (!isRecord(input.slots)) {
    return { ok: false, errors: [`${path}.slots must be an object. ${templateHelp(templateId)}`] };
  }

  const slots: SlideContent = {};
  for (const [name, rawValue] of Object.entries(input.slots)) {
    const slot = template.slots[name];
    const slotPath = `${path}.slots.${name}`;
    if (!slot) {
      errors.push(
        `${slotPath} is not a slot of template "${templateId}". ${templateHelp(templateId)}`
      );
      continue;
    }
    if (!isRecord(rawValue)) {
      errors.push(`${slotPath} must be an object. ${templateHelp(templateId)}`);
      continue;
    }
    const value: SlotContent = {};
    if (slot.role === "kpi") {
      const kpi = validateKpi(errors, `${slotPath}.kpi`, rawValue.kpi);
      if (kpi) {
        value.kpi = kpi;
      }
    } else if (slot.role === "chart") {
      const chart = validateChart(errors, `${slotPath}.chart`, rawValue.chart);
      if (chart) {
        value.chart = chart;
      }
    } else if (slot.role === "table") {
      const table = validateTable(errors, `${slotPath}.table`, rawValue.table);
      if (table) {
        value.table = table;
      }
    } else if (slot.role === "box") {
      const heading = isNonEmptyString(rawValue.heading) ? rawValue.heading.trim() : "";
      const text = isNonEmptyString(rawValue.text) ? rawValue.text.trim() : "";
      if (!heading && !text) {
        errors.push(`${slotPath} needs "heading" and/or "text".`);
        continue;
      }
      checkLen(errors, `${slotPath}.heading`, heading, LIMITS.boxHeading);
      checkLen(errors, `${slotPath}.text`, text, LIMITS.boxText);
      value.heading = heading || undefined;
      value.text = text || undefined;
    } else if (slot.type === "image") {
      if (!isNonEmptyString(rawValue.prompt)) {
        errors.push(
          `${slotPath}.prompt is required — describe a picture only (no text/words/UI in the image).`
        );
        continue;
      }
      checkLen(errors, `${slotPath}.prompt`, rawValue.prompt, LIMITS.prompt);
      value.prompt = rawValue.prompt.trim();
    } else {
      if (!isNonEmptyString(rawValue.text)) {
        errors.push(`${slotPath}.text is required (a string).`);
        continue;
      }
      const max = slot.role === "title" ? LIMITS.title : LIMITS.body;
      checkLen(errors, `${slotPath}.text`, rawValue.text, max);
      value.text = rawValue.text.trim();
    }
    if (Object.keys(value).length > 0) {
      slots[name] = value;
    }
  }

  if (Object.keys(slots).length === 0) {
    errors.push(`${path}.slots is empty — fill at least one slot. ${templateHelp(templateId)}`);
  }

  const citations = validateCitations(errors, `${path}.citations`, input.citations);
  if (input.notes !== undefined && typeof input.notes !== "string") {
    errors.push(`${path}.notes must be a string (speaker notes for the presenter).`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const built = buildSlide(templateId, slots, theme);
  const slide: Slide = {
    id: crypto.randomUUID(),
    background: built.background,
    elements: built.elements,
    source: { templateId, style: templateId, slots },
    citations,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : undefined
  };
  return { ok: true, slide };
}

// ---- deck validation ------------------------------------------------------------

/** Validate + build a whole semantic deck request into a persistable Deck. */
export function authorDeck(body: unknown): AuthorResult {
  const errors: string[] = [];
  if (!isRecord(body)) {
    return {
      ok: false,
      errors: [
        `Request body must be JSON: {"title": "...", "themeId": "...", "customer": "...", "slides": [{"template": "...", "slots": {...}}]}.`
      ]
    };
  }

  if (!isNonEmptyString(body.title)) {
    errors.push(`"title" is required (the deck title shown in the library).`);
  }
  if (body.themeId !== undefined && !THEME_IDS.includes(String(body.themeId))) {
    errors.push(
      `"themeId" "${String(body.themeId)}" is unknown. Available themes: ${THEME_IDS.join(", ")}. For weekly client reviews use "deployment-review".`
    );
  }
  if (body.customer !== undefined && !isNonEmptyString(body.customer)) {
    errors.push(`"customer" must be a string customer id, e.g. "cascade-fcu".`);
  }

  const slidesRaw = Array.isArray(body.slides) ? body.slides : null;
  if (!slidesRaw || slidesRaw.length === 0) {
    errors.push(`"slides" must be a non-empty array of {template, slots, citations?, notes?}.`);
  } else if (slidesRaw.length > LIMITS.slides) {
    errors.push(
      `"slides" has ${slidesRaw.length} slides; keep decks to ${LIMITS.slides} or fewer.`
    );
  }

  const theme = getTheme(typeof body.themeId === "string" ? body.themeId : undefined).summary;
  const slides: Slide[] = [];
  if (slidesRaw) {
    slidesRaw.forEach((raw, index) => {
      const result = authorSlide(raw, theme, `slides[${index}] (slide ${index + 1})`);
      if (result.ok) {
        slides.push(result.slide);
      } else {
        errors.push(...result.errors);
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const deck: Deck = {
    id: crypto.randomUUID(),
    title: (body.title as string).trim(),
    slides,
    selectedSlideId: slides[0].id,
    customer: isNonEmptyString(body.customer) ? body.customer.trim() : undefined,
    themeId: typeof body.themeId === "string" ? body.themeId : undefined
  };
  return { ok: true, deck };
}
