"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { SOURCE_OPTIONS, TARGET_AREA_OPTIONS } from "@/config/options";

type FormState = {
  source: string;
  sourceOther: string;
  address: string;
  clientName: string;
  clientPhone: string;
  createdDate: string; // YYYY-MM-DD
  note: string;
  targetAreas: string[];
  targetOther: string;
};

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NewProjectPage() {
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormState>({
    source: "Xiaohongshu",
    sourceOther: "",
    address: "",
    clientName: "",
    clientPhone: "",
    createdDate: todayYYYYMMDD(),
    note: "",
    targetAreas: [],
    targetOther: "",
  });

  function toggleTargetArea(area: string) {
    setForm((prev) => {
      const exists = prev.targetAreas.includes(area);
      const next = exists
        ? prev.targetAreas.filter((x) => x !== area)
        : [...prev.targetAreas, area];
      return { ...prev, targetAreas: next };
    });
  }

  function normalizeTargets(targetAreas: string[], otherText: string) {
    const hasOther = targetAreas.includes("Other");
    const cleaned = targetAreas.filter((x) => x !== "Other");
    return {
      target_areas: hasOther ? [...cleaned, `Other: ${otherText || "-"}`] : cleaned,
    };
  }

  function normalizeSource(source: string, otherText: string) {
    if (source === "Other") return `Other: ${otherText || "-"}`;
    return source;
  }

  async function createProject() {
    setMsg("");

    // 基础校验（必填）
    if (!form.address.trim()) return setMsg("请填写地址 Address");
    if (!form.clientName.trim()) return setMsg("请填写客户姓名 Client Name");
    if (!form.createdDate) return setMsg("请选择日期 Date");
    if (form.targetAreas.length === 0) return setMsg("请至少选择一个目标区域 Target Area");

    if (form.source === "Other" && !form.sourceOther.trim()) {
      return setMsg("来源选择 Other 时，请填写具体来源");
    }
    if (form.targetAreas.includes("Other") && !form.targetOther.trim()) {
      return setMsg("目标区域选择 Other 时，请填写具体内容");
    }

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return setMsg("未登录，请回到首页登录");

      const normalizedSource = normalizeSource(form.source, form.sourceOther);
      const { target_areas } = normalizeTargets(form.targetAreas, form.targetOther);

      const { data, error } = await supabase
        .from("projects")
        .insert({
          owner_id: uid,
          source: normalizedSource,
          address: form.address.trim(),
          client_name: form.clientName.trim(),
          client_phone: form.clientPhone.trim() || null,
          created_date: form.createdDate,
          note: form.note.trim() || null,
          target_areas,
          stage: "P1_NEW",
        })
        .select("id")
        .single();

      if (error) return setMsg(error.message);

      window.location.href = `/projects/${data.id}`;
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <a className="underline" href="/projects">← 返回项目首页</a>
          <h1 className="text-2xl font-bold mt-3">新建项目</h1>
          <p className="opacity-90 mt-1">第 1 部分：来源、地址、客户、日期、备注、目标区域</p>
        </div>
      </div>

      {msg && <p className="mt-3 text-red-600">{msg}</p>}

      <section className="mt-4 border rounded-xl p-4">
        <h2 className="font-bold">基础信息</h2>

        <div className="mt-3 grid gap-4">
          {/* 来源 */}
          <div>
            <label className="text-sm font-medium">来源 Source</label>
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {form.source === "Other" && (
              <input
                className="mt-2 w-full border rounded px-3 py-2"
                placeholder="具体来源（例如：朋友介绍/某群/某广告）"
                value={form.sourceOther}
                onChange={(e) => setForm({ ...form, sourceOther: e.target.value })}
              />
            )}
          </div>

          {/* 地址 */}
          <div>
            <label className="text-sm font-medium">地址 Address *</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="例如：Unit 2, 123 Queen Street, Auckland"
            />
          </div>

          {/* 客户姓名 + 电话 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">客户姓名 Client Name *</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="例如：John Smith"
              />
            </div>
            <div>
              <label className="text-sm font-medium">客户电话 Phone（可选）</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                placeholder="例如：021xxxxxxx"
              />
            </div>
          </div>

          {/* 日期 + 阶段 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">日期 Date *</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                type="date"
                value={form.createdDate}
                onChange={(e) => setForm({ ...form, createdDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">当前阶段</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2 opacity-90"
                value="P1_NEW（新建项目）"
                disabled
              />
            </div>
          </div>

          {/* 目标区域 */}
          <div>
            <label className="text-sm font-medium">目标区域 Target Areas *</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TARGET_AREA_OPTIONS.map((t) => {
                const checked = form.targetAreas.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTargetArea(t)}
                    className={
                      "px-3 py-1 rounded-full border text-sm " +
                      (checked ? "bg-black text-white" : "bg-white")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {form.targetAreas.includes("Other") && (
              <input
                className="mt-2 w-full border rounded px-3 py-2"
                placeholder="Other 具体是什么（例如：Laundry/Deck/Driveway…）"
                value={form.targetOther}
                onChange={(e) => setForm({ ...form, targetOther: e.target.value })}
              />
            )}
          </div>

          {/* 备注 */}
          <div>
            <label className="text-sm font-medium">备注 Notes（可选）</label>
            <textarea
              className="mt-1 w-full border rounded px-3 py-2"
              rows={5}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="客户需求要点、预算范围、注意事项..."
            />
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={createProject}
              disabled={saving}
              className="px-4 py-2 rounded border"
            >
              {saving ? "保存中..." : "创建项目"}
            </button>
            <a className="px-4 py-2 rounded border" href="/projects">取消</a>
          </div>
        </div>
      </section>
    </main>
  );
}