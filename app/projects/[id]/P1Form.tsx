"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  SOURCE_OPTIONS,
  TARGET_AREA_OPTIONS,
  stageMeta,
} from "@/config/options";

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

export type P1Handle = {
  flushAll: () => Promise<void>;
};

type P1FormProps = {
  project: Project;
  onSaved: () => void;
};

const P1Form = forwardRef<P1Handle, P1FormProps>(function P1Form(
  { project, onSaved },
  ref
) {
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
    setForm((prev) => {
      const has = prev.target_areas.includes(area);
      return {
        ...prev,
        target_areas: has
          ? prev.target_areas.filter((x) => x !== area)
          : [...prev.target_areas, area],
      };
    });
  }

  async function save() {
    setMsg("");

    if (!form.address.trim()) {
      throw new Error("地址必填");
    }
    if (!form.client_name.trim()) {
      throw new Error("客户姓名必填");
    }
    if (!form.created_date) {
      throw new Error("日期必填");
    }
    if (!form.target_areas.length) {
      throw new Error("至少选择一个目标区域");
    }

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

    if (error) {
      setMsg(error.message);
      throw new Error(error.message);
    }

    onSaved();
    setMsg("✅ 已保存");
    setTimeout(() => setMsg(""), 1500);
  }

  useImperativeHandle(ref, () => ({
    flushAll: save,
  }));

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 overflow-hidden shadow-xl backdrop-blur-xl">
      <div className={`h-[3px] ${meta.color}`} />

      <div className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-white">P1 新建项目</div>
            <div className="mt-1 text-sm text-white/55">
              编辑基础信息后，使用页面底部统一保存
            </div>
          </div>

          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            {meta.label}
          </span>
        </div>

        {msg && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {msg}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-white/85">来源</label>
          <select
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            value={form.source}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, source: e.target.value }))
            }
          >
            <option value="" className="text-black">
              —
            </option>
            {SOURCE_OPTIONS.map((x) => (
              <option key={x} value={x} className="text-black">
                {x}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">地址 *</label>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
            value={form.address}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, address: e.target.value }))
            }
            placeholder="例如：22 Moyrus Crescent"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-white/85">
              客户姓名 *
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
              value={form.client_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, client_name: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/85">电话</label>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
              value={form.client_phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, client_phone: e.target.value }))
              }
              placeholder="选填"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">日期 *</label>
          <input
            type="date"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            value={form.created_date}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, created_date: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">
            目标区域 *
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {TARGET_AREA_OPTIONS.map((area) => {
              const active = form.target_areas.includes(area);

              return (
                <button
                  type="button"
                  key={area}
                  onClick={() => toggleArea(area)}
                  className={
                    "rounded-full border px-3 py-2 text-sm transition " +
                    (active
                      ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                      : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10")
                  }
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">备注</label>
          <textarea
            className="mt-2 min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
            value={form.note}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, note: e.target.value }))
            }
            placeholder="可填写客户需求、现场情况、特殊说明等"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">
          当前保存方式：由详情页底部统一触发保存
          {saving ? " ｜ 保存中..." : ""}
        </div>
      </div>
    </div>
  );
});

export default P1Form;