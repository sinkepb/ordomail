-- Catalogue initial : 30 modèles génériques saisonniers, activables en un clic
-- (aucune saisie requise). Contenu générique/indicatif — le titulaire ajuste
-- le prix réel en créant sa propre offre s'il le souhaite ; ces modèles sont
-- pensés pour être publiés tels quels par un préparateur pressé.
--
-- Pas de clé naturelle unique sur `titre` pour un ON CONFLICT ciblé — cette
-- migration ne devant s'exécuter qu'une fois, on protège la ré-exécution
-- accidentelle en ne semant que si le catalogue est encore vide.
INSERT INTO offre_templates (titre, description, emoji, badge, couleur, type, saison, ordre)
SELECT * FROM (VALUES
-- Hiver
('Pack Immunité Hiver',        'Vitamine C, zinc, échinacée — préparez l''hiver.',        '🧣', '-20%', '#0369a1', 'promo',   'hiver',       1),
('Kit Rhume & Grippe',         'Paracétamol, sirop, spray nasal.',                        '🤧', '-15%', '#0369a1', 'promo',   'hiver',       2),
('Soin lèvres gercées',        'Baumes et sticks lèvres grand froid.',                    '💋', '-10%', '#0369a1', 'promo',   'hiver',       3),
('Gel hydroalcoolique',        'Flacons et recharges gel mains.',                          '🧴', '-25%', '#0369a1', 'promo',   'hiver',       4),
('Bilan vaccination grippe',   'Faites le point avec votre pharmacien.',                   '💉', null,    '#0369a1', 'service', 'hiver',       5),
('Crème mains grand froid',    'Protection et réparation peau sèche.',                     '🧤', '-15%', '#0369a1', 'promo',   'hiver',       6),
-- Printemps
('Kit Anti-allergies',         'Antihistaminiques et sprays nasaux.',                      '🌸', '-20%', '#15803d', 'promo',   'printemps',   1),
('Cure détox printemps',       'Draineurs et compléments détox.',                          '🌿', '-15%', '#15803d', 'promo',   'printemps',   2),
('Diagnostic allergies',       'Un échange avec votre pharmacien.',                        '🔍', null,    '#15803d', 'service', 'printemps',   3),
('Vitamine D reprise',         'Complément vitamine D printemps.',                         '☀️', '-10%', '#15803d', 'promo',   'printemps',   4),
('Soin peau réactive',         'Crèmes apaisantes changement de saison.',                  '🧴', '-15%', '#15803d', 'promo',   'printemps',   5),
('Accompagnement arrêt tabac', 'Substituts nicotiniques et suivi.',                        '🚭', null,    '#15803d', 'service', 'printemps',   6),
-- Été
('Pack Solaire Famille',       'Crèmes solaires toute la famille.',                        '🏖️', '-20%', '#f59e0b', 'promo',   'ete',         1),
('Anti-moustique',             'Répulsifs et sprays anti-moustiques.',                     '🦟', '-15%', '#f59e0b', 'promo',   'ete',         2),
('Kit voyage pharmacie',       'Trousse complète spéciale vacances.',                      '🧳', '-10%', '#f59e0b', 'promo',   'ete',         3),
('Hydratation & électrolytes', 'Boissons et sachets réhydratation.',                       '💧', '-15%', '#f59e0b', 'promo',   'ete',         4),
('Après-soleil apaisant',      'Soins réparateurs après exposition.',                      '🌅', '-20%', '#f59e0b', 'promo',   'ete',         5),
('Conseil voyage & vaccins',   'Préparez votre voyage à l''étranger.',                     '✈️', null,    '#f59e0b', 'service', 'ete',         6),
-- Automne
('Rentrée Immunité',           'Compléments pour bien démarrer l''automne.',               '🍂', '-15%', '#c2410c', 'promo',   'automne',     1),
('Kit anti-poux rentrée',      'Traitements et prévention poux.',                          '🧴', '-10%', '#c2410c', 'promo',   'automne',     2),
('Compléments anti-fatigue',   'Vitamines et fer pour l''énergie.',                        '🔋', '-20%', '#c2410c', 'promo',   'automne',     3),
('Bilan sommeil',              'Un échange sur votre qualité de sommeil.',                 '🌙', null,    '#c2410c', 'service', 'automne',     4),
('Soin peau sèche automne',    'Crèmes nourrissantes changement de saison.',               '🧴', '-15%', '#c2410c', 'promo',   'automne',     5),
('Sevrage tabac rentrée',      'Accompagnement personnalisé.',                             '🚭', null,    '#c2410c', 'service', 'automne',     6),
-- Toute l'année
('Programme fidélité',         '-5% dès votre 5e achat.',                                  '🎁', '-5%',  '#7c3aed', 'fidelite','toute_annee', 1),
('Parrainage',                 '-10% pour vous et votre filleul.',                         '🤝', '-10%', '#7c3aed', 'fidelite','toute_annee', 2),
('Orthopédie sur-mesure',      'Semelles et bas de contention sur-mesure.',                '🦶', null,    '#7c3aed', 'service', 'toute_annee', 3),
('Conseil nutrition',          'Un accompagnement personnalisé.',                          '🥗', null,    '#7c3aed', 'service', 'toute_annee', 4),
('2e produit hygiène offert',  'Pour l''achat d''un produit d''hygiène.',                   '🧼', '1+1',  '#7c3aed', 'promo',   'toute_annee', 5),
('Carte fidélité premium',     'Avantages exclusifs toute l''année.',                      '💳', null,    '#7c3aed', 'fidelite','toute_annee', 6)
) AS t(titre, description, emoji, badge, couleur, type, saison, ordre)
WHERE NOT EXISTS (SELECT 1 FROM offre_templates);
