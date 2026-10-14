# Building Change Map (prototype)

Interactive map of building changes (gone / new) in Bangkok, loaded from CSV.
See [CLAUDE.md](CLAUDE.md) for the full brief, data formats and architecture.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (deploy to Netlify / Vercel / GitHub Pages)
npm run preview  # serve the built dist/ locally
```

## Using it

- On load, the sample tables in `public/sample/` are shown.
- **Change points**: drop one or more CSVs (code output `C…` and/or answer key `A…`).
  They replace the current points. Answer-key rows draw as rings, code rows as dots.
- **Test areas**: drop a test-area CSV, then pick an area in the dropdown to zoom to it.
- Rows that can't be placed (missing/non-numeric/out-of-Bangkok coordinates, missing ID)
  are skipped and listed under the upload box. Unknown types are shown in grey.
- Column names live in `src/data/columnMap.ts`. If a header is renamed, add the new name there.
