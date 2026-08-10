import { cloneElement } from 'react';
import { Icons } from './Icons.jsx';
import { groupCapabilities, normalizeCapabilityCodes } from '../lib/capabilityPresentation.js';

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function CapabilitySummary({ capabilities }) {
  const codes = normalizeCapabilityCodes(capabilities);
  const groups = groupCapabilities(codes);

  if (!codes.length) {
    return <div className="wf-empty-inline">No active access is recorded for this person.</div>;
  }

  return (
    <div className="wf-access-overview">
      <div className="wf-access-scope">
        <span aria-hidden="true">{cloneElement(Icons.shield, { size: 18 })}</span>
        <div>
          <strong>{countLabel(codes.length, 'allowed action')} across {countLabel(groups.length, 'area')}</strong>
          <small>The service still checks this person’s assigned branch and department whenever an action is used.</small>
        </div>
      </div>

      <div className="wf-access-groups">
        {groups.map((group) => (
          <article className="wf-access-group" key={group.id}>
            <header>
              <div>
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <span>{countLabel(group.items.length, 'action')}</span>
            </header>
            <ul>
              {group.items.map((item) => (
                <li key={item.code}>
                  <span aria-hidden="true">{cloneElement(Icons.check, { size: 13 })}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <details className="wf-access-technical">
        <summary>
          <span>Technical capability codes</span>
          <small>{countLabel(codes.length, 'code')}</small>
          <span aria-hidden="true">{cloneElement(Icons.chevR, { size: 14 })}</span>
        </summary>
        <div>
          <p>For access reviews and technical support. Most people do not need these identifiers.</p>
          <div className="wf-permission-grid">{codes.map((code) => <code key={code}>{code}</code>)}</div>
        </div>
      </details>
    </div>
  );
}
