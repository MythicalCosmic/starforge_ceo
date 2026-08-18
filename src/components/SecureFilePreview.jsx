import { cloneElement, useEffect, useState } from 'react';
import { Icons } from './Icons.jsx';
import { filePreviewKind } from './secureFilePreview.js';
import '../styles/secure-file-preview.css';

export function SecureFilePreview({ file, url }) {
  const kind = filePreviewKind(file?.content_type);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [url]);

  const ready = () => setLoaded(true);
  const unavailable = () => {
    setLoaded(true);
    setFailed(true);
  };

  if (kind === 'external' || failed) {
    return <div className="secure-file-fallback" role="status">
      <span>{cloneElement(Icons.doc, { size: 28 })}</span>
      <div><strong>{failed ? 'The browser could not render this preview' : 'This format opens in its native app'}</strong><p>{failed ? 'The file is still available. Open the original in a separate tab to continue.' : 'Word, PowerPoint, and other specialist formats need a compatible application.'}</p></div>
    </div>;
  }

  return <div className={`secure-file-stage is-${kind}`} data-loaded={loaded ? 'true' : 'false'}>
    {!loaded && <div className="secure-file-loading" role="status"><span />Preparing secure preview…</div>}
    {kind === 'image' && <img src={url} alt={file?.title || 'File preview'} onLoad={ready} onError={unavailable} />}
    {kind === 'video' && <video src={url} controls playsInline preload="metadata" onLoadedMetadata={ready} onError={unavailable} />}
    {kind === 'audio' && <div className="secure-file-audio"><span>{cloneElement(Icons.doc, { size: 30 })}</span><strong>{file?.title || 'Audio file'}</strong><audio src={url} controls preload="metadata" onLoadedMetadata={ready} onError={unavailable} /></div>}
    {(kind === 'pdf' || kind === 'document') && <iframe src={url} title={`${file?.title || 'File'} preview`} referrerPolicy="no-referrer" onLoad={ready} onError={unavailable} />}
  </div>;
}
