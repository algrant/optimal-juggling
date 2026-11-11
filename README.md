# optimal-juggling

Jack Kalvan's spatially optimal juggling patterns (Optimal Juggling, 1996) in the browser: any solo siteswap laid
out so that every ball keeps the same margin (the error zone) from every other with the least height and hand
movement, with his controls and readout, the balls animated, and how close they come.

Live at https://algrant.github.io/optimal-juggling/ (a siteswap goes after the `#`: `/#/531`). Split out of
funky-books (funkybook.algrant.ca) on 2026-11-11; the working notes are `passing-pattern-parser/docs/optimal-juggling.md`
and the original program is kept under `juggling/archive/optimal-juggler/`.

```
npm install
npm run dev      # http://localhost:5173/optimal-juggling/
npm run build    # dist/, deployed to GitHub Pages by .github/workflows/pages.yml on push to main
```

React, Vite, TypeScript; `src/model.ts` is the model (layouts, the search, tubes), `src/Optimal.tsx` the page.
