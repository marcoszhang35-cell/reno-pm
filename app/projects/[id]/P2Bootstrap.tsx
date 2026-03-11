"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
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
  amount: number;
  sort_order: number;
  cost_price: number;
};

type ItemPhoto = {
  id: string;
  quote_item_id: string;
  image_path: string;
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

function money(v: number) {
  return `NZD ${Number(v || 0).toFixed(2)}`;
}

function calcItemsTotalInclGst(nextItems: QuoteItem[]) {
  const subtotal = nextItems.reduce((s, it) => s + Number(it.amount || 0), 0);
  const gst = subtotal * 0.15;
  return subtotal + gst;
}

export default function P2Bootstrap({
  projectId,
  clientName,
  address,
  onDone,
  onGoPayment,
}: {
  projectId: string;
  clientName?: string;
  address?: string;
  onDone: () => void;
  onGoPayment?: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [photosByItem, setPhotosByItem] = useState<Record<string, ItemPhoto[]>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [syncingTotal, setSyncingTotal] = useState(false);

  async function syncQuoteTotalAmount(quoteId: string, totalInclGst: number) {
    const { error } = await supabase
      .from("project_quotes")
      .update({ total_amount: totalInclGst })
      .eq("id", quoteId);

    if (error) {
      console.error("syncQuoteTotalAmount error:", error);
    }
  }

  async function refresh() {
    setMsg("");
    setLoading(true);

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setLoading(false);
      return setMsg("未登录");
    }

    const { data: profileRes, error: profileErr } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userRes.user.id)
      .single();

    if (profileErr) {
      setLoading(false);
      return setMsg(profileErr.message);
    }

    setRole(profileRes.role);

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
      setPhotosByItem({});
      setPhotoUrls({});
      setLoading(false);
      return;
    }

    const currentQuote = qRes.data as Quote;
    setQuote(currentQuote);

    const iRes = await supabase
      .from("project_quote_items")
      .select("id,item_name,description,qty,unit_price,amount,sort_order,cost_price")
      .eq("quote_id", currentQuote.id)
      .order("sort_order", { ascending: true });

    if (iRes.error) {
      setLoading(false);
      return setMsg(iRes.error.message);
    }

    const itemsData = ((iRes.data || []) as Record<string, unknown>[]).map((it) => ({
      ...it,
      id: String(it.id || ""),
      item_name: String(it.item_name || ""),
      description: it.description ? String(it.description) : null,
      qty: n(it.qty),
      unit_price: n(it.unit_price),
      amount: n(it.amount),
      sort_order: n(it.sort_order),
      cost_price: n(it.cost_price),
    })) as QuoteItem[];

    setItems(itemsData);

    const computedSubtotal = itemsData.reduce((s, it) => s + Number(it.amount || 0), 0);
    const computedGst = computedSubtotal * 0.15;
    const computedTotalIncl = computedSubtotal + computedGst;

    if (Math.abs(Number(currentQuote.total_amount || 0) - computedTotalIncl) > 0.01) {
      setSyncingTotal(true);
      await syncQuoteTotalAmount(currentQuote.id, computedTotalIncl);
      setSyncingTotal(false);
      setQuote((prev) => (prev ? { ...prev, total_amount: computedTotalIncl } : prev));
    }

    const itemIds = itemsData.map((x) => x.id);
    if (itemIds.length > 0) {
      const phRes = await supabase
        .from("project_quote_item_photos")
        .select("id,quote_item_id,image_path")
        .in("quote_item_id", itemIds)
        .order("created_at", { ascending: false });

      if (phRes.error) {
        setLoading(false);
        return setMsg(phRes.error.message);
      }

      const photoRows = (phRes.data || []) as ItemPhoto[];
      const grouped: Record<string, ItemPhoto[]> = {};
      for (const row of photoRows) {
        if (!grouped[row.quote_item_id]) grouped[row.quote_item_id] = [];
        grouped[row.quote_item_id].push(row);
      }
      setPhotosByItem(grouped);

      const paths = photoRows.map((x) => x.image_path).filter(Boolean);
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
        } else {
          setPhotoUrls({});
        }
      } else {
        setPhotoUrls({});
      }
    } else {
      setPhotosByItem({});
      setPhotoUrls({});
    }

    setLoading(false);
  }

  useEffect(() => {
    void refresh();
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
        {
          project_id: projectId,
          owner_id: user.id,
          recommended_total: 0,
          total_amount: 0,
          note: null,
        },
        { onConflict: "project_id" }
      )
      .select("id,project_id,recommended_total,total_amount,note")
      .single();

    if (qErr) {
      setLoading(false);
      return setMsg(qErr.message);
    }

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "quote_initialized",
      action_note: "初始化报价",
      operator_id: user.id,
    });

    setLoading(false);
    await refresh();
    onDone();
  }

  async function addItem() {
    if (!quote) return;
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return setMsg("未登录");

    const nextSort = items.length ? Math.max(...items.map((x) => x.sort_order)) + 1 : 1;

    const { error } = await supabase.from("project_quote_items").insert({
      quote_id: quote.id,
      owner_id: userRes.user.id,
      item_name: `小项目 ${items.length + 1}`,
      description: null,
      qty: 1,
      unit_price: 0,
      cost_price: 0,
      sort_order: nextSort,
    });

    if (error) return setMsg(error.message);

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "quote_item_added",
      action_note: `新增小项目 ${items.length + 1}`,
      operator_id: userRes.user.id,
    });

    await refresh();
  }

  async function updateItem(id: string, patch: Partial<QuoteItem>) {
    setMsg("");
    setSavingId(id);

    const current = items.find((it) => it.id === id);
    if (!current) {
      setSavingId(null);
      return;
    }

    const nextQty = patch.qty !== undefined ? n(patch.qty) : n(current.qty);
    const nextUnitPrice =
      patch.unit_price !== undefined ? n(patch.unit_price) : n(current.unit_price);

    const nextAmount = nextQty * nextUnitPrice;

    const nextItem: QuoteItem = {
      ...current,
      ...patch,
      qty: nextQty,
      unit_price: nextUnitPrice,
      amount: nextAmount,
      cost_price:
        patch.cost_price !== undefined ? n(patch.cost_price) : n(current.cost_price),
    };

    const prevItems = items;
    const nextItems = items.map((it) => (it.id === id ? nextItem : it));
    const nextTotalInclGst = calcItemsTotalInclGst(nextItems);

    setItems(nextItems);
    setQuote((prev) => (prev ? { ...prev, total_amount: nextTotalInclGst } : prev));

    const { error } = await supabase
      .from("project_quote_items")
      .update({
        item_name: patch.item_name,
        description: patch.description,
        qty: patch.qty !== undefined ? nextQty : undefined,
        unit_price: patch.unit_price !== undefined ? nextUnitPrice : undefined,
        amount: nextAmount,
        sort_order: patch.sort_order,
        cost_price: patch.cost_price !== undefined ? n(patch.cost_price) : undefined,
      })
      .eq("id", id);

    if (error) {
      setItems(prevItems);
      setQuote((prev) =>
        prev ? { ...prev, total_amount: calcItemsTotalInclGst(prevItems) } : prev
      );
      setSavingId(null);
      return setMsg(error.message);
    }

    if (quote?.id) {
      await syncQuoteTotalAmount(quote.id, nextTotalInclGst);
    }

    setSavingId(null);
  }

  async function deleteItem(id: string) {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    const { error } = await supabase.from("project_quote_items").delete().eq("id", id);
    if (error) return setMsg(error.message);

    if (user) {
      await supabase.from("project_action_logs").insert({
        project_id: projectId,
        action_type: "quote_item_deleted",
        action_note: `删除小项目 ${id}`,
        operator_id: user.id,
      });
    }

    await refresh();
  }

  async function updateQuote(patch: Partial<Quote>) {
    if (!quote) return;
    setMsg("");

    const prevQuote = quote;
    const nextQuote = { ...quote, ...patch };
    setQuote(nextQuote);

    const { error } = await supabase
      .from("project_quotes")
      .update({
        recommended_total: patch.recommended_total,
        note: patch.note,
      })
      .eq("id", quote.id);

    if (error) {
      setQuote(prevQuote);
      return setMsg(error.message);
    }
  }

  async function uploadItemPhotos(itemId: string, files: FileList | null) {
    if (!files || files.length === 0 || !quote) return;
    setMsg("");
    setUploadingItemId(itemId);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setUploadingItemId(null);
      return setMsg("未登录");
    }

    for (const file of Array.from(files)) {
      const ext = extFromName(file.name);
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${user.id}/${projectId}/quote-items/${itemId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from("project-photos")
        .upload(path, file, { upsert: false });

      if (upErr) {
        setUploadingItemId(null);
        return setMsg(upErr.message);
      }

      const { error: insErr } = await supabase.from("project_quote_item_photos").insert({
        quote_item_id: itemId,
        created_by: user.id,
        image_path: path,
      });

      if (insErr) {
        setUploadingItemId(null);
        return setMsg(insErr.message);
      }
    }

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "quote_item_photo_uploaded",
      action_note: `上传小项目照片 ${itemId}`,
      operator_id: user.id,
    });

    setUploadingItemId(null);
    await refresh();
  }

  async function deletePhoto(photoId: string, imagePath: string) {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    const { error: rmErr } = await supabase.storage
      .from("project-photos")
      .remove([imagePath]);
    if (rmErr) return setMsg(rmErr.message);

    const { error: dbErr } = await supabase
      .from("project_quote_item_photos")
      .delete()
      .eq("id", photoId);
    if (dbErr) return setMsg(dbErr.message);

    if (user) {
      await supabase.from("project_action_logs").insert({
        project_id: projectId,
        action_type: "quote_item_photo_deleted",
        action_note: imagePath,
        operator_id: user.id,
      });
    }

    await refresh();
  }

  async function exportQuotePdf() {
    if (!quote) return;

    const blob = await pdf(
      <QuotePdfDoc
        projectName={clientName || ""}
        projectAddress={address || ""}
        logoUrl={`${window.location.origin}/logo.png`}
        quote={quote}
        items={items}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quote-${projectId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.amount || 0), 0),
    [items]
  );

  const gstTotal = subtotal * 0.15;
  const totalInclGst = subtotal + gstTotal;

  const costTotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.cost_price || 0) * Number(it.qty || 0), 0),
    [items]
  );

  const profit = subtotal - costTotal;
  const margin = subtotal > 0 ? (profit / subtotal) * 100 : 0;

  const canSeeCost = role === "manager" || role === "boss";
  const canAccessP2 = role === "sales" || role === "manager" || role === "boss";

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-lg font-bold text-white">P2 报价</div>
        <div className="mt-2 text-sm text-white/70">加载中...</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-lg font-bold text-white">P2 报价</div>
        <div className="mt-2 text-sm text-white/70">
          先初始化报价记录。初始化后即可录入小项目、上传照片和导出 PDF。
        </div>

        {msg && <div className="mt-3 text-sm text-red-300">{msg}</div>}

        <button
          onClick={initQuote}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 font-medium text-slate-950 transition hover:opacity-95"
        >
          初始化报价
        </button>
      </div>
    );
  }

  if (role && !canAccessP2) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-lg font-bold text-white">无权限访问</div>
        <div className="mt-2 text-sm text-white/70">你当前角色没有权限访问报价页面。</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/70">
              Quote Workspace
            </div>
            <h2 className="mt-2 text-3xl font-semibold">P2 报价</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              上方正式报价表会根据下方小项目自动同步。每个小项目可上传多张照片、填写备注、成本价和报价。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="text-xs text-white/70">客户</div>
              <div className="mt-1 text-base font-medium">{clientName || "未填写"}</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="text-xs text-white/70">地址</div>
              <div className="mt-1 text-base font-medium">{address || "未填写"}</div>
            </div>
          </div>
        </div>
      </section>

      {msg && (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {msg}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.5fr_360px]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-white">正式报价表</h3>
              <p className="mt-1 text-sm text-white/55">根据下方小项目自动同步生成</p>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              Live Sync
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-white/5 text-left text-sm text-white/70">
                  <th className="px-5 py-4 font-medium">项目名称</th>
                  <th className="px-5 py-4 text-right font-medium">报价 ex GST</th>
                  <th className="px-5 py-4 text-right font-medium">GST 15%</th>
                  <th className="px-5 py-4 text-right font-medium">报价 incl GST</th>
                </tr>
              </thead>
              <tbody className="text-sm text-white/85">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-white/45">
                      暂无报价项目，请先添加小项目
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const ex = Number(it.amount || 0);
                    const gst = ex * 0.15;
                    const incl = ex + gst;

                    return (
                      <tr key={it.id} className="border-t border-white/10 hover:bg-white/5">
                        <td className="px-5 py-4">
                          <div className="font-medium text-white">
                            {it.item_name || `小项目 ${idx + 1}`}
                          </div>
                          {it.description ? (
                            <div className="mt-1 line-clamp-1 text-xs text-white/45">
                              {it.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-right">{money(ex)}</td>
                        <td className="px-5 py-4 text-right">{money(gst)}</td>
                        <td className="px-5 py-4 text-right font-medium">{money(incl)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/10 bg-white/5 font-semibold text-white">
                  <td className="px-5 py-4">总计</td>
                  <td className="px-5 py-4 text-right">{money(subtotal)}</td>
                  <td className="px-5 py-4 text-right">{money(gstTotal)}</td>
                  <td className="px-5 py-4 text-right">{money(totalInclGst)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">报价总览</h3>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                自动汇总
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-white/55">未税总价</span>
                <span className="font-medium text-white">{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-white/55">GST 15%</span>
                <span className="font-medium text-white">{money(gstTotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#081633] px-4 py-4 text-white">
                <span className="text-white/80">含税总价</span>
                <span className="text-lg font-semibold">{money(totalInclGst)}</span>
              </div>
            </div>

            <div className="mt-3 text-xs text-white/45">
              {syncingTotal ? "正在同步 total_amount..." : "报价总价会自动同步到付款流程"}
            </div>

            {canSeeCost ? (
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="mb-3 text-sm font-medium text-white/80">内部利润参考</div>
                <div className="space-y-2 text-sm text-white/70">
                  <div className="flex justify-between">
                    <span>成本总计</span>
                    <span>{money(costTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>毛利</span>
                    <span>{money(profit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>毛利率</span>
                    <span>{margin.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="text-sm font-medium text-white">建议报价（手填）</div>
              <input
                inputMode="decimal"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                defaultValue={quote.recommended_total ?? 0}
                onBlur={(e) => updateQuote({ recommended_total: n(e.target.value) })}
                placeholder="例如 25000"
              />
              <div className="mt-1 text-xs text-white/45">失焦自动保存</div>

              <div className="mt-4 text-sm font-medium text-white">报价备注</div>
              <textarea
                className="mt-2 min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                defaultValue={quote.note || ""}
                onBlur={(e) => updateQuote({ note: e.target.value || null })}
                placeholder="填写客户可见的报价备注、施工说明、有效期等"
              />
              <div className="mt-1 text-xs text-white/45">失焦自动保存</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white">导出 / 下一步</h3>
            <p className="mt-2 text-sm text-white/55">
              导出的 PDF 会带公司 logo，并使用当前正式报价表中的数据。
            </p>

            <div className="mt-4 space-y-3">
              <button
                onClick={exportQuotePdf}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                导出报价 PDF
              </button>

              {onGoPayment ? (
                <button
                  onClick={onGoPayment}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  进入付款阶段
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">量尺报价录入区</h3>
            <p className="mt-1 text-sm text-white/55">
              每新增一个小项目，上方正式报价表会自动增加一行。
            </p>
          </div>

          <button
            onClick={addItem}
            className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:opacity-95"
          >
            + 添加小项目
          </button>
        </div>
      </section>

      <section className="space-y-5">
        {items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-white/15 bg-white/5 p-10 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-lg font-medium text-white">还没有小项目</div>
            <p className="mt-2 text-sm text-white/55">
              点击上方“添加小项目”，开始录入量尺报价内容。
            </p>
          </div>
        ) : (
          items.map((it, index) => {
            const itemPhotos = photosByItem[it.id] || [];
            const ex = Number(it.amount || 0);
            const gst = ex * 0.15;
            const incl = ex + gst;

            return (
              <div
                key={it.id}
                className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-white/40">
                      Quote Item
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      {it.item_name || `小项目 ${index + 1}`}
                    </h3>
                  </div>

                  <button
                    onClick={() => deleteItem(it.id)}
                    className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-400/15"
                  >
                    删除
                  </button>
                </div>

                <div className="grid gap-6 p-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-sm font-medium text-white/80">项目名称</div>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                        defaultValue={it.item_name}
                        onBlur={(e) => updateItem(it.id, { item_name: e.target.value })}
                        placeholder="例如：一楼厨房"
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-white/80">备注</div>
                      <textarea
                        className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                        defaultValue={it.description || ""}
                        onBlur={(e) =>
                          updateItem(it.id, { description: e.target.value || null })
                        }
                        placeholder="填写施工内容、尺寸、客户要求等"
                      />
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-white">项目照片</h4>
                          <p className="mt-1 text-xs text-white/45">
                            一个小项目可上传多张照片，统一归属到当前小项目
                          </p>
                        </div>

                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                          {itemPhotos.length} 张
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <label className="inline-flex cursor-pointer items-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                          上传多张照片
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => uploadItemPhotos(it.id, e.target.files)}
                          />
                        </label>

                        <label className="inline-flex cursor-pointer items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
                          拍照上传
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            className="hidden"
                            onChange={(e) => uploadItemPhotos(it.id, e.target.files)}
                          />
                        </label>
                      </div>

                      {uploadingItemId === it.id ? (
                        <div className="mt-3 text-sm text-white/55">上传中...</div>
                      ) : null}

                      {itemPhotos.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                          {itemPhotos.map((ph) => (
                            <div
                              key={ph.id}
                              className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm"
                            >
                              {photoUrls[ph.image_path] ? (
                                <img
                                  src={photoUrls[ph.image_path]}
                                  alt="photo"
                                  className="h-32 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-32 items-center justify-center bg-white/5 text-sm text-white/45">
                                  图片加载中
                                </div>
                              )}

                              <div className="space-y-2 p-3">
                                <button
                                  onClick={() => deletePhoto(ph.id, ph.image_path)}
                                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                                >
                                  删除照片
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                          暂无照片，请上传当前小项目的现场图片
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-3 text-sm font-medium text-white/80">金额信息</div>

                      <div className="space-y-4">
                        {canSeeCost ? (
                          <div>
                            <div className="mb-2 text-sm font-medium text-white/80">
                              成本价（单价）
                            </div>
                            <input
                              inputMode="decimal"
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                              defaultValue={it.cost_price ?? 0}
                              onBlur={(e) => updateItem(it.id, { cost_price: n(e.target.value) })}
                              placeholder="0.00"
                            />
                          </div>
                        ) : null}

                        <div>
                          <div className="mb-2 text-sm font-medium text-white/80">数量</div>
                          <input
                            inputMode="decimal"
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                            defaultValue={it.qty ?? 1}
                            onBlur={(e) => updateItem(it.id, { qty: n(e.target.value) })}
                          />
                        </div>

                        <div>
                          <div className="mb-2 text-sm font-medium text-white/80">单价</div>
                          <input
                            inputMode="decimal"
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-cyan-400/40"
                            defaultValue={it.unit_price ?? 0}
                            onBlur={(e) => updateItem(it.id, { unit_price: n(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[#081633] p-4 text-white">
                      <div className="mb-3 text-sm font-medium text-white/80">自动计算</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/70">报价 ex GST</span>
                          <span>{money(ex)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/70">GST 15%</span>
                          <span>{money(gst)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>含税报价</span>
                          <span>{money(incl)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/55">
                      上方填写的报价会自动同步到页面顶部正式报价表中。
                    </div>

                    <div className="text-sm text-white/45">
                      {savingId === it.id ? "保存中..." : "输入框失焦后自动保存"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}