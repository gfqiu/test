"use client";

import { useState } from "react";
import type { Task } from "@/lib/tasks-store";

export default function TaskBoard({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });

    if (res.ok) {
      setTitle("");
      setError(null);
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add task.");
    }
  }

  async function toggleTask(id: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
  }

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Task Board
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            A minimal full-stack demo: the browser talks to a Next.js API route
            that stores tasks on the server.
          </p>
        </header>

        <form onSubmit={addTask} className="mb-6 flex gap-2">
          <input
            aria-label="New task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="flex-1 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-black outline-none focus:border-black/40 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-black px-5 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-300"
          >
            Add
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-3 dark:border-white/15 dark:bg-zinc-900"
            >
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => toggleTask(task.id)}
                className="h-4 w-4 accent-black dark:accent-white"
                aria-label={`Toggle ${task.title}`}
              />
              <span
                className={
                  task.done
                    ? "flex-1 text-zinc-400 line-through"
                    : "flex-1 text-black dark:text-zinc-50"
                }
              >
                {task.title}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-zinc-500">
          {remaining} task{remaining === 1 ? "" : "s"} remaining
        </p>
      </main>
    </div>
  );
}
