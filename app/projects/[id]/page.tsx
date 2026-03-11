"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { stageMeta } from "@/config/options";
import P1Form from "./P1Form";
import P2Bootstrap from "./P2Bootstrap";
import P3Materials from "./P3Materials";
import P4Construction from "./P4Construction";
import PaymentFlow from "./PaymentFlow";
import type { P1Handle } from "./P1Form";
import type { P3Handle } from "./P3Materials";
import type { P4Handle } from "./P4Construction";

type Project = {
  id: string;
  source: string | null;
  address: string;
  client_name: string;
  client_phone: string | null;
  created_date: string;
  note: string | null;
  target_areas: string[];
  stage: string;
};

type Role = "worker" | "sales" | "manager" | "boss";

const TABS = [
  { key: "P1", label: "P1 新建" },
  { key: "P2", label: "P2 报价" },
  { key: "PAY", label: "付款流程" },
  { key: "P3", label: "P3 进场" },
  { key: "P4", label: "P4 施工" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function stageToTab(stage?: string): TabKey {
  switch (stage) {
    case "P1_NEW":
      return "P1";
    case "P2_MEASURE_QUOTE":
      return "P2";
    case "PAY_PENDING":
      return "PAY";
    case "P3_SITE":
    case "P3_START_MATERIALS":
      return "P3";
    case "P4_CONSTRUCTION":
      return "P4";
    case "CLOSED":
      return "P4";
    default:
      return "P1";
  }
}

function tabToStage(tab: TabKey): string {
  switch (tab) {
    case "P1":
      return "P1_NEW";
    case "P2":
      return "P2_MEASURE_QUOTE";
    case "PAY":
      return "PAY_PENDING";
    case "P3":
      return "P3_START_MATERIALS";
    case "P4":
      return "P4_CONSTRUCTION";
    default:
      return "P1_NEW";
  }
}

function nextTab(tab: TabKey): TabKey | null {
  switch (tab) {
    case "P1":
      return "P2";
    case "P2":
      return "PAY";
    case "PAY":
      return "P3";
    case "P3":
      return "P4";
    case "P4":
      return null;
    default:
      return null;
  }
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();

  const [tab, setTab] = useState<TabKey>("P1");
  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [denied, setDenied] = useState(false);

  const p1Ref = useRef<P1Handle | null>(null);
  const p3Ref = useRef<P3Handle | null>(null);
  const p4Ref = useRef<P4Handle | null>(null);
  const didInitTab = useRef(false);

  async function load() {
    try {
      setMsg("");
      setDenied(false);
      setLoading(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setProject(null);
        setDenied(true);
        setMsg("未登录，请先登录。");
        return;
      }

      const userId = userRes.user.id;

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles")
        .select("role,is_active")
        .eq("id", userId)
        .single();

      if (profileErr || !profile) {
        setProject(null);
        setDenied(true);
        setMsg("未找到用户权限资料，请联系管理员。");
        return;
      }

      if (!profile.is_active) {
        setProject(null);
        setDenied(true);
        setMsg("当前账号已被禁用。");
        return;
      }

      const currentRole = profile.role as Role;
      setRole(currentRole);

      const { data, error } = await supabase
        .from("projects")
        .select("id,source,address,client_name,client_phone,created_date,note,target_areas,stage")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        setProject(null);
        setDenied(true);
        setMsg(error?.message || "项目不存在");
        return;
      }

      const p = data as Project;

      if (currentRole === "worker") {
        const currentTab = stageToTab(p.stage);

        if (currentTab !== "P4") {
          setProject(null);
          setDenied(true);
          setMsg("你没有权限查看该项目。工人只能查看自己被分配的 P4 项目。");
          return;
        }

        const { data: assignment, error: assignmentErr } = await supabase
          .from("project_assignments")
          .select("id")
          .eq("project_id", p.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (assignmentErr) {
          setProject(null);
          setDenied(true);
          setMsg(assignmentErr.message);
          return;
        }

        if (!assignment) {
          setProject(null);
          setDenied(true);
          setMsg("你没有权限查看该项目。该项目未分配给当前工人。");
          return;
        }

        setProject(p);
        setTab("P4");
        didInitTab.current = true;
        return;
      }

      setProject(p);

      if (!didInitTab.current) {
        setTab(stageToTab(p.stage));
        didInitTab.current = true;
      }
    } catch (err) {
      console.error("Load crash:", err);
      setProject(null);
      setDenied(true);
      setMsg("加载项目失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    didInitTab.current = false;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const meta = useMemo(() => stageMeta(project?.stage || "P1_NEW"), [project?.stage]);

  const visibleTabs = useMemo(() => {
    if (role === "worker") {
      return TABS.filter((t) => t.key === "P4");
    }
    return TABS;
  }, [role]);

  const isWorker = role === "worker";

  async function flushCurrentPageBeforeStageAction() {
    if (tab === "P1") {
    await p1Ref.current?.flushAll();
    }
    if (tab === "P3") {
      await p3Ref.current?.flushAll();
    }
    if (tab === "P4") {
      await p4Ref.current?.flushAll();
    }
  }

  async function reloadProjectOnly(projectId: string) {
    const { data, error } = await supabase
      .from("projects")
      .select("id,source,address,client_name,client_phone,created_date,note,target_areas,stage")
      .eq("id", projectId)
      .single();

    if (error) {
      setMsg(error.message);
      return;
    }

    const p = data as Project;

    if (role === "worker" && stageToTab(p.stage) !== "P4") {
      setDenied(true);
      setProject(null);
      setMsg("该项目已不在你的可查看范围内。");
      return;
    }

    setProject(p);

    if (role === "worker") {
      setTab("P4");
    }
  }

  async function setStage(stage: string) {
    if (!project || isWorker) return;
    setMsg("");

    try {
      await flushCurrentPageBeforeStageAction();
    } catch (e: any) {
      return setMsg(e?.message || "保存失败，请重试");
    }

    const { error } = await supabase
      .from("projects")
      .update({ stage })
      .eq("id", project.id);

    if (error) return setMsg(error.message);

    await reloadProjectOnly(project.id);
  }

  async function saveAndSetCurrentStage() {
    if (!project || isWorker) return;
    setMsg("");

    try {
      await flushCurrentPageBeforeStageAction();
    } catch (e: any) {
      return setMsg(e?.message || "保存失败，请重试");
    }

    const currentStage = tabToStage(tab);

    const { error } = await supabase
      .from("projects")
      .update({ stage: currentStage })
      .eq("id", project.id);

    if (error) return setMsg(error.message);

    await reloadProjectOnly(project.id);
    setMsg("当前页面已保存，状态已同步");
  }

  async function goNextStageFromCurrentPage() {
    if (!project || isWorker) return;
    setMsg("");

    try {
      await flushCurrentPageBeforeStageAction();
    } catch (e: any) {
      return setMsg(e?.message || "保存失败，请重试");
    }

    const nt = nextTab(tab);
    if (!nt) return;

    const nextStage = tabToStage(nt);

    const { error } = await supabase
      .from("projects")
      .update({ stage: nextStage })
      .eq("id", project.id);

    if (error) return setMsg(error.message);

    await reloadProjectOnly(project.id);
    setTab(nt);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07111d] text-white">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            加载中...
          </div>
        </div>
      </main>
    );
  }

  if (denied || !project) {
    return (
      <main className="min-h-screen bg-[#07111d] text-white">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
            <a href="/projects" className="text-sm text-cyan-300 hover:text-cyan-200">
              ← 返回项目列表
            </a>
            <div className="mt-6 text-2xl font-semibold">无权限访问</div>
            <div className="mt-3 text-sm text-white/70">
              {msg || "项目不存在或你无权查看。"}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07111d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-120px] top-[-80px] h-[320px] w-[320px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-100px] top-[40px] h-[280px] w-[280px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[20%] h-[360px] w-[360px] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
          <div className="h-[3px] w-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400" />

          <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-start md:justify-between md:px-6">
            <div className="space-y-3">
              <a
                href="/projects"
                className="inline-flex items-center text-sm text-cyan-300 hover:text-cyan-200"
              >
                ← 返回项目列表
              </a>

              <div>
                <div className="text-xs uppercase tracking-[0.32em] text-white/40">
                  Project Console
                </div>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
                  {project.client_name}
                </h1>
                <div className="mt-2 text-sm text-white/65">{project.address}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(project.target_areas || []).map((area) => (
                  <span
                    key={area}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/15 px-3 py-1 text-xs font-medium text-cyan-200">
                {meta.label}
              </span>

              <div className="grid gap-3 sm:grid-cols-2 md:w-[340px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-white/45">创建日期</div>
                  <div className="mt-1 text-sm font-medium">{project.created_date}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs text-white/45">联系方式</div>
                  <div className="mt-1 text-sm font-medium">
                    {project.client_phone || "未填写"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 md:px-6">
            <div className="flex gap-2 overflow-x-auto">
              {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "whitespace-nowrap rounded-full border px-4 py-2 text-sm transition " +
                    (tab === t.key
                      ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {isWorker && (
              <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100/90">
                当前权限：仅查看自己被分配的 P4 项目，不可查看报价、付款或其他流程页面。
              </div>
            )}
          </div>
        </section>

        {msg && !denied && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {msg}
          </div>
        )}

        <section className="rounded-[30px] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl md:p-5">
          {!isWorker && tab === "P1" && (
  <P1Form ref={p1Ref} project={project} onSaved={load} />
)}

          {!isWorker && tab === "P2" && (
            <P2Bootstrap
              projectId={project.id}
              clientName={project.client_name}
              address={project.address}
              onDone={load}
              onGoPayment={() => setTab("PAY")}
            />
          )}

          {!isWorker && tab === "PAY" && (
            <PaymentFlow
              projectId={project.id}
              clientName={project.client_name}
              address={project.address}
              onDone={load}
            />
          )}

          {!isWorker && tab === "P3" && (
            <P3Materials ref={p3Ref} projectId={project.id} onChanged={load} />
          )}

          {tab === "P4" && (
            <P4Construction ref={p4Ref} projectId={project.id} onChanged={load} />
          )}
        </section>

        {!isWorker && (
          <section className="rounded-[30px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
            <div className="text-lg font-semibold">页面操作</div>
            <div className="mt-1 text-sm text-white/55">
              当前页面保存后，可同步数据库阶段并推进项目流程。
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={saveAndSetCurrentStage}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium text-white transition hover:bg-white/10"
              >
                保存当前页
              </button>

              {tab !== "P4" ? (
                <button
                  onClick={goNextStageFromCurrentPage}
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 font-medium text-slate-950 transition hover:opacity-95"
                >
                  进入下一状态 →
                </button>
              ) : (
                <button
                  onClick={() => setStage("CLOSED")}
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-medium text-slate-950 transition hover:opacity-95"
                >
                  完工关闭
                </button>
              )}
            </div>

            <div className="mt-4 text-xs text-white/45">
              当前页面：{tab} ｜ 当前数据库阶段：{project.stage}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}