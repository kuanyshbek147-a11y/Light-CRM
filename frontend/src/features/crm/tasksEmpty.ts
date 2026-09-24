/** Напоминание «срок ответа» живёт среди открытых задач, не в пустом списке выполненных. */
export function showFollowUpReminders(taskStatusFilter: "open" | "done", reminderCount: number): boolean {
  return taskStatusFilter === "open" && reminderCount > 0;
}
