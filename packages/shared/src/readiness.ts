export type StepStatus = 'DONE' | 'BLOCKED' | 'NEXT' | 'PENDING';

export type ReviewState = 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'RETURNED' | 'SKIPPED';

export type ReadyItem = {
  id: string;
  title: string;
  status: string;
};

export type NoticeRuleInput = {
  daysBefore: number | null;
  bodyId?: string | null;
  itemType?: string | null;
  codeCitation?: string | null;
};

export type ReadinessStep = {
  key: 'notice' | 'reviews' | 'items' | 'packet' | 'minutes';
  label: string;
  status: StepStatus;
  blockers: string[];
};

const READY_ITEM_STATUSES = new Set(['READY', 'PUBLISHED', 'HEARD', 'CONTINUED']);

export function selectNoticeRule(
  rules: NoticeRuleInput[],
  bodyId: string,
): NoticeRuleInput | null {
  const ranked = [...rules].sort((a, b) => specificity(b, bodyId) - specificity(a, bodyId));
  return ranked.find((rule) => specificity(rule, bodyId) > 0) ?? null;
}

function specificity(rule: NoticeRuleInput, bodyId: string): number {
  if (rule.bodyId && rule.bodyId !== bodyId) return 0;
  let score = 1;
  if (rule.bodyId === bodyId) score += 2;
  return score;
}

function noticeBlockers(input: {
  noticePostedAt: Date | null;
  meetingStartsAt: Date;
  rule: NoticeRuleInput | null;
}): string[] {
  if (!input.rule || input.rule.daysBefore == null) {
    return ['Notice rule not configured'];
  }
  if (!input.noticePostedAt) return [];
  const ms = input.rule.daysBefore * 24 * 60 * 60 * 1000;
  const latest = input.meetingStartsAt.getTime() - ms;
  if (input.noticePostedAt.getTime() > latest) {
    return ['Notice period not met'];
  }
  return [];
}

function noticeDone(input: {
  noticePostedAt: Date | null;
  meetingStartsAt: Date;
  rule: NoticeRuleInput | null;
}): boolean {
  if (!input.noticePostedAt || !input.rule || input.rule.daysBefore == null) return false;
  return noticeBlockers(input).length === 0;
}

export function evaluateReadiness(input: {
  noticePostedAt: Date | null;
  meetingStartsAt: Date;
  noticeRules: NoticeRuleInput[];
  bodyId: string;
  reviewSteps: { status: ReviewState; agendaItemId: string }[];
  items: ReadyItem[];
  packetPublishedAt: Date | null;
  meetingStatus: string;
}): { steps: ReadinessStep[]; publishAllowed: boolean } {
  const rule = selectNoticeRule(input.noticeRules, input.bodyId);
  const activeItems = input.items.filter((item) => item.status !== 'WITHDRAWN');
  const noticeIsDone = noticeDone({
    noticePostedAt: input.noticePostedAt,
    meetingStartsAt: input.meetingStartsAt,
    rule,
  });
  const noticeHard = noticeBlockers({
    noticePostedAt: input.noticePostedAt,
    meetingStartsAt: input.meetingStartsAt,
    rule,
  });

  const openReviews = input.reviewSteps.filter(
    (step) => step.status !== 'APPROVED' && step.status !== 'SKIPPED',
  );
  const reviewsDone = openReviews.length === 0;
  const itemsNotReady = activeItems.filter((item) => !READY_ITEM_STATUSES.has(item.status));
  const itemsDone = activeItems.length > 0 && itemsNotReady.length === 0;
  const itemBlockers =
    activeItems.length === 0
      ? ['No agenda items']
      : itemsNotReady.map((item) => `${item.title} is ${item.status}`);

  const intrinsic: { done: boolean; blockers: string[] }[] = [
    {
      done: noticeIsDone,
      blockers: noticeHard.length > 0 ? noticeHard : input.noticePostedAt ? [] : ['Notice not posted'],
    },
    {
      done: reviewsDone,
      blockers: openReviews.map((step) => `Review ${step.status.toLowerCase()} on item ${step.agendaItemId}`),
    },
    { done: itemsDone, blockers: itemBlockers },
    {
      done: input.packetPublishedAt != null,
      blockers: input.packetPublishedAt ? [] : ['Packet not published'],
    },
    {
      done: input.meetingStatus === 'MINUTES_ADOPTED',
      blockers: input.meetingStatus === 'MINUTES_ADOPTED' ? [] : ['Minutes not adopted'],
    },
  ];

  const labels: { key: ReadinessStep['key']; label: string }[] = [
    { key: 'notice', label: 'Notice posted' },
    { key: 'reviews', label: 'Reviews done' },
    { key: 'items', label: 'Items ready' },
    { key: 'packet', label: 'Packet published' },
    { key: 'minutes', label: 'Minutes adopted' },
  ];

  let open = false;
  const steps: ReadinessStep[] = labels.map((meta, index) => {
    const row = intrinsic[index]!;
    if (row.done) {
      return { ...meta, status: 'DONE', blockers: [] };
    }
    if (open) {
      return { ...meta, status: 'PENDING', blockers: row.blockers };
    }
    open = true;
    const hard =
      (index === 0 && noticeHard.length > 0) ||
      (index === 2 && activeItems.length === 0);
    return {
      ...meta,
      status: hard ? 'BLOCKED' : 'NEXT',
      blockers: row.blockers,
    };
  });

  const publishAllowed = steps.slice(0, 3).every((step) => step.status === 'DONE');
  return { steps, publishAllowed };
}
