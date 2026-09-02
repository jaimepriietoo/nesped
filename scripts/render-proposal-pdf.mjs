import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const inputArg = process.argv[2];
const outputArg = process.argv[3];

if (!inputArg || !outputArg) {
  console.error("Uso: node scripts/render-proposal-pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

const inputPath = path.resolve(rootDir, inputArg);
const outputPath = path.resolve(rootDir, outputArg);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 },
    colorScheme: "light",
  });

  await page.goto(pathToFileURL(inputPath).href, {
    waitUntil: "networkidle",
  });

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    },
  });
} finally {
  await browser.close();
}
