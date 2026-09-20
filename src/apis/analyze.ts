import type { ContactForApi, PastFeedback, AiRecommendation } from "@/services/recommend/type";

export interface ScreenshotResult {
  personality_tags: string[];
  summary: string;
}

export async function requestRecommendations(params: {
  concern: string;
  desiredResponseType: string;
  contacts: ContactForApi[];
  pastFeedback?: PastFeedback[];
}): Promise<AiRecommendation[]> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "분석 요청 실패");
  return json.recommendations;
}

export async function analyzeScreenshot(
  file: File,
  name: string,
  relationship: string,
): Promise<ScreenshotResult> {
  const form = new FormData();
  form.append("image", file);
  form.append("name", name);
  form.append("relationship", relationship);
  const res = await fetch("/api/analyze-screenshot", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "분석 요청 실패");
  return json;
}

export async function analyzePersonalityText(
  text: string,
  name: string,
  relationship: string,
): Promise<ScreenshotResult> {
  const res = await fetch("/api/analyze-personality-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, name, relationship }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "분석 요청 실패");
  return json;
}
