// Creates a complete, self-contained javascript: bookmark URL.
// It does not fetch or evaluate code from an external website at runtime.
const fs = require("node:fs");
const path = require("node:path");
const {minify} = require("terser");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "companion", "companion.js"), "utf8");
  const result = await minify(source, {
    compress: {passes: 2},
    mangle: true,
    format: {comments: false}
  });
  if (!result.code)
    throw new Error("Bookmarklet minifier returned no JavaScript.");
  const bookmarklet = `javascript:${result.code}`;
  const file = path.join(root, "companion", "companion.bookmarklet.txt");
  fs.writeFileSync(file, bookmarklet + "\n", "utf8");
  console.log(`Built self-contained bookmarklet: ${bookmarklet.length} characters.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
