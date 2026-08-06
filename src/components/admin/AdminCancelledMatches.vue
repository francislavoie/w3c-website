<template>
  <div>
    <v-card-title class="pt-3 d-flex align-center ga-2">
      <v-icon>{{ mdiCancel }}</v-icon>
      Cancelled Matches
    </v-card-title>

    <v-container v-if="!canModerate">
      <v-alert type="error" variant="tonal">
        You do not have the Moderation permission required to view cancelled matches.
      </v-alert>
    </v-container>

    <v-container v-else>
      <v-alert type="info" variant="tonal" density="compact" class="mb-4">
        <ul class="pl-4">
          <li>
            Drawn and stalled matches are only marked cancelled by a cleanup sweep that runs
            6 hours after the match started, so a match that just ended will not appear yet.
          </li>
          <li>
            Replay and chat log are unavailable for matches cancelled before the game server
            was created.
          </li>
          <li>
            No cancellation reason is recorded, so this list cannot show why a match ended.
          </li>
        </ul>
      </v-alert>

      <v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="mb-4">
        Failed to load cancelled matches: {{ loadError }}
      </v-alert>

      <v-row dense align="center">
        <v-col cols="12" md="auto">
          <game-mode-select
            :game-mode="gameMode"
            :include-all-modes="true"
            @game-mode-changed="onGameModeChanged"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="battleTag"
            label="BattleTag"
            placeholder="Exact battle tag (case-sensitive)…"
            variant="underlined"
            color="primary"
            clearable
            @update:modelValue="onFilterChange"
          />
        </v-col>
      </v-row>

      <v-table density="comfortable" class="mt-2">
        <thead>
          <tr>
            <th>Game Mode</th>
            <th>Map</th>
            <th>Started</th>
            <th>Cancelled</th>
            <th>Players</th>
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="text-center py-6">
              <v-progress-circular indeterminate color="primary" size="32" />
            </td>
          </tr>
          <tr v-else-if="matches.length === 0 && !loadError">
            <td colspan="6" class="text-center py-6 text-medium-emphasis">
              No cancelled matches found.
            </td>
          </tr>
          <tr v-for="match in matches" v-else :key="match.id">
            <td>{{ gameModeName(match.gameMode) }}</td>
            <td>{{ displayMapName(match) }}</td>
            <td>{{ formatStartTime(match.startTime) }}</td>
            <td>{{ formatCanceledAt(match.canceledAt) }}</td>
            <td>
              <div v-for="(teamPlayers, team) in groupedByTeam(match)" :key="team" class="mb-2">
                <div class="text-caption text-medium-emphasis">Team {{ team }}</div>
                <div v-for="player in teamPlayers" :key="player.battleTag" class="text-body-2">
                  {{ playerLabel(player) }}
                </div>
              </div>
            </td>
            <td>
              <div class="d-flex align-center justify-center ga-1">
                <download-replay-icon
                  v-if="hasReplayArtifacts(match)"
                  :flo-game-id="match.floGameId"
                />
                <v-tooltip v-else location="top" content-class="w3-tooltip elevation-1">
                  <template v-slot:activator="{ props }">
                    <span v-bind="props">
                      <v-btn icon variant="outlined" size="small" disabled>
                        <v-icon>{{ mdiDownload }}</v-icon>
                      </v-btn>
                    </span>
                  </template>
                  <span>{{ unavailableTooltip }}</span>
                </v-tooltip>

                <v-btn
                  v-if="hasReplayArtifacts(match)"
                  icon
                  variant="outlined"
                  size="small"
                  @click="openChatDialog(match)"
                >
                  <v-icon>{{ mdiChatProcessingOutline }}</v-icon>
                </v-btn>
                <v-tooltip v-else location="top" content-class="w3-tooltip elevation-1">
                  <template v-slot:activator="{ props }">
                    <span v-bind="props">
                      <v-btn icon variant="outlined" size="small" disabled>
                        <v-icon>{{ mdiChatProcessingOutline }}</v-icon>
                      </v-btn>
                    </span>
                  </template>
                  <span>{{ unavailableTooltip }}</span>
                </v-tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>

      <div v-if="pageCount > 1" class="d-flex justify-center mt-4">
        <v-pagination
          v-model="page"
          :length="pageCount"
          :total-visible="7"
          color="primary"
          @update:model-value="onPageChanged"
        />
      </div>
    </v-container>

    <!--
      Rendered only while the dialog is open (see AdminReplayChatLogMessages' onMounted-only
      fetch): every open is a fresh mount, so switching matches can never leave a previous
      match's chat log on screen. Never fetch a chat log outside this explicit user action.
    -->
    <v-dialog v-model="chatDialogOpen" width="1500">
      <v-card>
        <admin-replay-chat-log-messages
          v-if="chatDialogOpen"
          :flo-game-id="chatDialogFloGameId ?? undefined"
        />
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useOauthStore } from "@/store/oauth/store";
import { EPermission } from "@/store/admin/permission/types";
import { EGameMode } from "@/store/types";
import { CancelledMatchService } from "@/services/admin/CancelledMatchService";
import {
  CancelledMatch,
  CancelledMatchPlayer,
  displaySlot,
  hasReplayArtifacts,
} from "@/types/admin/CancelledMatch";
import { API_URL } from "@/config/env";
import { formatTimestampStringToDateTime } from "@/helpers/date-functions";
import GameModeSelect from "@/components/common/GameModeSelect.vue";
import DownloadReplayIcon from "@/components/matches/DownloadReplayIcon.vue";
import AdminReplayChatLogMessages from "@/components/admin/replays/AdminReplayChatLogMessages.vue";
import { mdiCancel, mdiChatProcessingOutline, mdiDownload } from "@mdi/js";
import { format } from "date-fns";

const ITEMS_PER_PAGE = 25;

// Lazy singleton: constructing at module-load time would read API_URL before the
// module graph has finished initializing. Defer to first call.
let _service: CancelledMatchService | null = null;
function getService(): CancelledMatchService {
  return _service ??= new CancelledMatchService({ endpoint: API_URL });
}

export default defineComponent({
  name: "AdminCancelledMatches",
  components: {
    GameModeSelect,
    DownloadReplayIcon,
    AdminReplayChatLogMessages,
  },
  setup() {
    const oauthStore = useOauthStore();
    const { t } = useI18n();

    const canModerate = computed(() => oauthStore.permissions.includes(EPermission[EPermission.Moderation]));

    const matches = ref<CancelledMatch[]>([]);
    const total = ref(0);
    const loading = ref(false);
    const loadError = ref<string | null>(null);

    const gameMode = ref<EGameMode>(EGameMode.UNDEFINED);
    const battleTag = ref("");
    const page = ref(1);

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / ITEMS_PER_PAGE)));
    const unavailableTooltip =
      "Replay and chat log are unavailable for matches cancelled before the game server was created.";

    async function loadMatches(): Promise<void> {
      if (!canModerate.value) return;

      loading.value = true;
      loadError.value = null;
      try {
        const result = await getService().getCancelledMatches(oauthStore.token, {
          gameMode: gameMode.value,
          page: page.value,
          itemsPerPage: ITEMS_PER_PAGE,
          battleTag: battleTag.value || undefined,
        });
        matches.value = result.matches;
        total.value = result.total;
      } catch (e) {
        loadError.value = e instanceof Error ? e.message : String(e);
        matches.value = [];
        total.value = 0;
      } finally {
        loading.value = false;
      }
    }

    let filterDebounceHandle: ReturnType<typeof setTimeout> | null = null;
    function onFilterChange(): void {
      if (filterDebounceHandle) clearTimeout(filterDebounceHandle);
      filterDebounceHandle = setTimeout(() => {
        page.value = 1;
        loadMatches();
      }, 400);
    }

    function onGameModeChanged(mode: EGameMode): void {
      gameMode.value = mode;
      page.value = 1;
      loadMatches();
    }

    function onPageChanged(): void {
      loadMatches();
    }

    function gameModeName(mode: number): string {
      const key = EGameMode[mode];
      if (!key) return String(mode);
      return t(`gameModes.${key}`);
    }

    function displayMapName(match: CancelledMatch): string {
      return match.mapName || match.map || "—";
    }

    function formatStartTime(startTimeMs: number): string {
      if (!startTimeMs) return "—";
      return format(new Date(startTimeMs), "dd-MMM-yyyy HH:mm");
    }

    function formatCanceledAt(canceledAt?: string): string {
      if (!canceledAt) return "—";
      return formatTimestampStringToDateTime(canceledAt);
    }

    // Grouped (not sorted by slot) so an FFA lobby with anonymised names still
    // reads in a stable, predictable order matching the order the backend sent.
    function groupedByTeam(match: CancelledMatch): Record<number, CancelledMatchPlayer[]> {
      const groups: Record<number, CancelledMatchPlayer[]> = {};
      for (const player of match.players) {
        (groups[player.team] ??= []).push(player);
      }
      return groups;
    }

    function playerLabel(player: CancelledMatchPlayer): string {
      const slot = displaySlot(player);
      return slot != null ? `Player ${slot} — ${player.battleTag}` : player.battleTag;
    }

    // Only one chat dialog exists on the page; opening it is the single explicit
    // user action allowed to trigger the (paid) chat log fetch. The dialog's
    // v-if unmounts AdminReplayChatLogMessages on close, so the next open (even
    // for the same match) is always a fresh mount and a fresh fetch - never a
    // stale render of a previous match's log.
    const chatDialogOpen = ref(false);
    const chatDialogFloGameId = ref<number | null>(null);

    function openChatDialog(match: CancelledMatch): void {
      chatDialogFloGameId.value = match.floGameId ?? null;
      chatDialogOpen.value = true;
    }

    onMounted(loadMatches);

    // A debounced filter change can still be pending when the moderator navigates
    // away; without this cleanup the fetch fires after the component is gone.
    onUnmounted(() => {
      if (filterDebounceHandle) clearTimeout(filterDebounceHandle);
    });

    return {
      canModerate,
      matches,
      loading,
      loadError,
      gameMode,
      battleTag,
      page,
      pageCount,
      unavailableTooltip,
      onFilterChange,
      onGameModeChanged,
      onPageChanged,
      gameModeName,
      displayMapName,
      formatStartTime,
      formatCanceledAt,
      groupedByTeam,
      playerLabel,
      hasReplayArtifacts,
      chatDialogOpen,
      chatDialogFloGameId,
      openChatDialog,
      mdiCancel,
      mdiDownload,
      mdiChatProcessingOutline,
    };
  },
});
</script>
