declare global {
  interface Window {
    Kakao: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (
          options:
            | {
                objectType: "text";
                text: string;
                link: { mobileWebUrl: string; webUrl: string };
              }
            | {
                objectType: "feed";
                content: {
                  title: string;
                  description: string;
                  imageUrl: string;
                  link: { mobileWebUrl: string; webUrl: string };
                };
                buttons?: { title: string; link: { mobileWebUrl: string; webUrl: string } }[];
              },
        ) => void;
      };
    };
  }
}

const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";

let loadPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 사용할 수 있습니다."));
  }
  if (window.Kakao?.isInitialized?.()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const initKakao = () => {
      try {
        const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
        if (!key) {
          reject(new Error("NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다."));
          return;
        }
        if (!window.Kakao.isInitialized()) {
          window.Kakao.init(key);
        }
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("카카오 SDK 초기화 실패"));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      if (window.Kakao) initKakao();
      else existing.addEventListener("load", initKakao);
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = initKakao;
    script.onerror = () => reject(new Error("카카오 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export async function shareRecommendationToKakao(params: {
  contactName: string;
  reason: string;
  expectedReply: string;
}) {
  await loadKakaoSdk();
  const url = window.location.origin;
  const body = `"${params.contactName}"에게 물어보세요!\n\n${params.reason}\n\n예상 답장: "${params.expectedReply}"\n\n나도 고민 테스터 AI 해보기 👇`;

  window.Kakao.Share.sendDefault({
    objectType: "text",
    text: truncate(body, 200),
    link: { mobileWebUrl: url, webUrl: url },
  });
}

export async function shareLinkToKakao(params: { text: string; url: string }) {
  await loadKakaoSdk();
  window.Kakao.Share.sendDefault({
    objectType: "text",
    text: truncate(params.text, 200),
    link: { mobileWebUrl: params.url, webUrl: params.url },
  });
}

// "text" 타입은 카카오톡에서 순수 텍스트 말풍선으로만 표시됨 — 제목/본문이 나뉜
// 카드 형태로 보내려면 "feed" 타입을 써야 함 (카카오 자체 카드 UI로 렌더링됨).
export function worryShareCardCopy() {
  return {
    title: "나 요즘 고민이 좀 있어서 그러는데,\n잠깐 얘기 들어줄 수 있어?",
    description: "회원가입 없이, 네 생각 한 줄만 남겨줘.",
    buttonTitle: "고민 답장 해주기",
  };
}

export async function shareCardToKakao(params: {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  buttonTitle?: string;
}) {
  await loadKakaoSdk();
  window.Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: params.title,
      description: truncate(params.description, 200),
      imageUrl: params.imageUrl,
      link: { mobileWebUrl: params.url, webUrl: params.url },
    },
    buttons: [
      {
        title: params.buttonTitle ?? "답장하기",
        link: { mobileWebUrl: params.url, webUrl: params.url },
      },
    ],
  });
}

export {};
