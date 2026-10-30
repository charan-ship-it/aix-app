export const firstTaskGoals = ["follow-ups", "transcript", "custom"] as const;
export type FirstTaskGoal = (typeof firstTaskGoals)[number];
export type GettingStartedPreference = { goal: FirstTaskGoal | null; dismissed: boolean };
export type GettingStartedState = {
  preference: GettingStartedPreference;
  model: { ready: boolean; canManage: boolean };
  connections: { status: "ready" | "unavailable" | "error"; email: boolean; calendar: boolean };
  progress: { hasConversation: boolean; hasCompletedRun: boolean; lastConversationId: string | null };
};
