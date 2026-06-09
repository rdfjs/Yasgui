---
"@zazuko/yasgui": patch
"@zazuko/yasgui-utils": patch
"@zazuko/yasqe": patch
"@zazuko/yasr": patch
---

- Migrate from `webpack` to `vite` for the bundler and dev server
- Update `.eslintrc.js` config file to modern module based `eslint.config.js`
- Clean up unused dependencies
- Remove unused files: `.gitignore` and `.npmignore` in packages folders, `yasgui.bootstrap.css` and `yasgui.polyfill.min.js` in `packages/yasgui/static/` folder
- Move prettier 1 field config from `.prettierrc` file to the `package.json`
- Remove dependency to prefix.cc API at runtime, bundle 500 most popular prefixes from prefix.cc directly in the lib
