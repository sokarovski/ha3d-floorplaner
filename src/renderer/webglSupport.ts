// WebGL2 capability probe; the viewport needs WebGL2 (Three.js r163+ dropped WebGL1).

export const webgl2Unavailable = (): string | null => {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (context === null) return "WebGL2 is not available in this browser or is disabled.";
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "WebGL2 could not be initialized.";
  }
};
