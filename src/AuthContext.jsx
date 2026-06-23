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
    const { data, error } = await supabase.auth.signUp({ email, password });
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
      value={{ user, member, loading, signUpWithEmail, signInWithEmail, signInWithProvider, signOut }}
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
