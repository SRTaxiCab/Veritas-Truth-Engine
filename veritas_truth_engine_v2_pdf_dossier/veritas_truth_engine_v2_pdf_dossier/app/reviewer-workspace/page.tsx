export default async function ReviewerWorkspacePage() {
  const res = await fetch("http://localhost:3000/api/reviewer-workspace", { cache: "no-store" }).catch(() => null);
  const data = res ? await res.json() : { openTasks: [], inReviewTasks: [], resolvedTasks: [] };

  const renderTasks = (tasks: any[]) =>
    tasks.length ? (
      <div className="grid gap-4">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow">
            <div className="text-sm text-zinc-400">{task.type} · {task.priority}</div>
            <div className="mt-1 text-lg font-semibold">{task.title}</div>
            <div className="mt-2 text-sm text-zinc-300">{task.summary}</div>
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
        No tasks in this lane.
      </div>
    );

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold">Truth Engine Reviewer Workspace</h1>
        <p className="mt-2 text-zinc-400">
          Human adjudication queue for ambiguous entity resolution, contradiction review, and claim assessment.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Open</h2>
            {renderTasks(data.openTasks || [])}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">In review</h2>
            {renderTasks(data.inReviewTasks || [])}
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Resolved</h2>
            {renderTasks(data.resolvedTasks || [])}
          </section>
        </div>
      </div>
    </main>
  );
}
