import { Link, NavLink } from 'react-router-dom';

export function NavBar() {
  return (
    <header className="nav-bar">
      <div className="nav-brand">
        <Link to="/">NeuraSentinel</Link>
      </div>
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Home
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/device" className={({ isActive }) => (isActive ? 'active' : '')}>
          Device
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          Profile
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
          AI Analytics
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          Leaderboard
        </NavLink>
        <NavLink to="/challenges" className={({ isActive }) => (isActive ? 'active' : '')}>
          Challenges
        </NavLink>
      </nav>
    </header>
  );
}
