import { AdminReplayManagementState, ReplayChatLog } from "../types";
import { useOauthStore } from "@/store/oauth/store";
import AdminService from "@/services/admin/AdminService";
import { CancelledMatchService } from "@/services/admin/CancelledMatchService";
import { API_URL } from "@/config/env";
import { defineStore } from "pinia";

// Lazy singleton: API_URL reads window at module load, so the service cannot be
// constructed at module top level.
let _cancelledMatchService: CancelledMatchService | null = null;
function getCancelledMatchService(): CancelledMatchService {
  return (_cancelledMatchService ??= new CancelledMatchService({ endpoint: API_URL }));
}

export const useReplayManagementStore = defineStore("replayManagement", {
  state: (): AdminReplayManagementState => ({
    chatLog: {} as ReplayChatLog,
  }),
  actions: {
    async loadChatLog(matchId: string) {
      const oauthStore = useOauthStore();
      const chatLog = await AdminService.getChatLog(oauthStore.token, matchId);
      this.SET_CHAT_LOG_DATA(chatLog);
    },
    /**
     * Cancelled matches have no Matchup row, so the id-based chat route 404s for
     * them. This is the only way to reach their chat log.
     */
    async loadChatLogByFloId(floGameId: number) {
      const oauthStore = useOauthStore();
      const chatLog = await getCancelledMatchService().getChatLogByFloId(oauthStore.token, floGameId);
      this.SET_CHAT_LOG_DATA(chatLog);
    },
    SET_CHAT_LOG_DATA(chatLog: ReplayChatLog): void {
      this.chatLog = chatLog;
    },
  },
});
