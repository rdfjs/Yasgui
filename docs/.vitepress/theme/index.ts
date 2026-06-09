// https://vitepress.dev/guide/custom-theme
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import YasguiDemo from "./components/YasguiDemo.vue";
import "./demo.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("YasguiDemo", YasguiDemo);
  },
} satisfies Theme;
