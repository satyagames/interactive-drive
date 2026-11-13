#!/usr/bin/env python3
"""Import the 2D PursuitArena site export into the 3D Pursuit Arena.

Usage (from the repo root; needs Python 3.10+, Pillow, beautifulsoup4, lxml,
openpyxl and poppler's pdftoppm on PATH):

    python3 tools/site-export/import_site_export.py --export "D:/Deloitte/CopiedData/site_export_package"
    python3 tools/site-export/import_site_export.py --export <path> --backup-only   # docs only, no runtime changes

What it writes:
  docs/content-backup/          Markdown backup of the whole 2D site + data/*.json + people.csv
  public/content/site/*.webp    optimised images used by station panels (lazy-loaded)
  public/content/docs/*.pdf     toolkit and newsletter PDFs linked from panels
  content/arena.seed.json       station copy, rosters, metrics, links and images

Privacy rules baked in:
  - bio PDFs are never copied; only role/function keywords are read from them
  - personal fields (birth dates, family, hometown, phone, LinkedIn) are never written anywhere
  - emails appear only in the private backup, never in the runtime seed
  - only high/medium-confidence team assignments are shown in the arena
"""
import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, OrderedDict, defaultdict
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from teams import CONFIRMED_TEAMS, LEADERS, TEAMS, TEAM_LABELS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
BACKUP = REPO / 'docs' / 'content-backup'
DATA = BACKUP / 'data'
PUB_IMG = REPO / 'public' / 'content' / 'site'
PUB_DOC = REPO / 'public' / 'content' / 'docs'
SEED = REPO / 'content' / 'arena.seed.json'

ROLES = ['Senior Vice President', 'AVP', 'Executive Manager', 'Deputy Manager', 'Assistant Manager',
         'Senior Analyst', 'Analyst', 'Manager']
ROLE_RANK = {r: i for i, r in enumerate(ROLES)}
TODAY = date.today().isoformat()

# Original site navigation (read from the export's rendered menu), with its route ids.
SITEMAP = [
    ('Home', '6q3m4', [('Pursuit Wins', 'm2hqk')]),
    ('Our team', 'rh4rr', [('Audit Managers', '3ppz8'), ('Audit Designers', '4h7rb'), ('Audit Researchers', 'tjlnk'),
                           ('Tax Managers', 'kq3gx'), ('Tax Designers', 'krfmx'),
                           ('Consulting Services Pursuit Designers', '9h45c'), ('PACE Managers', 'wjbxz'),
                           ('PACE Designers', 'jwr2z'), ('Pursuits Studio Designers', 'b8z5w'),
                           ('Israel Catalyst Team', '3m6s2')]),
    ('Innovation', '558w4', [('Upcoming events/activities', 'tz9h6'), ('The Intelligence Update', '9586p'),
                             ('Behind-the-scenes!', 'xgtzz'), ('Calling all Proposal Ninjas', 'zcszb')]),
    ('R&R', 'gzsgl', [('applauD', 'bfvv6'), ('Reward and Excellence', '2bp34'), ('BrightStar Awards', 'content/238266138'),
                      ('Nomination Form', '5rrlt')]),
    ('Our culture', '93n4m', [('Deloitte Chronicles', 'j2cm8'), ('Birthdays', 'wsrxm'), ("Insiders' Scoop", 'sz9r6'),
                              ('Service Anniversary', 'l92bd')]),
    ('L&D', 'q9lzj', [('What we did', 'cw2j2'), ("What's New", '5lxfc'), ('Metrics & Useful Links', 'bt724')]),
    ('Toolkit', 'bjcs8', [('Time Reporting Guidance', 'pgd29'), ('Proposal Writing Guide', 'b4bfg'),
                          ('Quick Links', 'tdtpt'), ('Site contact', 'wz6lc')]),
]

# Which site copy (text record uuid) belongs to which arena station.
COPY_MAP = OrderedDict([
    ('gate_how_to_drive', [243597594]),
    ('hq_org', [235082240, 235082241, 119951078, 243604288, 114853732, 243604294]),
    ('hq_leadership', [318598333]),
    ('innovation_1', [302592013, 300042701, 302251302]),
    ('innovation_2', [302251310]),
    ('innovation_3', [302251312]),
    ('innovation_4', [302374251]),
    ('rnr_1', [154946529, 243604293]),
    ('rnr_2', [155041877, 353626004]),
    ('rnr_3', [238266138, 155049975]),
    ('culture_1', [155059940]),
    ('culture_2', [155061245]),
    ('culture_3', [253951509]),
    ('culture_4', [304628115, 155058602, 155054879, 119637827]),
    ('lnd_1', [318598333, 358506040, 358505999, 358506000]),
    ('lnd_2', [300044856, 155116425, 245444374]),
    ('lnd_3', [155088071, 155072493]),
    ('toolkit_1', [155114862, 155113994]),
    ('toolkit_2', [195750823]),
    ('toolkit_3', [155117536]),
    ('toolkit_4', [243604310]),
])
LINK_MAP = {
    'innovation_1': [302592013],
    'rnr_1': [243604293],
    'lnd_2': [155116425],
    'lnd_3': [318612073],
    'toolkit_3': [155123386, 155123375, 155123407],
    'toolkit_4': [243604310],
}
METRICS = {
    'wins_fy26': {'label': 'Pursuit Wins, FY26 (site snapshot, Sep 2025)', 'uuids': [244895174, 244895176, 244895177]},
    'wins_fy25': {'label': 'Pursuit Wins, FY25 (site snapshot, Sep-Oct 2024)', 'uuids': [243604177, 243604178, 243604179]},
    'thank_it_forward': {'label': 'Thank It Forward stats, June 2023 - December 2024', 'uuids': [255090319, 255090320, 255090321]},
    'brightstar': {'label': 'BrightStar Awards stats, June 2023 - December 2024',
                   'uuids': [255091619, 255092910, 255092911, 255092912, 255094985, 255094987]},
    'learning': {'label': 'L&D metrics', 'uuids': [155088077, 155088080, 155088082]},
}
# Station images, by the asset's original filename (first match wins).
STATION_IMAGES = {
    'gate_how_to_drive': ['Percy-Banner'],
    'hq_org': ['Homepage 2@2x'],
    'hq_leadership': ['@leadership-visit'],
    'innovation_1': ['7_Innovation_upcoming_bg'],
    'innovation_2': ['7_Innovation_intelligence_bg'],
    'innovation_4': ['7_Innovation_ninja_bg'],
    'rnr_1': ['applauD-01'],
    'rnr_2': ['Reward and Excellence_1', '@SwagTags Recognition Event, April 2025', '@SwagTags Recognition'],
    'rnr_3': ['Brightstar_bg_1'],
    'culture_1': ['2025-04-Birthday-BG-02'],
    'culture_2': ['Service Aniversary_BG'],
    'culture_3': ['Dec-2024_Deloitte-Chronicles', 'Aug 2024_Deloitte Chronicles', 'July-2024_Deloitte-Chronicles'],
    'lnd_1': ['1_L&D_PEAK', '@leadership-visit'],
    'lnd_2': ['2_L&D_WhatsNew'],
    'lnd_3': ['3_L&D_Metrics'],
    'toolkit_1': ['6_Toolkit_Final Layout for the bg-01'],
    'toolkit_2': ['6_Toolkit_Final Layout for the bg-02'],
    'toolkit_3': ['6_Toolkit_Final Layout for the bg-05'],
    'toolkit_4': ['6_Toolkit_Final Layout for the bg-06'],
    'team': ['1_Our team_Final Layout for the bg-01'],
}
# Toolkit/newsletter PDFs bundled with the build (by original filename) -> station.
DOCS = {
    'toolkit_1': [('Time Reporting FY25', 'USI PCoE Time Reporting guide'),
                  ('G&P Pursuit Management FY26 Time and Expense Guide_Aug 2025', 'C,S&G Pursuit Management FY26 Time and Expense Guide'),
                  ('PY27 Bare minimum guidelines', 'FY27 Bare Minimum document'),
                  ('PCoE guidance_Sep 2026', 'USI PCoE Guidance, September 2026')],
    'toolkit_2': [('USI_Proposal_writing_style_guide_05262023', 'USI Proposal Writing Style Guide')],
    'lnd_2': [('CE Training', 'CE Baseline Guide')],
    'innovation_2': 'INTELLIGENCE_UPDATES',
}
TITLE_FIX = {
    'innovation_1': 'Upcoming events & activities',
    'innovation_2': 'The Intelligence Update',
    'innovation_3': 'Behind-the-scenes!',
    'innovation_4': 'Calling all Proposal Ninjas',
    'rnr_1': 'applauD',
    'rnr_3': 'BrightStar Awards',
    'culture_2': 'Service Anniversary',
    'culture_4': "Insiders' Scoop",
    'lnd_3': 'Metrics & Useful Links',
    'studio_designers': 'Pursuits Studio Designers',
    'consulting_designers': 'Consulting Services Pursuit Designers',
}
# Small copy clean-ups for text that was left half-edited on the 2D site.
COPY_FIXES = {
    'Meet the Pursuit dream team\nMeet the Pursuit Team". New subtext: "Success isn\'t built in silos — it\'s what happens when creative, driven minds work as one.':
        'Meet the Pursuit dream team.\nSuccess isn\'t built in silos — it\'s what happens when creative, driven minds work as one.',
    'Happy\npursuits\nExcellent teamwork': 'Happy pursuits!\nExcellent teamwork',
    'Reward the\ngood deeds\nRecognition': 'Reward the good deeds.\nRecognition',
    'Innovation Lab\nCalling all innovators on the deck!': 'Innovation Lab: calling all innovators on the deck!',
    'Deloitte\nChronicles\nNamrata Pathak\n': 'Deloitte Chronicles: latest episode, Namrata Pathak\n',
    'Menu of\nservices\nServices we provide across all industries and businesses':
        'Menu of services: Pursuit Management and Design (CoE), Pursuits Design Studio and Pursuits Research, serving Audit & Assurance, Tax, Advisory and Consulting.',
}
CTA_LINES = {'Read more', 'Click here', 'Visit CoinD', 'Quick Links', '○'}
KEEP_ORIGINAL_BODY = {'gate_how_to_drive'}
ORIGINAL_BODY = {}

TEAM_BODY = {
    'audit_managers': 'Pursuit managers for Audit & Assurance: end-to-end pursuit management, strategic value-add, compelling storytelling and writing, and orals guidance for US pursuits.',
    'audit_designers': 'Pursuit designers aligned to Audit & Assurance: professional end-to-end graphic design, creative conceptualization, motion and interactive design, art and illustration, and special print and package design.',
    'audit_researchers': 'The USI Pursuit Research Team: pre-sales market researchers providing "pursuit intelligence" and "RFP content" support to pursuit managers across regions. Pre-proposal: news and media analysis, industry landscape, competitor and SWOT analysis, cross-board analysis, track packs, ContactNet relationship reports. Proposal: RFP response search, analyst quotes, non-standard responses, bios, Qvidian and client-list validation. Post-proposal: executive biographic research and onboarding documents.',
    'tax_managers': 'Pursuit managers for Tax: end-to-end pursuit management, strategic value-add, compelling storytelling and writing, and orals guidance.',
    'tax_designers': 'Pursuit designers aligned to Tax: end-to-end graphic design, creative conceptualization, motion and interactive design, art and illustration.',
    'consulting_designers': 'Pursuit design services for Consulting: end-to-end graphic design, creative conceptualization, motion and interactive design, art and illustration.',
    'pace_managers': 'PACE: the agile, cross-functional pursuit team. Pursuit managers working across functions and segments (including ARA and ESG pursuits).',
    'pace_designers': 'Designers supporting PACE\'s agile, cross-functional pursuits, including motion graphics.',
    'studio_designers': 'Pursuits Design Studio: a production-support model with a follow-the-sun shift pattern that picks up where US pursuit teams leave off. Services: proposals, orals material, marketing collateral (print and digital), video and audio (storyboarding, motion graphics, character animation), interactive (microsites, interactive PDFs, forms) and desktop publishing (Word, PowerPoint, Keynote, HTML e-mails).',
    'catalyst_team': 'The Israel Catalyst Team. Team members are not identifiable in the 2D site export: please supply the roster.',
}


# ---------------------------------------------------------------- loading
def load_export(export):
    html = (export / 'index.html').read_text(encoding='utf-8')
    i = html.find('window.serverData = JSON.parse(') + len('window.serverData = JSON.parse(')
    j = html.find('");', i) + 1
    return json.loads(json.loads(html[i:j]))


def html_text(h):
    return BeautifulSoup(h or '', 'lxml').get_text('\n', strip=True)


def html_links(h):
    out = []
    for a in BeautifulSoup(h or '', 'lxml').find_all('a'):
        href = (a.get('href') or '').strip()
        label = ' '.join(a.get_text(' ', strip=True).split())
        if href and label:
            out.append((label, href))
    return out


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]


class Export:
    def __init__(self, path):
        self.path = path
        self.d = load_export(path)
        self.items = self.d['allContent']
        self.by_uuid = {a['uuid']: a for a in self.items}
        self.assets = {v['assetId']: v for v in self.d['assetsByIdent'].values()}
        self.imgdir = path / 'extracted_site_images'
        self.img_index = defaultdict(list)
        for f in self.imgdir.iterdir():
            m = re.match(r'photo-(\d+)-', f.name)
            if m:
                self.img_index[int(m.group(1))].append(f)
        md = (path / 'extracted_site_content.md').read_text(encoding='utf-8')
        self.doc_blocks = {}
        part = md[md.find('## Linked Document Text'):]
        for b in re.split(r'\n### ', part)[1:]:
            title = b.split('\n', 1)[0].strip()
            src = re.search(r'- Source file: `([^`]+)`', b)
            pages = re.search(r'- Pages: (\d+)', b)
            txt = re.search(r'````text\n(.*?)````', b, re.S)
            self.doc_blocks.setdefault(title, dict(src=src.group(1) if src else None,
                                                   pages=int(pages.group(1)) if pages else None,
                                                   text=txt.group(1) if txt else ''))

    def caption(self, uuid):
        a = self.by_uuid.get(uuid) or {}
        return a.get('tile_caption') or a.get('caption') or ''

    def text(self, uuid):
        return html_text(self.caption(uuid))

    def filename(self, a):
        asset = self.assets.get(a.get('asset_id')) or {}
        return asset.get('display_filename') or asset.get('name') or ''

    def image_file(self, asset_id):
        files = self.img_index.get(asset_id) or []
        return sorted(files, key=lambda f: (f.suffix not in ('.jpg', '.jpeg', '.png'), len(f.name)))[0] if files else None

    def find_asset(self, key):
        """'Name' matches an asset's original filename, '@Title' matches a tile title."""
        if key.startswith('@'):
            t = key[1:].lower()
            for a in self.items:
                if a.get('assetType') == 'photo' and (a.get('title') or '').strip().lower() == t:
                    f = self.image_file(a.get('asset_id'))
                    if f:
                        return f
            for aid, v in self.assets.items():
                if (v.get('display_filename') or '').lower() == t:
                    f = self.image_file(aid)
                    if f:
                        return f
            return None
        for aid, v in self.assets.items():
            if v.get('assetType') == 'photo' and (v.get('display_filename') or '').lower() == key.lower():
                f = self.image_file(aid)
                if f:
                    return f
        return None


# ---------------------------------------------------------------- analysis
def parse_people(ex):
    people = {}
    for a in ex.items:
        if a['contentType'] != 'text':
            continue
        cap = ex.caption(a['uuid'])
        lines = [l.strip() for l in html_text(cap).split('\n') if l.strip()]
        mails = [h for _, h in html_links(cap) if h.lower().startswith('mailto:')]
        mails += [h for h in re.findall(r'mailto:[^"\'\s>]+', cap)]
        if not mails or len(lines) > 8:
            continue
        role = next((l for l in lines if l in ROLES), None)
        if not role:
            continue
        name = lines[0]
        tags = [l for l in lines[lines.index(role) + 1:] if '@' not in l and 'deloitte.com' not in l]
        email = re.sub(r'^mailto:', '', mails[-1], flags=re.I).split('?')[0].strip().lower()
        if email.endswith('@deloitte.co'):
            email += 'm'
        key = email.split('@')[0]
        rec = dict(name=re.sub(r'\b(\w+) \1\b', r'\1', name), role=role, tags=tags, email=email, uuid=a['uuid'])
        if key in people and people[key]['uuid'] > rec['uuid']:
            people[key]['duplicates'] = people[key].get('duplicates', 1) + 1
            continue
        rec['duplicates'] = people.get(key, {}).get('duplicates', 0) + 1
        people[key] = rec
    out = []
    for key, p in people.items():
        team, conf, ev = TEAMS.get(key) or ('unassigned', 'low', 'No team signal in the export')
        p.update(key=key, team=team, team_label=TEAM_LABELS[team], confidence=conf, evidence=ev)
        out.append(p)
    out.sort(key=lambda p: (list(TEAM_LABELS).index(p['team']), ROLE_RANK.get(p['role'], 99), p['name']))
    return out


def parse_metrics(ex):
    out = {}
    for k, m in METRICS.items():
        rows = []
        for u in m['uuids']:
            parts = [l for l in ex.text(u).split('\n') if l.strip()]
            if not parts:
                continue
            if k == 'learning':  # "870 | learning hours | completed": the number leads
                value, parts = parts[0], parts[1:]
                label = ' '.join(parts)
                rows.append(dict(label=label[0].upper() + label[1:], value=value))
                continue
            value = parts[-1]
            label = ' '.join(p for p in parts[:-1] if p not in ('FY 26', 'FY 25', '(no of Awards)')).replace('No of ', '')
            label = re.sub(r'\s+', ' ', label).strip()
            rows.append(dict(label=label, value=value))
        out[k] = dict(title=m['label'], rows=rows)
    return out


def parse_events(ex):
    groups = OrderedDict()
    for a in ex.items:
        if a['contentType'] != 'asset' or a.get('assetType') != 'photo':
            continue
        title = (a.get('title') or '').strip()
        cap = ex.text(a['uuid'])
        if not title or not cap or title in ('Vineeth',):
            continue
        key = re.sub(r'\s+', ' ', title).strip()
        g = groups.setdefault(key, dict(title=key, captions=Counter(), photos=[]))
        g['captions'][cap] += 1
        f = ex.image_file(a.get('asset_id'))
        if f:
            g['photos'].append(f)
    events = []
    months = 'January|February|March|April|May|June|July|August|September|October|November|December'
    for g in groups.values():
        cap = g['captions'].most_common(1)[0][0]
        when = re.search(rf'({months})\s*,?\s*(\d{{4}})', g['title'] + ' ' + cap) or re.search(r'(\d{4})(?:-\d{2})?', g['title'] + ' ' + cap)
        place = re.search(r'@\s*([^|\n]+)', cap)
        if place:
            place = re.match(r'(.*?)[\s,.-]*(?:\b(?:%s)\b.*)?$' % months, place.group(1).strip())
        city = next((c for c in ('Hyderabad', 'Bengaluru', 'Gurugram', 'Gurgaon', 'Vikarabad') if c in cap or c in g['title']), None)
        events.append(dict(title=g['title'], caption=cap, when=when.group(0) if when else None,
                           place=place.group(1).strip() if place else None, city=city,
                           photos=len(g['photos']), files=[str(f.name) for f in g['photos']]))
    return events


def parse_documents(ex):
    out = []
    for title, b in ex.doc_blocks.items():
        kind = ('newsletter' if 'Intelligence Update' in title else 'chronicles' if 'Chronicles' in title else
                'insiders-scoop' if title.startswith('IS-') else 'behind-the-scenes' if title.startswith('IStory') else
                'service-menu' if title in ('Pursuit Management and Design (CoE)', 'Pursuits Design Studio', 'Pursuits Research') else
                'toolkit' if re.search(r'guide|Guidance|Bare minimum|Time Reporting|CE.?Training|Time and Expense', title, re.I) else
                'learning' if 'APMP' in title else 'survey' if 'Knowledge Ninja' in title else 'bio')
        first = next((l.strip() for l in b['text'].split('\n') if len(l.strip()) > 20 and not l.startswith('[Page')), '')
        out.append(dict(title=title, kind=kind, pages=b['pages'], src=b['src'], first_line=first if kind != 'bio' else ''))
    return out


def intelligence_updates(ex):
    issues = []
    for title, b in ex.doc_blocks.items():
        m = re.match(r'(\d{4})_(\d{2})_The Intelligence Update', title)
        if m and b['src'] and b['src'].endswith('.pdf'):
            issues.append(dict(year=int(m.group(1)), month=int(m.group(2)), title=title, src=b['src'], text=b['text']))
    uniq = {}
    for i in issues:
        uniq.setdefault((i['year'], i['month']), i)
    return [uniq[k] for k in sorted(uniq)]


def chronicles(ex):
    feats = []
    for aid, v in ex.assets.items():
        f = v.get('display_filename') or ''
        if re.search(r'(^|[_ -])DC([_ -]|png|$)', f) and 'BG' not in f:
            core = re.sub(r'^(\d{4}[-_](\d{2}|[A-Za-z]+)[-_]|\d+[ _])', '', f.strip())
            name = core[3:].split('_')[0] if core.startswith('DC_') else re.split(r'[-_ ]?DC', core)[0]
            name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name.replace('_', ' ')).strip()
            name = {'RJ': 'Ripunjay (RJ) Nandikonda', 'Dev': 'Devavrat', 'Prem': 'Premshankar'}.get(name, name)
            feats.append(dict(name=name, asset=f, added=v.get('createdAt')))
    seen, out = set(), []
    for x in sorted(feats, key=lambda x: x['asset']):
        if x['name'] not in seen:
            seen.add(x['name'])
            out.append(x)
    return out


def asset_timeline(ex):
    years = Counter()
    for v in ex.assets.values():
        y = re.search(r'(\d{4})$', v.get('createdAt') or '')
        if y:
            years[int(y.group(1))] += 1
    return dict(sorted(years.items()))


# ---------------------------------------------------------------- media
def to_webp(src, name, max_w=1280, q=74):
    PUB_IMG.mkdir(parents=True, exist_ok=True)
    dst = PUB_IMG / f'{name}.webp'
    if not dst.exists():
        im = Image.open(src)
        im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=q, method=6)
    return f'content/site/{dst.name}'


def pdf_page_webp(pdf, name):
    PUB_IMG.mkdir(parents=True, exist_ok=True)
    dst = PUB_IMG / f'{name}.webp'
    if not dst.exists():
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(['pdftoppm', '-r', '110', '-f', '1', '-l', '1', '-png', str(pdf), str(Path(tmpdir) / name)], check=True)
            to_webp(next(Path(tmpdir).glob(f'{name}*.png')), name, max_w=1100)
    return f'content/site/{dst.name}'


def copy_pdf(src, name):
    PUB_DOC.mkdir(parents=True, exist_ok=True)
    dst = PUB_DOC / f'{name}.pdf'
    if not dst.exists():
        shutil.copyfile(src, dst)
    return f'content/docs/{dst.name}'


# ---------------------------------------------------------------- markdown backup
def md_table(rows, cols):
    head = '| ' + ' | '.join(c for c, _ in cols) + ' |\n|' + '|'.join('---' for _ in cols) + '|\n'
    return head + ''.join('| ' + ' | '.join(str(fn(r)).replace('|', '/').replace('\n', ' ') for _, fn in cols) + ' |\n' for r in rows)


def write_backup(ex, people, metrics, events, documents, issues, chron, timeline, copy_deck, links):
    BACKUP.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    src = ex.path
    counts = Counter(a['contentType'] for a in ex.items)
    w = lambda name, text: (BACKUP / name).write_text(text, encoding='utf-8')

    w('00-README.md', f"""# PursuitArena 2D site: content backup

Backup of the **2D PursuitArena** community site (Zoomforth page "{ex.d.get('pageTitle')}", page id {ex.d.get('pageId')}),
generated by `tools/site-export/import_site_export.py` on {TODAY} from the export package at
`{src}`.

> **Internal: Deloitte USI Pursuits COE.** Contains colleague names, designations and work emails exactly as the
> 2D site showed them. Do not publish outside the firm. Personal details from bio PDFs (birth dates, family, hometown,
> phone numbers, LinkedIn) are deliberately **not** reproduced anywhere in this repo.

## What the export contains
| Item | Count |
|---|---:|
""" + ''.join(f'| {k} records | {v} |\n' for k, v in counts.most_common()) + f"""| Assets (photos, PDFs, PPT, video, forms) | {len(ex.assets)} |
| People cards (unique, by email) | {len(people)} |
| Event/photo albums | {len(events)} |
| Documents with extractable text | {len(documents)} |
| Asset upload years | {', '.join(f'{y}: {n}' for y, n in timeline.items())} |

## Files
| File | What it holds |
|---|---|
| [01-site-map.md](01-site-map.md) | The 2D site's information architecture and how it maps onto the 3D arena |
| [02-people-directory.md](02-people-directory.md) | Every colleague card: name, designation, tags, team (inferred) and confidence |
| [03-metrics.md](03-metrics.md) | Pursuit wins, R&R and L&D numbers as the site showed them |
| [04-events-gallery.md](04-events-gallery.md) | Every photo album: event, date, place and photo count |
| [05-publications.md](05-publications.md) | The Intelligence Update, Deloitte Chronicles, Insiders' Scoop and Behind-the-scenes tips |
| [06-toolkit-and-links.md](06-toolkit-and-links.md) | Guides, policies and every link on the site |
| [07-copy-deck.md](07-copy-deck.md) | All page copy, grouped by the arena station it now feeds |
| [08-brand-and-mascots.md](08-brand-and-mascots.md) | Percy and the blob family, banners and visual language |
| [09-decade-archive.md](09-decade-archive.md) | What the archive says about the ten years (for the Decade Drive) |
| [10-3d-integration-plan.md](10-3d-integration-plan.md) | How the content lives in the 3D arena, now and next |
| `data/*.json`, `data/people.csv` | Machine-readable versions of all of the above |
| `visual-index/*.jpg` | Contact sheets of the key banners |

## Re-running
Edit `tools/site-export/teams.py` (team assignments) or the maps at the top of the import script, then:
```
python3 tools/site-export/import_site_export.py --export "<path to site_export_package>"
npm run content:check && npm run build
```
""")

    sm = '# 01 — Site map (2D) and its 3D home\n\nThe 2D site\'s top navigation, read from the rendered menu in the export. Route ids are the original `#/subpage/<id>/section/<id>` anchors.\n\n'
    arena = {'Home': 'HQ: Command Tower', 'Our team': 'Inner ring: six team territories', 'Innovation': 'Innovation Lab (0°)',
             'R&R': 'R&R Arena (60°)', 'Our culture': 'Culture Commons (300°)', 'L&D': 'L&D Campus (120°)', 'Toolkit': 'Toolkit Depot (240°)'}
    for top, rid, subs in SITEMAP:
        sm += f'## {top}  `{rid}` → {arena[top]}\n' + ''.join(f'- {s}  `{sid}`\n' for s, sid in subs) + '\n'
    sm += ("\n**Note.** The export holds every content record but not which section each record sat in (the platform loaded "
           "subpages at runtime). Section membership in this backup is reconstructed from record ids, copy and file names.\n")
    w('01-site-map.md', sm)

    by_team = defaultdict(list)
    for p in people:
        by_team[p['team_label']].append(p)
    pd = ('# 02 — People directory\n\nFrom the 2D site\'s colleague cards (name, designation, tags, email). **Team is inferred** '
          '(see `tools/site-export/teams.py` for the evidence rules); please confirm in `data/people.csv` and re-run the import.\n\n'
          f'{len(people)} unique colleagues · confidence: ' +
          ', '.join(f'{k} {v}' for k, v in Counter(p["confidence"] for p in people).items()) + '\n\n')
    for team, ps in by_team.items():
        pd += f'## {team} ({len(ps)})\n\n' + md_table(ps, [('Name', lambda p: p['name']), ('Designation', lambda p: p['role']),
                                                          ('Tags', lambda p: ', '.join(p['tags'])), ('Email', lambda p: p['email']),
                                                          ('Confidence', lambda p: p['confidence']), ('Evidence', lambda p: p['evidence'])]) + '\n'
    pd += ('## Also on the site\n- US counterparts with CoP profiles (2018–2020): Mary Bowering, Rich Bowering, Chris Purcell (Channel leader), Sue Burgett.\n'
           '- Knowledge Ninja skills survey (Aug 2020): 94 rows of skills and hobbies. Aggregates only in `data/skills-survey-summary.json`.\n')
    w('02-people-directory.md', pd)
    with (DATA / 'people.csv').open('w', newline='', encoding='utf-8') as fh:
        cw = csv.writer(fh)
        cw.writerow(['name', 'designation', 'tags', 'email', 'team_inferred', 'confidence', 'evidence', 'team_confirmed', 'show_in_arena_consent'])
        for p in people:
            cw.writerow([p['name'], p['role'], '; '.join(p['tags']), p['email'], p['team_label'], p['confidence'], p['evidence'], '', ''])

    mt = '# 03 — Metrics\n\nNumbers exactly as the 2D site displayed them (snapshots, not decade totals).\n\n'
    for m in metrics.values():
        mt += f'## {m["title"]}\n\n' + md_table(m['rows'], [('Measure', lambda r: r['label']), ('Value', lambda r: r['value'])]) + '\n'
    w('03-metrics.md', mt)

    ev = '# 04 — Events and photo albums\n\n' + md_table(events, [('Album', lambda e: e['title']), ('When', lambda e: e['when'] or ''),
                                                                 ('Where', lambda e: e['place'] or e['city'] or ''), ('Photos', lambda e: e['photos']),
                                                                 ('Caption', lambda e: e['caption'][:140])])
    ev += '\nPhoto files are in the export under `extracted_site_images/`; the list per album is in `data/events.json`.\n'
    w('04-events-gallery.md', ev)

    mon = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    pub = '# 05 — Publications\n\n## The Intelligence Update (monthly Gen AI newsletter, launched June 2024)\n\n'
    for i in issues:
        lead = next((l.strip() for l in i['text'].split('\n')[2:12] if len(l.strip()) > 40), '')
        pub += f'- **{mon[i["month"]]} {i["year"]}**: {lead[:160]}\n'
    pub += '\n## Deloitte Chronicles (celebrating a "Pursuit Champ" each episode)\n\n' + ''.join(
        f'- {c["name"]} (`{c["asset"]}`, added {c["added"]})\n' for c in chron)
    scoops = sorted({(v.get('display_filename') or '') for v in ex.assets.values()
                     if re.search(r'(^|[_ -])IS([_ -]|$)|IS-|Insiders', v.get('display_filename') or '') and 'BG' not in (v.get('display_filename') or '')})
    pub += "\n## Insiders' Scoop (\"Connecting Colleagues, Crafting Stories!\")\n\nIssues present as images: " + ', '.join(scoops) + '\n'
    pub += '\n## Behind-the-scenes! (proposal quirks, fixed)\n\n'
    for u, who in ((316330506, 'Aastha'), (316330508, 'Praful'), (316330178, 'Sateesh'), (316328986, 'Simon and Prasad'), (316330180, 'Anindya')):
        pub += f'- {ex.text(u).split(chr(10))[0]}: by {who}\n'
    pub += '\n## Other\n- The Bravo Bulletin: "From Recognition to Inspiration: Success Stories that Shine Bright".\n- Did you know?: colleague fun-fact cards (2023), backed up in the copy deck only.\n'
    w('05-publications.md', pub)

    tk = '# 06 — Toolkit and links\n\n## Documents\n\n' + md_table([d for d in documents if d['kind'] in ('toolkit', 'service-menu', 'learning')],
                                                                   [('Title', lambda d: d['title']), ('Kind', lambda d: d['kind']), ('Pages', lambda d: d['pages'] or ''),
                                                                    ('First line', lambda d: d['first_line'][:110])])
    tk += '\n## Links\n\n'
    for group, ls in links.items():
        tk += f'### {group}\n' + ''.join(f'- [{l}]({u})\n' for l, u in ls) + '\n'
    w('06-toolkit-and-links.md', tk)

    cd = '# 07 — Copy deck\n\nAll page copy from the 2D site. First by the arena station that now uses it, then everything else.\n\n'
    used = set()
    for st, uuids in COPY_MAP.items():
        cd += f'## {st}\n\n' + ''.join(f'> {ex.text(u)}\n\n'.replace('\n', '\n> ').rstrip('> ') + '\n' for u in uuids)
        used.update(uuids)
    cd += '## Unmapped copy\n\n'
    for c in copy_deck:
        if c['uuid'] not in used:
            cd += f'- `{c["uuid"]}`: ' + c['text'].replace('\n', ' / ')[:300] + '\n'
    w('07-copy-deck.md', cd)

    w('08-brand-and-mascots.md', """# 08 — Brand and mascots (2D PursuitArena)

## Percy and the blob family
- **Percy** introduces himself on the home page: *"Hello, Percy here, your PursuitArena mascot! Welcome to our Pursuit community where we communicate, collaborate, and celebrate every step of the way."*
- The site's illustration system is a **family of soft, rounded blob characters** with hand-drawn doodle faces (white Percy plus red, teal, orange, purple, blue, green, pink and beige friends). They hold props that tell you the section: trophies and medals (R&R), pencils and notebooks (L&D, Toolkit), laptops and charts (stats), Santa hats and scarves (holiday banners).
- Section banners sit on a **rainbow gradient**: coral pink → violet → Deloitte-ish green → yellow. Inner pages use warm off-white with faint line-art icons.
- Recurring formats: monthly banners (Home, Birthdays, Service Anniversary), "Did you know?" fun-fact cards, Deloitte Chronicles newspaper layout, applauD wordmark with a green dot.

## Files to reuse (export `extracted_site_images/`)
Percy banners `photo-638582/585/590/591-percy-banner*`, section banners `photo-5190xx-*-final-layout-*`, R&R stats `photo-6278xx`, applauD `photo-627291/627296`, holiday set `photo-6018xx`, BrightStar/Rewards backgrounds `photo-6056xx`.
Contact sheets: `visual-index/key1.jpg`, `visual-index/key2.jpg`.

## Rules for the 3D arena
- Percy and the blobs are the community's **own** characters, so they can become 3D guides. Model them as original low-poly blobs from these references; never use another brand's mascot.
- Keep Deloitte Green as the accent. The rainbow gradient belongs to the 2D community brand: use it for Percy-family moments (badges, confetti, banners), not for the whole world.
""")

    w('09-decade-archive.md', '# 09 — Decade archive\n\nWhen content was uploaded to the 2D site (asset creation dates). This is evidence for the Decade Drive, **not** a confirmed COE history.\n\n'
      + md_table([dict(y=y, n=n) for y, n in timeline.items()], [('Year', lambda r: r['y']), ('Assets added', lambda r: r['n'])]) + """
## Draft milestones from the archive (confirm before using as Year 1–10)
| Calendar year | What the archive shows |
|---|---|
| 2018 | First "CoP Profile, FY19" bios: Vineet K. Arora, P. Prasad Nandula, Pujitha Annamraju, Ripunjay Nandikonda, Tripti Gupta, Sateeshsai Modukuru; US counterparts' profiles |
| 2019 | More CoP profiles (Vaseem Kader, Ahmed Muzammil) |
| 2020 | Knowledge Ninja skills survey (Aug 2020); US CoP profiles |
| 2021 | Pursuit Design Studio profiles (Pramod Medichalam); A&A designers join |
| 2022 | The 2D PursuitArena site is designed (section layouts Nov 2022); Tax and Advisory designer profiles |
| 2023 | Service menus for Pursuit Management & Design, Design Studio and Research (Jan); Proposal Writing Style Guide (May); BrightStar and Thank It Forward recognition tracking starts (June) |
| 2024 | Deloitte Chronicles (Mar), The Intelligence Update launches (June), Insiders' Scoop (Jul); FY25 snapshot: 275 pursuits, $310M TCV, $35M win revenue |
| 2025 | SwagTags (Apr), DesignVerse 2025 and Art Gallery (Jul), Starry Night (Jul), leadership visit workshops (Nov); FY26 snapshot: 240 pursuits, $260M TCV, $47M win revenue |
| 2026 | PY27 Bare Minimum guidelines and PCoE Guidance (Sep 2026); new colleagues added (Aug 2026) |

Years 1–2 (2016–2017) have no archive evidence: they need the team's input.
""")

    json.dump(people, open(DATA / 'people.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(metrics, open(DATA / 'metrics.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(events, open(DATA / 'events.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(documents, open(DATA / 'documents.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump([dict(year=i['year'], month=i['month'], title=i['title'], src=i['src']) for i in issues], open(DATA / 'intelligence-update.json', 'w'), indent=1)
    json.dump(chron, open(DATA / 'deloitte-chronicles.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump({k: [dict(label=l, url=u) for l, u in v] for k, v in links.items()}, open(DATA / 'links.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(copy_deck, open(DATA / 'copy-deck.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(dict(sitemap=SITEMAP, asset_years=timeline), open(DATA / 'site-structure.json', 'w'), indent=1)


def skills_summary(ex):
    try:
        import openpyxl
    except ImportError:
        return None
    f = next((ex.path / 'assets' / 'other').glob('*/document_1.xlsx'), None)
    if not f:
        return None
    ws = openpyxl.load_workbook(f, read_only=True)['Sheet1']
    teams, skills = Counter(), Counter()
    seen = set()
    for row in ws.iter_rows(values_only=True):
        if row and row[1] and '@' in str(row[1]):
            if row[1] not in seen:
                teams[str(row[2])] += 1
                seen.add(row[1])
            skills[str(row[3])] += 1
    return dict(source='Knowledge Ninja Aug2020 (xlsx)', people=len(seen), by_team=dict(teams), by_skill_category=dict(skills))


# ---------------------------------------------------------------- seed merge
def merge_seed(ex, people, metrics, events, issues, links):
    seed = json.loads(SEED.read_text(encoding='utf-8'))
    stations = {}
    for group in ('territories', 'pillars'):
        for d in seed[group]:
            for s in d['stations']:
                stations[s['id']] = s
    for s in seed['hq']['stations'] + seed['rfpGate']['stations']:
        stations[s['id']] = s

    def body_for(st):
        parts = []
        for u in COPY_MAP.get(st, []):
            t = ex.text(u)
            for old, new in COPY_FIXES.items():
                t = t.replace(old, new)
            t = '\n'.join(l for l in t.split('\n') if l.strip() not in CTA_LINES)
            t = re.sub(r'\n(?=[a-z,.;:!?)’\'])|(?<=[\w,’\'(])\n(?=[\w(‘“"])', ' ', t)
            parts.append(t.strip())
        return '\n\n'.join(p for p in parts if p)

    def metric_lines(k):
        return '\n'.join(f'{r["label"]}: {r["value"]}' for r in metrics[k]['rows'])

    def imgs(keys, prefix):
        out = []
        for k in keys:
            f = ex.find_asset(k)
            if f:
                out.append(to_webp(f, f'{prefix}-{slug(k.lstrip("@"))}'))
        return out

    def site_links(uuids):
        out = []
        for u in uuids:
            for label, href in html_links(ex.caption(u)):
                href = href.strip()
                if re.match(r'^(https://|mailto:)', href, re.I) and len(label) > 1:
                    out.append(dict(label=label[:80], url=href))
        uniq = OrderedDict((l['url'] + l['label'], l) for l in out)
        return list(uniq.values())

    # --- stations with lifted copy
    for st in COPY_MAP:
        if st not in stations:
            continue
        s = stations[st]
        body = body_for(st)
        if st == 'hq_org':
            body += '\n\n' + metrics['wins_fy26']['title'] + '\n' + metric_lines('wins_fy26') + '\n\n' + metrics['wins_fy25']['title'] + '\n' + metric_lines('wins_fy25')
        if st == 'rnr_1':
            body += '\n\n' + metrics['thank_it_forward']['title'] + '\n' + metric_lines('thank_it_forward')
        if st == 'rnr_3':
            body += '\n\n' + metrics['brightstar']['title'] + '\n' + metric_lines('brightstar')
        if st == 'lnd_3':
            body += '\n\n' + metric_lines('learning')
        if st == 'innovation_3':
            body += '\n\nLatest tips:\n' + '\n'.join(f'• {ex.text(u).split(chr(10))[0]}: {who}' for u, who in (
                (316330506, 'Aastha'), (316330508, 'Praful'), (316330178, 'Sateesh'), (316328986, 'Simon and Prasad'), (316330180, 'Anindya')))
        if st == 'innovation_2':
            mon = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
            body += f'\n\n{len(issues)} editions in the archive, {mon[issues[0]["month"]]} {issues[0]["year"]} to {mon[issues[-1]["month"]]} {issues[-1]["year"]}.'
        if st == 'culture_3':
            body += '\n\nChampions featured so far include: ' + ', '.join(sorted({c['name'] for c in chronicles(ex) if len(c['name']) > 2}))[:600] + '.'
        if st == 'culture_4':
            body += '\n\nCreating memories: ' + '; '.join(f'{e["title"]}' for e in events[:40]) + '.'
        if st in KEEP_ORIGINAL_BODY:
            # Keep the arena's own text (e.g. the driving controls) and put the site copy above it, once.
            original = ORIGINAL_BODY.setdefault(st, s['body'].split('\n\n')[-1])
            body = f'{body}\n\n{original}' if body else original
            s['body'] = body
            continue
        if st == 'toolkit_3' and not body:
            body = 'Find it fast: the tools, function sites, communities of practice and mailboxes the Pursuits community uses every day.'
        if body:
            s['body'] = body
        if st in TITLE_FIX:
            s['title'] = TITLE_FIX[st]
        lk = site_links(LINK_MAP.get(st, []))
        if lk:
            s['links'] = lk
        s['status'] = 'final' if st not in ('culture_1', 'culture_2') else s.get('status', 'placeholder')

    # --- images
    for st, keys in STATION_IMAGES.items():
        if st in stations:
            im = imgs(keys, st.replace('_', '-'))
            if im:
                stations[st]['image'] = im[0]
                if len(im) > 1:
                    stations[st]['images'] = im
    # Behind-the-scenes tips as page images
    tips = []
    for t in ('IStory1', 'IStory2', 'IStory3', 'IStory4', 'IStory5'):
        b = ex.doc_blocks.get(t)
        if b and b['src'] and (ex.path / b['src']).exists():
            tips.append(pdf_page_webp(ex.path / b['src'], f'innovation-3-{t.lower()}'))
    if tips and 'innovation_3' in stations:
        stations['innovation_3']['image'] = tips[0]
        stations['innovation_3']['images'] = tips
    # Insiders' Scoop: latest covers + one photo per event album (12 newest)
    covers = imgs(['IS_Oct_25', 'IS_FY26_June'], 'culture-4')
    album = []
    for e in events[:12]:
        if e['files']:
            album.append(to_webp(ex.imgdir / e['files'][0], f'culture-4-{slug(e["title"])}', max_w=1024))
    if 'culture_4' in stations and (covers or album):
        stations['culture_4']['image'] = (covers + album)[0]
        stations['culture_4']['images'] = covers + album

    # --- documents
    for st, docs in DOCS.items():
        if st not in stations:
            continue
        add = []
        if docs == 'INTELLIGENCE_UPDATES':
            mon = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            for i in reversed(issues):
                add.append(dict(label=f'The Intelligence Update, {mon[i["month"]]} {i["year"]} (PDF)',
                                url=copy_pdf(ex.path / i['src'], f'intelligence-update-{i["year"]}-{i["month"]:02d}')))
        else:
            for title, label in docs:
                b = ex.doc_blocks.get(title)
                if b and b['src'] and (ex.path / b['src']).exists():
                    add.append(dict(label=f'{label} (PDF)', url=copy_pdf(ex.path / b['src'], slug(title))))
        stations[st]['links'] = add + [l for l in stations[st].get('links', []) if l not in add]

    # --- rosters
    shown = people  # everyone is shown; low-confidence placements say so
    def role_line(p):
        if p['confidence'] == 'low':
            return ' · '.join([p['role']] + [t for t in p['tags'] if t not in ('USI Pursuits COE Lead',)][:2] + ['team to confirm'])
        return ' · '.join([p['role']] + [t for t in p['tags'] if t not in ('USI Pursuits COE Lead',)][:2])
    for team in TEAM_LABELS:
        if team in stations:
            ps = [p for p in shown if p['team'] == team]
            s = stations[team]
            s['title'] = TITLE_FIX.get(team, s['title'])
            confirmed = team in CONFIRMED_TEAMS
            s['body'] = TEAM_BODY.get(team, s['body']) + ('' if team == 'catalyst_team' or confirmed else
                        '\n\nTeam membership is reconstructed from the 2D site and is awaiting confirmation by the Pursuits team.')
            if ps:
                s['roles'] = [dict(name=p['name'], role=role_line(p)) for p in ps]
            im = imgs(STATION_IMAGES['team'], 'team')
            if im:
                s['image'] = im[0]
            s['status'] = 'final' if confirmed else 'placeholder'
    if 'hq_leadership' in stations:
        bykey = {p['key']: p for p in people}
        leaders = [bykey[k] for k in LEADERS if k in bykey]
        stations['hq_leadership']['roles'] = [dict(name=p['name'], role=role_line(p)) for p in leaders]
        stations['hq_leadership']['title'] = 'Leadership'
    if 'innovation_4' in stations:
        stations['innovation_4']['roles'] = [dict(name=n, role='Innovate to Evolve team') for n in
                                             ('Aastha Boora', 'Vinnu Priya', 'Deepak Pandey', 'Ben', 'Sephin Alexander', 'Bharti')]
        stations['innovation_4']['links'] = [dict(label='Contact the Innovate to Evolve team', url='mailto:aboora@deloitte.com')]
    leader = next((p for p in people if p['key'] == 'karora'), None)
    if leader:
        seed['hq']['leader'].update(name=leader['name'], title=leader['role'], role='USI Pursuits COE Lead')

    SEED.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return seed


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--export', required=True)
    ap.add_argument('--backup-only', action='store_true')
    args = ap.parse_args()
    ex = Export(Path(args.export))
    people = parse_people(ex)
    metrics = parse_metrics(ex)
    events = parse_events(ex)
    documents = parse_documents(ex)
    issues = intelligence_updates(ex)
    chron = chronicles(ex)
    timeline = asset_timeline(ex)
    copy_deck = []
    person_uuids = {p['uuid'] for p in people}
    for a in ex.items:
        if a['contentType'] in ('text', 'overlay') and a['uuid'] not in person_uuids:
            t = ex.text(a['uuid'])
            if t and not re.fullmatch(r'[A-Z][a-z]+ \d{4}', t) and 'deloitte.com' not in t:
                copy_deck.append(dict(uuid=a['uuid'], text=t))
    links = OrderedDict()
    for group, uuids in (('Find it fast', [155123386]), ('Function', [155123375]), ('Others', [155123407]),
                         ('L&D useful links', [318612073]), ('Recognition', [243604293]), ('Innovation', [302592013, 155116425])):
        links[group] = [(l, u) for x in uuids for l, u in html_links(ex.caption(x)) if not u.startswith('#')]
    write_backup(ex, people, metrics, events, documents, issues, chron, timeline, copy_deck, links)
    ss = skills_summary(ex)
    if ss:
        json.dump(ss, open(DATA / 'skills-survey-summary.json', 'w'), indent=1)
    print(f'backup: {len(people)} people, {len(events)} albums, {len(documents)} docs, {len(issues)} newsletter issues')
    if not args.backup_only:
        merge_seed(ex, people, metrics, events, issues, links)
        size = lambda d: sum(f.stat().st_size for f in d.glob('*') if f.is_file()) / 1e6 if d.exists() else 0
        print(f'runtime: images {size(PUB_IMG):.2f} MB, docs {size(PUB_DOC):.2f} MB (both lazy, not in first load)')


if __name__ == '__main__':
    main()
