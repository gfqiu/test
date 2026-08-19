export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

// In-memory store. Resets on server restart; sufficient for a demo app.
const globalForTasks = globalThis as unknown as { __tasks?: Task[] };

const tasks: Task[] = (globalForTasks.__tasks ??= [
  { id: "seed-1", title: "Read the project README", done: true, createdAt: Date.now() - 3000 },
  { id: "seed-2", title: "Run the dev server", done: false, createdAt: Date.now() - 2000 },
]);

export function listTasks(): Task[] {
  return [...tasks].sort((a, b) => a.createdAt - b.createdAt);
}

export function addTask(title: string): Task {
  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    done: false,
    createdAt: Date.now(),
  };
  tasks.push(task);
  return task;
}

export function toggleTask(id: string): Task | undefined {
  const task = tasks.find((t) => t.id === id);
  if (task) task.done = !task.done;
  return task;
}
