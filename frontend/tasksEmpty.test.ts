import assert from "node:assert/strict";
import test from "node:test";
import { showFollowUpReminders } from "./src/features/crm/tasksEmpty.ts";

test("напоминание о сроке ответа не висит в пустых выполненных задачах", () => {
  assert.equal(showFollowUpReminders("done", 1), false);
  assert.equal(showFollowUpReminders("done", 0), false);
  assert.equal(showFollowUpReminders("open", 0), false);
  assert.equal(showFollowUpReminders("open", 2), true);
});
