"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoPicker from "@/components/PhotoPicker";

type MaterialRow = {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
};

type PhotoRow = {
  id: string;
  project_id: string;
  material_id: string | null;
  owner_id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

export default function P3Materials({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged?: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);

  // photos (material binding)
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // 防止 refresh 并发互相抢（你之前那个 AbortError 很像是并发触发造成的）
  const refreshLock = useRef(false);

  const photosByMaterial = useMemo(() => {
    const map: Record<string, PhotoRow[]> = {};
    for (const ph of photos) {
      const key = ph.material_id ?? "__UNASSIGNED__";
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

      // 1) 项目开工日期
      const pRes = await supabase
        .from("projects")
        .select("start_date")
        .eq("id", projectId)
        .single();

      if (pRes.error) setMsg(pRes.error.message);
      setStartDate((pRes.data?.start_date as any) ?? "");

      // 2) 材料清单
      const mRes = await supabase
        .from("project_materials")
        .select("id,name,qty,unit_price")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (mRes.error) setMsg(mRes.error.message);
      setRows((mRes.data as any) ?? []);

      // 3) 拉取材料照片（包含未归类 material_id = null）
      const phRes = await supabase
        .from("project_material_photos")
        .select("id,project_id,material_id,owner_id,storage_path,caption,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (phRes.error) {
        setMsg(phRes.error.message);
        setPhotos([]);
        setPhotoUrls({});
        return;
      }

      const list = ((phRes.data as any) ?? []) as PhotoRow[];
      setPhotos(list);

      // 4) 批量生成 signed urls（1小时有效）
      const paths = Array.from(new Set(list.map((x) => x.storage_path))).filter(Boolean);

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
        if (s.path && (s as any).signedUrl) map[s.path] = (s as any).signedUrl;
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

  async function addRow() {
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const { error } = await supabase.from("project_materials").insert({
      project_id: projectId,
      owner_id: user.id,
      name: "新材料",
      qty: 1,
      unit_price: 0,
    });

    if (error) return setMsg(error.message);
    await refresh();
    onChanged?.();
  }

  async function updateRow(id: string, patch: Partial<MaterialRow>) {
    setMsg("");
    const { error } = await supabase.from("project_materials").update(patch).eq("id", id);
    if (error) return setMsg(error.message);
    await refresh();
    onChanged?.();
  }

  async function removeRow(id: string) {
    setMsg("");
    const { error } = await supabase.from("project_materials").delete().eq("id", id);
    if (error) return setMsg(error.message);
    await refresh();
    onChanged?.();
  }

  async function saveStartDate() {
    setMsg("");
    setLoading(true);

    const { error } = await supabase
      .from("projects")
      .update({ start_date: startDate || null })
      .eq("id", projectId);

    setLoading(false);
    if (error) return setMsg(error.message);

    onChanged?.();
    setMsg("✅ 已保存开工日期");
  }

  async function confirmToP4() {
    setMsg("");
    setLoading(true);

    const { error } = await supabase
      .from("projects")
      .update({ stage: "P4_CONSTRUCTION" })
      .eq("id", projectId);

    setLoading(false);
    if (error) return setMsg(error.message);

    onChanged?.();
    window.location.reload();
  }

  // ============ P3 Photos (绑定材料) ============

  async function uploadMaterialPhoto(file: File, materialId: string | null) {
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const ext = extFromName(file.name);
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${user.id}/${projectId}/materials/${filename}`;

    // 1) 上传 storage
    const { error: upErr } = await supabase.storage
      .from("project-photos")
      .upload(path, file, { upsert: false });

    if (upErr) return setMsg(upErr.message);

    // 2) 写入表
    const { error: insErr } = await supabase.from("project_material_photos").insert({
      project_id: projectId,
      material_id: materialId,
      owner_id: user.id,
      storage_path: path,
      caption: null,
    });

    if (insErr) return setMsg(insErr.message);

    await refresh();
  }

  async function updateMaterialPhotoCaption(photoId: string, caption: string) {
    setMsg("");
    const { error } = await supabase
      .from("project_material_photos")
      .update({ caption })
      .eq("id", photoId);

    if (error) return setMsg(error.message);
    await refresh();
  }

  async function movePhotoToMaterial(photoId: string, materialId: string | null) {
    setMsg("");
    const { error } = await supabase
      .from("project_material_photos")
      .update({ material_id: materialId })
      .eq("id", photoId);

    if (error) return setMsg(error.message);
    await refresh();
  }

  async function deleteMaterialPhoto(photo: PhotoRow) {
    setMsg("");

    // 1) 删 storage
    const { error: stErr } = await supabase.storage
      .from("project-photos")
      .remove([photo.storage_path]);

    if (stErr) return setMsg(stErr.message);

    // 2) 删表记录
    const { error: dbErr } = await supabase
      .from("project_material_photos")
      .delete()
      .eq("id", photo.id);

    if (dbErr) return setMsg(dbErr.message);

    await refresh();
  }

  // ============ UI ============

  return (
    <div className="space-y-4">
      <div className="text-xs opacity-80">projectId: {projectId}</div>

      {/* 开工日期 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="font-bold">P3 施工进场 / 材料准备</div>
        <div className="mt-2 text-sm opacity-90">
          先录入开工日期与材料清单；材料照片建议按材料上传，便于后期核对。
        </div>

        <div className="mt-3">
          <div className="text-sm font-semibold">开工日期</div>
          <input
            type="date"
            value={startDate || ""}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-2 w-full border rounded-xl px-3 py-2 text-base"
          />
          <button
            onClick={saveStartDate}
            disabled={loading}
            className="mt-3 w-full px-4 py-3 rounded-2xl bg-black text-white text-base active:scale-[0.99] disabled:opacity-70"
          >
            保存开工日期
          </button>
        </div>
      </div>

      {/* 未归类照片（先拍再分类） */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-bold">未归类照片</div>
            <div className="text-xs opacity-80 mt-1">先拍照上传也可以，后面再归类到具体材料。</div>
          </div>

          <PhotoPicker
  cameraLabel="+ 拍照"
  galleryLabel="+ 从图库选择"
  onPick={(file) => uploadMaterialPhoto(file, null)}
/>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(photosByMaterial["__UNASSIGNED__"] ?? []).map((ph) => (
            <div key={ph.id} className="border rounded-xl overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrls[ph.storage_path]}
                  alt={ph.caption || "photo"}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-3 space-y-2">
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={ph.material_id ?? ""}
                  onChange={(e) => movePhotoToMaterial(ph.id, e.target.value || null)}
                >
                  <option value="">（未归类）</option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <input
                  defaultValue={ph.caption || ""}
                  placeholder="备注（例如：瓷砖到货 / 水泥型号）"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  onBlur={(e) => updateMaterialPhotoCaption(ph.id, e.target.value)}
                />

                <button
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  onClick={() => deleteMaterialPhoto(ph)}
                >
                  删除这张照片
                </button>
              </div>
            </div>
          ))}
        </div>

        {(photosByMaterial["__UNASSIGNED__"] ?? []).length === 0 && (
          <div className="mt-3 text-sm opacity-80">暂无未归类照片。</div>
        )}
      </div>

      {/* 材料清单（每个材料独立拍照） */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold">材料清单（按材料管理照片）</div>
          <button
            onClick={addRow}
            className="px-3 py-2 rounded-xl border text-sm active:scale-[0.99]"
          >
            + 新增材料
          </button>
        </div>

        <div className="mt-3 space-y-4">
          {rows.map((r) => {
            const list = photosByMaterial[r.id] ?? [];
            return (
              <div key={r.id} className="border rounded-2xl p-3">
                {/* 标题 + 删除 */}
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                    className="flex-1 border rounded-xl px-3 py-2 text-base"
                    placeholder="品名"
                  />
                  <button onClick={() => removeRow(r.id)} className="px-3 py-2 rounded-xl border text-sm">
                    删除
                  </button>
                </div>

                {/* 数量/单价 */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-90">数量</div>
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => updateRow(r.id, { qty: Number(e.target.value || 0) })}
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <div className="text-xs opacity-90">单价</div>
                    <input
                      type="number"
                      value={r.unit_price}
                      onChange={(e) => updateRow(r.id, { unit_price: Number(e.target.value || 0) })}
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-base"
                    />
                  </div>
                </div>

                {/* 材料照片区 */}
                <div className="mt-3 border rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">
                      材料照片（{list.length}）
                    </div>

                    <PhotoPicker
  cameraLabel="+ 拍照"
  galleryLabel="+ 从图库选择"
  onPick={(file) => uploadMaterialPhoto(file, null)}
/>
                  </div>

                  {list.length === 0 ? (
                    <div className="mt-2 text-sm opacity-80">暂无照片。</div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {list.map((ph) => (
                        <div key={ph.id} className="border rounded-xl overflow-hidden">
                          <div className="aspect-video bg-gray-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoUrls[ph.storage_path]}
                              alt={ph.caption || "photo"}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="p-3 space-y-2">
                            <input
                              defaultValue={ph.caption || ""}
                              placeholder="备注（例如：瓷砖到货 / 水泥型号）"
                              className="w-full border rounded-lg px-3 py-2 text-sm"
                              onBlur={(e) => updateMaterialPhotoCaption(ph.id, e.target.value)}
                            />

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                className="px-3 py-2 rounded-lg border text-sm"
                                onClick={() => movePhotoToMaterial(ph.id, null)}
                              >
                                取消归类
                              </button>
                              <button
                                className="px-3 py-2 rounded-lg border text-sm"
                                onClick={() => deleteMaterialPhoto(ph)}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="text-sm opacity-80">暂无材料，点击“新增材料”。</div>
          )}
        </div>
      </div>

      {/* 阶段确认 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="font-bold">阶段确认</div>
        <div className="mt-2 text-sm opacity-90">
          确认后进入 P4（施工中），首页颜色会随阶段变化。
        </div>
        <button
          onClick={confirmToP4}
          disabled={loading}
          className="mt-3 w-full px-4 py-3 rounded-2xl bg-black text-white text-base active:scale-[0.99] disabled:opacity-90"
        >
          ✅ 确认进入 P4（施工中）
        </button>

        {msg && <div className="mt-3 text-sm text-red-600">{msg}</div>}
      </div>
    </div>
  );
}