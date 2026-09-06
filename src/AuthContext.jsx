import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

const AuthContext = createContext(null);

// 登入成功後，用 Email 去 pos_members 查有沒有 Shopline 時期留下的舊會員資料，
// 有的話視為「同一個人」，把這次官網登入的身份跟舊的消費紀錄關聯起來；
// 沒有的話視為全新會員，建立一筆新的 pos_members 資料。
// 這個函式不會修改舊資料本身，只負責「查詢比對」跟「找不到時建立新會員」。
async function linkOrCreateMember(authUser) {
  const email = authUser.email;
  if (!email) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_members?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    );
    const found = await res.json();
    if (Array.isArray(found) && found.length > 0) {
      // 找到舊會員資料，直接回傳，不需要建立新的
      return found[0];
    }

    // 沒找到，建立一筆新的會員資料，source 標記為 tata_shop，
    // 跟 ERP 那邊的 pos_members 設計一致（區分會員來源：shopline_import / pos / tata_shop）
    const newMember = {
      id: `MEMBER-${authUser.id}`,
      email,
      name: authUser.user_metadata?.name || email.split("@")[0],
      source: "tata_shop",
      total_spend: 0,
      order_count: 0,
      created_at: new Date().toISOString(),
    };
    await fetch(`${SUPABASE_URL}/rest/v1/pos_members`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(newMember),
    });
    return newMember;
  } catch (e) {
    console.warn("linkOrCreateMember failed:", e);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 頁面載入時，先檢查目前是否已經有登入中的 session（例如上次登入後還沒登出）
    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data?.session?.user || null;
      setUser(sessionUser);
      if (sessionUser) {
        linkOrCreateMember(sessionUser).then(setMember);
      }
      setLoading(false);
    });

    // 訂閱登入狀態變化（登入、登出、token 自動更新都會觸發）
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user || null;
      setUser(sessionUser);
      if (sessionUser) {
        linkOrCreateMember(sessionUser).then(setMember);
      } else {
        setMember(null);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  async function signUpWithEmail(email, password) {
    // 加上emailRedirectTo，讓驗證信裡的連結點擊後直接導到「我的帳戶」，
    // 不是Supabase預設會導去的網站首頁(Site URL)，減少客人還要自己再點一次「帳戶」的多餘步驟
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    // 如果 Supabase 後台「Confirm email」是開啟的，data.session 會是 null，
    // 代表顧客註冊後還需要去信箱點確認連結才能登入；
    // 如果是關閉的，data.session 會直接有值，代表已經自動完成登入。
    // 回傳完整的 data，讓呼叫端能依照真實狀態給出正確的提示，不是憑空假設。
    return { data, error };
  }

  async function signInWithEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function resendConfirmationEmail(email) {
    // 重新寄送註冊驗證信，用於顧客沒收到信、或信件過期時。
    // 用Supabase Auth內建的resend方法，type設為"signup"對應到「重新確認註冊」這個情境
    // (跟忘記密碼信是不同的信件模板)。
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return { error };
  }

  async function resetPasswordForEmail(email) {
    // 發送重設密碼信，顧客點信裡的連結後會被導到 redirectTo 這個網址，
    // 帶著一組臨時的驗證資訊，讓他在那個頁面輸入新密碼。
    // 注意：這個功能跟註冊驗證信一樣，需要Supabase設定好自訂SMTP才能真正送達，
    // 在那之前，即使呼叫成功，信件實際上可能無法送到顧客信箱。
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    return { error };
  }

  async function updatePassword(newPassword) {
    // 這個函式要求使用者必須是已登入狀態(updateUser的限制)，適用兩種情境：
    // (1) 顧客透過忘記密碼信的連結登入後，在這裡設定新密碼
    // (2) 已登入的顧客，在「我的帳戶」主動想更換密碼
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }

  async function updateEmail(newEmail) {
    // 更新登入信箱。Supabase預設需要顧客去新(及/或舊)信箱點確認連結才會真正生效，
    // 呼叫成功不代表已經改好了，只代表確認信已經發送。
    // 同樣加上emailRedirectTo，確認完成後直接導到「我的帳戶」，不是網站首頁。
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/account` }
    );
    if (!error && member?.id) {
      // 同步更新pos_members.email，避免CRM這邊的email紀錄跟登入帳號不一致。
      // 這裡選擇「送出當下就同步」而不是等確認完成才同步，是因為Supabase沒有現成的
      // 「確認完成」callback可以掛，且CRM記錄「顧客表示要改成這個email」的即時性
      // 比等待確認更重要；即使顧客最後沒有真的完成驗證，這只是輕微的資料落差，
      // 遠比另一種做法(依賴linkOrCreateMember的email比對邏輯做同步)可能不小心
      // 把顧客的total_spend/order_count覆蓋回0的風險小很多。
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/pos_members?id=eq.${encodeURIComponent(member.id)}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: newEmail }),
        });
      } catch (e) {
        console.warn("同步pos_members.email失敗(不影響email變更本身):", e);
      }
    }
    return { error };
  }

  async function updateMemberProfile(fields) {
    // 更新姓名/電話/生日/地址這些一般資料，跟登入帳號(email/password)無關，
    // 直接寫入pos_members，不需要經過Supabase Auth。
    if (!member?.id) return { error: { message: "尚未登入或找不到會員資料" } };
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/pos_members?id=eq.${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: { message: data?.message || "更新失敗" } };
      }
      const updated = await res.json();
      if (Array.isArray(updated) && updated[0]) setMember(updated[0]);
      return { error: null };
    } catch (e) {
      return { error: { message: String(e) } };
    }
  }

  async function signInWithProvider(provider) {
    // provider: "facebook" | "google"
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user, member, loading, signUpWithEmail, signInWithEmail, signInWithProvider, signOut, resetPasswordForEmail, updatePassword, resendConfirmationEmail, updateEmail, updateMemberProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
