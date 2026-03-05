"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STAGES, stageMeta } from "@/config/options";
import P1Form from "./P1Form";
import P2Bootstrap from "./P2Bootstrap";
import P3Materials from "./P3Materials";
import P4Construction from "./P4Construction";
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

const TABS = [
  { key: "P1", label: "P1 新建" },
  { key: "P2", label: "P2 报价" },
  { key: "P3", label: "P3 进场" },
  { key: "P4", label: "P4 施工" },
] as const;

function stageNext(current: string) {
  const idx = STAGES.findIndex((s) => s.key === current);
  if (idx === -1) return null;
  if (current === "CLOSED") return null;
  return STAGES[Math.min(idx + 1, STAGES.length - 1)].key;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("P1");
  const p3Ref = useRef<P3Handle | null>(null);
  const p4Ref = useRef<P4Handle | null>(null);
  function stageToTab(stage?: string): (typeof TABS)[number]["key"] {
  switch (stage) {
    case "P1_NEW":
      return "P1";
    case "P2_MEASURE_QUOTE":
      return "P2";
    case "P3_SITE":
      return "P3";
    case "P4_CONSTRUCTION":
      return "P4";
    case "CLOSED":
      return "P4"; // 你也可以改成 "P1"/"P2"/"P3"，看你想关闭时显示哪页
    default:
      return "P1";
  }
}
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
  try {
    setMsg("");
    setLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .select("id,source,address,client_name,client_phone,created_date,note,target_areas,stage")
      .eq("id", params.id)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      setMsg(error.message);
      setProject(null);
    } else {
      setProject(data as any);
      setTab(stageToTab((data as any)?.stage));
    }
  } catch (err) {
    console.error("Load crash:", err);
    setMsg("加载项目失败");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    load();
  }, [params.id]);

  const meta = useMemo(() => stageMeta(project?.stage || "P1_NEW"), [project?.stage]);
  const ns = useMemo(() => (project ? stageNext(project.stage) : null), [project]);

    async function setStage(stage: string) {
    if (!project) return;
    setMsg("");

    // ✅ 在切阶段前，先把当前页未 blur 的编辑保存掉
    try {
      if (tab === "P3") await p3Ref.current?.flushAll();
      if (tab === "P4") await p4Ref.current?.flushAll();
    } catch (e: any) {
      // 如果保存报错，先提示，不切阶段
      return setMsg(e?.message || "保存失败，请重试");
    }

    const { error } = await supabase.from("projects").update({ stage }).eq("id", project.id);
    if (error) return setMsg(error.message);

    await load();
  }

  if (loading) return <main className="p-4">加载中...</main>;
  if (!project) return <main className="p-4">项目不存在或无权限查看。</main>;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 顶部：彩条 + 返回 + 阶段 */}
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className={`h-2 ${meta.color}`} />
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <a href="/projects" className="text-sm underline">
            ← 返回
          </a>
          <span className={`${meta.color} text-white text-xs px-2 py-1 rounded-full`}>
            {meta.label}
          </span>
        </div>

        {/* 手机 Tab：横向滚动 */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "px-3 py-2 rounded-full border text-sm whitespace-nowrap " +
                  (tab === t.key ? "bg-black text-white border-black" : "bg-white")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {msg && <p className="text-red-600">{msg}</p>}

        {/* 头部摘要卡片（手机友好，一眼看项目） */}
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-xl font-bold">{project.client_name}</div>
          <div className="mt-1 text-sm opacity-90">{project.address}</div>
          <div className="mt-3 text-xs opacity-90 flex flex-wrap gap-x-3 gap-y-1">
            <span>来源：{project.source || "-"}</span>
            <span>日期：{project.created_date}</span>
            <span>ID：{project.id.slice(0, 8)}...</span>
          </div>
        </div>

        {/* 阶段按钮（你要的“确定进入下一阶段”） */}
        <div className="bg-white border rounded-2xl p-4">
          <div className="font-bold">阶段操作</div>
          <div className="mt-3 flex gap-2">
            {ns && ns !== project.stage && (
              <button
                onClick={() => setStage(ns)}
                className="flex-1 px-4 py-3 rounded-xl bg-black text-white font-medium"
              >
                确认进入下一阶段 →
              </button>
            )}

            {project.stage !== "CLOSED" && (
              <button
                onClick={() => setStage("CLOSED")}
                className="px-4 py-3 rounded-xl border font-medium"
              >
                完工关闭
              </button>
            )}
          </div>
          <div className="mt-2 text-xs opacity-80">
            当前阶段 code：{project.stage}
          </div>
        </div>

        {/* 四大模块内容区 */}
        {tab === "P1" && <P1Form project={project} onSaved={load} />}

        {tab === "P2" && <P2Bootstrap projectId={project.id} onDone={load} />}

       {tab === "P3" && <P3Materials ref={p3Ref} projectId={project.id} onChanged={load} />}
       
       {tab === "P4" && <P4Construction ref={p4Ref} projectId={project.id} onChanged={load} />}
      </div>
    </main>
  );
}