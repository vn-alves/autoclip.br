Keep center snapping in a browser-safe pure helper and share it between manual pointer dragging and Moveable dragging; screen-pixel hysteresis must not change video size or constrain movement outside the frame.
Keep layer timeline movement, resizing, and snapping in a browser-safe pure helper so pointer interactions and regression tests share the same temporal rules.
Apply wheel magnification to video content inside a clipped layer wrapper, never the preview frame or Moveable proxy, so selection geometry stays independent of content zoom.
Keep desktop download links and the known release floor in the shared download configuration; reject older API results so landing and settings downloads cannot silently downgrade.
Keep all preview video layers inside the clipping container's stacking context and subtitles above it; arbitrary video ordering must never cover captions, matching the subtitle-last export composition.
- In desktop mode, YouTube bot-check recovery must try the local browsers' logged-in session before alternate player clients, and desktop error messages must never refer to a "server" — the app runs on the user's machine.
- Desktop installers bundle deno next to ffmpeg and every yt-dlp call receives it as a JS runtime (plus yt-dlp-ejs); without it, logged-in YouTube clients return only thumbnails ("Requested format is not available").
