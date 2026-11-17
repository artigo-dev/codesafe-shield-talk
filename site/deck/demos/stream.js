/*	Demo A, `stream` (Talk\Scenario\Stream): a burst into the ingest stream, a worker killed with a batch
	in hand, and nothing lost. A model of codesafe's worker on the talk's Redis 8, not codesafe's code.
	
	One time axis. A lane per door (a bar per pipeline, "sent → accepted": the XADD replies counted), the
	stream's backlog under them (accepted, not yet acked), a lane per worker (a bar per batch it read or
	claimed), and the dead stream.
	
	yellow       a batch being written
	green        written and acked
	red outline  held by a consumer that is dead: pending until a claim cycle adopts it
	red square   a delivery of the poison entry that failed, with its count
	
	The tally on the right counts as the run goes; the stamp is the run's own summary. The run takes about
	5 s: scale 0.74 plays it at ×0.074, about 67 s (0.75 would print as ×0.07500000000000001). */

Deck.register('stream', (element) =>
{
	const stage = element.querySelector('.demo-stage');
	const svgNs = 'http://www.w3.org/2000/svg';
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
	
	const write = (parent, x, y, className, content, attributes = {}) =>
	{
		const node = make('text', {x, y, class: className, ...attributes}, parent);
		node.textContent = content;
		
		return node;
	};
	
	const show = (node, visible) => node.setAttribute('visibility', visible ? 'visible' : 'hidden');
	
	const reset = () =>
	{
		cancelAnimationFrame(frame);
		stage.innerHTML = '';
	};
	
	/** how many of the sorted times are at or before t */
	const countUntil = (times, t) =>
	{
		let low = 0;
		let high = times.length;
		while(low < high)
		{
			const middle = (low + high) >> 1;
			if(times[middle] <= t)
			{
				low = middle + 1;
			}
			else
			{
				high = middle;
			}
		}
		
		return low;
	};
	
	const thousands = (value) => value.toLocaleString('en').replace(/,/g, ' ');
	
	/** 0, 0.5 s, 1 s, 1.25 s */
	const seconds = (ms) =>
	{
		if(ms === 0)
		{
			return '0';
		}
		
		const digits = ms % 1000 === 0 ? 0 : ms % 100 === 0 ? 1 : 2;
		
		return `${Deck.decimal(ms / 1000, digits)} s`;
	};
	
	/** a mono label's width, from its length (the font may not have loaded when it is measured) */
	const widthOf = (content, size) => content.length * size * 0.6;
	
	/**
	 * The run, read from its events: the doors' pipelines, the workers' batches (a read, or the
	 * entries one claim cycle adopted), the poison's failures, the kill, the backlog's changes
	 */
	const runOf = (events) =>
	{
		const segment = events.find((event) => event.type === 'segment');
		if(segment === undefined)
		{
			return null;
		}
		
		const run = {
			segment,
			pipelines: [],
			groups: [],
			failures: [],
			crash: null,
			start: null,
			dead: null,
			summary: null,
			// the backlog: +accepted at a pipeline, -1 at an ack
			changes: [],
			// the tally: when each count went up
			accepted: [],
			stored: [],
			deadTimes: [],
			end: 0,
		};
		// an entry's id → the batch that holds it now; a worker → its latest batch
		const owner = new Map();
		const latest = new Map();
		const ordered = events.filter((event) => typeof event.t === 'number').sort((a, b) => a.t - b.t);
		
		for(const event of ordered)
		{
			switch(event.type)
			{
				case 'xadd':
					run.pipelines.push(event);
					run.changes.push([event.t, event.accepted]);
					run.accepted.push([event.t, event.accepted]);
					break;
				case 'read':
				{
					const group = {w: event.w, kind: 'read', t0: event.t, t1: event.t, ids: event.ids, written: 0};
					run.groups.push(group);
					latest.set(event.w, group);
					event.ids.forEach((id) => owner.set(id, group));
					break;
				}
				case 'claim':
				{
					// the batch a dead consumer held: adopted here
					const previous = owner.get(event.id);
					if(previous?.crashed !== undefined && previous.claimed === undefined)
					{
						previous.claimed = event.t;
					}
					
					// one claim cycle's entries follow each other within milliseconds
					let group = latest.get(event.w);
					if(group?.kind !== 'claim' || event.t - group.t1 > segment.claimEveryMs / 2)
					{
						group = {w: event.w, kind: 'claim', from: event.from, idleMs: event.idleMs, t0: event.t, t1: event.t, ids: [], written: 0};
						run.groups.push(group);
						latest.set(event.w, group);
					}
					group.ids.push(event.id);
					group.t1 = Math.max(group.t1, event.t);
					owner.set(event.id, group);
					break;
				}
				case 'stored':
				case 'ack':
				case 'failed':
				case 'dead':
				{
					const group = owner.get(event.id);
					if(group !== undefined)
					{
						group.t1 = Math.max(group.t1, event.t);
						group.written+= event.type === 'stored' ? 1 : 0;
					}
					
					if(event.type === 'stored' && event.again !== true)
					{
						run.stored.push(event.t);
					}
					if(event.type === 'ack')
					{
						run.changes.push([event.t, -1]);
					}
					if(event.type === 'failed')
					{
						run.failures.push(event);
					}
					if(event.type === 'dead')
					{
						run.dead = event;
						run.deadTimes.push(event.t);
					}
					break;
				}
				case 'crash':
				{
					run.crash = event;
					const group = latest.get(event.w);
					if(group !== undefined)
					{
						group.crashed = event.t;
					}
					break;
				}
				case 'start':
					run.start = event;
					break;
				case 'summary':
					run.summary = event;
					break;
			}
			
			run.end = Math.max(run.end, event.t);
		}
		
		return run;
	};
	
	const play = (events, pace = 0.1) =>
	{
		reset();
		const run = runOf(events);
		if(run === null)
		{
			stage.textContent = Deck.t('This run has no such mode.');
			
			return;
		}
		
		const {segment} = run;
		const width = stage.clientWidth || 1680;
		const height = stage.clientHeight || 680;
		
		// across: the lanes' names, the chart, the tally and the stamp
		const x0 = 180;
		const x1 = width - 440;
		const columnX = x1 + 50;
		const columnMiddle = columnX + (width - columnX) / 2;
		const step = [100, 200, 250, 500, 1000, 2000].find((candidate) => run.end / candidate <= 10) ?? 5000;
		const span = Math.max(step, Math.ceil(run.end / step) * step);
		const x = (t) => x0 + Math.max(0, Math.min(span, t)) / span * (x1 - x0);
		
		// down: the label, the doors, the backlog, the workers, the dead stream, the axis, the legend
		const doors = segment.doors;
		const doorRow = Math.max(18, Math.min(30, 110 / doors));
		const doorsTop = 92;
		const backlogTop = doorsTop + doors * doorRow + 14;
		const noteRow = 24;
		const barHeight = 26;
		const markRow = 24;
		const workerHeight = noteRow + barHeight + markRow;
		const deadHeight = 30;
		const available = height - 76 - backlogTop;
		const backlogHeight = Math.max(60, Math.min(150, available - 2 * workerHeight - deadHeight - 24));
		const gap = Math.max(6, (available - 2 * workerHeight - deadHeight - backlogHeight) / 4);
		const workerTop = (w) => backlogTop + backlogHeight + gap + (w - 1) * (workerHeight + gap);
		const barTop = (w) => workerTop(w) + noteRow;
		const markY = (w) => barTop(w) + barHeight + 6;
		const deadTop = workerTop(3);
		const chartBottom = deadTop + deadHeight;
		const axisY = chartBottom + 30;
		const legendY = height - 8;
		
		const svg = make('svg', {width, height, viewBox: `0 0 ${width} ${height}`, class: 'stream'}, stage);
		
		// the time axis
		const axis = make('g', {class: 'axis'}, svg);
		for(let t = 0; t <= span; t+= step)
		{
			make('line', {x1: x(t), x2: x(t), y1: doorsTop - 8, y2: chartBottom + 6, class: 'tick'}, axis);
			write(axis, x(t), axisY, 'tick-label', seconds(t));
		}
		write(axis, 0, axisY, 'axis-title', Deck.t('time →'));
		
		// the label: what runs, and what it is not
		const sent = segment.doors * segment.batches * segment.batch;
		const head = make('g', {class: 'panel'}, svg);
		write(head, 0, 30, 'panel-label', Deck.t('{sent} reports · {doors} doors · one worker at a time', {sent, doors}));
		write(head, 0, 62, 'panel-sub', Deck.t("a model of codesafe's worker on Redis 8 · claim idle 60 s → {idle} here", {idle: seconds(segment.claimIdleMs)}));
		
		// the lanes' names
		const names = make('g', {class: 'names'}, svg);
		for(let p = 1; p <= doors; p++)
		{
			write(names, 0, doorsTop + (p - 0.5) * doorRow + 6, 'lane-label', Deck.t('door {p}', {p}));
		}
		write(names, 0, backlogTop + 22, 'lane-label', Deck.t('stream'));
		write(names, 0, backlogTop + 46, 'lane-sub', Deck.t('not yet acked'));
		write(names, 0, backlogTop + 68, 'lane-sub', Deck.t('MAXLEN ~ {maxlen}', {maxlen: thousands(segment.maxlen)}));
		for(const w of [1, 2])
		{
			write(names, 0, barTop(w) + 19, 'lane-label', Deck.t('worker {w}', {w}));
			write(names, 0, barTop(w) + 42, 'lane-sub', Deck.t('consumer w{w}', {w}));
		}
		write(names, 0, deadTop + 21, 'lane-label', Deck.t('dead stream'));
		
		const chart = make('g', {class: 'chart'}, svg);
		
		// the doors: a bar per pipeline, its label where the next one leaves room for it
		const doorFont = doorRow < 26 ? 14 : 16;
		const pipelines = run.pipelines.map((pipeline) =>
		{
			const y = doorsTop + (pipeline.p - 1) * doorRow + (doorRow - 14) / 2;
			const refused = pipeline.accepted < pipeline.sent;
			const bar = make('rect', {x: x(pipeline.t) - 2, y, width: 5, height: 14, class: refused ? 'door refused' : 'door'}, chart);
			const label = `${pipeline.sent} → ${pipeline.accepted}`;
			const next = run.pipelines.find((other) => other.p === pipeline.p && other.t > pipeline.t);
			const fits = next === undefined || x(next.t) - x(pipeline.t) - 10 >= widthOf(label, doorFont);
			const text = fits || refused
				? write(chart, x(pipeline.t) + 8, y + 12, refused ? 'door-label refused' : 'door-label', label, {style: `font-size: ${doorFont}px`})
				: null;
			
			return {pipeline, nodes: [bar, text].filter(Boolean)};
		});
		const lastDoor = Math.max(0, ...run.pipelines.map((pipeline) => x(pipeline.t) + 8 + widthOf(`${pipeline.sent} → ${pipeline.accepted}`, doorFont)));
		write(chart, Math.max(lastDoor + 30, x(span * 0.35)), doorsTop + doorRow * 0.5 + 6, 'note', Deck.t('sent → accepted: the XADD replies, counted'));
		
		// the backlog: accepted, not yet acked (an ack deletes the entry: XACK, then XDEL)
		let count = 0;
		let peak = {count: 0, t: 0};
		const backlog = run.changes.map(([t, delta]) =>
		{
			count+= delta;
			if(count > peak.count)
			{
				peak = {count, t};
			}
			
			return [t, count];
		});
		const backlogTimes = backlog.map(([t]) => t);
		const backlogBottom = backlogTop + backlogHeight;
		const levelY = (value) => backlogBottom - value / Math.max(1, peak.count) * (backlogHeight - 26);
		const outline = backlog.map(([t, value]) => `H ${x(t).toFixed(1)} V ${levelY(value).toFixed(1)}`).join(' ');
		const clip = make('clipPath', {id: 'stream-backlog-clip'}, make('defs', {}, svg));
		const reveal = make('rect', {x: x0, y: backlogTop - 4, width: 0, height: backlogHeight + 8}, clip);
		make('path', {d: `M ${x0} ${backlogBottom} ${outline} H ${x(span)} V ${backlogBottom} Z`, class: 'backlog', 'clip-path': 'url(#stream-backlog-clip)'}, chart);
		make('line', {x1: x0, x2: x1, y1: backlogBottom, y2: backlogBottom, class: 'baseline'}, chart);
		const peakLabel = write(chart, x(peak.t), levelY(peak.count) - 10, 'backlog-label', Deck.t('peak {n}', {n: peak.count}), {'text-anchor': 'middle'});
		
		// the workers: a bar per batch; the batch of a killed worker is pending until it is claimed
		const batches = run.groups
			.filter((group) => group.kind === 'read' || group.written > 0 || group.crashed !== undefined)
			.map((group) => ({
				group,
				bar: make('rect', {x: x(group.t0), y: barTop(group.w), width: 0, height: barHeight, class: 'wait'}, chart),
				held: group.crashed === undefined ? null : make('rect', {x: x(group.crashed), y: barTop(group.w) + 1, width: 0, height: barHeight - 2, class: 'pending'}, chart),
			}));
		
		// the kill
		const killed = [];
		const held = run.groups.find((group) => group.crashed !== undefined);
		if(run.crash !== null)
		{
			const at = x(run.crash.t);
			killed.push(make('line', {x1: at, x2: at, y1: workerTop(1) + 4, y2: barTop(1) + barHeight + 4, class: 'crash'}, chart));
			killed.push(write(chart, at + 8, workerTop(1) + 17, 'crash-label', Deck.t('kill -9 · {n} entries in hand, none acked', {n: run.crash.pending})));
			if(held !== undefined && widthOf(String(run.crash.pending), 16) + 16 < x(held.claimed ?? span) - at)
			{
				killed.push(write(chart, at + 8, barTop(1) + 19, 'pending-label', String(run.crash.pending)));
			}
		}
		
		// the next worker, and what it adopts: XPENDING, then XCLAIM of what sat idle long enough
		const started = [];
		if(run.start !== null)
		{
			const at = x(run.start.t);
			started.push(make('line', {x1: at, x2: at, y1: workerTop(2) + 4, y2: barTop(2) + barHeight + 4, class: 'start-mark'}, chart));
			started.push(write(chart, at + 8, workerTop(2) + 17, 'note', Deck.t("cron's next run: worker 2 starts")));
		}
		
		const adoptions = run.groups.filter((group) => group.kind === 'claim' && group.from !== group.w && group.written > 0).map((group) =>
		{
			const at = x(group.t0);
			const from = group.from === 1 ? 1 : 2;
			const nodes = [
				make('line', {x1: at, x2: at, y1: barTop(from) + barHeight, y2: barTop(group.w), class: 'claim-line'}, chart),
			];
			if(held !== undefined && held.claimed !== undefined)
			{
				nodes.push(write(chart, x(held.claimed) + 10, barTop(from) + 19, 'claim-label', Deck.t('→ worker 2: XPENDING, idle ≥ {idle}, XCLAIM {n}', {idle: seconds(segment.claimIdleMs), n: group.ids.length})));
			}
			
			return {group, nodes};
		});
		
		// the poison: every failed delivery, counted, then the dead stream
		const poison = run.failures.map((failure, at) =>
		{
			const cx = x(failure.t);
			const cy = markY(failure.w) + 6;
			const nodes = [
				make('rect', {x: cx - 6, y: cy - 6, width: 12, height: 12, class: 'poison'}, chart),
				write(chart, cx + 10, cy + 6, 'poison-label', String(failure.deliveries)),
			];
			if(at === 0)
			{
				nodes.push(write(chart, cx - 12, cy + 6, 'poison-label', Deck.t('poison'), {'text-anchor': 'end'}));
			}
			
			const previous = run.failures[at - 1];
			if(previous !== undefined)
			{
				nodes.push(make('line', {x1: x(previous.t) + 24, x2: cx - 8, y1: markY(previous.w) + 6, y2: cy, class: 'poison-path'}, chart));
			}
			
			return {t: failure.t, nodes};
		});
		if(run.dead !== null)
		{
			const cx = x(run.dead.t);
			const cy = deadTop + deadHeight / 2;
			const lastFailure = run.failures[run.failures.length - 1];
			const nodes = [
				make('rect', {x: cx - 7, y: cy - 7, width: 14, height: 14, class: 'dead'}, chart),
				write(chart, cx - 16, cy + 6, 'dead-label', Deck.t('delivered {n} times → XADD dead, then XACK', {n: run.failures.length}), {'text-anchor': 'end'}),
			];
			if(lastFailure !== undefined)
			{
				nodes.push(make('line', {x1: x(lastFailure.t) + 24, x2: cx, y1: markY(lastFailure.w) + 6, y2: cy - 8, class: 'poison-path'}, chart));
			}
			poison.push({t: run.dead.t, nodes});
		}
		
		const cursor = make('line', {x1: x0, x2: x0, y1: doorsTop - 8, y2: chartBottom + 6, class: 'cursor'}, svg);
		
		// the tally: accepted = stored + dead-lettered + still in the stream
		const tally = make('g', {class: 'tally'}, svg);
		const tallyY = doorsTop + 30;
		const rows = [
			['accepted', Deck.t('accepted')],
			['stored', Deck.t('stored')],
			['deadlettered', Deck.t('dead-lettered')],
			['flight', Deck.t('in the stream')],
		].map(([kind, label], at) =>
		{
			const rowY = tallyY + at * 50 + (at === 3 ? 14 : 0);
			write(tally, columnX + 150, rowY - 4, 'tally-l', label);
			
			return write(tally, columnX + 130, rowY, `tally-v ${kind}`, '0');
		});
		make('line', {x1: columnX + 20, x2: width - 20, y1: tallyY + 117, y2: tallyY + 117, class: 'tick'}, tally);
		const acceptedTimes = run.accepted.map(([t]) => t);
		const acceptedSums = run.accepted.reduce((sums, [, n]) => [...sums, (sums[sums.length - 1] ?? 0) + n], []);
		
		// the stamp: the run's own summary
		const stamp = make('g', {class: 'stamp'}, svg);
		const stampY = Math.max(tallyY + 300, barTop(2) + 30);
		const lost = run.summary?.lost ?? null;
		if(lost !== null)
		{
			write(stamp, columnMiddle, stampY, `stamp-v ${lost === 0 ? 'good' : 'bad'}`, String(lost));
			write(stamp, columnMiddle, stampY + 40, 'stamp-l', Deck.t('ENTRIES LOST'));
			write(stamp, columnMiddle, stampY + 76, 'stamp-sub', Deck.t('{dead} dead-lettered · {twice} delivered twice', {dead: run.summary.dead, twice: run.summary.redelivered}));
			if(run.summary.rewritten > 0)
			{
				write(stamp, columnMiddle, stampY + 102, 'stamp-sub', Deck.t('{n} written twice, stored once', {n: run.summary.rewritten}));
			}
		}
		
		// the legend, along the bottom
		const legend = make('g', {class: 'legend'}, svg);
		let legendX = 0;
		[
			['wait', Deck.t('a batch being written')],
			['done', Deck.t('written and acked')],
			['pending', Deck.t('held by a dead consumer: pending')],
			['poison', Deck.t('a failed delivery, counted')],
		].forEach(([kind, label]) =>
		{
			make('rect', {x: legendX, y: legendY - 14, width: kind === 'poison' ? 14 : 34, height: 14, class: kind}, legend);
			write(legend, legendX + (kind === 'poison' ? 26 : 46), legendY, 'legend-label', label);
			legendX+= (kind === 'poison' ? 26 : 46) + widthOf(label, 18) + 48;
		});
		
		const finish = run.summary?.t ?? run.end;
		const startedAt = performance.now();
		const draw = () =>
		{
			const now = (performance.now() - startedAt) * pace;
			cursor.setAttribute('x1', String(x(now)));
			cursor.setAttribute('x2', String(x(now)));
			reveal.setAttribute('width', String(Math.max(0, x(now) - x0)));
			
			for(const {pipeline, nodes} of pipelines)
			{
				nodes.forEach((node) => show(node, now >= pipeline.t));
			}
			show(peakLabel, now >= peak.t && peak.count > 0);
			
			for(const {group, bar, held: pending} of batches)
			{
				const until = group.crashed ?? group.t1;
				const done = now >= until;
				show(bar, now >= group.t0);
				bar.setAttribute('width', String(Math.max(2, x(Math.min(now, until)) - x(group.t0) - (done && group.crashed === undefined ? 2 : 0))));
				bar.setAttribute('class', group.crashed === undefined && done ? 'done' : 'wait');
				if(pending !== null)
				{
					const end = Math.min(now, group.claimed ?? Infinity);
					show(pending, now >= group.crashed);
					pending.setAttribute('width', String(Math.max(0, x(end) - x(group.crashed))));
				}
			}
			
			killed.forEach((node) => show(node, run.crash !== null && now >= run.crash.t));
			started.forEach((node) => show(node, run.start !== null && now >= run.start.t));
			for(const {group, nodes} of adoptions)
			{
				nodes.forEach((node) => show(node, now >= group.t0));
			}
			for(const {t, nodes} of poison)
			{
				nodes.forEach((node) => show(node, now >= t));
			}
			
			const accepted = acceptedSums[countUntil(acceptedTimes, now) - 1] ?? 0;
			const stored = countUntil(run.stored, now);
			const dead = countUntil(run.deadTimes, now);
			const flight = backlog[countUntil(backlogTimes, now) - 1]?.[1] ?? 0;
			[accepted, stored, dead, flight].forEach((value, at) =>
			{
				rows[at].textContent = String(value);
			});
			show(stamp, now >= finish);
			
			if(now < span)
			{
				frame = requestAnimationFrame(draw);
			}
		};
		
		frame = requestAnimationFrame(draw);
	};
	
	return {play, reset, scale: 0.74};
});
