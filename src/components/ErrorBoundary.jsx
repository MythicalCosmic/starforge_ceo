import { Component } from 'react';
import { SfStar } from './primitives.jsx';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A production telemetry adapter can collect this without exposing the
    // exception or component stack to the user-facing screen.
    console.error('[ui] uncaught render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="sf-fatal" role="alert">
        <div className="sf-fatal-card">
          <SfStar size={34} color="var(--sf-primary)" />
          <div>
            <p className="sf-fatal-eyebrow">StarForge Leadership</p>
            <h1>This view needs a fresh start</h1>
            <p>
              Your session is still protected. Reload the workspace and retry the
              action; contact support if the problem repeats.
            </p>
          </div>
          <button type="button" className="ad-btn ad-btn-primary" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </div>
      </main>
    );
  }
}
