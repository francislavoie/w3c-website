import { AuthorizedClient, type AuthorizedClientDeps } from "@/services/http/AuthorizedClient";
import type { CancelledMatchesPage } from "@/types/admin/CancelledMatch";
import type { ReplayChatLog } from "@/store/admin/types";

export interface CancelledMatchQuery {
  /** 0 (Undefined) means every game mode. */
  gameMode: number;
  page: number;
  itemsPerPage: number;
  battleTag?: string;
}

/**
 * Reads cancelled matches and, on demand, the chat log for one of them.
 *
 * Takes its endpoint (and optionally a fetch) rather than importing API_URL, so
 * it can be constructed in tests - `@/config/env` reads `window` at module load
 * and cannot be imported outside a browser.
 *
 * The chat log call hits the replay service, which costs money per call. Only
 * ever call it for a single match in response to an explicit user action - never
 * to enrich a list.
 */
export class CancelledMatchService {
  private readonly client: AuthorizedClient;

  constructor(deps: AuthorizedClientDeps) {
    this.client = new AuthorizedClient(deps);
  }

  async getCancelledMatches(token: string, query: CancelledMatchQuery): Promise<CancelledMatchesPage> {
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("itemsPerPage", String(query.itemsPerPage));

    if (query.gameMode) {
      params.set("gameMode", String(query.gameMode));
    }

    // The backend parameter is deliberately NOT called "battleTag":
    // BearerHasPermissionFilter overwrites an action argument of that exact name
    // with the acting moderator's own tag, which would silently turn this search
    // into "matches I played in".
    if (query.battleTag) {
      params.set("playerBattleTag", query.battleTag);
    }

    return await this.client.getJson<CancelledMatchesPage>(
      `api/admin/matches/canceled?${params}`,
      token,
    );
  }

  /**
   * Cancelled matches have no Matchup row, so the id-based chat route cannot find
   * them. The FLO game id is the only key the replay service understands.
   */
  async getChatLogByFloId(token: string, floGameId: number): Promise<ReplayChatLog> {
    return await this.client.getJson<ReplayChatLog>(
      `api/replays/by-flo-id/${encodeURIComponent(floGameId)}/chats`,
      token,
    );
  }
}
