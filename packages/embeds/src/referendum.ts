const PAPER = '#FBFAF5';
const INK = '#0B2545';
const MUTED = '#3D4F63';
const BLUE = '#1F5A8A';
const WATER = '#DCEBF4';
const HAZARD = '#6E0E55';
const RULE = '#D9DED9';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] ?? char;
  });
}

function apiOrigin(): string {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) return new URL(script.src).origin;
  return window.location.origin;
}

function styles(): string {
  return `
    :host { display: block; max-width: 100%; color: ${INK}; font-family: "Atkinson Hyperlegible", "Segoe UI", sans-serif; font-size: 16px; }
    * { box-sizing: border-box; }
    a, button { min-height: 44px; }
    a { color: ${BLUE}; }
    .panel { background: ${PAPER}; border: 1px solid ${RULE}; border-radius: 8px; padding: 12px; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; color: ${MUTED}; }
    .row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid ${RULE}; }
    .swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; }
    button, .link {
      display: inline-flex; align-items: center; background: ${INK}; color: ${PAPER};
      border: 0; border-radius: 6px; padding: 8px 12px; text-decoration: none;
    }
    input, textarea { width: 100%; min-height: 44px; border: 1px solid ${RULE}; border-radius: 6px; padding: 8px; background: ${PAPER}; color: ${INK}; }
    .cite { background: ${WATER}; padding: 8px; border-radius: 6px; margin-top: 8px; }
    .auto { color: ${HAZARD}; font-size: 13px; }
  `;
}

function mount(host: HTMLElement, html: string): void {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles()}</style>${html}`;
}

type MeetingRow = {
  id: string;
  label: string;
  startsAt: string;
  governmentShortName?: string;
  government?: string;
  body?: string;
  status: string;
};

class RefCalendar extends HTMLElement {
  connectedCallback(): void {
    void this.render();
  }

  async render(): Promise<void> {
    const region = this.getAttribute('region') ?? 'ketchikan';
    const filter = (this.getAttribute('governments') ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    mount(this, `<div class="panel"><p class="mono">Loading calendar</p></div>`);
    try {
      const response = await fetch(`${apiOrigin()}/api/v1/meetings.json`);
      const rows = (await response.json()) as MeetingRow[];
      const shown = rows.filter((row) => {
        if (filter.length === 0) return true;
        const name = (row.governmentShortName ?? row.government ?? '').toLowerCase();
        return filter.some((part) => name.includes(part));
      });
      const body =
        shown.length === 0
          ? `<p>No published meetings for ${region}.</p>`
          : shown
              .map(
                (row) => `<div class="row">
                  <span class="swatch" style="background:${INK}"></span>
                  <div>
                    <div class="mono">${escapeHtml(row.label)}</div>
                    <div>${escapeHtml(row.governmentShortName ?? row.government ?? '')} · ${escapeHtml(row.body ?? row.status)}</div>
                  </div>
                </div>`,
              )
              .join('');
      mount(this, `<div class="panel" aria-label="Meeting calendar">${body}</div>`);
    } catch {
      mount(this, `<div class="panel"><p>Calendar is unavailable.</p></div>`);
    }
  }
}

class RefItem extends HTMLElement {
  connectedCallback(): void {
    void this.render();
  }

  async render(): Promise<void> {
    const id = this.getAttribute('item-id');
    if (!id) {
      mount(this, `<div class="panel"><p>Missing item id.</p></div>`);
      return;
    }
    mount(this, `<div class="panel"><p class="mono">Loading item</p></div>`);
    try {
      const response = await fetch(`${apiOrigin()}/api/v1/items/${id}.json`);
      const item = (await response.json()) as {
        title?: string;
        position?: string;
        events?: { label: string; occurredAt: string | null; projectedFor: string | null }[];
      };
      const events = (item.events ?? [])
        .map((event) => `<li>${event.occurredAt ? 'fix' : event.projectedFor ? 'DR' : 'now'} · ${escapeHtml(event.label)}</li>`)
        .join('');
      const portal = `${apiOrigin()}/items/${id}`;
      mount(
        this,
        `<div class="panel">
          <p class="mono">${escapeHtml(item.position ?? '')}</p>
          <h2 style="font-size:1.25rem;margin:0 0 8px">${escapeHtml(item.title ?? 'Item')}</h2>
          <ol>${events}</ol>
          <a class="link" href="${portal}" target="_blank" rel="noopener noreferrer">Follow on Referendum</a>
        </div>`,
      );
    } catch {
      mount(this, `<div class="panel"><p>This item is unavailable.</p></div>`);
    }
  }
}

class RefAsk extends HTMLElement {
  connectedCallback(): void {
    const matter = this.getAttribute('matter-id') ?? '';
    mount(
      this,
      `<form class="panel">
        <label for="q">Ask the packet</label>
        <textarea id="q" name="question" required minlength="3"></textarea>
        <p><button type="submit">Ask</button></p>
        <div class="answer" aria-live="polite"></div>
        <input type="hidden" name="matterId" value="${matter}" />
      </form>`,
    );
    const form = this.shadowRoot?.querySelector('form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.ask();
    });
  }

  async ask(): Promise<void> {
    const question = this.shadowRoot?.querySelector('textarea')?.value ?? '';
    const matterId = this.getAttribute('matter-id') || undefined;
    const answer = this.shadowRoot?.querySelector('.answer');
    if (answer) answer.textContent = 'Looking through the packet…';
    const response = await fetch(`${apiOrigin()}/public/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, matterId }),
    });
    const json = (await response.json()) as {
      answer?: string;
      answered?: boolean;
      citations?: { documentTitle: string; pageNumber: number; quote: string }[];
    };
    if (!answer) return;
    const cites = (json.citations ?? [])
      .map(
        (cite, index) =>
          `<div class="cite">[${index + 1}] ${escapeHtml(cite.documentTitle)} p. ${cite.pageNumber} — ${escapeHtml(cite.quote)}</div>`,
      )
      .join('');
    answer.innerHTML = `<p class="auto">Automated</p><p>${escapeHtml(json.answer ?? 'No answer')}</p>${cites}`;
  }
}

if (!customElements.get('ref-calendar')) customElements.define('ref-calendar', RefCalendar);
if (!customElements.get('ref-item')) customElements.define('ref-item', RefItem);
if (!customElements.get('ref-ask')) customElements.define('ref-ask', RefAsk);

export {};
