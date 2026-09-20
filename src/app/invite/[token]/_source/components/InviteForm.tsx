"use client";

import { useState } from "react";
import { INVITE_QUESTIONS } from "@/constants/inviteQuestions";

type Step = "landing" | "q1" | "q2" | "q3" | "done";

export function InviteForm({ token, contactName }: { token: string; contactName: string }) {
  const [step, setStep] = useState<Step>("landing");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [free, setFree] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const qIndex = step === "q1" ? 0 : step === "q2" ? 1 : step === "q3" ? 2 : -1;
  const question = qIndex >= 0 ? INVITE_QUESTIONS[qIndex] : null;

  const pick = (label: string) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: label }));
  };

  const goNext = async () => {
    if (step === "landing") {
      setStep("q1");
      return;
    }
    if (step === "q1") {
      setStep("q2");
      return;
    }
    if (step === "q2") {
      setStep("q3");
      return;
    }
    if (step === "q3") {
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch(`/api/invite/${token}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...answers, free }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "제출에 실패했습니다.");
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 py-10">
      <div className="w-full max-w-sm">
        {step === "landing" && (
          <div className="flex flex-col gap-6 rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-neutral-200">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-blue-600">고민 테스터 AI</span>
              <h1 className="text-xl font-bold leading-snug text-neutral-900">
                친구가 &quot;{contactName}&quot;님에게 물어봤어요
              </h1>
              <p className="text-sm leading-relaxed text-neutral-500">
                네가 어떤 얘기를 편하게 들어주는 사람인지 알고 싶어서요.
              </p>
            </div>
            <ul className="flex flex-col gap-1.5 text-left text-sm text-neutral-600">
              <li>· 3문항 · 20초면 끝나요</li>
              <li>· 회원가입도, 앱 설치도 없어요</li>
              <li>· 친구의 고민 내용은 이 링크에 들어있지 않아요</li>
            </ul>
            <button
              onClick={goNext}
              className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white"
            >
              3문항 답해주기
            </button>
          </div>
        )}

        {question && (
          <div className="flex flex-col gap-6 rounded-2xl bg-white p-7 shadow-sm ring-1 ring-neutral-200">
            <div className="flex items-center gap-2">
              {INVITE_QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= qIndex ? "bg-blue-600" : "bg-neutral-200"}`}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-neutral-900">{question.title}</h2>
              <p className="text-sm text-neutral-500">{question.sub}</p>
            </div>
            <div className="flex flex-col gap-2">
              {question.options.map((opt) => {
                const selected = answers[question.id] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => pick(opt)}
                    className={`rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      selected
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {question.free && (
              <textarea
                value={free}
                onChange={(e) => setFree(e.target.value)}
                placeholder={question.free}
                rows={2}
                className="resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-blue-500"
              />
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={goNext}
              disabled={!answers[question.id] || submitting}
              className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting ? "보내는 중..." : step === "q3" ? "답변 보내기" : "다음"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-neutral-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-600">
              ✓
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-bold text-neutral-900">보냈어요. 고마워요</h1>
              <p className="text-sm leading-relaxed text-neutral-500">
                이 답은 링크를 보낸 사람의 지인 프로필로만 저장돼요.
              </p>
            </div>
            <ul className="flex flex-col gap-1 text-left text-xs text-neutral-400">
              <li>· 답변 수정은 이 링크에서 다시 할 수 없어요</li>
              <li>· 상대방이 무슨 고민을 했는지는 여기서 알 수 없어요</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
