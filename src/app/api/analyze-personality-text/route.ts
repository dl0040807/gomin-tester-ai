import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const body = await request.json();
  const text = (body?.text as string) || "";
  const name = (body?.name as string) || "";
  const relationship = (body?.relationship as string) || "";

  if (!text.trim()) {
    return NextResponse.json({ error: "성향 설명이 필요합니다." }, { status: 400 });
  }

  const who = [name, relationship].filter(Boolean).join(" · ") || "이 지인";

  const prompt = `사용자가 "${who}"의 성향에 대해 자유롭게 적은 메모입니다. 이 내용을 읽고 성향을 요약해주세요.

[메모]
${text}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "provide_summary",
          description: "메모에서 정리한 성향 태그와 요약을 반환합니다.",
          input_schema: {
            type: "object",
            properties: {
              personality_tags: {
                type: "array",
                items: { type: "string" },
                description: "이 사람의 성향을 나타내는 짧은 키워드 2~4개, 예: 공감형, 직설적, 유머형, 조언형",
              },
              summary: { type: "string", description: "메모 내용을 1~2문장으로 정리한 요약" },
            },
            required: ["personality_tags", "summary"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "provide_summary" },
    });

    const toolUseBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || !("input" in toolUseBlock)) {
      return NextResponse.json(
        { error: "Claude 응답에서 요약 결과를 찾지 못했습니다." },
        { status: 502 },
      );
    }

    return NextResponse.json(toolUseBlock.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
