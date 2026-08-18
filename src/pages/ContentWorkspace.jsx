import { cloneElement, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { Icons } from '../components/Icons.jsx';
import { SecureFilePreview } from '../components/SecureFilePreview.jsx';
import { fileTypeLabel } from '../components/secureFilePreview.js';
import {
  ActionButton,
  CoverageBar,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessNumber, formatOrganizationDate } from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { safeDocumentUrl } from '../lib/safeExternalUrl.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';
import '../styles/content-workspace.css';

const SECTIONS = Object.freeze([
  { id: 'library', label: 'Library', description: 'Files, folders, and audiences', icon: Icons.folder },
  { id: 'review', label: 'Review & publish', description: 'Publication readiness', icon: Icons.check },
  { id: 'print', label: 'Print queue', description: 'Documents being printed', icon: Icons.doc },
  { id: 'printers', label: 'Printers', description: 'Equipment and connection state', icon: Icons.settings },
]);

const SECTION_ALIASES = Object.freeze({
  libraries: 'library', folders: 'library', files: 'library', materials: 'library',
  courses: 'library', modules: 'library', lessons: 'library',
  jobs: 'print', 'print-jobs': 'print', 'print-work': 'print',
  agents: 'printers', connections: 'printers',
});

const PRINTABLE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function fileSize(value) {
  let amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(unit === 0 ? 0 : amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

function normalizedFilename(file) {
  const source = String(file?.name || 'document').normalize('NFKD');
  const safe = source.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 255);
  return safe || 'document';
}

function detectedContentType(file) {
  if (file?.type) return file.type;
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  return {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', webm: 'audio/webm',
  }[extension] || 'application/octet-stream';
}

function libraryScope(library) {
  if (library.visibility === 'cohort') return library.cohort_name || 'One learning group';
  if (library.visibility === 'department') return library.department_name || 'One department';
  if (library.visibility === 'role') return (library.allowed_roles || []).join(', ') || 'Selected responsibilities';
  return 'Entire education center';
}

function publicationState(file) {
  if (file.status === 'pending') {
    const changedAt = new Date(file.updated_at || file.created_at || 0).getTime();
    const delayed = changedAt > 0 && Date.now() - changedAt > 90_000;
    return { key: 'checking', label: delayed ? 'Check delayed' : 'Checking file', tone: delayed ? 'danger' : 'warn', step: 0, delayed };
  }
  if (file.status === 'rejected') return { key: 'rejected', label: 'File rejected', tone: 'danger', step: 0 };
  if (!file.is_approved_teacher) return { key: 'teacher', label: 'Teacher review', tone: 'warn', step: 1 };
  if (!file.is_approved_manager) return { key: 'manager', label: 'Manager approval', tone: 'warn', step: 2 };
  return { key: 'published', label: 'Published', tone: 'success', step: 3 };
}

function printStateTone(value) {
  if (value === 'done') return 'success';
  if (['failed', 'cancelled', 'reconciliation_required'].includes(value)) return 'danger';
  if (['queued', 'picked', 'printing'].includes(value)) return 'warn';
  return 'neutral';
}

function BusinessModal({ open, title, eyebrow, description, onClose, children, footer, wide = false, viewer = false }) {
  if (!open) return null;
  return <div className="content-modal-backdrop" role="presentation" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className={`content-modal${wide ? ' is-wide' : ''}${viewer ? ' is-viewer' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><span>{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 18 })}</button></header>
      <div className="content-modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  </div>;
}

function FilePreviewModal({ preview, onClose }) {
  const file = preview?.file;
  const url = preview?.url;
  const openOriginal = () => window.open(url, '_blank', 'noopener,noreferrer');
  return <BusinessModal
    open={Boolean(file && url)}
    wide
    viewer
    title={file?.title || 'File preview'}
    eyebrow="Secure preview"
    description="Inspect the actual uploaded file before approving, publishing, or printing it."
    onClose={onClose}
    footer={<><p>{fileTypeLabel(file?.content_type)} · {fileSize(file?.size_bytes)} · This secure link expires automatically.</p><ActionButton icon={Icons.doc} tone="primary" onClick={openOriginal}>Open separately</ActionButton></>}
  >
    <SecureFilePreview file={file} url={url} />
  </BusinessModal>;
}

function ContentSummary({ libraries, folders, files, jobs }) {
  const published = files.rows.filter((file) => publicationState(file).step === 3).length;
  const reviewing = files.rows.filter((file) => [1, 2].includes(publicationState(file).step)).length;
  const printing = jobs.rows.filter((job) => ['queued', 'picked', 'printing'].includes(job.status)).length;
  const cards = [
    { label: 'Libraries', value: libraries.pending ? '…' : formatBusinessNumber(libraries.total), note: `${formatBusinessNumber(folders.total)} organized folders`, icon: Icons.folder },
    { label: 'Published files', value: files.pending ? '…' : formatBusinessNumber(published), note: 'Ready for permitted learners', icon: Icons.check },
    { label: 'Awaiting review', value: files.pending ? '…' : formatBusinessNumber(reviewing), note: 'Human publication checks', icon: Icons.shield },
    { label: 'Printing now', value: jobs.enabled ? formatBusinessNumber(printing) : 'Open queue', note: 'Queued or at a printer', icon: Icons.doc },
  ];
  return <div className="content-summary">{cards.map((card) => <article key={card.label}><span>{cloneElement(card.icon, { size: 19 })}</span><div><small>{card.label}</small><strong>{card.value}</strong><p>{card.note}</p></div></article>)}</div>;
}

function LibraryForm({ open, onClose, branches, departments, cohorts }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', visibility: 'tenant', department: '', cohort: '' });
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => httpRequest('POST', '/api/v1/content/libraries/', { body: {
      name: form.name.trim(), description: form.description.trim(), visibility: form.visibility,
      allowed_roles: [], is_active: true,
      department: form.visibility === 'department' ? Number(form.department) : null,
      cohort: form.visibility === 'cohort' ? Number(form.cohort) : null,
    } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Library created.'); onClose(); },
    onError: (failure) => setError(userFacingError(failure, { fallback: 'The library could not be created.' })),
  });
  const valid = form.name.trim() && (form.visibility !== 'department' || form.department) && (form.visibility !== 'cohort' || form.cohort);
  return <BusinessModal open={open} title="Create a learning library" eyebrow="Library setup" description="Choose exactly who this collection is for. You can add folders and files immediately afterward." onClose={onClose} footer={<><p>Visibility is enforced again whenever a file is opened.</p><ActionButton tone="primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Creating…' : 'Create library'}</ActionButton></>}>
    <div className="content-form-grid"><label className="is-wide"><span>Library name</span><input autoFocus maxLength="200" placeholder="For example, English teaching resources" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="is-wide"><span>Description</span><textarea maxLength="1200" placeholder="What colleagues and learners will find here" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label><span>Audience</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value, department: '', cohort: '' })}><option value="tenant">Entire education center</option><option value="department">One department</option><option value="cohort">One learning group</option></select></label>{form.visibility === 'department' && <label><span>Department</span><select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option value="">Choose department</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}{item.branch_name ? ` · ${item.branch_name}` : ''}</option>)}</select></label>}{form.visibility === 'cohort' && <label><span>Learning group</span><select value={form.cohort} onChange={(event) => setForm({ ...form, cohort: event.target.value })}><option value="">Choose group</option>{cohorts.map((item) => <option value={item.id} key={item.id}>{item.name}{item.branch_name ? ` · ${item.branch_name}` : ''}</option>)}</select></label>}</div>
    {branches.length > 1 && <div className="content-form-note">Department and group options keep their own branch ownership automatically.</div>}{error && <p className="content-error" role="alert">{error}</p>}
  </BusinessModal>;
}

function FolderForm({ open, onClose, libraries, folders }) {
  const toast = useToast();
  const [form, setForm] = useState({ library: '', parent: '', name: '' });
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: () => httpRequest('POST', '/api/v1/content/folders/', { body: { library: Number(form.library), parent: form.parent ? Number(form.parent) : null, name: form.name.trim() } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Folder created.'); onClose(); }, onError: (failure) => setError(userFacingError(failure, { fallback: 'The folder could not be created.' })) });
  return <BusinessModal open={open} title="Create a folder" eyebrow="Organize resources" description="Place the folder in one library, with an optional parent folder." onClose={onClose} footer={<><p>New uploads can be placed here immediately.</p><ActionButton tone="primary" disabled={!form.library || !form.name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Creating…' : 'Create folder'}</ActionButton></>}><div className="content-form-grid"><label><span>Library</span><select value={form.library} onChange={(event) => setForm({ ...form, library: event.target.value, parent: '' })}><option value="">Choose library</option>{libraries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Inside folder (optional)</span><select value={form.parent} disabled={!form.library} onChange={(event) => setForm({ ...form, parent: event.target.value })}><option value="">Top level</option>{folders.filter((item) => String(item.library) === form.library).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="is-wide"><span>Folder name</span><input autoFocus maxLength="200" placeholder="For example, Presentations" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label></div>{error && <p className="content-error" role="alert">{error}</p>}</BusinessModal>;
}

function UploadForm({ open, onClose, folders }) {
  const toast = useToast();
  const [form, setForm] = useState({ folder: '', title: '', file: null, downloadable: true });
  const [error, setError] = useState('');
  const upload = useMutation({
    mutationFn: async () => {
      const contentType = detectedContentType(form.file);
      const grant = await httpRequest('POST', '/api/v1/content/upload-url/', { body: { filename: normalizedFilename(form.file), content_type: contentType, size_bytes: form.file.size, title: form.title.trim() || form.file.name, folder: Number(form.folder), is_downloadable: form.downloadable } });
      const destination = safeDocumentUrl(grant?.url);
      if (!destination) throw new Error('The secure upload destination could not be verified.');
      const response = await fetch(destination, { method: 'PUT', headers: { 'Content-Type': contentType }, body: form.file });
      if (!response.ok) throw new Error('The file could not be transferred to secure storage.');
      return httpRequest('POST', `/api/v1/content/files/${Number(grant.file_id)}/confirm/`, { body: {} });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('File uploaded. It will appear after the safety check finishes.', { title: 'Upload complete' }); onClose(); },
    onError: (failure) => setError(userFacingError(failure, { fallback: failure?.message || 'The file could not be uploaded. Please try again.' })),
  });
  return <BusinessModal open={open} title="Upload to the library" eyebrow="New resource" description="Choose its folder, a clear display name, and whether permitted learners may save a copy." onClose={onClose} footer={<><p>Files are checked before they can be published.</p><ActionButton icon={Icons.plus} tone="primary" disabled={!form.folder || !form.file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? 'Uploading…' : 'Upload file'}</ActionButton></>}>
    {!folders.length ? <div className="content-modal-empty"><span>{cloneElement(Icons.folder, { size: 24 })}</span><strong>A folder is needed first</strong><p>Create a library and folder, then return here to upload the resource.</p></div> : <div className="content-form-grid"><label className="is-wide"><span>File</span><input type="file" accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp,.mp4,.mp3,.m4a,.webm" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null, title: form.title || event.target.files?.[0]?.name?.replace(/\.[^.]+$/, '') || '' })} /></label><label><span>Folder</span><select value={form.folder} onChange={(event) => setForm({ ...form, folder: event.target.value })}><option value="">Choose folder</option>{folders.map((item) => <option value={item.id} key={item.id}>{item.library_name} · {item.name}</option>)}</select></label><label><span>Display name</span><input maxLength="255" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="content-choice-card is-wide"><input type="checkbox" checked={form.downloadable} onChange={(event) => setForm({ ...form, downloadable: event.target.checked })} /><span><strong>Allow permitted learners to download</strong><small>Turn this off for view-only material. Browser screenshots cannot be reliably prevented.</small></span></label></div>}{error && <p className="content-error" role="alert">{error}</p>}
  </BusinessModal>;
}

function LibraryShelf({ libraries, folders, selected, onSelect, canWrite, onLibrary, onFolder }) {
  return <section className="content-shelf"><header><div><span>Collections</span><h2>Learning libraries</h2><p>Each library has a clear audience and its own folders.</p></div>{canWrite && <div><ActionButton icon={Icons.folder} onClick={onFolder}>New folder</ActionButton><ActionButton icon={Icons.plus} tone="primary" onClick={onLibrary}>New library</ActionButton></div>}</header><div>{libraries.map((library) => { const count = folders.filter((folder) => String(folder.library) === String(library.id)).length; return <button type="button" className={String(selected) === String(library.id) ? 'is-active' : ''} onClick={() => onSelect(String(selected) === String(library.id) ? '' : String(library.id))} key={library.id}><span>{cloneElement(Icons.folder, { size: 18 })}</span><strong>{library.name}</strong><small>{libraryScope(library)}</small><b>{formatBusinessNumber(count)} folder{count === 1 ? '' : 's'}</b></button>; })}</div></section>;
}

function FileCards({ rows, printers, canWrite, canPrint, onPrint, onPreview, previewBusy, onRecheck, recheckBusy }) {
  const toast = useToast();
  const [removing, setRemoving] = useState(null);
  const remove = async (file) => {
    if (!window.confirm(`Remove “${file.title}” from the library? Published links will stop working.`)) return;
    setRemoving(file.id);
    try {
      await httpRequest('DELETE', `/api/v1/content/files/${Number(file.id)}/`);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('File removed.');
    } catch (failure) {
      toast.danger(userFacingError(failure, { fallback: 'The file could not be removed.' }));
    } finally {
      setRemoving(null);
    }
  };
  return <div className="content-file-grid">{rows.map((file) => {
    const state = publicationState(file);
    const clean = file.status === 'clean';
    const printable = PRINTABLE_TYPES.has(file.content_type) && state.step === 3;
    return <article key={file.id}>
      <header><span>{cloneElement(Icons.doc, { size: 20 })}</span><StatusPill value={state.label} tone={state.tone} /></header>
      <h3>{file.title || `File ${file.id}`}</h3>
      <p>{file.library_name || 'Learning library'} · {file.folder_name || file.lesson_title || 'Resource'}</p>
      {file.reject_reason && <p className="content-file-problem">{file.reject_reason}</p>}
      {state.delayed && <p className="content-file-problem">The safety worker has not completed this check yet. Queue it again below.</p>}
      <dl><div><dt>Size</dt><dd>{fileSize(file.size_bytes)}</dd></div><div><dt>Version</dt><dd>{formatBusinessNumber(file.version || 1)}</dd></div><div><dt>Views</dt><dd>{formatBusinessNumber(file.view_count || 0)}</dd></div><div><dt>Downloads</dt><dd>{formatBusinessNumber(file.download_count || 0)}</dd></div></dl>
      <footer><small>{file.is_downloadable ? 'Download allowed' : 'View only'} · {formatOrganizationDate(file.created_at, { dateOnly: true }) || 'Date not recorded'}</small><div>
        {clean && <button type="button" disabled={previewBusy === file.id} onClick={() => onPreview(file)}>{previewBusy === file.id ? 'Opening…' : 'View file'}</button>}
        {canPrint && printable && printers.length > 0 && <button type="button" onClick={() => onPrint(file)}>Print</button>}
        {canWrite && file.status === 'pending' && <button type="button" disabled={recheckBusy === file.id} onClick={() => onRecheck(file)}>{recheckBusy === file.id ? 'Queuing…' : 'Check again'}</button>}
        {canWrite && <button className="is-danger" type="button" disabled={removing === file.id} onClick={() => remove(file)}>{removing === file.id ? 'Removing…' : 'Remove'}</button>}
      </div></footer>
    </article>;
  })}</div>;
}

function LibraryView({ libraries, folders, files, printers, canWrite, canPrint, onLibrary, onFolder, onUpload, onPrint, onPreview, previewBusy, onRecheck, recheckBusy }) {
  const [query, setQuery] = useState('');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [state, setState] = useState('all');
  const visible = files.rows.filter((file) => (!selectedLibrary || String(file.library) === selectedLibrary) && (state === 'all' || publicationState(file).key === state) && (!query.trim() || [file.title, file.library_name, file.folder_name, file.uploaded_by_name].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase()))));
  return <><LibraryShelf libraries={libraries.rows} folders={folders.rows} selected={selectedLibrary} onSelect={setSelectedLibrary} canWrite={canWrite} onLibrary={onLibrary} onFolder={onFolder} /><section className="content-register"><header><div><span>Resource directory</span><h2>Files available in this view</h2></div>{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={onUpload}>Upload file</ActionButton>}</header><div className="content-toolbar"><label>{cloneElement(Icons.search, { size: 16 })}<input aria-label="Search library files" placeholder="Search title, folder, or uploader" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter publication state" value={state} onChange={(event) => setState(event.target.value)}><option value="all">All publication states</option><option value="checking">Checking file</option><option value="teacher">Teacher review</option><option value="manager">Manager approval</option><option value="published">Published</option><option value="rejected">Rejected</option></select></div><CoverageBar state={files} label="library files" filtered={Boolean(query || selectedLibrary || state !== 'all')} /><WorkspaceState state={files} empty={!visible.length} emptyTitle={files.rows.length ? 'No files match these filters' : 'Your learning library is ready for its first resource'} emptyBody={files.rows.length ? 'Clear a filter or choose another library.' : 'Create a folder and upload the first lesson resource, policy, worksheet, or presentation.'}><FileCards rows={visible} printers={printers.rows} canWrite={canWrite} canPrint={canPrint} onPrint={onPrint} onPreview={onPreview} previewBusy={previewBusy} onRecheck={onRecheck} recheckBusy={recheckBusy} /></WorkspaceState>{!files.rows.length && canWrite && <div className="content-empty-actions"><ActionButton icon={Icons.folder} onClick={onFolder}>Create folder</ActionButton><ActionButton icon={Icons.plus} tone="primary" onClick={onUpload}>Upload first file</ActionButton></div>}</section></>;
}

function ReviewView({ files, canApprove, canPublish, onPreview, previewBusy }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [downloadPolicy, setDownloadPolicy] = useState({});
  const reviewRows = files.rows.filter((file) => publicationState(file).step < 3 || file.status === 'rejected');
  const act = async (file, action) => {
    setBusy(file.id);
    try {
      const body = action === 'approve-manager' ? { is_downloadable: downloadPolicy[file.id] ?? file.is_downloadable } : {};
      const fileId = Number(file.id);
      const path = action === 'approve-teacher'
        ? `/api/v1/content/files/${fileId}/approve-teacher/`
        : action === 'approve-manager'
          ? `/api/v1/content/files/${fileId}/approve-manager/`
          : null;
      if (!path) throw new Error('This publication action is unavailable.');
      await httpRequest('POST', path, { body });
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(action === 'approve-manager' ? 'File published.' : 'Teacher review recorded.');
    } catch (failure) { toast.danger(userFacingError(failure, { fallback: 'This publication step could not be completed.' })); }
    finally { setBusy(null); }
  };
  return <section className="content-review"><header><div><span>Publication desk</span><h2>Review before learners see it</h2><p>Open the real file first, then record teacher and management approval separately.</p></div><div className="content-review-legend"><i>1</i><span>File check</span><i>2</i><span>Teacher</span><i>3</i><span>Manager</span></div></header><WorkspaceState state={files} empty={!reviewRows.length} emptyTitle="Publication desk is clear" emptyBody="There are no checked files waiting for a human decision."><div className="content-review-list">{reviewRows.map((file) => { const state = publicationState(file); const policy = downloadPolicy[file.id] ?? file.is_downloadable; return <article key={file.id}><div className="content-review-file"><span>{cloneElement(state.tone === 'danger' ? Icons.flag : Icons.doc, { size: 20 })}</span><div><StatusPill value={state.label} tone={state.tone} /><h3>{file.title}</h3><p>{file.library_name} · Uploaded by {file.uploaded_by_name || 'staff member'} · {fileSize(file.size_bytes)}</p>{file.reject_reason && <strong>{file.reject_reason}</strong>}</div></div><div className="content-review-steps"><span className={file.status === 'clean' ? 'is-done' : ''}>File checked</span><span className={file.is_approved_teacher ? 'is-done' : ''}>Teacher reviewed</span><span className={file.is_approved_manager ? 'is-done' : ''}>Manager published</span></div><footer>{file.status === 'clean' && <ActionButton icon={Icons.doc} disabled={previewBusy === file.id} onClick={() => onPreview(file)}>{previewBusy === file.id ? 'Opening…' : 'Preview file'}</ActionButton>}{state.step === 1 && canApprove && <ActionButton tone="primary" disabled={busy === file.id} onClick={() => act(file, 'approve-teacher')}>{busy === file.id ? 'Saving…' : 'Record teacher approval'}</ActionButton>}{state.step === 2 && canPublish && <><label><input type="checkbox" checked={policy} onChange={(event) => setDownloadPolicy((current) => ({ ...current, [file.id]: event.target.checked }))} /><span>Allow learner download</span></label><ActionButton tone="primary" disabled={busy === file.id} onClick={() => act(file, 'approve-manager')}>{busy === file.id ? 'Publishing…' : 'Publish file'}</ActionButton></>}</footer></article>; })}</div></WorkspaceState></section>;
}

function PrintForm({ open, onClose, initialFile, files, printers, branches }) {
  const toast = useToast();
  const [form, setForm] = useState({ mode: initialFile ? 'library' : 'upload', source: initialFile?.id ? String(initialFile.id) : '', branch: '', printer: '', file: null, copies: '1', color: false, duplex: false, scheduled: '' });
  const [error, setError] = useState('');
  const selectedPrinter = printers.find((item) => String(item.id) === form.printer);
  const availablePrinters = printers.filter((item) => item.is_active && (!form.branch || String(item.branch) === form.branch));
  const printableFiles = files.filter((file) => PRINTABLE_TYPES.has(file.content_type) && publicationState(file).step === 3);
  const submit = useMutation({
    mutationFn: async () => {
      let sourceId = Number(form.source);
      if (form.mode === 'upload') {
        const contentType = detectedContentType(form.file);
        if (!PRINTABLE_TYPES.has(contentType)) throw new Error('Choose a PDF, JPG, PNG, or WEBP file.');
        const grant = await httpRequest('POST', '/api/v1/printing/upload-url/', { body: { branch: Number(form.branch), filename: normalizedFilename(form.file), content_type: contentType, size_bytes: form.file.size } });
        const destination = safeDocumentUrl(grant?.url);
        if (!destination || !grant?.fields || typeof grant.fields !== 'object') throw new Error('The secure print upload could not be prepared.');
        const payload = new FormData();
        Object.entries(grant.fields).forEach(([key, value]) => payload.append(key, String(value)));
        payload.append('file', form.file);
        const uploaded = await fetch(destination, { method: 'POST', body: payload });
        if (!uploaded.ok) throw new Error('The print file could not be transferred to secure storage.');
        sourceId = Number(grant.grant_id);
      }
      return httpRequest('POST', '/api/v1/printing/jobs/', { body: { source: form.mode === 'upload' ? 'upload' : 'content', source_id: sourceId, printer: Number(form.printer), copies: Number(form.copies), color: form.color, duplex: form.duplex, scheduled_for: form.scheduled || null } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success(form.scheduled ? 'Print job scheduled.' : 'Document added to the print queue.'); onClose(); },
    onError: (failure) => setError(userFacingError(failure, { fallback: failure?.message || 'The print job could not be created.' })),
  });
  const valid = form.printer && (form.mode === 'library' ? form.source : form.branch && form.file);
  return <BusinessModal open={open} wide title="Print a document" eyebrow="Quick print" description="Choose a library resource or upload a document, then send it to an available branch printer." onClose={onClose} footer={<><p>{form.scheduled ? 'The document will wait securely until its scheduled time.' : 'The branch printer will claim the job as soon as it is available.'}</p><ActionButton icon={Icons.doc} tone="primary" disabled={!valid || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Sending…' : form.scheduled ? 'Schedule print' : 'Add to print queue'}</ActionButton></>}>
    <div className="content-mode-switch"><button className={form.mode === 'library' ? 'is-active' : ''} type="button" onClick={() => setForm({ ...form, mode: 'library', file: null, branch: '' })}>{cloneElement(Icons.folder, { size: 17 })}<span><strong>From library</strong><small>Use an approved resource</small></span></button><button className={form.mode === 'upload' ? 'is-active' : ''} type="button" onClick={() => setForm({ ...form, mode: 'upload', source: '', branch: initialFile?.cohort ? String(initialFile.cohort) : '' })}>{cloneElement(Icons.plus, { size: 17 })}<span><strong>Upload once</strong><small>PDF or image</small></span></button></div>
    <div className="content-form-grid">{form.mode === 'library' ? <label className="is-wide"><span>Library file</span><select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option value="">Choose a published file</option>{printableFiles.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.library_name}</option>)}</select></label> : <><label><span>Branch</span><select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value, printer: '' })}><option value="">Choose branch</option>{branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Document</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label></>}<label><span>Printer</span><select value={form.printer} onChange={(event) => setForm({ ...form, printer: event.target.value, color: false, duplex: false })}><option value="">Choose an active printer</option>{availablePrinters.map((item) => <option value={item.id} key={item.id}>{item.name}{item.model_name ? ` · ${item.model_name}` : ''}</option>)}</select></label><label><span>Copies</span><input type="number" min="1" max="100" value={form.copies} onChange={(event) => setForm({ ...form, copies: event.target.value })} /></label><label><span>Print time (optional)</span><input type="datetime-local" value={form.scheduled} onChange={(event) => setForm({ ...form, scheduled: event.target.value })} /></label><div className="content-option-row"><label className={!selectedPrinter?.capabilities?.color ? 'is-disabled' : ''}><input type="checkbox" disabled={!selectedPrinter?.capabilities?.color} checked={form.color} onChange={(event) => setForm({ ...form, color: event.target.checked })} /><span>Color</span></label><label className={!selectedPrinter?.capabilities?.duplex ? 'is-disabled' : ''}><input type="checkbox" disabled={!selectedPrinter?.capabilities?.duplex} checked={form.duplex} onChange={(event) => setForm({ ...form, duplex: event.target.checked })} /><span>Double-sided</span></label></div></div>{error && <p className="content-error" role="alert">{error}</p>}
  </BusinessModal>;
}

function PrintQueue({ jobs, printers, canWrite, onPrint }) {
  const printerName = (id) => printers.rows.find((printer) => String(printer.id) === String(id))?.name || `Printer ${id || 'not assigned'}`;
  const current = jobs.rows.filter((job) => !['done', 'cancelled'].includes(job.status)).length;
  const completed = jobs.rows.filter((job) => job.status === 'done').length;
  const attention = jobs.rows.filter((job) => ['failed', 'reconciliation_required'].includes(job.status)).length;
  return <section className="content-print-queue"><header><div><span>Branch print service</span><h2>Print queue</h2><p>Follow every document from submission to completed pages.</p></div>{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={() => onPrint(null)}>Quick print</ActionButton>}</header><div className="content-queue-metrics"><article><small>Open jobs</small><strong>{formatBusinessNumber(current)}</strong><p>Waiting or printing</p></article><article><small>Completed in view</small><strong>{formatBusinessNumber(completed)}</strong><p>Confirmed by a printer</p></article><article className={attention ? 'is-danger' : ''}><small>Needs attention</small><strong>{formatBusinessNumber(attention)}</strong><p>Failed or needs confirmation</p></article></div><CoverageBar state={jobs} label="print jobs" /><WorkspaceState state={jobs} empty={!jobs.rows.length} emptyTitle="The print queue is clear" emptyBody="Use Quick print to send a PDF or image, or choose Print from a published library file."><WorkspaceTable label="Print queue" rows={jobs.rows} columns={[{ key: 'id', label: 'Job', render: (row) => `#${row.id}` }, { key: 'printer', label: 'Printer', render: (row) => printerName(row.printer || row.preferred_printer) }, { key: 'source', label: 'Document', render: (row) => row.source === 'content' ? `Library file #${row.source_id}` : row.source === 'upload' ? 'Uploaded document' : String(row.source || '').replaceAll('_', ' ') }, { key: 'copies', label: 'Copies', render: (row) => formatBusinessNumber(row.copies) }, { key: 'pages_printed', label: 'Pages printed', render: (row) => row.pages_printed == null ? '—' : formatBusinessNumber(row.pages_printed) }, { key: 'created_at', label: 'Added', render: (row) => formatOrganizationDate(row.created_at) }, { key: 'status', label: 'State', render: (row) => <StatusPill value={String(row.status || '').replaceAll('_', ' ')} tone={printStateTone(row.status)} /> }]} /></WorkspaceState></section>;
}

function PrinterForm({ open, onClose, branches }) {
  const toast = useToast();
  const [form, setForm] = useState({ branch: '', name: '', model: '', color: false, duplex: false, paper: ['A4'] });
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: () => httpRequest('POST', '/api/v1/printing/printers/', { body: { branch: Number(form.branch), name: form.name.trim(), model_name: form.model.trim(), capabilities: { color: form.color, duplex: form.duplex, paper: form.paper }, is_active: true } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Printer added.'); onClose(); }, onError: (failure) => setError(userFacingError(failure, { fallback: 'The printer could not be added.' })) });
  const togglePaper = (paper) => setForm({ ...form, paper: form.paper.includes(paper) ? form.paper.filter((item) => item !== paper) : [...form.paper, paper] });
  return <BusinessModal open={open} title="Add a branch printer" eyebrow="Printer setup" description="Record the equipment people will recognize and the options it actually supports." onClose={onClose} footer={<><p>A branch connector must be online before jobs can be claimed.</p><ActionButton tone="primary" disabled={!form.branch || !form.name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Adding…' : 'Add printer'}</ActionButton></>}><div className="content-form-grid"><label><span>Branch</span><select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })}><option value="">Choose branch</option>{branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Printer name</span><input maxLength="120" placeholder="For example, Reception Laser" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="is-wide"><span>Model</span><input maxLength="120" placeholder="Optional model name" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label><div className="content-option-row is-wide"><label><input type="checkbox" checked={form.color} onChange={(event) => setForm({ ...form, color: event.target.checked })} /><span>Color printing</span></label><label><input type="checkbox" checked={form.duplex} onChange={(event) => setForm({ ...form, duplex: event.target.checked })} /><span>Double-sided</span></label></div><fieldset className="content-paper-options is-wide"><legend>Paper sizes</legend>{['A4', 'A3', 'LETTER', 'LEGAL'].map((paper) => <button type="button" className={form.paper.includes(paper) ? 'is-active' : ''} onClick={() => togglePaper(paper)} key={paper}>{paper}</button>)}</fieldset></div>{error && <p className="content-error" role="alert">{error}</p>}</BusinessModal>;
}

function PrintersView({ printers, agents, branches, canWrite, onAdd }) {
  const toast = useToast();
  const toggle = useMutation({ mutationFn: (printer) => httpRequest('PATCH', `/api/v1/printing/printers/${Number(printer.id)}/`, { body: { is_active: !printer.is_active } }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Printer availability updated.'); }, onError: (failure) => toast.danger(userFacingError(failure, { fallback: 'Printer availability could not be updated.' })) });
  const branchName = (id) => branches.find((branch) => String(branch.id) === String(id))?.name || `Branch ${id}`;
  const liveAgent = (branch) => agents.rows.find((agent) => String(agent.branch) === String(branch) && !agent.revoked_at);
  return <section className="content-printers"><header><div><span>Equipment</span><h2>Printers and branch connections</h2><p>Use recognizable names, honest capabilities, and a visible connection state.</p></div>{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={onAdd}>Add printer</ActionButton>}</header><WorkspaceState state={printers} empty={!printers.rows.length} emptyTitle="No printers have been set up" emptyBody="Add the first branch printer, then connect that branch’s print service before sending real work."><div className="content-printer-grid">{printers.rows.map((printer) => { const agent = liveAgent(printer.branch); const connected = agent?.last_seen_at && Date.now() - new Date(agent.last_seen_at).getTime() < 5 * 60 * 1000; return <article key={printer.id}><header><span>{cloneElement(Icons.doc, { size: 21 })}</span><StatusPill value={printer.is_active ? 'Available' : 'Paused'} tone={printer.is_active ? 'success' : 'neutral'} /></header><h3>{printer.name}</h3><p>{printer.model_name || 'Model not recorded'} · {branchName(printer.branch)}</p><div className={`content-connection${connected ? ' is-live' : ''}`}><i /><span><strong>{connected ? 'Branch connection online' : agent ? 'Branch connection offline' : 'Connection not set up'}</strong><small>{agent?.last_seen_at ? `Last contact ${formatOrganizationDate(agent.last_seen_at)}` : 'A branch connector is required for physical printing.'}</small></span></div><dl><div><dt>Color</dt><dd>{printer.capabilities?.color ? 'Yes' : 'No'}</dd></div><div><dt>Double-sided</dt><dd>{printer.capabilities?.duplex ? 'Yes' : 'No'}</dd></div><div><dt>Paper</dt><dd>{printer.capabilities?.paper?.join(', ') || 'Not recorded'}</dd></div></dl>{canWrite && <footer><button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(printer)}>{printer.is_active ? 'Pause printer' : 'Make available'}</button></footer>}</article>; })}</div></WorkspaceState>{!printers.rows.length && canWrite && <div className="content-printer-onboarding"><article><b>1</b><span><strong>Add the printer</strong><small>Name it the way staff know it.</small></span></article><article><b>2</b><span><strong>Connect the branch</strong><small>The local connector reports availability.</small></span></article><article><b>3</b><span><strong>Send a test page</strong><small>Confirm the complete queue flow.</small></span></article><ActionButton icon={Icons.plus} tone="primary" onClick={onAdd}>Add first printer</ActionButton></div>}</section>;
}

export function ContentPage({ user, route = 'content/library', onNav }) {
  useWorkspaceTitle('Content & print');
  const toast = useToast();
  const { segments } = workspaceRoute(route);
  const requested = SECTION_ALIASES[segments[1]] || segments[1] || 'library';
  const active = SECTIONS.some((section) => section.id === requested) ? requested : 'library';
  const canWrite = canUseCapability(user, 'content:write');
  const canApprove = canUseCapability(user, 'content:approve');
  const canPublish = canUseCapability(user, 'content:publish');
  const canPrint = canUseCapability(user, 'printing:write');
  const canReadPrint = canUseCapability(user, 'printing:read');
  // The service already returns libraries by name and deliberately does not
  // expose a client-controlled ordering filter for this collection.
  const libraries = useWorkspaceData('/api/v1/content/libraries/', { page_size: 100 });
  const folders = useWorkspaceData('/api/v1/content/folders/', { page_size: 100 });
  // Content collections own their stable server-side ordering. Unlike printing,
  // these endpoints do not expose an `ordering` query parameter; sending one
  // makes the whole Library workspace fail with a field-scoped 400.
  const files = useWorkspaceData('/api/v1/content/files/', { page_size: 100 }, { refreshMs: 5_000 });
  const printers = useWorkspaceData('/api/v1/printing/printers/', { page_size: 100, ordering: 'name' }, { enabled: canReadPrint });
  const jobs = useWorkspaceData('/api/v1/printing/jobs/', { page_size: 100, ordering: '-created_at' }, { enabled: canReadPrint && (active === 'print' || canPrint), refreshMs: active === 'print' ? 5_000 : undefined });
  const agents = useWorkspaceData('/api/v1/printing/agents/', { page_size: 100, ordering: 'name' }, { enabled: canReadPrint && active === 'printers', refreshMs: 20_000 });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' }, { enabled: canWrite || canPrint });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100, ordering: 'name' }, { enabled: canWrite });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, is_archived: false, ordering: 'name' }, { enabled: canWrite });
  const [modal, setModal] = useState('');
  const [printFile, setPrintFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(null);
  const [recheckBusy, setRecheckBusy] = useState(null);
  const openPrint = (file) => { setPrintFile(file); setModal('print'); };
  const closeModal = () => { setModal(''); setPrintFile(null); };
  const openPreview = async (file) => {
    setPreviewBusy(file.id);
    try {
      const grant = await httpRequest('GET', `/api/v1/content/files/${Number(file.id)}/download-url/`);
      const destination = safeDocumentUrl(grant?.url);
      if (!destination) throw new Error('The secure file link could not be verified.');
      setPreview({ file, url: destination });
    } catch (failure) {
      toast.danger(userFacingError(failure, { fallback: 'The file preview could not be opened.' }));
    } finally {
      setPreviewBusy(null);
    }
  };
  const recheckFile = async (file) => {
    setRecheckBusy(file.id);
    try {
      await httpRequest('POST', `/api/v1/content/files/${Number(file.id)}/confirm/`, { body: {} });
      await files.retry();
      toast.success('The file safety check was queued again.');
    } catch (failure) {
      toast.danger(userFacingError(failure, { fallback: 'The file check could not be queued again.' }));
    } finally {
      setRecheckBusy(null);
    }
  };
  const navigation = <SectionNav label="Content & print" items={SECTIONS} active={active} basePath="content" onNav={onNav} />;
  const headline = useMemo(() => active === 'print' ? 'Print work' : active === 'printers' ? 'Printer setup' : active === 'review' ? 'Publication review' : 'Content & print', [active]);
  return <main className="fw-page content-page">
    <WorkspaceHeader eyebrow="Knowledge operations" title={headline} description="Organize learning resources, inspect the real file, publish it responsibly, and send documents to branch printers." actions={<>{canPrint && <ActionButton icon={Icons.doc} onClick={() => openPrint(null)}>Quick print</ActionButton>}{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={() => setModal('upload')}>Upload file</ActionButton>}</>} />
    <WorkspaceLayout navigation={navigation}>
      <ContentSummary libraries={libraries} folders={folders} files={files} jobs={jobs} />
      {active === 'library' && <LibraryView libraries={libraries} folders={folders} files={files} printers={printers} canWrite={canWrite} canPrint={canPrint} onLibrary={() => setModal('library')} onFolder={() => setModal('folder')} onUpload={() => setModal('upload')} onPrint={openPrint} onPreview={openPreview} previewBusy={previewBusy} onRecheck={recheckFile} recheckBusy={recheckBusy} />}
      {active === 'review' && <ReviewView files={files} canApprove={canApprove} canPublish={canPublish} onPreview={openPreview} previewBusy={previewBusy} />}
      {active === 'print' && <PrintQueue jobs={jobs} printers={printers} canWrite={canPrint} onPrint={openPrint} />}
      {active === 'printers' && <PrintersView printers={printers} agents={agents} branches={branches.rows} canWrite={canPrint} onAdd={() => setModal('printer')} />}
    </WorkspaceLayout>
    <LibraryForm open={modal === 'library'} onClose={closeModal} branches={branches.rows} departments={departments.rows} cohorts={cohorts.rows} />
    <FolderForm open={modal === 'folder'} onClose={closeModal} libraries={libraries.rows} folders={folders.rows} />
    <UploadForm open={modal === 'upload'} onClose={closeModal} folders={folders.rows} />
    <PrintForm key={`${modal}-${printFile?.id || 'new'}`} open={modal === 'print'} onClose={closeModal} initialFile={printFile} files={files.rows} printers={printers.rows} branches={branches.rows} />
    <PrinterForm open={modal === 'printer'} onClose={closeModal} branches={branches.rows} />
    <FilePreviewModal preview={preview} onClose={() => setPreview(null)} />
  </main>;
}
