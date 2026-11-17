/*	The full circle: the ring of codesafe's site (ovos.github.io/codesafe, "THE FULL CIRCLE"),
	drawn into every <svg class="ring"> of the deck before Deck.start() runs.
	
	Six stops on the ring, IDENTIFY 01 to LEARN 06, and at step 04 a second lane across it: the Shield,
	from ADVISE through its shield-shaped stop to VERIFY. Its geometry is the site's, its colours the
	deck's tokens: the accent for the first pair, yellow for the second, green for the pair that closes
	the loop, violet for the Shield.
	
	data-lit     the stops to light, by name (identify classify advise patch shield verify learn); the
	             rest are dimmed. Absent: every stop lit.
	data-lane    "fragment": the Shield's lane appears on the next arrow press instead of at once.
	data-hub     the two lines in the middle, "|" between them; absent: THE LOOP | closes itself.
	data-tags    what decides at a stop, in place of its number: "classify:code+model patch:model+person";
	             the words are code, model and person, and the last of them colours the tag.
	
	Every ring gets its own marker ids, so several on one page never borrow each other's. */

(() =>
{
	const stops = [
		{name: 'identify', label: 'IDENTIFY', n: '01', x: 360, y: 75, kind: 'see'},
		{name: 'classify', label: 'CLASSIFY', n: '02', x: 554.9, y: 187.5, kind: 'see'},
		{name: 'advise', label: 'ADVISE', n: '03', x: 554.9, y: 412.5, kind: 'fix'},
		{name: 'patch', label: 'PATCH', n: '04', x: 360, y: 525, kind: 'fix'},
		{name: 'verify', label: 'VERIFY', n: '05', x: 165.1, y: 412.5, kind: 'close'},
		{name: 'learn', label: 'LEARN', n: '06', x: 165.1, y: 187.5, kind: 'close'},
	];
	
	// the arcs between the stops, each in the colour of the stop it leaves
	const arcs = [
		['see', 'M 423.3 84.1 A 225 225 0 0 1 515.3 137.2'],
		['see', 'M 578.6 246.9 A 225 225 0 0 1 578.6 353.1'],
		['fix', 'M 515.3 462.8 A 225 225 0 0 1 423.3 515.9'],
		['fix', 'M 296.7 515.9 A 225 225 0 0 1 204.7 462.8'],
		['close', 'M 141.4 353.1 A 225 225 0 0 1 141.4 246.9'],
		['close', 'M 204.7 137.2 A 225 225 0 0 1 296.7 84.1'],
	];
	
	const shield = 'M 360.0 289.1 L 426.0 308.9 L 426.0 357.3 C 426.0 396.9 398.5 427.7 360.0 440.9 C 321.5 427.7 294.0 396.9 294.0 357.3 L 294.0 308.9 Z';
	
	let count = 0;
	
	const draw = (svg) =>
	{
		const id = `ring-${++count}`;
		const lit = new Set((svg.dataset.lit ?? '').split(/\s+/).filter((name) => name !== ''));
		const on = (name) => lit.size === 0 || lit.has(name);
		const [hub1, hub2] = (svg.dataset.hub ?? 'THE LOOP|closes itself').split('|');
		const tags = new Map((svg.dataset.tags ?? '').split(/\s+/).filter((tag) => tag.includes(':')).map((tag) => tag.split(':')));
		// the stop's second line: its number, or what decides there
		const second = (name, n, x, y) =>
		{
			const tag = tags.get(name);
			if(tag === undefined)
			{
				return `<text class="n" x="${x}" y="${y}">${n}</text>`;
			}
			const kinds = tag.split('+');
			
			return `<text class="n ring-tag ${kinds.at(-1)}" x="${x}" y="${y}">${kinds.join(' + ').toUpperCase()}</text>`;
		};
		const marker = (kind) => `<marker id="${id}-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="ring-tip ${kind}"/></marker>`;
		
		svg.setAttribute('viewBox', '63 3 594 594');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', 'The full circle: identify, classify, advise, then patch and the Shield side by side, verify, learn, and back to identify.');
		svg.innerHTML = `
			<defs>${['see', 'fix', 'close', 'shield'].map(marker).join('')}</defs>
			<circle cx="360" cy="300" r="225" class="ring-track"/>
			${arcs.map(([kind, d]) => `<path class="ring-arc ${kind}" marker-end="url(#${id}-${kind})" d="${d}"/>`).join('')}
			<circle class="ring-pulse" r="7"/>
			<circle class="ring-pulse p2" r="5"/>
			<circle class="ring-pulse p3" r="4"/>
			<g class="ring-lane${svg.dataset.lane === 'fragment' ? ' fragment' : ''}${on('shield') ? '' : ' dim'}">
				<path class="ring-arc shield" marker-end="url(#${id}-shield)" d="M 496.0 387.4 A 423.6 423.6 0 0 0 425.0 370.0"/>
				<path class="ring-arc shield" marker-end="url(#${id}-shield)" d="M 295.0 370.0 A 423.6 423.6 0 0 0 224.0 387.4"/>
				<circle class="ring-pulse lane" r="7"/>
				<circle class="ring-pulse lane p2" r="5"/>
				<circle class="ring-pulse lane p3" r="4"/>
				<g class="ring-stop shield${on('shield') ? ' on' : ''}">
					<path d="${shield}"/>
					<path class="rim" transform="translate(360 365) scale(.86) translate(-360 -365)" d="${shield}"/>
					<text x="360" y="354">SHIELD</text>${second('shield', '04', 360, 376)}
				</g>
			</g>
			${stops.map((stop) => `
				<g class="ring-stop ${stop.kind}${on(stop.name) ? ' on' : ''}">
					<circle cx="${stop.x}" cy="${stop.y}" r="64"/>
					<text x="${stop.x}" y="${stop.y - 6}">${stop.label}</text>${second(stop.name, stop.n, stop.x, stop.y + 16)}
				</g>`).join('')}
			<text class="ring-hub" x="360" y="224">${hub1}</text>
			<text class="ring-hub small" x="360" y="250">${hub2 ?? ''}</text>`;
		svg.classList.toggle('lit', lit.size > 0);
	};
	
	document.querySelectorAll('svg.ring').forEach(draw);
})();
