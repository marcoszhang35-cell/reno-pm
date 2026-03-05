"use client";

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

export default function ProjectsHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return setMsg("未登录，请回到首页登录。");

    const res = await supabase
      .from("projects")
      .select("id,source,address,client_name,created_date,note,target_areas,stage")
      .order("created_at", { ascending: false });

    if (res.error) return setMsg(res.error.message);
    setProjects((res.data || []) as any);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter((p) => {
      const text = [
        p.client_name,
        p.address,
        p.source || "",
        p.stage,
        (p.target_areas || []).join(","),
        p.note || "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(s);
    });
  }, [projects, q]);
  
  const filteredProjects = useMemo(() => {
  let list = projects;

  // 1) 阶段筛选
  if (stageFilter !== "ALL") {
    list = list.filter((p) => p.stage === stageFilter);
  }

  // 2) 搜索（如果你已有搜索，这段按你现有逻辑融合）
  const keyword = q?.trim().toLowerCase();
  if (keyword) {
    list = list.filter((p) => {
      return (
        (p.client_name || "").toLowerCase().includes(keyword) ||
        (p.address || "").toLowerCase().includes(keyword) ||
        (p.source || "").toLowerCase().includes(keyword)
      );
    });
  }

  return list;
}, [projects, stageFilter, q]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 顶部栏（手机友好：sticky + 大按钮） */}
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold">项目</div>
            <div className="text-xs opacity-90">共 {filtered.length} 个</div>
          </div>
          <a
            className="px-3 py-2 rounded-lg bg-black text-white text-sm"
            href="/projects/new"
          >
            + 新建
          </a>
        </div>

        {/* 阶段筛选（手机可横向滚动） */}
<div className="flex gap-2 overflow-x-auto pb-2">
  <button
    onClick={() => setStageFilter("ALL")}
    className={
      "px-3 py-2 rounded-full border text-sm whitespace-nowrap " +
      (stageFilter === "ALL" ? "bg-black text-white border-black" : "bg-white")
    }
  >
    全部
  </button>

  {STAGES.filter((s) => s.key !== "CLOSED").map((s) => {
    const meta = stageMeta(s.key);
    const active = stageFilter === s.key;

    return (
      <button
        key={s.key}
        onClick={() => setStageFilter(s.key)}
        className={
          "px-3 py-2 rounded-full border text-sm whitespace-nowrap flex items-center gap-2 " +
          (active ? "bg-black text-white border-black" : "bg-white")
        }
      >
        <span className={"inline-block w-2 h-2 rounded-full " + meta.color} />
        {meta.label}
      </button>
    );
  })}

  <button
    onClick={() => setStageFilter("CLOSED")}
    className={
      "px-3 py-2 rounded-full border text-sm whitespace-nowrap " +
      (stageFilter === "CLOSED" ? "bg-black text-white border-black" : "bg-white")
    }
  >
    已关闭
  </button>
</div>

        <div className="px-4 pb-4">
          <input
            className="w-full border rounded-xl px-3 py-3 text-base"
            placeholder="搜索：客户/地址/阶段/备注/目标区域"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              className="px-3 py-2 rounded-lg border text-sm"
              onClick={load}
            >
              刷新
            </button>
            <a className="px-3 py-2 rounded-lg border text-sm" href="/">
              登录页
            </a>
          </div>
        </div>
      </div>

      

      {msg && <p className="px-4 pt-4 text-red-600">{msg}</p>}

      {/* 列表（手机：单列卡片；电脑：两列） */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((p) => {
          const meta = stageMeta(p.stage);
          return (
            <a
              key={p.id}
              href={`/projects/${p.id}`}
              className="block rounded-2xl border bg-white overflow-hidden active:scale-[0.99] transition"
            >
              {/* 顶部彩条：一眼识别阶段 */}
              <div className={`h-2 ${meta.color}`} />

              <div className="p-4">
                {/* 第一行：客户 + 阶段徽章 */}
                <div className="flex items-start justify-between gap-3">
  <div className="font-bold text-base leading-snug">
    {p.client_name}
    <div className="font-normal text-sm opacity-80 mt-1">
      {p.address}
    </div>
  </div>

  <span className={`${meta.color} text-white text-xs px-2 py-1 rounded-full`}>
    {meta.label}
  </span>
</div>

                {/* 第二行：来源/日期 */}
                <div className="mt-3 text-xs opacity-80 flex flex-wrap gap-x-3 gap-y-1">
                  <span>来源：{p.source || "-"}</span>
                  <span>日期：{p.created_date}</span>
                </div>

                {/* 目标区域 chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(p.target_areas || []).slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="text-xs border rounded-full px-2 py-1 bg-gray-50"
                    >
                      {t}
                    </span>
                  ))}
                  {(p.target_areas || []).length > 4 && (
                    <span className="text-xs opacity-80">
                      +{(p.target_areas || []).length - 4}
                    </span>
                  )}
                </div>

                {/* 备注（最多一行） */}
                {p.note && (
                  <div className="mt-3 text-sm opacity-90 line-clamp-1">
                    {p.note}
                  </div>
                )}

                {/* 底部提示 */}
                <div className="mt-4 text-sm font-medium">
                  进入详情 →
                </div>
              </div>
            </a>
          );
        })}

        {filtered.length === 0 && (
          <div className="opacity-90 mt-6">暂无项目，点右上角“新建”。</div>
        )}
      </div>
    </main>
  );
}