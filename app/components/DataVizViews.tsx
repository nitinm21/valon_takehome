// Pure renderers for the data-viz elements (KPI / chart / table).
//
// One implementation shared by the editor (ElementView), thumbnails (SlideThumb)
// and present mode (PresentMode): the caller positions the element (absolute
// frame in logical artboard px) and these fill 100% of that box. No handlers, no
// editing UI — data-viz content is authored by the agent through the deck API,
// while the boxes themselves stay movable/resizable/deletable like any element.
//
// Charts are hand-rolled SVG (no chart lib): the artboard is a fixed 1280x720
// logical space, so a viewBox in the element's logical w/h scales pixel-faithfully
// everywhere the slide renders.

import type { CSSProperties } from "react";

import type { ChartElement, KpiElement, TableElement } from "../lib/types";

const GOOD = "#1F9D5B";
const BAD = "#D64545";
const NEUTRAL_FALLBACK = "#2F6DF0";

// Series color rotation when the agent doesn't name colors: theme accent first.
function seriesColors(accent: string): string[] {
  return [accent, "#8A97A8", "#46B58A", "#E0A33B"];
}

function trendGlyph(trend?: "up" | "down" | "flat"): string {
  return trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
}

// ---- KPI --------------------------------------------------------------------

export function KpiView({ element }: { element: KpiElement }) {
  const accent = element.accent ?? NEUTRAL_FALLBACK;
  const color = element.color ?? "#1A1D21";
  const deltaColor =
    element.good === undefined ? accent : element.good ? GOOD : BAD;
  // Long figures shrink so they never clip; the artboard scale handles the rest.
  const valueSize = Math.min(
    58,
    Math.floor((element.w - 48) / Math.max(4, element.value.length) / 0.58)
  );

  const card: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    background: element.surface ?? "#F2F4F8",
    borderRadius: 16,
    borderTop: `4px solid ${accent}`,
    padding: "24px 24px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden"
  };

  return (
    <div style={card}>
      <div
        style={{
          color,
          opacity: 0.72,
          fontSize: 19,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: 0.2
        }}
      >
        {element.label}
      </div>
      <div style={{ color, fontSize: valueSize, fontWeight: 700, lineHeight: 1.05 }}>
        {element.value}
      </div>
      <div style={{ minHeight: 26, fontSize: 20, fontWeight: 600, color: deltaColor }}>
        {element.delta ? `${trendGlyph(element.trend)} ${element.delta}` : ""}
      </div>
    </div>
  );
}

// ---- chart --------------------------------------------------------------------

// Round a data max up to a "nice" axis max (1/2/2.5/5 × 10^k).
function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const unit = value / base;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * base;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function ChartView({ element }: { element: ChartElement }) {
  const { w, h } = element;
  const accent = element.accent ?? NEUTRAL_FALLBACK;
  const color = element.color ?? "#444b55";
  const colors = seriesColors(accent);

  const labels = element.labels;
  const series = element.series.filter((s) => s.values.length > 0);
  const hasData = labels.length > 0 && series.length > 0;

  const card: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    background: element.surface ?? "#F2F4F8",
    borderRadius: 16,
    overflow: "hidden"
  };

  if (!hasData) {
    return (
      <div style={{ ...card, display: "grid", placeItems: "center" }}>
        <span style={{ color, opacity: 0.6, fontSize: 20 }}>No chart data</span>
      </div>
    );
  }

  const values = series.flatMap((s) => s.values);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.min(0, dataMin);
  const yMax = niceMax(dataMax);

  // Plot box inside the card, leaving room for ticks/labels/legend.
  const showLegend = series.length > 1;
  const pad = { top: showLegend ? 56 : 28, right: 24, bottom: 44, left: 64 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yScale = (v: number) =>
    pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const TICKS = 4;
  const ticks = Array.from(
    { length: TICKS + 1 },
    (_, i) => yMin + ((yMax - yMin) / TICKS) * i
  );

  const groupW = plotW / labels.length;
  const zeroY = yScale(Math.max(0, yMin));

  return (
    <div style={card}>
      <svg
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
      >
        {/* gridlines + y ticks */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              stroke={color}
              strokeOpacity={0.15}
              x1={pad.left}
              x2={w - pad.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
            <text
              fill={color}
              fillOpacity={0.7}
              fontSize={15}
              textAnchor="end"
              x={pad.left - 10}
              y={yScale(tick) + 5}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {labels.map((label, i) => (
          <text
            fill={color}
            fillOpacity={0.8}
            fontSize={15}
            key={`${label}-${i}`}
            textAnchor="middle"
            x={pad.left + groupW * i + groupW / 2}
            y={h - pad.bottom + 24}
          >
            {label}
          </text>
        ))}

        {/* bars */}
        {element.chartType === "bar" &&
          series.map((s, si) => {
            const barW = (groupW * 0.66) / series.length;
            return s.values.slice(0, labels.length).map((v, i) => {
              const x =
                pad.left + groupW * i + (groupW - barW * series.length) / 2 + barW * si;
              const y = Math.min(yScale(v), zeroY);
              return (
                <rect
                  fill={s.color ?? colors[si % colors.length]}
                  height={Math.max(1.5, Math.abs(yScale(v) - zeroY))}
                  key={`${si}-${i}`}
                  rx={3}
                  width={Math.max(2, barW - 4)}
                  x={x}
                  y={y}
                />
              );
            });
          })}

        {/* lines */}
        {element.chartType === "line" &&
          series.map((s, si) => {
            const stroke = s.color ?? colors[si % colors.length];
            const points = s.values
              .slice(0, labels.length)
              .map((v, i) => `${pad.left + groupW * i + groupW / 2},${yScale(v)}`)
              .join(" ");
            return (
              <g key={si}>
                <polyline
                  fill="none"
                  points={points}
                  stroke={stroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3.5}
                />
                {s.values.slice(0, labels.length).map((v, i) => (
                  <circle
                    cx={pad.left + groupW * i + groupW / 2}
                    cy={yScale(v)}
                    fill={stroke}
                    key={i}
                    r={5}
                  />
                ))}
              </g>
            );
          })}

        {/* legend */}
        {showLegend &&
          series.map((s, si) => {
            const x = pad.left + si * 170;
            const fill = s.color ?? colors[si % colors.length];
            return (
              <g key={`legend-${si}`}>
                <rect fill={fill} height={12} rx={3} width={12} x={x} y={20} />
                <text fill={color} fontSize={15} x={x + 20} y={31}>
                  {s.name ?? `Series ${si + 1}`}
                </text>
              </g>
            );
          })}

        {/* y axis label */}
        {element.yLabel && (
          <text
            fill={color}
            fillOpacity={0.7}
            fontSize={14}
            textAnchor="middle"
            transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
            x={16}
            y={pad.top + plotH / 2}
          >
            {element.yLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

// ---- table --------------------------------------------------------------------

export function TableView({ element }: { element: TableElement }) {
  const accent = element.accent ?? NEUTRAL_FALLBACK;
  const color = element.color ?? "#444b55";
  const headerColor = element.headerColor ?? "#1A1D21";
  // Scale type down a touch for dense tables so they stay inside the box.
  const dense = element.rows.length > 6;
  const fontSize = dense ? 17 : 20;
  const cellPad = dense ? "8px 16px" : "12px 18px";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        background: element.surface ?? "#F2F4F8",
        borderRadius: 16,
        padding: 12,
        overflow: "hidden"
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize,
          color,
          lineHeight: 1.3
        }}
      >
        <thead>
          <tr>
            {element.columns.map((column, i) => (
              <th
                key={`${column}-${i}`}
                style={{
                  textAlign: "left",
                  padding: cellPad,
                  color: headerColor,
                  fontWeight: 700,
                  borderBottom: `3px solid ${accent}`
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {element.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: cellPad,
                    borderBottom:
                      ri === element.rows.length - 1
                        ? "none"
                        : `1px solid ${color}22`
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Convenience switch used by the three slide renderers.
export function DataVizView({
  element
}: {
  element: KpiElement | ChartElement | TableElement;
}) {
  if (element.type === "kpi") {
    return <KpiView element={element} />;
  }
  if (element.type === "chart") {
    return <ChartView element={element} />;
  }
  return <TableView element={element} />;
}
