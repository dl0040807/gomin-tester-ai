"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { shareCardToKakao, shareLinkToKakao, worryShareCardCopy } from "@/utils/kakao";
import { analyzePersonalityText, analyzeScreenshot, requestRecommendations } from "@/apis/analyze";
import { mergeTags, timeAgo } from "@/utils/format";
import { OUTCOME_OPTIONS, recordOutcome, saveRecommendations } from "@/services/recommend/recommendService";
import type { PastFeedback } from "@/services/recommend/type";
import "@/styles/wds/index.css";
import type { Contact, ResponseType, Worry } from "@/lib/supabase/types";

const ring1 = "inset 0 0 0 1px var(--line-normal-normal)";
const ringP = "inset 0 0 0 2px var(--primary-normal)";
const heroBg =
  "radial-gradient(58% 52% at 50% 48%, color-mix(in srgb, var(--primary-normal) 13%, transparent) 0%, color-mix(in srgb, var(--primary-normal) 4%, transparent) 55%, transparent 78%)";

const RESPONSE_TYPES: { value: ResponseType; label: string }[] = [
  { value: "empathy", label: "공감 · 위로" },
  { value: "objective_advice", label: "객관적 조언" },
  { value: "fact_check", label: "팩트체크" },
  { value: "action_plan", label: "행동 계획" },
  { value: "just_listen", label: "그냥 들어주기" },
];

interface RecommendationRow {
  id: string;
  worry_id: string;
  contact_id: string;
  rank: number;
  reason: string;
  script: string;
  score: number | null;
  contacts: { name: string; relationship: string; occupation: string | null; mbti: string | null } | null;
}

// F3-5 답변 링크(worry_invites)에 실제 지인이 남긴 답변 — used_at이 찍힌 것만 "답변 온 대화"다.
interface RepliedInviteRow {
  id: string;
  worry_id: string;
  answer_1: string | null;
  answer_2: string | null;
  free_text: string | null;
  used_at: string;
  contacts: { name: string } | null;
  worries: { content: string; desired_response_type: string } | null;
}

type Step =
  | "home"
  | "manage"
  | "repliedList"
  | "historyList"
  | "detail"
  | "input"
  | "contacts"
  | "result"
  | "message"
  | "share"
  | "sent";

function pillButton(active: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "var(--primary-normal)" : "var(--fill-normal)",
    color: active ? "rgb(255,255,255)" : "var(--label-neutral)",
  };
}

// NavBar 컴포넌트와 같은 톤의 상단 pill 스타일 — 여기선 라우팅이 아니라 step 전환이라 자체 헤더로 둔다.
function navPill(active: boolean): React.CSSProperties {
  return {
    whiteSpace: "nowrap",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    background: active ? "var(--primary-normal)" : "transparent",
    color: active ? "rgb(255,255,255)" : "var(--label-alternative)",
  };
}

const CONTENT_MAX_WIDTH: React.CSSProperties = { width: "100%", maxWidth: 640, margin: "0 auto" };

// 한글 이름 마지막 글자의 받침 유무를 판단한다 (한글이 아니면 null).
function hasBatchim(name: string): boolean | null {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28 !== 0;
}

// 받침 있으면 "아", 없으면 "야" (호격 조사).
function withVocative(name: string): string {
  const batchim = hasBatchim(name);
  return `${name}${batchim === false ? "야" : "아"}`;
}

// 받침 있으면 "이가", 없으면 "가" (주격 조사).
function withSubjectParticle(name: string): string {
  const batchim = hasBatchim(name);
  return `${name}${batchim === false ? "가" : "이가"}`;
}

function inputStyle(): React.CSSProperties {
  return {
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "var(--label-normal)",
    background: "var(--background-normal-normal)",
    boxShadow: "inset 0 0 0 1px var(--line-normal-normal)",
    border: "none",
    outline: "none",
  };
}

export default function HomeContainer() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  const [step, setStep] = useState<Step>("input");
  const [initialized, setInitialized] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [askSelectedIds, setAskSelectedIds] = useState<Set<string>>(new Set());

  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRelationship, setNewRelationship] = useState("");
  const [newOccupation, setNewOccupation] = useState("");
  const [newMbti, setNewMbti] = useState("");
  const [newTagsInput, setNewTagsInput] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [addContactStatus, setAddContactStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addContactError, setAddContactError] = useState("");
  const [newTagAnalyzing, setNewTagAnalyzing] = useState(false);
  const [newTagError, setNewTagError] = useState("");
  const [newScanning, setNewScanning] = useState(false);
  const [newScanError, setNewScanError] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // 지인 관리 화면 — 기존 지인 스크린샷 보강, 성향 퀴즈 초대 링크 생성/공유.
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<Record<string, string>>({});
  const enrichInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [creatingInviteId, setCreatingInviteId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<Record<string, string>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 지인 정보 수정
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editOccupation, setEditOccupation] = useState("");
  const [editMbti, setEditMbti] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editStatus, setEditStatus] = useState<"idle" | "saving" | "error">("idle");
  const [editError, setEditError] = useState("");

  const [concern, setConcern] = useState("");
  const [responseType, setResponseType] = useState<ResponseType>("empathy");
  const [customMode, setCustomMode] = useState(false);
  const [customResponseText, setCustomResponseText] = useState("");
  const [worryCustomResponse, setWorryCustomResponse] = useState<string | null>(null);
  const [worry, setWorry] = useState<Worry | null>(null);
  const [worryStatus, setWorryStatus] = useState<"idle" | "saving" | "error">("idle");
  const [worryError, setWorryError] = useState("");

  const [worries, setWorries] = useState<Worry[]>([]);
  const [recommendationsByWorry, setRecommendationsByWorry] = useState<Record<string, RecommendationRow[]>>({});
  const [repliedInvites, setRepliedInvites] = useState<RepliedInviteRow[]>([]);
  const [feedbackOpenId, setFeedbackOpenId] = useState<string | null>(null);
  const [viewingWorryId, setViewingWorryId] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);

  const [rejecting, setRejecting] = useState(false);
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [refineType, setRefineType] = useState<ResponseType>("empathy");
  const [refineCustomMode, setRefineCustomMode] = useState(false);
  const [refineCustomText, setRefineCustomText] = useState("");

  const [draft, setDraft] = useState<string | null>(null);
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);
  // 클립보드 쓰기가 막혀도(권한 거부 등) 사용자가 화면에 갇히지 않도록 흐름은 계속 진행하고, 안내 문구만 바꾼다.
  const [copyFailed, setCopyFailed] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  // 추천 3명 중 실제로 메시지를 보낼 사람 — 기본은 매칭도 1위지만 사용자가 바꿀 수 있다.
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthError("Vercel 환경 변수에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 넣고 다시 배포해야 해요.");
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setAuthError("로그인 서버에 연결하지 못했어요. 잠시 후 새로고침해 주세요.");
      }
    }, 12000);

    (async () => {
      const { data } = await supabase.auth.getSession();
      let uid = data.session?.user?.id ?? null;
      if (!uid) {
        const { data: signInData, error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!cancelled) setAuthError(error.message);
          return;
        }
        uid = signInData.user?.id ?? null;
      }
      if (!cancelled && uid) {
        window.clearTimeout(timeout);
        setUserId(uid);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  const loadContacts = async (uid: string) => {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .returns<Contact[]>();
    if (!error && data) setContacts(data);
  };

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContacts(userId);
  }, [userId]);

  const loadRecommendationsFor = async (worryId: string) => {
    const { data, error } = await supabase
      .from("recommendations")
      .select("id, worry_id, contact_id, rank, reason, script, score, contacts(name, relationship, occupation, mbti)")
      .eq("worry_id", worryId)
      .order("rank", { ascending: true })
      .returns<RecommendationRow[]>();
    if (!error && data) setRecommendationsByWorry((prev) => ({ ...prev, [worryId]: data }));
    return data ?? [];
  };

  const refreshWorries = async (uid: string) => {
    const { data, error } = await supabase
      .from("worries")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .returns<Worry[]>();
    if (!error && data) {
      setWorries(data);
      data.forEach((w) => loadRecommendationsFor(w.id));
    }
    return data ?? [];
  };

  // 실제 지인이 답장을 보낸 것(used_at 존재)만 "답변 온 대화"로 친다 — AI 추천이 나온 것만으로는 부족하다.
  const refreshRepliedInvites = async (uid: string) => {
    const { data, error } = await supabase
      .from("worry_invites")
      .select("id, worry_id, answer_1, answer_2, free_text, used_at, contacts(name), worries(content, desired_response_type)")
      .eq("user_id", uid)
      .not("used_at", "is", null)
      .order("used_at", { ascending: false })
      .returns<RepliedInviteRow[]>();
    if (!error && data) setRepliedInvites(data);
  };

  // 재방문(고민 기록이 있음) → F2-1 홈, 첫 방문 → F1-1 입력
  useEffect(() => {
    if (!userId || initialized) return;
    (async () => {
      const data = await refreshWorries(userId);
      void refreshRepliedInvites(userId);
      setStep(data.length > 0 ? "home" : "input");
      setInitialized(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, initialized]);

  // 답장이 오면 새로고침 없이 바로 반영 — worry_invites가 실시간 publication에 등록돼 있어야 한다
  // (supabase/migrations/0006_worry_invites_realtime.sql).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`worry_invites_${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "worry_invites", filter: `user_id=eq.${userId}` },
        (payload) => {
          if ((payload.new as { used_at?: string | null } | null)?.used_at) void refreshRepliedInvites(userId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // 지인이 초대 링크(성향 퀴즈)에 직접 답하면 서버가 contacts를 바로 업데이트한다 —
  // 이미 열려있는 지인 관리 화면도 새로고침 없이 그 답을 반영하도록 구독한다
  // (supabase/migrations/0007_contacts_realtime.sql).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`contacts_${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter: `user_id=eq.${userId}` },
        () => void loadContacts(userId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const pendingWorries = worries.filter((w) => !w.outcome && (recommendationsByWorry[w.id]?.length ?? 0) > 0);
  const historyWorries = worries.filter((w) => !!w.outcome);

  // 실제 지인이 답장을 보낸(used_at 존재) 대화만 묶는다 — worry 하나에 여러 명이 답할 수도 있다.
  const repliedByWorry = repliedInvites.reduce<Record<string, RepliedInviteRow[]>>((acc, inv) => {
    (acc[inv.worry_id] ??= []).push(inv);
    return acc;
  }, {});
  // repliedInvites가 이미 최신 답변 순(used_at desc)이라 첫 등장 순서 그대로 최근 대화 순이 된다.
  const repliedWorryIds = [...new Set(repliedInvites.map((inv) => inv.worry_id))];

  const viewingReplies = viewingWorryId ? repliedByWorry[viewingWorryId] ?? [] : [];
  const viewingWorryContent =
    viewingReplies[0]?.worries?.content ?? worries.find((w) => w.id === viewingWorryId)?.content ?? "";
  const viewingWorry = viewingWorryId ? worries.find((w) => w.id === viewingWorryId) ?? null : null;

  const openWorryDetail = (worryId: string) => {
    setViewingWorryId(worryId);
    setStep("detail");
  };

  const openRepliedList = () => {
    if (userId) void refreshRepliedInvites(userId);
    setStep("repliedList");
  };

  const openManage = () => {
    if (userId) void loadContacts(userId);
    setStep("manage");
  };

  const homeStats: { k: string; v: string; onClick?: () => void }[] = [
    { k: "쓴 고민", v: String(worries.length), onClick: () => setStep("historyList") },
    { k: "등록된 지인", v: String(contacts.length), onClick: openManage },
    { k: "답변 온 대화", v: String(repliedWorryIds.length), onClick: openRepliedList },
  ];

  const screenKey =
    step === "contacts" && analyzing
      ? "loading"
      : step === "sent" || (step === "message" && copied)
        ? "notice"
        : step;
  // askSelectedIds(Set)는 선택한 순서를 그대로 보존한다 — 등록 순서(contacts 배열)가 아니라 이 순서로 표시
  const askNames = [...askSelectedIds]
    .map((id) => contacts.find((c) => c.id === id)?.name)
    .filter((name): name is string => !!name)
    .join(", ");

  const topRec = recommendations[0] ?? null;
  const topName = topRec?.contacts?.name ?? "";
  // 실제로 메시지를 보낼 대상 — 사용자가 카드를 눌러 바꾸지 않으면 매칭도 1위 그대로.
  const selectedRec = recommendations.find((r) => r.contact_id === selectedContactId) ?? topRec;
  const selectedName = selectedRec?.contacts?.name ?? "";
  const kakaoCard = worryShareCardCopy();

  const resultTitle = topName ? `매칭도가 가장 높은 ${topName}님을 추천해요` : "추천을 준비하고 있어요";

  const defaultDraft = useMemo(() => {
    if (!selectedRec || !worry) return "";
    const name = selectedRec.contacts?.name ?? "이 지인";
    const shortConcern = worry.content.length > 40 ? worry.content.slice(0, 40) + "…" : worry.content;
    return `${withVocative(name)}, 잠깐 얘기할 수 있어? ${shortConcern} 네 생각이 궁금해서 물어봐.`;
  }, [selectedRec, worry]);

  // F3-5: 이 고민 + 이 지인 전용 답변 링크를 한 번만 만들고 재사용한다.
  const ensureInviteUrl = async (): Promise<string | null> => {
    if (inviteUrl) return inviteUrl;
    if (!userId || !worry || !selectedRec) return null;
    setInviteCreating(true);
    try {
      const { data, error } = await supabase
        .from("worry_invites")
        .insert({ user_id: userId, worry_id: worry.id, contact_id: selectedRec.contact_id })
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      const url = `${window.location.origin}/reply/${data.token}`;
      setInviteUrl(url);
      return url;
    } catch {
      return null;
    } finally {
      setInviteCreating(false);
    }
  };

  const toggleAskSelected = (contactId: string) => {
    setAskSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const handleAddContact = async () => {
    if (!userId || !newName.trim() || !newRelationship.trim()) return;
    setAddContactStatus("saving");
    setAddContactError("");
    const rawTags = newTagsInput.trim();
    const looksLikeSentence = rawTags.length > 12 && !rawTags.includes(",");
    const tags = looksLikeSentence ? [] : rawTags.split(",").map((t) => t.trim()).filter(Boolean);
    const memo = newMemo.trim() || (looksLikeSentence ? rawTags : "") || null;
    const { error } = await supabase.from("contacts").insert({
      user_id: userId,
      name: newName.trim(),
      relationship: newRelationship.trim(),
      occupation: newOccupation.trim() || null,
      mbti: newMbti.trim() || null,
      personality_tags: tags,
      memo,
    });
    if (error) {
      setAddContactStatus("error");
      setAddContactError(error.message);
      return;
    }
    setNewName("");
    setNewRelationship("");
    setNewOccupation("");
    setNewMbti("");
    setNewTagsInput("");
    setNewMemo("");
    setAddContactStatus("idle");
    setShowAddContact(false);
    await loadContacts(userId);
  };

  const handleSummarizeTags = async () => {
    if (!newTagsInput.trim()) return;
    setNewTagAnalyzing(true);
    setNewTagError("");
    try {
      const result = await analyzePersonalityText(newTagsInput, newName, newRelationship);
      if (result.personality_tags.length > 0) {
        setNewTagsInput(result.personality_tags.join(", "));
      }
      if (result.summary) {
        setNewMemo((prev) => (prev ? prev + "\n" + result.summary : result.summary));
      }
    } catch (err) {
      setNewTagError(err instanceof Error ? err.message : "요약 실패");
    } finally {
      setNewTagAnalyzing(false);
    }
  };

  const handleNewContactScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewScanning(true);
    setNewScanError("");
    try {
      const result = await analyzeScreenshot(file, newName, newRelationship);
      if (result.personality_tags.length > 0) {
        const existing = newTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
        setNewTagsInput(mergeTags(existing, result.personality_tags).join(", "));
      }
      if (result.summary) setNewMemo((prev) => (prev ? prev + "\n" + result.summary : result.summary));
    } catch (err) {
      setNewScanError(err instanceof Error ? err.message : "분석 실패");
    } finally {
      setNewScanning(false);
      if (newFileInputRef.current) newFileInputRef.current.value = "";
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!userId) return;
    // 지인을 지우면 그 사람 앞으로 보낸 초대 링크·답변(성향 퀴즈, 특정 고민 답장)도 DB에서 함께 삭제된다(on delete cascade).
    // 조용히 깨지면 헷갈리니 미리 알린다.
    const ok = window.confirm(
      `${contact.name}님을 삭제하면 이 지인에게 보낸 초대 링크와 그동안 온 답변도 모두 함께 삭제돼요. 계속할까요?`,
    );
    if (!ok) return;
    await supabase.from("contacts").delete().eq("id", contact.id);
    await loadContacts(userId);
  };

  const handleStartEdit = (c: Contact) => {
    setEditingContactId(c.id);
    setEditName(c.name);
    setEditRelationship(c.relationship);
    setEditOccupation(c.occupation ?? "");
    setEditMbti(c.mbti ?? "");
    setEditTagsInput(c.personality_tags.join(", "));
    setEditMemo(c.memo ?? "");
    setEditStatus("idle");
    setEditError("");
  };

  const handleCancelEdit = () => {
    setEditingContactId(null);
  };

  const handleSaveEdit = async (contact: Contact) => {
    if (!editName.trim() || !editRelationship.trim()) return;
    setEditStatus("saving");
    setEditError("");
    const tags = editTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const nextMemo = editMemo.trim() || null;
    const { error } = await supabase
      .from("contacts")
      .update({
        name: editName.trim(),
        relationship: editRelationship.trim(),
        occupation: editOccupation.trim() || null,
        mbti: editMbti.trim() || null,
        personality_tags: tags,
        memo: nextMemo,
      })
      .eq("id", contact.id);
    if (error) {
      setEditStatus("error");
      setEditError(error.message);
      return;
    }
    setEditingContactId(null);
    if (userId) await loadContacts(userId);
  };

  const handleEnrichScreenshot = async (contact: Contact, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setEnrichingId(contact.id);
    setEnrichError((prev) => ({ ...prev, [contact.id]: "" }));
    try {
      const result = await analyzeScreenshot(file, contact.name, contact.relationship);
      const nextTags = mergeTags(contact.personality_tags, result.personality_tags);
      const nextMemo = result.summary
        ? contact.memo
          ? contact.memo + "\n" + result.summary
          : result.summary
        : contact.memo;
      const { error } = await supabase
        .from("contacts")
        .update({ personality_tags: nextTags, memo: nextMemo })
        .eq("id", contact.id);
      if (error) throw new Error(error.message);
      await loadContacts(userId);
    } catch (err) {
      setEnrichError((prev) => ({ ...prev, [contact.id]: err instanceof Error ? err.message : "분석 실패" }));
    } finally {
      setEnrichingId(null);
      const ref = enrichInputRefs.current[contact.id];
      if (ref) ref.value = "";
    }
  };

  // F3-2: 지인의 성향을 묻는 퀴즈 초대 링크 — 특정 고민과 무관하게 지인 정보 자체를 채운다.
  const handleCreateInvite = async (contact: Contact) => {
    if (!userId) return;
    setCreatingInviteId(contact.id);
    setInviteError((prev) => ({ ...prev, [contact.id]: "" }));
    try {
      const { data, error } = await supabase
        .from("contact_invites")
        .insert({ user_id: userId, contact_id: contact.id })
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      const url = `${window.location.origin}/invite/${data.token}`;
      setInviteLinks((prev) => ({ ...prev, [contact.id]: url }));
    } catch (err) {
      setInviteError((prev) => ({ ...prev, [contact.id]: err instanceof Error ? err.message : "링크 생성 실패" }));
    } finally {
      setCreatingInviteId(null);
    }
  };

  const handleCopyInvite = async (contactId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(contactId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard permission denied — the link is still visible to copy manually
    }
  };

  const handleShareInvite = async (contact: Contact, url: string) => {
    setInviteError((prev) => ({ ...prev, [contact.id]: "" }));
    try {
      await shareLinkToKakao({
        text: `나한테 고민 얘기해도 될까? 네가 어떤 얘기를 편하게 들어주는 사람인지 알고 싶어서. 3문항, 20초면 끝나 🙂`,
        url,
      });
    } catch (err) {
      setInviteError((prev) => ({ ...prev, [contact.id]: err instanceof Error ? err.message : "공유 실패" }));
    }
  };

  // F1-1/contacts(누구한테 물어볼지 고르는 화면)와 지인 관리 화면이 같은 지인 추가 폼을 쓴다 —
  // 한쪽은 항상 마운트돼 있지 않으므로(step이 배타적) 같은 JSX를 두 곳에 꽂아도 문제없다.
  const addContactFormBody = (
    <div className="flex flex-col gap-2" style={{ borderRadius: 14, background: "var(--fill-normal)", padding: 16 }}>
      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" style={{ ...inputStyle(), width: "50%" }} />
        <input
          value={newRelationship}
          onChange={(e) => setNewRelationship(e.target.value)}
          placeholder="관계 (예: 대학 친구)"
          style={{ ...inputStyle(), width: "50%" }}
        />
      </div>
      <div className="flex gap-2">
        <input
          value={newOccupation}
          onChange={(e) => setNewOccupation(e.target.value)}
          placeholder="직업 (선택)"
          style={{ ...inputStyle(), width: "50%" }}
        />
        <input
          value={newMbti}
          onChange={(e) => setNewMbti(e.target.value.toUpperCase())}
          placeholder="MBTI (선택)"
          maxLength={4}
          style={{ ...inputStyle(), width: "50%" }}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newTagsInput}
          onChange={(e) => setNewTagsInput(e.target.value)}
          placeholder="성향을 자유롭게 적어보세요 (예: 늘 먼저 들어주고 위로해줌)"
          style={{ ...inputStyle(), flex: 1 }}
        />
        <button
          type="button"
          onClick={handleSummarizeTags}
          disabled={!newTagsInput.trim() || newTagAnalyzing}
          style={{
            flexShrink: 0,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 700,
            background: "var(--label-normal)",
            color: "var(--background-normal-normal)",
            opacity: !newTagsInput.trim() || newTagAnalyzing ? 0.4 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {newTagAnalyzing ? "요약 중..." : "AI로 요약"}
        </button>
      </div>
      {newTagError && <div style={{ fontSize: 11, color: "var(--status-negative)" }}>{newTagError}</div>}
      <textarea
        value={newMemo}
        onChange={(e) => setNewMemo(e.target.value)}
        placeholder="메모 (선택)"
        rows={2}
        style={{ ...inputStyle(), resize: "none" }}
      />
      <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--label-assistive)" }}>이 메모는 AI가 추천할 때 참고해요.</p>

      <div className="flex items-center gap-2">
        <input
          ref={newFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleNewContactScreenshot}
          disabled={newScanning}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => newFileInputRef.current?.click()}
          disabled={newScanning}
          style={{
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 700,
            background: "var(--fill-normal)",
            color: "var(--label-neutral)",
            opacity: newScanning ? 0.5 : 1,
          }}
        >
          {newScanning ? "분석 중..." : "대화 캡처 올리기"}
        </button>
      </div>
      {newScanError && <div style={{ fontSize: 11, color: "var(--status-negative)" }}>{newScanError}</div>}
      <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--label-assistive)" }}>
        대화 스크린샷을 올리면 AI가 상대방의 대화 성향을 분석해서 성향·메모에 자동으로 채워줍니다.
      </p>

      {addContactStatus === "error" && (
        <div style={{ fontSize: 12, color: "var(--status-negative)" }}>저장 실패: {addContactError}</div>
      )}
      <button
        type="button"
        onClick={handleAddContact}
        disabled={!userId || !newName.trim() || !newRelationship.trim() || addContactStatus === "saving"}
        style={{
          borderRadius: 10,
          padding: "10px 0",
          fontSize: 13,
          fontWeight: 700,
          background: "var(--primary-normal)",
          color: "rgb(255,255,255)",
          opacity: !userId || !newName.trim() || !newRelationship.trim() || addContactStatus === "saving" ? 0.4 : 1,
        }}
      >
        {addContactStatus === "saving" ? "저장 중..." : "지인 추가"}
      </button>
    </div>
  );

  const handleSubmitConcern = async () => {
    if (!userId || !concern.trim()) return;
    setWorryStatus("saving");
    setWorryError("");
    const { data, error } = await supabase
      .from("worries")
      .insert({ user_id: userId, content: concern.trim(), desired_response_type: responseType })
      .select()
      .single<Worry>();
    if (error || !data) {
      setWorryStatus("error");
      setWorryError(error?.message ?? "저장 실패");
      return;
    }
    setWorry(data);
    setWorries((prev) => [data, ...prev]);
    setWorryCustomResponse(customMode ? customResponseText.trim() || null : null);
    setConcern("");
    // 다음에 /input으로 돌아왔을 때 "직접 입력" 텍스트가 이전 고민 내용으로 남아있지 않도록 비운다.
    setCustomMode(false);
    setCustomResponseText("");
    setWorryStatus("idle");
    setAskSelectedIds(new Set());
    setInviteUrl(null);
    if (contacts.length === 0) setShowAddContact(true);
    setStep("contacts");
  };

  const runAnalysis = async (
    targetWorry: Worry,
    includeIds: Set<string>,
    respType: ResponseType,
    apiLabelOverride?: string,
  ): Promise<boolean> => {
    if (!userId) return false;
    const usable = contacts.filter((c) => includeIds.has(c.id));
    if (usable.length === 0) {
      setAnalyzeError("적어도 한 명은 남겨주세요.");
      return false;
    }
    setAnalyzing(true);
    setAnalyzeError("");
    setAskSelectedIds(includeIds);
    try {
      if (respType !== targetWorry.desired_response_type) {
        await supabase.from("worries").update({ desired_response_type: respType }).eq("id", targetWorry.id);
        setWorry((prev) => (prev && prev.id === targetWorry.id ? { ...prev, desired_response_type: respType } : prev));
        setWorries((prev) => prev.map((w) => (w.id === targetWorry.id ? { ...w, desired_response_type: respType } : w)));
      }
      // "그때 어땠어요?"에서 기록된 과거 결과를 다음 추천의 학습 신호로 넘긴다.
      const pastFeedback: PastFeedback[] = worries
        .filter((w) => w.outcome)
        .map((w) => {
          const topName = recommendationsByWorry[w.id]?.[0]?.contacts?.name;
          return topName ? { concern: w.content, contactName: topName, outcome: w.outcome! } : null;
        })
        .filter((f): f is PastFeedback => f !== null);

      const results = await requestRecommendations({
        concern: targetWorry.content,
        desiredResponseType: apiLabelOverride ?? respType,
        contacts: usable.map((c) => ({
          id: c.id,
          name: c.name,
          relationship: c.relationship,
          occupation: c.occupation,
          mbti: c.mbti,
          personality_tags: c.personality_tags,
          memo: c.memo,
        })),
        pastFeedback,
      });
      await saveRecommendations(targetWorry.id, userId, results);
      const data = await loadRecommendationsFor(targetWorry.id);
      setRecommendations(data);
      setSelectedContactId(data[0]?.contact_id ?? null);
      setDraft(null);
      setInviteUrl(null);
      setRejecting(false);
      setStep("result");
      return true;
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "알 수 없는 오류");
      return false;
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmContacts = () => {
    if (!worry || askSelectedIds.size === 0) return;
    runAnalysis(worry, askSelectedIds, worry.desired_response_type, worryCustomResponse ?? undefined);
  };

  const handleReanalyze = () => {
    if (!worry) return;
    runAnalysis(worry, askSelectedIds, worry.desired_response_type, worryCustomResponse ?? undefined);
  };

  const openRejectPanel = () => {
    setRejecting(true);
    setExcludeIds(new Set());
    if (worryCustomResponse) {
      setRefineCustomMode(true);
      setRefineCustomText(worryCustomResponse);
    } else {
      setRefineCustomMode(false);
      setRefineType(worry?.desired_response_type ?? "empathy");
    }
  };

  const toggleExclude = (contactId: string) => {
    setExcludeIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const handleRefine = () => {
    if (!worry) return;
    const nextIds = new Set([...askSelectedIds].filter((id) => !excludeIds.has(id)));
    const override = refineCustomMode ? refineCustomText.trim() || undefined : undefined;
    setWorryCustomResponse(override ?? null);
    runAnalysis(worry, nextIds, refineType, override);
  };

  const handleRecordOutcome = async (w: Worry, outcome: (typeof OUTCOME_OPTIONS)[number]["value"]) => {
    try {
      await recordOutcome(w.id, outcome);
      setWorries((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, outcome, outcome_recorded_at: new Date().toISOString() } : x)),
      );
      setFeedbackOpenId(null);
    } catch {
      // 기록 실패는 조용히 무시 — 배너는 다음 방문 때 다시 뜬다
    }
  };

  const handleDeleteWorry = async (worryId: string): Promise<boolean> => {
    if (!userId) return false;
    const ok = window.confirm("이 고민을 삭제할까요? 여기 달린 추천·답변 기록도 함께 삭제돼요.");
    if (!ok) return false;
    await supabase.from("worries").delete().eq("id", worryId);
    await refreshWorries(userId);
    void refreshRepliedInvites(userId);
    return true;
  };

  const handleCopyMessage = async () => {
    const url = await ensureInviteUrl();
    const text = draft ?? defaultDraft;
    try {
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      setCopyFailed(false);
    } catch {
      // 클립보드 권한이 없어도(카카오톡 인앱 브라우저 등) 다음 화면에서 직접 복사할 수 있게
      // 흐름은 그대로 진행한다 — 여기서 멈추면 하단 네비게이션이 없어서 나갈 방법이 없다.
      setCopyFailed(true);
    }
    setCopied(true);
  };

  const handleSendCard = async () => {
    setShareError("");
    try {
      const origin = window.location.origin;
      const url = (await ensureInviteUrl()) ?? origin;
      await shareCardToKakao({
        title: kakaoCard.title,
        description: kakaoCard.description,
        url,
        imageUrl: `${origin}/favicon.ico`,
        buttonTitle: kakaoCard.buttonTitle,
      });
      setStep("sent");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "공유에 실패했습니다.");
    }
  };

  const handleFinishSent = async () => {
    if (userId) {
      await refreshWorries(userId);
      void refreshRepliedInvites(userId);
    }
    setWorry(null);
    setStep("home");
  };

  const startNewConcern = () => {
    setWorry(null);
    setConcern("");
    setRecommendations([]);
    setSelectedContactId(null);
    setDraft(null);
    setInviteUrl(null);
    setAnalyzeError("");
    setRejecting(false);
    setExcludeIds(new Set());
    setCopied(false);
    setCopyFailed(false);
    setShareError("");
    setAskSelectedIds(new Set());
    setWorryStatus("idle");
    setWorryError("");
    setStep("input");
  };

  const goToMessage = () => {
    setCopied(false);
    setCopyFailed(false);
    setStep("message");
    void ensureInviteUrl();
  };

  // 재방문 여부(F2-1 vs F1-1)를 확인하기 전까지는 아무 화면도 그리지 않아
  // F1-1이 잠깐 나타났다 F2-1로 바뀌는 깜빡임을 막는다.
  if (!initialized) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--background-normal-alternative)",
          fontFamily: "var(--font-ui)",
          color: "var(--label-normal)",
        }}
      >
        <div style={{ margin: "auto 20px", textAlign: "center", fontSize: 14, color: "var(--label-alternative)" }}>
          {authError ? `시작할 수 없어요. ${authError}` : "불러오는 중…"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--background-normal-alternative)",
        fontFamily: "var(--font-ui)",
        color: "var(--label-normal)",
      }}
    >
      {(step !== "input" || worries.length > 0 || contacts.length > 0) && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(6px)",
            boxShadow: "inset 0 -1px 0 var(--line-normal-normal)",
            fontFamily: "var(--font-ui)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <button type="button" onClick={() => setStep("home")} className="flex shrink-0 items-center gap-2">
              <span style={{ height: 10, width: 10, borderRadius: "50%", background: "var(--primary-normal)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", color: "var(--label-normal)" }}>
                고고
              </span>
            </button>
            <nav className="flex shrink-0 gap-1">
              <button type="button" onClick={startNewConcern} style={navPill(step === "input")}>
                고민 입력
              </button>
              <button type="button" onClick={openManage} style={navPill(step === "manage")}>
                지인 관리
              </button>
              <button type="button" onClick={openRepliedList} style={navPill(step === "repliedList")}>
                대화 기록
              </button>
            </nav>
          </div>
        </header>
      )}
      {authError && (
        <div style={{ margin: "16px 20px 0", borderRadius: 12, background: "rgba(224,66,66,0.08)", padding: "12px 16px", fontSize: 14, color: "var(--status-negative)" }}>
          익명 로그인 실패: {authError}
        </div>
      )}

      <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          key={screenKey}
          style={{
            flex: "1 1 auto",
            overflowY: "auto",
            padding: screenKey === "input" ? 0 : "32px 28px",
            display: "flex",
            flexDirection: "column",
            animation: "wds-in .22s ease-out",
          }}
        >
            {step === "home" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 22 }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.019em" }}>다시 왔네요</div>
                    <p style={{ fontSize: 14, color: "var(--label-alternative)" }}>
                      로그인 없이 이전 기록을 그대로 불러왔어요.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {homeStats.map((s) => (
                      <div
                        key={s.k}
                        onClick={s.onClick}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          alignItems: "center",
                          padding: "10px 14px",
                          borderRadius: 11,
                          background: "var(--fill-normal)",
                          minWidth: 68,
                          cursor: s.onClick ? "pointer" : "default",
                        }}
                      >
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: "var(--label-alternative)", whiteSpace: "nowrap" }}>{s.k}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  onClick={startNewConcern}
                  className="flex items-center gap-4"
                  style={{
                    cursor: "pointer",
                    borderRadius: 16,
                    padding: "20px 18px 20px 24px",
                    background: "var(--primary-normal)",
                    boxShadow: "0 2px 6px rgba(51,102,255,0.20), 0 12px 28px rgba(51,102,255,0.22)",
                  }}
                >
                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <div style={{ fontSize: 17, fontWeight: 700, color: "rgb(255,255,255)" }}>오늘은 무슨 일이 있었어요?</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.88)" }}>새 고민 쓰기 · 지인 {contacts.length}명은 이미 등록돼 있어요</div>
                  </div>
                  <div
                    style={{
                      flexShrink: 0,
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "rgb(255,255,255)",
                      color: "var(--primary-normal)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    ↑
                  </div>
                </div>

                {pendingWorries.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.031em", color: "var(--label-assistive)" }}>
                      아직 기록하지 않은 대화
                    </div>
                    {pendingWorries.map((w) => {
                      const top = recommendationsByWorry[w.id]?.[0];
                      return (
                        <div
                          key={w.id}
                          className="flex flex-col gap-2"
                          style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(51,102,255,0.06)", boxShadow: "inset 0 0 0 1px rgba(51,102,255,0.16)" }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                                {top?.contacts?.name ?? "지인"}에게 말함
                              </p>
                              <p style={{ fontSize: 12, color: "var(--label-alternative)" }} className="truncate">
                                {w.content}
                              </p>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-2">
                              <span style={{ fontSize: 11, color: "var(--label-assistive)" }}>{timeAgo(w.created_at)}</span>
                              <button onClick={() => handleDeleteWorry(w.id)} style={{ fontSize: 11, color: "var(--label-assistive)" }}>
                                삭제
                              </button>
                            </div>
                          </div>
                          {feedbackOpenId === w.id ? (
                            <div className="flex flex-wrap gap-2">
                              {OUTCOME_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  onClick={() => handleRecordOutcome(w, o.value)}
                                  style={{ borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 700, background: "var(--primary-normal)", color: "rgb(255,255,255)" }}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => setFeedbackOpenId(w.id)}
                              style={{ alignSelf: "flex-start", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 700, background: "var(--primary-normal)", color: "rgb(255,255,255)" }}
                            >
                              그때 어땠어요?
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {historyWorries.length > 0 && (
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.031em", color: "var(--label-assistive)", paddingBottom: 8 }}>
                      지난 고민
                    </div>
                    {historyWorries.slice(0, 8).map((w) => {
                      const top = recommendationsByWorry[w.id]?.[0];
                      const label = OUTCOME_OPTIONS.find((o) => o.value === w.outcome)?.label ?? w.outcome;
                      return (
                        <div
                          key={w.id}
                          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 2px", boxShadow: "inset 0 -1px 0 var(--line-normal-normal)" }}
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <div style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                              {w.content}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--label-alternative)" }}>
                              {top?.contacts?.name ?? "지인"} · {timeAgo(w.created_at)}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 7, background: "var(--fill-normal)", color: "var(--label-alternative)", whiteSpace: "nowrap" }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pendingWorries.length === 0 && worries.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>아직 기록된 고민이 없어요.</p>
                )}
              </div>
            )}

            {step === "manage" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="flex flex-col gap-1">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>지인 관리</div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    등록한 지인 정보는 AI 추천의 근거로 쓰여요.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddContact((v) => !v)}
                  style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 700, color: "var(--primary-normal)" }}
                >
                  {showAddContact ? "− 지인 추가 닫기" : "+ 지인 추가 · 대화 스크린샷 업로드로 자동 분석"}
                </button>

                {showAddContact && addContactFormBody}

                <div className="flex flex-col gap-3">
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.031em", color: "var(--label-assistive)" }}>
                    등록된 지인 ({contacts.length})
                  </span>
                  {contacts.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>아직 등록된 지인이 없어요.</p>
                  ) : (
                    contacts.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-col gap-2"
                        style={{ borderRadius: 12, background: "var(--fill-normal)", padding: 14 }}
                      >
                        {editingContactId === c.id ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="이름" style={{ ...inputStyle(), width: "50%" }} />
                              <input
                                value={editRelationship}
                                onChange={(e) => setEditRelationship(e.target.value)}
                                placeholder="관계 (예: 대학 친구)"
                                style={{ ...inputStyle(), width: "50%" }}
                              />
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={editOccupation}
                                onChange={(e) => setEditOccupation(e.target.value)}
                                placeholder="직업 (선택)"
                                style={{ ...inputStyle(), width: "50%" }}
                              />
                              <input
                                value={editMbti}
                                onChange={(e) => setEditMbti(e.target.value.toUpperCase())}
                                placeholder="MBTI (선택)"
                                maxLength={4}
                                style={{ ...inputStyle(), width: "50%" }}
                              />
                            </div>
                            <input
                              value={editTagsInput}
                              onChange={(e) => setEditTagsInput(e.target.value)}
                              placeholder="성향 태그, 쉼표로 구분"
                              style={inputStyle()}
                            />
                            <textarea
                              value={editMemo}
                              onChange={(e) => setEditMemo(e.target.value)}
                              placeholder="메모 (선택)"
                              rows={2}
                              style={{ ...inputStyle(), resize: "none" }}
                            />
                            {editStatus === "error" && (
                              <div style={{ fontSize: 12, color: "var(--status-negative)" }}>저장 실패: {editError}</div>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(c)}
                                disabled={!editName.trim() || !editRelationship.trim() || editStatus === "saving"}
                                style={{
                                  borderRadius: 10,
                                  padding: "8px 16px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: "var(--primary-normal)",
                                  color: "rgb(255,255,255)",
                                  opacity: !editName.trim() || !editRelationship.trim() || editStatus === "saving" ? 0.4 : 1,
                                }}
                              >
                                {editStatus === "saving" ? "저장 중..." : "저장"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                style={{ borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "var(--label-assistive)" }}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  background: "var(--background-elevated-normal)",
                                  color: "var(--label-alternative)",
                                }}
                              >
                                {c.name.slice(0, 1)}
                              </div>
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                                  <span style={{ fontSize: 12, color: "var(--label-alternative)" }}>
                                    {[c.relationship, c.occupation, c.mbti].filter(Boolean).join(" · ")}
                                  </span>
                                </div>
                                {c.personality_tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {c.personality_tags.map((tag) => (
                                      <span key={tag} style={{ borderRadius: 6, background: "var(--background-elevated-normal)", padding: "2px 8px", fontSize: 11, color: "var(--label-alternative)" }}>
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {c.memo && (
                                  <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--label-alternative)", whiteSpace: "pre-line" }}>
                                    {c.memo}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-2">
                              <button onClick={() => handleStartEdit(c)} style={{ fontSize: 12, color: "var(--label-assistive)" }}>
                                수정
                              </button>
                              <button onClick={() => handleDeleteContact(c)} style={{ fontSize: 12, color: "var(--label-assistive)" }}>
                                삭제
                              </button>
                            </div>
                          </div>
                        )}

                        {editingContactId !== c.id && (
                          <>
                            <div className="flex items-center gap-2" style={{ boxShadow: "inset 0 1px 0 var(--line-normal-normal)", paddingTop: 8 }}>
                              <input
                                ref={(el) => {
                                  enrichInputRefs.current[c.id] = el;
                                }}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={(e) => handleEnrichScreenshot(c, e)}
                                disabled={enrichingId === c.id}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => enrichInputRefs.current[c.id]?.click()}
                                disabled={enrichingId === c.id}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "var(--primary-normal)",
                                  opacity: enrichingId === c.id ? 0.5 : 1,
                                }}
                              >
                                {enrichingId === c.id ? "분석 중..." : "대화 캡처 올리기"}
                              </button>
                            </div>
                            {enrichError[c.id] && <p style={{ fontSize: 11, color: "var(--status-negative)" }}>{enrichError[c.id]}</p>}

                            <div className="flex flex-col gap-1.5" style={{ boxShadow: "inset 0 1px 0 var(--line-normal-normal)", paddingTop: 8 }}>
                              {inviteLinks[c.id] ? (
                                <>
                                  <div className="flex items-center gap-1.5" style={{ borderRadius: 8, background: "var(--background-elevated-normal)", padding: "6px 10px" }}>
                                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 11, color: "var(--label-alternative)" }}>
                                      {inviteLinks[c.id]}
                                    </span>
                                    <button
                                      onClick={() => handleCopyInvite(c.id, inviteLinks[c.id])}
                                      style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--label-alternative)" }}
                                    >
                                      {copiedId === c.id ? "복사됨!" : "복사"}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleShareInvite(c, inviteLinks[c.id])}
                                    style={{ alignSelf: "flex-start", borderRadius: 8, background: "#FEE500", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.85)" }}
                                  >
                                    카카오톡으로 보내기
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleCreateInvite(c)}
                                  disabled={creatingInviteId === c.id}
                                  style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: "var(--primary-normal)", opacity: creatingInviteId === c.id ? 0.4 : 1 }}
                                >
                                  {creatingInviteId === c.id ? "링크 만드는 중..." : `${c.name}에게 직접 물어보기`}
                                </button>
                              )}
                              {inviteError[c.id] && <p style={{ fontSize: 11, color: "var(--status-negative)" }}>{inviteError[c.id]}</p>}
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {step === "repliedList" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="flex flex-col gap-1">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>답변 온 대화</div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    실제로 지인이 답장을 보낸 대화예요. 눌러서 다시 볼 수 있어요.
                  </p>
                </div>

                {repliedWorryIds.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {repliedWorryIds.map((worryId) => {
                      const replies = repliedByWorry[worryId] ?? [];
                      const names = [...new Set(replies.map((r) => r.contacts?.name).filter((n): n is string => !!n))];
                      const content = replies[0]?.worries?.content ?? "";
                      return (
                        <button
                          type="button"
                          key={worryId}
                          onClick={() => openWorryDetail(worryId)}
                          className="flex items-center gap-3 text-left"
                          style={{ borderRadius: 12, padding: "12px 14px", boxShadow: ring1 }}
                        >
                          <div className="flex flex-1 flex-col gap-1 min-w-0">
                            <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                              {content}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--label-alternative)" }} className="truncate">
                              {(names.join(", ") || "지인") + " 답장"} · {timeAgo(replies[0]?.used_at)}
                            </p>
                          </div>
                          <span style={{ fontSize: 13, color: "var(--label-assistive)", flexShrink: 0 }}>→</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>아직 답장이 온 대화가 없어요.</p>
                )}
              </div>
            )}

            {step === "historyList" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="flex flex-col gap-1">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>쓴 고민</div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    지금까지 적어둔 고민이에요.
                  </p>
                </div>

                {worries.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {worries.map((w) => {
                      const top = recommendationsByWorry[w.id]?.[0];
                      const label = OUTCOME_OPTIONS.find((o) => o.value === w.outcome)?.label ?? "아직 안 적음";
                      const hasReplies = (repliedByWorry[w.id]?.length ?? 0) > 0;
                      return (
                        <div
                          key={w.id}
                          className="flex items-center gap-3"
                          style={{ borderRadius: 12, padding: "12px 14px", boxShadow: ring1 }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (hasReplies) openWorryDetail(w.id);
                            }}
                            className="flex flex-1 flex-col gap-1 min-w-0 text-left"
                            style={{ cursor: hasReplies ? "pointer" : "default" }}
                          >
                            <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">
                              {w.content}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--label-alternative)" }} className="truncate">
                              {top?.contacts?.name ?? "지인"} · {timeAgo(w.created_at)}
                            </p>
                          </button>
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "4px 9px",
                              borderRadius: 7,
                              background: "var(--fill-normal)",
                              color: "var(--label-alternative)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorry(w.id)}
                            style={{ flexShrink: 0, fontSize: 11, color: "var(--label-assistive)" }}
                          >
                            삭제
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>아직 적어둔 고민이 없어요.</p>
                )}
              </div>
            )}

            {step === "detail" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                {viewingWorryContent ? (
                  <>
                    <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{viewingWorryContent}</p>

                    <div className="flex flex-col gap-4">
                      {viewingReplies.map((r) => (
                        <div key={r.id} className="flex flex-col gap-2">
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--label-alternative)" }}>
                            {r.contacts?.name ?? "지인"} · {timeAgo(r.used_at)}
                          </span>
                          <div
                            style={{
                              borderRadius: 14,
                              background: "var(--fill-normal)",
                              padding: "12px 14px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            {r.answer_1 && <p style={{ fontSize: 14, lineHeight: 1.6 }}>{r.answer_1}</p>}
                            {r.answer_2 && <p style={{ fontSize: 14, lineHeight: 1.6 }}>{r.answer_2}</p>}
                            {r.free_text && (
                              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--label-neutral)" }}>
                                &quot;{r.free_text}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {viewingWorry && (
                      <div style={{ borderRadius: 12, background: "var(--fill-normal)", padding: 14 }}>
                        {viewingWorry.outcome ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--label-alternative)" }}>
                            그때 어땠는지 기록함: {OUTCOME_OPTIONS.find((o) => o.value === viewingWorry.outcome)?.label ?? viewingWorry.outcome}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <span style={{ fontSize: 13, fontWeight: 700 }}>그때 어땠어요?</span>
                            <div className="flex flex-wrap gap-2">
                              {OUTCOME_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  onClick={() => handleRecordOutcome(viewingWorry, o.value)}
                                  style={{ borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 700, background: "var(--primary-normal)", color: "rgb(255,255,255)" }}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {viewingWorry && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (await handleDeleteWorry(viewingWorry.id)) setStep("home");
                        }}
                        style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--label-assistive)" }}
                      >
                        이 고민 삭제
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>대화를 찾을 수 없어요.</p>
                )}
              </div>
            )}

            {screenKey === "input" && (
              <div
                style={{
                  flex: 1,
                  padding: "56px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 24,
                  background: heroBg,
                }}
              >
                <div className="flex flex-col items-center gap-2 text-center" style={{ maxWidth: 640 }}>
                  <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.024em", lineHeight: 1.35 }}>
                    <span style={{ display: "inline-block", animation: "wds-reveal 0.6s ease-out 0.35s both" }}>
                      고민 좀
                    </span>
                    <span style={{ display: "inline-block", animation: "wds-reveal 0.6s ease-out 1.45s both" }}>
                      {" 들어줄래?"}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)", lineHeight: 1.6 }}>
                    로그인 없이 바로 시작해요. 누구에게 말할지 모르겠을 때 쓰세요.
                  </p>
                </div>

                <div
                  className="flex items-end gap-3"
                  style={{
                    width: "100%",
                    maxWidth: 680,
                    background: "var(--background-elevated-normal)",
                    borderRadius: 28,
                    padding: "14px 14px 14px 24px",
                    boxShadow: "0 2px 4px rgba(23,23,23,0.06), 0 12px 32px rgba(23,23,23,0.07)",
                  }}
                >
                  <textarea
                    value={concern}
                    onChange={(e) => setConcern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitConcern();
                      }
                    }}
                    placeholder="지금 무슨 생각이 머릿속에 있어요?"
                    rows={1}
                    style={{
                      flex: 1,
                      minHeight: 34,
                      maxHeight: 160,
                      resize: "none",
                      border: "none",
                      background: "transparent",
                      outline: "none",
                      fontSize: 16,
                      lineHeight: 1.6,
                      fontFamily: "inherit",
                      color: "var(--label-normal)",
                    }}
                  />
                  <button
                    onClick={handleSubmitConcern}
                    disabled={!userId || !concern.trim() || worryStatus === "saving"}
                    style={{
                      flexShrink: 0,
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--primary-normal)",
                      color: "rgb(255,255,255)",
                      fontSize: 17,
                      fontWeight: 700,
                      opacity: !userId || !concern.trim() || worryStatus === "saving" ? 0.4 : 1,
                    }}
                  >
                    ↑
                  </button>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <span style={{ fontSize: 13, color: "var(--label-alternative)" }}>어떤 반응을 원해요?</span>
                  <div className="flex flex-wrap justify-center gap-2">
                    {RESPONSE_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() => {
                          setResponseType(t.value);
                          setCustomMode(false);
                        }}
                        style={pillButton(!customMode && responseType === t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setCustomMode(true)} style={pillButton(customMode)}>
                      직접 입력
                    </button>
                  </div>
                  {customMode && (
                    <input
                      value={customResponseText}
                      onChange={(e) => setCustomResponseText(e.target.value)}
                      placeholder="예: 혼내지 말고, 결정은 내가 하게 두는 반응"
                      style={{
                        width: "100%",
                        maxWidth: 420,
                        border: "none",
                        borderRadius: 999,
                        padding: "11px 18px",
                        fontSize: 14,
                        fontFamily: "inherit",
                        color: "var(--label-normal)",
                        background: "var(--background-elevated-normal)",
                        boxShadow: "inset 0 0 0 1px var(--primary-normal)",
                        boxSizing: "border-box",
                        textAlign: "left",
                      }}
                    />
                  )}
                </div>
                {worryStatus === "error" && (
                  <div style={{ fontSize: 13, color: "var(--status-negative)" }}>저장 실패: {worryError}</div>
                )}
              </div>
            )}

            {step === "contacts" && !analyzing && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="flex flex-col gap-1">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    이 중에 누구한테 물어보고 싶어요?
                  </div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    고른 사람만 후보로 놓고 AI가 순위를 매깁니다. 여러 명 골라도 돼요.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: askSelectedIds.size ? "var(--primary-strong)" : "var(--label-assistive)",
                    }}
                  >
                    {askSelectedIds.size ? `선택 ${askSelectedIds.size}명 · ${askNames}` : "물어보고 싶은 사람을 골라주세요"}
                  </span>
                </div>

                {contacts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {contacts.map((c) => {
                      const picked = askSelectedIds.has(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => toggleAskSelected(c.id)}
                          className="flex items-center gap-3 text-left"
                          style={{
                            borderRadius: 12,
                            boxShadow: picked ? ringP : ring1,
                            background: picked ? "rgba(51,102,255,0.06)" : "transparent",
                            padding: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              background: picked ? "rgba(51,102,255,0.10)" : "var(--fill-normal)",
                              color: picked ? "var(--primary-strong)" : "var(--label-alternative)",
                            }}
                          >
                            {c.name.slice(0, 1)}
                          </div>
                          <div className="flex flex-1 flex-col gap-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                              <span style={{ fontSize: 11, color: "var(--label-alternative)" }}>
                                {[c.relationship, c.occupation, c.mbti].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                            {c.personality_tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {c.personality_tags.map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      borderRadius: 6,
                                      background: "var(--fill-normal)",
                                      padding: "2px 8px",
                                      fontSize: 10,
                                      color: "var(--label-alternative)",
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              flexShrink: 0,
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              background: picked ? "var(--primary-normal)" : "transparent",
                              color: "rgb(255,255,255)",
                              boxShadow: picked ? "none" : "inset 0 0 0 1.5px var(--line-normal-normal)",
                            }}
                          >
                            {picked ? "✓" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    등록된 지인이 없어요. 아래에서 한 명만 추가하면 추천을 받을 수 있어요.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddContact((v) => !v)}
                  style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 700, color: "var(--primary-normal)" }}
                >
                  {showAddContact ? "− 지인 추가 닫기" : "+ 지인 추가 · 대화 스크린샷 업로드로 자동 분석"}
                </button>

                {showAddContact && addContactFormBody}

                {analyzeError && <div style={{ fontSize: 12, color: "var(--status-negative)" }}>{analyzeError}</div>}

                <button
                  type="button"
                  onClick={handleConfirmContacts}
                  disabled={askSelectedIds.size === 0}
                  style={{
                    alignSelf: "flex-start",
                    borderRadius: 10,
                    padding: "11px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    background: "var(--primary-normal)",
                    color: "rgb(255,255,255)",
                    opacity: askSelectedIds.size === 0 ? 0.4 : 1,
                  }}
                >
                  AI 추천 받기
                </button>
              </div>
            )}

            {analyzing && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 28 }}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        border: "2.5px solid rgba(51,102,255,0.18)",
                        borderTopColor: "var(--primary-normal)",
                        animation: "wds-spin 0.8s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ fontSize: 18, fontWeight: 700 }}>누구에게 말하면 좋을지 찾고 있어요</div>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)", lineHeight: 1.6 }}>
                    선택한 지인 {askSelectedIds.size}명의 성향·경험과 대조하는 중입니다. 보통 5초 안에 끝나요.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { text: "고민을 읽고 성격을 분류하는 중", delay: "0s" },
                    { text: `선택한 지인 ${askSelectedIds.size}명의 성향·경험과 대조하는 중`, delay: "0.9s" },
                    { text: "왜 이 사람인지 근거를 정리하는 중", delay: "1.9s" },
                  ].map((row) => (
                    <div key={row.text} className="flex items-center gap-2.5" style={{ animation: `wds-step 0.5s ease-out ${row.delay} both` }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary-normal)", flexShrink: 0 }} />
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{row.text}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  {contacts
                    .filter((c) => askSelectedIds.has(c.id))
                    .map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3" style={{ borderRadius: 10, padding: "12px 14px", boxShadow: ring1, opacity: 1 - i * 0.22 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            background: "var(--fill-normal)",
                            color: "var(--label-alternative)",
                          }}
                        >
                          {c.name.slice(0, 1)}
                        </div>
                        <div className="flex-1" style={{ fontSize: 13, fontWeight: 600 }}>
                          {c.name}
                        </div>
                        <div style={{ width: 34, height: 22, borderRadius: 7, background: "var(--fill-normal)", animation: "wds-breathe 1.8s ease-in-out infinite" }} />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {step === "result" && !analyzing && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 18 }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{resultTitle}</div>
                    <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                      선택한 지인들의 성향과 경험을 바탕으로 근거와 예상 반응을 함께 보여드려요. 보낼 사람을 눌러서 바꿀 수 있어요.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={openRejectPanel}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--label-neutral)",
                        padding: "7px 12px",
                        borderRadius: 8,
                        boxShadow: ring1,
                        background: "var(--background-elevated-normal)",
                      }}
                    >
                      이 사람들은 아니에요
                    </button>
                    <button
                      onClick={handleReanalyze}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--label-neutral)",
                        padding: "7px 12px",
                        borderRadius: 8,
                        boxShadow: ring1,
                        background: "var(--background-elevated-normal)",
                      }}
                    >
                      다시 분석
                    </button>
                  </div>
                </div>

                {analyzeError && <div style={{ fontSize: 12, color: "var(--status-negative)" }}>{analyzeError}</div>}

                {rejecting && (
                  <div className="flex flex-col gap-3" style={{ borderRadius: 12, background: "var(--fill-normal)", padding: 14 }}>
                    <div className="flex flex-col gap-1.5">
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--label-neutral)" }}>제외할 사람</span>
                      <div className="flex flex-wrap gap-2">
                        {recommendations.map((r) => {
                          const excluded = excludeIds.has(r.contact_id);
                          return (
                            <button
                              key={r.contact_id}
                              onClick={() => toggleExclude(r.contact_id)}
                              style={{
                                borderRadius: 999,
                                padding: "7px 14px",
                                fontSize: 12,
                                fontWeight: 600,
                                background: excluded ? "rgba(224,66,66,0.1)" : "var(--background-elevated-normal)",
                                color: excluded ? "var(--status-negative)" : "var(--label-neutral)",
                                boxShadow: excluded ? "none" : ring1,
                              }}
                            >
                              {r.contacts?.name ?? "?"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--label-neutral)" }}>지금 진짜 원하는 반응</span>
                      <div className="flex flex-wrap gap-2">
                        {RESPONSE_TYPES.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => {
                              setRefineType(t.value);
                              setRefineCustomMode(false);
                            }}
                            style={{
                              borderRadius: 999,
                              padding: "7px 14px",
                              fontSize: 12,
                              fontWeight: 600,
                              background: !refineCustomMode && refineType === t.value ? "var(--primary-normal)" : "var(--background-elevated-normal)",
                              color: !refineCustomMode && refineType === t.value ? "rgb(255,255,255)" : "var(--label-neutral)",
                              boxShadow: !refineCustomMode && refineType === t.value ? "none" : ring1,
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setRefineCustomMode(true)}
                          style={{
                            borderRadius: 999,
                            padding: "7px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            background: refineCustomMode ? "var(--primary-normal)" : "var(--background-elevated-normal)",
                            color: refineCustomMode ? "rgb(255,255,255)" : "var(--label-neutral)",
                            boxShadow: refineCustomMode ? "none" : ring1,
                          }}
                        >
                          직접 입력
                        </button>
                      </div>
                      {refineCustomMode && (
                        <input
                          value={refineCustomText}
                          onChange={(e) => setRefineCustomText(e.target.value)}
                          placeholder="예: 혼내지 말고, 결정은 내가 하게 두는 반응"
                          style={{ ...inputStyle(), boxShadow: "inset 0 0 0 1px var(--primary-normal)" }}
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRefine}
                        disabled={refineCustomMode && !refineCustomText.trim()}
                        style={{
                          borderRadius: 10,
                          background: "var(--primary-normal)",
                          padding: "9px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "rgb(255,255,255)",
                          opacity: refineCustomMode && !refineCustomText.trim() ? 0.4 : 1,
                        }}
                      >
                        조건 반영해 다시 추천
                      </button>
                      <button onClick={() => setRejecting(false)} style={{ borderRadius: 10, padding: "9px 16px", fontSize: 12, fontWeight: 700, color: "var(--label-assistive)" }}>
                        취소
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {recommendations.map((r) => {
                    const picked = r.contact_id === selectedContactId;
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setSelectedContactId(r.contact_id)}
                        className="flex flex-col gap-2 text-left"
                        style={{
                          borderRadius: 12,
                          background: picked ? "rgba(51,102,255,0.04)" : "var(--fill-normal)",
                          padding: 14,
                          boxShadow: picked ? ringP : "none",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              background: picked ? "rgba(51,102,255,0.12)" : "var(--background-elevated-normal)",
                              color: picked ? "var(--primary-strong)" : "var(--label-alternative)",
                            }}
                          >
                            {(r.contacts?.name ?? "?").slice(0, 1)}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{r.contacts?.name ?? "알 수 없음"}</span>
                            <span style={{ fontSize: 12, color: "var(--label-alternative)" }}>
                              {[r.contacts?.relationship, r.contacts?.occupation, r.contacts?.mbti].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                          {r.score != null && (
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 20, fontWeight: 700, color: picked ? "var(--primary-normal)" : "var(--label-alternative)" }}>
                                {r.score}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--label-assistive)" }}>매칭도</div>
                            </div>
                          )}
                        </div>
                        {r.reason.split("\n").filter(Boolean).map((line, li) => (
                          <p key={li} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--label-neutral)" }}>
                            {line}
                          </p>
                        ))}
                        <div style={{ borderRadius: 10, background: "var(--background-elevated-normal)", padding: "10px 12px", boxShadow: ring1 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--label-assistive)" }}>예상 반응</span>
                          <p style={{ marginTop: 2, fontSize: 13, color: "var(--label-neutral)" }}>{r.script}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedName && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--label-alternative)" }}>{selectedName}님에게 보낼게요</p>
                )}

                <div className="flex items-center gap-4 flex-wrap" style={{ paddingTop: 6, boxShadow: "inset 0 1px 0 var(--line-normal-normal)" }}>
                  <button
                    onClick={() => {
                      setStep("share");
                      void ensureInviteUrl();
                    }}
                    style={{ borderRadius: 10, background: "#FEE500", padding: "11px 18px", fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.85)" }}
                  >
                    카카오톡 공유하기
                  </button>
                  <button onClick={goToMessage} style={{ fontSize: 13, fontWeight: 700, color: "var(--primary-normal)" }}>
                    직접 보낼게요
                  </button>
                </div>
              </div>
            )}

            {step === "message" && !copied && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="flex flex-col gap-1">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {selectedName ? `${selectedName}에게 보낼 첫 메시지` : "메시지 초안"}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>
                    AI 초안입니다. 그대로 보내도 되고 고쳐도 돼요.
                  </p>
                </div>

                <textarea
                  value={draft === null ? defaultDraft : draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    border: "none",
                    boxShadow: ring1,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    lineHeight: 1.7,
                    fontFamily: "inherit",
                    color: "var(--label-normal)",
                    background: "var(--background-elevated-normal)",
                  }}
                />

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyMessage}
                    disabled={inviteCreating}
                    style={{
                      borderRadius: 10,
                      background: "var(--primary-normal)",
                      padding: "11px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "rgb(255,255,255)",
                      opacity: inviteCreating ? 0.5 : 1,
                    }}
                  >
                    {inviteCreating ? "링크 만드는 중..." : "메시지 복사"}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "var(--label-assistive)", lineHeight: 1.6 }}>
                  복사하면 메시지 끝에 {withSubjectParticle(selectedName || "지인")} 이 고민에 바로 답할 수 있는 링크가 함께 붙어요.
                </p>
              </div>
            )}

            {step === "message" && copied && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: copyFailed ? "rgba(224,66,66,0.10)" : "rgba(51,102,255,0.10)",
                    color: copyFailed ? "var(--status-negative)" : "var(--primary-normal)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  {copyFailed ? "!" : "✓"}
                </div>
                <div className="flex flex-col gap-2 text-center" style={{ maxWidth: 380 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{copyFailed ? "자동 복사에 실패했어요" : "복사했어요"}</div>
                  <p style={{ fontSize: 14, color: "var(--label-alternative)", lineHeight: 1.6 }}>
                    {copyFailed
                      ? "브라우저가 복사를 막았어요. 아래 메시지를 직접 선택해서 복사한 뒤 보내주세요."
                      : "메시지를 클립보드에 복사했어요. 카카오톡이나 문자에 붙여넣어 보내보세요."}
                  </p>
                </div>
                {copyFailed && (
                  <p
                    style={{
                      width: "100%",
                      maxWidth: 380,
                      borderRadius: 12,
                      background: "var(--fill-normal)",
                      padding: 14,
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "var(--label-neutral)",
                      whiteSpace: "pre-line",
                      userSelect: "text",
                    }}
                  >
                    {(draft ?? defaultDraft) + (inviteUrl ? `\n${inviteUrl}` : "")}
                  </p>
                )}
                <button
                  onClick={handleFinishSent}
                  style={{ borderRadius: 10, background: "var(--primary-normal)", padding: "11px 20px", fontSize: 13, fontWeight: 700, color: "rgb(255,255,255)" }}
                >
                  완료
                </button>
              </div>
            )}

            {step === "share" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
                <div className="flex flex-col gap-1 text-center">
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>이렇게 도착해요</div>
                  <p style={{ fontSize: 13, color: "var(--label-alternative)" }}>카톡 공유 카드 미리보기입니다.</p>
                </div>
                <div style={{ width: "100%", maxWidth: 380, borderRadius: 16, overflow: "hidden", boxShadow: ring1 }}>
                  <div style={{ background: "var(--primary-normal)", padding: "22px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.031em", color: "rgba(255,255,255,0.82)" }}>고민 테스터 AI</div>
                    <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, color: "rgb(255,255,255)", whiteSpace: "pre-line" }}>{kakaoCard.title}</div>
                  </div>
                  <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, background: "var(--background-elevated-normal)" }}>
                    <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--label-neutral)" }}>{kakaoCard.description}</div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        padding: 12,
                        borderRadius: 10,
                        background: "var(--fill-normal)",
                        color: "var(--label-neutral)",
                      }}
                    >
                      {kakaoCard.buttonTitle}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSendCard}
                  disabled={inviteCreating}
                  style={{
                    borderRadius: 10,
                    background: "#FEE500",
                    padding: "12px 22px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "rgba(0,0,0,0.85)",
                    opacity: inviteCreating ? 0.5 : 1,
                  }}
                >
                  {inviteCreating ? "링크 만드는 중..." : "카카오톡으로 보내기"}
                </button>
                <p style={{ fontSize: 11, color: "var(--label-assistive)", textAlign: "center" }}>
                  카드를 누르면 {withSubjectParticle(selectedName || "지인")} 이 고민에 바로 답할 수 있는 페이지로 연결돼요.
                </p>
                {shareError && <div style={{ fontSize: 12, color: "var(--status-negative)" }}>{shareError}</div>}
              </div>
            )}

            {step === "sent" && (
              <div style={{ ...CONTENT_MAX_WIDTH, display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "rgba(51,102,255,0.10)",
                    color: "var(--primary-normal)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </div>
                <div className="flex flex-col gap-2 text-center" style={{ maxWidth: 380 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>보냈어요</div>
                  <p style={{ fontSize: 14, color: "var(--label-alternative)", lineHeight: 1.6 }}>
                    전송 결과는 카카오가 알려주지 않아 여기서 추적하지 않아요. 다음에 다시 오면 어땠는지 물어볼게요.
                  </p>
                </div>
                <button
                  onClick={handleFinishSent}
                  style={{ borderRadius: 10, background: "var(--primary-normal)", padding: "11px 20px", fontSize: 13, fontWeight: 700, color: "rgb(255,255,255)" }}
                >
                  완료
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
