"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoPicker from "@/components/PhotoPicker";

type WorkItem = {
  id: string;
  trade: string;
  team_name: string | null;
  price: number;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  note: string | null;
  created_at: string;
};

type WorkPhoto = {
  id: string;
  item_id: string | null;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

export type P4Handle = {
  flushAll: () => Promise<void>;
};

const TRADES: { key: string; label: string }[] = [
  { key: "DEMOLITION", label: "拆除" },
  { key: "PLUMBING", label: "水工" },
  { key: "ELECTRICAL", label: "电工" },
  { key: "PAINTING", label: "油漆" },
  { key: "CARPENTRY", label: "木工" },
  { key: "OTHER", label: "其他" },
];

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

const P4Construction = forwardRef<P4Handle, { projectId: string; onChanged?: () => void }>(
  function P4Construction({ projectId, onChanged }, ref) {
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<WorkItem[]>([]);
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const refreshLock = useRef(false);
  // ====== 只在 onBlur / 下一步保存 WorkItem ======
  const pendingItemPatchRef = useRef<Record<string, Partial<WorkItem>>>({});

  const itemsByTrade = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    for (const t of TRADES) map[t.key] = [];
    for (const it of items) {
      if (!map[it.trade]) map[it.trade] = [];
      map[it.trade].push(it);
    }
    return map;
  }, [items]);

  const photosByItem = useMemo(() => {
    const map: Record<string, WorkPhoto[]> = {};
    for (const ph of photos) {
      const key = ph.item_id ?? "__UNASSIGNED__";
      if (!map[key]) map[key] = [];
      map[key].push(ph);
    }
    return map;
  }, [photos]);

  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;

    try {
      setMsg("");

      const itRes = await supabase
        .from("project_work_items")
        .select("id,trade,team_name,price,start_date,end_date,days,note,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (itRes.error) setMsg(itRes.error.message);
      setItems((itRes.data as any) ?? []);

      const phRes = await supabase
        .from("project_work_photos")
        .select("id,item_id,storage_path,caption,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (phRes.error) {
        setMsg(phRes.error.message);
        setPhotos([]);
        setPhotoUrls({});
        return;
      }

      const ph = ((phRes.data as any) ?? []) as WorkPhoto[];
      setPhotos(ph);

      const paths = Array.from(new Set(ph.map((x) => x.storage_path))).filter(Boolean);
      if (!paths.length) {
        setPhotoUrls({});
        return;
      }

      const { data: signed, error: sErr } = await supabase.storage
        .from("project-photos")
        .createSignedUrls(paths, 60 * 60);

      if (sErr || !signed) {
        setPhotoUrls({});
        return;
      }

      const map: Record<string, string> = {};
      for (const s of signed) {
        if ((s as any).path && (s as any).signedUrl) map[(s as any).path] = (s as any).signedUrl;
      }
      setPhotoUrls(map);
    } finally {
      refreshLock.current = false;
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addWorkItem(trade: string) {
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const { error } = await supabase.from("project_work_items").insert({
      project_id: projectId,
      owner_id: user.id,
      trade,
      team_name: "",
      price: 0,
      start_date: null,
      end_date: null,
      days: null,
      note: "",
    });

    if (error) return setMsg(error.message);
    await refresh();
    onChanged?.();
  }

    function updateWorkItemLocal(id: string, patch: Partial<WorkItem>) {
    // 1) 本地立即更新，输入不卡
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

    // 2) 记录待保存 patch（合并）
    pendingItemPatchRef.current[id] = { ...(pendingItemPatchRef.current[id] || {}), ...patch };
  }

  async function saveWorkItem(id: string) {
    const patch = pendingItemPatchRef.current[id];
    if (!patch || Object.keys(patch).length === 0) return;

    delete pendingItemPatchRef.current[id];

    setMsg("");
    const { error } = await supabase.from("project_work_items").update(patch).eq("id", id);
    if (error) return setMsg(error.message);

    // ✅ 不 refresh()，避免闪烁/变灰
  }

  async function flushAllWorkItemEdits() {
    const ids = Object.keys(pendingItemPatchRef.current);
    for (const id of ids) {
      await saveWorkItem(id);
    }
  }
    useImperativeHandle(ref, () => ({
    flushAll: flushAllWorkItemEdits,
  }));

  async function deleteWorkItem(item: WorkItem) {
    setMsg("");
    // 先删 item 相关照片（storage + db）
    const list = photosByItem[item.id] ?? [];
    if (list.length) {
      const paths = list.map((x) => x.storage_path);
      const { error: stErr } = await supabase.storage.from("project-photos").remove(paths);
      if (stErr) return setMsg(stErr.message);

      const { error: dbpErr } = await supabase
        .from("project_work_photos")
        .delete()
        .eq("item_id", item.id);

      if (dbpErr) return setMsg(dbpErr.message);
    }

    const { error } = await supabase.from("project_work_items").delete().eq("id", item.id);
    if (error) return setMsg(error.message);

    await refresh();
    onChanged?.();
  }

  async function uploadWorkPhoto(file: File, itemId: string | null) {
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const ext = extFromName(file.name);
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${user.id}/${projectId}/work/${itemId ?? "unassigned"}/${filename}`;

    const { error: upErr } = await supabase.storage
      .from("project-photos")
      .upload(path, file, { upsert: false });

    if (upErr) return setMsg(upErr.message);

    const { error: insErr } = await supabase.from("project_work_photos").insert({
      project_id: projectId,
      item_id: itemId,
      owner_id: user.id,
      storage_path: path,
      caption: null,
    });

    if (insErr) return setMsg(insErr.message);

    await refresh();
  }

  async function updateWorkPhotoCaption(photoId: string, caption: string) {
    setMsg("");
    const { error } = await supabase
      .from("project_work_photos")
      .update({ caption })
      .eq("id", photoId);

    if (error) return setMsg(error.message);
    await refresh();
  }

  async function deleteWorkPhoto(ph: WorkPhoto) {
    setMsg("");

    const { error: stErr } = await supabase.storage
      .from("project-photos")
      .remove([ph.storage_path]);

    if (stErr) return setMsg(stErr.message);

    const { error: dbErr } = await supabase.from("project_work_photos").delete().eq("id", ph.id);
    if (dbErr) return setMsg(dbErr.message);

    await refresh();
  }

  async function closeProject() {
    setMsg("");
    setLoading(true);
    await flushAllWorkItemEdits();

    const { error } = await supabase.from("projects").update({ stage: "CLOSED" }).eq("id", projectId);

    setLoading(false);
    if (error) return setMsg(error.message);

    onChanged?.();
    window.location.reload();
  }

  return (
    <div className="space-y-4">
        <div className="text-xs opacity-80">P4 loaded, projectId: {projectId}</div>
      <div className="bg-white border rounded-2xl p-4">
        <div className="font-bold">P4 施工中</div>
        <div className="mt-2 text-sm opacity-90">
          每个工种可以添加多条记录（多次进场）。每条记录可拍照、写备注、记录团队/费用/工期。
        </div>
        {msg && <div className="mt-3 text-sm text-red-600">{msg}</div>}
      </div>

      {/* 未绑定到记录的照片（可选用） */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-bold">未归类施工照片</div>
            <div className="text-xs opacity-80 mt-1">先拍了再说，不绑定任何记录也可以。</div>
          </div>

          <PhotoPicker onPick={(file) => uploadWorkPhoto(file, null)} />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(photosByItem["__UNASSIGNED__"] ?? []).map((ph) => (
            <div key={ph.id} className="border rounded-xl overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrls[ph.storage_path]}
                  alt={ph.caption || "work photo"}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3 space-y-2">
                <input
                  defaultValue={ph.caption || ""}
                  placeholder="备注（例如：电线走位 / 防水完成）"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  onBlur={(e) => updateWorkPhotoCaption(ph.id, e.target.value)}
                />
                <button className="w-full px-3 py-2 rounded-lg border text-sm" onClick={() => deleteWorkPhoto(ph)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        {(photosByItem["__UNASSIGNED__"] ?? []).length === 0 && (
          <div className="mt-3 text-sm opacity-80">暂无未归类照片。</div>
        )}
      </div>

      {/* 工种卡片 */}
      {TRADES.map((t) => {
        const list = itemsByTrade[t.key] ?? [];
        return (
          <div key={t.key} className="bg-white border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold">{t.label}</div>
              <button onClick={() => addWorkItem(t.key)} className="px-3 py-2 rounded-xl border text-sm active:scale-[0.99]">
                + 新增记录
              </button>
            </div>

            {list.length === 0 ? (
              <div className="text-sm opacity-80">暂无记录。</div>
            ) : (
              <div className="space-y-4">
                {list.map((it) => {
                  const phList = photosByItem[it.id] ?? [];
                  return (
                    <div key={it.id} className="border rounded-2xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm">记录</div>
                        <button onClick={() => deleteWorkItem(it)} className="px-3 py-2 rounded-xl border text-sm">
                          删除记录
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs opacity-90">团队名称</div>
                          <input
  value={it.team_name ?? ""}
  onChange={(e) => updateWorkItemLocal(it.id, { team_name: e.target.value })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
  placeholder="例如：张三水工队"
/>
                        </div>

                        <div>
                          <div className="text-xs opacity-90">价格（NZD）</div>
                          <input
  type="number"
  value={it.price ?? 0}
  onChange={(e) => updateWorkItemLocal(it.id, { price: Number(e.target.value || 0) })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
/>
                        </div>

                        <div>
                          <div className="text-xs opacity-90">开始日期</div>
                          <input
  type="date"
  value={it.start_date ?? ""}
  onChange={(e) => updateWorkItemLocal(it.id, { start_date: e.target.value || null })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
/>
                        </div>

                        <div>
                          <div className="text-xs opacity-90">结束日期</div>
                          <input
  type="date"
  value={it.end_date ?? ""}
  onChange={(e) => updateWorkItemLocal(it.id, { end_date: e.target.value || null })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
/>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="text-xs opacity-90">工期（天，可选）</div>
                          <input
  type="number"
  value={it.days ?? ""}
  onChange={(e) => updateWorkItemLocal(it.id, { days: e.target.value ? Number(e.target.value) : null })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
  placeholder="例如：3"
/>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="text-xs opacity-90">备注</div>
                          <textarea
  value={it.note ?? ""}
  onChange={(e) => updateWorkItemLocal(it.id, { note: e.target.value })}
  onBlur={() => saveWorkItem(it.id)}
  className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
  rows={3}
  placeholder="例如：防水做了2遍，24小时闭水"
/>
                        </div>
                      </div>

                      {/* 施工照片 */}
                      <div className="mt-3 border rounded-2xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm">施工照片（{phList.length}）</div>
                          <PhotoPicker
  cameraLabel="+ 拍照"
  galleryLabel="+ 从图库选择"
  onPick={(file) => uploadWorkPhoto(file, it.id)}
/>
                        </div>

                        {phList.length === 0 ? (
                          <div className="mt-2 text-sm opacity-80">暂无照片。</div>
                        ) : (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {phList.map((ph) => (
                              <div key={ph.id} className="border rounded-xl overflow-hidden">
                                <div className="aspect-video bg-gray-100">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photoUrls[ph.storage_path]}
                                    alt={ph.caption || "work photo"}
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                <div className="p-3 space-y-2">
                                  <input
                                    defaultValue={ph.caption || ""}
                                    placeholder="照片备注"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    onBlur={(e) => updateWorkPhotoCaption(ph.id, e.target.value)}
                                  />
                                  <button className="w-full px-3 py-2 rounded-lg border text-sm" onClick={() => deleteWorkPhoto(ph)}>
                                    删除照片
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      
    </div>
  );
  }
);

export default P4Construction;