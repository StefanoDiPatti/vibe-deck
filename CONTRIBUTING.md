# Contributing to Vibe Deck

Thank you! Ideas, bug reports and changes are welcome. Every change enters the project **only after the repository
owner reviews it**: you can propose anything, but the owner does the merge.

## Reporting a problem or suggesting an idea

Open an [issue](../../issues/new/choose) and pick the template:

- **Problem**: what you did, what you expected, what happened; system (Windows/Linux), tablet or phone, theme and language.
  Remove personal data from logs and screenshots (access code, email, names).
- **Idea**: what you would like to do from the tablet and on which page.

## Proposing a change (pull request)

1. **Fork** the repository and create a branch from an up-to-date `main`, with a clear name:
   `feature/obs-page`, `fix/linux-audio`, `docs/plugin-guide`.
2. Make the smallest change that solves the problem. For a new feature consider a **plugin** first
   (`npm run new:widget -- <name>`): it does not touch the rest of the project and is easier to accept.
3. Follow the project rules (also in [AGENTS.md](AGENTS.md), useful if you work with an AI assistant):
   - **zero comments** in any file: clear names instead, explanations in the docs or the pull request;
   - **English** for commit messages, pull requests and documentation;
   - tablet client in **ES5** and CSS **without flexbox** (it must run on Android 4);
   - after a change to `app/public/css/dock.css`: `npm run themes`;
   - new tablet text in Italian **with its English translation** in `app/public/js/lang-en.js`;
   - everything OS-dependent for both **Windows** and **Linux**;
   - no personal data (use `npm run demo` for tests and screenshots).
4. In `app/`: `npm install` and `npm test` (everything must pass).
5. Open the **pull request** against `main` filling in the template: what changes, how you tested it, what is left to
   try for real (tablet, Discord, audio, windows...).

The owner reads it, may ask for changes and merges it when it is ready. Nobody, not even people with access to the
repository, can merge into `main` without the owner's approval.

## License

By contributing you agree that your code is distributed under the project's [MIT](LICENSE) license.
