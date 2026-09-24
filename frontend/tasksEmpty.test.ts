import assert from "node:assert/strict";
import test from "node:test";
import { showFollowUpReminders, showTasksEmptyState } from "./src/features/crm/tasksEmpty.ts";

test("напоминание о сроке ответа не висит в пустых выполненных задачах", () => {
  assert.equal(showFollowUpReminders("done", 1), false);
  assert.equal(showFollowUpReminders("done", 0), false);
  assert.equal(showFollowUpReminders("open", 0), false);
  assert.equal(showFollowUpReminders("open", 2), true);
});

test("пустые задачи не показываются рядом со сроком ответа", () => {
  assert.equal(showTasksEmptyState("open", 0, 2), false);
  assert.equal(showTasksEmptyState("open", 1, 2), false);
  assert.equal(showTasksEmptyState("open", 0, 0), true);
  assert.equal(showTasksEmptyState("done", 0, 3), true);
  assert.equal(showTasksEmptyState("done", 1, 0), false);
});
