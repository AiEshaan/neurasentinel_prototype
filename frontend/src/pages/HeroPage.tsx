import { Link } from 'react-router-dom';

export function HeroPage() {
  return (
    <section className="hero">
      <div className="hero-content">
        <h1>NeuraSentinel</h1>
        <p>
          AI-powered Table Tennis Coach on your Desktop. Turn every swing into feedback, build consistent
          strokes, and track your progress over time.
        </p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn btn-primary">
            Start Practicing
          </Link>
          <Link to="/analytics" className="btn btn-secondary">
            View AI Analytics
          </Link>
          <Link to="/device" className="btn btn-secondary">
            Connect Device
          </Link>
        </div>
      </div>
    </section>
  );
}
