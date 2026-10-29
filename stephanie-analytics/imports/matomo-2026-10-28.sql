INSERT OR REPLACE INTO imported_reports (
  report_date, source, unique_visitors, visits, actions, pageviews, avg_duration_seconds, bounce_rate,
  countries_json, cities_json, devices_json, browsers_json, operating_systems_json, pages_json, channels_json
) VALUES (
  '2026-10-28', 'Matomo', 8, 8, 17, 15, 26, 75,
  '[{"label":"France","visits":7,"unique_visitors":7,"actions":16},{"label":"Belgique","visits":1,"unique_visitors":1,"actions":1}]',
  '[{"label":"Inconnue","visits":6,"unique_visitors":6,"actions":15},{"label":"Lyon","visits":1,"unique_visitors":1,"actions":1},{"label":"Roanne","visits":1,"unique_visitors":1,"actions":1}]',
  '[{"label":"Smartphone","visits":6},{"label":"Bureau","visits":1},{"label":"Phablette","visits":1}]',
  '[{"label":"Chrome Mobile","visits":3},{"label":"Chrome","visits":1},{"label":"Facebook","visits":1},{"label":"Instagram","visits":1},{"label":"Mobile Safari","visits":1},{"label":"Samsung Browser","visits":1}]',
  '[{"label":"Android","visits":5},{"label":"iOS","visits":2},{"label":"GNU/Linux","visits":1}]',
  '[{"label":"/","pageviews":11,"unique_pageviews":8,"avg_seconds":9},{"label":"/contact.html","pageviews":2,"unique_pageviews":1,"avg_seconds":39},{"label":"/mariage.html","pageviews":1,"unique_pageviews":1,"avg_seconds":28},{"label":"/realisations.html","pageviews":1,"unique_pageviews":1,"avg_seconds":71}]',
  '[{"label":"Accès direct","visits":4,"actions":10},{"label":"Moteurs de recherche","visits":4,"actions":7}]'
);
