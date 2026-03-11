"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { STAGES, stageMeta } from "@/config/options";

type Project = {
  id: string;
  source: string | null;
  address: string;
  client_name: string;
  created_date: string;
  note: string | null;
  target_areas: string[];
  stage: string;
};

const STAGE_ORDER: Record<string, number> = {
  P1_NEW: 1,
  P2_MEASURE_QUOTE: 2,
  PAY_PENDING: 3,
  P3_SITE: 4,
  P3_START_MATERIALS: 4,
  P4_CONSTRUCTION: 5,
  CLOSED: 99,
};

export default function ProjectsHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<string | null>(null);

  async function load() {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setProjects([]);
      setRole(null);
      setTradeType(null);
      return setMsg("未登录，请回到首页登录。");
    }

    const userId = userRes.user.id;

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("role,trade_type,is_active")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      setProjects([]);
      setRole(null);
      setTradeType(null);
      return setMsg("未找到用户权限资料，请联系管理员。");
    }

    if (!profile.is_active) {
      setProjects([]);
      setRole(profile.role ?? null);
      setTradeType(profile.trade_type ?? null);
      return setMsg("当前账号已被禁用。");
    }

    const currentRole = profile.role ?? null;
    const currentTradeType = profile.trade_type ?? null;

    setRole(currentRole);
    setTradeType(currentTradeType);

    if (currentRole === "worker") {
      const { data: assignments, error: assignErr } = await supabase
        .from("project_assignments")
        .select("project_id")
        .eq("user_id", userId);

      if (assignErr) {
        setProjects([]);
        return setMsg(assignErr.message);
      }

      const projectIds = (assignments || []).map((x: { project_id: string }) => x.project_id);

      if (projectIds.length === 0) {
        setProjects([]);
        return;
      }

      const res = await supabase
        .from("projects")
        .select("id,source,address,client_name,created_date,note,target_areas,stage")
        .in("id", projectIds)
        .eq("stage", "CLOSED")
        .order("created_at", { ascending: false });

      if (res.error) {
        setProjects([]);
        return setMsg(res.error.message);
      }

      setProjects((res.data || []) as Project[]);
      return;
    }

    const res = await supabase
      .from("projects")
      .select("id,source,address,client_name,created_date,note,target_areas,stage")
      .order("created_at", { ascending: false });

    if (res.error) {
      setProjects([]);
      return setMsg(res.error.message);
    }

    setProjects((res.data || []) as Project[]);
  }

  useEffect(() => {
    load();
  }, []);

  const visibleStages = useMemo(() => {
    if (role === "worker") {
      return STAGES.filter((s) => s.key === "CLOSED");
    }
    return STAGES;
  }, [role]);

  useEffect(() => {
    if (role === "worker") {
      setStageFilter("CLOSED");
    }
  }, [role]);

  const filtered = useMemo(() => {
  let list = [...projects];

  if (stageFilter !== "ALL") {
    list = list.filter((p) => p.stage === stageFilter);
  }

  const keyword = q.trim().toLowerCase();
  if (keyword) {
    list = list.filter((p) => {
      return (
        (p.client_name || "").toLowerCase().includes(keyword) ||
        (p.address || "").toLowerCase().includes(keyword) ||
        (p.source || "").toLowerCase().includes(keyword) ||
        (p.note || "").toLowerCase().includes(keyword) ||
        (p.stage || "").toLowerCase().includes(keyword) ||
        (p.target_areas || []).join(" ").toLowerCase().includes(keyword)
      );
    });
  }

  list.sort((a, b) => {
    const orderA = STAGE_ORDER[a.stage] ?? 999;
    const orderB = STAGE_ORDER[b.stage] ?? 999;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
  });

  return list;
}, [projects, stageFilter, q]);

  function getStagePillClass(stage: string, active = false) {
    switch (stage) {
      case "P1_NEW":
        return active
          ? "border-slate-300/70 bg-slate-300/20 text-slate-100"
          : "border-slate-400/35 bg-slate-400/10 text-slate-200";
      case "P2_MEASURE_QUOTE":
        return active
          ? "border-sky-300/70 bg-sky-400/20 text-sky-100"
          : "border-sky-400/35 bg-sky-400/10 text-sky-200";
      case "PAY_PENDING":
        return active
          ? "border-emerald-300/70 bg-emerald-400/20 text-emerald-100"
          : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
      case "P3_START_MATERIALS":
        return active
          ? "border-amber-300/70 bg-amber-400/20 text-amber-100"
          : "border-amber-400/35 bg-amber-400/10 text-amber-200";
      case "P4_CONSTRUCTION":
        return active
          ? "border-violet-300/70 bg-violet-400/20 text-violet-100"
          : "border-violet-400/35 bg-violet-400/10 text-violet-200";
      case "CLOSED":
        return active
          ? "border-cyan-300/80 bg-cyan-400/22 text-cyan-100"
          : "border-cyan-400/45 bg-cyan-400/10 text-cyan-200";
      default:
        return active
          ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
          : "border-white/10 bg-white/5 text-white/70";
    }
  }

  function getStageCardClass(stage: string) {
    switch (stage) {
      case "P1_NEW":
        return "border-slate-400/35 bg-gradient-to-br from-slate-900/95 via-slate-800/92 to-slate-900/95";
      case "P2_MEASURE_QUOTE":
        return "border-sky-400/35 bg-gradient-to-br from-sky-950/95 via-slate-900/92 to-sky-900/90";
      case "PAY_PENDING":
        return "border-emerald-400/35 bg-gradient-to-br from-emerald-950/95 via-slate-900/92 to-emerald-900/88";
      case "P3_START_MATERIALS":
        return "border-amber-400/40 bg-gradient-to-br from-amber-950/95 via-slate-900/92 to-orange-900/88";
      case "P4_CONSTRUCTION":
        return "border-violet-400/40 bg-gradient-to-br from-violet-950/95 via-slate-900/92 to-fuchsia-950/88";
      case "CLOSED":
        return "border-cyan-400/45 bg-gradient-to-br from-cyan-950/95 via-slate-900/92 to-sky-950/88";
      default:
        return "border-white/10 bg-white/5";
    }
  }

  return (
    <main className="min-h-screen bg-[#07111d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-120px] top-[-80px] h-[320px] w-[320px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-120px] top-[20px] h-[320px] w-[320px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-140px] left-[18%] h-[360px] w-[360px] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
          <div className="h-[3px] w-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400" />

          <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-start md:justify-between md:px-6">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-white/40">
                Project Console
              </div>
              <h1 className="mt-2 text-2xl font-semibold md:text-3xl">项目</h1>
              <div className="mt-2 text-sm text-white/65">共 {filtered.length} 个项目</div>

              {role === "worker" && (
                <div className="mt-3 inline-flex rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100/90">
                  当前权限：仅查看自己被分配的已完工项目
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {(role === "manager" || role === "boss") && (
                <Link
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85 transition hover:bg-white/10"
                  href="/admin/users"
                >
                  用户管理
                </Link>
              )}

              {(role === "sales" || role === "manager" || role === "boss") && (
                <Link
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:opacity-95"
                  href="/projects/new"
                >
                  + 新建
                </Link>
              )}
            </div>
          </div>

          <div className="px-5 pb-4 md:px-6">
            <div className="flex gap-2 overflow-x-auto">
              {role !== "worker" && (
                <button
                  onClick={() => setStageFilter("ALL")}
                  className={
                    "whitespace-nowrap rounded-full border px-4 py-2 text-sm transition " +
                    (stageFilter === "ALL"
                      ? "border-white/30 bg-white/15 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  全部
                </button>
              )}

              {visibleStages.map((s) => {
                const meta = stageMeta(s.key);
                const active = stageFilter === s.key;

                return (
                  <button
                    key={s.key}
                    onClick={() => setStageFilter(s.key)}
                    className={
                      "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition " +
                      getStagePillClass(s.key, active)
                    }
                  >
                    <span
                      className={
                        "inline-block h-2.5 w-2.5 rounded-full " +
                        (active ? "bg-white" : meta.color)
                      }
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-5 pb-5 md:px-6">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/35 outline-none transition focus:border-cyan-400/40 focus:bg-white/10"
              placeholder="搜索：客户 / 地址 / 阶段 / 备注 / 目标区域"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:bg-white/10"
                onClick={load}
              >
                刷新
              </button>

              <a
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
                href="/"
              >
                登录页
              </a>
            </div>
          </div>
        </section>

        <div className="mt-4 px-1 text-xs text-white/40">
          当前筛选：{stageFilter === "ALL" ? "全部" : stageMeta(stageFilter).label}
          {tradeType ? ` / 工种：${tradeType}` : ""}
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {msg}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => {
            const meta = stageMeta(p.stage);

            return (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className={
                  "group block overflow-hidden rounded-[28px] border shadow-xl backdrop-blur-xl transition hover:brightness-110 active:scale-[0.99] " +
                  getStageCardClass(p.stage)
                }
              >
                <div className="h-[4px] w-full bg-gradient-to-r from-white/70 via-white/20 to-transparent" />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold leading-snug text-white">
                        {p.client_name}
                      </div>
                      <div className="mt-2 text-sm text-white/75">{p.address}</div>
                    </div>

                    <span
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium " +
                        getStagePillClass(p.stage, true)
                      }
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/60">
                    <span>来源：{p.source || "-"}</span>
                    <span>日期：{p.created_date}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(p.target_areas || []).slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/85"
                      >
                        {t}
                      </span>
                    ))}

                    {(p.target_areas || []).length > 4 && (
                      <span className="self-center text-xs text-white/55">
                        +{(p.target_areas || []).length - 4}
                      </span>
                    )}
                  </div>

                  {p.note && (
                    <div className="mt-4 line-clamp-1 text-sm text-white/80">{p.note}</div>
                  )}

                  <div className="mt-5 inline-flex items-center text-sm font-medium text-cyan-200 transition group-hover:text-white">
                    进入详情 →
                  </div>
                </div>
              </a>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 text-sm text-white/65 shadow-xl backdrop-blur-xl">
              {role === "worker"
                ? "暂无已分配给你的已完工项目。"
                : "暂无项目，点右上角“新建”。"}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}