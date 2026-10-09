# Current task

- [x] Prevent added and cloned videos from covering subtitles; verified with decoded browser media, cloning, uploading, reordering, visibility toggle, and 30 regression tests (desktop installed app not tested).
- [x] Create layers at the playhead through “NEW LAYER +”.
- [x] Add drag, edge resizing, snapping, and a snap guide to layer bars.
- [x] Keep timeline edits synchronized with panel fields, history, save, export, and visibility.
- [x] Keep the preview and resize bounds fixed; wheel zooms only video content inside each layer.
- [x] Add focused temporal calculation and snapping tests.
- [x] Verify layer creation, independent ranges, snapping, visibility, and internal video zoom with real media (browser test video; desktop API responses intercepted).
- [x] Prepare the desktop application release metadata and checks for v2.0.2.
- [x] Confirm the exact GitHub release artifacts and publishing steps.
- [x] Align internal desktop/frontend versions and lockfiles with v2.0.3.
- [x] Verify macOS and Windows installer version configuration for v2.0.3 (3 regression tests pass; native installers must still be generated on GitHub).- [x] Desktop YouTube import: use local browser session on bot-check; bump internal version to 2.0.5 (awaiting tag v2.0.5 on GitHub).
- [x] Desktop YouTube "Requested format is not available": bundle deno + yt-dlp-ejs, distinct error message, version 2.0.7.
- [ ] Publish tag v2.0.7 on GitHub and test YouTube import in the installed app (waiting on the user).
