/** A player in a cancelled match, as matchmaking recorded them. */
export interface CancelledMatchPlayer {
  battleTag: string;
  name?: string;
  inviteName?: string;
  race: number;
  team: number;
  country?: string;
  /**
   * 0-based FLO lobby slot. Flo shows anonymised players as `Player {slotIndex + 1}`,
   * so always add one before displaying. Absent for matches cancelled before the
   * FLO game was created.
   */
  slotIndex?: number;
  mmr?: { rating: number };
  ranking?: { leagueOrder?: number };
}

/**
 * A match that ended without a result. There is no winner, no score and no MMR
 * change - those fields do not exist for these matches, so nothing here should be
 * rendered as a win or a loss.
 */
export interface CancelledMatch {
  id: string;
  gamename?: string;
  gameMode: number;
  map?: string;
  mapName?: string;
  gateway?: number;
  season?: number;
  startTime: number;
  createdAt?: string;
  /** When the match was cancelled. */
  canceledAt?: string;
  /** Null when the match was cancelled before the FLO game existed: no replay, no chat log. */
  floGameId?: number | null;
  players: CancelledMatchPlayer[];
}

export interface CancelledMatchesPage {
  total: number;
  matches: CancelledMatch[];
}

/** A replay or chat log can only exist once FLO created the game. */
export function hasReplayArtifacts(match: CancelledMatch): boolean {
  return match.floGameId != null && match.floGameId > 0;
}

/** The number a player saw in game for an anonymised match. */
export function displaySlot(player: CancelledMatchPlayer): number | undefined {
  return player.slotIndex == null ? undefined : player.slotIndex + 1;
}
