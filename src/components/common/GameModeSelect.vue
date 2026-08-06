<template>
  <v-menu location="bottom start" transition="fade-transition">
    <template v-slot:activator="{ props }">
      <v-btn tile class="w3-dropdown-button" style="background-color: transparent" v-bind="props">
        <v-icon size="x-large" start>{{ mdiControllerClassic }}</v-icon>
        {{ gameModeName() }}
      </v-btn>
    </template>
    <v-card>
      <v-card-text class="dropdown-menu-content">
        <div class="dropdown-menu-title">
          {{ $t("components_common_gamemodeselect.selectgamemode") }}
        </div>
        <v-divider />
        <v-list density="compact" max-height="400" class="overflow-y-auto">
          <v-list-item
            v-for="mode in gameModes()"
            :key="mode.id"
            @click="selectGameMode(mode.id)"
          >
            <v-list-item-title>{{ mode.name }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { activeGameModesWithAT, loadActiveGameModes } from "@/composables/GameModesMixin";
import { EGameMode } from "@/store/types";
import { mdiControllerClassic } from "@mdi/js";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

const { gameMode = EGameMode.UNDEFINED, disabledModes = [], includeAllModes = false } = defineProps<{
  gameMode?: EGameMode;
  disabledModes?: EGameMode[];
  /**
   * Adds an "All modes" entry (EGameMode.UNDEFINED) to the dropdown and gives the
   * activator button a label at that value instead of blank. Off by default:
   * Matches.vue, the other consumer of this component, never selects mode 0 and
   * must keep seeing the AT-only list and the blank label unchanged.
   */
  includeAllModes?: boolean;
}>();

const emit = defineEmits<{
  gameModeChanged: [gameMode: EGameMode];
}>();

const { t } = useI18n();

function allModesEntry(): { name: string; id: number } {
  return { id: EGameMode.UNDEFINED, name: t(`gameModes.${EGameMode[EGameMode.UNDEFINED]}`) };
}

function gameModes(): Array<{ name: string; id: number }> {
  let modes = activeGameModesWithAT();

  if (includeAllModes) {
    modes = [allModesEntry(), ...modes];
  }

  if (disabledModes) {
    modes = modes?.filter((x) => !disabledModes?.includes(x.id));
  }

  return modes;
}

function gameModeName(): string {
  if (!gameMode) {
    return includeAllModes ? allModesEntry().name : "";
  }

  const mode = activeGameModesWithAT()?.filter((g) => g.id == gameMode)[0];

  if (!mode) {
    return "Not Supported";
  }

  return mode.name;
}

function selectGameMode(gameMode: EGameMode): void {
  emit("gameModeChanged", gameMode);
}

onMounted(async (): Promise<void> => {
  await loadActiveGameModes();
});
</script>
