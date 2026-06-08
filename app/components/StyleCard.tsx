"use client";

// The user-facing slide styles. "magic" lets the AI pick a layout; the rest force
// a specific one. Ids match the route's templates (except "magic").
export type StyleId = "magic" | "bullets" | "paragraph" | "boxes" | "two-col-image";

export const STYLES: { id: StyleId; label: string }[] = [
  { id: "magic", label: "Magic" },
  { id: "bullets", label: "Bullets" },
  { id: "paragraph", label: "Paragraphs" },
  { id: "boxes", label: "Boxes" },
  { id: "two-col-image", label: "Two column with image" }
];

// A tiny CSS-only mock of each layout (a mini "slide" with placeholder bars), so
// the choice reads at a glance. Magic gets an accent tile with a sparkle.
function Thumb({ id }: { id: StyleId }) {
  if (id === "magic") {
    return (
      <span className="style-thumb style-thumb--magic" aria-hidden>
        ✨
      </span>
    );
  }

  return (
    <span className="style-thumb" aria-hidden>
      {id === "bullets" && (
        <>
          <span className="thumb-title" />
          <span className="thumb-bullet" />
          <span className="thumb-bullet" />
          <span className="thumb-bullet" />
        </>
      )}
      {id === "paragraph" && (
        <>
          <span className="thumb-title" />
          <span className="thumb-line" />
          <span className="thumb-line" />
          <span className="thumb-line short" />
        </>
      )}
      {id === "boxes" && (
        <>
          <span className="thumb-title" />
          <span className="thumb-boxes">
            <span className="thumb-box" />
            <span className="thumb-box" />
            <span className="thumb-box" />
          </span>
        </>
      )}
      {id === "two-col-image" && (
        <span className="thumb-2col">
          <span className="thumb-img" />
          <span className="thumb-col">
            <span className="thumb-line" />
            <span className="thumb-line" />
            <span className="thumb-line short" />
          </span>
        </span>
      )}
    </span>
  );
}

export function StyleCard({
  id,
  label,
  selected,
  onSelect
}: {
  id: StyleId;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`style-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      title={label}
      type="button"
    >
      <Thumb id={id} />
      <span className="style-card-label">{label}</span>
    </button>
  );
}
