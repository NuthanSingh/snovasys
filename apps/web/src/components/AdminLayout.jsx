import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/admin/dashboard', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/transactions', label: 'Transactions' },
  { to: '/admin/onboarding', label: 'Onboarding' },
  { to: '/admin/audit-logs', label: 'Audit log' },
  { to: '/admin/profile', label: 'Profile' },
];

export default function AdminLayout() {
  return (
    <div className="workspace-layout admin-workspace">
      <aside className="workspace-sidebar">
        <p className="sidebar-label">ADMINISTRATION</p>
        <nav className="sidebar-nav" aria-label="Administrator dashboard">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="workspace-content"><Outlet /></div>
    </div>
  );
}