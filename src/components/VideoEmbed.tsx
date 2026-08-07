// Embedded YouTube tutorial player. Uses the -nocookie domain to avoid setting tracking cookies
// until the user actually presses play.
export function VideoEmbed({ videoId, title }: { videoId: string; title: string }) {
  // Every id today comes from the hardcoded EXLIB/WARMUP_LIBRARY data, but this component is one
  // future feature away from taking a user- or AI-supplied value — validate the exact YouTube id
  // shape so nothing can ever smuggle path segments or query params into the iframe URL.
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
}
