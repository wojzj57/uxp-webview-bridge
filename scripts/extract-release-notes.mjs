import { readFile } from "node:fs/promises";

const version = process.argv[2];

if (!version) {
  throw new Error("Usage: node scripts/extract-release-notes.mjs <version>");
}

const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const lines = changelog.split(/\r?\n/u);
const heading = `## ${version}`;
const start = lines.findIndex((line) => line.trim() === heading);

if (start === -1) {
  throw new Error(`CHANGELOG.md does not contain a ${heading} section.`);
}

const nextHeading = lines.findIndex((line, index) => index > start && /^##\s+/u.test(line));
const end = nextHeading === -1 ? lines.length : nextHeading;
const notes = lines.slice(start + 1, end).join("\n").trim();

if (!notes) {
  throw new Error(`The ${heading} section is empty.`);
}

process.stdout.write(`${notes}\n`);
