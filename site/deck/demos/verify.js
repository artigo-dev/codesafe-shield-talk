/*	Demo C (Talk\Scenario\Verify): codesafe's verify lane, with the Shield's rule still in front of
	the hole. The kernel's verdicts are real; the forge, the release, the clock and the copies of
	codesafe's verdict functions are the demo's, and the panel's sub line says so.
	
	One time axis, five lanes:
	pull request  yellow while open, green once merged; a tick per answer of the read-back
	release       r1, then r2
	issue         red while open, green once closed, red again on a regression
	rule          violet while it blocks, hollow once lifted
	requests      red the exploit, yellow codesafe's replay (its trace); a violet ring: the kernel
	              refused it (403)
	
	Under the lanes the compressed-time ruler (what each stretch stands for), then the wire: each
	request travels from the internet through the kernel bar to the app, and stops at the bar while
	the rule blocks. Under the wire, codesafe's own words: the read-back, the replay's verdict, the
	retirement, a regression. The stamp: VERIFIED (r2 holds) or REGRESSED (r2 does not).
	
	data-modes picks the run's mode: holds (the default) or regress. A mode's run takes about 12 s;
	`scale` plays it in about 75 s at the deck's ×0.1 (×0.165). */

Deck.register('verify', (element) =>
{
	const stage = element.querySelector('.demo-stage');
	const svgNs = 'http://www.w3.org/2000/svg';
	// the chart's own coordinates: the svg scales them to the stage
	const W = 1680;
	const H = 650;
	// the labels' column ends at labelX, the time axis runs from L to R, the side's column is right of it
	const labelX = 200;
	const L = 220;
	const R = 1250;
	const sideX = 1485;
	const lanes = ['pull request', 'release', 'issue', 'rule', 'requests'];
	const laneTop = 100;
	const lanePitch = 40;
	const laneHeight = 26;
	const laneY = (lane) => laneTop + lane * lanePitch;
	const rulerY = 318;
	const wireY = 394;
	const kernelX = L + 0.45 * (R - L);
	const appX = R - 210;
	// codesafe's words, under the wire; the side's clock, stamp and legend
	const wordsY = {readBack: 478, replay: 508, warn: 532, retirement: 562, issue: 592};
	const sideY = {label: 116, clock: 156, rate: 184, stamp: 262, legend: 432};
	// a request's trip, in the run's milliseconds: to the kernel, on to the app, then it fades; the app's
	// answer stays said a while
	const toKernel = 350;
	const toApp = 350;
	const linger = 500;
	const answerFor = 3000;
	const DAY = 86400000;
	const HOUR = 3600000;
	let frame = 0;
	
	const make = (name, attributes = {}, parent = null) =>
	{
		const node = document.createElementNS(svgNs, name);
		for(const [key, value] of Object.entries(attributes))
		{
			node.setAttribute(key, String(value));
		}
		
		parent?.append(node);
		
		return node;
	};
	
	const write = (x, y, className, content, parent) =>
	{
		const node = make('text', {x, y, class: className}, parent);
		node.textContent = content;
		
		return node;
	};
	
	const show = (node, visible) => node.setAttribute('visibility', visible ? 'visible' : 'hidden');
	
	const reset = () =>
	{
		cancelAnimationFrame(frame);
		stage.innerHTML = '';
	};
	
	/** one mode's events, gathered: the requests with what became of them, the lanes' states, codesafe's words */
	const runOf = (events, mode) =>
	{
		const mine = events.filter((event) => event.mode === mode);
		const segment = mine.find((event) => event.type === 'segment');
		if(segment === undefined)
		{
			return null;
		}
		
		const of = (type) => mine.filter((event) => event.type === type);
		const byN = (type) => new Map(of(type).map((event) => [event.n, event]));
		const verdicts = byN('verdict');
		const apps = byN('app');
		const responses = byN('response');
		const summary = of('summary')[0] ?? null;
		const end = summary?.t ?? Math.max(...mine.map((event) => event.t ?? 0));
		
		return {
			segment,
			summary,
			end,
			requests: of('request').map((request) => ({
				...request,
				verdict: verdicts.get(request.n) ?? null,
				app: apps.get(request.n) ?? null,
				response: responses.get(request.n) ?? null,
			})),
			stretches: of('stretch').map((stretch, at, all) => ({...stretch, from: stretch.t, to: all[at + 1]?.t ?? end})),
			pr: of('pr'),
			readbacks: of('readback'),
			releases: of('release'),
			issue: of('issue'),
			rule: of('rule'),
			pulls: of('pull'),
			replay: of('replay'),
			retire: of('retire'),
		};
	};
	
	/** the last event of a list at or before now */
	const latest = (list, now) => list.filter((event) => event.t <= now).at(-1) ?? null;
	
	/** what a stretch of codesafe's time stands for: 7 days, 4 h, 31 s */
	const duration = (ms) => ms >= DAY
		? Deck.t('{n} days', {n: Math.round(ms / DAY * 10) / 10})
		: ms >= HOUR ? Deck.t('{n} h', {n: Math.round(ms / HOUR)}) : Deck.t('{n} s', {n: Math.round(ms / 1000)});
	
	const play = (events, pace = 0.1) =>
	{
		reset();
		const mode = (element.dataset.modes ?? '').split(',').find(Boolean) ?? 'holds';
		const run = runOf(events, mode);
		if(run === null)
		{
			stage.textContent = Deck.t('This run has no such mode.');
			
			return;
		}
		
		// the run's end, or the last request's fade on the wire if that is later
		const span = Math.max(run.end, ...run.requests.map((request) => request.t + toKernel + toApp + linger)) + 150;
		const x = (t) => L + Math.max(0, Math.min(span, t)) / span * (R - L);
		const svg = make('svg', {width: stage.clientWidth || W, height: stage.clientHeight || H, viewBox: `0 0 ${W} ${H}`, class: 'verify'}, stage);
		
		// the head: the mode, the exploit, what is real
		const head = make('g', {class: `panel mode-${mode}`}, svg);
		write(0, 28, 'panel-label', Deck.t(run.segment.label), head);
		write(0, 56, 'panel-sub', Deck.t('{exploit} · rule #{rule} (Demo B\'s) in block', {exploit: run.segment.exploit, rule: run.segment.rule}), head);
		write(0, 80, 'panel-sub', Deck.t('the Shield is the real kernel · the forge, the release, the clock and codesafe\'s verdict functions are the demo\'s copies'), head);
		
		// the stretches: a boundary across the lanes, and under them what each one stands for
		const ruler = make('g', {class: 'ruler'}, svg);
		for(const stretch of run.stretches)
		{
			make('line', {x1: x(stretch.from), x2: x(stretch.from), y1: laneTop - 10, y2: rulerY + 6, class: 'tick'}, ruler);
			if(stretch.label)
			{
				make('line', {x1: x(stretch.from) + 4, x2: x(stretch.to) - 4, y1: rulerY, y2: rulerY, class: 'span'}, ruler);
				write((x(stretch.from) + x(stretch.to)) / 2, rulerY + 22, 'tick-label', Deck.t(stretch.label), ruler);
			}
		}
		write(labelX, rulerY + 22, 'lane-label', Deck.t('codesafe\'s time'), ruler);
		
		// the lanes, and their states as bars that grow with the cursor
		const chart = make('g', {class: 'lanes'}, svg);
		lanes.forEach((name, lane) =>
		{
			make('rect', {x: L, y: laneY(lane), width: R - L, height: laneHeight, class: 'lane-band'}, chart);
			write(labelX, laneY(lane) + 19, 'lane-label', Deck.t(name), chart);
		});
		
		const bars = [];
		const addBars = (lane, list, kindOf, textOf) => list.forEach((event, at) =>
		{
			const kind = kindOf(event, at);
			const from = event.t;
			const to = list[at + 1]?.t ?? span;
			bars.push({
				from,
				to,
				rect: make('rect', {x: x(from), y: laneY(lane), width: 0, height: laneHeight, class: kind}, chart),
				text: write(x(from) + 8, laneY(lane) + 18, `bar-text on-${kind}`, textOf(event), chart),
			});
		});
		const words = (map) => (event) => Deck.t(map[event.state] ?? event.state);
		addBars(0, run.pr, (event) => `pr-${event.state}`, words({open: 'open', green: 'green', merged: 'merged'}));
		addBars(1, run.releases, (event, at) => at === 0 ? 'release-old' : 'release-new', (event) => event.name);
		addBars(2, run.issue, (event) => `issue-${event.state}`, words({open: 'open', closed: 'closed: verified', reopened: 'reopened'}));
		addBars(3, run.rule, (event) => `rule-${event.state}`, words({block: 'blocks', lifted: 'lifted', restored: 'restored'}));
		// the quiet days begin with the retirement's first pass that found the evidence gone
		const quiet = run.retire.find((event) => event.act === 'quiet') ?? null;
		const quietText = quiet ? write(x(quiet.t) + 8, laneY(3) + 18, 'bar-text on-rule-block', Deck.t('quiet days'), chart) : null;
		// a tick per answer of the read-back, over the pull request's lane
		const polls = run.readbacks.map((event) => ({
			t: event.t,
			node: make('line', {x1: x(event.t), x2: x(event.t), y1: laneY(0) - 8, y2: laneY(0) - 1, class: 'poll'}, chart),
		}));
		
		// the wire: the internet, the kernel bar, the app
		const wire = make('g', {class: 'wire'}, svg);
		write(labelX, wireY + 6, 'lane-label', Deck.t('internet'), wire);
		make('line', {x1: L, x2: appX, y1: wireY, y2: wireY, class: 'wire-line'}, wire);
		write(kernelX - 20, wireY - 18, 'lane-label', Deck.t('the kernel'), wire);
		const kernel = make('rect', {x: kernelX - 8, y: wireY - 34, width: 16, height: 68, rx: 3, class: 'kernel off'}, wire);
		const kernelText = write(kernelX - 20, wireY + 30, 'kernel-rule', '', wire);
		const app = make('rect', {x: appX, y: wireY - 28, width: R - appX, height: 56, rx: 6, class: 'app'}, wire);
		const appText = write(appX + (R - appX) / 2, wireY + 7, 'app-text', '', wire);
		const answer = write(appX + (R - appX) / 2, wireY + 52, 'status', '', wire);
		
		// the requests: a dot on the lane at the moment it was sent, and a traveller on the wire
		const dots = run.requests.map((request) =>
		{
			const refused = request.verdict?.outcome === 'block';
			const failed = request.app?.error === true;
			const fixed = request.app !== null && failed === false;
			const result = refused ? 'refused' : failed ? 'failed' : fixed ? 'fixed' : '';
			const cy = laneY(4) + laneHeight / 2;
			
			return {
				request,
				refused,
				result,
				done: request.t + (refused ? toKernel : toKernel + toApp),
				dot: make('circle', {cx: x(request.t), cy, r: 9, class: `req ${request.kind}`}, chart),
				status: write(x(request.t), laneY(4) + laneHeight + 18, `status ${result}`, String(request.response?.status ?? ''), chart),
				tag: request.kind === 'replay' ? write(x(request.t) + 15, cy + 5, 'trace-tag', Deck.t('trace'), chart) : null,
				traveller: make('circle', {cx: L, cy: wireY, r: 11, class: `req ${request.kind}`}, wire),
				refusal: refused ? write(kernelX + 30, wireY - 18, 'status refused', String(request.response?.status ?? 403), wire) : null,
			};
		});
		
		// codesafe's words: the read-back, the replay's verdict, the retirement, a regression
		const said = make('g', {class: 'said'}, svg);
		const line = (y, name) => ({
			name: write(labelX, y, 'lane-label', Deck.t(name), said),
			text: write(L, y, 'words', '', said),
		});
		const readText = line(wordsY.readBack, 'read-back');
		const replayText = line(wordsY.replay, 'replay');
		const proves = write(L, wordsY.warn, 'warn', '', said);
		// the replay's call: its answer named the rule that refused it (X-Shield-Rule)
		const call = run.replay.find((event) => event.stage === 'call') ?? null;
		const retireText = line(wordsY.retirement, 'retirement');
		const issueText = line(wordsY.issue, 'issue');
		
		// the side: codesafe's clock, the stamp, the legend
		const side = make('g', {class: 'side'}, svg);
		write(sideX, sideY.label, 'legend-label centred', Deck.t('codesafe\'s clock'), side);
		const clock = write(sideX, sideY.clock, 'clock', '', side);
		const rate = write(sideX, sideY.rate, 'panel-sub centred', '', side);
		const regressed = run.summary?.issue === 'reopened';
		const stamp = make('g', {class: 'stamp'}, side);
		write(sideX, sideY.stamp, `stamp-v word ${regressed ? 'bad' : 'good'}`, Deck.t(regressed ? 'REGRESSED' : 'VERIFIED'), stamp);
		(regressed ? ['VERIFIED UNDER THE RULE,', 'CAME BACK AFTER THE LIFT'] : ['CLOSED ON SILENCE,', 'NOT ON THE REPLAY']).forEach((text, row) =>
		{
			write(sideX, sideY.stamp + 34 + row * 22, 'stamp-l', Deck.t(text), stamp);
		});
		(regressed
			? [Deck.t('issue reopened, High · rule restored'), Deck.t('no verdict said “did not hold”')]
			: [Deck.t('rule lifted 7 quiet days later'), Deck.t('then the exploit: {status}, no error', {status: run.summary?.afterLift?.status ?? 400})]
		).forEach((text, row) =>
		{
			write(sideX, sideY.stamp + 88 + row * 22, 'stamp-small', text, stamp);
		});
		
		const legend = make('g', {class: 'legend'}, side);
		[
			['circle', 'req exploit', Deck.t('the exploit')],
			['circle', 'req replay', Deck.t('the replay (its trace)')],
			['circle', 'req exploit refused', Deck.t('refused by the kernel')],
			['rect', 'rule-block', Deck.t('the rule blocks')],
			['rect', 'rule-lifted', Deck.t('the rule lifted')],
			['rect', 'pr-merged', Deck.t('merged · closed · no error')],
		].forEach(([shape, kind, text], row) =>
		{
			const y = sideY.legend + row * 30;
			if(shape === 'circle')
			{
				make('circle', {cx: 1316, cy: y - 6, r: 9, class: kind}, legend);
			}
			else
			{
				make('rect', {x: 1300, y: y - 15, width: 32, height: 18, class: kind}, legend);
			}
			
			write(1346, y, 'legend-label', text, legend);
		});
		
		const cursor = make('line', {x1: L, x2: L, y1: laneTop - 10, y2: rulerY + 6, class: 'cursor'}, svg);
		
		// what a bar's word needs: its length and the margins, measured once it is drawn
		const lengths = new Map();
		const fits = (text) =>
		{
			if(lengths.has(text) === false)
			{
				lengths.set(text, text.getComputedTextLength() + 14);
			}
			
			return lengths.get(text);
		};
		
		const draw = (now) =>
		{
			cursor.setAttribute('x1', String(x(now)));
			cursor.setAttribute('x2', String(x(now)));
			
			// a bar's word shows once the bar is wide enough to hold it
			for(const {from, to, rect, text} of bars)
			{
				const width = Math.max(0, x(Math.min(now, to)) - x(from) - (now >= to ? 3 : 0));
				rect.setAttribute('width', String(width));
				show(rect, now >= from);
				show(text, now >= from && width >= fits(text));
			}
			if(quietText)
			{
				show(quietText, now >= quiet.t && x(now) - x(quiet.t) >= fits(quietText));
			}
			for(const {t, node} of polls)
			{
				show(node, now >= t);
			}
			
			// the kernel holds what its last pull fetched
			const pulled = latest(run.pulls, now);
			const blocks = (pulled?.rules ?? 0) > 0;
			kernel.setAttribute('class', blocks ? 'kernel on' : 'kernel off');
			kernelText.textContent = pulled === null ? '' : blocks ? Deck.t('rule #{rule} blocks', {rule: run.segment.rule}) : Deck.t('no rule');
			kernelText.setAttribute('class', blocks ? 'kernel-rule on' : 'kernel-rule');
			appText.textContent = Deck.t('app · {release}', {release: latest(run.releases, now)?.name ?? 'r1'});
			
			let answered = null;
			for(const item of dots)
			{
				const {request, refused, result, done} = item;
				const since = now - request.t;
				const arrived = now >= done;
				show(item.dot, since >= 0);
				item.dot.setAttribute('class', `req ${request.kind}${arrived ? ` ${result}` : ''}`);
				show(item.status, arrived);
				if(item.tag)
				{
					show(item.tag, since >= 0);
				}
				if(refused === false && request.app && arrived && now - done < answerFor)
				{
					answered = item;
				}
				
				// on the wire: to the kernel; refused, it stays there and fades; passed, on into the app
				const life = done - request.t + linger;
				if(since < 0 || since > life)
				{
					show(item.traveller, false);
					if(item.refusal)
					{
						show(item.refusal, false);
					}
					continue;
				}
				
				const along = (from, to, part) => from + (to - from) * Math.min(1, Math.max(0, part));
				const cx = since <= toKernel
					? along(L + 10, refused ? kernelX - 20 : kernelX, since / toKernel)
					: refused ? kernelX - 20 : along(kernelX, appX + 26, (since - toKernel) / toApp);
				const fading = Math.max(0, now - done) / linger;
				item.traveller.setAttribute('cx', String(cx));
				item.traveller.setAttribute('opacity', String(1 - fading));
				item.traveller.setAttribute('class', `req ${request.kind}${arrived ? ` ${result}` : ''}`);
				show(item.traveller, true);
				if(item.refusal)
				{
					item.refusal.setAttribute('opacity', String(1 - fading));
					show(item.refusal, arrived);
				}
			}
			
			// the app's last answer, with the release that gave it
			app.setAttribute('class', answered ? `app ${answered.result}` : 'app');
			answer.textContent = answered
				? Deck.t(answered.request.app.error ? '{release}: {status} · error' : '{release}: {status} · no error', {release: answered.request.app.release, status: answered.request.app.status})
				: '';
			answer.setAttribute('class', answered ? `status ${answered.result}` : 'status');
			
			// codesafe's words, as each one was written
			const read = latest(run.readbacks, now);
			readText.text.textContent = read?.result ?? '';
			readText.text.setAttribute('class', `words${read?.result.startsWith('verified') ? ' good' : ''}${read?.result.startsWith('did not hold') ? ' bad' : ''}`);
			show(readText.name, read !== null);
			
			// the verdict comes with the answer: said once the drawn replay reaches the kernel
			const replay = latest(run.replay.filter((event) => event.stage !== 'verdict' || now >= event.t + toKernel), now);
			const judged = replay?.stage === 'verdict';
			replayText.text.textContent = replay === null ? '' : judged ? replay.verdict : replay.outcome;
			replayText.text.setAttribute('class', 'words replay');
			show(replayText.name, replay !== null);
			proves.textContent = judged && (call?.shield ?? 0) > 0
				? Deck.t('the answer named rule #{rule} · the rule holds · the code fix is not tested until the lift', {rule: call.shield})
				: '';
			
			const retired = latest(run.retire, now);
			retireText.text.textContent = retired?.why ?? '';
			retireText.text.setAttribute('class', 'words retirement');
			show(retireText.name, retired !== null);
			
			const back = latest(run.issue.filter((event) => event.state === 'reopened'), now);
			issueText.text.textContent = back ? Deck.t('{mark} · High', {mark: back.mark}) : '';
			issueText.text.setAttribute('class', 'words bad');
			show(issueText.name, back !== null);
			
			// codesafe's clock: the stretch's start, run on at its rate
			const stretch = latest(run.stretches, now);
			if(stretch)
			{
				const model = stretch.model + Math.min(now - stretch.t, stretch.real) * stretch.stands / stretch.real;
				const iso = new Date(model).toISOString();
				clock.textContent = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
				rate.textContent = Deck.t('{stands} in {seconds} s here', {stands: duration(stretch.stands), seconds: (stretch.real / 1000).toFixed(1)});
			}
			
			show(stamp, run.summary !== null && now >= run.summary.t);
		};
		
		const startedAt = performance.now();
		const tick = () =>
		{
			const now = (performance.now() - startedAt) * pace;
			draw(Math.min(now, span));
			if(now < span)
			{
				frame = requestAnimationFrame(tick);
			}
		};
		
		draw(0);
		frame = requestAnimationFrame(tick);
	};
	
	return {play, reset, scale: 1.65};
});
