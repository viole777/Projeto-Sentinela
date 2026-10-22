const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontendDir = path.join(__dirname, "..", "frontend");
const files = fs.readdirSync(frontendDir).filter((name) => name.endsWith(".html"));
const errors = [];

for (const file of files) {
  const fullPath = path.join(frontendDir, file);
  const html = fs.readFileSync(fullPath, "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  scripts.forEach((match, index) => {
    const source = match[1].trim();
    if (!source) return;
    try {
      new vm.Script(source, { filename: file + "#inline-script-" + (index + 1) });
    } catch (error) {
      errors.push(file + " inline script " + (index + 1) + ": " + error.message);
    }
  });
}

if (errors.length) {
  console.error("Frontend script syntax errors:");
  errors.forEach((error) => console.error(" - " + error));
  process.exitCode = 1;
} else {
  console.log("Frontend inline script syntax passed for " + files.length + " HTML pages.");
}
