// https://vitepress.dev/guide/custom-theme
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import YasguiDemo from "./components/YasguiDemo.vue";
import YasguiCmDemo from "./components/YasguiCmDemo.vue";
import "./style.css";
import "./demo.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("YasguiDemo", YasguiDemo);
    app.component("YasguiCmDemo", YasguiCmDemo);
  },
} satisfies Theme;
