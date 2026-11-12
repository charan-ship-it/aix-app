<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AIX UI and caching checklist

- Use Agent Tony / the AIX design system as the visual reference: ambient background, readable near-black floating surfaces in dark mode, corresponding light surfaces, neutral selected states and consistent icons. Do not place opaque panels over the ambient canvas without a reason.
- Check spacing and alignment in the running app: section titles need separation from content; related labels, controls and icons must align; dropdown arrows need inset space; cards should align their actions even with different text lengths. Check long text, focused states, empty states and narrow screens.
- Verify relevant changes in both dark and light themes, including contrast and selected, hover and focus states. Avoid global resets or overrides that silently remove component spacing; test shared styles on representative pages.
- Consider caching for each new read-heavy screen. Follow `docs/client-caching.md`: scope by user, workspace and resource; revalidate, invalidate after changes, and avoid persisting private data. Do not use stale cache for authorization, approvals or live run status. State the actual coverage and validation; do not claim every page was checked when it was not.
