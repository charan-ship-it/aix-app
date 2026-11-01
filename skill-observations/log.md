# Skill observations

No reusable workflow observations recorded for this initial build.

### Observation 1: Match the product family before designing from the marketing site

**Status:** OPEN
**Applies to:** frontend-design
**Signal:** The user asked for the visual language of existing sibling products after the first UI used the public marketing palette.
**Suggestion:** When a user requests an existing company’s product vibe, inspect available sibling app source, fonts, and design tokens before selecting a visual direction. A company’s marketing site can use a different system from its working applications. Confirm ambiguous named references using local project discovery.

### Observation 2: Port the whole sibling product design system

**Status:** OPEN
**Applies to:** frontend-design
**Signal:** The user clarified that Mike is the canonical source for palette, icons, spacing, width, and height after a mixed-reference redesign.
**Suggestion:** Read the sibling product’s design-system documentation and component implementations, then reuse token values, SVG viewBoxes, typography roles, radius, and density scales together. Verify rendered dimensions and preserve fixed sidebar widths across density settings.

### Observation 3: Verify a product through full interaction paths

**Status:** OPEN
**Date:** 2026-10-27
**Session context:** Refining a multi-tenant employee workspace after the user found fixed-header, navigation, and authoring problems.
**Skill:** frontend-design
**Type:** open-source
**Phase/Area:** Restraint and self-critique; screenshot verification

**Issue:** A static screenshot and successful API checks did not reveal page-wide scrolling, an unanchored composer, navigation lost on reload, globally blocked conversations, or hidden authoring actions.

**Suggested improvement:** In the screenshot-verification process, walk creation → configuration → use → interruption → history on desktop and mobile. Assert viewport chrome positions during scrolling, deep-link/back behavior, and recovery states before calling the experience polished. Keep browser regression coverage for the behaviors that failed.

**Principle:** Validate interface quality as state transitions and scroll ownership, not only as a rendered screen or a set of working endpoints.


### Observation 4: Verify product entities before reproducing navigation

**Status:** OPEN
**Date:** 2026-10-27
**Applies to:** frontend-design
**Signal:** The user rejected employee links that merely changed the agent query parameter on a generic conversation page. Signed-in Dust testing revealed that the referenced Agent-Mike item was a Pod, with an independent default agent, files, tasks, and conversation history.
**Suggestion:** Trace an isolated creation → task → execution → conversation → history flow in the reference product. Distinguish behavior definitions (agents) from contextual containers (Pods) before choosing records, routes, permissions, and breadcrumbs. Test both UI transitions and server ownership boundaries, including retrieval of private contextual files.

### Observation 5: Separate credential setup, tool checks, and model evaluation

**Status:** OPEN
**Date:** 2026-10-27
**Applies to:** frontend-design; integration workflows
**Signal:** The user expected reusable Composio/MCP connections and actual checks for each app, while earlier setup screens offered OAuth buttons without an inspectable tool-testing journey.
**Suggestion:** Treat workspace configuration, member authorization, agent tool permissions, deterministic direct tool checks, and model-led agent testing as separate states. Preserve a draft when leaving the editor to authorize a service. Keep live account checks explicitly untested until credentials and authorization exist; a local fixture or missing-key recovery test cannot certify a live integration.

### Observation 6: Separate a launch segment from a platform's audience

**Status:** OPEN
**Date:** 2026-10-27
**Applies to:** competitive-architecture-teardown; frontend-design
**Signal:** The user rejected a small-business-only interpretation of a platform meant to serve individuals and teams. Competitor research showed that approvals, memory, and routines already exist across several products.
**Suggestion:** Define the product's broad job loop before choosing a first sales segment. Compare wiring and complete user journeys, distinguish an AIX implementation gap from validated market whitespace, and label differentiation hypotheses explicitly. Personal setup, clear outcomes, and a durable return path should precede more niche templates or connector-count claims.

### Observation 7: Distinguish product credentials from customer authorization

**Status:** OPEN
**Date:** 2026-10-27
**Applies to:** competitive-architecture-teardown; frontend-design
**Signal:** A SaaS user corrected an integration design that asked every customer organization for the connector vendor's project key.
**Suggestion:** Identify credential ownership before designing setup. Product infrastructure credentials belong in operator-only server configuration; customers authorize their individual service accounts. Verify that shared infrastructure never selects another tenant's connected account, and keep product secrets out of customer settings and API responses.

### Observation 8: Test controlled modal fields across rerenders

**Status:** OPEN
**Date:** 2026-10-27
**Applies to:** frontend-design; ui-ux-pro-max
**Signal:** Every character typed into a connection form moved focus to Close because a focus effect depended on an inline close callback.
**Suggestion:** Run modal entry focus and restoration on the modal lifecycle, keep the latest close handler separately, and verify consecutive typing without targeting the field again. Check a scoped live connector session as well as broad discovery: vendor auth overrides can be invalid when unrelated apps are removed from the session.

### Observation 9: Check complete user flows beyond passing service tests

**Status:** OPEN
**Date:** 2026-10-28
**Applies to:** frontend-design; ui-ux-pro-max
**Signal:** Passing service tests missed a native date control that displayed an unsaved value and a defaulted optional update field that cleared notes during completion.
**Suggestion:** Verify create, edit, status-only update, and reload through the real UI; inspect preserved fields after each transition. Read submitted native controls at form submission, synchronize date input events, and avoid creation defaults in partial-update schemas. When live connectors are available, repeat an import and check counts plus stable source identities, not only an HTTP success flag.

### Observation 10: Verify repository identity before transferring product claims

**Status:** OPEN
**Date:** 2026-10-30
**Session context:** Comparing an active local app with a separately supplied GitHub repository.
**Skill:** competitive-architecture-teardown
**Type:** open-source
**Phase/Area:** Source provenance

**Issue:** Similar product goals and branding can conceal different source trees and runtime foundations; local test evidence does not establish that a linked repository contains the same implementation.

**Suggested improvement:** Before comparing or reusing features, record local root, remotes, inspected commit, running build provenance, and the reference repository structure. Distinguish source inspection, advertised capabilities, and exercised workflows.

**Principle:** Verify artifact identity before transferring implementation or validation claims between projects.

### Observation 11: Bound approval previews without hiding decisions

**Status:** OPEN
**Date:** 2026-10-30
**Session context:** Adding a task detail view over existing execution and approval records.
**Skill:** frontend-design
**Type:** open-source
**Phase/Area:** Action review and verification

**Issue:** A readable evidence preview needs size limits and credential redaction, but truncated action inputs can make an approval misleading. Historical execution also must not accidentally display the latest result from a later conversation turn.

**Suggested improvement:** Associate request/results with immutable run identities, return explicit preview completeness and redaction flags, disable decisions on incomplete previews, and send the displayed approval IDs to a server-side stale-action check. Test multi-run chats and revocation after the preview was opened.

**Principle:** Readability limits must preserve the integrity of the decision, and execution evidence must retain its original identity.

### Observation 12: Verify framework licensing and production entry points

**Status:** OPEN
**Date:** 2026-11-02
**Session context:** Integrating a protocol client and self-hosted framework runtime.
**Skill:** competitive-architecture-teardown
**Type:** open-source
**Phase/Area:** Dependency integration and acceptance

**Issue:** A documented provider option carried an Enterprise production licensing warning in installed source. Separately, an SDK loaded natively but a development TypeScript loader redirected a dependency to an unusable published source stub. Schema-only checks would not prove the production path.

**Suggested improvement:** Pin compatible versions; verify installed license and public runtime interfaces; choose the supported production route without bypass flags. Test real installed clients against the authenticated production endpoint using a compatible native loader, and distinguish framework transport proof from live model-quality evidence.

**Principle:** A dependency choice is verified only when its supported licensing, production entry point and actual transport behavior fit the product.
