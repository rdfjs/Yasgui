<script lang="ts">
// Module-level singleton: lives outside setup() so it survives SPA navigations
let yasgui: any = null;
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useData } from "vitepress";

// VitePress dark-mode switch
const { isDark } = useData();
const container = ref<HTMLElement | null>(null);
const loading = ref(true);

function syncTheme(dark: boolean) {
  const theme = dark ? "dark" : "light";
  // The surrounding chrome CSS keys off [data-theme] on <html>.
  document.documentElement.dataset.theme = theme;
  yasgui?.yasqe?.setTheme?.(theme);
}

// isDark is a writable (useDark-backed) ref; flipping it toggles the .dark class,
// persists the choice, and triggers the watch below to re-sync the editor theme.
function toggleTheme() {
  isDark.value = !isDark.value;
}

onMounted(async () => {
  // Yasgui is editor-independent: it builds whatever editor the `yasqe` factory returns. Here we use
  // the CodeMirror 6 editor (@zazuko/yasqe-codemirror) instead of the Monaco one (@zazuko/yasqe).
  const { default: Yasgui } = await import("@zazuko/yasgui");
  const { default: Yasqe } = await import("@zazuko/yasqe-codemirror");
  await import("@zazuko/yasgui/style.css");
  await import("@zazuko/yasqe-codemirror/style.css");
  // The qlue-ls language server (WASM) and the @codemirror/lsp-client wiring live in the embedder.
  const { createQlueLsClient, setQlueLsBackend } = await import("../qluelsCmClient");
  const { DEMO_ENDPOINT } = await import("../utils");

  syncTheme(isDark.value);

  if (yasgui) {
    // Re-attach the existing rootEl instead of re-creating the editor.
    container.value!.appendChild(yasgui.rootEl);
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

  const backend = { endpoint: DEMO_ENDPOINT };
  // Start qlue-ls and connect a single shared LSP client for all tabs.
  let lsp: { client: any } | undefined;
  try {
    const client = await createQlueLsClient(backend, { completion: { timeoutMs: 10000, resultSizeLimit: 50 } });
    lsp = { client };
  } catch (e) {
    console.warn("Could not start qlue-ls; running editors without a language server", e);
  }

  yasgui = new Yasgui(container.value!, {
    requestConfig: { endpoint: DEMO_ENDPOINT },
    // The editor factory: build a CodeMirror Yasqe, wiring in the theme + shared LSP client.
    yasqe: (parent: HTMLElement, conf: any) =>
      new Yasqe(parent, { ...conf, theme: isDark.value ? "dark" : "light", lsp }),
    // Keep qlue-ls pointed at the active tab's endpoint.
    onEndpointChange: (_yg: any, endpoint: string) => {
      if (lsp?.client) setQlueLsBackend(lsp.client, { ...backend, endpoint });
    },
  });
  (window as any).__ygcm = yasgui;
  loading.value = false;
});

watch(isDark, (dark) => syncTheme(dark));

onBeforeUnmount(() => {
  // Detach from the DOM but keep the instance alive for the next visit.
  yasgui?.rootEl?.remove();
});
</script>

<template>
  <ClientOnly>
    <div class="yasgui-demo">
      <div v-show="loading" class="yasgui-demo__loading">Loading the SPARQL editor…</div>
      <div ref="container" class="yasgui-demo__root"></div>
      <div class="yasgui-demo__theme-bar">
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
      </div>
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
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.yasgui-demo__theme-bar {
  margin-top: auto;
  display: flex;
  justify-content: center;
  padding: 12px 14px;
}
.yasgui-demo__theme-toggle {
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
