/** Copy text through FloxBow's native clipboard bridge, with browser fallbacks. */
export async function copyTextToClipboard(text: string): Promise<void> {
  let nativeError: unknown;
  const bridge = window.floxBowWindows;
  if (bridge) {
    try {
      const copied =
        text.length <= 20_000
          ? await bridge.copyVisualContext(text)
          : await bridge.copyStoryboardContext(text);
      if (copied) return;
      nativeError = new Error("The app clipboard did not confirm the copy.");
    } catch (error) {
      nativeError = error;
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Try the legacy selection-based API before reporting a failure.
    }
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.setAttribute("readonly", "");
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.append(temporary);
  temporary.select();
  const copied = document.execCommand("copy");
  temporary.remove();
  if (!copied) {
    const reason =
      nativeError instanceof Error ? ` ${nativeError.message}` : "";
    throw new Error(`The clipboard could not copy the text.${reason}`);
  }
}
