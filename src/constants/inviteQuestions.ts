export interface InviteQuestion {
  id: "q1" | "q2" | "q3";
  title: string;
  sub: string;
  options: string[];
  free?: string;
}

// 세 문항 모두 "어떤 고민을 아는지/피하고 싶은지"가 아니라 본인의 대화 성향만 묻는다.
export const INVITE_QUESTIONS: InviteQuestion[] = [
  {
    id: "q1",
    title: "누가 힘든 얘기를 하면, 보통 어떻게 해요?",
    sub: "가장 가까운 것 하나만 골라주세요.",
    options: ["해결책을 먼저 말한다", "일단 끝까지 듣는다", "같이 화를 낸다", "상황마다 다르다"],
  },
  {
    id: "q2",
    title: "대화할 때 나는 이런 편이에요",
    sub: "가장 가까운 것 하나만 골라주세요.",
    options: ["직설적으로 말한다", "돌려서 부드럽게 말한다", "차분히 듣기만 한다", "유머로 분위기를 풀어준다"],
  },
  {
    id: "q3",
    title: "고민 상담을 해줄 때 나는",
    sub: "가장 가까운 것 하나만 골라주세요.",
    options: ["바로 답을 준다", "같이 고민할 시간을 갖는다", "일단 공감부터 한다", "질문을 던져서 스스로 찾게 한다"],
    free: "나를 한마디로 표현한다면? (선택)",
  },
];

// 각 문항 답 → 지인 프로필에 붙는 성향 태그.
export const Q1_TAG_MAP: Record<string, string> = {
  "해결책을 먼저 말한다": "조언형",
  "일단 끝까지 듣는다": "경청형",
  "같이 화를 낸다": "공감형",
  "상황마다 다르다": "유연형",
};

export const Q2_TAG_MAP: Record<string, string> = {
  "직설적으로 말한다": "직설적",
  "돌려서 부드럽게 말한다": "부드러운 말투",
  "차분히 듣기만 한다": "차분함",
  "유머로 분위기를 풀어준다": "유머러스",
};

export const Q3_TAG_MAP: Record<string, string> = {
  "바로 답을 준다": "즉답형",
  "같이 고민할 시간을 갖는다": "동행형",
  "일단 공감부터 한다": "공감우선",
  "질문을 던져서 스스로 찾게 한다": "코칭형",
};
