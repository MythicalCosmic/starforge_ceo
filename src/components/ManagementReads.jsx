import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { useOpenApiSchema } from '../hooks/useOpenApiSchema.js';
import { appForApiPath, isServiceUnavailable } from '../lib/appAvailability.js';
import {
  humanizeIdentifier,
  operationAllowed,
  readOperations,
} from '../lib/openApiOperations.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import { userFacingError } from '../lib/userFacingError.js';
import { ApplicationGate, ApplicationUnavailableState } from './AvailabilityState.jsx';
import { Icons } from './Icons.jsx';
import '../styles/management-actions.css';

const DOWNLOAD_PATHS = Object.freeze([
  /^\/api\/v1\/(?:attendance|audit)\/export\/$/,
  /^\/api\/v1\/schedule\/ical\/\{[^}]+\}\/$/,
]);

function parameterValue(parameter, raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    if (parameter.required) throw new Error(`${humanizeIdentifier(parameter.name)} is required.`);
    return { supplied: false };
  }
  if (parameter.schema?.type === 'integer') {
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error(`${humanizeIdentifier(parameter.name)} must be a whole number.`);
    }
    const number = Number(value);
    if (parameter.schema.minimum != null && number < parameter.schema.minimum) {
      throw new Error(`${humanizeIdentifier(parameter.name)} must be at least ${parameter.schema.minimum}.`);
    }
    return { supplied: true, value: number };
  }
  if (parameter.schema?.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${humanizeIdentifier(parameter.name)} must be a number.`);
    return { supplied: true, value: number };
  }
  if (parameter.schema?.type === 'boolean') {
    if (!['true', 'false'].includes(value)) throw new Error(`${humanizeIdentifier(parameter.name)} must be yes or no.`);
    return { supplied: true, value };
  }
  return { supplied: true, value };
}

function ParameterControl({ parameter, value, onChange }) {
  const id = `read-parameter-${parameter.in}-${parameter.name}`;
  const label = humanizeIdentifier(parameter.name);
  const common = { id, value, required: parameter.required === true, onChange: (event) => onChange(event.target.value) };
  const options = parameter.schema?.enum;
  return (
    <label className="ma-field" htmlFor={id}>
      <span>{label}{parameter.required ? <b aria-label="required"> *</b> : null}</span>
      {Array.isArray(options) ? (
        <select {...common}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={String(option)} value={String(option)}>{humanizeIdentifier(option)}</option>)}</select>
      ) : parameter.schema?.type === 'boolean' ? (
        <select {...common}><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select>
      ) : (
        <input {...common} type={parameter.name === 'token' ? 'password' : ['integer', 'number'].includes(parameter.schema?.type) ? 'number' : 'text'} min={parameter.schema?.minimum} max={parameter.schema?.maximum} step={parameter.schema?.type === 'integer' ? 1 : parameter.schema?.type === 'number' ? 'any' : undefined} autoComplete="off" />
      )}
      {parameter.description ? <small>{parameter.description}</small> : null}
    </label>
  );
}

function resultText(result) {
  let value;
  try {
    value = JSON.stringify(result, null, 2);
  } catch {
    value = String(result ?? 'No response body.');
  }
  if (value.length <= 60_000) return value;
  return `${value.slice(0, 60_000)}\n\n…response preview shortened to keep this page responsive.`;
}

function ReadEditor({ operation }) {
  const pathParameters = operation.parameters.filter((parameter) => parameter.in === 'path');
  const queryParameters = operation.parameters.filter((parameter) => parameter.in === 'query');
  const [values, setValues] = useState(() => Object.fromEntries(operation.parameters.map((parameter) => [
    `${parameter.in}:${parameter.name}`,
    parameter.schema?.default == null ? '' : String(parameter.schema.default),
  ])));
  const [additionalQuery, setAdditionalQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const mutation = useMutation({
    mutationFn: ({ path, params }) => httpRequest('GET', path, { params, timeout: 30_000 }),
  });

  const prepareRequest = () => {
    let path = operation.path;
    const params = {};
    for (const parameter of operation.parameters) {
      const parsed = parameterValue(parameter, values[`${parameter.in}:${parameter.name}`]);
      if (!parsed.supplied) continue;
      if (parameter.in === 'path') path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(parsed.value)));
      if (parameter.in === 'query') params[parameter.name] = parsed.value;
    }
    const extras = new URLSearchParams(additionalQuery.trim().replace(/^\?/, ''));
    const extraNames = new Set();
    for (const [name, value] of extras.entries()) {
      if (!name.trim()) throw new Error('Every additional query parameter needs a name.');
      if (extraNames.has(name) || Object.hasOwn(params, name)) throw new Error(`${humanizeIdentifier(name)} was supplied more than once.`);
      extraNames.add(name);
      params[name] = value;
    }
    return { path, params };
  };

  const submit = (event) => {
    event.preventDefault();
    setLocalError('');
    mutation.reset();
    try {
      const request = prepareRequest();
      if (DOWNLOAD_PATHS.some((pattern) => pattern.test(operation.path))) {
        const query = new URLSearchParams(Object.entries(request.params).map(([key, value]) => [key, String(value)])).toString();
        const popup = window.open(query ? `${request.path}?${query}` : request.path, '_blank', 'noopener,noreferrer');
        if (popup) popup.opener = null;
        return;
      }
      mutation.mutate(request);
    } catch (error) {
      setLocalError(error.message || 'Review the request details.');
    }
  };
  const failureDetails = mutation.error ? readableValidationDetails(mutation.error) : [];

  return (
    <ApplicationGate apps={appForApiPath(operation.path)} label={humanizeIdentifier(operation.tag)}>
      <article className="ma-editor mr-editor">
        <header className="ma-editor-head"><span className="ma-method">GET</span><div><span>{humanizeIdentifier(operation.tag)}</span><h3>{operation.label}</h3>{operation.description ? <p>{operation.description.replace(/\s*Requires permission\s+`?[^`.]+`?\.?\s*$/i, '')}</p> : null}</div></header>
        <form onSubmit={submit}>
          {pathParameters.length ? <fieldset className="ma-fields"><legend>Target record</legend>{pathParameters.map((parameter) => <ParameterControl key={`${parameter.in}:${parameter.name}`} parameter={parameter} value={values[`${parameter.in}:${parameter.name}`] || ''} onChange={(value) => setValues((current) => ({ ...current, [`${parameter.in}:${parameter.name}`]: value }))} />)}</fieldset> : null}
          {queryParameters.length ? <fieldset className="ma-fields"><legend>Published filters</legend>{queryParameters.map((parameter) => <ParameterControl key={`${parameter.in}:${parameter.name}`} parameter={parameter} value={values[`${parameter.in}:${parameter.name}`] || ''} onChange={(value) => setValues((current) => ({ ...current, [`${parameter.in}:${parameter.name}`]: value }))} />)}</fieldset> : null}
          <label className="ma-field"><span>Additional filters</span><input value={additionalQuery} onChange={(event) => setAdditionalQuery(event.target.value)} placeholder="branch=2&date_from=2026-08-01" spellCheck="false" /><small>Use only filters documented for this service. Duplicate parameters are blocked before the request is sent.</small></label>
          {localError ? <div className="ma-error" role="alert">{localError}</div> : null}
          {mutation.error && isServiceUnavailable(mutation.error) ? <ApplicationUnavailableState label={humanizeIdentifier(operation.tag)} status="unavailable" compact /> : mutation.error ? <div className="ma-error" role="alert"><strong>{failureDetails[0] || userFacingError(mutation.error, { fallback: 'The information could not be loaded.' })}</strong>{failureDetails.length > 1 ? <ul>{failureDetails.slice(1).map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}</div> : null}
          {mutation.data !== undefined ? <div className="ma-result mr-result" role="status"><strong>Current service response</strong><pre>{resultText(mutation.data)}</pre></div> : null}
          <footer className="ma-submit"><details><summary>Technical contract</summary><code>GET {operation.path}</code><small>{operation.permission ? `Required capability: ${operation.permission}` : 'The service verifies identity and record scope.'}</small></details><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Loading…' : DOWNLOAD_PATHS.some((pattern) => pattern.test(operation.path)) ? 'Open export' : 'Load current data'}</button></footer>
        </form>
      </article>
    </ApplicationGate>
  );
}

export function ManagementReads({ capabilities }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const schema = useOpenApiSchema({ enabled: expanded });
  const operations = useMemo(() => !schema.data ? [] : readOperations(schema.data).filter((operation) => operationAllowed(operation, capabilities)), [capabilities, schema.data]);
  const categories = useMemo(() => [...new Set(operations.map((operation) => operation.tag))].sort(), [operations]);
  const visible = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return operations.filter((operation) => (!category || operation.tag === category) && (!phrase || `${operation.label} ${operation.path} ${operation.tag}`.toLowerCase().includes(phrase)));
  }, [category, operations, search]);
  const selected = visible.find((operation) => operation.key === selectedKey) || visible[0] || null;
  useEffect(() => {
    if (selected && selected.key !== selectedKey) setSelectedKey(selected.key);
    if (!selected && selectedKey) setSelectedKey('');
  }, [selected, selectedKey]);

  return (
    <section className="ma-shell" aria-label="Complete data access">
      <header className="ma-shell-head"><span className="ma-shell-icon">{cloneElement(Icons.search, { size: 18 })}</span><div><span>Live data contract</span><h2>Complete data access</h2><p>Open every current read operation advertised by the connected service, including specialized views that do not need a permanent navigation item.</p></div><button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? 'Close data access' : 'Open data access'}{cloneElement(Icons.chevR, { size: 15 })}</button></header>
      {expanded ? <div className="ma-body">{schema.isLoading ? <div className="ma-loading" role="status"><i /><span><strong>Checking current data operations…</strong><small>Reading the live service contract.</small></span></div> : schema.error ? <div className="ma-empty" role="alert"><strong>Data operations could not be prepared</strong><p>{userFacingError(schema.error)}</p><button type="button" onClick={() => schema.refetch()}>Try again</button></div> : <><div className="ma-filterbar"><label>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a data view" aria-label="Find a data view" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter data views by area"><option value="">All areas</option>{categories.map((item) => <option key={item} value={item}>{humanizeIdentifier(item)}</option>)}</select><span>{visible.length} of {operations.length}</span></div>{visible.length ? <div className="ma-workbench"><nav className="ma-action-list" aria-label="Available data operations">{visible.map((operation) => <button type="button" className={operation.key === selected?.key ? 'is-active' : ''} key={operation.key} onClick={() => setSelectedKey(operation.key)}><span className="ma-list-icon">{cloneElement(Icons.doc, { size: 14 })}</span><span><strong>{operation.label}</strong><small>{humanizeIdentifier(operation.tag)} · {operation.permission || 'identity-scoped'}</small></span>{cloneElement(Icons.chevR, { size: 14 })}</button>)}</nav><div className="ma-editor-slot">{selected ? <ReadEditor key={selected.key} operation={selected} /> : null}</div></div> : <div className="ma-empty"><strong>No matching data operation</strong><p>Clear the search or choose another area.</p></div>}</>}</div> : null}
    </section>
  );
}
