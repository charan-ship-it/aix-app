# Live meeting-action agent verification — 2 November 2026

Workspace: AIX Workflow QA, local Docker. The organization owner connected an OpenAI API key through the app; no key is recorded here.

1. The builder's instruction-only preview used OpenAI `gpt-5.2` and synthetic notes: Maya will send a proposal by Friday; Leo will review pricing without a stated deadline. The real response returned both actions, owners, the stated deadline, and supporting quotes. This preview did not use the transcript tool, apps or retrieval and was not saved to chat history.
2. Created **Meeting Action Assistant** with the built-in transcript action-items tool enabled and no connected apps or knowledge. The saved agent ran against the same synthetic notes in its own conversation.
3. The saved run completed `extract_transcript_actions`. Work details show a Mastra workflow output with two source-matched quotes, Maya and Leo as owners, Friday only for Maya, and a clarification about Leo's missing deadline. The conversation's final table reflected those facts. No messages or external tasks were created.
4. The conversation appeared in Chats and was reopened with its saved table, including after the local app and worker were rebuilt and restarted. The result and tool details are accessible at `/conversation/4de2ec6d-12b4-4d2b-83d3-cf9338f18497` and `/work/c997fb2b-f348-4323-8617-cc033e244700` for the authorized member in this local workspace.

This is one real model-backed example using synthetic notes, not proof of broad extraction quality, automatic meeting ingestion, source permissions, account-connected workflows, or multi-user isolation. Human review remains necessary.

The first attempt to use AI to draft the agent failed with OpenAI `invalid_json_schema`: defaulted properties in the generated schema were not required. The generated-agent schema was updated to require every output property and a regression test was added. The live retest is recorded below.

After rebuilding with the structured-output fix, repeated the exact AI drafting request against the same OpenAI connection. The builder displayed a reviewable proposal, allowed it to be applied, and retained the transcript tool as a suggestion rather than enabling it automatically. The draft was not saved as a second agent. This is one successful drafting example, not a broad quality evaluation.
