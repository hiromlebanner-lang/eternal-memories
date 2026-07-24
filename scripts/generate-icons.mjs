import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const outputDirectory = new URL("../public/icons/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const iconSVG = (size, safePadding = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="40" y1="30" x2="480" y2="490" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff806c"/>
      <stop offset="1" stop-color="#e84e69"/>
    </linearGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#793234" flood-opacity=".25"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${118 + safePadding}" fill="url(#bg)"/>
  <path d="M86 145l105-40 128 43 107-42v261l-107 42-128-43-105 40V145z"
        fill="#fff" fill-opacity=".93" stroke="#fff" stroke-width="13" stroke-linejoin="round"/>
  <path d="M191 105v261M319 148v261" stroke="#ef6370" stroke-width="10" stroke-linecap="round" opacity=".34"/>
  <path d="M116 292c63-81 111 65 184-31 44-58 71-22 96-62"
        fill="none" stroke="#55a3a9" stroke-width="15" stroke-linecap="round" stroke-dasharray="2 28"/>
  <g filter="url(#shadow)">
    <circle cx="327" cy="218" r="74" fill="#fff"/>
    <circle cx="327" cy="218" r="59" fill="#6bc2b0"/>
    <path d="M286 242l29-33 23 24 19-20 28 32H286z" fill="#fff" fill-opacity=".9"/>
    <circle cx="305" cy="197" r="9" fill="#fff4bd"/>
  </g>
  <circle cx="139" cy="184" r="25" fill="#ffbd4a" stroke="#fff" stroke-width="10"/>
</svg>`;

async function writeIcon(name, size, safePadding = 0) {
  await sharp(Buffer.from(iconSVG(size, safePadding)))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(name, outputDirectory)));
}

await Promise.all([
  writeIcon("icon-192.png", 192),
  writeIcon("icon-512.png", 512),
  writeIcon("maskable-512.png", 512, 30),
  writeIcon("apple-touch-icon.png", 180),
]);

console.log("MapAlbum icons generated.");
