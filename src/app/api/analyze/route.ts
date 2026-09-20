import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  empathy: "공감 · 위로",
  objective_advice: "객관적 조언",
  fact_check: "팩트체크",
  action_plan: "행동 계획",
  just_listen: "그냥 들어주기",
};

interface ContactInput {
  id: string;
  name: string;
  relationship: string;
  occupation: string | null;
  mbti: string | null;
  // 클라이언트가 보내는 값 — 태그 없는 지인도 들어온다
  personality_tags?: string[] | null;
  // 지인이 초대 링크(성향 퀴즈)에 직접 답한 내용, 스크린샷 분석 요약 등이 쌓이는 자유 텍스트
  memo?: string | null;
}

interface PastFeedbackInput {
  concern: string;
  contactName: string;
  outcome: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  helpful: "도움이 됐어요",
  unclear: "애매했어요",
  regret: "괜히 말했어요",
};

interface AnalyzeRequestBody {
  concern: string;
  desiredResponseType: string;
  contacts: ContactInput[];
  pastFeedback?: PastFeedbackInput[];
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: AnalyzeRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }
  const { concern, desiredResponseType, contacts, pastFeedback } = body;

  if (!concern?.trim() || !contacts?.length) {
    return NextResponse.json(
      { error: "고민 내용과 지인 목록이 모두 필요합니다." },
      { status: 400 },
    );
  }

  const contactsText = contacts
    .map((c) => {
      const memoLine = c.memo?.trim() ? c.memo.trim().split("\n").join(" · ") : "없음";
      return `- id: ${c.id}, 이름: ${c.name}, 관계: ${c.relationship}, 직업: ${c.occupation ?? "미상"}, MBTI: ${c.mbti ?? "미상"}, 성향: ${c.personality_tags?.join(", ") || "미상"}, 메모(본인 응답·관찰 기록): ${memoLine}`;
    })
    .join("\n");

  // 사용자가 "그때 어땠어요?"에 남긴 과거 피드백 — 이번 추천에 학습 신호로 반영한다.
  const feedbackText = (pastFeedback ?? [])
    .slice(0, 20)
    .map((f) => `- "${f.concern}" → ${f.contactName} 추천 → 결과: ${OUTCOME_LABELS[f.outcome] ?? f.outcome}`)
    .join("\n");

  const prompt = `당신은 "고민 테스터 AI"의 추천 엔진입니다. 사용자의 고민, 원하는 반응 유형, 등록된 지인 목록을 보고 가장 적절한 지인을 최대 3명 추천하세요.

[고민]
${concern}

[원하는 반응 유형]
${RESPONSE_TYPE_LABELS[desiredResponseType] ?? desiredResponseType}

[등록된 지인 목록]
${contactsText}
${
  feedbackText
    ? `\n[과거 피드백 — 이 사용자가 실제로 겪은 결과, 비슷한 패턴이면 참고하세요]\n${feedbackText}\n`
    : ""
}
최대 3명을 추천하세요.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "provide_recommendations",
          description: "고민에 대해 추천할 지인 목록을 반환합니다.",
          input_schema: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    contact_id: { type: "string", description: "지인 목록의 id 값 그대로" },
                    score: { type: "integer", description: "매칭도, 0~100 사이 정수" },
                    reasons: {
                      type: "array",
                      items: { type: "string" },
                      description: "직업/MBTI/관계/성향/메모 조합에 근거한 문장 2~3개",
                    },
                    expected_reply: {
                      type: "string",
                      description:
                        "사용자가 이 고민을 이 지인에게 털어놓았을 때 그 지인이 실제로 보내올 것 같은 답장을 그 사람의 말투로 예상해서 작성 (사용자가 보낼 메시지가 아니라 지인의 답장, 2~3문장, 관계와 성향에 맞는 반말/존댓말)",
                    },
                  },
                  required: ["contact_id", "score", "reasons", "expected_reply"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "provide_recommendations" },
    });

    const toolUseBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || !("input" in toolUseBlock)) {
      return NextResponse.json(
        { error: "Claude 응답에서 추천 결과를 찾지 못했습니다." },
        { status: 502 },
      );
    }

    const { recommendations } = toolUseBlock.input as {
      recommendations: { contact_id?: string }[];
    };

    // Claude tool schema의 required는 강제가 아니라 힌트라 contact_id가 비거나
    // 엉뚱한 값으로 올 수 있다 — DB insert(FK not-null) 전에 여기서 걸러낸다.
    const validIds = new Set(contacts.map((c) => c.id));
    const valid = (recommendations ?? []).filter((r) => r.contact_id && validIds.has(r.contact_id));

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Claude가 유효한 지인 추천을 반환하지 않았습니다. 다시 시도해주세요." },
        { status: 502 },
      );
    }

    return NextResponse.json({ recommendations: valid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
