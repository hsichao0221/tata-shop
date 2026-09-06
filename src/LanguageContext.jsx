import { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext(null);

const STORAGE_KEY = "tata_lang";

export function LanguageProvider({ children }) {
  // 從localStorage讀取上次選擇的語言，沒有的話預設中文，確保客人下次來訪還記得他的選擇
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "zh";
    } catch {
      return "zh";
    }
  });

  function setLang(newLang) {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // localStorage不可用(例如無痕模式某些情況)時，狀態還是會在記憶體裡正確切換，
      // 只是重新整理頁面後不會記住，不影響當下的使用
    }
  }

  // 依語言切換<html lang="...">屬性，這對SEO跟螢幕閱讀器都有幫助
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// 依目前語言，從商品(或任何有XxxEn欄位的物件)取出對應語言的欄位值，
// 英文版沒填時自動退回顯示中文原文(不會空白)，這是根據使用者需求決定的行為。
export function useLocalizedField(obj, fieldName) {
  const { lang } = useLanguage();
  if (!obj) return "";
  if (lang === "en") {
    const enValue = obj[`${fieldName}En`];
    if (enValue && enValue.trim()) return enValue;
  }
  return obj[fieldName] || "";
}
