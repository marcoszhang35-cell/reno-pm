"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Role = "worker" | "sales" | "manager" | "boss";

type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  trade_type: string | null;
  is_active: boolean;
  created_at: string;
};

type CurrentProfile = {
  id: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
};

const ROLE_LABELS: Record<Role, string> = {
  worker: "工人",
  sales: "销售",
  manager: "主管",
  boss: "高级老板",
};

const ROLE_OPTIONS: Role[] = ["worker", "sales", "manager", "boss"];

const TRADE_OPTIONS = [
  { value: "carpenter", label: "木工" },
  { value: "plumber", label: "水工" },
  { value: "electrician", label: "电工" },
  { value: "painter", label: "油漆工" },
  { value: "tiler", label: "贴砖工" },
  { value: "waterproof", label: "防水工" },
  { value: "general", label: "杂工 / 通用" },
] as const;

function getRoleOptionsForCreator(currentRole: Role | null): Role[] {
  if (currentRole === "boss") return ROLE_OPTIONS;
  if (currentRole === "manager") return ["worker", "sales", "manager"];
  return [];
}

function getRoleOptionsForEditing(currentRole: Role | null, targetUserRole: Role): Role[] {
  if (currentRole === "boss") return ROLE_OPTIONS;
  if (currentRole === "manager") {
    if (targetUserRole === "boss") return ["boss"];
    return ["worker", "sales", "manager"];
  }
  return [];
}

function getTradeLabel(trade: string | null) {
  const found = TRADE_OPTIONS.find((x) => x.value === trade);
  return found?.label || "—";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [pageDenied, setPageDenied] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "worker" as Role,
    trade_type: "general",
  });

  const createRoleOptions = useMemo(
    () => getRoleOptionsForCreator(currentProfile?.role || null),
    [currentProfile?.role]
  );

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  async function fetchCurrentProfile() {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) return null;

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("id,full_name,role,is_active")
      .eq("id", userRes.user.id)
      .single();

    if (profileErr || !profile) return null;

    return profile as CurrentProfile;
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id,email,full_name,role,trade_type,is_active,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      return;
    }

    setUsers((data || []) as UserProfile[]);
  }

  async function initPage() {
    setLoading(true);
    setMsg("");

    const profile = await fetchCurrentProfile();

    if (!profile || !profile.is_active || (profile.role !== "manager" && profile.role !== "boss")) {
      setCurrentProfile(null);
      setPageDenied(true);
      setLoading(false);
      return;
    }

    setCurrentProfile(profile);
    setPageDenied(false);
    await loadUsers();
    setLoading(false);
  }

  useEffect(() => {
    initPage();
  }, []);

  function updateLocalUser(id: string, patch: Partial<UserProfile>) {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;

        const next = { ...u, ...patch };

        if (next.role !== "worker") {
          next.trade_type = null;
        } else if (!next.trade_type) {
          next.trade_type = "general";
        }

        return next;
      })
    );
  }

  function canEditTarget(user: UserProfile) {
    if (!currentProfile) return false;
    if (currentProfile.role === "boss") return true;
    if (currentProfile.role === "manager") return user.role !== "boss";
    return false;
  }

  function canToggleTarget(user: UserProfile) {
    if (!currentProfile) return false;
    if (currentProfile.role === "boss") return true;
    if (currentProfile.role === "manager") return user.role !== "boss";
    return false;
  }

  async function handleCreateUser() {
    setMsg("");

    if (!currentProfile) {
      setMsg("当前账号无权限");
      return;
    }

    if (!form.email || !form.password || !form.full_name) {
      setMsg("请填写邮箱、初始密码和姓名");
      return;
    }

    if (currentProfile.role === "manager" && form.role === "boss") {
      setMsg("主管不能创建高级老板账号");
      return;
    }

    const token = await getAccessToken();

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...form,
        trade_type: form.role === "worker" ? form.trade_type : null,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setMsg(result.error || "创建失败");
      return;
    }

    setMsg("用户创建成功");
    setForm({
      email: "",
      password: "",
      full_name: "",
      role: "worker",
      trade_type: "general",
    });
    await loadUsers();
  }

  async function handleUpdateUser(user: UserProfile) {
    setMsg("");

    if (!currentProfile) {
      setMsg("当前账号无权限");
      return;
    }

    if (!canEditTarget(user)) {
      setMsg("你没有权限修改该用户");
      return;
    }

    if (currentProfile.role === "manager" && user.role === "boss") {
      setMsg("主管不能修改高级老板");
      return;
    }

    setSavingUserId(user.id);
    const token = await getAccessToken();

    const res = await fetch("/api/admin/users/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        full_name: user.full_name,
        role: user.role,
        trade_type: user.role === "worker" ? user.trade_type : null,
      }),
    });

    const result = await res.json();
    setSavingUserId(null);

    if (!res.ok) {
      setMsg(result.error || "更新失败");
      return;
    }

    setMsg("用户信息已更新");
    await loadUsers();
  }

  async function handleToggleActive(user: UserProfile) {
    setMsg("");

    if (!currentProfile) {
      setMsg("当前账号无权限");
      return;
    }

    if (!canToggleTarget(user)) {
      setMsg("你没有权限启用或禁用该用户");
      return;
    }

    if (currentProfile.id === user.id && user.is_active) {
      setMsg("不能禁用当前正在登录的账号");
      return;
    }

    setSavingUserId(user.id);
    const token = await getAccessToken();

    const res = await fetch("/api/admin/users/toggle-active", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        is_active: !user.is_active,
      }),
    });

    const result = await res.json();
    setSavingUserId(null);

    if (!res.ok) {
      setMsg(result.error || "操作失败");
      return;
    }

    setMsg(user.is_active ? "账号已禁用" : "账号已启用");
    await loadUsers();
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">用户管理</div>
          <div className="mt-2 text-sm text-neutral-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (pageDenied || !currentProfile) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">无权限访问</div>
          <div className="mt-2 text-sm text-neutral-500">
            只有主管和高级老板可以进入用户管理页面。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">用户管理</h1>
            <p className="mt-2 text-sm text-neutral-500">
              在这里创建账号，并设置角色、工种与启用状态。
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            当前登录：{currentProfile.full_name || "未命名"} / {ROLE_LABELS[currentProfile.role]}
          </div>
        </div>

        {msg ? <div className="mt-4 text-sm text-red-600">{msg}</div> : null}
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">创建新用户</h2>

          <button
            onClick={loadUsers}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            刷新列表
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="rounded-2xl border px-4 py-3"
            placeholder="邮箱"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />

          <input
            className="rounded-2xl border px-4 py-3"
            placeholder="初始密码"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          />

          <input
            className="rounded-2xl border px-4 py-3"
            placeholder="姓名"
            value={form.full_name}
            onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
          />

          <select
            className="rounded-2xl border px-4 py-3"
            value={form.role}
            onChange={(e) =>
              setForm((prev) => {
                const nextRole = e.target.value as Role;
                return {
                  ...prev,
                  role: nextRole,
                  trade_type: nextRole === "worker" ? prev.trade_type : "general",
                };
              })
            }
          >
            {createRoleOptions.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>

          {form.role === "worker" ? (
            <select
              className="rounded-2xl border px-4 py-3"
              value={form.trade_type}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, trade_type: e.target.value }))
              }
            >
              {TRADE_OPTIONS.map((trade) => (
                <option key={trade.value} value={trade.value}>
                  {trade.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-2xl border bg-neutral-50 px-4 py-3 text-sm text-neutral-400">
              非工人角色无需选择工种
            </div>
          )}

          <button
            onClick={handleCreateUser}
            className="rounded-2xl bg-black px-4 py-3 font-medium text-white"
          >
            创建账号
          </button>
        </div>

        {currentProfile.role === "manager" ? (
          <div className="mt-3 text-xs text-neutral-500">
            当前为主管权限：可以创建工人 / 销售 / 主管，不能创建高级老板。
          </div>
        ) : (
          <div className="mt-3 text-xs text-neutral-500">
            当前为高级老板权限：可以创建全部角色。
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">用户列表</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50 text-left">
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">工种</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const editable = canEditTarget(user);
                const toggleable = canToggleTarget(user);
                const roleOptions = getRoleOptionsForEditing(currentProfile.role, user.role);

                return (
                  <tr key={user.id} className="border-t">
                    <td className="px-4 py-3">
                      <input
                        className="w-full rounded-xl border px-3 py-2 disabled:bg-neutral-100"
                        value={user.full_name || ""}
                        disabled={!editable}
                        onChange={(e) =>
                          updateLocalUser(user.id, { full_name: e.target.value })
                        }
                      />
                    </td>

                    <td className="px-4 py-3">{user.email || "—"}</td>

                    <td className="px-4 py-3">
                      <select
                        className="rounded-xl border px-3 py-2 disabled:bg-neutral-100"
                        value={user.role}
                        disabled={!editable}
                        onChange={(e) => {
                          const nextRole = e.target.value as Role;
                          updateLocalUser(user.id, {
                            role: nextRole,
                            trade_type:
                              nextRole === "worker"
                                ? (user.trade_type || "general")
                                : null,
                          });
                        }}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      {user.role === "worker" ? (
                        <select
                          className="rounded-xl border px-3 py-2 disabled:bg-neutral-100"
                          value={user.trade_type || "general"}
                          disabled={!editable}
                          onChange={(e) =>
                            updateLocalUser(user.id, { trade_type: e.target.value })
                          }
                        >
                          {TRADE_OPTIONS.map((trade) => (
                            <option key={trade.value} value={trade.value}>
                              {trade.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-neutral-400">{getTradeLabel(user.trade_type)}</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          user.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {user.is_active ? "启用中" : "已禁用"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {user.created_at ? new Date(user.created_at).toLocaleString() : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateUser(user)}
                          disabled={!editable || savingUserId === user.id}
                          className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          保存
                        </button>

                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={!toggleable || savingUserId === user.id}
                          className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.is_active ? "禁用" : "启用"}
                        </button>
                      </div>

                      {!editable && (
                        <div className="mt-2 text-xs text-neutral-400">
                          当前账号无权限修改该用户
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}