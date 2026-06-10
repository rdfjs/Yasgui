<script lang="ts">
// Module-level singleton: lives outside setup() so it survives SPA navigations.
// The monaco-vscode API can only be initialized once per page load, destroying and
// recreating Yasgui on navigation would throw on the second visit.
let yasguiInstance: any = null;
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useData } from "vitepress";

// VitePress' own dark-mode switch drives the demo theme.
const { isDark } = useData();
const container = ref<HTMLElement | null>(null);
const loading = ref(true);

function syncTheme(dark: boolean) {
  const theme = dark ? "dark" : "light";
  // The surrounding chrome CSS keys off [data-theme] on <html>.
  document.documentElement.dataset.theme = theme;
  yasguiInstance?.yasqe?.setTheme?.(theme);
}

// isDark is a writable (useDark-backed) ref; flipping it toggles the .dark class,
// persists the choice, and triggers the watch below to re-sync the editor theme.
function toggleTheme() {
  isDark.value = !isDark.value;
}

onMounted(async () => {
  const { default: Yasgui } = await import("@zazuko/yasgui");
  await import("@zazuko/yasgui/style.css");
  const { createQlueLsWorker, configureQlueLsBackend, DEMO_ENDPOINT, fallbackPrefixMap } = await import("../qluels");

  syncTheme(isDark.value);

  if (yasguiInstance) {
    // Re-attach the existing rootEl instead of re-initializing Monaco.
    container.value!.appendChild(yasguiInstance.rootEl);
    loading.value = false;
    return;
  }

  // Register extra Yasr result-view plugins before creating the Yasgui instance.
  const [{ default: GraphPlugin }, { default: GeoPlugin }] = await Promise.all([
    import("@matdata/yasgui-graph-plugin"),
    import("yasgui-geo-tg"),
  ]);
  Yasgui.Yasr.registerPlugin("Graph", GraphPlugin as any);
  Yasgui.Yasr.registerPlugin("Geo", GeoPlugin as any);

  // Yasgui and Yasqe are language-server agnostic: they receive a ready LSP worker and
  // expose the resulting language client. Everything qlue-ls specific lives in ../qluels.
  yasguiInstance = new Yasgui(container.value!, {
    requestConfig: { endpoint: DEMO_ENDPOINT },
    yasqe: { theme: isDark.value ? "dark" : "light" },
    yasr: { prefixes: fallbackPrefixMap },
    languageServerWorker: createQlueLsWorker,
    onEndpointChange: (yg: any, endpoint: string) =>
      configureQlueLsBackend(yg.yasqe?.getLanguageClient(), endpoint),
  });
  (window as any).__yg = yasguiInstance;
  loading.value = false;
});

watch(isDark, (dark) => syncTheme(dark));

onBeforeUnmount(() => {
  // Detach from the DOM but keep the instance alive for the next visit.
  yasguiInstance?.rootEl?.remove();
});
</script>

<template>
  <ClientOnly>
    <div class="yasgui-demo">
      <button
        class="yasgui-demo__theme-toggle"
        :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm10-7a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm13.07-6.07a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM7.05 16.95a1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0Zm11.31 1.41a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41ZM7.05 7.05a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41Z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.64 13a1 1 0 0 0-1.05-.14 8 8 0 0 1-9.45-9.45 1 1 0 0 0-1.19-1.19A10 10 0 1 0 22 14.05a1 1 0 0 0-.36-1.05Z" />
        </svg>
      </button>
      <div v-show="loading" class="yasgui-demo__loading">Loading the SPARQL editor…</div>
      <div ref="container" class="yasgui-demo__root"></div>
    </div>
    <template #fallback>
      <div class="yasgui-demo">
        <div class="yasgui-demo__loading">Loading the SPARQL editor…</div>
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.yasgui-demo {
  width: 100%;
  min-height: 70vh;
}
/* Floating theme switch: the home page hides the VitePress navbar, so this is the
   only theme toggle. Kept top-right so Yasgui stays at the very top. */
.yasgui-demo__theme-toggle {
  position: fixed;
  top: 10px;
  right: 14px;
  z-index: 100;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: border-color 0.2s, color 0.2s;
}
.yasgui-demo__theme-toggle:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.yasgui-demo__theme-toggle svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
.yasgui-demo__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
}
</style>
