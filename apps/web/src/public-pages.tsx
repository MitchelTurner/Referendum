import { Button, CitationChip, CitedPage, CourseLine, EmptyState, GovMark, Input, LiveBar, Redline, Select, Tag, type RedlineSection } from '@referendum/ui';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, moduleOn, type CalendarMeeting, type LiveRow, type Region } from './api';

const SUGGESTED = [
  'What does this item change?',
  'Who is affected?',
  'When is the hearing?',
];

export function HomePage({ region }: { region?: Region }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; answered: boolean; citations: { pageId: string; documentTitle: string; pageNumber: number; quote: string }[] } | null>(null);
  const [error, setError] = useState('');
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const to = new Date();
  to.setDate(to.getDate() + 60);
  const calendar = useQuery({
    queryKey: ['calendar', from.toISOString().slice(0, 10)],
    queryFn: () => api<CalendarMeeting[]>(`/public/calendar?from=${from.toISOString()}&to=${to.toISOString()}`),
  });
  const live = useQuery({ queryKey: ['live'], queryFn: () => api<LiveRow[]>('/public/live'), refetchInterval: 2000 });
  const meetings = calendar.data ?? [];
  const decided = meetings.filter((meeting) => ['ADJOURNED', 'MINUTES_DRAFT', 'MINUTES_ADOPTED'].includes(meeting.status));

  async function ask(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await api<NonNullable<typeof answer>>('/public/ask', { method: 'POST', body: JSON.stringify({ question }) });
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    }
  }

  return (
    <div className="space-y-8">
      <section className="chart-grid rounded-lg border border-buff-line p-6">
        <h1 className="font-display text-4xl text-ink">What is before the public?</h1>
        <p className="mt-2 max-w-prose text-ink-muted">Search the Ketchikan region — City, Borough, and Saxman — in plain language. Answers stay tied to a page.</p>
        {moduleOn(region, 'ASK') ? (
          <form onSubmit={ask} className="mt-4 space-y-3">
            <label htmlFor="ask" className="font-mono text-sm">Ask the packets</label>
            <textarea id="ask" required minLength={3} value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-24 w-full rounded-md border border-rule bg-paper p-3" />
            <Button type="submit">Ask</Button>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((prompt) => (
                <button key={prompt} type="button" className="min-h-11 rounded-md border border-water-line bg-water px-3" onClick={() => setQuestion(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            {error ? <p className="text-hazard-ink" role="alert">{error}</p> : null}
            {answer ? (
              <div className="rounded-md bg-paper p-4">
                <Tag tone="hazard">Automated</Tag>
                <p className="mt-2">{answer.answer}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.citations.map((cite, index) => (
                    <CitationChip key={cite.pageId} index={index + 1} label={`${cite.documentTitle} p. ${cite.pageNumber}`} />
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        ) : null}
      </section>
      {(live.data ?? []).map((row) => (
        <LiveBar key={row.meetingId} label={row.label} government={row.government} itemTitle={row.currentItemTitle} />
      ))}
      <section>
        <h2 className="font-display text-2xl">Town calendar</h2>
        <MeetingList meetings={meetings} empty="Nothing is noticed in this window." />
      </section>
      <section>
        <h2 className="font-display text-2xl">Recently decided</h2>
        <MeetingList meetings={decided} empty="No recent decisions are on the public calendar." />
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-rule p-4">
          <h2 className="font-display text-xl">Hearings near you</h2>
          <p className="text-ink-muted">Address notices use the radius a government configures. Until a rule is confirmed, the period shows as not configured.</p>
          <Link className="inline-flex min-h-11 items-center text-chart-blue" to="/notices">Set an address</Link>
        </article>
        <article className="rounded-lg border border-rule p-4">
          <h2 className="font-display text-xl">On your course</h2>
          <p className="text-ink-muted">Follow a matter and it stays on your list across bodies.</p>
          <Link className="inline-flex min-h-11 items-center text-chart-blue" to="/follow">Follow a matter</Link>
        </article>
        <article className="rounded-lg border border-rule p-4">
          <h2 className="font-display text-xl">Weekly log</h2>
          <p className="text-ink-muted">A Friday morning digest, America/Anchorage, of what is coming and what was decided.</p>
          <Link className="inline-flex min-h-11 items-center text-chart-blue" to="/follow">Sign up</Link>
        </article>
      </section>
      <article className="rounded-lg bg-water p-4">
        <h2 className="font-display text-xl">Open data</h2>
        <p>Meetings, items, matters, and accepted votes are published at stable v1 addresses.</p>
        <Link className="inline-flex min-h-11 items-center text-chart-blue" to="/data">Read the data notes</Link>
      </article>
    </div>
  );
}

function MeetingList({ meetings, empty }: { meetings: CalendarMeeting[]; empty: string }) {
  if (meetings.length === 0) return <EmptyState title="Clear water" body={empty} />;
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <Link to={`/meetings/${meeting.id}`} className="flex min-h-11 flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2">
            <GovMark token={meeting.government.colorToken} label={meeting.government.shortName} />
            <span className="font-mono text-sm">{meeting.label}</span>
            <span>{meeting.body.name}</span>
            <Tag>{meeting.status}</Tag>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type PublicMeeting = CalendarMeeting & {
  noticePostedAt: string | null;
  packetPublishedAt: string | null;
  videoProvider: string | null;
  videoRef: string | null;
  currentItemId: string | null;
  items: { id: string; position: string; title: string; type: string; status: string; matterId: string | null }[];
};

export function MeetingPage() {
  const { id = '' } = useParams();
  const meeting = useQuery({ queryKey: ['meeting', id], queryFn: () => api<PublicMeeting>(`/public/meetings/${id}`) });
  if (meeting.isLoading) return <p>Loading meeting.</p>;
  if (meeting.isError || !meeting.data) return <EmptyState title="Meeting not on the public record" body="Drafts stay with staff until notice is posted." />;
  const row = meeting.data;
  return (
    <article className="space-y-4">
      <p className="font-mono text-sm text-ink-muted">{row.label}</p>
      <h1 className="font-display text-4xl">{row.body.name}</h1>
      <GovMark token={row.government.colorToken} label={row.government.name} />
      <p>{row.location ?? 'Location not posted'} · {new Date(row.startsAt).toLocaleString()}</p>
      {row.videoProvider === 'youtube' && row.videoRef ? (
        <iframe title="Meeting video" className="aspect-video w-full rounded-md border border-rule" src={`https://www.youtube.com/embed/${row.videoRef}`} allowFullScreen />
      ) : null}
      <ol className="m-0 list-none space-y-2 p-0">
        {row.items.map((item) => (
          <li key={item.id}>
            <Link className={`flex min-h-11 items-center gap-3 rounded-md border px-3 ${item.id === row.currentItemId ? 'border-hazard bg-hazard-tint' : 'border-rule'}`} to={`/items/${item.id}`}>
              <span className="font-mono">{item.position}</span>
              <span>{item.title}</span>
              {item.id === row.currentItemId ? <Tag tone="hazard">Now</Tag> : <Tag>{item.status}</Tag>}
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}

type PublicItem = {
  id: string;
  position: string;
  title: string;
  status: string;
  commentsCloseAt: string | null;
  testimonyOpen: boolean;
  meeting: { id: string; label: string; videoProvider: string | null; videoRef: string | null; videoOffsetSec?: number | null; currentItemId: string | null; government: { shortName: string; colorToken: string; name: string }; body: { name: string } };
  matter: null | {
    id: string;
    title: string;
    caseNumber: string | null;
    summaryEn: string | null;
    summaryAutomated: boolean;
    events: { id: string; label: string; occurredAt: string | null; projectedFor: string | null }[];
    parcels: { id: string; parcelNumber: string; situsAddress: string | null }[];
    redline: null | { id: string; diff: RedlineSection[] };
  };
  translations: { lang: string; text: string; automated: boolean }[];
  documents: { id: string; title: string; kind: string; pages: { id: string; pageNumber: number }[] }[];
  comments: { id: string; name: string; position: string; body: string }[];
  motions: { id: string; text: string; result: string | null; mover: string | null; votes: { person: string; value: string }[] }[];
  conflicts: { id: string; person: string; statement: string; chairRuling: string | null }[];
};

export function ItemPage() {
  const { id = '' } = useParams();
  const item = useQuery({ queryKey: ['item', id], queryFn: () => api<PublicItem>(`/public/items/${id}`) });
  const [lang, setLang] = useState('EN');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; answered: boolean; citations: { pageId: string; documentTitle: string; pageNumber: number; quote: string }[] } | null>(null);
  const [pageHtml, setPageHtml] = useState('');
  const [message, setMessage] = useState('');
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState('');

  if (item.isLoading) return <p>Loading item.</p>;
  if (!item.data) return <EmptyState title="Item not published" body="This item is not on a public meeting." />;
  const row = item.data;
  const closed = row.commentsCloseAt ? new Date(row.commentsCloseAt).getTime() < Date.now() : false;
  const summary = lang === 'EN' ? row.matter?.summaryEn : row.translations.find((translation) => translation.lang === lang)?.text;
  const automated = lang === 'EN' ? row.matter?.summaryAutomated && !row.matter.summaryEn : row.translations.find((translation) => translation.lang === lang)?.automated;
  const points = (row.matter?.events ?? []).map((event) => ({
    id: event.id,
    label: event.label,
    state: event.occurredAt ? 'done' as const : event.projectedFor ? 'projected' as const : 'now' as const,
  }));

  async function ask(event: FormEvent) {
    event.preventDefault();
    const result = await api<NonNullable<typeof answer>>('/public/ask', {
      method: 'POST',
      body: JSON.stringify({ question, matterId: row.matter?.id }),
    });
    setAnswer(result);
    const first = result.citations[0];
    if (first) {
      const page = await api<{ html: string }>(`/public/pages/${first.pageId}`);
      setPageHtml(page.html);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/public/items/${row.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          position: form.get('position'),
          body: form.get('body'),
          turnstileToken: 'test-pass',
        }),
      });
      setMessage('Comment received.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Comment was not accepted');
    }
  }

  async function speak(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/public/items/${row.id}/speakers`, {
        method: 'POST',
        body: JSON.stringify({
          displayName: form.get('displayName'),
          mode: form.get('mode'),
          phone: form.get('phone') || undefined,
          turnstileToken: 'test-pass',
        }),
      });
      setMessage('You are on the speaker list.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign-up was not accepted');
    }
  }

  return (
    <article className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-rule bg-paper py-3">
        <span className="font-mono">{row.position}</span>
        <h1 className="font-display text-3xl">{row.title}</h1>
        <Tag tone={row.id === row.meeting.currentItemId ? 'hazard' : 'water'}>{row.status}</Tag>
        {row.commentsCloseAt ? <span className="text-hazard-ink">Comments close {new Date(row.commentsCloseAt).toLocaleString()}</span> : null}
        {row.matter ? <Link className="inline-flex min-h-11 items-center text-chart-blue" to={`/follow?matterId=${row.matter.id}`}>Follow</Link> : null}
      </div>
      <GovMark token={row.meeting.government.colorToken} label={`${row.meeting.government.shortName} · ${row.meeting.body.name}`} />
      {points.length > 0 ? <CourseLine points={points} /> : null}
      <section>
        <h2 className="font-display text-2xl">Plain language</h2>
        <div className="flex gap-2" role="group" aria-label="Summary language">
          {['EN', 'TL', 'ES'].map((code) => (
            <Button key={code} type="button" variant={lang === code ? 'primary' : 'secondary'} onClick={() => setLang(code)}>{code}</Button>
          ))}
        </div>
        {automated ? <p className="text-hazard-ink">Automated{lang === 'EN' ? ' summary, pending staff approval' : ' translation'}</p> : null}
        <p>{summary ?? 'No approved summary yet.'}</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={ask} className="space-y-3">
          <h2 className="font-display text-2xl">Ask</h2>
          <label htmlFor="item-ask">Question about this matter</label>
          <textarea id="item-ask" required minLength={3} value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-24 w-full rounded-md border border-rule p-3" />
          <Button type="submit">Ask</Button>
          {answer ? (
            <div>
              <Tag tone="hazard">Automated</Tag>
              <p>{answer.answer}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {answer.citations.map((cite, index) => (
                  <CitationChip key={cite.pageId} index={index + 1} label={`${cite.documentTitle} p. ${cite.pageNumber}`} />
                ))}
              </div>
            </div>
          ) : null}
        </form>
        <div>
          <h2 className="font-display text-2xl">Cited page</h2>
          {pageHtml ? <CitedPage html={extractArticle(pageHtml)} quote={answer?.citations[0]?.quote} /> : <p className="text-ink-muted">A cited page opens beside the answer.</p>}
        </div>
      </section>
      {row.matter?.redline ? (
        <section>
          <h2 className="font-display text-2xl">What changed</h2>
          <Redline sections={Array.isArray(row.matter.redline.diff) ? row.matter.redline.diff : []} />
        </section>
      ) : null}
      <section>
        <h2 className="font-display text-2xl">Packet</h2>
        {row.documents.map((document) => (
          <div key={document.id} className="border-b border-rule py-2">
            <button type="button" className="min-h-11 font-display" aria-expanded={openDoc === document.id} onClick={() => {
              setOpenDoc(document.id);
              const page = document.pages[0];
              if (page) void api<{ html: string }>(`/public/pages/${page.id}`).then((payload) => setDocHtml(extractArticle(payload.html)));
            }}>
              {document.title}
            </button>
            {openDoc === document.id ? <CitedPage html={docHtml} /> : null}
          </div>
        ))}
      </section>
      {row.motions.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl">Vote</h2>
          {row.motions.map((motion) => (
            <div key={motion.id}>
              <p>{motion.text}</p>
              <ul>{motion.votes.map((vote) => <li key={vote.person}>{vote.person}: {vote.value}</li>)}</ul>
            </div>
          ))}
        </section>
      ) : null}
      {row.conflicts.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl">Conflict declarations</h2>
          <ul>{row.conflicts.map((conflict) => <li key={conflict.id}>{conflict.person}: {conflict.statement} ({conflict.chairRuling ?? 'ruling pending'})</li>)}</ul>
        </section>
      ) : null}
      <section>
        <h2 className="font-display text-2xl">Speak at the hearing</h2>
        {row.testimonyOpen ? (
          <form onSubmit={speak} className="grid max-w-lg gap-3">
            <label htmlFor="speaker-name">Name</label>
            <Input id="speaker-name" name="displayName" required />
            <label htmlFor="speaker-mode">Mode</label>
            <Select id="speaker-mode" name="mode" defaultValue="IN_PERSON">
              <option value="IN_PERSON">In person</option>
              <option value="PHONE">Phone</option>
            </Select>
            <label htmlFor="speaker-phone">Phone, if calling in</label>
            <Input id="speaker-phone" name="phone" />
            <Button type="submit">Join the queue</Button>
          </form>
        ) : <p>Testimony sign-up is closed.</p>}
      </section>
      <section>
        <h2 className="font-display text-2xl">Comment</h2>
        {closed ? <p>Comments are closed.</p> : (
          <form onSubmit={comment} className="grid max-w-lg gap-3">
            <label htmlFor="comment-name">Name</label>
            <Input id="comment-name" name="name" required />
            <label htmlFor="comment-position">Position</label>
            <Select id="comment-position" name="position" defaultValue="NEUTRAL">
              <option value="SUPPORT">Support</option>
              <option value="OPPOSE">Oppose</option>
              <option value="NEUTRAL">Neutral</option>
            </Select>
            <label htmlFor="comment-body">Comment</label>
            <textarea id="comment-body" name="body" required className="min-h-28 rounded-md border border-rule p-3" />
            <Button type="submit">Submit comment</Button>
          </form>
        )}
        <ul className="mt-4 space-y-2">
          {row.comments.map((comment) => (
            <li key={comment.id} className="rounded-md border border-rule p-3"><strong>{comment.name}</strong> · {comment.position}<p>{comment.body}</p></li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Affected parcels</h2>
        {(row.matter?.parcels.length ?? 0) === 0 ? <p>No parcels are linked.</p> : (
          <ul>
            {row.matter?.parcels.map((parcel) => <li key={parcel.id}>{parcel.parcelNumber} · {parcel.situsAddress ?? 'Address not recorded'}</li>)}
          </ul>
        )}
        <p className="text-sm text-ink-muted">Parcel geometry is matched for notices. A basemap is not configured for this portal.</p>
      </section>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}

function extractArticle(html: string): string {
  const match = html.match(/<article[\s\S]*<\/article>/i);
  return match?.[0] ?? html;
}

export function MatterPage() {
  const { id = '' } = useParams();
  const matter = useQuery({
    queryKey: ['matter', id],
    queryFn: () => api<{ id: string; title: string; caseNumber: string | null; kind: string; summaryEn: string | null; government: { name: string; shortName: string; colorToken: string }; events: { id: string; label: string; occurredAt: string | null; projectedFor: string | null }[]; items: { id: string; title: string; label: string }[] }>(`/public/matters/${id}`),
  });
  if (!matter.data) return <p>Loading matter.</p>;
  return (
    <article className="space-y-4">
      <h1 className="font-display text-4xl">{matter.data.title}</h1>
      <GovMark token={matter.data.government.colorToken} label={matter.data.government.name} />
      <p className="font-mono">{matter.data.caseNumber ?? matter.data.kind}</p>
      <p>{matter.data.summaryEn ?? 'Summary is not approved for the public record.'}</p>
      <CourseLine points={matter.data.events.map((event) => ({ id: event.id, label: event.label, state: event.occurredAt ? 'done' : event.projectedFor ? 'projected' : 'now' }))} />
      <ul>
        {matter.data.items.map((item) => <li key={item.id}><Link className="text-chart-blue" to={`/items/${item.id}`}>{item.label} · {item.title}</Link></li>)}
      </ul>
    </article>
  );
}

export function FollowPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState('');
  const matterId = params.get('matterId') ?? '';
  const confirm = params.get('confirm');
  useEffect(() => {
    if (!confirm) return;
    void api(`/public/subscriptions/confirm?token=${encodeURIComponent(confirm)}`).then(() => setMessage('Subscription confirmed.')).catch((err: Error) => setMessage(err.message));
  }, [confirm]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get('kind'));
    await api('/public/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        matterId: kind === 'MATTER' ? form.get('matterId') : undefined,
        channels: [form.get('channel')],
        email: form.get('email') || undefined,
        phone: form.get('phone') || undefined,
      }),
    });
    setMessage('Check your email or phone to confirm. Nothing is sent until you do.');
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Follow</h1>
      <p>One resident account covers the City, the Borough, and Saxman. Confirming a follow is a second step.</p>
      <form onSubmit={submit} className="grid max-w-lg gap-3">
        <label htmlFor="follow-kind">What to follow</label>
        <Select id="follow-kind" name="kind" defaultValue={matterId ? 'MATTER' : 'DIGEST'}>
          <option value="MATTER">A matter</option>
          <option value="BODY">A body</option>
          <option value="DIGEST">Weekly digest</option>
          <option value="TOPIC">A topic</option>
        </Select>
        <label htmlFor="follow-matter">Matter id</label>
        <Input id="follow-matter" name="matterId" defaultValue={matterId} />
        <label htmlFor="follow-email">Email</label>
        <Input id="follow-email" name="email" type="email" />
        <label htmlFor="follow-phone">Phone</label>
        <Input id="follow-phone" name="phone" />
        <label htmlFor="follow-channel">Channel</label>
        <Select id="follow-channel" name="channel" defaultValue="EMAIL">
          <option value="EMAIL">Email</option>
          <option value="SMS">Text</option>
        </Select>
        <Button type="submit">Send confirmation</Button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function NoticesPage({ region }: { region?: Region }) {
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/public/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'ADDRESS',
        address: form.get('address'),
        radiusFt: Number(form.get('radiusFt')),
        channels: ['EMAIL'],
        email: form.get('email'),
      }),
    });
    setMessage('Confirm the notice from your email. The mailed radius on a hearing stays “rule not configured” until that government sets one.');
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Hearings near an address</h1>
      <p>Geocoding uses the Borough parcel layer first. {region ? `${region.name} governments share this list.` : ''}</p>
      <form onSubmit={submit} className="grid max-w-lg gap-3">
        <label htmlFor="notice-address">Address</label>
        <Input id="notice-address" name="address" required />
        <label htmlFor="notice-radius">Radius in feet</label>
        <Input id="notice-radius" name="radiusFt" type="number" min={100} defaultValue={500} required />
        <label htmlFor="notice-email">Email</label>
        <Input id="notice-email" name="email" type="email" required />
        <Button type="submit">Request address notices</Button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function AccountPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  async function magic(event: FormEvent) {
    event.preventDefault();
    await api('/auth/resident/magic', { method: 'POST', body: JSON.stringify({ email }) });
    setMessage('If that email can receive mail, a sign-in link is on its way.');
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    await api('/auth/resident/magic/verify', { method: 'POST', body: JSON.stringify({ token }) });
    setMessage('Signed in.');
  }
  async function sms(event: FormEvent) {
    event.preventDefault();
    await api('/auth/resident/sms', { method: 'POST', body: JSON.stringify({ phone }) });
    setMessage('A code was sent.');
  }
  async function smsVerify(event: FormEvent) {
    event.preventDefault();
    await api('/auth/resident/sms/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });
    setMessage('Signed in.');
  }
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Account</h1>
      <form onSubmit={magic} className="grid max-w-lg gap-3">
        <label htmlFor="account-email">Email magic link</label>
        <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Button type="submit">Email me a link</Button>
      </form>
      <form onSubmit={verify} className="grid max-w-lg gap-3">
        <label htmlFor="account-token">Paste the link token</label>
        <Input id="account-token" value={token} onChange={(event) => setToken(event.target.value)} />
        <Button type="submit">Verify email</Button>
      </form>
      <form onSubmit={sms} className="grid max-w-lg gap-3">
        <label htmlFor="account-phone">Phone</label>
        <Input id="account-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <Button type="submit">Text me a code</Button>
      </form>
      <form onSubmit={smsVerify} className="grid max-w-lg gap-3">
        <label htmlFor="account-code">SMS code</label>
        <Input id="account-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
        <Button type="submit">Verify code</Button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function DataPage() {
  return (
    <article className="space-y-4">
      <h1 className="font-display text-4xl">Open data</h1>
      <p>Version 1 addresses do not break. New fields may appear. These routes need no account and allow cross-origin reads.</p>
      <ul className="space-y-2 font-mono text-sm">
        <li><a className="text-chart-blue" href="/api/v1/meetings.json">/api/v1/meetings.json</a></li>
        <li>/api/v1/meetings/:id.json</li>
        <li>/api/v1/items/:id.json</li>
        <li>/api/v1/matters/:id.json</li>
        <li><a className="text-chart-blue" href="/api/v1/votes.json">/api/v1/votes.json</a></li>
      </ul>
      <p>Accepted votes only. Draft minutes and unaccepted motions are not in this feed.</p>
    </article>
  );
}
