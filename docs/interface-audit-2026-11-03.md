# Interface consistency pass — 3 November 2026

Scope: observed desktop Home/agent picker, global search, agent creation, Knowledge, Connections and profile; mobile checks are noted separately. This is not a claim that every route or state has been audited.

| Finding | Change |
| --- | --- |
| Global search showed two orange focus outlines. | Give composite search controls one visible outer focus ring. |
| Knowledge search icon appeared above its input. The same label style affected other icon-and-input searches. | Align the shared search patterns horizontally, including files, tasks, builder apps and Connections. |
| Opening the agent picker highlighted the entire composer as if the message field had focus. | Highlight the composer only when the message input has keyboard focus. |
| Agent picker rows lacked a consistent selected treatment and stayed open on outside clicks. | Align icon, label and selection columns; show the selected row and dismiss on outside click. |
| Search used the same generic icon for every agent and had no useful no-results state. | Use each agent's actual icon, align result icons, trim search input and report empty results. |
| Several integration cards used generic symbols. | Use local template, Simple Icons and Devicon brand assets; see `public/integrations/ATTRIBUTION.md`. |
| Menus and dialogs looked opaque and separate from the AIX visual system. | Apply the existing glass material to menus and dialogs while keeping content readable. |

Verification after the local build: checked the home agent picker and outside-click dismissal, workspace search and its empty state, Knowledge search alignment, and Connections icons on desktop. Checked Home and Connections at a 390px viewport. The production build and TypeScript check passed.

Remaining: verify every page and state—including less-used settings, mobile navigation, overflow and long labels—with representative data and both themes. These checks do not establish that all routes are polished.
