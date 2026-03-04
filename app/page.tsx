"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
  }

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else setMsg("注册成功（如开启邮箱验证请去邮箱确认）。");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (session) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Reno PM</h1>
        <p className="mt-2">已登录：{session.user.email}</p>
        <p className="mt-3">
          <a className="underline" href="/projects">进入项目首页 →</a>
        </p>
        <button className="mt-4 px-3 py-2 rounded border" onClick={signOut}>退出</button>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-md">
      <h1 className="text-2xl font-bold">登录 / 注册</h1>
      <input
        className="mt-4 w-full border rounded px-3 py-2"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="mt-2 w-full border rounded px-3 py-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="mt-3 flex gap-2">
        <button className="px-3 py-2 rounded border" onClick={signIn}>登录</button>
        <button className="px-3 py-2 rounded border" onClick={signUp}>注册</button>
      </div>
      {msg && <p className="mt-3 text-red-600">{msg}</p>}
    </main>
  );
}