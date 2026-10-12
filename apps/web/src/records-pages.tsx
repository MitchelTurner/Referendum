import { Button, EmptyState, GovMark, Input, Select, Tag } from '@referendum/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Region } from './api';
import { useActor } from './staff-pages';

type Filed = { trackingNumber: string; dueAt: string | null; deadlineConfigured: boolean };
type Tracked = Filed & {
  status: string;
  description: string;
  publishedAt: string | null;
  denialReason: string | null;
  government: { name: string; shortName: string; colorToken: string };
  releases: { id: string; title: string; body: string }[];
};
type Published = Tracked & { id: string };
type StaffRequest = {
  id: string;
  trackingNumber: string;
  requesterName: string;
  requesterEmail: string;
  description: string;
  status: string;
  dueAt: string | null;
  deadlineConfigured: boolean;
  denialReason: string | null;
  publishedAt: string | null;
  government: { shortName: string; name: string; colorToken: string };
  releases: { id: string; title: string; body: string; published: boolean }[];
};

function deadlineCopy(configured: boolean, dueAt: string | null) {
  if (!configured || !dueAt) return 'Response deadline not configured';
  return `Response due ${new Date(dueAt).toLocaleDateString()}`;
}

export function RecordsPage({ region }: { region?: Region }) {
  const [filed, setFiled] = useState<Filed | null>(null);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [message, setMessage] = useState('');
  const published = useQuery({ queryKey: ['records-published'], queryFn: () => api<Published[]>('/public/records/published') });
  const governments = (region?.governments ?? []).filter((government) => government.modules.includes('RECORDS'));
  if (!region) return <p>Loading records.</p>;

  async function file(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<Filed>('/public/records', {
        method: 'POST',
        body: JSON.stringify({
          governmentId: form.get('governmentId'),
          name: form.get('name'),
          email: form.get('email'),
          description: form.get('description'),
          turnstileToken: 'test-pass',
        }),
      });
      setFiled(result);
      setMessage(`Request ${result.trackingNumber} is filed. Keep the number and the email you used.`);
    } catch (err) {
      setFiled(null);
      setMessage(err instanceof Error ? err.message : 'Could not file the request');
    }
  }

  async function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      trackingNumber: String(form.get('trackingNumber') ?? ''),
      email: String(form.get('email') ?? ''),
    });
    try {
      setTracked(await api<Tracked>(`/public/records/track?${params.toString()}`));
      setMessage('');
    } catch (err) {
      setTracked(null);
      setMessage(err instanceof Error ? err.message : 'Request not found');
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">Public records requests</h1>
        <p className="max-w-prose text-ink-muted">File a request with one government. A response is public only after staff publish it. The response deadline stays unconfigured until that government sets one.</p>
      </header>
      {governments.length === 0 ? <EmptyState title="Records requests are off" body="None of the governments in this region have the records module turned on." /> : (
        <form onSubmit={file} className="grid max-w-lg gap-3">
          <label htmlFor="records-government">Government</label>
          <Select id="records-government" name="governmentId" required>
            {governments.map((government) => <option key={government.id} value={government.id}>{government.name}</option>)}
          </Select>
          <label htmlFor="records-name">Name</label>
          <Input id="records-name" name="name" required />
          <label htmlFor="records-email">Email</label>
          <Input id="records-email" name="email" type="email" required />
          <label htmlFor="records-description">What records do you want?</label>
          <textarea id="records-description" name="description" required className="min-h-28 rounded-md border border-rule p-3" />
          <Button type="submit">File request</Button>
        </form>
      )}
      {filed ? <p role="status">{message} {deadlineCopy(filed.deadlineConfigured, filed.dueAt)}.</p> : null}
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Track a request</h2>
        <form onSubmit={track} className="grid max-w-lg gap-3">
          <label htmlFor="track-number">Tracking number</label>
          <Input id="track-number" name="trackingNumber" required />
          <label htmlFor="track-email">Email used on the request</label>
          <Input id="track-email" name="email" type="email" required />
          <Button type="submit" variant="secondary">Look up</Button>
        </form>
        {tracked ? (
          <article className="rounded-md border border-rule p-4">
            <GovMark token={tracked.government.colorToken} label={tracked.government.name} />
            <p className="font-mono">{tracked.trackingNumber}</p>
            <Tag>{tracked.status}</Tag>
            <p>{deadlineCopy(tracked.deadlineConfigured, tracked.dueAt)}</p>
            <p>{tracked.description}</p>
            {tracked.denialReason ? <p>Denial: {tracked.denialReason}</p> : null}
            {tracked.releases.map((release) => (
              <section key={release.id}>
                <h3 className="font-display text-xl">{release.title}</h3>
                <p>{release.body}</p>
              </section>
            ))}
          </article>
        ) : null}
        {message && !filed ? <p role="status">{message}</p> : null}
      </section>
      <section>
        <h2 className="font-display text-2xl">Published responses</h2>
        {(published.data ?? []).length === 0 ? <p>No responses are published yet.</p> : (
          <ul className="m-0 list-none space-y-3 p-0">
            {(published.data ?? []).map((request) => (
              <li key={request.id} className="rounded-md border border-rule p-4">
                <GovMark token={request.government.colorToken} label={request.government.shortName} />
                <p className="font-mono">{request.trackingNumber}</p>
                <p>{request.description}</p>
                {request.releases.map((release) => <p key={release.id}><strong>{release.title}.</strong> {release.body}</p>)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function StaffRecordsPage() {
  const me = useActor();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get('request');
  const records = useQuery({
    queryKey: ['staff-records'],
    queryFn: () => api<StaffRequest[]>('/staff/records'),
    enabled: Boolean(me.data),
  });
  const [message, setMessage] = useState('');
  if (me.isLoading) return <p>Checking session.</p>;
  if (me.isError) return <p>Sign in to work the records queue.</p>;
  const current = (records.data ?? []).find((request) => request.id === selected) ?? null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(`/staff/records/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: form.get('status'), denialReason: form.get('denialReason') || null }),
      });
      await client.invalidateQueries({ queryKey: ['staff-records'] });
      setMessage('Request updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update the request');
    }
  }

  async function addRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/staff/records/${current.id}/releases`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), body: form.get('body') }),
      });
      formElement.reset();
      await client.invalidateQueries({ queryKey: ['staff-records'] });
      setMessage('Response saved. It stays off the public log until you publish.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save the response');
    }
  }

  async function publish() {
    if (!current) return;
    try {
      await api(`/staff/records/${current.id}/publish`, { method: 'POST' });
      await client.invalidateQueries({ queryKey: ['staff-records'] });
      setMessage('Response published.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not publish the response');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div>
        <h1 className="font-display text-3xl">Records queue</h1>
        <ul className="m-0 list-none p-0">
          {(records.data ?? []).map((request) => (
            <li key={request.id}>
              <button type="button" className="min-h-11 text-left" onClick={() => setParams({ request: request.id })}>
                {request.trackingNumber} · {request.government.shortName}
              </button>
            </li>
          ))}
        </ul>
        {(records.data ?? []).length === 0 ? <EmptyState title="No requests" body="Filed requests land here. The public log stays empty until a response is published." /> : null}
      </div>
      {current ? (
        <div className="space-y-4">
          <GovMark token={current.government.colorToken} label={current.government.name} />
          <h2 className="font-display text-2xl">{current.trackingNumber}</h2>
          <p>{current.requesterName} · {current.requesterEmail}</p>
          <p>{current.description}</p>
          <p className="text-hazard-ink">{deadlineCopy(current.deadlineConfigured, current.dueAt)}</p>
          <form onSubmit={save} className="grid max-w-lg gap-3">
            <label htmlFor="records-status">Status</label>
            <Select id="records-status" name="status" defaultValue={current.status}>
              {['RECEIVED', 'IN_PROGRESS', 'NEED_INFO', 'FULFILLED', 'DENIED', 'WITHDRAWN'].map((status) => <option key={status}>{status}</option>)}
            </Select>
            <label htmlFor="records-denial">Denial reason, if denied</label>
            <textarea id="records-denial" name="denialReason" defaultValue={current.denialReason ?? ''} className="min-h-20 rounded-md border border-rule p-3" />
            <Button type="submit">Save</Button>
          </form>
          <ul>
            {current.releases.map((release) => <li key={release.id}>{release.title} · {release.published ? 'published' : 'draft'}</li>)}
          </ul>
          <form onSubmit={addRelease} className="grid max-w-lg gap-3">
            <label htmlFor="release-title">Response title</label>
            <Input id="release-title" name="title" required />
            <label htmlFor="release-body">Response</label>
            <textarea id="release-body" name="body" required className="min-h-28 rounded-md border border-rule p-3" />
            <Button type="submit" variant="secondary">Add response</Button>
          </form>
          <Button type="button" onClick={() => void publish()} disabled={current.publishedAt != null}>Publish response</Button>
          {message ? <p role="status">{message}</p> : null}
        </div>
      ) : <p>Choose a request.</p>}
    </div>
  );
}
