# Exploit prevention without a human in the loop

A talk about [codesafe](https://ovos.github.io/codesafe/) for an AI workshop (19 November 2026): where the AI decides alone on the way from an attack to a blocking rule, how code checks every answer, and where a person still approves. It also shows why the drafting model stops refusing in a verified account. The deck runs on the engine of [Teaching Websites When to Forget](https://github.com/artigo-dev/cache-talk) (rg-dev #69).

- **The deck:** open `site/index.html`. Use the arrow keys or a presentation remote. `O` shows the talk's slides, `P` opens the presenter view, `T` switches to the light theme for a washed-out projector. The slides after "Questions" are backups for the questions: type a slide's number and press Enter to open one.
- **The demos** in the backups replay recorded runs (`site/data/results.js`). Their verdicts are the Shield kernel's own; the Shield kernel is part of [ovos/php-library](https://github.com/ovos/php-library) (`src/Codesafe/Shield/`).

## License

MIT, see `LICENSE`. The Rajdhani font in `site/fonts/rajdhani/` is under the SIL Open Font License; see its own `LICENSE` there.
