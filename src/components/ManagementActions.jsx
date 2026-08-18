import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useOpenApiSchema } from '../hooks/useOpenApiSchema.js';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { appForApiPath, isServiceUnavailable } from '../lib/appAvailability.js';
import {
  isPrincipalSchema,
  lookupForField,
  operationContract,
  operationPresentation,
  PRINCIPAL_LOOKUP,
  withPrincipalHint,
} from '../lib/managementFormContracts.js';
import {
  humanizeIdentifier,
  managementOperations,
  multipartContractForOperation,
  operationAllowed,
  operationPathMatches,
  resolveOpenApiSchema,
} from '../lib/openApiOperations.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import { userFacingError } from '../lib/userFacingError.js';
import { ApplicationGate, ApplicationUnavailableState } from './AvailabilityState.jsx';
import { Icons } from './Icons.jsx';
import '../styles/management-actions.css';

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
  if (schema?.default !== undefined) return schema.default;
  if (schema?.example !== undefined) return schema.example;
  return '';
}

function initialFieldValues(schema) {
  return Object.fromEntries(Object.entries(schema?.properties || {}).map(([name, field]) => [
    name,
    valueForInput(field),
  ]));
}

function parseFieldValue(name, schema, raw, required) {
  if (raw === '' || raw === undefined) {
    if (required && schema?.nullable) return { supplied: true, value: null };
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
  if (isPrincipalSchema(name, schema)) {
    if (raw && typeof raw === 'object') return { supplied: true, value: raw };
    const [kind, id] = String(raw).split(':');
    if (!['staff', 'teacher'].includes(kind) || !/^[1-9]\d*$/.test(id || '')) {
      throw new Error(`Choose a valid ${humanizeIdentifier(name).toLowerCase()}.`);
    }
    return { supplied: true, value: { kind, id: Number(id) } };
  }
  if (schema?.type === 'array') {
    const values = Array.isArray(raw)
      ? raw
      : String(raw).split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    const parsed = schema.items?.type === 'integer'
      ? values.map((value) => {
          if (!/^[1-9]\d*$/.test(String(value))) throw new Error(`${humanizeIdentifier(name)} contains an invalid selection.`);
          return Number(value);
        })
      : values;
    return { supplied: true, value: parsed };
  }
  if (schema?.type === 'object') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Review the ${humanizeIdentifier(name).toLowerCase()} fields.`);
    }
    const result = {};
    const requiredChildren = new Set(schema.required || []);
    for (const [childName, childSchema] of Object.entries(schema.properties || {})) {
      const parsed = parseFieldValue(childName, childSchema, raw[childName], requiredChildren.has(childName));
      if (parsed.supplied) result[childName] = parsed.value;
    }
    return { supplied: true, value: result };
  }
  if (schema?.format === 'date-time') {
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) throw new Error(`${humanizeIdentifier(name)} must be a valid date and time.`);
    return { supplied: true, value: date.toISOString() };
  }
  const text = String(raw);
  if (schema?.pattern && !(new RegExp(schema.pattern).test(text))) {
    throw new Error(`${humanizeIdentifier(name)} has an invalid format.`);
  }
  return { supplied: true, value: text };
}

function inputType(schema) {
  if (schema?.format === 'date') return 'date';
  if (schema?.format === 'date-time') return 'datetime-local';
  if (schema?.format === 'email') return 'email';
  if (schema?.format === 'password') return 'password';
  if (schema?.type === 'integer' || schema?.type === 'number') return 'number';
  return 'text';
}

function lookupLabel(row, lookup) {
  const primary = row?.[lookup?.label] || row?.full_name || row?.display_name || row?.name || row?.title || row?.username || `Record ${row?.id}`;
  const secondary = lookup?.secondary ? row?.[lookup.secondary] : '';
  return secondary ? `${primary} · ${secondary}` : primary;
}

function FieldControl({ name, schema: sourceSchema, required, value, onChange }) {
  const shortName = String(name).split('.').at(-1);
  const schema = withPrincipalHint(shortName, sourceSchema);
  const label = schema?.title || humanizeIdentifier(name);
  const help = schema?.description;
  const principalField = isPrincipalSchema(shortName, schema);
  const lookup = principalField ? PRINCIPAL_LOOKUP : lookupForField(shortName, schema);
  const lookupState = useWorkspaceData(lookup?.path || null, { page_size: 100 }, { enabled: Boolean(lookup) });
  const inputId = `management-field-${String(name).replace(/[^a-z0-9_-]+/gi, '-')}`;
  const common = {
    id: inputId,
    value: value ?? '',
    required,
    onChange: (event) => onChange(event.target.value),
  };
  if (schema?.type === 'object' && !principalField) {
    const childRequired = new Set(schema.required || []);
    return <section className="ma-nested is-wide" aria-labelledby={`${inputId}-title`}><header><strong id={`${inputId}-title`}>{label}{required ? <b aria-label="required"> *</b> : null}</strong>{help ? <small>{help}</small> : null}</header><div>{Object.entries(schema.properties || {}).map(([childName, childSchema]) => <FieldControl key={childName} name={`${name}.${childName}`} schema={childSchema} required={childRequired.has(childName)} value={value?.[childName]} onChange={(next) => onChange({ ...(value && typeof value === 'object' ? value : {}), [childName]: next })} />)}</div></section>;
  }
  let control;
  if (principalField) {
    const selected = value && typeof value === 'object' ? `${value.kind}:${value.id}` : value ?? '';
    control = <select {...common} value={selected}><option value="">{schema.nullable ? 'No owner yet' : `Select ${label.toLowerCase()}`}</option>{lookupState.rows.filter((row) => ['staff', 'teacher'].includes(row.principal_kind || row.kind)).map((row) => {
      const kind = row.principal_kind || row.kind;
      const id = row.profile_id || row.principal_id || row.id;
      return <option value={`${kind}:${id}`} key={`${kind}:${id}`}>{lookupLabel(row, lookup)}</option>;
    })}</select>;
  } else if (lookup && schema?.type === 'integer') {
    control = <select {...common}><option value="">Select {label.toLowerCase()}</option>{lookupState.rows.map((row) => <option value={String(row.id)} key={row.id}>{lookupLabel(row, lookup)}</option>)}</select>;
  } else if (Array.isArray(schema?.enum)) {
    control = <select {...common}><option value="">Select {label.toLowerCase()}</option>{schema.enum.map((option) => <option value={String(option)} key={String(option)}>{schema.enumLabels?.[String(option)] || humanizeIdentifier(option)}</option>)}</select>;
  } else if (schema?.type === 'boolean') {
    control = <select {...common}><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select>;
  } else if (schema?.type === 'array' && Array.isArray(schema?.items?.enum)) {
    const selected = Array.isArray(value) ? value.map(String) : [];
    control = <select {...common} multiple value={selected} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}>{schema.items.enum.map((option) => <option value={String(option)} key={String(option)}>{schema.items.enumLabels?.[String(option)] || humanizeIdentifier(option)}</option>)}</select>;
  } else if (schema?.type === 'array') {
    control = <textarea {...common} value={Array.isArray(value) ? value.join('\n') : value ?? ''} rows="3" placeholder="One selection per line" />;
  } else if ((schema?.maxLength || 0) > 220 || /description|body|message|note|reason|content|agenda|purpose/i.test(name)) {
    control = <textarea {...common} rows="4" maxLength={schema?.maxLength} />;
  } else {
    control = <input {...common} type={inputType(schema)} min={schema?.minimum} max={schema?.maximum} step={schema?.type === 'integer' ? 1 : schema?.type === 'number' ? 'any' : undefined} maxLength={schema?.maxLength} pattern={schema?.pattern} autoComplete={schema?.format === 'password' ? 'new-password' : 'off'} />;
  }
  return <label className={schema?.type === 'array' ? 'ma-field is-wide' : 'ma-field'} htmlFor={common.id}><span>{label}{required ? <b aria-label="required"> *</b> : null}</span>{control}{lookupState.pending ? <small>Loading available choices…</small> : help ? <small>{help}</small> : null}</label>;
}

function ActionEditor({ operation, schemaDocument, recordId, onComplete, showHeader = true }) {
  const multipart = useMemo(() => multipartContractForOperation(operation), [operation]);
  const contract = useMemo(() => operationContract(operation), [operation]);
  const presentation = useMemo(() => operationPresentation(operation), [operation]);
  const publishedSchema = useMemo(
    () => multipart?.schema || resolveOpenApiSchema(operation.requestSchema, schemaDocument),
    [multipart, operation.requestSchema, schemaDocument],
  );
  const pathParameters = operation.parameters.filter((parameter) => parameter.in === 'path');
  const [pathValues, setPathValues] = useState(() => Object.fromEntries(pathParameters.map((parameter, index) => [
    parameter.name,
    index === 0 && recordId != null ? String(recordId) : '',
  ])));
  const resolvedSchema = contract?.schema || publishedSchema;
  const allFields = Object.entries(resolvedSchema?.properties || {});
  const hasRequestBody = Boolean(contract || multipart || operation.requestSchema || operation.requestBodyRequired);
  const requiredFields = useMemo(() => new Set(resolvedSchema?.required || []), [resolvedSchema?.required]);
  const [fieldValues, setFieldValues] = useState(() => initialFieldValues(resolvedSchema));
  const fields = allFields.filter(([, fieldSchema]) => {
    const condition = fieldSchema?.['x-visible-when'];
    if (!condition) return true;
    if (condition.present) return String(fieldValues[condition.field] ?? '').trim() !== '';
    return String(fieldValues[condition.field] ?? '') === String(condition.equals);
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [confirmed, setConfirmed] = useState(operation.risk === 'standard');
  const [result, setResult] = useState(undefined);
  const [localError, setLocalError] = useState('');
  const attempt = useRef({ signature: '', key: '' });
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: async ({ path, body, idempotencyKey }) => {
      if (contract?.workflow === 'create-room') {
        const {
          assignment_group: assignmentGroup,
          responsible_teacher: responsibleTeacher,
          ...roomBody
        } = body;
        const room = await httpRequest(operation.method, path, {
          body: roomBody,
          idempotencyKey,
          timeout: 30_000,
        });
        if (assignmentGroup) {
          try {
            await httpRequest('PATCH', `/api/v1/cohorts/${Number(assignmentGroup)}/`, {
              body: {
                default_room: Number(room.id),
                ...(responsibleTeacher ? { primary_teacher: Number(responsibleTeacher) } : {}),
              },
              timeout: 30_000,
            });
          } catch (failure) {
            const partial = new Error('The room was created, but its group assignment could not be completed. Open the group and set its default room before continuing.');
            partial.partialSuccess = true;
            partial.cause = failure;
            throw partial;
          }
        }
        return room;
      }
      return httpRequest(operation.method, path, {
        body,
        idempotencyKey,
        timeout: 30_000,
      });
    },
    onSuccess: (value) => {
      setLocalError('');
      setResult(value === undefined ? null : value);
      attempt.current = { signature: '', key: '' };
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(`${operation.label} completed.`, { title: 'Organization updated' });
      onComplete?.();
    },
    onError: (error) => {
      setResult(undefined);
      if (error.partialSuccess) queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.danger(error.partialSuccess ? error.message : readableValidationDetails(error)[0] || userFacingError(error, { fallback: 'The action could not be completed.' }), { title: error.partialSuccess ? 'Room created · assignment needs attention' : 'No changes were made' });
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
      } else if (hasRequestBody) {
        body = {};
        for (const [name, fieldSchema] of fields) {
          const parsed = parseFieldValue(name, fieldSchema, fieldValues[name], requiredFields.has(name));
          if (parsed.supplied) body[name] = parsed.value;
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
  const actionTitle = presentation?.title || operation.label;
  const actionDescription = presentation?.description || businessDescription(operation);

  return (
    <ApplicationGate apps={appForApiPath(operation.path)} label={humanizeIdentifier(operation.tag)}>
      <article className="ma-editor">
        {showHeader ? <header className="ma-editor-head">
          <span className={`ma-action-mark is-${operation.risk}`}>{cloneElement(operation.risk === 'destructive' ? Icons.x : operation.risk === 'sensitive' ? Icons.shield : Icons.plus, { size: 17 })}</span>
          <div><span>{humanizeIdentifier(operation.tag)}</span><h3>{actionTitle}</h3>{actionDescription ? <p>{actionDescription}</p> : null}</div>
        </header> : null}
        <form onSubmit={submit}>
          {pathParameters.length > 0 ? <fieldset className="ma-fields"><legend>Target record</legend>{pathParameters.map((parameter) => <label className="ma-field" key={parameter.name}><span>{humanizeIdentifier(parameter.name)} *</span><input required type={parameter.schema?.type === 'integer' ? 'number' : 'text'} min={parameter.schema?.type === 'integer' ? 1 : undefined} value={pathValues[parameter.name] || ''} onChange={(event) => setPathValues((current) => ({ ...current, [parameter.name]: event.target.value }))} placeholder="Record number" /></label>)}</fieldset> : null}
          {hasRequestBody && (multipart || fields.length) ? <fieldset className="ma-fields"><legend>Details</legend>{multipart ? <><label className="ma-field is-wide ma-file-field"><span>CSV file *</span><input required type="file" accept={multipart.accept} onChange={(event) => setUploadFile(event.target.files?.[0] || null)} /><small>{uploadFile ? `${uploadFile.name} · ${Math.max(1, Math.ceil(uploadFile.size / 1024))} KB` : multipart.help}</small></label>{fields.map(([name, fieldSchema]) => <FieldControl key={name} name={name} schema={fieldSchema} required={requiredFields.has(name)} value={valueForInput(fieldSchema, fieldValues[name])} onChange={(value) => setFieldValues((current) => ({ ...current, [name]: value }))} />)}</> : fields.map(([name, fieldSchema]) => <FieldControl key={name} name={name} schema={fieldSchema} required={requiredFields.has(name)} value={valueForInput(fieldSchema, fieldValues[name])} onChange={(value) => setFieldValues((current) => ({ ...current, [name]: value }))} />)}</fieldset> : null}
          {operation.risk !== 'standard' ? <label className="ma-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this action</strong><small>{operation.risk === 'destructive' ? 'It may permanently remove a record.' : 'It changes an important workflow state or may trigger an external effect.'}</small></span></label> : null}
          {localError ? <div className="ma-error" role="alert">{localError}</div> : null}
          {failure && isServiceUnavailable(failure) ? <ApplicationUnavailableState label={humanizeIdentifier(operation.tag)} status="unavailable" compact /> : failure ? <div className="ma-error" role="alert"><strong>{failure.partialSuccess ? failure.message : failureDetails[0] || userFacingError(failure, { fallback: 'The action could not be completed.' })}</strong>{failureDetails.length > 1 ? <ul>{failureDetails.slice(1).map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}{failure.requestId ? <small>Support reference: {failure.requestId}</small> : null}</div> : null}
          {result !== undefined ? <div className="ma-result" role="status"><strong>Completed successfully</strong><span>The register has been refreshed with the latest information.</span></div> : null}
          <footer className="ma-submit"><small>Required fields are marked. Nothing is changed until you confirm.</small><button className={operation.risk === 'destructive' ? 'is-danger' : ''} type="submit" disabled={mutation.isPending || (operation.risk !== 'standard' && !confirmed)}>{mutation.isPending ? 'Saving…' : actionTitle}</button></footer>
        </form>
      </article>
    </ApplicationGate>
  );
}

function ActionModal({ operation, schemaDocument, recordId, onClose }) {
  const dialog = useRef(null);
  const presentation = operationPresentation(operation);
  const title = presentation?.title || operation?.label || 'Complete action';
  const description = presentation?.description || businessDescription(operation);
  useEffect(() => {
    if (!operation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    window.requestAnimationFrame(() => dialog.current?.querySelector('.ma-modal-body input, .ma-modal-body select, .ma-modal-body textarea, .ma-modal-body button')?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, operation]);
  if (!operation) return null;
  return createPortal(<div className="ma-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="ma-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ma-modal-title">
      <header className="ma-modal-head"><div><span>{humanizeIdentifier(operation.tag)}</span><h2 id="ma-modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" onClick={onClose} aria-label="Close form">{cloneElement(Icons.x, { size: 17 })}</button></header>
      <div className="ma-modal-body"><ActionEditor operation={operation} schemaDocument={schemaDocument} recordId={recordId} onComplete={onClose} showHeader={false} /></div>
    </section>
  </div>, document.body);
}

function ActionChooserModal({ operations, onChoose, onClose }) {
  if (!operations.length) return null;
  return createPortal(<div className="ma-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="ma-modal ma-chooser" role="dialog" aria-modal="true" aria-labelledby="ma-chooser-title">
      <header className="ma-modal-head"><div><span>Available actions</span><h2 id="ma-chooser-title">What would you like to do?</h2><p>Choose one focused workflow to continue.</p></div><button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 17 })}</button></header>
      <div className="ma-action-grid">{operations.map((operation) => <button type="button" key={operation.key} onClick={() => onChoose(operation)}><span className={`ma-list-icon is-${operation.risk}`}>{cloneElement(operation.risk === 'destructive' ? Icons.x : operation.risk === 'sensitive' ? Icons.shield : Icons.plus, { size: 14 })}</span><span><strong>{operationPresentation(operation)?.title || operation.label}</strong><small>{businessDescription(operation) || humanizeIdentifier(operation.tag)}</small></span>{cloneElement(Icons.chevR, { size: 14 })}</button>)}</div>
    </section>
  </div>, document.body);
}

export function ManagementActions({
  capabilities,
  pathPrefix = '',
  recordId = null,
  collectionOnly = false,
  showAll = false,
  compact = false,
  title = 'Management actions',
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(showAll);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [editorOperation, setEditorOperation] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const schema = useOpenApiSchema({ enabled: true });
  const operations = useMemo(() => {
    if (!schema.data || readOnly) return [];
    return managementOperations(schema.data)
      .filter((operation) => !pathPrefix || operationPathMatches(operation, pathPrefix, { collectionOnly }))
      .filter((operation) => operationAllowed(operation, capabilities))
      .filter((operation) => {
        if (multipartContractForOperation(operation)) return true;
        const resolved = operationContract(operation)?.schema || resolveOpenApiSchema(operation.requestSchema, schema.data);
        if (!operation.requestSchema && !operation.requestBodyRequired) return true;
        return Object.keys(resolved?.properties || {}).length > 0;
      });
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

  if (!readOnly && !schema.isLoading && !schema.error && operations.length === 0) return null;

  const openSelected = () => {
    if (selected) setEditorOperation(selected);
  };

  if (compact) return <>
    <button className="ma-compact-trigger" type="button" disabled={schema.isLoading || !operations.length} onClick={() => operations.length === 1 ? openSelected() : setChooserOpen(true)}>{cloneElement(Icons.plus, { size: 15 })}{schema.isLoading ? 'Preparing…' : operations.length === 1 ? (operationPresentation(selected)?.title || selected?.label || 'Create') : 'Choose action'}</button>
    <ActionChooserModal operations={chooserOpen ? visible : []} onClose={() => setChooserOpen(false)} onChoose={(operation) => { setChooserOpen(false); setSelectedKey(operation.key); setEditorOperation(operation); }} />
    <ActionModal operation={editorOperation} schemaDocument={schema.data} recordId={recordId} onClose={() => setEditorOperation(null)} />
  </>;

  return (
    <section className={`ma-shell${showAll ? ' is-full' : ''}`} aria-label={title}>
      <header className="ma-shell-head">
        <span className="ma-shell-icon">{cloneElement(Icons.settings, { size: 18 })}</span>
        <div><h2>{title}</h2><p>{showAll ? 'Every management mutation advertised by the connected service, filtered to this account’s exact capabilities.' : 'Create, update, and run the actions connected to this register.'}</p></div>
        {!showAll ? <button type="button" disabled={schema.isLoading || !operations.length} onClick={() => operations.length === 1 ? openSelected() : setExpanded((value) => !value)} aria-expanded={operations.length > 1 ? expanded : undefined}>{schema.isLoading ? 'Preparing…' : operations.length === 1 ? (operationPresentation(selected)?.title || selected?.label || 'Open form') : expanded ? 'Close actions' : 'Choose action'}{cloneElement(Icons.chevR, { size: 15 })}</button> : <span className="ma-count">{schema.isLoading ? 'Checking…' : `${operations.length} available`}</span>}
      </header>
      {expanded && operations.length > 1 ? <div className="ma-body">
        {readOnly ? <div className="ma-empty"><strong>This is a view-only session</strong><p>Sign in directly with an authorized management account to make changes.</p></div> : schema.isLoading ? <div className="ma-loading" role="status"><i /> <span><strong>Preparing available actions…</strong><small>Checking the controls available to your account.</small></span></div> : schema.error ? <div className="ma-empty" role="alert"><strong>Management controls could not be prepared</strong><p>{userFacingError(schema.error, { fallback: 'Try again after the service is available.' })}</p><button type="button" onClick={() => schema.refetch()}>Try again</button></div> : operations.length === 0 ? null : <>
          {operations.length > 1 ? <div className="ma-filterbar"><label>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an action" aria-label="Find a management action" /></label>{categories.length > 1 ? <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter actions by area"><option value="">All areas</option>{categories.map((item) => <option key={item} value={item}>{humanizeIdentifier(item)}</option>)}</select> : null}<span>{visible.length} of {operations.length}</span></div> : null}
          {visible.length === 0 ? <div className="ma-empty"><strong>No matching actions</strong><p>Clear the search or choose another area.</p></div> : <div className="ma-action-grid">{visible.map((operation) => <button type="button" key={operation.key} onClick={() => { setSelectedKey(operation.key); setEditorOperation(operation); }}><span className={`ma-list-icon is-${operation.risk}`}>{cloneElement(operation.risk === 'destructive' ? Icons.x : operation.risk === 'sensitive' ? Icons.shield : Icons.plus, { size: 14 })}</span><span><strong>{operationPresentation(operation)?.title || operation.label}</strong><small>{businessDescription(operation) || humanizeIdentifier(operation.tag)}</small></span>{cloneElement(Icons.chevR, { size: 14 })}</button>)}</div>}
        </>}
      </div> : null}
      <ActionModal operation={editorOperation} schemaDocument={schema.data} recordId={recordId} onClose={() => setEditorOperation(null)} />
    </section>
  );
}
