import { CommandBar, Logo, type CommandItem } from '@referendum/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, type CalendarMeeting, type Region } from './api';
import { AccountPage, DataPage, FollowPage, HomePage, ItemPage, MatterPage, MeetingPage, NoticesPage } from './public-pages';
import { RecordsPage, StaffRecordsPage } from './records-pages';
import {
  BoardsPage,
  CompliancePage,
  ImportsPage,
  InsightsPage,
  ItemEditPage,
  LivePage,
  MinutesPage,
  StaffHome,
  StaffMeetingPage,
} from './staff-pages';

function Shell({ children, staff = false }: { children: React.ReactNode; staff?: boolean }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-rule bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to={staff ? '/staff' : '/'} className="flex items-center gap-3 text-paper">
            <Logo inverted size={40} />
            <span>
              <span className="block font-display text-xl">Referendum</span>
              <span className="font-mono text-xs text-water">Public meetings, on the record</span>
            </span>
          </Link>
          <nav aria-label={staff ? 'Staff' : 'Public'} className="flex flex-wrap gap-3 font-body">
            {staff ? (
              <>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff">Inbox</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff/records">Records</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff/boards">Boards</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff/insights">Insights</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff/compliance">Compliance</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff/imports">Imports</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/">Portal</NavLink>
              </>
            ) : (
              <>
                <NavLink className="min-h-11 inline-flex items-center" to="/records">Records</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/follow">Follow</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/notices">Notices</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/account">Account</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/data">Open data</NavLink>
                <NavLink className="min-h-11 inline-flex items-center" to="/staff">Staff</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const region = useQuery({ queryKey: ['region'], queryFn: () => api<Region>('/public/region') });
  const calendar = useQuery({ queryKey: ['calendar'], queryFn: () => api<CalendarMeeting[]>('/public/calendar') });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === '/' && !typing) {
        const ask = document.getElementById('ask');
        if (ask) {
          event.preventDefault();
          ask.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const meetings = (calendar.data ?? [])
      .filter((meeting) => meeting.label.toLowerCase().includes(query.toLowerCase()) || meeting.body.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
      .map((meeting) => ({
        id: meeting.id,
        label: meeting.label,
        hint: meeting.government.shortName,
        onSelect: () => navigate(`/meetings/${meeting.id}`),
      }));
    const actions: CommandItem[] = [
      { id: 'home', label: 'Public home', onSelect: () => navigate('/') },
      { id: 'staff', label: 'Needs you', hint: 'Staff', onSelect: () => navigate('/staff') },
      { id: 'data', label: 'Open data', onSelect: () => navigate('/data') },
      { id: 'records', label: 'Public records requests', onSelect: () => navigate('/records') },
      { id: 'boards', label: 'Boards and seats', onSelect: () => navigate('/staff/boards') },
    ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
    return [...actions, ...meetings];
  }, [calendar.data, navigate, query]);

  return (
    <>
      <CommandBar open={open} query={query} onQuery={setQuery} items={items} onClose={() => setOpen(false)} />
      <Routes>
        <Route path="/" element={<Shell><HomePage region={region.data} /></Shell>} />
        <Route path="/meetings/:id" element={<Shell><MeetingPage /></Shell>} />
        <Route path="/items/:id" element={<Shell><ItemPage /></Shell>} />
        <Route path="/matters/:id" element={<Shell><MatterPage /></Shell>} />
        <Route path="/follow" element={<Shell><FollowPage /></Shell>} />
        <Route path="/notices" element={<Shell><NoticesPage region={region.data} /></Shell>} />
        <Route path="/account" element={<Shell><AccountPage /></Shell>} />
        <Route path="/data" element={<Shell><DataPage /></Shell>} />
        <Route path="/records" element={<Shell><RecordsPage region={region.data} /></Shell>} />
        <Route path="/staff" element={<Shell staff><StaffHome /></Shell>} />
        <Route path="/staff/meetings/:id" element={<Shell staff><StaffMeetingPage /></Shell>} />
        <Route path="/staff/items/:id/edit" element={<Shell staff><ItemEditPage /></Shell>} />
        <Route path="/staff/live/:meetingId" element={<Shell staff><LivePage /></Shell>} />
        <Route path="/staff/minutes/:meetingId" element={<Shell staff><MinutesPage /></Shell>} />
        <Route path="/staff/boards" element={<Shell staff><BoardsPage /></Shell>} />
        <Route path="/staff/records" element={<Shell staff><StaffRecordsPage /></Shell>} />
        <Route path="/staff/insights" element={<Shell staff><InsightsPage /></Shell>} />
        <Route path="/staff/compliance" element={<Shell staff><CompliancePage /></Shell>} />
        <Route path="/staff/imports" element={<Shell staff><ImportsPage region={region.data} /></Shell>} />
      </Routes>
    </>
  );
}
