# SentenceDiagram.io

A free, no-login sentence diagramming tool for students and teachers. Paste in
any sentence and it renders a traditional Reed-Kellogg style line diagram,
color-codes each word's part of speech, and explains the sentence in plain
English — with hover tooltips on every word in the diagram.

Everything runs client-side: sentence parsing uses [compromise](https://github.com/spencermountain/compromise)
for part-of-speech tagging plus a custom rule-based grammatical analyzer
(`src/nlp/`) that identifies subjects, verbs, objects, predicate
nominatives/adjectives, modifiers, and prepositional phrases. There's no
backend, no database, and no account — the plan is to fund hosting through
Google AdSense.

## Stack

- Vite + React + TypeScript
- [compromise](https://github.com/spencermountain/compromise) for POS tagging
- Hand-rolled SVG layout engine (`src/diagram/`) for the Reed-Kellogg diagrams
- Hosted on [Cloudflare Pages](https://pages.cloudflare.com/) (free tier — unlimited bandwidth, AdSense-friendly)

## How it works

1. **`src/nlp/tokenize.ts`** — runs compromise, then re-tags closed word
   classes (prepositions, conjunctions, determiners, auxiliaries, linking
   verbs) against curated word lists in `src/nlp/lexicon.ts`, since
   compromise's statistical tagger is inconsistent on short function words.
2. **`src/nlp/analyze.ts`** — a shallow rule-based parser: splits the
   sentence into clauses (independent/subordinate), finds the subject and
   verb, classifies the predicate (direct object / predicate nominative /
   predicate adjective / intransitive), and attaches modifiers and
   prepositional phrases.
3. **`src/diagram/layout.ts` + `compose.ts`** — turns that grammatical
   structure into absolute SVG coordinates: baseline with subject|verb
   dividers, diagonal modifier lines (rotated text, matching the traditional
   style), prepositional-phrase "flags," and stepped/dashed connectors
   between clauses in compound and complex sentences.
4. **`src/nlp/explain.ts`** — generates the plain-English written breakdown
   from the same structure.

This is a best-effort educational tool, not a full linguistic parser. It's
tuned for common classroom sentence patterns; anything it can't confidently
place is shown as "not diagrammed" rather than guessed at silently.

## Development

```bash
npm install
npm run dev
```

```bash
npm run build    # type-check + production build to dist/
npm run lint
```

## Deployment (Cloudflare Pages)

Vercel's free Hobby tier explicitly prohibits AdSense/advertising as
"commercial use," so this project targets **Cloudflare Pages** instead
(unlimited bandwidth on the free tier, and its terms are fine with ads).
GitHub Pages is a solid fallback since the repo already lives on GitHub.

To connect:

1. [pages.cloudflare.com](https://pages.cloudflare.com/) → Create a project → Connect to Git → select this repo.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Deploy. Cloudflare will auto-deploy on every push to `main`.

Once the site is live and stable, apply for AdSense and swap the
`<AdSlot>` placeholders in `src/components/AdSlot.tsx` for real
`<ins class="adsbygoogle">` snippets.
