import { NextRequest, NextResponse } from "next/server";
import { addTask, listTasks, toggleTask } from "@/lib/tasks-store";

export async function GET() {
  return NextResponse.json({ tasks: listTasks() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { title?: unknown }
    | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json(
      { error: "A non-empty 'title' is required." },
      { status: 400 },
    );
  }

  const task = addTask(title);
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const task = toggleTask(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({ task });
}
