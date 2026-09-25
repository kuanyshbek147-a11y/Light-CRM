import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../shared/config/api";

type TeamUser = {
  id: string;
  full_name: string;
  login: string | null;
  email: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
};

const MIN_PASSWORD = 8;

async function teamRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/team${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось выполнить действие");
  }
  return data;
}

function roleLabel(role: string): string {
  return role === "admin" ? "Администратор" : "Менеджер";
}

/** Владелец кабинета сам добавляет менеджеров, отключает уволенных и сбрасывает пароль. */
export function TeamMembers({ token }: { token: string }): JSX.Element {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", login: "", password: "", role: "manager" });

  const load = useCallback(async () => {
    try {
      const data = await teamRequest<{ users: TeamUser[]; currentUserId: string }>(token, "/users");
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Не удалось загрузить сотрудников" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (form.password.length < MIN_PASSWORD) {
      setMessage({ ok: false, text: `Пароль — минимум ${MIN_PASSWORD} символов` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await teamRequest(token, "/users", { method: "POST", body: JSON.stringify(form) });
      setMessage({
        ok: true,
        text: `${form.fullName} добавлен(а). Передайте сотруднику логин «${form.login.trim().toLowerCase()}» и пароль.`
      });
      setForm({ fullName: "", login: "", password: "", role: "manager" });
      setFormOpen(false);
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Не удалось добавить сотрудника" });
    } finally {
      setBusy(false);
    }
  }

  async function update(user: TeamUser, patch: { isActive?: boolean; password?: string }, done: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await teamRequest(token, `/users/${user.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setMessage({ ok: true, text: done });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Не удалось сохранить" });
    } finally {
      setBusy(false);
    }
  }

  function resetPassword(user: TeamUser): void {
    const password = window.prompt(`Новый пароль для «${user.full_name}» (минимум ${MIN_PASSWORD} символов):`);
    if (password === null) {
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setMessage({ ok: false, text: `Пароль — минимум ${MIN_PASSWORD} символов` });
      return;
    }
    void update(user, { password }, `Пароль для «${user.full_name}» изменён. Передайте его сотруднику.`);
  }

  function toggleActive(user: TeamUser): void {
    if (user.is_active && !window.confirm(`Отключить «${user.full_name}»? Сотрудник сразу потеряет доступ к CRM.`)) {
      return;
    }
    void update(
      user,
      { isActive: !user.is_active },
      user.is_active ? `«${user.full_name}» больше не может войти.` : `«${user.full_name}» снова может войти.`
    );
  }

  return (
    <div className="profileCard teamMembers" data-testid="settings-team">
      <p className="sidebarHint">
        Добавьте менеджеров — у каждого будет свой вход, а диалоги будут распределяться между ними.
      </p>
      {loading ? <p className="sidebarHint">Загружаем…</p> : null}
      <ul className="teamMembersList">
        {users.map((user) => (
          <li key={user.id} className={`teamMemberRow${user.is_active ? "" : " inactive"}`}>
            <div className="teamMemberInfo">
              <strong>
                {user.full_name}
                {user.id === currentUserId ? " (вы)" : ""}
              </strong>
              <span>
                {roleLabel(user.role)} · логин {user.login || user.email}
                {user.is_active ? "" : " · отключён"}
              </span>
            </div>
            {user.id === currentUserId ? null : (
              <div className="teamMemberActions">
                <button type="button" className="textButton" disabled={busy} onClick={() => resetPassword(user)}>
                  Сменить пароль
                </button>
                <button
                  type="button"
                  className={`textButton${user.is_active ? " dangerButton" : ""}`}
                  disabled={busy}
                  onClick={() => toggleActive(user)}
                >
                  {user.is_active ? "Отключить" : "Включить"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {formOpen ? (
        <form className="teamMemberForm" onSubmit={(event) => void addUser(event)}>
          <label className="loginField">
            <span className="loginFieldLabel">Имя</span>
            <input
              className="loginInput"
              value={form.fullName}
              placeholder="Например, Айгерим"
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </label>
          <label className="loginField">
            <span className="loginFieldLabel">Логин для входа</span>
            <input
              className="loginInput"
              value={form.login}
              autoCapitalize="none"
              placeholder="латиницей, например aigerim"
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            />
          </label>
          <label className="loginField">
            <span className="loginFieldLabel">Пароль</span>
            <input
              className="loginInput"
              type="text"
              autoComplete="off"
              value={form.password}
              placeholder={`Минимум ${MIN_PASSWORD} символов`}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </label>
          <label className="loginField">
            <span className="loginFieldLabel">Роль</span>
            <select
              className="loginInput"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="manager">Менеджер — работает с диалогами и сделками</option>
              <option value="admin">Администратор — ещё настройки, каналы и сотрудники</option>
            </select>
          </label>
          <div className="teamMemberFormActions">
            <button
              type="submit"
              className="primaryButton"
              disabled={busy || !form.fullName.trim() || !form.login.trim() || !form.password}
            >
              {busy ? "Добавляем…" : "Добавить"}
            </button>
            <button type="button" className="secondaryButton" onClick={() => setFormOpen(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="primaryButton" onClick={() => setFormOpen(true)}>
          + Добавить сотрудника
        </button>
      )}

      {message ? (
        <p className={message.ok ? "settingsPasswordOk" : "loginError"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
