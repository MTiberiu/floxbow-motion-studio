import type { ButtonHTMLAttributes, ReactNode } from "react";

export type EditorActionIcon =
  "center" | "fit" | "fill" | "flip" | "reset" | "duplicate" | "delete";

export function EditorIconButton({
  icon,
  label,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  icon: EditorActionIcon;
  label: string;
}) {
  let glyph: ReactNode;
  switch (icon) {
    case "center":
      glyph = (
        <>
          <circle cx="10" cy="10" r="5" />
          <path d="M10 1v4m0 10v4M1 10h4m10 0h4" />
        </>
      );
      break;
    case "fit":
      glyph = (
        <>
          <rect x="5" y="5" width="10" height="10" rx="1" />
          <path d="M2 7V2h5m6 0h5v5M2 13v5h5m6 0h5v-5" />
        </>
      );
      break;
    case "fill":
      glyph = (
        <>
          <rect x="5" y="5" width="10" height="10" rx="1" />
          <path d="M2 6V2h4m8 0h4v4M2 14v4h4m8 0h4v-4" />
        </>
      );
      break;
    case "flip":
      glyph = <path d="M10 2v16M8 5 3 10l5 5M12 5l5 5-5 5" />;
      break;
    case "reset":
      glyph = (
        <>
          <path d="M4 6V2m0 0h4M4.4 5.7A7 7 0 1 1 3 10" />
          <path d="M10 6v4l3 2" />
        </>
      );
      break;
    case "duplicate":
      glyph = (
        <>
          <rect x="7" y="3" width="10" height="12" rx="1" />
          <path d="M13 17v1H4V7h1" />
        </>
      );
      break;
    case "delete":
      glyph = (
        <>
          <path d="M3 5h14m-9-2h4m-8 2 1 12h8l1-12M8 8v6m4-6v6" />
        </>
      );
      break;
  }

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      className={`editor-icon-button${buttonProps.className ? ` ${buttonProps.className}` : ""}`}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        {glyph}
      </svg>
    </button>
  );
}
