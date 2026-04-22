import path from "node:path";
import process from "node:process";
import { processBulkIngestion, watchBulkIngestion } from "../automation/bulk-ingestion.js";

interface CliOptions {
  inputPath: string;
  recursive: boolean;
  watch: boolean;
  publicImpact: boolean;
  archiveMode: "keep" | "move";
  pollMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const rootDir = process.cwd();
  const defaults: CliOptions = {
    inputPath: path.join(rootDir, "automation", "inbox"),
    recursive: true,
    watch: false,
    publicImpact: false,
    archiveMode: "keep",
    pollMs: 10_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--path" && argv[index + 1]) {
      defaults.inputPath = path.resolve(argv[index + 1]!);
      index += 1;
      continue;
    }
    if (arg === "--watch") {
      defaults.watch = true;
      defaults.archiveMode = "move";
      continue;
    }
    if (arg === "--public-impact") {
      defaults.publicImpact = true;
      continue;
    }
    if (arg === "--non-recursive") {
      defaults.recursive = false;
      continue;
    }
    if (arg === "--move-files") {
      defaults.archiveMode = "move";
      continue;
    }
    if (arg === "--keep-files") {
      defaults.archiveMode = "keep";
      continue;
    }
    if (arg === "--poll-ms" && argv[index + 1]) {
      defaults.pollMs = Math.max(2_000, Number(argv[index + 1]) || defaults.pollMs);
      index += 1;
      continue;
    }
  }

  return defaults;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.watch) {
    console.log(
      JSON.stringify({
        event: "bulk.ingestion.watch.start",
        inputPath: options.inputPath,
        recursive: options.recursive,
        publicImpact: options.publicImpact,
        pollMs: options.pollMs,
        archiveMode: "move",
      })
    );
    await watchBulkIngestion(options);
    return;
  }

  const summary = await processBulkIngestion(options);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
