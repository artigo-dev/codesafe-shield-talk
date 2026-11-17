/*	Demo B, `replay` (Talk\Scenario\Replay): one exploit, replayed through the real Shield kernel
	before and after its rule.
	
	Four columns, as the run went: no rule, the trial, observe, block. A lane per address, the
	attackers on top. A request is a dot travelling from the internet (left) through the kernel (the
	violet bar) to the application (right).
	
	red      the exploit: action=acme_export, file=../../wp-config.php
	green    an honest request: the same action, file=report-2026-11.csv
	yellow   a tick on the bar: the rule observed the request, let it through and reported it
	red ✕    refused at the bar: a 403
	
	The trial card judges the exploit, the honest request and the exploit's ordinary twin
	(file=plain) against two drafts, with Kernel::patched(). Under the observe panel are the kernel's
	own counters (Store::takeHits()); under the trial and observe, the promotion's conditions, with
	codesafe's thresholds on the demo's scaled clock.
	
	The run takes about a second and a quarter. The deck tells it in about 85 s at its default speed
	(×0.1): each wave's requests leave in the order and at the spacing they were sent, along the
	wave's own clock under its panel, and the dots take their time to cross. */

Deck.register('replay', (element) =>
{
	const stage = element.querySelector('.demo-stage');
	const svgNs = 'http://www.w3.org/2000/svg';
	const modes = ['none', 'observe', 'block'];
	const titles = {none: 'No rule', observe: 'Observe', block: 'Block'};
	let frame = 0;
	
	/** the chart's own coordinates, scaled to the stage */
	const width = 1680;
	const height = 680;
	const lanesTop = 92;
	const lanesBottom = 372;
	const columns = {
		none: {x: 150, w: 370},
		trial: {x: 550, w: 330},
		observe: {x: 910, w: 370},
		block: {x: 1310, w: 370},
	};
	
	/** when each part plays, in seconds at the deck's default speed (×0.1) */
	const plan = {
		none: {pull: 0.9, launch: [1.9, 11.5]},
		trial: {from: 15.5, cells: [16.4, 17.4, 18.4, 20.8, 21.8, 22.8], verdicts: [19.6, 24.0]},
		observe: {from: 25.5, door: 25.8, pull: 26.4, launch: [27.4, 39.6], counters: [42.2, 44.2], checks: 44.8, step: 1.3},
		block: {door: 53.6, pull: 55.9, launch: [56.9, 71.0], strip: 74.0},
		end: 85.5,
	};
	
	/** how long a dot takes from the internet to the kernel, and on to the app; how long a refused one fades */
	const travel = 1.3;
	const onward = 0.9;
	const fade = 0.8;
	
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
	
	const say = (parent, attributes, words = '') =>
	{
		const node = make('text', attributes, parent);
		node.textContent = words;
		
		return node;
	};
	
	/** a line of text in parts, each a tspan of its own class; the tspans, to fill in */
	const line = (parent, attributes, parts) =>
	{
		const node = make('text', attributes, parent);
		
		return parts.map(([words, kind]) =>
		{
			const span = make('tspan', kind ? {class: kind} : {}, node);
			span.textContent = words;
			
			return span;
		});
	};
	
	const show = (node, on) => node.setAttribute('opacity', on ? '1' : '0');
	
	const between = (p, from, to) => Math.max(0, Math.min(1, (p - from) / (to - from)));
	
	const median = (values) => values.length === 0 ? 0 : [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
	
	/** a draft's condition in words: `action equals acme_export`, `file, url-decoded, contains ../` */
	const condition = ({target, decode = [], test, value}) =>
	{
		const name = target.includes(':') ? target.slice(target.indexOf(':') + 1) : target;
		const decoded = decode.length > 0 ? `, ${decode.join(' then ')}-decoded,` : '';
		
		return [`${name}${decoded}`, test.replace(/_/g, ' '), value ?? ''].filter((part) => part !== '').join(' ');
	};
	
	const reset = () =>
	{
		cancelAnimationFrame(frame);
		stage.innerHTML = '';
	};
	
	/** the run: its scene, each segment's requests with their verdicts, the trial, the promotion, the door */
	const read = (events) =>
	{
		const scene = events.find((event) => event.type === 'scene');
		if(scene === undefined)
		{
			return null;
		}
		
		const run = {
			scene,
			segments: Object.fromEntries(modes.map((mode) => [mode, {requests: new Map(), tallies: []}])),
			trial: [],
			drafts: {},
			promotes: [],
			doors: [],
		};
		for(const event of events)
		{
			const segment = run.segments[event.mode];
			const key = `${event.w}:${event.pass}:${event.n}`;
			if(event.type === 'request' && segment)
			{
				segment.requests.set(key, {w: event.w, who: event.who, sent: event.t, outcome: null, us: 0});
			}
			else if(event.type === 'verdict' && segment?.requests.has(key))
			{
				Object.assign(segment.requests.get(key), {outcome: event.outcome, us: event.us});
			}
			else if(event.type === 'tally' && segment)
			{
				segment.tallies.push(event);
			}
			else if(event.type === 'trial')
			{
				run.trial.push(event);
			}
			else if(event.type === 'draft')
			{
				run.drafts[event.draft] = event;
			}
			else if(event.type === 'promote')
			{
				run.promotes.push(event);
			}
			else if(event.type === 'door')
			{
				run.doors[event.generation] = event;
			}
		}
		
		return run;
	};
	
	const play = (events, pace = 0.1) =>
	{
		reset();
		const run = read(events);
		if(run === null)
		{
			stage.textContent = Deck.t('This run has no replay in it.');
			
			return;
		}
		
		const {scene} = run;
		const svg = make('svg', {width: stage.clientWidth || width, height: stage.clientHeight || height, viewBox: `0 0 ${width} ${height}`, class: 'replay'}, stage);
		
		// a lane per address, the attackers on top
		const lanes = scene.lanes;
		const laneHeight = (lanesBottom - lanesTop) / Math.max(1, lanes.length);
		const laneY = new Map(lanes.map((lane, at) => [lane.w, lanesTop + (at + 0.5) * laneHeight]));
		const radius = Math.max(3, Math.min(7, laneHeight * 0.2));
		const labelSize = Math.min(15, Math.floor(laneHeight * 0.8));
		const labels = make('g', {class: 'lanes'}, svg);
		say(labels, {x: 128, y: 80, class: 'edge-label end'}, Deck.t('address'));
		for(const lane of lanes)
		{
			say(labels, {x: 128, y: laneY.get(lane.w) + labelSize * 0.35, class: `lane-label ${lane.who}`, style: `font-size: ${labelSize}px`}, lane.ip);
		}
		
		// a panel per segment: the internet, the kernel's bar, the app; the wave's clock under it
		const panels = Object.fromEntries(modes.map((mode) =>
		{
			const {x, w} = columns[mode];
			const inX = x + 6;
			const barX = x + Math.round(w * 0.56);
			const appX = x + w - 8;
			const group = make('g', {class: `panel ${mode}`}, svg);
			say(group, {x, y: 26, class: 'panel-label'}, Deck.t(titles[mode]));
			const sub = say(group, {x, y: 52, class: 'panel-sub'});
			say(group, {x: inX, y: 80, class: 'edge-label'}, Deck.t('internet'));
			const kernel = say(group, {x: barX, y: 80, class: 'edge-label middle'}, Deck.t('kernel'));
			say(group, {x: appX, y: 80, class: 'edge-label end'}, Deck.t('app'));
			for(const y of laneY.values())
			{
				make('rect', {x: inX, y: y - 0.5, width: appX - inX, height: 1, class: 'track'}, group);
			}
			make('line', {x1: appX, x2: appX, y1: lanesTop - 8, y2: lanesBottom + 8, class: 'app-edge'}, group);
			const bar = make('rect', {x: barX - 5, y: lanesTop - 8, width: 10, height: lanesBottom - lanesTop + 16, rx: 3, class: 'kernel'}, group);
			const marks = make('g', {}, group);
			const dots = make('g', {}, group);
			
			// the wave's requests, launched in the order and at the spacing they were sent
			const requests = [...run.segments[mode].requests.values()].filter((request) => request.outcome !== null).sort((a, b) => a.sent - b.sent);
			const first = requests[0]?.sent ?? 0;
			const span = Math.max(1, (requests.at(-1)?.sent ?? 0) - first);
			const [from, to] = plan[mode].launch;
			const flights = requests.map((request) =>
			{
				const y = laneY.get(request.w);
				const kind = request.who === 'attacker' ? 'exploit' : 'honest';
				let mark = null;
				if(request.outcome === 'observe')
				{
					mark = make('line', {x1: barX - 9, x2: barX + 9, y1: y, y2: y, class: 'observed', opacity: 0}, marks);
				}
				else if(request.outcome === 'block')
				{
					mark = make('path', {d: `M${barX - 22} ${y - 5} l10 10 m0 -10 l-10 10`, class: 'refused-mark', opacity: 0}, marks);
				}
				
				return {
					...request,
					honest: kind === 'honest',
					launch: from + (request.sent - first) / span * (to - from),
					dot: make('circle', {cx: inX, cy: y, r: radius, class: `dot ${kind}`, opacity: 0}, dots),
					mark,
				};
			});
			
			const clockY = 394;
			if(requests.length > 0)
			{
				make('line', {x1: x + 6, x2: x + w - 6, y1: clockY, y2: clockY, class: 'clock-track'}, group);
				say(group, {x, y: clockY + 22, class: 'clock-label'}, '0 ms');
				say(group, {x: x + w / 2, y: clockY + 22, class: 'clock-label middle'}, Deck.t('the wave, as sent'));
				say(group, {x: x + w, y: clockY + 22, class: 'clock-label end'}, `${Math.round(span)} ms`);
			}
			const hand = make('circle', {cx: x + 6, cy: clockY, r: 5, class: 'clock-hand', opacity: 0}, group);
			
			return [mode, {x, w, inX, barX, appX, sub, kernel, bar, flights, from, to, hand, stop: barX - 5 - radius - 2}];
		}));
		
		// under the panels: what reached the app, the kernel's counters, what the block did
		const stripY = 446;
		say(svg, {x: columns.none.x, y: stripY, class: 'strip k'}, Deck.t('reached the app'));
		const [noneExploits, , noneHonest] = line(svg, {x: columns.none.x, y: stripY + 24, class: 'strip'}, [
			['0', 'v bad'],
			[` ${Deck.t('exploits')} · `, 'k'],
			['0', 'v good'],
			[` ${Deck.t('honest')}`, 'k'],
		]);
		
		const counted = run.segments.observe.tallies.reduce((sum, tally) => ({
			entry: sum.entry + tally.entry,
			match: sum.match + tally.match,
			heartbeat: sum.heartbeat + tally.heartbeat,
			requests: sum.requests + tally.requests,
		}), {entry: 0, match: 0, heartbeat: 0, requests: 0});
		const counters = make('g', {opacity: 0}, svg);
		const [, entry, , match] = line(counters, {x: columns.observe.x, y: stripY, class: 'strip'}, [
			['takeHits(): entry ', 'k'],
			['0', 'v'],
			[' · match ', 'k'],
			['0', 'v warn'],
		]);
		const [, honest, , heartbeat] = line(counters, {x: columns.observe.x, y: stripY + 24, class: 'strip'}, [
			['honest ', 'k'],
			['0', 'v good'],
			[` (≥ ${scene.minHonest}) · heartbeat `, 'k'],
			['0', 'v'],
			[`/${counted.requests}`, 'k'],
		]);
		
		const blockStrip = make('g', {opacity: 0}, svg);
		const [blockRefused, , blockPassed] = line(blockStrip, {x: columns.block.x, y: stripY, class: 'strip'}, [
			['0', 'v bad'],
			[` ${Deck.t('exploits refused')} · `, 'k'],
			['0', 'v good'],
			[` ${Deck.t('passed')}`, 'k'],
		]);
		const [, blockUs] = line(blockStrip, {x: columns.block.x, y: stripY + 24, class: 'strip'}, [
			[`${Deck.t('the kernel: median')} `, 'k'],
			['–', 'v'],
			[` µs ${Deck.t('a request')}`, 'k'],
		]);
		const usBlock = Math.round(median(panels.block.flights.map((flight) => flight.us)));
		
		// the trial card: two drafts, three requests each
		const {x: tx, w: tw} = columns.trial;
		const card = make('g', {class: 'trial'}, svg);
		say(card, {x: tx, y: 26, class: 'panel-label'}, Deck.t('The trial'));
		say(card, {x: tx, y: 52, class: 'panel-sub'}, 'Kernel::patched()');
		const cellWidth = 96;
		const cellX = (at) => tx + at * (cellWidth + (tw - 3 * cellWidth) / 2);
		const subjects = ['exploit', 'honest', 'twin'];
		const must = {exploit: 'must hold', honest: 'must pass', twin: 'must pass'};
		subjects.forEach((subject, at) =>
		{
			say(card, {x: cellX(at) + cellWidth / 2, y: 76, class: 'edge-label middle strong'}, Deck.t(subject));
			say(card, {x: cellX(at) + cellWidth / 2, y: 94, class: 'edge-label middle'}, Deck.t(must[subject]));
		});
		const rows = ['bad', 'good'].map((name, row) =>
		{
			const top = 120 + row * 138;
			const draft = run.drafts[name];
			const group = make('g', {}, card);
			say(group, {x: tx, y: top, class: 'draft-title'}, Deck.t(name === 'bad' ? 'bad draft' : 'good draft'));
			(draft?.conditions ?? []).forEach((one, at) =>
			{
				say(group, {x: tx, y: top + 22 + at * 20, class: 'cond'}, condition(one));
			});
			const cells = subjects.map((subject, at) => ({
				result: run.trial.find((event) => event.draft === name && event.subject === subject),
				rect: make('rect', {x: cellX(at), y: top + 50, width: cellWidth, height: 32, rx: 4, class: 'cell'}, group),
				words: say(group, {x: cellX(at) + cellWidth / 2, y: top + 71, class: 'cell-text'}, '…'),
			}));
			const failing = cells.filter((cell) => cell.result?.ok === false).map((cell) => Deck.t(cell.result.subject));
			const verdict = say(card, {x: tx, y: top + 104, class: `draft-verdict ${draft?.kept ? 'good' : 'bad'}`, opacity: 0}, draft?.kept
				? Deck.t('kept: only the exploit holds')
				: Deck.t('dropped: holds on {which}', {which: failing.join(' + ')}));
			const strike = draft?.kept === false ? make('line', {x1: tx - 6, x2: tx + tw + 6, y1: top + 66, y2: top + 66, class: 'strike', opacity: 0}, card) : null;
			
			return {group, cells, verdict, strike, dropped: draft?.kept === false};
		});
		say(svg, {x: tx, y: stripY, class: 'subject'}, Deck.t('twin: the exploit, file={twin}', {twin: scene.twin}));
		say(svg, {x: tx, y: stripY + 22, class: 'subject'}, Deck.t('all three: action={action}', {action: scene.action}));
		
		// the promotion's conditions, as codesafe's promoter judged the counters
		const promote = run.promotes.at(-1);
		const blocking = run.doors[2];
		const checklist = make('g', {class: 'checklist'}, svg);
		const checkTitle = say(checklist, {x: tx, y: 516, class: 'check-title', opacity: 0}, Deck.t('the promotion · codesafe\'s thresholds · 1 h = {ms} ms', {ms: scene.msPerHour})
			+ (run.promotes.length > 1 ? ` · ${Deck.t('pass {n}', {n: run.promotes.length})}` : ''));
		const checks = (promote?.checks ?? []).map((check, at) =>
		{
			const [mark] = line(checklist, {x: tx, y: 544 + at * 23, class: 'check', opacity: 0}, [
				[check.ok ? '✓ ' : '✗ ', check.ok ? 'mark ok' : 'mark no'],
				[check.said, ''],
			]);
			
			return mark.parentNode;
		});
		const decision = say(checklist, {x: tx, y: 544 + checks.length * 23, class: `check-verdict ${promote?.verdict === 'blocked' ? '' : 'held'}`, opacity: 0}, promote?.verdict === 'blocked'
			? Deck.t('→ set to block · version {version} · every site nudged', {version: (blocking?.version ?? '').slice(0, 7)})
			: Deck.t('→ still observing: {why}', {why: promote?.why ?? ''}));
		
		// the legend, and what is real and what is the demo's
		const legend = make('g', {class: 'legend'}, svg);
		[
			['exploit', Deck.t('exploit: file={file}', {file: scene.exploit})],
			['honest', Deck.t('honest: file={file}', {file: scene.honest})],
			['kernel', Deck.t('the Shield kernel: Kernel::handle()')],
			['observed', Deck.t('observed: let through and reported')],
			['refused', Deck.t('refused at the kernel: a 403')],
		].forEach(([kind, words], at) =>
		{
			const y = 516 + at * 24;
			if(kind === 'exploit' || kind === 'honest')
			{
				make('circle', {cx: 14, cy: y - 6, r: 6, class: `dot ${kind}`}, legend);
			}
			else if(kind === 'kernel')
			{
				make('rect', {x: 9, y: y - 17, width: 10, height: 22, rx: 3, class: 'kernel'}, legend);
			}
			else if(kind === 'observed')
			{
				make('line', {x1: 4, x2: 24, y1: y - 6, y2: y - 6, class: 'observed'}, legend);
			}
			else
			{
				make('path', {d: `M9 ${y - 11} l10 10 m0 -10 l-10 10`, class: 'refused-mark'}, legend);
			}
			say(legend, {x: 40, y, class: 'legend-label'}, words);
		});
		say(svg, {x: 0, y: 648, class: 'panel-sub'}, Deck.t('the real Shield kernel (php-library)'));
		say(svg, {x: 0, y: 672, class: 'panel-sub'}, Deck.t('door and promotion modelled · 2 h → {s} s', {s: 2 * scene.msPerHour / 1000}));
		
		// the stamp: exploits that reached the app in the segment on screen, honest requests refused in all
		const stampY = 604;
		const reachedValue = say(svg, {x: 1330, y: stampY, class: 'stamp-v idle'}, '0');
		say(svg, {x: 1330, y: stampY + 34, class: 'stamp-l'}, Deck.t('EXPLOITS REACHED'));
		const reachedMode = say(svg, {x: 1330, y: stampY + 56, class: 'stamp-l'});
		const refusedValue = say(svg, {x: 1570, y: stampY, class: 'stamp-v good'}, '0');
		say(svg, {x: 1570, y: stampY + 34, class: 'stamp-l'}, Deck.t('HONEST REQUESTS'));
		say(svg, {x: 1570, y: stampY + 56, class: 'stamp-l'}, Deck.t('REFUSED'));
		
		const subs = {
			none: [plan.none.pull, Deck.t('pulled: no rule for the CVE yet')],
			observe: [plan.observe.door, run.doors[1] ? Deck.t('rule {id} served, mode observe', {id: scene.rule}) : ''],
			block: [plan.block.door, blocking ? Deck.t('rule {id} served, mode block', {id: scene.rule}) : ''],
		};
		const pulled = {none: Deck.t('kernel · pulled'), observe: Deck.t('nudged → pulled'), block: Deck.t('nudged → pulled')};
		const hasBlock = panels.block.flights.length > 0;
		
		// the deck's speed: the plan is written at ×0.1
		const k = 0.1 / pace;
		const startedAt = performance.now();
		const draw = () =>
		{
			const p = (performance.now() - startedAt) / 1000 / k;
			const reached = {none: 0, observe: 0, block: 0};
			const passed = {none: 0, observe: 0, block: 0};
			let refused = 0;
			let honestRefused = 0;
			
			for(const mode of modes)
			{
				const panel = panels[mode];
				for(const flight of panel.flights)
				{
					const since = p - flight.launch;
					let x = panel.inX;
					let opacity = 0;
					if(since >= 0 && since < travel)
					{
						x = panel.inX + (panel.stop - panel.inX) * since / travel;
						opacity = 1;
					}
					else if(since >= travel && flight.outcome === 'block')
					{
						x = panel.stop;
						opacity = Math.max(0, 1 - (since - travel) / fade);
						refused+= flight.honest ? 0 : 1;
						honestRefused+= flight.honest ? 1 : 0;
					}
					else if(since >= travel)
					{
						const share = Math.min(1, (since - travel) / onward);
						x = panel.stop + (panel.appX - panel.stop) * share;
						opacity = share < 1 ? 1 : 0;
						reached[mode]+= share >= 1 && flight.honest === false ? 1 : 0;
						passed[mode]+= share >= 1 && flight.honest ? 1 : 0;
					}
					
					flight.dot.setAttribute('cx', String(x));
					flight.dot.setAttribute('opacity', String(opacity));
					if(flight.mark !== null)
					{
						show(flight.mark, since >= travel);
					}
				}
				
				const share = between(p, panel.from, panel.to);
				panel.hand.setAttribute('cx', String(panel.x + 6 + share * (panel.w - 12)));
				show(panel.hand, p >= panel.from && panel.flights.length > 0);
				panel.bar.classList.toggle('flash', p >= plan[mode].pull && p < plan[mode].pull + 0.7);
				panel.kernel.textContent = p >= plan[mode].pull && panel.flights.length > 0 ? pulled[mode] : Deck.t('kernel');
				panel.sub.textContent = p >= subs[mode][0] ? subs[mode][1] : '';
			}
			
			noneExploits.textContent = String(reached.none);
			noneHonest.textContent = String(passed.none);
			
			// the counters, taken after the wave: counted up as they arrive
			const [countFrom, countTo] = plan.observe.counters;
			const filled = between(p, countFrom, countTo);
			counters.setAttribute('opacity', p >= countFrom ? '1' : '0');
			entry.textContent = String(Math.round(counted.entry * filled));
			match.textContent = String(Math.round(counted.match * filled));
			honest.textContent = String(Math.round((counted.entry - counted.match) * filled));
			heartbeat.textContent = String(Math.round(counted.heartbeat * filled));
			
			blockStrip.setAttribute('opacity', p >= plan.block.door && hasBlock ? '1' : '0');
			blockRefused.textContent = String(refused);
			blockPassed.textContent = String(passed.block);
			blockUs.textContent = p >= plan.block.strip && hasBlock ? String(usBlock) : '–';
			
			// the trial, cell by cell
			card.setAttribute('opacity', p >= plan.trial.from ? '1' : '0.35');
			rows.forEach((row, at) =>
			{
				row.cells.forEach((cell, index) =>
				{
					const known = cell.result !== undefined && p >= plan.trial.cells[at * 3 + index];
					const kind = known ? (cell.result.ok ? 'good' : 'bad') : '';
					cell.rect.setAttribute('class', `cell ${kind}`);
					cell.words.setAttribute('class', `cell-text ${kind}`);
					cell.words.textContent = known ? Deck.t(cell.result.holds ? 'holds' : 'passes') : '…';
				});
				const decided = p >= plan.trial.verdicts[at];
				show(row.verdict, decided);
				row.group.setAttribute('opacity', decided && row.dropped ? '0.5' : '1');
				if(row.strike !== null)
				{
					show(row.strike, decided);
				}
			});
			
			// the promotion, a condition at a time
			show(checkTitle, p >= countFrom);
			checks.forEach((node, at) => show(node, p >= plan.observe.checks + at * plan.observe.step));
			show(decision, p >= plan.observe.checks + checks.length * plan.observe.step + 0.1);
			
			// the stamp follows the segment on screen
			const current = p >= plan.block.door ? 'block' : p >= plan.observe.from ? 'observe' : 'none';
			const settled = current === 'block' && hasBlock && reached.block === 0;
			reachedValue.textContent = String(reached[current]);
			reachedValue.setAttribute('class', `stamp-v ${reached[current] > 0 ? 'bad' : settled ? 'good' : 'idle'}`);
			reachedMode.textContent = Deck.t('THE APP · {mode}', {mode: Deck.t(titles[current]).toUpperCase()});
			refusedValue.textContent = String(honestRefused);
			refusedValue.setAttribute('class', `stamp-v ${honestRefused > 0 ? 'bad' : 'good'}`);
			
			if(p < plan.end)
			{
				frame = requestAnimationFrame(draw);
			}
		};
		
		frame = requestAnimationFrame(draw);
	};
	
	return {play, reset};
});
