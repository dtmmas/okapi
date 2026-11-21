type TableGlyphProps = {
  className?: string;
};

export function TableGlyph({ className }: TableGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 10h14" />
      <path d="M7 10v8" />
      <path d="M17 10v8" />
      <path d="M9 6h6" />
    </svg>
  );
}