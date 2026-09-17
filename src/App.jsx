import { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
  Menu,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';

const modules = [
  { id: 'pocket', label: 'Pocket', icon: CircleDollarSign, description: 'Expenses, budgets & accounts' },
  { id: 'reminders', label: 'Reminders', icon: Bell, description: 'Tasks, dates & notifications' },
  { id: 'passwords', label: 'Passwords', icon: LockKeyhole, description: 'Private credentials vault' },
  { id: 'notes', label: 'Notes', icon: NotebookPen, description: 'Quick notes & lists' },
];

const sampleStats = [
  { label: 'This month', value: '₹42,850', helper: 'Total spending', icon: WalletCards },
  { label: 'Upcoming', value: '6', helper: 'Reminders', icon: Bell },
  { label: 'Vault', value: '18', helper: 'Saved passwords', icon: LockKeyhole },
  { label: 'Notes', value: '24', helper: 'Personal notes', icon: NotebookPen },
];

function App() {
  const [active, setActive] = useState('pocket');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const activeModule = useMemo(() => modules.find((item) => item.id === active), [active]);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-title">Private Pocket</div>
            <div className="brand-subtitle">Personal workspace</div>
          </div>
          <button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="module-nav">
          <div className="nav-label">YOUR SPACE</div>
          {modules.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            return (
              <button
                key={item.id}
                className={`module-btn ${selected ? 'selected' : ''}`}
                onClick={() => {
                  setActive(item.id);
                  setMobileOpen(false);
                }}
              >
                <span className="module-icon"><Icon size={19} strokeWidth={1.9} /></span>
                <span className="module-copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <ChevronRight size={15} className="module-arrow" />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="privacy-card">
            <ShieldCheck size={18} />
            <div>
              <strong>Private mode</strong>
              <span>Only your account should access this app.</span>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="backdrop" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div>
              <div className="eyebrow">PERSONAL DASHBOARD</div>
              <h1>{activeModule?.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" aria-label="Search"><Search size={19} /></button>
            <button className="primary-btn" onClick={() => setShowQuickAdd(true)}><Plus size={17} /> Quick add</button>
          </div>
        </header>

        <section className="content">
          <div className="hero-row">
            <div>
              <span className="pill"><span className="status-dot" /> Private workspace</span>
              <h2>Everything personal,<br /><span>in one place.</span></h2>
              <p>Expenses, reminders, passwords and notes with one clean interface across your devices.</p>
            </div>
            <div className="date-card">
              <div className="date-label">TODAY</div>
              <div className="date-value">17 Sep 2026</div>
              <div className="date-helper">Your personal command center</div>
            </div>
          </div>

          <div className="stat-grid">
            {sampleStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <button className="stat-card" key={stat.label} onClick={() => {
                  const match = modules.find((m) => stat.helper.toLowerCase().includes(m.label.toLowerCase().slice(0, 4)));
                  if (match) setActive(match.id);
                }}>
                  <div className="stat-icon"><Icon size={18} /></div>
                  <div className="stat-meta"><span>{stat.label}</span><small>{stat.helper}</small></div>
                  <strong>{stat.value}</strong>
                </button>
              );
            })}
          </div>

          <div className="workspace-grid">
            <section className="panel large-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">MODULE</div>
                  <h3>{activeModule?.label}</h3>
                </div>
                <button className="text-btn" onClick={() => setShowQuickAdd(true)}>Add new <Plus size={15} /></button>
              </div>
              <div className="empty-state">
                <div className="empty-icon"><activeModule.icon size={25} /></div>
                <h4>{activeModule?.label} is ready</h4>
                <p>The foundation is in place. We’ll connect the real data and actions next.</p>
                <button className="primary-btn" onClick={() => setShowQuickAdd(true)}><Plus size={16} /> Create your first item</button>
              </div>
            </section>

            <section className="panel security-panel">
              <div className="panel-kicker">SECURITY FOUNDATION</div>
              <h3>Private by design.</h3>
              <p>Authentication and database rules will be enforced server-side before sensitive data is connected.</p>
              <div className="security-list">
                <div><Check size={16} /> Single-owner access</div>
                <div><Check size={16} /> Database row-level security</div>
                <div><Check size={16} /> Encrypted password vault</div>
                <div><Check size={16} /> Device-friendly PWA</div>
              </div>
            </section>
          </div>
        </section>
      </main>

      {showQuickAdd && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Quick add">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="panel-kicker">QUICK ADD</div>
                <h3>What do you want to create?</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowQuickAdd(false)}><X size={18} /></button>
            </div>
            <div className="quick-grid">
              {modules.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className="quick-option" onClick={() => { setActive(item.id); setShowQuickAdd(false); }}>
                    <span className="module-icon"><Icon size={20} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <ChevronRight size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
