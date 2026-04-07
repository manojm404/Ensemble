import { useState, useEffect } from "react";

export interface AIApp {
  id: string;
  name: string;
  url: string;
  logoUrl: string;
  isCustom?: boolean;
}

export const defaultAIApps: AIApp[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chat.openai.com", logoUrl: "https://www.google.com/s2/favicons?domain=chat.openai.com&sz=128" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com", logoUrl: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128" },
  { id: "claude", name: "Claude", url: "https://claude.ai", logoUrl: "https://www.google.com/s2/favicons?domain=claude.ai&sz=128" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com", logoUrl: "https://www.google.com/s2/favicons?domain=deepseek.com&sz=128" },
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai", logoUrl: "https://www.google.com/s2/favicons?domain=perplexity.ai&sz=128" },
  { id: "grok", name: "Grok", url: "https://grok.x.ai", logoUrl: "https://www.google.com/s2/favicons?domain=x.ai&sz=128" },
  { id: "copilot", name: "Copilot", url: "https://copilot.microsoft.com", logoUrl: "https://www.google.com/s2/favicons?domain=copilot.microsoft.com&sz=128" },
  { id: "mistral", name: "Mistral", url: "https://chat.mistral.ai", logoUrl: "https://www.google.com/s2/favicons?domain=mistral.ai&sz=128" },
  { id: "poe", name: "Poe", url: "https://poe.com", logoUrl: "https://www.google.com/s2/favicons?domain=poe.com&sz=128" },
  { id: "huggingchat", name: "HuggingChat", url: "https://huggingface.co/chat", logoUrl: "https://www.google.com/s2/favicons?domain=huggingface.co&sz=128" },
  { id: "you", name: "You.com", url: "https://you.com", logoUrl: "https://www.google.com/s2/favicons?domain=you.com&sz=128" },
  { id: "phind", name: "Phind", url: "https://www.phind.com", logoUrl: "https://www.google.com/s2/favicons?domain=phind.com&sz=128" },
];

const STORAGE_KEY = "ensemble-custom-ai-apps";

export function useAIApps() {
  const [customApps, setCustomApps] = useState<AIApp[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customApps));
  }, [customApps]);

  const addCustomApp = (app: Omit<AIApp, "isCustom">) => {
    setCustomApps((prev) => [...prev, { ...app, isCustom: true }]);
  };

  const removeCustomApp = (id: string) => {
    setCustomApps((prev) => prev.filter((a) => a.id !== id));
  };

  const allAIApps = [...defaultAIApps, ...customApps];

  return { allAIApps, customApps, addCustomApp, removeCustomApp };
}
