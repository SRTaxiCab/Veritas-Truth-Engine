import { buildDemoReviewerWorkspace } from "../api/reviewer-workspace";

async function main() {
  const snapshot = await buildDemoReviewerWorkspace();
  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
