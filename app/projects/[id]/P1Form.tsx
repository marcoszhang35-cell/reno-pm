"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SOURCE_OPTIONS, TARGET_AREA_OPTIONS, stageMeta } from "@/config/options";

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

export default function P1Form({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    source: project.source || "",
    address: project.address || "",
    client_name: project.client_name || "",
    client_phone: project.client_phone || "",
    created_date: project.created_date || "",
    note: project.note || "",
    target_areas: project.target_areas || [],
  });

  const meta = useMemo(() => stageMeta(project.stage), [project.stage]);

  function toggleArea(area: string) {
    setForm((p) => {
      const has = p.target_areas.includes(area);
      return {
        ...p,
        target_areas: has
          ? p.target_areas.filter((x) => x !== area)
          : [...p.target_areas, area],
      };
    });
  }

  async function save() {
    setMsg("");
    if (!form.address.trim()) return setMsg("地址必填");
    if (!form.client_name.trim()) return setMsg("客户姓名必填");
    if (!form.created_date) return setMsg("日期必填");
    if (!form.target_areas.length) return setMsg("至少选择一个目标区域");

    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        source: form.source || null,
        address: form.address.trim(),
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || null,
        created_date: form.created_date,
        note: form.note.trim() || null,
        target_areas: form.target_areas,
      })
      .eq("id", project.id);

    setSaving(false);

    if (error) return setMsg(error.message);
    onSaved();
    setMsg("✅ 已保存");
    setTimeout(() => setMsg(""), 1500);
  }

  return (
    <div className="bg-white border rounded-2xl overflow-hidden">
      <div className={`h-2 ${meta.color}`} />
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">P1 新建项目</div>
            <div className="text-xs opacity-80">这里可以随时修改并保存</div>
          </div>
          <span className={`${meta.color} text-white text-xs px-2 py-1 rounded-full`}>
            {meta.label}
          </span>
        </div>

        {msg && <div className="text-sm text-red-600">{msg}</div>}

        {/* 来源 */}
        <div>
          <label className="text-sm font-medium">来源</label>
          <select
            className="mt-2 w-full border rounded-xl px-3 py-3"
            value={form.source}
            onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
          >
            <option value="">-</option>
            {SOURCE_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>

        {/* 地址 */}
        <div>
          <label className="text-sm font-medium">地址 *</label>
          <input
            className="mt-2 w-full border rounded-xl px-3 py-3"
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="例如：22 Moyrus Crescent"
          />
        </div>

        {/* 客户 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">客户姓名 *</label>
            <input
              className="mt-2 w-full border rounded-xl px-3 py-3"
              value={form.client_name}
              onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">电话</label>
            <input
              className="mt-2 w-full border rounded-xl px-3 py-3"
              value={form.client_phone}
              onChange={(e) => setForm((p) => ({ ...p, client_phone: e.target.value }))}
              placeholder="选填"
            />
          </div>
        </div>

        {/* 日期 */}
        <div>
          <label className="text-sm font-medium">日期 *</label>
          <input
            type="date"
            className="mt-2 w-full border rounded-xl px-3 py-3"
            value={form.created_date}
            onChange={(e) => setForm((p) => ({ ...p, created_date: e.target.value }))}
          />
        </div>

        {/* 目标区域 */}
        <div>
          <label className="text-sm font-medium">目标区域 *</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TARGET_AREA_OPTIONS.map((area) => {
              const active = form.target_areas.includes(area);
              return (
                <button
                  type="button"
                  key={area}
                  onClick={() => toggleArea(area)}
                  className={
                    "px-3 py-2 rounded-full border text-sm " +
                    (active ? "bg-black text-white border-black" : "bg-white")
                  }
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        {/* 备注 */}
        <div>
          <label className="text-sm font-medium">备注</label>
          <textarea
            className="mt-2 w-full border rounded-xl px-3 py-3 min-h-[90px]"
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="选填"
          />
        </div>

      
      </div>
    </div>
  );
}