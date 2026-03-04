"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoPicker from "@/components/PhotoPicker";
import { pdf } from "@react-pdf/renderer";
import QuotePdfDoc from "@/components/QuotePdfDoc";

type Quote = {
  id: string;
  project_id: string;
  recommended_total: number;
  total_amount: number;
  note: string | null;
};

type QuoteItem = {
  id: string;
  item_name: string;
  description: string | null;
  qty: number;
  unit_price: number;
  amount: number; // DB算
  sort_order: number;
};

type Payment = {
  id: string;
  seq: number;
  title: string;
  due_date: string | null;
  percent: number;
  amount: number; // DB算
  paid: boolean;
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

export default function P2Bootstrap({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [photos, setPhotos] = useState<
  { id: string; storage_path: string; caption: string | null }[]
>([]);

const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  async function refresh() {
    setMsg("");
    setLoading(true);

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setLoading(false);
      return setMsg("未登录");
    }

    const qRes = await supabase
      .from("project_quotes")
      .select("id,project_id,recommended_total,total_amount,note")
      .eq("project_id", projectId)
      .maybeSingle();

    if (qRes.error) {
      setLoading(false);
      return setMsg(qRes.error.message);
    }

    if (!qRes.data) {
      setQuote(null);
      setItems([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    setQuote(qRes.data as any);


// ===== 在这里加照片代码 =====

const phRes = await supabase
  .from("project_quote_photos")
  .select("id,storage_path,caption")
  .eq("quote_id", qRes.data.id)
  .order("created_at", { ascending: false });

if (phRes.error) setMsg(phRes.error.message);
const ph = (phRes.data || []) as any[];
setPhotos(ph);

// 生成 signed urls
const paths = ph.map((x) => x.storage_path);
if (paths.length) {
  const { data: signed, error: sErr } = await supabase.storage
    .from("project-photos")
    .createSignedUrls(paths, 60 * 60);

  if (!sErr && signed) {
    const map: Record<string, string> = {};
    for (const s of signed) {
      if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    }
    setPhotoUrls(map);
  }
} else {
  setPhotoUrls({});
}

    const iRes = await supabase
      .from("project_quote_items")
      .select("id,item_name,description,qty,unit_price,amount,sort_order")
      .eq("quote_id", qRes.data.id)
      .order("sort_order", { ascending: true });

    if (iRes.error) setMsg(iRes.error.message);
    setItems((iRes.data || []) as any);

    const pRes = await supabase
      .from("project_quote_payments")
      .select("id,seq,title,due_date,percent,amount,paid")
      .eq("quote_id", qRes.data.id)
      .order("seq", { ascending: true });

    if (pRes.error) setMsg(pRes.error.message);
    setPayments((pRes.data || []) as any);

    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function initQuote() {
    setMsg("");
    setLoading(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setLoading(false);
      return setMsg("未登录");
    }

    const { data: q, error: qErr } = await supabase
      .from("project_quotes")
      .upsert(
        { project_id: projectId, owner_id: user.id, recommended_total: 0, note: null },
        { onConflict: "project_id" }
      )
      .select("id,project_id,recommended_total,total_amount,note")
      .single();

    if (qErr) {
      setLoading(false);
      return setMsg(qErr.message);
    }

    const { data: existing } = await supabase
      .from("project_quote_payments")
      .select("id, seq")
      .eq("quote_id", q.id);

    if (!existing || existing.length === 0) {
      const rows = [
        { seq: 1, title: "Deposite", percent: 20 },
        { seq: 2, title: "Second", percent: 30 },
        { seq: 3, title: "Third", percent: 30 },
        { seq: 4, title: "Final", percent: 20 },
      ].map((r) => ({ quote_id: q.id, owner_id: user.id, ...r }));

      const { error: pErr } = await supabase.from("project_quote_payments").insert(rows);
      if (pErr) {
        setLoading(false);
        return setMsg(pErr.message);
      }
    }

    setLoading(false);
    await refresh();
    onDone();
  }

  // --- Items ---
  async function addItem() {
    if (!quote) return;
    setMsg("");
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return setMsg("未登录");

    const nextSort = items.length ? Math.max(...items.map((x) => x.sort_order)) + 1 : 1;

    const { error } = await supabase.from("project_quote_items").insert({
      quote_id: quote.id,
      owner_id: userRes.user.id,
      item_name: `分项 ${items.length + 1}`,
      description: null,
      qty: 1,
      unit_price: 0,
      sort_order: nextSort,
    });

    if (error) return setMsg(error.message);
    await refresh(); // 总价由DB算，所以必须回拉
  }

  async function updateItem(id: string, patch: Partial<QuoteItem>) {
  if (!quote) return;
  setMsg("");

  const { error } = await supabase
    .from("project_quote_items")
    .update({
      item_name: patch.item_name,
      description: patch.description,
      qty: patch.qty,
      unit_price: patch.unit_price,
      sort_order: patch.sort_order,
    })
    .eq("id", id);

  if (error) return setMsg(error.message);

  // ✅ 本地更新（至少先不抖）
  setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } as any : it)));

  // ✅ 只有 qty / unit_price / sort_order 会影响 DB金额/总价，才刷新
  const affectsTotals =
    patch.qty !== undefined || patch.unit_price !== undefined || patch.sort_order !== undefined;

  if (affectsTotals) {
    await refresh();
  }
}

  async function deleteItem(id: string) {
    setMsg("");
    const { error } = await supabase.from("project_quote_items").delete().eq("id", id);
    if (error) return setMsg(error.message);
    await refresh();
  }

  async function exportQuotePdf() {
  if (!quote) return;

  const blob = await pdf(
    <QuotePdfDoc
      projectName={"" /* 可传 project.client_name */}
      projectAddress={"" /* 可传 project.address */}
      quote={quote}
      items={items}
      payments={payments}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quote-${projectId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

  // --- Quote fields ---
  async function updateQuote(patch: Partial<Quote>) {
  if (!quote) return;
  setMsg("");

  const { error } = await supabase
    .from("project_quotes")
    .update({
      recommended_total: patch.recommended_total,
      note: patch.note,
    })
    .eq("id", quote.id);

  if (error) return setMsg(error.message);

  // ✅ 本地更新，不刷新整页
  setQuote((prev) => (prev ? { ...prev, ...patch } as any : prev));
}

  // --- Payments ---
  async function updatePayment(id: string, patch: Partial<Payment>) {
  setMsg("");

  const { error } = await supabase
    .from("project_quote_payments")
    .update({
      title: patch.title,
      due_date: patch.due_date,
      percent: patch.percent,
      paid: patch.paid,
    })
    .eq("id", id);

  if (error) return setMsg(error.message);

  // ✅ 本地更新
  setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as any : p)));

  // ✅ 只有 percent 会影响 amount（DB算），才刷新拿新 amount
  if (patch.percent !== undefined) {
    await refresh();
  }
}

    async function uploadPhoto(file: File) {
    if (!quote) return;
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const ext = extFromName(file.name);
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${user.id}/${projectId}/quote/${filename}`;

    // 1) 上传到 storage
    const { error: upErr } = await supabase.storage
      .from("project-photos")
      .upload(path, file, { upsert: false });

    if (upErr) return setMsg(upErr.message);

    // 2) 记录到表
    const { error: insErr } = await supabase.from("project_quote_photos").insert({
      quote_id: quote.id,
      owner_id: user.id,
      storage_path: path,
      caption: null,
    });

    if (insErr) return setMsg(insErr.message);

    await refresh();
  }

  async function updatePhotoCaption(id: string, caption: string | null) {
  setMsg("");

  const { error } = await supabase
    .from("project_quote_photos")
    .update({ caption })
    .eq("id", id);

  if (error) return setMsg(error.message);

  // ✅ 本地更新，不刷新
  setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
}

  async function deletePhoto(id: string, storage_path: string) {
    setMsg("");

    // 1) 删 storage 文件
    const { error: rmErr } = await supabase.storage
      .from("project-photos")
      .remove([storage_path]);

    if (rmErr) return setMsg(rmErr.message);

    // 2) 删表记录
    const { error: dbErr } = await supabase.from("project_quote_photos").delete().eq("id", id);
    if (dbErr) return setMsg(dbErr.message);

    await refresh();
  }

  const percentSum = useMemo(
    () => payments.reduce((s, p) => s + n(p.percent), 0),
    [payments]
  );

  if (loading) {
    return (
      <div className="bg-white border rounded-2xl p-4">
        <div className="text-lg font-bold">P2 量尺报价</div>
        <div className="mt-2 text-sm opacity-90">加载中...</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="bg-white border rounded-2xl p-4">
        <div className="text-lg font-bold">P2 量尺报价</div>
        <div className="mt-2 text-sm opacity-90">
          先初始化报价：创建该项目的报价记录 + 默认4笔付款计划。
        </div>

        {msg && <div className="mt-3 text-sm text-red-600">{msg}</div>}


        <button
          onClick={initQuote}
          className="mt-4 w-full px-4 py-3 rounded-xl bg-black text-white font-medium"
        >
          初始化报价（默认4笔）
        </button>
      </div>
    );
  }

async function confirmToP3() {
  setMsg("");

  // 进入P3前的最小检查：必须已有 quote
  if (!quote) return setMsg("还没有报价记录（quote），不能进入P3");

  const { error } = await supabase
    .from("projects")
    .update({ stage: "P3_SITE" })
    .eq("id", projectId);

  if (error) return setMsg(error.message);

  // 刷新页面，让详情页/首页颜色立刻更新
  window.location.reload();
}

  return (
    <div className="space-y-4">
      {/* 总览卡片 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">P2 量尺报价</div>
            <div className="text-xs opacity-80">总价由数据库自动计算（不靠前端）</div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-80">总价</div>
            <div className="text-2xl font-bold">NZD {Number(quote.total_amount || 0).toFixed(2)}</div>
          </div>
        </div>

        {msg && <div className="mt-3 text-sm text-red-600">{msg}</div>}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium">建议报价（手填）</div>
            <input
              inputMode="decimal"
              className="mt-2 w-full border rounded-xl px-3 py-3"
              defaultValue={quote.recommended_total ?? 0}
              onBlur={(e) => updateQuote({ recommended_total: n(e.target.value) })}
              placeholder="例如 25000"
            />
            <div className="mt-1 text-xs opacity-80">失焦自动保存</div>
          </div>

          <div>
            <div className="text-sm font-medium">备注</div>
            <textarea
              className="mt-2 w-full border rounded-xl px-3 py-3 min-h-[92px]"
              defaultValue={quote.note || ""}
              onBlur={(e) => updateQuote({ note: e.target.value || null })}
              placeholder="选填：报价说明"
            />
            <div className="mt-1 text-xs opacity-80">失焦自动保存</div>
          </div>
        </div>
      </div>

            {/* 量尺照片 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold">量尺 / 现场照片</div>

         <PhotoPicker
  cameraLabel="+ 拍照"
  galleryLabel="+ 从图库选择"
  onPick={(file) => uploadPhoto(file)}
/>
        </div>

        <div className="mt-2 text-xs opacity-80">
          手机可直接拍照上传。每张图可写备注，支持删除。
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {photos.map((ph) => (
            <div key={ph.id} className="border rounded-2xl overflow-hidden">
              <div className="bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrls[ph.storage_path] || ""}
                  alt="photo"
                  className="w-full h-56 object-cover"
                />
              </div>

              <div className="p-3 space-y-2">
                <textarea
                  className="w-full border rounded-xl px-3 py-2 text-sm min-h-[60px]"
                  defaultValue={ph.caption || ""}
                  placeholder="照片备注（选填）"
                  onBlur={(e) => updatePhotoCaption(ph.id, e.target.value || null)}
                />

                <button
                  onClick={() => deletePhoto(ph.id, ph.storage_path)}
                  className="w-full px-3 py-2 rounded-xl border text-sm"
                >
                  删除照片
                </button>
              </div>
            </div>
          ))}

          {photos.length === 0 && (
            <div className="text-sm opacity-90">暂无照片，点右上角“上传照片”。</div>
          )}
        </div>
      </div>

      {/* 分项 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="font-bold">分项报价</div>
          <button onClick={addItem} className="px-3 py-2 rounded-xl bg-black text-white text-sm">
            + 添加分项
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {items.map((it) => (
            <div key={it.id} className="border rounded-2xl p-3">
              <div className="flex items-start justify-between gap-3">
                <input
                  className="flex-1 border rounded-xl px-3 py-2 text-sm"
                  defaultValue={it.item_name}
                  onBlur={(e) => updateItem(it.id, { item_name: e.target.value })}
                  placeholder="分项名称"
                />
                <button
                  onClick={() => deleteItem(it.id)}
                  className="px-3 py-2 rounded-xl border text-sm"
                >
                  删除
                </button>
              </div>

              <textarea
                className="mt-2 w-full border rounded-xl px-3 py-2 text-sm min-h-[72px]"
                defaultValue={it.description || ""}
                onBlur={(e) => updateItem(it.id, { description: e.target.value || null })}
                placeholder="描述/备注（选填）"
              />

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs opacity-80">数量</div>
                  <input
                    inputMode="decimal"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                    defaultValue={it.qty ?? 1}
                    onBlur={(e) => updateItem(it.id, { qty: n(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="text-xs opacity-80">单价</div>
                  <input
                    inputMode="decimal"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                    defaultValue={it.unit_price ?? 0}
                    onBlur={(e) => updateItem(it.id, { unit_price: n(e.target.value) })}
                  />
                </div>
              </div>

              <div className="mt-2 text-sm font-medium">
                本项金额（DB算）：NZD {Number(it.amount || 0).toFixed(2)}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-sm opacity-90">暂无分项，点右上角“添加分项”。</div>
          )}
        </div>
      </div>

      {/* 付款计划 */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="font-bold">付款计划（默认4笔）</div>
        <div className="mt-2 text-xs opacity-80">
          金额由数据库自动算：amount = total_amount × percent
        </div>

        <div className="mt-3 space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="border rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold">第 {p.seq} 笔</div>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!p.paid}
                    onChange={(e) => updatePayment(p.id, { paid: e.target.checked })}
                  />
                  已支付
                </label>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs opacity-80">名称</div>
                  <input
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                    defaultValue={p.title}
                    onBlur={(e) => updatePayment(p.id, { title: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs opacity-80">到期日</div>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                    defaultValue={p.due_date || ""}
                    onBlur={(e) => updatePayment(p.id, { due_date: e.target.value || null })}
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs opacity-80">比例 %</div>
                  <input
                    inputMode="decimal"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                    defaultValue={p.percent ?? 0}
                    onBlur={(e) => updatePayment(p.id, { percent: n(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="text-xs opacity-80">金额（DB算）</div>
                  <div className="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-gray-50">
                    NZD {Number(p.amount || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-sm">
          比例合计：{" "}
          <span className={percentSum === 100 ? "font-bold" : "font-bold text-red-600"}>
            {percentSum.toFixed(2)}%
          </span>
          <span className="text-xs opacity-80 ml-2">（建议=100%）</span>
        </div>
      </div>
      <div className="bg-white border rounded-2xl p-4">
  <div className="font-bold">阶段确认</div>
  <div className="mt-2 text-sm opacity-90">
    点击后进入 P3（施工进场/材料准备），首页颜色会随阶段变化。
  </div>

<button
  onClick={exportQuotePdf}
  className="px-3 py-2 rounded-xl border text-sm"
>
  导出报价PDF
</button>

  <button
    onClick={confirmToP3}
    className="mt-3 w-full px-4 py-3 rounded-2xl bg-black text-white text-base active:scale-[0.99]"
  >
    ✅ 确认进入 P3（施工进场）
  </button>
</div>
    </div>
  );
}