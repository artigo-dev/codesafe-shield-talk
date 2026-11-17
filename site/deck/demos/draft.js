/*	Demo `draft` (Talk\Scenario\Draft): the AI turns a vendor's fix into a rule for websites, and code
	checks every answer. The answers are written by hand (each card says so); the test is the real
	Shield kernel's.
	
	Left, the fix: the bug in one line, and the diff with the comment planted to fool the AI.
	
	Centre, three checks as three bars: allowed words only, codesafe adds who may send it, tested on
	the website's own code. Three answers cross them as three cards. At the test, three chips show the
	kernel's verdicts on the attack, a normal request and the attack made harmless; under them, one
	plain line says what became of the answer. Before the third card, two short rows: the third time
	the AI is asked, with safeguards on it says no, on the verified account it answers.
	
	Right, what each answer came to, and the stamp.
	
	Every word comes from the run's events (their plain fields) or from this file. The run takes
	about seven seconds; the plan tells it in about 85 s at the deck's default speed (×0.1), from the
	events but not their timing, so a live run plays as the recording does. */

Deck.register('draft', (element) =>
{
	const stage = element.querySelector('.demo-stage');
	const width = 1680;
	const height = 680;
	let frame = 0;
	
	// stepped like the cache talk's tags demo: a hidden fragment per stop, so → plays on to the next stop and
	// ← draws the one before; the presenter's window follows the fragments, ?all shows the end
	let current = null;
	let currentPace = 0.1;
	let shownAt = 0;
	let goTo = () => {};
	
	/** what the slide proves, one answer at a time: a fooled one, a lazy one, a right one, and code decides each */
	const kinds = ['fooled', 'lazy', 'right'];

	/** what the caption says at each step: what just happened, in plain words */
	const captions = {
		intro: 'A plugin\'s fix arrives, with a line planted to fool the AI. Three answers the AI could give: fooled, lazy, right.',
		checks: 'Each must pass three checks. Code runs them, not the AI.',
		answers: [
			'Fooled: answer 1 obeyed the planted line. Check 1 drops it: who may send the request is code\'s to say.',
			'Lazy: answer 2 blocks every request that sends a file name. The test drops it: normal visitors are blocked too.',
			'Right: answer 3 blocks only a file name that climbs out of its folder (../). It passes all three checks.',
		],
		third: 'Neither answer kept a rule, so the AI is asked a third time. With safeguards on it says no; the verified account answers.',
		stamp: 'Even the right answer watches first, before it may block. Code decided every step.',
	};
	
	/** the three checks, the scenario's names for them, each bar's x in the centre column, a card's width */
	const gates = ['vocabulary', 'half', 'trial'];
	const gateWords = {vocabulary: 'allowed words only', half: 'codesafe adds who may send it', trial: 'tested on the website\'s own code'};
	const bars = [240, 470, 690];
	const cardWidth = 260;
	
	/** the test's three requests, as the chips name them */
	const subjects = ['exploit', 'honest', 'twin'];
	const subjectWords = {exploit: 'the attack', honest: 'a normal request', twin: 'the attack made harmless'};
	
	/** a card's left edge while it stands at a check, its right edge just before the bar; -1 is before the first, 3 past the last */
	const cardX = (bar) => bar < 0 ? -40 : bar >= bars.length ? 500 : bars[bar] - 12 - cardWidth;
	
	/** how long the parts take, in seconds at the deck's default speed (×0.1) */
	const beat = {enter: 1.8, move: 1.4, look: 1.3, chip: 1.8, type: 2.6, pass: 1.3, stamp: 1.2, hold: 3.8, leave: 1.2};
	
	const make = (tag, className = '', parent = null, text = '') =>
	{
		const node = document.createElement(tag);
		if(className !== '')
		{
			node.className = className;
		}
		
		if(text !== '')
		{
			node.textContent = text;
		}
		
		parent?.append(node);
		
		return node;
	};
	
	/** a node placed on its column's coordinates */
	const place = (node, x, y, w = null) =>
	{
		node.style.left = `${x}px`;
		node.style.top = `${y}px`;
		if(w !== null)
		{
			node.style.width = `${w}px`;
		}
		
		return node;
	};
	
	/** the board on the stage: scaled down when the stage is smaller (a heading that wraps, a font still loading) */
	const fit = () =>
	{
		const board = stage.querySelector('.draft-board');
		if(board !== null)
		{
			const scale = Math.min(1, (stage.clientWidth || width) / width, (stage.clientHeight || height) / height);
			board.style.transform = `scale(${scale})`;
		}
	};
	
	new ResizeObserver(fit).observe(stage);
	
	const reset = () =>
	{
		cancelAnimationFrame(frame);
		goTo = () => {};
		stage.innerHTML = '';
	};
	
	/** an empty fragment per step, kept across replays so the slide remembers how far it is */
	const mark = (count) =>
	{
		const markers = [...element.querySelectorAll('.demo-step')];
		for(let at = markers.length; at < count; at++)
		{
			const marker = document.createElement('span');
			marker.className = 'fragment demo-step';
			marker.hidden = true;
			element.append(marker);
		}
		
		markers.slice(count).forEach((marker) => marker.remove());
	};
	
	/** the run: the fix, each answer with its checks and the test's verdicts, what became of it, the refusal, the stamp */
	const read = (events) =>
	{
		const input = events.find((event) => event.type === 'input');
		if(input === undefined)
		{
			return null;
		}
		
		const run = {input, answers: [], gates: {}, trials: {}, drawn: {}, third: null, refusal: null, tier: null};
		for(const event of events)
		{
			if(event.type === 'answer')
			{
				run.answers.push(event);
			}
			else if(event.type === 'gate')
			{
				run.gates[event.n] = {...run.gates[event.n], [event.gate]: event};
			}
			else if(event.type === 'trial')
			{
				run.trials[event.n] = {...run.trials[event.n], [event.subject]: event};
			}
			else if(event.type === 'drawn')
			{
				run.drawn[event.n] = event;
			}
			else if(['third', 'refusal', 'tier'].includes(event.type))
			{
				run[event.type] = event;
			}
		}
		
		return run;
	};
	
	/** the board for a run, drawn up to the stop `shown` steps reach: played there from the start, or put there at once */
	const build = (events, pace, shown, animate) =>
	{
		reset();
		const run = read(events);
		if(run === null)
		{
			stage.textContent = Deck.t('This run has no draft in it.');
			
			return;
		}
		
		// the deck's speed: the plan is written at ×0.1, and the CSS motion follows it (--k)
		const k = 0.1 / pace;
		const board = make('div', 'draft-board', stage);
		board.style.setProperty('--k', String(k));
		fit();
		
		const cues = [];
		const typers = [];
		const cue = (time, act) => cues.push({time, act, done: false});
		const stops = [];
		const type = (node, text, from, to) => typers.push({node, text, from, to});
		const show = (node, on = true) => node.classList.toggle('on', on);
		
		/* ---- the fix ---- */
		
		const {advisory, diff, steer} = run.input;
		const left = place(make('section', 'column fix', board), 0, 0, 420);
		make('div', 'col-title', left, Deck.t('The fix'));
		make('div', 'col-sub', left, Deck.t('the AI turns it into a rule for websites'));
		
		const bug = place(make('div', 'bug fade', left), 0, 84, 420);
		make('div', 'bug-name', bug, advisory.package);
		make('div', 'bug-line', bug, Deck.t(advisory.plain ?? advisory.title));
		
		const code = place(make('div', 'diff fade', left), 0, 200, 420);
		const lines = diff.map(({mark, text}, at) =>
		{
			const line = make('div', `ln fade ${{'+': 'add', '-': 'del'}[mark] ?? 'ctx'}${at === steer ? ' steer' : ''}`, code);
			make('span', 'mark', line, mark === ' ' ? '' : mark);
			make('span', 'code', line, text);
			
			return line;
		});
		const fooled = place(make('div', 'fooled fade', left, Deck.t('▲ written to fool the AI')), 0, 414, 420);
		
		cue(0.4, () => show(bug));
		cue(1.4, () => show(code));
		lines.forEach((line, at) => cue(1.8 + at * 0.4, () => show(line)));
		cue(2.0 + lines.length * 0.4, () =>
		{
			lines[steer]?.classList.add('flag');
			show(fooled);
		});
		
		/* ---- the three checks ---- */
		
		const centre = place(make('section', 'column checks', board), 470, 0, 760);
		make('div', 'col-title', centre, Deck.t('Three checks'));
		make('div', 'col-sub', centre, Deck.t('code decides, not the AI'));
		
		const barNodes = gates.map((gate, at) =>
		{
			const label = place(make('div', `bar-label ${gate}`, centre), bars[at] - 100, 58, 200);
			const mark = make('span', 'bar-mark', label, `${at + 1}`);
			make('span', 'bar-words', label, Deck.t(gateWords[gate]));
			const bar = place(make('div', `bar ${gate === 'trial' ? 'kernel' : 'code'}`, centre), bars[at] - 5, 142);
			
			return {label, mark, bar};
		});
		const setBar = (at, state) =>
		{
			const {label, mark, bar} = barNodes[at];
			for(const node of [label, bar])
			{
				node.classList.remove('active', 'pass', 'fail');
				if(state !== '')
				{
					node.classList.add(state);
				}
			}
			
			mark.textContent = state === 'pass' ? '✓' : state === 'fail' ? '✗' : `${at + 1}`;
		};
		
		// under the bars: the test's three chips, then one line for what became of the answer
		const chips = place(make('div', 'chips fade', centre), 0, 352, 760);
		const chipNodes = Object.fromEntries(subjects.map((subject) =>
		{
			const chip = make('div', 'chip', chips);
			make('div', 'chip-words', chip, Deck.t(subjectWords[subject]));
			const verdict = make('div', 'chip-verdict', chip, '…');
			
			return [subject, {chip, verdict}];
		}));
		const outcome = place(make('div', 'outcome fade', centre), 0, 432, 760);
		
		const clear = () =>
		{
			gates.forEach((gate, at) => setBar(at, ''));
			show(chips, false);
			show(outcome, false);
			Object.values(chipNodes).forEach(({chip, verdict}) =>
			{
				chip.classList.remove('good', 'bad');
				verdict.textContent = '…';
			});
		};
		
		/** a card: whose answer, that it was written by hand, what its rule does */
		const buildCard = (answer) =>
		{
			const node = place(make('div', 'card', centre), cardX(-1), 156, cardWidth);
			// fooled, lazy or right: what this answer stands for
			const kind = kinds[answer.n - 1] ?? '';
			if(kind !== '')
			{
				make('div', `card-kind ${kind}`, node, Deck.t(kind));
			}

			const head = make('div', 'card-head', node);
			make('span', 'card-n', head, Deck.t('answer {n}', {n: answer.n}));
			if(answer.scripted)
			{
				make('span', 'scripted', head, Deck.t('written by hand'));
			}
			
			make('div', 'card-says', node, Deck.t(answer.says ?? answer.name));
			const stamp = make('div', 'card-stamp fade', node);
			
			return {node, stamp};
		};
		
		/**
		 * One answer across the checks from `time`: it enters, stops at each check the run asked, and is
		 * kept or dropped, in one line. Returns when the card has gone, and whether it was kept
		 */
		const conveyor = (answer, time) =>
		{
			const card = buildCard(answer);
			const steps = run.gates[answer.n] ?? {};
			const drawn = run.drawn[answer.n];
			let t = time;
			cue(t, () =>
			{
				clear();
				card.node.classList.add('in');
				card.node.style.left = `${cardX(0)}px`;
			});
			t += beat.enter;
			
			for(const [at, gate] of gates.entries())
			{
				const step = steps[gate];
				if(step === undefined)
				{
					break;
				}
				
				if(at > 0)
				{
					cue(t, () =>
					{
						card.node.style.left = `${cardX(at)}px`;
					});
					t += beat.move;
				}
				
				cue(t, () => setBar(at, 'active'));
				t += beat.look;
				
				if(gate === 'trial')
				{
					cue(t - beat.look / 2, () => show(chips));
					subjects.forEach((subject, index) =>
					{
						const verdict = run.trials[answer.n]?.[subject];
						if(verdict === undefined)
						{
							return;
						}
						
						cue(t + index * beat.chip, () =>
						{
							const {chip, verdict: words} = chipNodes[subject];
							chip.classList.add(verdict.ok ? 'good' : 'bad');
							words.textContent = `${verdict.ok ? '✓' : '✗'} ${Deck.t(verdict.holds ? 'caught' : 'let through')}`;
						});
					});
					t += subjects.length * beat.chip;
				}
				
				cue(t, () =>
				{
					setBar(at, step.ok ? 'pass' : 'fail');
					card.node.classList.toggle('bad', step.ok === false);
				});
				
				if(step.ok === false)
				{
					break;
				}
				
				// codesafe's part, from the code: who may send the request
				if(gate === 'half')
				{
					cue(t + 0.3, () =>
					{
						card.stamp.textContent = step.who === 'anyone' ? Deck.t('+ anyone may send it') : Deck.t('+ only some users may send it');
						show(card.stamp);
					});
					t += beat.stamp;
				}
				
				t += beat.pass;
			}
			
			// what became of the answer, in one line
			const kept = drawn?.kept === true;
			cue(t, () =>
			{
				outcome.className = `outcome fade on ${kept ? 'good' : 'bad'}`;
				outcome.textContent = '';
				card.node.classList.add(kept ? 'good' : 'bad');
			});
			type(outcome, Deck.t(drawn?.outcome ?? ''), t, t + beat.type);
			t += beat.type + beat.hold;
			if(kept)
			{
				cue(t - 1.0, () =>
				{
					card.node.style.left = `${cardX(gates.length)}px`;
				});
			}
			
			cue(t, () => card.node.classList.add('gone'));
			
			return {t: t + beat.leave, kept};
		};
		
		/* ---- the third time the AI is asked ---- */
		
		const third = place(make('div', 'third fade', centre), 0, 492, 760);
		make('div', 'third-title', third, Deck.t(run.third?.plain ?? ''));
		const declined = make('div', 'third-row bad fade', third, `✗ ${Deck.t('{who}: {what}', {who: Deck.t(run.refusal?.credential ?? ''), what: Deck.t(run.refusal?.plain ?? '')})}`);
		const answered = make('div', 'third-row good fade', third, `✓ ${Deck.t('verified account: answered')}`);
		
		/* ---- what is left ---- */
		
		const right = place(make('section', 'column results', board), 1280, 0, 400);
		make('div', 'col-title', right, Deck.t('What is left'));
		make('div', 'col-sub', right, Deck.t('what each answer came to'));
		const results = run.answers.map((answer, at) =>
		{
			const kept = run.drawn[answer.n]?.kept === true;
			const row = place(make('div', `result fade ${kept ? 'good' : 'bad'}`, right), 0, 84 + at * 52, 400);
			make('span', 'result-mark', row, kept ? '✓' : '✗');
			make('span', 'result-n', row, Deck.t('answer {n}', {n: answer.n}));
			make('span', 'result-word', row, Deck.t(kept ? 'kept' : 'dropped'));
			
			return row;
		});
		
		const stamp = place(make('div', 'stamp-box fade', right), 0, 262, 400);
		make('div', 'stamp-word', stamp, Deck.t(run.tier?.plain?.stamp ?? ''));
		const stampLine = make('div', 'stamp-line fade', stamp, Deck.t(run.tier?.plain?.line ?? ''));
		
		/* ---- the plan ---- */
		
		// the caption under the board: what just happened; beside it the step, and an arrow while one is left
		const caption = place(make('div', 'caption fade', board), 0, 636, 1500);
		const hint = place(make('div', 'hold-hint fade', board), 1520, 636, 160);
		const say = (time, text) => cue(time, () =>
		{
			caption.textContent = Deck.t(text);
			show(caption);
		});
		
		say(0.4, captions.intro);
		say(4.0, captions.checks);
		let t = 8.0;
		for(const [at, answer] of run.answers.entries())
		{
			// a stop before each answer: the first after the fix and the checks, the others after the answer before
			stops.push(t);
			if(answer.lane === 'verified' && run.third?.asked)
			{
				say(t, captions.third);
				// before the third card: the AI is asked again, with safeguards on and on the verified account
				cue(t, () => show(third));
				cue(t + 1.6, () => show(declined));
				cue(t + 3.6, () => show(answered));
				t += 5.4;
			}
			
			say(t, captions.answers[at] ?? answer.says ?? '');
			const result = conveyor(answer, t);
			cue(result.t - beat.leave - 0.4, () => show(results[at]));
			t = result.t + 0.6;
		}
		
		stops.push(t);
		say(t, captions.stamp);
		cue(t, () => show(stamp));
		cue(t + 1.6, () => show(stampLine));
		const end = t + 5.0;
		board.dataset.end = String(Math.round(end));
		
		/* ---- the clock: it plays up to the stop the shown steps reach, and stands there ---- */
		
		cues.sort((a, b) => a.time - b.time);
		mark(stops.length);
		const total = stops.length + 1;
		// just short of a stop, so what starts there waits for the next press; the last step plays to the end
		const boundary = (n) => n < stops.length ? stops[n] - 0.001 : end;
		shownAt = Math.min(shown, stops.length);
		let target = boundary(shownAt);
		let p = 0;
		let last = performance.now();
		
		/** the step it stands at, and an arrow while one is left */
		const count = () =>
		{
			const waiting = p >= target && shownAt < stops.length;
			hint.textContent = `${shownAt + 1} / ${total}${waiting ? ' →' : ''}`;
			hint.classList.toggle('waiting', waiting);
			show(hint, p >= target);
		};
		
		const apply = () =>
		{
			for(const one of cues)
			{
				if(one.done === false && p >= one.time)
				{
					one.done = true;
					one.act();
				}
			}
			
			for(const typer of typers)
			{
				if(p >= typer.from)
				{
					const share = Math.min(1, (p - typer.from) / Math.max(0.01, typer.to - typer.from));
					typer.node.textContent = typer.text.slice(0, Math.round(typer.text.length * share));
				}
			}
		};
		
		const tick = () =>
		{
			const now = performance.now();
			p = Math.min(target, p + (now - last) / 1000 / k);
			last = now;
			apply();
			count();
			if(p < target)
			{
				frame = requestAnimationFrame(tick);
			}
		};
		
		// one step on: play from where it stands to the next stop
		goTo = (n) =>
		{
			// a press while a step still plays finishes it at once, so every press shows the step it asked for
			p = Math.max(p, boundary(shownAt));
			apply();
			shownAt = Math.min(n, stops.length);
			target = boundary(shownAt);
			last = performance.now();
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(tick);
		};
		
		if(animate)
		{
			frame = requestAnimationFrame(tick);
		}
		else
		{
			p = target;
			apply();
			count();
		}
	};
	
	/** a run, recorded or live: the first step plays on entering the slide, a later one is drawn at once */
	const play = (events, pace = 0.1) =>
	{
		current = events;
		currentPace = pace;
		const shown = element.querySelectorAll('.demo-step.shown').length;
		build(events, pace, shown, shown === 0);
	};
	
	/** the deck, after → or ←: one step on plays it, any other move draws the stop at once */
	const step = (shown) =>
	{
		if(current === null)
		{
			return;
		}
		
		if(shown === shownAt + 1)
		{
			goTo(shown);
			
			return;
		}
		
		if(shown !== shownAt)
		{
			build(current, currentPace, shown, false);
		}
	};
	
	return {play, step, reset};
});
