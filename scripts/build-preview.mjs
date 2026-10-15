import { build } from "esbuild";
import { cp, mkdir, appendFile } from "node:fs/promises";
await mkdir("preview/dist", { recursive: true });
await build({
  entryPoints: ["preview/main.tsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  outfile: "preview/dist/app.js",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
});
await cp("preview/index.html", "preview/dist/index.html");
await appendFile(
  "preview/dist/app.css",
  `\n.demo-banner {background:#183e30;color:white;padding:18px max(22px,calc((100vw - 1216px)/2));display:flex;align-items:center;justify-content:space-between;gap:24px;font-family:Arial,sans-serif}.demo-banner strong{font-size:14px;display:block;margin-bottom:7px}.demo-banner span{font-size:12px;line-height:1.6;display:block;max-width:720px;color:#d3e5d6}.demo-actions{display:flex;gap:16px;align-items:center;flex-shrink:0}.demo-actions a{color:#d2edb5;font-size:12px}.demo-actions button{white-space:nowrap}@media(max-width:850px){.demo-banner{flex-direction:column;align-items:flex-start;gap:14px}}\n`,
);
console.log(
  "Built the browser-only synthetic demo in preview/dist; production backend is unchanged.",
);
