/** Напоминание «срок ответа» живёт среди открытых задач, не в пустом списке выполненных. */
export function showFollowUpReminders(taskStatusFilter: "open" | "done", reminderCount: number): boolean {
  return taskStatusFilter === "open" && reminderCount > 0;
}

/** «Пока нет задач» не стоит рядом со списком сроков ответа и не подменяет загруженный список. */
export function showTasksEmptyState(
  taskStatusFilter: "open" | "done",
  taskCount: number,
  reminderCount: number
): boolean {
  if (taskCount > 0) return false;
  if (showFollowUpReminders(taskStatusFilter, reminderCount)) return false;
  return true;
}
