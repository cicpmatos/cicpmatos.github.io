const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

// Shared by the editor and the build. Never return or embed an untrusted URL.
export function youtubeVideoId(value) {
  const invalid = () => { throw new Error('Vídeo inválido: use um link HTTPS de um vídeo do YouTube.'); };
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f\\]/.test(value)) invalid();
  let url;
  try { url = new URL(value.trim()); } catch { invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) invalid();
  if (url.searchParams.getAll('v').length > 1) invalid();
  let id;
  if (youtubeHosts.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  } else if (url.hostname === 'youtu.be') {
    id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  } else if (url.hostname === 'www.youtube-nocookie.com') {
    id = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  }
  if (typeof id !== 'string' || !videoIdPattern.test(id)) invalid();
  return id;
}
