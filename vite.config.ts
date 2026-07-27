import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { sites } from "./build/sites-vite-plugin";

function staticWorker(): Plugin {
  return {
    name: "mapalbum-static-worker",
    apply: "build",
    async closeBundle() {
      const directory = resolve("dist", "server");
      await mkdir(directory, { recursive: true });
      await writeFile(
        resolve(directory, "index.js"),
        `export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === "GET") {
      const acceptsHTML = request.headers.get("accept")?.includes("text/html");
      if (acceptsHTML) {
        response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }
    }
    if (response.headers.get("content-type")?.includes("text/html")) {
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      const imageURL = new URL("/og.png", request.url).href;
      return new Response((await response.text()).replaceAll("__ETERNAL_MEMORIES_OG_IMAGE__", imageURL), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  }
};
`,
      );
    },
  };
}

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "map-vendor",
              test: /node_modules[\\/](?:\.pnpm[\\/])?(?:leaflet|react-leaflet)/,
              priority: 30,
            },
            {
              name: "supabase-vendor",
              test: /node_modules[\\/](?:\.pnpm[\\/])?@supabase/,
              priority: 25,
            },
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:\.pnpm[\\/])?(?:react|react-dom|scheduler)/,
              priority: 20,
            },
            {
              name: "media-vendor",
              test: /node_modules[\\/](?:\.pnpm[\\/])?(?:exifr|qrcode)/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Eternal memories",
        short_name: "Eternal memories",
        description: "写真を地図上に記録し、大切な思い出を家族や友人と共有できる写真アルバムアプリです。",
        lang: "ja",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f3ed",
        theme_color: "#ff6b5f",
        orientation: "any",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ["/push-sw.js"],
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,png,jpg,jpeg,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapalbum-map-tiles",
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapalbum-photo-cache",
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
    sites(),
    staticWorker(),
  ],
});
