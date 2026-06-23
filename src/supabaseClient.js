import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

// 這裡用官方 SDK 建立一個 client 實例，專門給 Auth（會員註冊/登入）功能使用。
// 現有 supabase.js 是用直接 fetch 呼叫 REST API 的方式讀寫商品/訂單資料，
// 但 Auth 涉及 session 管理、token 自動更新這些較複雜的機制，
// 用官方 SDK 處理更可靠，兩者各自獨立運作，不會互相干擾。
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
