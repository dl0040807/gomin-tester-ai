import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — stays under typical serverless request-body limits

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const file = form.get("image");
  const name = (form.get("name") as string) || "";
  const relationship = (form.get("relationship") as string) || "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "PNG, JPEG, WEBP, GIF 이미지만 지원합니다." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "이미지 용량이 너무 큽니다 (4MB 이하로 올려주세요)." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const who = [name, relationship].filter(Boolean).join(" · ") || "이 지인";

  const prompt = `이 이미지는 메신저(카카오톡 등) 대화를 캡처한 스크린샷입니다.
화면에 있는 두 사람 중 사용자 본인이 아니라 "${who}"(상대방)의 말투와 반응 방식을 관찰해서 대화 성향을 분석해주세요.
(보통 오른쪽/초록색·노란색 말풍선이 '나'이고, 왼쪽/회색·흰색 말풍선이 상대방인 경우가 많습니다. 확실치 않으면 대화 맥락으로 판단하세요.)

이미지 안에 "고민 테스터 AI" 서비스가 보낸 링크 카드나 알림 문구가 섞여 있어도 그건 무시하고, 그 주변에 있는 실제 대화만 보고 판단하세요.
분석이 어려운 경우에도 "이건 알림이라 분석할 수 없다" 같은 설명은 하지 말고, personality_tags는 빈 배열로 두고 summary에 "대화 내용이 부족해요" 정도로 짧게만 적으세요.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      tools: [
        {
          name: "provide_analysis",
          description: "스크린샷에서 관찰한 상대방의 대화 성향을 반환합니다.",
          input_schema: {
            type: "object",
            properties: {
              personality_tags: {
                type: "array",
                items: { type: "string" },
                description: "상대방의 대화 성향을 나타내는 짧은 키워드 2~4개, 예: 공감형, 직설적, 유머형, 조언형",
              },
              summary: {
                type: "string",
                description:
                  "상대방의 대화 스타일에 대한 2~3문장 설명. 스크린샷 하나로 본 관찰이므로 단정적이지 않게, '~하는 경향이 보여요' 같은 톤으로 작성",
              },
            },
            required: ["personality_tags", "summary"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "provide_analysis" },
    });

    const toolUseBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || !("input" in toolUseBlock)) {
      return NextResponse.json(
        { error: "Claude 응답에서 분석 결과를 찾지 못했습니다." },
        { status: 502 },
      );
    }

    return NextResponse.json(toolUseBlock.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
