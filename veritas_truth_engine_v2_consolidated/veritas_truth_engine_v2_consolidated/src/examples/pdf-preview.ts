export type PdfPreviewSourceKey = "operations-manual" | "latest-dossier";

export interface PdfPreviewSource {
  key: PdfPreviewSourceKey;
  title: string;
  description: string;
  downloadUrl: string;
  appUrl: string;
}

export function resolvePdfPreviewSource(source: string | null | undefined): PdfPreviewSource | null {
  switch (source) {
    case "latest-dossier":
      return {
        key: "latest-dossier",
        title: "Latest Evidence Dossier",
        description: "Latest server-rendered PDF dossier artifact from the reports workspace.",
        downloadUrl: "/downloads/veritas-evidence-dossier.pdf",
        appUrl: "/report",
      };
    case "operations-manual":
      return {
        key: "operations-manual",
        title: "Operations Manual",
        description: "Administrative runbook for sign-in, workflows, controls, and operating procedures.",
        downloadUrl: "/downloads/veritas-operations-manual.pdf",
        appUrl: "/settings",
      };
    default:
      return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPdfPreviewHtml(source: PdfPreviewSource): string {
  const safeTitle = escapeHtml(source.title);
  const safeDescription = escapeHtml(source.description);
  const safeDownloadUrl = escapeHtml(source.downloadUrl);
  const safeAppUrl = escapeHtml(source.appUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} | Veritas PDF Preview</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #e8e2d6;
      --panel: rgba(253, 251, 247, 0.95);
      --panel-strong: #f9f5ee;
      --ink: #11161d;
      --muted: #536171;
      --line: rgba(17, 22, 29, 0.14);
      --accent: #8f5e25;
      --accent-strong: #6b4315;
      --shadow: 0 20px 60px rgba(17, 22, 29, 0.18);
      --page-shadow: 0 18px 45px rgba(17, 22, 29, 0.18);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.75), transparent 42%),
        linear-gradient(160deg, #ebe5d8 0%, #dbd1bf 48%, #cdc1ad 100%);
    }

    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: rgba(249, 245, 238, 0.94);
      backdrop-filter: blur(10px);
    }

    .title-block h1 {
      margin: 0 0 6px;
      font-size: 22px;
      line-height: 1.2;
    }

    .title-block p {
      margin: 0;
      max-width: 760px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .button {
      appearance: none;
      border: 1px solid rgba(107, 67, 21, 0.18);
      border-radius: 999px;
      background: var(--panel-strong);
      color: var(--ink);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font: inherit;
      font-weight: 700;
      min-height: 42px;
      padding: 0 18px;
      text-decoration: none;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    .button:hover {
      transform: translateY(-1px);
      border-color: rgba(107, 67, 21, 0.34);
      background: #ffffff;
    }

    .button.primary {
      background: linear-gradient(180deg, #9c6730 0%, #764815 100%);
      border-color: transparent;
      color: #fff8ef;
    }

    .workspace {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      padding: 20px 24px 28px;
      min-height: 0;
    }

    .sidebar,
    .viewer-shell {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 24px;
      box-shadow: var(--shadow);
      min-height: 0;
    }

    .sidebar {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .meta-grid {
      display: grid;
      gap: 12px;
    }

    .meta-card {
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.55);
    }

    .meta-card span {
      display: block;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .meta-card strong {
      display: block;
      font-size: 20px;
      line-height: 1.2;
    }

    .meta-card p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .status {
      min-height: 48px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(143, 94, 37, 0.18);
      background: rgba(143, 94, 37, 0.08);
      color: var(--ink);
      font-size: 14px;
      line-height: 1.45;
    }

    .status.error {
      border-color: rgba(170, 45, 45, 0.25);
      background: rgba(170, 45, 45, 0.08);
    }

    .controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .control-wide {
      grid-column: 1 / -1;
    }

    .viewer-shell {
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }

    .viewer-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(249, 245, 238, 0.92);
    }

    .viewer-toolbar .spacer {
      flex: 1;
      min-width: 16px;
    }

    .viewer-toolbar label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .viewer-toolbar input {
      width: 70px;
      min-height: 38px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      text-align: center;
    }

    .viewer-toolbar strong {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .viewer-canvas-wrap {
      overflow: auto;
      padding: 22px;
      background:
        linear-gradient(180deg, rgba(17, 22, 29, 0.06), transparent 20%),
        #d7cfbf;
    }

    .viewer-canvas-stage {
      min-height: 100%;
      display: grid;
      place-items: start center;
    }

    #pdfCanvas {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: var(--page-shadow);
      background: #ffffff;
    }

    .empty-state {
      padding: 48px 24px;
      text-align: center;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
    }

    @media (max-width: 1040px) {
      .workspace {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 700px) {
      .topbar,
      .workspace {
        padding-left: 16px;
        padding-right: 16px;
      }

      .controls {
        grid-template-columns: 1fr;
      }

      .viewer-toolbar {
        padding: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="title-block">
        <h1>${safeTitle}</h1>
        <p>${safeDescription}</p>
      </div>
      <div class="actions">
        <a class="button" href="${safeAppUrl}">Back to app</a>
        <a class="button primary" href="${safeDownloadUrl}" target="_blank" rel="noreferrer">Download PDF</a>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <div class="meta-grid">
          <div class="meta-card">
            <span>Source</span>
            <strong>${safeTitle}</strong>
            <p>${safeDescription}</p>
          </div>
          <div class="meta-card">
            <span>Navigation</span>
            <strong id="pageIndicator">Page 1 of --</strong>
            <p>Use the toolbar or keyboard arrows to move through the document.</p>
          </div>
          <div class="meta-card">
            <span>Zoom</span>
            <strong id="zoomIndicator">100%</strong>
            <p>Fit-to-width is the default. You can zoom in, zoom out, or type a page number directly.</p>
          </div>
        </div>
        <div id="viewerStatus" class="status">Loading PDF viewer.</div>
        <div class="controls">
          <button class="button" id="previousPage">Previous page</button>
          <button class="button" id="nextPage">Next page</button>
          <button class="button" id="zoomOut">Zoom out</button>
          <button class="button" id="zoomIn">Zoom in</button>
          <button class="button control-wide" id="fitWidth">Fit to width</button>
        </div>
      </aside>

      <section class="viewer-shell" aria-label="PDF viewer">
        <div class="viewer-toolbar">
          <button class="button" id="toolbarPreviousPage">Previous</button>
          <button class="button" id="toolbarNextPage">Next</button>
          <label>Page
            <input id="pageNumberInput" type="number" min="1" step="1" value="1" />
          </label>
          <strong id="toolbarPageCount">of --</strong>
          <div class="spacer"></div>
          <button class="button" id="toolbarZoomOut">-</button>
          <button class="button" id="toolbarFitWidth">Fit width</button>
          <button class="button" id="toolbarZoomIn">+</button>
        </div>
        <div class="viewer-canvas-wrap" id="viewerCanvasWrap">
          <div class="viewer-canvas-stage">
            <canvas id="pdfCanvas"></canvas>
            <div id="viewerEmptyState" class="empty-state" hidden>Rendering document.</div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script type="module">
    import * as pdfjsLib from "/assets/pdfjs/build/pdf.mjs";

    pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/pdfjs/build/pdf.worker.mjs";

    const viewerStatus = document.getElementById("viewerStatus");
    const pageIndicator = document.getElementById("pageIndicator");
    const toolbarPageCount = document.getElementById("toolbarPageCount");
    const zoomIndicator = document.getElementById("zoomIndicator");
    const pageNumberInput = document.getElementById("pageNumberInput");
    const viewerCanvasWrap = document.getElementById("viewerCanvasWrap");
    const viewerEmptyState = document.getElementById("viewerEmptyState");
    const canvas = document.getElementById("pdfCanvas");
    const context = canvas.getContext("2d", { alpha: false });

    let pdfDocument = null;
    let currentPageNumber = 1;
    let totalPages = 0;
    let currentScale = 1;
    let renderTask = null;
    let fitWidthRequested = true;

    function setStatus(message, isError = false) {
      viewerStatus.textContent = message;
      viewerStatus.classList.toggle("error", isError);
    }

    function updateUi() {
      pageIndicator.textContent = "Page " + currentPageNumber + " of " + (totalPages || "--");
      toolbarPageCount.textContent = "of " + (totalPages || "--");
      pageNumberInput.value = String(currentPageNumber);
      zoomIndicator.textContent = Math.round(currentScale * 100) + "%";
    }

    async function renderCurrentPage() {
      if (!pdfDocument || !context) return;
      if (renderTask) {
        renderTask.cancel();
        renderTask = null;
      }

      const page = await pdfDocument.getPage(currentPageNumber);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const wrapWidth = Math.max(viewerCanvasWrap.clientWidth - 44, 320);
      if (fitWidthRequested) {
        currentScale = Math.max(0.35, Math.min(3.5, wrapWidth / unscaledViewport.width));
      }
      const viewport = page.getViewport({ scale: currentScale });
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = viewport.width + "px";
      canvas.style.height = viewport.height + "px";
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = true;

      viewerEmptyState.hidden = true;
      setStatus("Rendering page " + currentPageNumber + " of " + totalPages + ".");
      renderTask = page.render({
        canvasContext: context,
        viewport,
      });

      try {
        await renderTask.promise;
        setStatus("Viewing " + "${safeTitle}" + ". Page " + currentPageNumber + " of " + totalPages + ".");
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") {
          setStatus("Failed to render the selected page.", true);
          throw error;
        }
      } finally {
        renderTask = null;
        updateUi();
      }
    }

    async function goToPage(pageNumber) {
      if (!pdfDocument) return;
      const nextPage = Math.max(1, Math.min(totalPages, Number(pageNumber) || 1));
      currentPageNumber = nextPage;
      await renderCurrentPage();
    }

    async function changeZoom(multiplier) {
      fitWidthRequested = false;
      currentScale = Math.max(0.35, Math.min(4, currentScale * multiplier));
      await renderCurrentPage();
    }

    async function fitWidth() {
      fitWidthRequested = true;
      await renderCurrentPage();
    }

    document.getElementById("previousPage").addEventListener("click", () => void goToPage(currentPageNumber - 1));
    document.getElementById("nextPage").addEventListener("click", () => void goToPage(currentPageNumber + 1));
    document.getElementById("toolbarPreviousPage").addEventListener("click", () => void goToPage(currentPageNumber - 1));
    document.getElementById("toolbarNextPage").addEventListener("click", () => void goToPage(currentPageNumber + 1));
    document.getElementById("zoomOut").addEventListener("click", () => void changeZoom(1 / 1.15));
    document.getElementById("zoomIn").addEventListener("click", () => void changeZoom(1.15));
    document.getElementById("toolbarZoomOut").addEventListener("click", () => void changeZoom(1 / 1.15));
    document.getElementById("toolbarZoomIn").addEventListener("click", () => void changeZoom(1.15));
    document.getElementById("fitWidth").addEventListener("click", () => void fitWidth());
    document.getElementById("toolbarFitWidth").addEventListener("click", () => void fitWidth());
    pageNumberInput.addEventListener("change", () => void goToPage(pageNumberInput.value));
    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") void goToPage(currentPageNumber + 1);
      if (event.key === "ArrowLeft") void goToPage(currentPageNumber - 1);
    });

    let resizeTimeout = null;
    window.addEventListener("resize", () => {
      if (!fitWidthRequested || !pdfDocument) return;
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        void fitWidth();
      }, 120);
    });

    async function loadPdf() {
      viewerEmptyState.hidden = false;
      try {
        const task = pdfjsLib.getDocument({
          url: "${safeDownloadUrl}",
          cMapUrl: "/assets/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/assets/pdfjs/standard_fonts/",
          wasmUrl: "/assets/pdfjs/wasm/",
          useWasm: true,
        });

        pdfDocument = await task.promise;
        totalPages = pdfDocument.numPages || 0;
        if (!totalPages) {
          setStatus("This PDF did not expose any renderable pages.", true);
          return;
        }
        updateUi();
        await renderCurrentPage();
      } catch (error) {
        console.error(error);
        viewerEmptyState.hidden = false;
        viewerEmptyState.textContent = "The PDF could not be loaded in the embedded viewer.";
        setStatus("Failed to load the requested PDF. Download it directly if the file still exists.", true);
      }
    }

    updateUi();
    void loadPdf();
  </script>
</body>
</html>`;
}
