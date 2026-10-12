import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { govColor, tokens } from './tokens';

const focus =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-chart-blue';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'hazard' | 'quiet' }) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-chart-blue',
    secondary: 'bg-water text-ink border border-water-line hover:bg-paper',
    hazard: 'bg-hazard text-paper hover:bg-hazard-ink',
    quiet: 'bg-transparent text-chart-blue underline-offset-4 hover:underline',
  }[variant];
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 font-body text-base disabled:opacity-50 ${styles} ${focus} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-md border border-rule bg-paper px-3 font-body text-ink ${focus}`}
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 w-full rounded-md border border-rule bg-paper px-3 font-body text-ink ${focus}`}
      {...props}
    />
  );
}

export function Tag({ children, tone = 'water' }: { children: ReactNode; tone?: 'water' | 'buff' | 'hazard' }) {
  const styles = {
    water: 'bg-water text-ink border-water-line',
    buff: 'bg-buff text-ink border-buff-line',
    hazard: 'bg-hazard-tint text-hazard-ink border-hazard',
  }[tone];
  return <span className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-sm ${styles}`}>{children}</span>;
}

export function GovMark({ token, label }: { token: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-body text-ink">
      <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: govColor(token) }} />
      <span>{label}</span>
    </span>
  );
}

export type CoursePoint = { id: string; label: string; state: 'done' | 'now' | 'projected' };

export function CourseLine({ points }: { points: CoursePoint[] }) {
  return (
    <ol
      className="chart-grid m-0 list-none rounded-lg border border-buff-line p-4"
      aria-label="Course"
    >
      {points.map((point, index) => (
        <li key={point.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < points.length - 1 ? (
            <span
              aria-hidden
              className={`absolute left-[7px] top-4 h-[calc(100%-4px)] border-l-2 ${point.state === 'projected' ? 'border-dashed border-ink-muted' : 'border-solid border-ink'}`}
            />
          ) : null}
          <span
            aria-hidden
            className={
              point.state === 'now'
                ? 'relative z-10 mt-1 h-4 w-4 rounded-full bg-paper ring-4 ring-hazard'
                : point.state === 'done'
                  ? 'relative z-10 mt-1 h-4 w-4 rounded-full bg-ink'
                  : 'relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-ink bg-paper'
            }
          />
          <span>
            <span className="font-mono text-xs uppercase text-ink-muted">{point.state === 'done' ? 'fix' : point.state === 'projected' ? 'DR' : 'now'}</span>
            <span className="block font-body text-ink">{point.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export type ReadinessStepView = { key: string; label: string; status: 'DONE' | 'BLOCKED' | 'NEXT' | 'PENDING'; blockers: string[] };

export function ReadinessBar({ steps }: { steps: ReadinessStepView[] }) {
  return (
    <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-5">
      {steps.map((step, index) => (
        <li key={step.key} className="rounded-md border border-rule bg-paper p-3">
          <p className="font-mono text-xs text-ink-muted">
            {index + 1} · {step.status === 'BLOCKED' ? <span className="text-hazard-ink">Blocked</span> : step.status}
          </p>
          <p className="font-display text-ink">{step.label}</p>
          {step.blockers.length > 0 ? <p className="text-sm text-hazard-ink">{step.blockers.join(' ')}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function InboxRow({
  dueLabel,
  title,
  context,
  action,
  href,
}: {
  dueLabel: string;
  title: string;
  context: string;
  action: string;
  href: string;
}) {
  return (
    <a href={href} className={`flex min-h-11 flex-col gap-1 rounded-md border border-rule bg-paper p-3 hover:border-chart-blue ${focus}`}>
      <span className="font-mono text-sm text-hazard-ink">{dueLabel}</span>
      <span className="font-display text-lg text-ink">{title}</span>
      <span className="text-ink-muted">{context}</span>
      <span className="text-chart-blue">{action}</span>
    </a>
  );
}

export function CitationChip({ index, label }: { index: number; label: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-md border border-water-line bg-water px-2 font-mono text-sm text-ink">
      <span>[{index}]</span>
      <span>{label}</span>
    </span>
  );
}

export function CitedPage({ html, quote }: { html: string; quote?: string }) {
  const marked = quote ? html.replace(quote, `<mark>${quote}</mark>`) : html;
  return (
    <article className="max-w-none rounded-lg border border-water-line bg-paper p-4 font-body text-ink" dangerouslySetInnerHTML={{ __html: marked }} />
  );
}

export type RedlineOp = { type: 'eq' | 'ins' | 'del'; text: string };
export type RedlineSection = { section: string; ops: RedlineOp[] };

export function Redline({ sections }: { sections: RedlineSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.section}>
          <h3 className="font-mono text-sm text-ink-muted">{section.section}</h3>
          <p className="font-body leading-7 text-ink">
            {section.ops.map((op, index) => (
              <span
                key={`${section.section}-${index}`}
                className={op.type === 'ins' ? 'bg-water' : op.type === 'del' ? 'text-hazard-ink line-through' : undefined}
              >
                {op.text}
              </span>
            ))}
          </p>
        </section>
      ))}
    </div>
  );
}

export function LiveBar({
  label,
  government,
  itemTitle,
}: {
  label: string;
  government: string;
  itemTitle: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-hazard bg-hazard-tint px-4 py-3" aria-live="polite">
      <Tag tone="hazard">Live</Tag>
      <span className="font-mono text-sm text-ink">{label}</span>
      <span className="font-body text-ink">{government}</span>
      <span className="font-display text-ink">{itemTitle ?? 'Between items'}</span>
    </div>
  );
}

export function SpeakerTimer({ remainingMs, running }: { remainingMs: number; running: boolean }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return (
    <p className="font-mono text-4xl text-ink" aria-live="polite">
      {minutes}:{rest}
      <span className="ml-3 font-body text-base text-ink-muted">{running ? 'Running' : 'Paused'}</span>
    </p>
  );
}

export function RollCall({
  people,
  onVote,
}: {
  people: { id: string; name: string; value?: string }[];
  onVote?: (personId: string, value: string) => void;
}) {
  const values = ['YES', 'NO', 'ABSTAIN', 'ABSENT', 'RECUSED'];
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {people.map((person) => (
        <li key={person.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-40 font-body text-ink">{person.name}</span>
          {values.map((value) => (
            <Button
              key={value}
              type="button"
              variant={person.value === value ? 'primary' : 'secondary'}
              onClick={() => onVote?.(person.id, value)}
            >
              {value}
            </Button>
          ))}
        </li>
      ))}
    </ul>
  );
}

export type CommandItem = { id: string; label: string; hint?: string; onSelect: () => void };

export function CommandBar({
  open,
  query,
  onQuery,
  items,
  onClose,
}: {
  open: boolean;
  query: string;
  onQuery: (value: string) => void;
  items: CommandItem[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Command bar"
        className="mt-16 w-full max-w-xl rounded-lg border border-rule bg-paper p-3 shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Command"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          className={`min-h-11 w-full rounded-md border border-rule px-3 font-body ${focus}`}
          placeholder="Jump, create, or act"
        />
        <ul className="m-0 mt-2 max-h-80 list-none overflow-auto p-0">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left font-body text-ink hover:bg-water ${focus}`}
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                {item.hint ? <span className="font-mono text-sm text-ink-muted">{item.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-buff-line bg-buff/40 p-6">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Compass rose">
        <circle cx="32" cy="32" r="28" fill={tokens.color.paper} stroke={tokens.color.ink} strokeWidth="2" />
        <path d="M32 8l6 24-6 6-6-6 6-24z" fill={tokens.color.ink} />
        <path d="M32 56l-6-24 6-6 6 6-6 24z" fill={tokens.color.chartBlue} />
        <path d="M8 32l24-6 6 6-6 6-24-6z" fill={tokens.color.buff} stroke={tokens.color.ink} />
        <path d="M56 32l-24 6-6-6 6-6 24 6z" fill={tokens.color.water} stroke={tokens.color.ink} />
      </svg>
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="max-w-prose font-body text-ink-muted">{body}</p>
    </div>
  );
}
