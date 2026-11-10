# Writes SPEAKER-GUIDE.md (project root) from the speaker notes in deck/src/slides, in running order.
#   python3 deck/make_guide.py
import json, re, html, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nar = json.load(open(f'{root}/deck/src/narratives/front-door.json'))
ids, backup = nar['ids'], nar.get('backup', [])
def conv(frag):
    frag = re.sub(r'<(b|strong)>(.*?)</\1>', r'**\2**', frag, flags=re.S)
    frag = re.sub(r'<(i|em)>(.*?)</\1>', r'*\2*', frag, flags=re.S)
    frag = re.sub(r'<code>(.*?)</code>', r'`\1`', frag, flags=re.S)
    frag = re.sub(r'<[^>]+>', '', frag)
    return html.unescape(re.sub(r'\s+', ' ', frag)).strip()
def slide(id):
    s = open(f'{root}/deck/src/slides/{id}.html').read()
    title = re.search(r'data-title="([^"]*)"', s); chap = re.search(r'data-chapter="([^"]*)"', s)
    steps = max([int(x) for x in re.findall(r'data-step="(\d+)"', s)] or [0])
    notes = re.search(r'<aside class="notes">(.*?)</aside>', s, re.S)
    paras = [conv(p) for p in re.findall(r'<p>(.*?)</p>', notes.group(1), re.S)] if notes else []
    t = ''
    if paras and re.fullmatch(r'\*\*\[\d+:\d+\]\*\*', paras[0]): t = paras.pop(0).strip('*[]')
    return dict(title=html.unescape(title.group(1)) if title else id, chapter=html.unescape(chap.group(1)) if chap else '', steps=steps, time=t, paras=paras)
def secs(t):
    m = re.match(r'(\d+):(\d+)', t or ''); return int(m.group(1)) * 60 + int(m.group(2)) if m else 0
rows = [slide(i) for i in ids]; brows = [slide(i) for i in backup]
total = sum(secs(r['time']) for r in rows)
o = ["# Speaker guide: Your Next Customer Won't Click\n",
     f"Devcon 8 · Agentic Hub · Wed 4 Nov 2026, 15:00 IST. {len(rows)} slides, about {total//60}:{total%60:02d} by the timings below. "
     "Made from the speaker notes in `deck/src/slides/` (the same text as the presenter window, key **P**; rebuild this file with `python3 deck/make_guide.py`). "
     "\"Press\" means one click forward. Quoted lines are what to say; the rest is what happens on screen. \"Careful\" lines are things not to say.\n",
     "Thesis to land twice (slide 2 and the last slide): *The agent's channel is getting wider. The human's is getting narrower. Design what crosses the narrow one.*\n",
     "## At a glance\n", "| # | Slide | Chapter | Time | Presses |\n|---|---|---|---|---|"]
cum = 0
for n, r in enumerate(rows, 1):
    cum += secs(r['time']); o.append(f"| {n} | {r['title']} | {r['chapter'].split(' · ')[0]} | {r['time']} (at {cum//60}:{cum%60:02d}) | {r['steps']} |")
o.append('')
chap = None
def body(r):
    for p in r['paras']: o.append(f'> {p}\n' if p.lower().startswith('careful') else f'- {p}\n')
for n, r in enumerate(rows, 1):
    if r['chapter'] != chap: o.append(f"\n---\n\n## {r['chapter']}\n"); chap = r['chapter']
    o.append(f"### {n}. {r['title']}  ·  {r['time']}  ·  {r['steps']} press{'es' if r['steps'] != 1 else ''}\n"); body(r)
o.append('\n---\n\n## Backup slides (after the last slide, or **O** for the overview)\n')
for r in brows: o.append(f"### {r['title']}\n"); body(r)
o.append('\n---\n\n## If something breaks during the race\n')
o += ['- Lane 1 does not start or stops: press **L** on the race slide (click the slide background first if you typed in lane 3). It replays the 10:08 rehearsal with a "Recorded …, real speed" tag. Say it was recorded this morning.',
      '- The yes does not come by itself after 7 seconds: click "Yes, pay" in the phone frame on lane 1.',
      '- No test network: the server falls back to the local test ledger by itself and says so. Same flow, no transaction link.',
      '- Lost: **O** for the overview, click the slide. **B** blacks the screen.\n']
open(f'{root}/SPEAKER-GUIDE.md', 'w').write('\n'.join(o))
print(f'SPEAKER-GUIDE.md: {len(rows)} slides, {total//60}:{total%60:02d}')
