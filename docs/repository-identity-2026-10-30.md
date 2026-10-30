# Repository identity check — 30 October 2026

## Subsequent rename and Git reset

After this inspection, the user requested a project rename and removal of the old Git history. The complete working folder was moved to `/Users/charannaik/Documents/ChatGPT/AIX APP`, and a fresh empty Git repository was initialized on `main`. No remote or initial commit has been created. The original `.git` directory was moved outside the project to `/Users/charannaik/Documents/ChatGPT/Project history backups/perfstaq-git-20261030-155319` for recovery. The old `/Users/charannaik/project/perfstaq` directory no longer exists. Historical evidence below describes the pre-move inspection, not the current repository HEAD or location.

The local AIX app and `https://github.com/Ai-Xccelerate/openduet` are separate codebases. No migration, merge, remote configuration or push was performed during this check.

| Evidence | Local AIX app | GitHub OpenDuet |
| --- | --- | --- |
| Location | `/Users/charannaik/project/perfstaq` | `Ai-Xccelerate/openduet`, branch `main` |
| HEAD inspected | `6889af58b9bb7f3e7687fd01824b446e2c0de073` | `25f9262794659ac144d10505253b553ef5afff06` |
| Package | `aixccelerate-workspace` | `openduet`, platform under `openbot/` |
| Structure | Next.js app, AI SDK, Drizzle, PostgreSQL/Redis, embedded Mastra workflow | Bun workspaces: app, server, worker, shared, toolkit; OpenBot/CopilotKit |
| Git linkage | `git remote -v` returned no remotes; extensive local changes remain uncommitted | GitHub source inspected using authenticated read-only GitHub CLI |
| Running app provenance | Existing Docker app container's Compose working-directory label points to `/Users/charannaik/project/perfstaq` | Not run or deployed during this comparison |

The newly selected workspace `/Users/charannaik/Documents/ChatGPT/AIX APP` was empty and was not a Git repository at inspection time. Ongoing implementation therefore remains in the original source directory, using explicit paths.

The OpenDuet README describes proactive tasks, schedules, approvals, browser operation and CopilotKit Intelligence-backed threads/memory. These descriptions are repository claims, not live verification of those features. Package manifests and the source tree confirm the structural differences above. Existing local AIX test results do not certify OpenDuet, and OpenDuet's tests do not certify the local AIX app.

The user confirmed that AIX must remain a separate product/repository. OpenDuet is a functionality reference, not a migration target. Preserve both histories, compare capabilities, and do not claim synchronization. No GitHub remote for AIX has been created in this task.
