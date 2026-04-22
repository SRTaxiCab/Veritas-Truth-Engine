import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = process.cwd();
const markdownPath = path.join(rootDir, "docs", "veritas_operations_manual.md");
const pdfPath = path.join(rootDir, "docs", "veritas_operations_manual.pdf");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\\s(])\*([^*]+)\*(?=[\\s).,;:!?]|$)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\\s(])_([^_]+)_(?=[\\s).,;:!?]|$)/g, "$1<em>$2</em>");
  return html;
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function imageSource(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return `data:${imageMimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let inCodeBlock = false;
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length || !listType) return;
    html.push(`<${listType}>`);
    for (const item of listItems) {
      html.push(`<li>${renderInline(item)}</li>`);
    }
    html.push(`</${listType}>`);
    listItems = [];
    listType = null;
  }

  function flushCode() {
    if (!codeLines.length) return;
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const imageMatch = line.match(/^!\[(.*?)]\((.*?)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      const alt = imageMatch[1];
      const sourcePath = path.resolve(path.dirname(markdownPath), imageMatch[2]);
      const source = imageSource(sourcePath);
      html.push(source
        ? `<figure><img src="${source}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`
        : `<figure><div class="image-missing">Image not found: ${escapeHtml(imageMatch[2])}</div><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    const unorderedMatch = line.match(/^-+\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unorderedMatch[1]);
      continue;
    }

    if (listItems.length) {
      flushList();
    }
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();

  return html.join("\n");
}

function buildHtml(markdown) {
  const body = markdownToHtml(markdown);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Veritas Truth Engine Operations Manual</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1d1a16;
      --muted: #5f584d;
      --line: #d9cfbe;
      --surface: #fffdf9;
      --accent: #0d7267;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background: #f6f2ea;
    }

    body {
      padding: 34px 38px 48px;
      line-height: 1.6;
      font-size: 12px;
    }

    h1, h2, h3, h4 {
      color: #171410;
      line-height: 1.2;
      margin: 1.2em 0 0.45em;
    }

    h1 {
      font-size: 28px;
      border-bottom: 2px solid var(--line);
      padding-bottom: 10px;
      margin-top: 0;
    }

    h2 {
      font-size: 20px;
      margin-top: 1.8em;
      border-left: 4px solid var(--accent);
      padding-left: 10px;
    }

    h3 {
      font-size: 15px;
    }

    p {
      margin: 0.45em 0;
    }

    ul, ol {
      margin: 0.45em 0 0.85em 1.4em;
      padding: 0;
    }

    li + li {
      margin-top: 0.28em;
    }

    code {
      background: #eee7da;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 0.95em;
    }

    pre {
      background: #1f1d19;
      color: #f7f1e4;
      padding: 14px;
      border-radius: 10px;
      overflow: hidden;
      white-space: pre-wrap;
      line-height: 1.45;
      margin: 0.8em 0 1.1em;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    figure {
      margin: 1.15em 0 1.45em;
      padding: 14px 14px 10px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      page-break-inside: avoid;
      break-inside: avoid-page;
      text-align: center;
    }

    img {
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 5.9in;
      margin: 0 auto;
      object-fit: contain;
      background: #f1ece2;
      border: 1px solid #ddd3c4;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(29, 26, 22, 0.12);
    }

    .image-missing {
      padding: 18px;
      border: 1px dashed var(--line);
      border-radius: 10px;
      color: #8a3a2d;
      background: #fff5f2;
      font-weight: 600;
    }

    figcaption {
      margin-top: 8px;
      color: var(--muted);
      font-size: 10px;
      text-align: left;
    }

    em {
      color: var(--muted);
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function main() {
  const markdown = fs.readFileSync(markdownPath, "utf8");
  const html = buildHtml(markdown);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: {
      top: "0.5in",
      right: "0.45in",
      bottom: "0.55in",
      left: "0.45in",
    },
  });
  await browser.close();
  console.log(`Rendered ${pdfPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
