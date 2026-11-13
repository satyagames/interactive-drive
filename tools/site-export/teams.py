"""Team assignments for the People of Pursuits roster (v2, 2026-11-13).

The 2D site export holds every person card but not the Our team page's section layout
(the platform fetched subpages at runtime). v2 reconstructs it from four signals:

  1. Section positions + creation batches. Every Zoomforth section numbers its tiles
     0..N; the cards created in one go with a team heading (or straight after it) and
     filling that section's free positions belong to that team. Strongest signal.
     e.g. the complete 45-tile section added in Aug 2026 repeats the A&A designers, so it
     is the current Audit Designers grid; Maha Waseem Jan and Vineeth Kumar Yadav were
     created right after the Israel Catalyst heading.
  2. "CoP Profile | A&A / Tax / Advisory / Deloitte Private" + role in the bio PDF.
  3. Knowledge Ninja survey (2020): "Pursuit Designer - CoE" = function-aligned designer,
     "Pursuit Designer - Studio" = Pursuits Design Studio.
  4. Tags on the card (Audit, Tax, Consulting, Shift 1/2, ESG, Deloitte Private...).

confidence: high = signals agree; medium = one strong signal; low = weak hint only.
Everyone is shown in the arena; low-confidence placements carry "to confirm".
Re-run tools/site-export/import_site_export.py after editing.
"""

# Add a team id once the Pursuits team has confirmed its roster: its station drops the
# "awaiting confirmation" note and is marked final in the arena.
CONFIRMED_TEAMS = set()

# Shown on the HQ Leadership station (in this order). They also appear in their team.
LEADERS = ['karora', 'rajamishra', 'rnandikonda', 'rraog', 'sandemishra']

TEAMS = {
    'karora': ('leadership', 'high', 'Card: SVP, USI Pursuits COE Lead; Audit Pursuit Manager for USI Strategic segment'),

    # Audit Managers: cards created with the Audit managers' bios (2021-22 batch)
    'rajamishra': ('audit_managers', 'high', 'Card: AVP, USI Strategic segment; same batch as the Audit managers'),
    'rraog': ('audit_managers', 'high', 'Bio: AA Pursuit Manager; Audit managers batch'),
    'sandemishra': ('audit_managers', 'high', 'Bio: Pursuit Manager; Audit managers batch'),
    'sksuresh': ('audit_managers', 'high', 'Card tag Audit; bio: Pursuit Manager; Audit managers batch'),
    'vinpriya': ('audit_managers', 'high', 'Card tag Audit; bio: AA Manager; Audit managers batch'),
    'mchatta': ('audit_managers', 'high', 'Card tag Audit; bio: Pursuit Manager - Audits'),
    'nfarooque': ('audit_managers', 'high', 'Card: Manager, Audit; Audit managers batch'),
    'deeppandey': ('audit_managers', 'high', 'Card: Deputy Manager, Audit; Audit managers batch'),
    'avmanu': ('audit_managers', 'high', 'Card tag Audit; bio: AA Editor; Audit managers batch'),
    'shanksen': ('audit_managers', 'medium', 'Card tag Deployment; Audit managers batch'),
    'predeb': ('audit_managers', 'medium', 'Bio: Deloitte Private Pursuit Manager; Audit managers batch'),
    'amuzammil': ('audit_managers', 'medium', 'Bio: Deloitte Private Pursuit Manager; Audit managers batch'),
    'susyanamadala': ('audit_managers', 'medium', 'Bio: Assurance - First Draft Proposal; own Aug 2026 row'),
    'ksharma65': ('audit_managers', 'low', 'Same Aug 2026 row as Sushma Yanamadala'),
    'dhahuja': ('audit_managers', 'low', 'Same Aug 2026 row as Sushma Yanamadala'),

    # Audit Designers: 2022 grid + the complete 45-tile grid rebuilt in Aug 2026
    'smodukuru': ('audit_designers', 'high', 'Bio: CoP A&A visual designer; Audit designers batch'),
    'tripgupta': ('audit_designers', 'high', 'Bio: CoP A&A graphic; Audit designers batch'),
    'trungta': ('audit_designers', 'high', 'Bio: Audit Design CoE; in both Audit designer grids'),
    'akgadepalli': ('audit_designers', 'high', 'Bio: AA Designer; in both Audit designer grids'),
    'kasjoshi': ('audit_designers', 'high', 'Bio: AA Designer; Audit designers batch'),
    'ssravyasudha': ('audit_designers', 'high', 'Bio: AA Designer; in both Audit designer grids'),
    'niterana': ('audit_designers', 'high', 'Bio: A&A designer; in both Audit designer grids'),
    'moacharya': ('audit_designers', 'high', 'In both Audit designer grids'),
    'ssawji': ('audit_designers', 'high', 'Bio: CoP A&A; in both Audit designer grids'),
    'kp3': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'upachode': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'sumshrivastava': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'itimishra': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'yashaswsingh': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'rsahare': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'sbanerjee': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'tanipuri': ('audit_designers', 'medium', 'Card tag Audit; 2026 Audit designers grid'),
    'apsuman': ('audit_designers', 'medium', 'Card tag XFSS; 2026 Audit designers grid'),
    'harschopra': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'sharana': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'chaybanerjee': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'klalit': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'mraqeeb': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'ppeddagani': ('audit_designers', 'medium', '2026 Audit designers grid'),
    'shlmathur': ('audit_designers', 'medium', 'Bio: CoP A&A'),
    'purtiwari': ('audit_designers', 'low', 'Bio: CoP A&A (created with the Tax designers: confirm)'),

    # Audit Researchers
    'kritisrivastava9': ('audit_researchers', 'high', 'Bio: AA Pursuit Researcher'),
    'rashmpandey': ('audit_researchers', 'high', 'Testimonial: pursuit researcher'),
    'rsrivastava14': ('audit_researchers', 'medium', 'Bio: business development and market research'),
    'nidhivsharma': ('audit_researchers', 'medium', 'Added with Ritik Srivastava and Mithilesh Kumar (Oct 2025)'),
    'mithkumar': ('audit_researchers', 'medium', 'Bio: data visualization and insights; added with the researchers'),
    'plole': ('audit_researchers', 'low', 'Resume: Strategic Relationships, CoRe Knowledge Services'),

    # Tax Managers: the Tax managers section (heading + cards in one batch)
    'rnandikonda': ('tax_managers', 'high', 'Card: AVP; in the Tax managers section batch'),
    'pnandula': ('tax_managers', 'high', 'Bio: CoP Tax, Pursuit manager; Tax managers batch'),
    'bhgrover': ('tax_managers', 'high', 'Bio: Pursuit Manager; Tax managers batch'),
    'karansingh7': ('tax_managers', 'high', 'Bio: Tax Pursuit Manager; Tax managers batch'),
    'ayagupta': ('tax_managers', 'high', 'Bio: Tax Pursuit Manager; Tax managers batch'),
    'soumrana': ('tax_managers', 'high', 'Tax managers batch'),
    'vasonti': ('tax_managers', 'low', 'Bio: Proposal and Bid Manager'),

    # Tax Designers
    'aboora': ('tax_designers', 'high', 'Bio: Manager, Pursuits CoE - Tax Design; Tax designers batch'),
    'aninchakrabarti': ('tax_designers', 'high', 'Bio: Tax Designer; Tax designers batch'),
    'kummkumar': ('tax_designers', 'high', 'Bio: Tax Designer; Tax designers batch'),
    'dmatkari': ('tax_designers', 'high', 'Bio: CoP Tax; Tax designers batch'),
    'psambaturu': ('tax_designers', 'high', 'Tax designers batch'),
    'divymenon': ('tax_designers', 'high', 'Bio: CoE - Tax Design'),
    'padtejaswini': ('tax_designers', 'high', 'Bio: Tax Pursuits COE Designer'),
    'chchepuri': ('tax_designers', 'high', 'Card tag Tax; bio: Pursuits CoE - Tax'),
    'vamkumar': ('tax_designers', 'high', 'Card tag Tax; bio: Graphic Designer'),
    'jmasulu': ('tax_designers', 'high', 'Card tag Tax'),
    'cjohnpal': ('tax_designers', 'high', 'Bio: Graphic Designer, Tax Pursuit USI'),
    'akartheek': ('tax_designers', 'high', 'Asset: NEW HIRE_TAX_Designer'),
    'richhabra': ('tax_designers', 'medium', 'Created in the same row as Chandana Chepuri'),

    # Consulting Services Pursuit Designers: Advisory/Consulting CoP designers (survey: CoE)
    'ricsaxena': ('consulting_designers', 'high', 'Bio: CoP Advisory; survey: Pursuit Designer - CoE; card: Shift 2 Lead'),
    'nanrathi': ('consulting_designers', 'high', 'Bio: Advisory DESIGNER; card: Shift 2'),
    'mdharod': ('consulting_designers', 'high', 'Bio: CoP Advisory; created with Richa Saxena; card: Shift 2'),
    'vkader': ('consulting_designers', 'high', 'Bio: CoP Advisory, Consulting; created with Richa Saxena; card: Shift 2'),
    'cchandramsetti': ('consulting_designers', 'high', 'Bio: CoP Consulting; card: Shift 1 Lead'),
    'amondal': ('consulting_designers', 'medium', 'Card tag Consulting'),
    'subpal': ('consulting_designers', 'medium', 'Created in the row with Chandrasekhar and Nandini; card: Shift 1'),
    'mohammadahussain': ('consulting_designers', 'medium', 'Created in the row with Chandrasekhar and Nandini; card: Shift 2'),
    'uakkinapally': ('consulting_designers', 'medium', 'Fills the free slot of that row; card: Shift 1'),

    # Pursuits Studio Designers: the follow-the-sun production studio (survey: Studio)
    'pmedichalam': ('studio_designers', 'high', 'Card: USI Emerging Media Lead; bio: leads the USI Pursuit Design Studio'),
    'prrama': ('studio_designers', 'high', 'Bio: Pursuit Design Studio; survey: Pursuit Designer - Studio'),
    'arojsen': ('studio_designers', 'high', 'Survey: Pursuit Designer - Studio; card: Shift 2'),
    'mejayan': ('studio_designers', 'medium', 'Bio: Senior Analyst - Graphic; card: Shift 1'),
    'swathiswathi2': ('studio_designers', 'medium', 'Card: Shift 1'),
    'rudrasengupta': ('studio_designers', 'medium', 'Card: Shift 1'),
    'srkolachana': ('studio_designers', 'medium', 'Card: Shift 2'),

    # PACE: the agile, cross-functional team; cards created right after the PACE headings
    'prithghosh': ('pace_managers', 'high', 'Bio: cross-functional; in the PACE headings batch'),
    'pannamraju': ('pace_managers', 'high', 'Bio: Pursuit manager; in the PACE headings batch'),
    'aranand': ('pace_managers', 'high', 'Bio: Pursuit Manager; created right after the PACE headings'),
    'nampathak': ('pace_managers', 'high', 'Card tag ARA ESG; created right after the PACE headings'),
    'suktripathy': ('pace_managers', 'high', 'Card tag ESG; bio: Pursuit Manager; created right after the PACE headings'),
    'kbhui': ('pace_managers', 'high', 'Bio: Pursuit Manager, ARA; created right after the PACE headings'),
    'shsomala': ('pace_managers', 'medium', 'Bio: Deloitte Private Pursuit Manager; created right after the PACE headings'),
    'jassaluja': ('pace_managers', 'medium', 'Created right after the PACE headings'),
    'krisaha': ('pace_managers', 'medium', 'Card tag Audit; created right after the PACE headings'),
    'laksnair': ('pace_managers', 'low', 'Bio: Pursuit Manager'),
    'vvariava': ('pace_managers', 'low', 'Bio: CoP Advisory, Pursuit Manager'),
    'dsingh18': ('pace_managers', 'low', 'Manager; no team signal'),
    'abkodavati': ('pace_managers', 'low', 'Assistant Manager; no team signal'),
    'shivalpawar': ('pace_designers', 'high', 'Bio: AA Designer; in the PACE headings batch'),
    'sepalexander': ('pace_designers', 'high', 'Bio: motion graphics; created right after the PACE headings'),
    'scholkar': ('pace_designers', 'high', 'Created right after the PACE headings'),

    # Israel Catalyst Team: cards created right after the Israel Catalyst heading
    'mahjan': ('catalyst_team', 'medium', 'Created right after the Israel Catalyst heading; bio: Pursuits - Agile PACE'),
    'vinkumaryadav': ('catalyst_team', 'medium', 'Created right after the Israel Catalyst heading; card: Shift 2'),
    'pratydutta': ('catalyst_team', 'medium', 'Created just before the Israel Catalyst heading'),
}

TEAM_LABELS = {
    'leadership': 'Leadership',
    'audit_managers': 'Audit Managers',
    'audit_designers': 'Audit Designers',
    'audit_researchers': 'Audit Researchers',
    'tax_managers': 'Tax Managers',
    'tax_designers': 'Tax Designers',
    'consulting_designers': 'Consulting Services Pursuit Designers',
    'pace_managers': 'PACE Managers',
    'pace_designers': 'PACE Designers',
    'studio_designers': 'Pursuits Studio Designers',
    'catalyst_team': 'Israel Catalyst Team',
    'unassigned': 'Unassigned (confirm)',
}
