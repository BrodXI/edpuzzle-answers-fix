// Produce a small, source-controlled bundle for the fork's jsDelivr bookmarklet.
// Keep large landing-page videos and source maps out of the CDN release.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const release = path.join(root, "release");
const files = [
  "script.js",
  "open.js",
  "main.js",
  "popup.html",
  "console.html",
  "styles/popup.css"
];

for (const file of files) {
  const source = path.join(dist, file);
  if (!fs.existsSync(source))
    throw new Error(`Missing build output: ${file}. Run npm run build:prod first.`);
  const output = path.join(release, file);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.copyFileSync(source, output);
}
console.log(`Prepared ${files.length} browser assets in release/.`);
