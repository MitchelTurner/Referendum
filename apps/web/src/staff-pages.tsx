import { Button, EmptyState, InboxRow, Input, ReadinessBar, RollCall, Select, SpeakerTimer, Tag } from '@referendum/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, type Region } from './api';

type Actor = { id: string; email: string; name: string; memberships: { governmentId: string; role: string }[] };

export function useActor() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Actor>('/auth/staff/me'), retry: false });
}

export function StaffHome() {
  const me = useActor();
  if (me.isLoading) return <p>Checking session.</p>;
  if (me.isError) return <Login />;
  return <Inbox name={me.data?.name ?? 'Staff'} />;
}

function Login() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  async function start(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await api<{ challengeToken: string; enrollment?: { otpauth: string } }>('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setChallenge(result.challengeToken);
      setOtpauth(result.enrollment?.otpauth ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }
  async function finish(event: FormEvent) {
    event.preventDefault();
    await api('/auth/staff/totp', { method: 'POST', body: JSON.stringify({ challengeToken: challenge, code }) });
    await client.invalidateQueries({ queryKey: ['me'] });
  }
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-4xl">Staff sign in</h1>
      <form onSubmit={start} className="grid gap-3">
        <label htmlFor="staff-email">Email</label>
        <Input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="staff-password">Password</label>
        <Input id="staff-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Button type="submit">Continue</Button>
      </form>
      {challenge ? (
        <form onSubmit={finish} className="grid gap-3">
          <label htmlFor="staff-code">Authenticator code</label>
          {otpauth ? <p className="break-all font-mono text-sm">Enrollment key: {otpauth}</p> : null}
          <Input id="staff-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required />
          <Button type="submit">Sign in</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-hazard-ink">{error}</p> : null}
    </div>
  );
}

function Inbox({ name }: { name: string }) {
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api<{ id: string; dueLabel: string; title: string; context: string; action: string; href: string }[]>('/staff/inbox'),
  });
  const rows = inbox.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Needs you</h1>
      <p className="text-ink-muted">{name}. Press Command K or Control K to jump.</p>
      {rows.length === 0 ? <EmptyState title="Nothing waiting" body="Review steps, expiring terms, and failed jobs land here." /> : rows.map((row) => (
        <InboxRow key={row.id} dueLabel={row.dueLabel} title={row.title} context={row.context} action={row.action} href={row.href} />
      ))}
    </div>
  );
}

type StaffMeeting = {
  id: string;
  status: string;
  startsAt: string;
  location: string | null;
  body: { id: string; name: string; code: string; government: { id: string; shortName: string } };
  items: {
    id: string;
    position: string;
    title: string;
    status: string;
    reviews: { id: string; roleLabel: string; status: string; assignee: { email: string } | null; receivedAt: string | null }[];
  }[];
};

export function StaffMeetingPage() {
  const { id = '' } = useParams();
  const meeting = useQuery({ queryKey: ['staff-meeting', id], queryFn: () => api<StaffMeeting>(`/staff/meetings/${id}`) });
  const readiness = useQuery({
    queryKey: ['readiness', id],
    queryFn: () => api<{ publishAllowed: boolean; steps: { key: string; label: string; status: 'DONE' | 'BLOCKED' | 'NEXT' | 'PENDING'; blockers: string[] }[] }>(`/staff/meetings/${id}/readiness`),
  });
  const [message, setMessage] = useState('');
  async function publish() {
    try {
      await api(`/staff/meetings/${id}/publish-packet`, { method: 'POST' });
      setMessage('Packet published.');
    } catch (err) {
      const details = err instanceof ApiError ? err.details : {};
      const blockers = Array.isArray(details.blockers) ? details.blockers.join(' ') : '';
      setMessage(`${err instanceof Error ? err.message : 'Publish failed'} ${blockers}`);
    }
  }
  if (!meeting.data || !readiness.data) return <p>Loading meeting.</p>;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">{meeting.data.body.name}</h1>
      <p className="font-mono text-sm">{meeting.data.status}</p>
      <ReadinessBar steps={readiness.data.steps} />
      <div className="flex gap-3">
        <Button type="button" disabled={!readiness.data.publishAllowed} onClick={() => void publish()}>Publish packet</Button>
        <Link className="inline-flex min-h-11 items-center text-chart-blue" to={`/staff/live/${id}`}>Open live console</Link>
        <Link className="inline-flex min-h-11 items-center text-chart-blue" to={`/staff/minutes/${id}`}>Review minutes</Link>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Items and review routing</caption>
        <thead>
          <tr>
            <th className="border-b border-rule py-2">Item</th>
            <th className="border-b border-rule py-2">Status</th>
            <th className="border-b border-rule py-2">With</th>
          </tr>
        </thead>
        <tbody>
          {meeting.data.items.map((item) => {
            const holder = item.reviews.find((step) => step.status === 'PENDING' || step.status === 'IN_PROGRESS');
            return (
              <tr key={item.id}>
                <td className="py-2"><Link className="text-chart-blue" to={`/staff/items/${item.id}/edit`}>{item.position} {item.title}</Link></td>
                <td>{item.status}</td>
                <td>{holder ? `${holder.roleLabel}${holder.assignee ? ` · ${holder.assignee.email}` : ''}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ItemEditPage() {
  const { id = '' } = useParams();
  const item = useQuery({
    queryKey: ['staff-item', id],
    queryFn: () => api<{ id: string; title: string; position: string; status: string; reviews: { id: string; roleLabel: string; status: string }[]; documents: { id: string; title: string }[] }>(`/staff/items/${id}`),
  });
  const [message, setMessage] = useState('');
  if (!item.data) return <p>Loading item.</p>;
  async function decide(stepId: string, status: string) {
    await api(`/staff/items/${id}/reviews/${stepId}/decision`, { method: 'POST', body: JSON.stringify({ status }) });
    setMessage(`Marked ${status.toLowerCase()}.`);
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">{item.data.position} {item.data.title}</h1>
      <Tag>{item.data.status}</Tag>
      <ul className="space-y-2">
        {item.data.reviews.map((step) => (
          <li key={step.id} className="flex flex-wrap items-center gap-2">
            <span>{step.roleLabel}</span>
            <Tag>{step.status}</Tag>
            <Button type="button" variant="secondary" onClick={() => void decide(step.id, 'APPROVED')}>Approve</Button>
            <Button type="button" variant="secondary" onClick={() => void api(`/staff/items/${id}/reviews/${step.id}/nudge`, { method: 'POST' })}>Nudge</Button>
          </li>
        ))}
      </ul>
      <ul>{item.data.documents.map((document) => <li key={document.id}>{document.title}</li>)}</ul>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

type Timer = { running: boolean; remainingMs: number; durationSec: number };

export function LivePage() {
  const { meetingId = '' } = useParams();
  const meeting = useQuery({ queryKey: ['staff-meeting', meetingId], queryFn: () => api<StaffMeeting>(`/staff/meetings/${meetingId}`) });
  const [timer, setTimer] = useState<Timer>({ running: false, remainingMs: 180000, durationSec: 180 });
  const [motion, setMotion] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; value?: string }[]>([]);
  const [motionId, setMotionId] = useState('');
  useEffect(() => {
    void api<{ id: string; fullName: string }[]>('/staff/persons').then((rows) => setPeople(rows.map((person) => ({ id: person.id, name: person.fullName })))).catch(() => undefined);
  }, []);
  useEffect(() => {
    const tick = window.setInterval(() => {
      void api<Timer>(`/staff/live/${meetingId}/timer`).then(setTimer).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [meetingId]);
  async function timerAction(action: 'start' | 'pause' | 'reset') {
    setTimer(await api<Timer>(`/staff/live/${meetingId}/timer`, { method: 'POST', body: JSON.stringify({ action }) }));
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside>
        <h1 className="font-display text-2xl">Agenda</h1>
        <ul className="m-0 list-none p-0">
          {meeting.data?.items.map((item) => (
            <li key={item.id}>
              <button type="button" className="min-h-11 text-left" onClick={() => void api(`/staff/live/${meetingId}/current-item`, { method: 'POST', body: JSON.stringify({ agendaItemId: item.id }) })}>
                {item.position} {item.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="space-y-4">
        <h2 className="font-display text-3xl">Now speaking</h2>
        <SpeakerTimer remainingMs={timer.remainingMs} running={timer.running} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void timerAction('start')}>Start</Button>
          <Button type="button" variant="secondary" onClick={() => void timerAction('pause')}>Pause</Button>
          <Button type="button" variant="secondary" onClick={() => void timerAction('reset')}>Reset</Button>
          <Button type="button" variant="hazard" onClick={() => void api(`/staff/live/${meetingId}/speakers/next`, { method: 'POST' })}>Call next</Button>
        </div>
        <form className="grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          const itemId = meeting.data?.items[0]?.id;
          if (!itemId) return;
          void api<{ id: string }>(`/staff/live/${meetingId}/motions`, { method: 'POST', body: JSON.stringify({ agendaItemId: itemId, text: motion }) }).then((created) => setMotionId(created.id));
        }}>
          <label htmlFor="motion-text">Motion</label>
          <textarea id="motion-text" value={motion} onChange={(event) => setMotion(event.target.value)} className="min-h-24 rounded-md border border-rule p-3" />
          <Button type="submit">Record motion</Button>
        </form>
        <RollCall people={people} onVote={(personId, value) => {
          setPeople((current) => current.map((person) => person.id === personId ? { ...person, value } : person));
          if (motionId) void api(`/staff/live/${meetingId}/motions/${motionId}/votes`, { method: 'POST', body: JSON.stringify({ votes: [{ personId, value }] }) });
        }} />
      </div>
    </div>
  );
}

type DraftMotion = { id: string; text: string; source: string; acceptedByUserId: string | null; agendaItem: { position: string }; votes: { person: { fullName: string }; value: string; confidence: number | null }[] };

export function MinutesPage() {
  const { meetingId = '' } = useParams();
  const client = useQueryClient();
  const drafts = useQuery({ queryKey: ['minutes', meetingId], queryFn: () => api<DraftMotion[]>(`/staff/meetings/${meetingId}/minutes-draft`) });
  const [index, setIndex] = useState(0);
  const rows = drafts.data ?? [];
  const current = rows[index];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key.toLowerCase() === 'j') setIndex((value) => Math.min(rows.length - 1, value + 1));
      if (event.key.toLowerCase() === 'k') setIndex((value) => Math.max(0, value - 1));
      if (event.key.toLowerCase() === 'a' && current) void api(`/staff/motions/${current.id}/accept`, { method: 'POST' }).then(() => client.invalidateQueries({ queryKey: ['minutes', meetingId] }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, current, meetingId, rows.length]);
  if (!current) return <EmptyState title="No draft motions" body="Accepted motions are the only ones that can enter the minutes." />;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Minutes review</h1>
      <p className="font-mono text-sm">A accept · E edit · J next · K previous</p>
      <p className="font-mono">{current.agendaItem.position} · {current.source}</p>
      {current.source === 'ai_draft' && !current.acceptedByUserId ? <Tag tone="hazard">Automated draft</Tag> : null}
      <p className="text-xl">{current.text}</p>
      <ul>
        {current.votes.map((vote) => (
          <li key={vote.person.fullName}>{vote.person.fullName}: {vote.value}{vote.confidence != null && vote.confidence < 0.8 ? ' · low confidence' : ''}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void api(`/staff/motions/${current.id}/accept`, { method: 'POST' })}>Accept</Button>
        <Button type="button" variant="secondary" onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</Button>
        <Button type="button" variant="secondary" onClick={() => setIndex((value) => Math.min(rows.length - 1, value + 1))}>Next</Button>
      </div>
    </div>
  );
}

export function BoardsPage() {
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: () => api<{ id: string; name: string; code: string; government: string; seats: { id: string; label: string; vacant: boolean; current: { person: string; endsOn: string | null } | null; applications: { id: string; name: string; status: string }[] }[] }[]>('/staff/boards'),
  });
  const rows = boards.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Boards and seats</h1>
      {rows.length === 0 ? <EmptyState title="No seats yet" body="Joint City and Borough seats record who recommends, who appoints, and who confirms." /> : rows.map((body) => (
        <section key={body.id}>
          <h2 className="font-display text-2xl">{body.government} · {body.name}</h2>
          <ul>
            {body.seats.map((seat) => (
              <li key={seat.id}>{seat.label} · {seat.vacant ? 'Vacant' : seat.current?.person} · {seat.applications.length} applications</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function InsightsPage() {
  const insights = useQuery({
    queryKey: ['insights'],
    queryFn: () => api<{ top: { question: string; count: number; answered: boolean }[]; unanswered: { id: string; question: string }[] }>('/staff/insights/asks'),
  });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">What residents ask</h1>
      <ul>{(insights.data?.top ?? []).map((row) => <li key={row.question}>{row.count} · {row.question}</li>)}</ul>
      <h2 className="font-display text-2xl">Unanswered</h2>
      <ul>{(insights.data?.unanswered ?? []).map((row) => <li key={row.id}>{row.question}</li>)}</ul>
    </div>
  );
}

export function CompliancePage() {
  const snapshot = useQuery({
    queryKey: ['compliance'],
    queryFn: () => api<{ documents: { id: string; title: string; accessible: boolean; ocrUsed: boolean }[]; retention: { id: string; documentKind: string; configured: boolean; citation: string | null }[]; translations: { id: string; lang: string }[]; embedSnippet: string }>('/staff/compliance'),
  });
  const data = snapshot.data;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Compliance</h1>
      <h2 className="font-display text-2xl">Documents needing review</h2>
      <ul>{(data?.documents ?? []).map((document) => <li key={document.id}>{document.title} · {document.accessible ? 'HTML ready' : 'not accessible'}{document.ocrUsed ? ' · OCR used' : ''}</li>)}</ul>
      <h2 className="font-display text-2xl">Retention</h2>
      <ul>{(data?.retention ?? []).map((rule) => <li key={rule.id}>{rule.documentKind}: {rule.configured ? 'scheduled' : 'rule not configured'} {rule.citation ?? ''}</li>)}</ul>
      <h2 className="font-display text-2xl">Translations awaiting review</h2>
      <ul>{(data?.translations ?? []).map((row) => <li key={row.id}>{row.lang} · automated</li>)}</ul>
      <h2 className="font-display text-2xl">Embed</h2>
      <pre className="overflow-auto rounded-md bg-water p-3 font-mono text-sm">{data?.embedSnippet}</pre>
    </div>
  );
}

export function ImportsPage({ region }: { region?: Region }) {
  const imports = useQuery({ queryKey: ['imports'], queryFn: () => api<{ id: string; source: string; status: string; error: string | null }[]>('/staff/imports') });
  const [message, setMessage] = useState('');
  const governmentId = region?.governments[0]?.id ?? '';
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/staff/imports', { method: 'POST', body: JSON.stringify({ governmentId: form.get('governmentId'), source: form.get('source') }) });
    setMessage('Import queued.');
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Archive import</h1>
      <form onSubmit={start} className="grid max-w-lg gap-3">
        <label htmlFor="import-gov">Government</label>
        <Select id="import-gov" name="governmentId" defaultValue={governmentId}>
          {(region?.governments ?? []).map((government) => <option key={government.id} value={government.id}>{government.name}</option>)}
        </Select>
        <label htmlFor="import-source">Source</label>
        <Select id="import-source" name="source" defaultValue="pdf_folder">
          <option value="primegov">PrimeGov</option>
          <option value="civicplus_agendacenter">CivicPlus Agenda Center</option>
          <option value="pdf_folder">PDF folder</option>
        </Select>
        <Button type="submit">Start import</Button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <ul>{(imports.data ?? []).map((job) => <li key={job.id}>{job.source} · {job.status}{job.error ? ` · ${job.error}` : ''}</li>)}</ul>
    </div>
  );
}
