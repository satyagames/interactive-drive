"""Curated team assignments for the People of Pursuits roster.

The 2D site export does not record which team section each person card sat in
(the platform fetched subpages at runtime). These assignments are inferred from
evidence in the export and are meant to be CONFIRMED by the Pursuits team:

  - explicit tags on the person card (e.g. "Audit", "Tax", "Shift 2")
  - the "CoP Profile | <function>" line and role in the person's bio PDF
  - the Knowledge Ninja skills survey ("Pursuit Designer - Studio" / "- CoE")
  - creation-batch proximity to a team heading on the Our team page

confidence: high = two or more independent signals agree, medium = one strong
signal, low = batch proximity or a weak hint only. Only high and medium are
shown in the 3D arena; everything is kept in the backup.
"""

# Add a team id here once the Pursuits team has confirmed its roster: its station
# then loses the "awaiting confirmation" note and is marked final in the arena.
CONFIRMED_TEAMS = set()

LEADERSHIP = {
    'karora': ('leadership', 'high', 'Card: SVP, USI Pursuits COE Lead; Audit Pursuit Manager for USI Strategic segment'),
    'rajamishra': ('leadership', 'high', 'Card: AVP, USI Strategic segment'),
    'rnandikonda': ('leadership', 'high', 'Card: AVP, USI Strategic segment; bio: A&A pursuit manager'),
    'rraog': ('leadership', 'medium', 'Card: Executive Manager, USI Strategic segment; bio: AA Pursuit Manager'),
    'sandemishra': ('leadership', 'medium', 'Card: Manager, USI Strategic segment; bio: Pursuit Manager'),
}

TEAMS = {
    # Audit Managers
    'sksuresh': ('audit_managers', 'high', 'Card tag Audit; bio: Pursuit Manager'),
    'vinpriya': ('audit_managers', 'high', 'Card tag Audit; bio: AA Manager, CoP A&A'),
    'mchatta': ('audit_managers', 'high', 'Card tag Audit; bio: Pursuit Manager - Audits; quote: Audit pursuit manager'),
    'nfarooque': ('audit_managers', 'high', 'Card: Manager, Audit'),
    'deeppandey': ('audit_managers', 'high', 'Card: Deputy Manager, Audit'),
    'avmanu': ('audit_managers', 'medium', 'Card tag Audit; bio: AA Editor'),
    'shanksen': ('audit_managers', 'medium', 'Card tag Deployment; created with the Audit managers batch'),
    'predeb': ('audit_managers', 'medium', 'Card tag Deloitte Private; bio: Deloitte Private Pursuit Manager'),
    'amuzammil': ('audit_managers', 'medium', 'Card tag Deloitte Private; bio: Pursuit Manager'),
    'shsomala': ('audit_managers', 'medium', 'Card tag Deloitte Private; bio: Pursuit Manager'),
    'pannamraju': ('audit_managers', 'medium', 'Bio: CoP A&A, Pursuit manager'),
    'susyanamadala': ('audit_managers', 'medium', 'Bio: Assurance - First Draft Proposal'),
    'ksharma65': ('audit_managers', 'low', 'Added with Sushma (2026 batch)'),
    # Audit Designers
    'trungta': ('audit_designers', 'high', 'Bio: Audit Design CoE; survey: Pursuit Designer - CoE'),
    'akgadepalli': ('audit_designers', 'high', 'Bio: AA Designer; survey: Pursuit Designer - CoE'),
    'kasjoshi': ('audit_designers', 'high', 'Bio: AA Designer, CoP A&A'),
    'ssravyasudha': ('audit_designers', 'high', 'Bio: AA Designer, CoP A&A'),
    'shivalpawar': ('audit_designers', 'high', 'Card tag Audit; bio: AA Designer'),
    'niterana': ('audit_designers', 'high', 'Bio: CoP A&A, Senior Analyst - Graphic'),
    'tripgupta': ('audit_designers', 'medium', 'Bio: CoP A&A, graphic'),
    'smodukuru': ('audit_designers', 'medium', 'Bio: CoP A&A, visual designer; runs the design library'),
    'moacharya': ('audit_designers', 'medium', 'Bio: Senior Analyst, Graphic; created with the A&A designers'),
    'ssawji': ('audit_designers', 'medium', 'Bio: CoP A&A (survey says Studio: confirm)'),
    'purtiwari': ('audit_designers', 'medium', 'Bio: CoP A&A'),
    'shlmathur': ('audit_designers', 'medium', 'Bio: CoP A&A'),
    'kp3': ('audit_designers', 'low', 'Listed with the A&A designers (2026 batch)'),
    'upachode': ('audit_designers', 'low', 'Listed with the A&A designers (2026 batch)'),
    'harschopra': ('audit_designers', 'low', '2026 batch'),
    # Audit Researchers
    'kritisrivastava9': ('audit_researchers', 'high', 'Bio: AA Pursuit Researcher'),
    'rashmpandey': ('audit_researchers', 'high', 'Testimonial: pursuit researcher'),
    'rsrivastava14': ('audit_researchers', 'medium', 'Bio: business development and market research'),
    'nidhivsharma': ('audit_researchers', 'low', 'Created with Ritik Srivastava'),
    'mithkumar': ('audit_researchers', 'low', 'Bio: data visualization; created with the researchers'),
    # Tax Managers
    'pnandula': ('tax_managers', 'high', 'Bio: CoP Tax, Pursuit manager; Tax managers batch'),
    'karansingh7': ('tax_managers', 'high', 'Bio: Tax Pursuit Manager; Tax managers batch'),
    'ayagupta': ('tax_managers', 'high', 'Bio: Tax Pursuit Manager; quote: Tax pursuit manager'),
    'bhgrover': ('tax_managers', 'medium', 'Bio: Pursuit Manager; Tax managers batch'),
    'soumrana': ('tax_managers', 'medium', 'Tax managers batch'),
    'vasonti': ('tax_managers', 'low', 'Bio: Proposal and Bid Manager'),
    # Tax Designers
    'aboora': ('tax_designers', 'high', 'Bio: Manager, Pursuits CoE - Tax Design'),
    'aninchakrabarti': ('tax_designers', 'high', 'Bio: Tax Designer, CoP Tax'),
    'kummkumar': ('tax_designers', 'high', 'Bio: Tax Designer, CoP Tax'),
    'dmatkari': ('tax_designers', 'high', 'Bio: CoP Tax; card tag LBS'),
    'divymenon': ('tax_designers', 'high', 'Bio: CoE - Tax Design'),
    'padtejaswini': ('tax_designers', 'high', 'Bio: Tax Pursuits COE Designer'),
    'chchepuri': ('tax_designers', 'high', 'Card tag Tax; bio: Pursuits CoE - Tax'),
    'vamkumar': ('tax_designers', 'high', 'Card tag Tax; bio: Graphic Designer'),
    'jmasulu': ('tax_designers', 'high', 'Card tag Tax'),
    'cjohnpal': ('tax_designers', 'high', 'Bio: Graphic Designer, Tax Pursuit USI'),
    'akartheek': ('tax_designers', 'high', 'Asset: NEW HIRE_TAX_Designer'),
    'psambaturu': ('tax_designers', 'medium', 'Created with the Tax designers'),
    # Consulting Services Designers
    'amondal': ('consulting_designers', 'medium', 'Card tag Consulting'),
    # PACE (Agile cross-functional pursuits)
    'prithghosh': ('pace_managers', 'high', 'Bio: cross-functional; PACE managers batch'),
    'mahjan': ('pace_managers', 'high', 'Bio: Pursuits - Agile PACE'),
    'aranand': ('pace_managers', 'medium', 'Bio: Pursuit Manager; PACE batch'),
    'nampathak': ('pace_managers', 'medium', 'Card tag ARA ESG; PACE batch'),
    'suktripathy': ('pace_managers', 'medium', 'Card tag ESG; bio: Pursuit Manager'),
    'kbhui': ('pace_managers', 'medium', 'Bio: Pursuit Manager, ARA'),
    'jassaluja': ('pace_managers', 'low', 'PACE batch'),
    'laksnair': ('pace_managers', 'low', 'Bio: Pursuit Manager'),
    'vvariava': ('pace_managers', 'low', 'Bio: CoP Advisory, Pursuit Manager'),
    'pratydutta': ('pace_managers', 'low', 'PACE batch'),
    'sepalexander': ('pace_designers', 'medium', 'Bio: motion graphics; PACE batch'),
    'scholkar': ('pace_designers', 'medium', 'PACE designers batch'),
    'krisaha': ('pace_designers', 'low', 'PACE batch (card tag Audit, bio Pursuit Analyst - Audit: confirm)'),
    # Pursuits Design Studio (follow-the-sun shifts)
    'pmedichalam': ('studio_designers', 'high', 'Card: USI Emerging Media Lead; bio: USI Pursuit Design Studio'),
    'cchandramsetti': ('studio_designers', 'high', 'Card: Shift 1 Lead; bio: Pursuit Design Studio'),
    'ricsaxena': ('studio_designers', 'high', 'Card: Shift 2 Lead'),
    'vkader': ('studio_designers', 'high', 'Card: Shift 2; bio: Pursuit Design Studio'),
    'prrama': ('studio_designers', 'high', 'Bio: Pursuit Design Studio; survey: Pursuit Designer - Studio'),
    'arojsen': ('studio_designers', 'high', 'Card: Shift 2; survey: Pursuit Designer - Studio'),
    'mdharod': ('studio_designers', 'medium', 'Card: Shift 2'),
    'nanrathi': ('studio_designers', 'medium', 'Card: Shift 2; bio: Advisory designer'),
    'mejayan': ('studio_designers', 'medium', 'Card: Shift 1; bio: Graphic'),
    'swathiswathi2': ('studio_designers', 'medium', 'Card: Shift 1'),
    'subpal': ('studio_designers', 'medium', 'Card: Shift 1; bio: Graphic'),
    'rudrasengupta': ('studio_designers', 'medium', 'Card: Shift 1'),
    'uakkinapally': ('studio_designers', 'medium', 'Card: Shift 1'),
    'srkolachana': ('studio_designers', 'medium', 'Card: Shift 2'),
    'mohammadahussain': ('studio_designers', 'medium', 'Card: Shift 2; bio: Graphic Designer'),
    'vinkumaryadav': ('studio_designers', 'medium', 'Card: Shift 2'),
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
