import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/onboarding', label: 'Onboarding' },
  { to: '/profile', label: 'Profile' },
];

export default function UserLayout() {
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <p className="sidebar-label">MY BALANCEVAULT</p>
        <nav className="sidebar-nav" aria-label="User dashboard">
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