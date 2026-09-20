"use client";

import { useState } from "react";

type Step = "landing" | "answer" | "done";

export function ReplyForm({
  token,
  contactName,
  concern,
}: {
  token: string;
  contactName: string;
  concern: string;
}) {
  const [step, setStep] = useState<Step>("landing");
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!freeText.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/reply/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "제출에 실패했습니다.");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 py-10">
      <div className="w-full max-w-sm">
        {step === "landing" && (
          <div className="flex flex-col gap-6 rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-neutral-200">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-blue-600">고민 테스터 AI</span>
              <h1 className="text-xl font-bold leading-snug text-neutral-900">친구가 고민을 보냈어요</h1>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4 text-left text-sm leading-relaxed text-neutral-700 ring-1 ring-neutral-100">
              {concern}
            </div>
            <ul className="flex flex-col gap-1.5 text-left text-sm text-neutral-600">
              <li>· 1분이면 끝나요</li>
              <li>· 회원가입도, 앱 설치도 없어요</li>
              <li>· 답은 이 고민을 보낸 사람에게만 전달돼요</li>
            </ul>
            <button onClick={() => setStep("answer")} className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">
              답해주기
            </button>
          </div>
        )}

        {step === "answer" && (
          <div className="flex flex-col gap-6 rounded-2xl bg-white p-7 shadow-sm ring-1 ring-neutral-200">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-neutral-900">이 고민, 어떻게 생각해요?</h2>
              <p className="text-sm text-neutral-500">골라 답하지 않아도 돼요. 생각나는 대로 편하게 적어주세요.</p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4 text-left text-sm leading-relaxed text-neutral-700 ring-1 ring-neutral-100">
              {concern}
            </div>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="친구에게 해주고 싶은 말을 자유롭게 적어주세요"
              rows={5}
              autoFocus
              className="resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={submit}
              disabled={!freeText.trim() || submitting}
              className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting ? "보내는 중..." : "답변 보내기"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-neutral-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-600">
              ✓
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-bold text-neutral-900">답을 보냈어요. 고마워요</h1>
              <p className="text-sm leading-relaxed text-neutral-500">
                {contactName}님의 답은 친구에게 바로 전달됐어요.
              </p>
            </div>
            <ul className="flex flex-col gap-1 text-left text-xs text-neutral-400">
              <li>· 이 링크는 다시 사용할 수 없어요</li>
              <li>· 친구가 무슨 고민을 했는지는 다른 곳에 알려지지 않아요</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
