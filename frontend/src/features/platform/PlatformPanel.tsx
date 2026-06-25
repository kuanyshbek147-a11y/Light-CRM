import { useCallback, useEffect, useState } from "react";
import {
  createPlatformWorkspace,
  createPlatformWorkspaceUser,
  loadPlatformWorkspaceDetail,
  loadPlatformWorkspaces,
  updatePlatformUser,
  type PlatformWorkspace,
  type PlatformWorkspaceDetail
} from "./api";

type Props = {
  authToken: string;
};

const emptyCreateForm = {
  name: "",
  adminFullName: "",
  adminEmail: "",
  adminLogin: "",
  adminPassword: ""
};

const emptyUserForm = {
  fullName: "",
  email: "",
  login: "",
  password: "",
  role: "manager" as "admin" | "manager"
};

export function PlatformPanel({ authToken }: Props): JSX.Element {
  const [workspaces, setWorkspaces] = useState<PlatformWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<PlatformWorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [creating, setCreating] = useState(false);
  const [addingUser, setAddingUser] = useState(false);

  const refreshList = useCallback(async () => {
    const items = await loadPlatformWorkspaces(authToken);
    setWorkspaces(items);
    return items;
  }, [authToken]);

  const refreshDetail = useCallback(
    async (workspaceId: string) => {
      const next = await loadPlatformWorkspaceDetail(authToken, workspaceId);
      setDetail(next);
      return next;
    },
    [authToken]
  );

  useEffect(() => {
    setLoading(true);
    setError("");
    void refreshList()
      .then((items) => {
        setSelectedId((current) => current || items[0]?.id || "");
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void refreshDetail(selectedId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки компании");
    });
  }, [selectedId, refreshDetail]);

  async function handleCreateWorkspace(): Promise<void> {
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const result = await createPlatformWorkspace(authToken, createForm);
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      setSuccess("Компания создана. Передайте клиенту логин и пароль admin.");
      await refreshList();
      setSelectedId(result.workspaceId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ошибка создания");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddUser(): Promise<void> {
    if (!selectedId) {
      return;
    }
    setAddingUser(true);
    setError("");
    setSuccess("");
    try {
      await createPlatformWorkspaceUser(authToken, selectedId, userForm);
      setUserForm(emptyUserForm);
      setSuccess("Пользователь добавлен");
      await refreshDetail(selectedId);
      await refreshList();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Ошибка добавления");
    } finally {
      setAddingUser(false);
    }
  }

  async function toggleUserActive(userId: string, isActive: boolean): Promise<void> {
    setError("");
    try {
      await updatePlatformUser(authToken, userId, { isActive: !isActive });
      if (selectedId) {
        await refreshDetail(selectedId);
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Ошибка обновления");
    }
  }

  return (
    <section className="integrationsPanel card platformPanel">
      <div className="integrationsPanelHeader">
        <div>
          <h2 className="integrationsPanelTitle">Компании платформы</h2>
          <p className="integrationsHint">
            Создавайте отдельные кабинеты для клиентов. Каждая компания — свой workspace, admin и операторы.
            WhatsApp подключает admin компании в разделе «Интеграции».
          </p>
        </div>
        <button type="button" className="primaryButton" onClick={() => setCreateOpen((open) => !open)}>
          {createOpen ? "Скрыть форму" : "Новая компания"}
        </button>
      </div>

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

      {createOpen ? (
        <div className="integrationsCard platformFormCard">
          <div className="integrationsTitle">Новая компания + admin</div>
          <div className="platformFormGrid">
            <input
              className="filterInput"
              placeholder="Название компании"
              value={createForm.name}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="filterInput"
              placeholder="ФИО admin"
              value={createForm.adminFullName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, adminFullName: event.target.value }))}
            />
            <input
              className="filterInput"
              placeholder="Email admin"
              value={createForm.adminEmail}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, adminEmail: event.target.value }))}
            />
            <input
              className="filterInput"
              placeholder="Логин admin"
              value={createForm.adminLogin}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, adminLogin: event.target.value }))}
            />
            <input
              className="filterInput"
              type="password"
              placeholder="Пароль admin (мин. 6)"
              value={createForm.adminPassword}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, adminPassword: event.target.value }))}
            />
          </div>
          <button
            type="button"
            className="primaryButton"
            disabled={creating}
            onClick={() => void handleCreateWorkspace()}
          >
            {creating ? "Создание..." : "Создать компанию"}
          </button>
        </div>
      ) : null}

      <div className="platformLayout">
        <div className="integrationsCard platformListCard">
          <div className="integrationsTitle">Список компаний</div>
          {loading ? <p className="integrationsHint">Загрузка...</p> : null}
          {!loading && workspaces.length === 0 ? (
            <p className="integrationsHint">Пока нет компаний. Создайте первую.</p>
          ) : null}
          <div className="platformWorkspaceList">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className={`platformWorkspaceItem ${selectedId === workspace.id ? "active" : ""}`}
                onClick={() => setSelectedId(workspace.id)}
              >
                <div className="platformWorkspaceName">{workspace.name}</div>
                <div className="platformWorkspaceMeta">
                  <span>{workspace.usersCount} польз.</span>
                  <span>{workspace.conversationsCount} диал.</span>
                  <span>{workspace.whatsappConnected ? "WA ✓" : "WA —"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {detail ? (
          <div className="integrationsCard platformDetailCard">
            <div className="integrationsTitle">{detail.workspace.name}</div>
            <p className="integrationsHint">
              ID: {detail.workspace.id}
              {detail.whatsapp.connected
                ? ` · WhatsApp подключён (WABA ${detail.whatsapp.wabaId || "—"})`
                : " · WhatsApp не подключён — клиент подключает сам как admin"}
            </p>

            <div className="platformUsersHeader">Пользователи</div>
            <div className="platformUsersTable">
              {detail.users.map((user) => (
                <div key={user.id} className="platformUserRow">
                  <div>
                    <div className="platformUserName">
                      {user.fullName}{" "}
                      <span className="platformUserRole">{user.role === "admin" ? "admin" : "оператор"}</span>
                    </div>
                    <div className="platformUserMeta">
                      {user.login ? `логин: ${user.login}` : ""} · {user.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`secondaryButton ${user.isActive ? "" : "dangerButton"}`}
                    onClick={() => void toggleUserActive(user.id, user.isActive)}
                  >
                    {user.isActive ? "Активен" : "Отключён"}
                  </button>
                </div>
              ))}
            </div>

            <div className="platformUsersHeader">Добавить пользователя</div>
            <div className="platformFormGrid">
              <input
                className="filterInput"
                placeholder="ФИО"
                value={userForm.fullName}
                onChange={(event) => setUserForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />
              <input
                className="filterInput"
                placeholder="Email"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                className="filterInput"
                placeholder="Логин"
                value={userForm.login}
                onChange={(event) => setUserForm((prev) => ({ ...prev, login: event.target.value }))}
              />
              <input
                className="filterInput"
                type="password"
                placeholder="Пароль"
                value={userForm.password}
                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <select
                className="filterInput"
                value={userForm.role}
                onChange={(event) =>
                  setUserForm((prev) => ({
                    ...prev,
                    role: event.target.value === "admin" ? "admin" : "manager"
                  }))
                }
              >
                <option value="manager">Оператор (manager)</option>
                <option value="admin">Admin компании</option>
              </select>
            </div>
            <button
              type="button"
              className="primaryButton"
              disabled={addingUser}
              onClick={() => void handleAddUser()}
            >
              {addingUser ? "Добавление..." : "Добавить пользователя"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
