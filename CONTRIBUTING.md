# Contributing

## Where work is tracked
All work is tracked as GitHub [Issues](https://github.com/DarkLordGeo/age-of-wars/issues) on the [project board](https://github.com/users/DarkLordGeo/projects/2) (Backlog → Ready → In Progress → Review / QA → Done), grouped by milestone. Use the bug or feature templates for new reports. Gameplay changes should follow [docs/AGE1_SPEC.md](docs/AGE1_SPEC.md) or explain why they differ from it.

## Branches
Branch from `main`, then open a pull request back into it:
- `feat/<short-name>` for new features
- `fix/<short-name>` for bug fixes
- `docs/…`, `chore/…`, `perf/…`, `art/…` for everything else

## Commands
```bash
npm ci && npm run dev
npm run typecheck
npm test
npm run build
```

## Pull requests
- Link the issue with `Refs #N`. Close it once its Definition of Done has been verified.
- Keep one issue per PR and avoid unrelated changes.
- CI (typecheck, tests, build, repository hygiene) must pass. Every PR also gets a Vercel preview deployment; check visual changes there and add screenshots.
- New simulation behaviour needs tests in `tests/`. Visual-only changes need a screenshot or short video.
- Every new third-party asset needs a row in [docs/ASSET_LICENSES.md](docs/ASSET_LICENSES.md) (CC0 preferred). Never commit secrets or `.env` files.
