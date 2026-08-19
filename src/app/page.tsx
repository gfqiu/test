import TaskBoard from "@/components/task-board";
import { listTasks } from "@/lib/tasks-store";

export default function Home() {
  const initialTasks = listTasks();
  return <TaskBoard initialTasks={initialTasks} />;
}
