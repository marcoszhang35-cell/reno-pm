"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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

export type P3Handle = {
  flushAll: () => Promise<void>;
};

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40";

const inputSmCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40";

const buttonGhostCls =
  "rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 active:scale-[0.99]";

const buttonDangerCls =
  "rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-200 transition hover:bg-red-400/15 active:scale-[0.99]";

const P3Materials = forwardRef<P3Handle, { projectId: string; onChanged?: () => void }>(
  function P3Materials({ projectId, onChanged }, ref) {
    const [msg, setMsg] = useState("");
    const [startDate, setStartDate] = useState<string>("");
    const [rows, setRows] = useState<MaterialRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [photos, setPhotos] = useState<PhotoRow[]>([]);
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

    const refreshLock = useRef(false);
    const pendingPatchRef = useRef<Record<string, Partial<MaterialRow>>>({});

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

        const pRes = await supabase
          .from("projects")
          .select("start_date")
          .eq("id", projectId)
          .single();

        if (pRes.error) setMsg(pRes.error.message);
        setStartDate((pRes.data?.start_date as string | null) ?? "");

        const mRes = await supabase
          .from("project_materials")
          .select("id,name,qty,unit_price")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });

        if (mRes.error) setMsg(mRes.error.message);
        setRows(((mRes.data as MaterialRow[] | null) ?? []).map((r) => ({
          ...r,
          qty: Number(r.qty || 0),
          unit_price: Number(r.unit_price || 0),
        })));

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

        const list = ((phRes.data as PhotoRow[] | null) ?? []);
        setPhotos(list);

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
          if (s.path && "signedUrl" in s && s.signedUrl) {
            map[s.path] = s.signedUrl;
          }
        }
        setPhotoUrls(map);
      } finally {
        refreshLock.current = false;
      }
    }

    useEffect(() => {
      void refresh();
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

    function updateRowLocal(id: string, patch: Partial<MaterialRow>) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      pendingPatchRef.current[id] = { ...(pendingPatchRef.current[id] || {}), ...patch };
    }

    async function saveRow(id: string) {
      const patch = pendingPatchRef.current[id];
      if (!patch || Object.keys(patch).length === 0) return;

      delete pendingPatchRef.current[id];

      setMsg("");
      const { error } = await supabase.from("project_materials").update(patch).eq("id", id);
      if (error) return setMsg(error.message);
    }

    async function flushAllMaterialEdits() {
      const ids = Object.keys(pendingPatchRef.current);
      for (const id of ids) {
        await saveRow(id);
      }
    }

    useImperativeHandle(ref, () => ({
      flushAll: flushAllMaterialEdits,
    }));

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
      await flushAllMaterialEdits();

      const { error } = await supabase
        .from("projects")
        .update({ stage: "P4_CONSTRUCTION" })
        .eq("id", projectId);

      setLoading(false);
      if (error) return setMsg(error.message);

      onChanged?.();
      window.location.reload();
    }

    async function uploadMaterialPhoto(file: File, materialId: string | null) {
      setMsg("");
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return setMsg("未登录");

      const ext = extFromName(file.name);
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${user.id}/${projectId}/materials/${filename}`;

      const { error: upErr } = await supabase.storage
        .from("project-photos")
        .upload(path, file, { upsert: false });

      if (upErr) return setMsg(upErr.message);

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

      const { error: stErr } = await supabase.storage
        .from("project-photos")
        .remove([photo.storage_path]);

      if (stErr) return setMsg(stErr.message);

      const { error: dbErr } = await supabase
        .from("project_material_photos")
        .delete()
        .eq("id", photo.id);

      if (dbErr) return setMsg(dbErr.message);

      await refresh();
    }

    return (
      <div className="space-y-6">
        {msg && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {msg}
          </div>
        )}

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-white">P3 施工进场 / 材料准备</div>
              <div className="mt-1 text-sm text-white/55">
                先录入开工日期与材料清单；材料照片建议按材料上传，便于后期核对。
              </div>
            </div>

            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              projectId: {projectId}
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-medium text-white/80">开工日期</div>
            <input
              type="date"
              value={startDate || ""}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${inputCls} mt-2`}
            />

            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={saveStartDate}
                disabled={loading}
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-base font-medium text-slate-950 transition hover:opacity-95 disabled:opacity-70"
              >
                {loading ? "保存中..." : "保存开工日期"}
              </button>

              <button
                onClick={confirmToP4}
                disabled={loading}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base font-medium text-white transition hover:bg-white/10 disabled:opacity-70"
              >
                确认进入 P4
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">未归类照片</div>
              <div className="mt-1 text-sm text-white/55">
                先拍照上传也可以，后面再归类到具体材料。
              </div>
            </div>

            <PhotoPicker
              cameraLabel="+ 拍照"
              galleryLabel="+ 从图库选择"
              onPick={(file) => uploadMaterialPhoto(file, null)}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(photosByMaterial["__UNASSIGNED__"] ?? []).map((ph) => (
              <div
                key={ph.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm"
              >
                <div className="aspect-video bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrls[ph.storage_path]}
                    alt={ph.caption || "photo"}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="space-y-2 p-3">
                  <select
                    className={inputSmCls}
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
                    className={inputSmCls}
                    onBlur={(e) => updateMaterialPhotoCaption(ph.id, e.target.value)}
                  />

                  <button className={buttonGhostCls} onClick={() => deleteMaterialPhoto(ph)}>
                    删除这张照片
                  </button>
                </div>
              </div>
            ))}
          </div>

          {(photosByMaterial["__UNASSIGNED__"] ?? []).length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/45">
              暂无未归类照片。
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">材料清单（按材料管理照片）</div>
              <div className="mt-1 text-sm text-white/55">
                每个材料可单独记录数量、单价，并上传归属照片。
              </div>
            </div>

            <button onClick={addRow} className={buttonGhostCls}>
              + 新增材料
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {rows.map((r) => {
              const list = photosByMaterial[r.id] ?? [];
              return (
                <div
                  key={r.id}
                  className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={r.name}
                      onChange={(e) => updateRowLocal(r.id, { name: e.target.value })}
                      onBlur={() => saveRow(r.id)}
                      className={`${inputCls} flex-1`}
                      placeholder="品名"
                    />
                    <button onClick={() => removeRow(r.id)} className={buttonDangerCls}>
                      删除
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-white/55">数量</div>
                      <input
                        type="number"
                        value={r.qty}
                        onChange={(e) =>
                          updateRowLocal(r.id, { qty: Number(e.target.value || 0) })
                        }
                        onBlur={() => saveRow(r.id)}
                        className={`${inputCls} mt-1`}
                      />
                    </div>

                    <div>
                      <div className="text-xs text-white/55">单价</div>
                      <input
                        type="number"
                        value={r.unit_price}
                        onChange={(e) =>
                          updateRowLocal(r.id, { unit_price: Number(e.target.value || 0) })
                        }
                        onBlur={() => saveRow(r.id)}
                        className={`${inputCls} mt-1`}
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          材料照片（{list.length}）
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          当前照片已归类到该材料。
                        </div>
                      </div>

                      <PhotoPicker
                        cameraLabel="+ 拍照"
                        galleryLabel="+ 从图库选择"
                        onPick={(file) => uploadMaterialPhoto(file, r.id)}
                      />
                    </div>

                    {list.length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/45">
                        暂无照片。
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {list.map((ph) => (
                          <div
                            key={ph.id}
                            className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm"
                          >
                            <div className="aspect-video bg-white/5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrls[ph.storage_path]}
                                alt={ph.caption || "photo"}
                                className="h-full w-full object-cover"
                              />
                            </div>

                            <div className="space-y-2 p-3">
                              <input
                                defaultValue={ph.caption || ""}
                                placeholder="备注（例如：瓷砖到货 / 水泥型号）"
                                className={inputSmCls}
                                onBlur={(e) => updateMaterialPhotoCaption(ph.id, e.target.value)}
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  className={buttonGhostCls}
                                  onClick={() => movePhotoToMaterial(ph.id, null)}
                                >
                                  取消归类
                                </button>
                                <button
                                  className={buttonDangerCls}
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
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/45">
                暂无材料，点击“新增材料”。
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }
);

export default P3Materials;