"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Quote = {
  id: string;
  total_amount: number;
};

type Payment = {
  id: string;
  seq: number;
  title: string;
  due_date: string | null;
  percent: number;
  amount: number;
  paid: boolean;
};

type Voucher = {
  id: string;
  payment_id: string | null;
  storage_path: string;
  note: string | null;
};

type ProjectApproval = {
  special_approved: boolean | null;
  special_approval_note: string | null;
};

function n(v: any) {
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

export default function PaymentFlow({
  projectId,
  clientName,
  address,
  onDone,
}: {
  projectId: string;
  clientName?: string;
  address?: string;
  onDone: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherUrls, setVoucherUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [specialApproved, setSpecialApproved] = useState(false);
  const [specialApprovalNote, setSpecialApprovalNote] = useState("");
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setMsg("");
    setLoading(true);

    const qRes = await supabase
      .from("project_quotes")
      .select("id,total_amount")
      .eq("project_id", projectId)
      .maybeSingle();

    if (qRes.error) {
      setLoading(false);
      return setMsg(qRes.error.message);
    }

    if (!qRes.data) {
      setQuote(null);
      setPayments([]);
      setVouchers([]);
      setVoucherUrls({});
      setLoading(false);
      return;
    }

    setQuote(qRes.data as Quote);

    const pRes = await supabase
      .from("project_quote_payments")
      .select("id,seq,title,due_date,percent,amount,paid")
      .eq("quote_id", qRes.data.id)
      .order("seq", { ascending: true });

    if (pRes.error) {
      setLoading(false);
      return setMsg(pRes.error.message);
    }

    setPayments((pRes.data || []) as Payment[]);

    const vRes = await supabase
      .from("payment_vouchers")
      .select("id,payment_id,storage_path,note")
      .eq("quote_id", qRes.data.id)
      .order("created_at", { ascending: false });

    if (vRes.error) {
      setLoading(false);
      return setMsg(vRes.error.message);
    }

    const voucherRows = (vRes.data || []) as Voucher[];
    setVouchers(voucherRows);

    const paths = voucherRows.map((x) => x.storage_path).filter(Boolean);
    if (paths.length) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("project-photos")
        .createSignedUrls(paths, 60 * 60);

      if (!signErr && signed) {
        const map: Record<string, string> = {};
        for (const s of signed) {
          if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        }
        setVoucherUrls(map);
      } else {
        setVoucherUrls({});
      }
    } else {
      setVoucherUrls({});
    }

    const prRes = await supabase
      .from("projects")
      .select("special_approved,special_approval_note")
      .eq("id", projectId)
      .maybeSingle();

    if (!prRes.error && prRes.data) {
      const pr = prRes.data as ProjectApproval;
      setSpecialApproved(!!pr.special_approved);
      setSpecialApprovalNote(pr.special_approval_note || "");
    } else {
      setSpecialApproved(false);
      setSpecialApprovalNote("");
    }

    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addPaymentRow() {
    if (!quote) return;

    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const nextSeq = payments.length ? Math.max(...payments.map((x) => x.seq)) + 1 : 1;

    const { error } = await supabase.from("project_quote_payments").insert({
      quote_id: quote.id,
      owner_id: user.id,
      seq: nextSeq,
      title: `付款 ${nextSeq}`,
      due_date: null,
      percent: 0,
      paid: false,
    });

    if (error) return setMsg(error.message);

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "payment_node_added",
      action_note: `新增付款节点 ${nextSeq}`,
      operator_id: user.id,
    });

    await refresh();
  }

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

    await refresh();
  }

  async function deletePayment(id: string) {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    const { error } = await supabase.from("project_quote_payments").delete().eq("id", id);
    if (error) return setMsg(error.message);

    if (user) {
      await supabase.from("project_action_logs").insert({
        project_id: projectId,
        action_type: "payment_node_deleted",
        action_note: `删除付款节点 ${id}`,
        operator_id: user.id,
      });
    }

    await refresh();
  }

  async function uploadVoucher(paymentId: string | null, files: FileList | null) {
    if (!files || files.length === 0 || !quote) return;

    setMsg("");
    setUploading(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setUploading(false);
      return setMsg("未登录");
    }

    for (const file of Array.from(files)) {
      const ext = extFromName(file.name);
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${user.id}/${projectId}/payment-vouchers/${filename}`;

      const { error: upErr } = await supabase.storage
        .from("project-photos")
        .upload(path, file, { upsert: false });

      if (upErr) {
        setUploading(false);
        return setMsg(upErr.message);
      }

      const { error: insErr } = await supabase.from("payment_vouchers").insert({
        quote_id: quote.id,
        payment_id: paymentId,
        storage_path: path,
        note: null,
        owner_id: user.id,
      });

      if (insErr) {
        setUploading(false);
        return setMsg(insErr.message);
      }
    }

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "payment_voucher_uploaded",
      action_note: paymentId ? `上传节点付款凭证 ${paymentId}` : "上传通用付款凭证",
      operator_id: user.id,
    });

    setUploading(false);
    await refresh();
  }

  async function updateVoucherNote(id: string, note: string | null) {
    setMsg("");

    const { error } = await supabase
      .from("payment_vouchers")
      .update({ note })
      .eq("id", id);

    if (error) return setMsg(error.message);

    setVouchers((prev) => prev.map((v) => (v.id === id ? { ...v, note } : v)));
  }

  async function deleteVoucher(id: string, storagePath: string) {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    const { error: rmErr } = await supabase.storage
      .from("project-photos")
      .remove([storagePath]);

    if (rmErr) return setMsg(rmErr.message);

    const { error: dbErr } = await supabase
      .from("payment_vouchers")
      .delete()
      .eq("id", id);

    if (dbErr) return setMsg(dbErr.message);

    if (user) {
      await supabase.from("project_action_logs").insert({
        project_id: projectId,
        action_type: "payment_voucher_deleted",
        action_note: storagePath,
        operator_id: user.id,
      });
    }

    await refresh();
  }

  async function specialApprove() {
    const reason = window.prompt("请输入特批原因", specialApprovalNote || "");
    if (!reason) return;

    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const { error: pErr } = await supabase
      .from("projects")
      .update({
        special_approved: true,
        special_approved_by: user.id,
        special_approved_at: new Date().toISOString(),
        special_approval_note: reason,
      })
      .eq("id", projectId);

    if (pErr) return setMsg(pErr.message);

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "special_approval",
      action_note: reason,
      operator_id: user.id,
    });

    setSpecialApproved(true);
    setSpecialApprovalNote(reason);
    alert("特批成功");
    onDone();
  }

  async function cancelSpecialApprove() {
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const { error } = await supabase
      .from("projects")
      .update({
        special_approved: false,
        special_approved_by: null,
        special_approved_at: null,
        special_approval_note: null,
      })
      .eq("id", projectId);

    if (error) return setMsg(error.message);

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "cancel_special_approval",
      action_note: "取消特批",
      operator_id: user.id,
    });

    setSpecialApproved(false);
    setSpecialApprovalNote("");
    alert("已取消特批");
    onDone();
  }

  async function confirmToP3() {
    if (!quote) return setMsg("没有报价记录");
    if (vouchers.length === 0) return setMsg("请先上传至少一张付款凭证");

    const percentOk = Math.abs(percentSum - 100) < 0.001;
    if (!percentOk && !specialApproved) {
      return setMsg("付款比例未达到 100%，请调整后再进入 P3，或先特批。");
    }

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return setMsg("未登录");

    const { error } = await supabase
      .from("projects")
      .update({ stage: "P3_SITE" })
      .eq("id", projectId);

    if (error) return setMsg(error.message);

    await supabase.from("project_action_logs").insert({
      project_id: projectId,
      action_type: "confirm_to_p3",
      action_note: "付款流程完成后进入 P3",
      operator_id: user.id,
    });

    alert("已进入 P3");
    onDone();
  }

  const subtotal = Number(quote?.total_amount || 0);
  const gst = subtotal * 0.15;
  const totalIncl = subtotal + gst;

  const percentSum = useMemo(
    () => payments.reduce((s, p) => s + Number(p.percent || 0), 0),
    [payments]
  );

  const paidCount = useMemo(
    () => payments.filter((p) => !!p.paid).length,
    [payments]
  );

  const groupedVouchers = useMemo(() => {
    const map: Record<string, Voucher[]> = {};
    for (const v of vouchers) {
      const key = v.payment_id || "general";
      if (!map[key]) map[key] = [];
      map[key].push(v);
    }
    return map;
  }, [vouchers]);

  if (loading) {
    return <div className="rounded-2xl border bg-white p-4">加载中...</div>;
  }

  if (!quote) {
    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="font-bold">付款流程</div>
        <div className="mt-2 text-sm opacity-80">
          请先在 P2 报价页初始化报价并录入小项目。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/70">
              Payment Flow
            </div>
            <h2 className="mt-2 text-3xl font-semibold">付款流程</h2>
            <p className="mt-2 text-sm text-white/80">
              此页面单独管理付款节点、付款凭证、特批和进入下一阶段。
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
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_360px]">
        <div className="rounded-[28px] border bg-white p-5 shadow-sm">
          <div className="font-semibold text-lg">付款总览</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-neutral-50 px-4 py-4">
              <div className="text-xs text-neutral-500">报价总价</div>
              <div className="mt-1 text-lg font-semibold">{money(subtotal)}</div>
            </div>

            <div className="rounded-2xl bg-neutral-50 px-4 py-4">
              <div className="text-xs text-neutral-500">付款比例合计</div>
              <div className={`mt-1 text-lg font-semibold ${Math.abs(percentSum - 100) < 0.001 ? "" : "text-red-600"}`}>
                {percentSum.toFixed(2)}%
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white">
              <div className="text-xs text-white/70">已支付节点</div>
              <div className="mt-1 text-lg font-semibold">
                {paidCount} / {payments.length}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            说明：此处“报价总价”读取的是 <span className="font-medium">project_quotes.total_amount</span>。  
            你当前 P2 页最好把含税总价同步写入这个字段，这样这里显示才会最准。
          </div>
        </div>

        
      </div>

      <div className="rounded-[28px] border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">付款节点</div>
            <div className="mt-1 text-sm text-neutral-500">
              可自由调整为一次、两次、三次或更多。
            </div>
          </div>

          <button
            onClick={addPaymentRow}
            className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
          >
            + 添加付款节点
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400">
              还没有付款节点，请先新增。
            </div>
          ) : (
            payments.map((p) => {
              const rowVouchers = groupedVouchers[p.id] || [];

              return (
                <div key={p.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">第 {p.seq} 笔</div>
                    <button
                      onClick={() => deletePayment(p.id)}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      删除
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs opacity-80">名称</div>
                      <input
                        className="w-full rounded-xl border px-3 py-3"
                        defaultValue={p.title}
                        onBlur={(e) => updatePayment(p.id, { title: e.target.value })}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs opacity-80">到期日</div>
                      <input
                        type="date"
                        className="w-full rounded-xl border px-3 py-3"
                        defaultValue={p.due_date || ""}
                        onBlur={(e) => updatePayment(p.id, { due_date: e.target.value || null })}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs opacity-80">比例 %</div>
                      <input
                        inputMode="decimal"
                        className="w-full rounded-xl border px-3 py-3"
                        defaultValue={p.percent ?? 0}
                        onBlur={(e) => updatePayment(p.id, { percent: n(e.target.value) })}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs opacity-80">金额（DB算）</div>
                      <div className="rounded-xl border bg-neutral-50 px-3 py-3">
                        {money(p.amount || 0)}
                      </div>
                    </div>
                  </div>

                  <label className="mt-3 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!p.paid}
                      onChange={(e) => updatePayment(p.id, { paid: e.target.checked })}
                    />
                    已支付
                  </label>

                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer rounded-2xl border px-4 py-2 text-sm">
                      上传此节点付款凭证
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => uploadVoucher(p.id, e.target.files)}
                      />
                    </label>
                  </div>

                  {rowVouchers.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {rowVouchers.map((v) => (
                        <div key={v.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                          {voucherUrls[v.storage_path] ? (
                            <img
                              src={voucherUrls[v.storage_path]}
                              alt="voucher"
                              className="h-40 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-40 items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                              图片加载中
                            </div>
                          )}

                          <div className="p-3">
                            <textarea
                              className="min-h-[72px] w-full rounded-xl border px-3 py-2 text-sm"
                              defaultValue={v.note || ""}
                              placeholder="凭证备注"
                              onBlur={(e) => updateVoucherNote(v.id, e.target.value || null)}
                            />

                            <button
                              onClick={() => deleteVoucher(v.id, v.storage_path)}
                              className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                            >
                              删除凭证
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-[28px] border bg-white p-5 shadow-sm">
        <div className="text-xl font-semibold">通用付款凭证</div>
        <div className="mt-1 text-sm text-neutral-500">
          上传照片或拍照后，可作为进入下一步的凭证。
        </div>

        <div className="mt-4">
          <label className="inline-flex cursor-pointer rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
            {uploading ? "上传中..." : "上传通用付款凭证"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => uploadVoucher(null, e.target.files)}
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(groupedVouchers["general"] || []).map((v) => (
            <div key={v.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              {voucherUrls[v.storage_path] ? (
                <img
                  src={voucherUrls[v.storage_path]}
                  alt="voucher"
                  className="h-48 w-full object-cover"
                />
              ) : (
                <div className="flex h-48 items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                  图片加载中
                </div>
              )}

              <div className="p-3">
                <textarea
                  className="min-h-[72px] w-full rounded-xl border px-3 py-2 text-sm"
                  defaultValue={v.note || ""}
                  placeholder="凭证备注"
                  onBlur={(e) => updateVoucherNote(v.id, e.target.value || null)}
                />

                <button
                  onClick={() => deleteVoucher(v.id, v.storage_path)}
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                >
                  删除凭证
                </button>
              </div>
            </div>
          ))}
        </div>

        {(groupedVouchers["general"] || []).length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400">
            暂无通用付款凭证
          </div>
        ) : null}
      </div>
    </div>
  );
}