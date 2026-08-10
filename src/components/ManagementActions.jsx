import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useOpenApiSchema } from '../hooks/useOpenApiSchema.js';
import { appForApiPath, isServiceUnavailable } from '../lib/appAvailability.js';
import {
  humanizeIdentifier,
  managementOperations,
  multipartContractForOperation,
  operationAllowed,
  operationPathMatches,
  permissionForOperation,
  resolveOpenApiSchema,
} from '../lib/openApiOperations.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import { userFacingError } from '../lib/userFacingError.js';
import { ApplicationGate, ApplicationUnavailableState } from './AvailabilityState.jsx';
import { Icons } from './Icons.jsx';
import '../styles/management-actions.css';

const EMPTY_BODY = '{\n  \n}';

function requestIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `console-${globalThis.crypto.randomUUID()}`;
  return `console-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function businessDescription(operation) {
  return String(operation?.description || '')
    .replace(/\s*Requires permission\s+`?[^`.]+`?\.?\s*$/i, '')
    .trim();
}

function valueForInput(schema, value) {
  if (value !== undefined) return value;
  if (schema?.default !== undefined) {
    return typeof schema.default === 'object'
      ? JSON.stringify(schema.default, null, 2)
      : String(schema.default);
  }
  if (schema?.example !== undefined) {
    return typeof schema.example === 'object'
      ? JSON.stringify(schema.example, null, 2)
      : String(schema.example);
  }
  return '';
}

function initialFieldValues(schema) {
  return Object.fromEntries(Object.entries(schema?.properties || {}).map(([name, field]) => [
    name,
    valueForInput(field),
  ]));
}

function schemaFromOptions(metadata, method) {
  const action = metadata?.actions?.[String(method || '').toUpperCase()];
  if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
  const properties = {};
  const required = [];
  for (const [name, field] of Object.entries(action)) {
    if (!field || typeof field !== 'object' || field.read_only === true) continue;
    const choices = Array.isArray(field.choices) ? field.choices : [];
    const type = choices.length
      ? typeof choices[0]?.value === 'number' ? 'integer' : 'string'
      : field.type === 'integer' ? 'integer'
        : ['float', 'decimal'].includes(field.type) ? 'number'
          : field.type === 'boolean' ? 'boolean'
            : ['list', 'multiple choice'].includes(field.type) ? 'array'
              : field.type === 'nested object' ? 'object'
                : 'string';
    properties[name] = {
      type,
      title: field.label || humanizeIdentifier(name),
      description: field.help_text || '',
      ...(field.max_length != null ? { maxLength: field.max_length } : {}),
      ...(field.min_length != null ? { minLength: field.min_length } : {}),
      ...(choices.length ? {
        enum: choices.map((choice) => choice.value),
        enumLabels: Object.fromEntries(choices.map((choice) => [String(choice.value), choice.display_name || String(choice.value)])),
      } : {}),
    };
    if (field.required === true) required.push(name);
  }
  return Object.keys(properties).length ? { type: 'object', properties, required } : null;
}

function parseFieldValue(name, schema, raw, required) {
  if (raw === '' || raw === undefined) {
    if (required) throw new Error(`${humanizeIdentifier(name)} is required.`);
    return { supplied: false };
  }
  if (schema?.type === 'integer') {
    if (!/^-?\d+$/.test(String(raw))) throw new Error(`${humanizeIdentifier(name)} must be a whole number.`);
    const number = Number(raw);
    if (!Number.isSafeInteger(number)) throw new Error(`${humanizeIdentifier(name)} is outside the supported whole-number range.`);
    if (schema.minimum != null && number < schema.minimum) throw new Error(`${humanizeIdentifier(name)} must be at least ${schema.minimum}.`);
    if (schema.maximum != null && number > schema.maximum) throw new Error(`${humanizeIdentifier(name)} must be no more than ${schema.maximum}.`);
    return { supplied: true, value: number };
  }
  if (schema?.type === 'number') {
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${humanizeIdentifier(name)} must be a number.`);
    return { supplied: true, value: number };
  }
  if (schema?.type === 'boolean') return { supplied: true, value: raw === true || raw === 'true' };
  if (schema?.type === 'array' || schema?.type === 'object') {
    try {
      const parsed = JSON.parse(String(raw));
      if (schema.type === 'array' && !Array.isArray(parsed)) throw new Error('array');
      if (schema.type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('object');
      return { supplied: true, value: parsed };
    } catch {
      throw new Error(`${humanizeIdentifier(name)} must contain valid ${schema.type === 'array' ? 'JSON list' : 'JSON object'} data.`);
    }
  }
  if (schema?.format === 'date-time') {
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) throw new Error(`${humanizeIdentifier(name)} must be a valid date and time.`);
    return { supplied: true, value: date.toISOString() };
  }
  return { supplied: true, value: String(raw) };
}

function inputType(schema) {
  if (schema?.format === 'date') return 'date';
  if (schema?.format === 'date-time') return 'datetime-local';
  if (schema?.format === 'email') return 'email';
  if (schema?.format === 'password') return 'password';
  if (schema?.type === 'integer' || schema?.type === 'number') return 'number';
  return 'text';
}

function FieldControl({ name, schema, required, value, onChange }) {
  const label = schema?.title || humanizeIdentifier(name);
  const help = schema?.description;
  const common = {
    id: `management-field-${name}`,
    value: value ?? '',
    required,
    onChange: (event) => onChange(event.target.value),
  };
  let control;
  if (Array.isArray(schema?.enum)) {
    control = <select {...common}><option value="">Select {label.toLowerCase()}</option>{schema.enum.map((option) => <option value={String(option)} key={String(option)}>{schema.enumLabels?.[String(option)] || humanizeIdentifier(option)}</option>)}</select>;
  } else if (schema?.type === 'boolean') {
    control = <select {...common}><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select>;
  } else if (schema?.type === 'array' || schema?.type === 'object') {
    control = <textarea {...common} rows="5" spellCheck="false" placeholder={schema.type === 'array' ? '[\n  \n]' : '{\n  \n}'} />;
  } else if ((schema?.maxLength || 0) > 220 || /description|body|message|note|reason|content|agenda|purpose/i.test(name)) {
    control = <textarea {...common} rows="4" maxLength={schema?.maxLength} />;
  } else {
    control = <input {...common} type={inputType(schema)} min={schema?.minimum} max={schema?.maximum} step={schema?.type === 'integer' ? 1 : schema?.type === 'number' ? 'any' : undefined} maxLength={schema?.maxLength} autoComplete={schema?.format === 'password' ? 'new-password' : 'off'} />;
  }
  return <label className={(schema?.type === 'array' || schema?.type === 'object') ? 'ma-field is-wide' : 'ma-field'} htmlFor={common.id}><span>{label}{required ? <b aria-label="required"> *</b> : null}</span>{control}{help ? <small>{help}</small> : null}</label>;
}

function responseText(value) {
  if (value === undefined) return 'Completed without a response body.';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'The action completed successfully.';
  }
}

function ActionEditor({ operation, schemaDocument, recordId }) {
  const multipart = useMemo(() => multipartContractForOperation(operation), [operation]);
  const publishedSchema = useMemo(
    () => multipart?.schema || resolveOpenApiSchema(operation.requestSchema, schemaDocument),
    [multipart, operation.requestSchema, schemaDocument],
  );
  const pathParameters = operation.parameters.filter((parameter) => parameter.in === 'path');
  const [pathValues, setPathValues] = useState(() => Object.fromEntries(pathParameters.map((parameter, index) => [
    parameter.name,
    index === 0 && recordId != null ? String(recordId) : '',
  ])));
  const optionsPath = useMemo(() => {
    let path = operation.path;
    for (const parameter of pathParameters) {
      const value = String(pathValues[parameter.name] || '').trim();
      if (!value) return '';
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    }
    return path;
  }, [operation.path, pathParameters, pathValues]);
  const publishedFields = Object.keys(publishedSchema?.properties || {});
  const options = useQuery({
    queryKey: ['api-options', optionsPath, operation.method],
    queryFn: () => httpRequest('OPTIONS', optionsPath, { timeout: 8_000 }),
    enabled: Boolean(!multipart && optionsPath && operation.requestSchema && publishedFields.length === 0),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const metadataSchema = useMemo(
    () => schemaFromOptions(options.data, operation.method),
    [operation.method, options.data],
  );
  const resolvedSchema = publishedFields.length ? publishedSchema : metadataSchema || publishedSchema;
  const fields = Object.entries(resolvedSchema?.properties || {});
  const typedBody = fields.length > 0;
  const hasRequestBody = Boolean(multipart || operation.requestSchema || operation.requestBodyRequired);
  const requiredFields = useMemo(() => new Set(resolvedSchema?.required || []), [resolvedSchema?.required]);
  const [fieldValues, setFieldValues] = useState(() => initialFieldValues(publishedSchema));
  const [bodyMode, setBodyMode] = useState('guided');
  const [rawBody, setRawBody] = useState(() => {
    const example = publishedSchema?.example ?? operation.requestSchema?.example;
    return example === undefined ? EMPTY_BODY : JSON.stringify(example, null, 2);
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [confirmed, setConfirmed] = useState(operation.risk === 'standard');
  const [result, setResult] = useState(undefined);
  const [localError, setLocalError] = useState('');
  const attempt = useRef({ signature: '', key: '' });
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ path, body, idempotencyKey }) => httpRequest(operation.method, path, {
      body,
      idempotencyKey,
      timeout: 30_000,
    }),
    onSuccess: (value) => {
      setLocalError('');
      setResult(value === undefined ? null : value);
      attempt.current = { signature: '', key: '' };
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(`${operation.label} completed.`, { title: 'Organization updated' });
    },
    onError: (error) => {
      setResult(undefined);
      toast.danger(readableValidationDetails(error)[0] || userFacingError(error, { fallback: 'The action could not be completed.' }), { title: 'No changes were made' });
    },
  });

  const submit = (event) => {
    event.preventDefault();
    setLocalError('');
    setResult(undefined);
    try {
      let resolvedPath = operation.path;
      for (const parameter of pathParameters) {
        const raw = String(pathValues[parameter.name] || '').trim();
        if (!raw) throw new Error(`${humanizeIdentifier(parameter.name)} is required.`);
        if (parameter.schema?.type === 'integer' && !/^[1-9]\d*$/.test(raw)) throw new Error(`${humanizeIdentifier(parameter.name)} must be a positive record number.`);
        resolvedPath = resolvedPath.replace(`{${parameter.name}}`, encodeURIComponent(raw));
      }
      let body;
      if (multipart) {
        if (!uploadFile) throw new Error('Choose a CSV file before continuing.');
        if (multipart.maxBytes && uploadFile.size > multipart.maxBytes) {
          throw new Error(`Choose a file no larger than ${Math.round(multipart.maxBytes / 1024 / 1024)} MB.`);
        }
        body = new FormData();
        for (const [name, fieldSchema] of fields) {
          const parsed = parseFieldValue(name, fieldSchema, fieldValues[name], requiredFields.has(name));
          if (!parsed.supplied) continue;
          body.append(name, typeof parsed.value === 'object' ? JSON.stringify(parsed.value) : String(parsed.value));
        }
        body.append(multipart.fileField, uploadFile);
      } else if (hasRequestBody && typedBody && bodyMode === 'guided') {
        body = {};
        for (const [name, fieldSchema] of fields) {
          const parsed = parseFieldValue(name, fieldSchema, fieldValues[name], requiredFields.has(name));
          if (parsed.supplied) body[name] = parsed.value;
        }
      } else if (hasRequestBody) {
        const trimmed = rawBody.trim();
        if (!trimmed && operation.requestBodyRequired) throw new Error('Request data is required.');
        if (trimmed) {
          try {
            body = JSON.parse(trimmed);
          } catch {
            throw new Error('Request data must be valid JSON.');
          }
        }
      }
      if (operation.risk !== 'standard' && !confirmed) throw new Error('Confirm that you reviewed this sensitive action.');
      if (operation.risk === 'destructive' && !window.confirm(`Permanently run “${operation.label}”? This may not be reversible.`)) return;
      const signatureBody = multipart
        ? [uploadFile.name, uploadFile.size, uploadFile.lastModified, fieldValues]
        : body ?? null;
      const signature = JSON.stringify([operation.method, resolvedPath, signatureBody]);
      if (attempt.current.signature !== signature) {
        attempt.current = { signature, key: requestIdempotencyKey() };
      }
      mutation.mutate({ path: resolvedPath, body, idempotencyKey: attempt.current.key });
    } catch (error) {
      setLocalError(error.message || 'Review the action details.');
    }
  };
  const failure = mutation.error;
  const failureDetails = failure ? readableValidationDetails(failure) : [];
  const permission = permissionForOperation(operation);

  return (
    <ApplicationGate apps={appForApiPath(operation.path)} label={humanizeIdentifier(operation.tag)}>
      <article className="ma-editor">
        <header className="ma-editor-head">
          <span className={`ma-method is-${operation.risk}`}>{operation.method.toUpperCase()}</span>
          <div><span>{humanizeIdentifier(operation.tag)}</span><h3>{operation.label}</h3>{businessDescription(operation) ? <p>{businessDescription(operation)}</p> : null}</div>
        </header>
        <form onSubmit={submit}>
          {pathParameters.length > 0 ? <fieldset className="ma-fields"><legend>Target record</legend>{pathParameters.map((parameter) => <label className="ma-field" key={parameter.name}><span>{humanizeIdentifier(parameter.name)} *</span><input required type={parameter.schema?.type === 'integer' ? 'number' : 'text'} min={parameter.schema?.type === 'integer' ? 1 : undefined} value={pathValues[parameter.name] || ''} onChange={(event) => setPathValues((current) => ({ ...current, [parameter.name]: event.target.value }))} placeholder="Record number" /></label>)}</fieldset> : null}
          {hasRequestBody ? <fieldset className="ma-fields"><legend>Action details</legend>{!multipart && typedBody ? <div className="ma-body-mode" role="group" aria-label="Request data entry mode"><button type="button" className={bodyMode === 'guided' ? 'is-active' : ''} aria-pressed={bodyMode === 'guided'} onClick={() => setBodyMode('guided')}>Guided fields</button><button type="button" className={bodyMode === 'json' ? 'is-active' : ''} aria-pressed={bodyMode === 'json'} onClick={() => setBodyMode('json')}>Exact JSON</button><small>Exact JSON supports explicit nulls, empty values, and advanced nested payloads.</small></div> : null}{multipart ? <><label className="ma-field is-wide ma-file-field"><span>CSV file *</span><input required type="file" accept={multipart.accept} onChange={(event) => setUploadFile(event.target.files?.[0] || null)} /><small>{uploadFile ? `${uploadFile.name} · ${Math.max(1, Math.ceil(uploadFile.size / 1024))} KB` : multipart.help}</small></label>{fields.map(([name, fieldSchema]) => <FieldControl key={name} name={name} schema={fieldSchema} required={requiredFields.has(name)} value={valueForInput(fieldSchema, fieldValues[name])} onChange={(value) => setFieldValues((current) => ({ ...current, [name]: value }))} />)}</> : typedBody && bodyMode === 'guided' ? fields.map(([name, fieldSchema]) => <FieldControl key={name} name={name} schema={fieldSchema} required={requiredFields.has(name)} value={valueForInput(fieldSchema, fieldValues[name])} onChange={(value) => setFieldValues((current) => ({ ...current, [name]: value }))} />) : <label className="ma-field is-wide"><span>Request data{operation.requestBodyRequired ? <b> *</b> : null}</span><textarea className="ma-json" rows="11" spellCheck="false" value={rawBody} onChange={(event) => setRawBody(event.target.value)} /><small>{options.isLoading ? 'Checking whether this service publishes a guided form…' : typedBody ? 'Send the exact JSON object required by the published contract. Use null only where the service declares the field nullable.' : 'This legacy action does not publish individual fields. The JSON is validated before it is sent, and the service rejects unknown or unauthorized data.'}</small></label>}</fieldset> : <div className="ma-no-body">This action does not require request data.</div>}
          {operation.risk !== 'standard' ? <label className="ma-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this action</strong><small>{operation.risk === 'destructive' ? 'It may permanently remove a record.' : 'It changes an important workflow state or may trigger an external effect.'}</small></span></label> : null}
          {localError ? <div className="ma-error" role="alert">{localError}</div> : null}
          {failure && isServiceUnavailable(failure) ? <ApplicationUnavailableState label={humanizeIdentifier(operation.tag)} status="unavailable" compact /> : failure ? <div className="ma-error" role="alert"><strong>{failureDetails[0] || userFacingError(failure, { fallback: 'The action could not be completed.' })}</strong>{failureDetails.length > 1 ? <ul>{failureDetails.slice(1).map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}{failure.requestId ? <small>Support reference: {failure.requestId}</small> : null}</div> : null}
          {result !== undefined ? <div className="ma-result" role="status"><strong>Completed successfully</strong><pre>{responseText(result)}</pre></div> : null}
          <footer className="ma-submit"><details><summary>Technical contract</summary><code>{operation.method.toUpperCase()} {operation.path}</code><small>{permission ? `Required capability: ${permission}` : 'The service verifies authorization for this action.'}</small></details><button className={operation.risk === 'destructive' ? 'is-danger' : ''} type="submit" disabled={mutation.isPending || (operation.risk !== 'standard' && !confirmed)}>{mutation.isPending ? 'Applying safely…' : operation.label}</button></footer>
        </form>
      </article>
    </ApplicationGate>
  );
}

export function ManagementActions({
  capabilities,
  pathPrefix = '',
  recordId = null,
  collectionOnly = false,
  defaultExpanded = false,
  showAll = false,
  title = 'Management actions',
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(showAll || defaultExpanded);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const schema = useOpenApiSchema({ enabled: expanded || showAll });
  const operations = useMemo(() => {
    if (!schema.data || readOnly) return [];
    return managementOperations(schema.data)
      .filter((operation) => !pathPrefix || operationPathMatches(operation, pathPrefix, { collectionOnly }))
      .filter((operation) => operationAllowed(operation, capabilities));
  }, [capabilities, collectionOnly, pathPrefix, readOnly, schema.data]);
  const categories = useMemo(() => [...new Set(operations.map((operation) => operation.tag))].sort(), [operations]);
  const visible = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return operations.filter((operation) =>
      (!category || operation.tag === category) &&
      (!phrase || `${operation.label} ${operation.path} ${operation.tag}`.toLowerCase().includes(phrase)));
  }, [category, operations, search]);
  const selected = visible.find((operation) => operation.key === selectedKey) || visible[0] || null;

  useEffect(() => {
    if (selected && selected.key !== selectedKey) setSelectedKey(selected.key);
    if (!selected && selectedKey) setSelectedKey('');
  }, [selected, selectedKey]);

  return (
    <section className={`ma-shell${showAll ? ' is-full' : ''}`} aria-label={title}>
      <header className="ma-shell-head">
        <span className="ma-shell-icon">{cloneElement(Icons.settings, { size: 18 })}</span>
        <div><span>Authorized controls</span><h2>{title}</h2><p>{showAll ? 'Every management mutation advertised by the connected service, filtered to this account’s exact capabilities.' : 'Create, update, and run the actions connected to this register.'}</p></div>
        {!showAll ? <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? 'Close actions' : 'Open actions'}{cloneElement(Icons.chevR, { size: 15 })}</button> : <span className="ma-count">{schema.isLoading ? 'Checking…' : `${operations.length} available`}</span>}
      </header>
      {expanded ? <div className="ma-body">
        {readOnly ? <div className="ma-empty"><strong>This is a view-only session</strong><p>Sign in directly with an authorized management account to make changes.</p></div> : schema.isLoading ? <div className="ma-loading" role="status"><i /> <span><strong>Checking current management controls…</strong><small>Reading the live service contract.</small></span></div> : schema.error ? <div className="ma-empty" role="alert"><strong>Management controls could not be prepared</strong><p>{userFacingError(schema.error, { fallback: 'Try again after the service contract is available.' })}</p><button type="button" onClick={() => schema.refetch()}>Try again</button></div> : operations.length === 0 ? <div className="ma-empty"><strong>No write actions are available here</strong><p>The current role is read-only for this area, or this register has no management mutation.</p></div> : <>
          <div className="ma-filterbar"><label>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an action" aria-label="Find a management action" /></label>{categories.length > 1 ? <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter actions by area"><option value="">All areas</option>{categories.map((item) => <option key={item} value={item}>{humanizeIdentifier(item)}</option>)}</select> : null}<span>{visible.length} of {operations.length}</span></div>
          {visible.length === 0 ? <div className="ma-empty"><strong>No matching actions</strong><p>Clear the search or choose another area.</p></div> : <div className="ma-workbench"><nav className="ma-action-list" aria-label="Available management actions">{visible.map((operation) => <button type="button" className={operation.key === selected?.key ? 'is-active' : ''} key={operation.key} onClick={() => setSelectedKey(operation.key)}><span className={`ma-list-icon is-${operation.risk}`}>{cloneElement(operation.risk === 'destructive' ? Icons.x : operation.risk === 'sensitive' ? Icons.shield : Icons.plus, { size: 14 })}</span><span><strong>{operation.label}</strong><small>{humanizeIdentifier(operation.tag)} · {operation.permission || 'service-authorized'}</small></span>{cloneElement(Icons.chevR, { size: 14 })}</button>)}</nav><div className="ma-editor-slot">{selected ? <ActionEditor key={`${selected.key}:${recordId || ''}`} operation={selected} schemaDocument={schema.data} recordId={recordId} /> : null}</div></div>}
        </>}
      </div> : null}
    </section>
  );
}
