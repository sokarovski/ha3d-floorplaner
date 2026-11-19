// Renders every brand image from the one source, brand/ha3d-logo.svg (npm run brand:build).
// Outputs are deterministic and committed, like the built-in templates: the integration ZIP, the generated
// Marketplace repository and the app's Docker build context all need them without running Node.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

const source = "brand/ha3d-logo.svg";
const svg = await readFile(source);

/** A square PNG of the logo; metadata is stripped and compression fixed, so equal inputs give equal bytes. */
const square = async (path: string, size: number): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const png = await sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  await writeFile(path, png);
};

// Home Assistant brand images inside the integration (icon 256/512; the logo is the icon, square).
await square("custom_components/homeplan/brand/icon.png", 256);
await square("custom_components/homeplan/brand/icon@2x.png", 512);
await square("custom_components/homeplan/brand/logo.png", 256);
await square("custom_components/homeplan/brand/logo@2x.png", 512);
// The HA app's store images, next to the app's config.yaml at the repository root.
await square("icon.png", 128);
await square("logo.png", 256);
// The builder's favicon is the logo itself.
await copyFile(source, "public/favicon.svg");

// GitHub social preview (1280×640): the logo on a dark backdrop; no text, so no font dependence.
const inner = svg
  .toString("utf8")
  .replace(/<\?xml[^>]*>/, "")
  .replace(/<svg\b[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0B1E2D"/><stop offset="1" stop-color="#123A55"/>
  </linearGradient></defs>
  <rect width="1280" height="640" fill="url(#bg)"/>
  <svg x="400" y="80" width="480" height="480" viewBox="0 0 512 512">${inner}</svg>
</svg>`;
await writeFile(
  "brand/social-preview.png",
  await sharp(Buffer.from(preview)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer(),
);
process.stdout.write(`Brand images rendered from ${source}\n`);
