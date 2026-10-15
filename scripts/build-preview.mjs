import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import postcss from "postcss";
import imports from "postcss-import";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await rm("preview/dist", { recursive: true, force: true });
await mkdir("preview/dist", { recursive: true });
const config = require("../apps/web/tailwind.config.cjs");
config.content = [
  "./apps/web/src/original/home/**/*.{ts,tsx}",
  "./apps/web/src/app/**/*.{ts,tsx}",
];
const result = await postcss([
  imports(),
  tailwind(config),
  autoprefixer(),
]).process(await readFile("apps/web/src/app/globals.css", "utf8"), {
  from: resolve("apps/web/src/app/globals.css"),
});
// Expand Tailwind before bundling CSS/font URLs for static hosting.
result.root.walkDecls((declaration) => {
  const file = declaration.source?.input.file;
  if (!file) return;
  declaration.value = declaration.value.replace(
    /url\(["']?(\.\/files\/[^"')]+)["']?\)/g,
    (_, name) => "url(" + JSON.stringify(resolve(dirname(file), name)) + ")",
  );
});
await writeFile("preview/.generated.css", result.root.toString());
await build({
  entryPoints: ["preview/main.tsx"],
  bundle: true,
  minify: true,
  jsx: "automatic",
  tsconfig: "apps/web/tsconfig.json",
  outfile: "preview/dist/app.js",
  platform: "browser",
  loader: { ".js": "jsx", ".woff2": "file", ".woff": "file", ".ttf": "file" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "preview-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("preview/navigation.tsx"),
        }));
        builder.onResolve({ filter: /^next\/link$/ }, () => ({
          path: resolve("preview/link.tsx"),
        }));
        builder.onResolve({ filter: /^next\/image$/ }, () => ({
          path: resolve("preview/image.tsx"),
        }));
        builder.onResolve({ filter: /globals\.css$/ }, () => ({
          path: resolve("preview/.generated.css"),
        }));
      },
    },
  ],
});
await cp("preview/index.html", "preview/dist/index.html");
await cp("apps/web/public/original", "preview/dist/original", {
  recursive: true,
});
console.log(
  "Built original-design homepage/auth/dashboard preview with synthetic local data.",
);
