-- Handy queries: wrangler d1 execute makerlens-feedback --remote --command "<query>"

-- Average rating and number of ratings
SELECT COUNT(*) AS ratings, ROUND(AVG(rating), 2) AS avg FROM feedback WHERE kind = 'rating';

-- Star distribution
SELECT rating, COUNT(*) AS n FROM feedback WHERE kind = 'rating' GROUP BY rating ORDER BY rating DESC;

-- Ratings per ISO week (trend after a release)
SELECT strftime('%Y-W%W', created_day) AS week, COUNT(*) AS n, ROUND(AVG(rating), 2) AS avg
FROM feedback WHERE kind = 'rating' GROUP BY week ORDER BY week DESC LIMIT 12;

-- Does rating change with usage?
SELECT opens, COUNT(*) AS n, ROUND(AVG(rating), 2) AS avg FROM feedback WHERE kind = 'rating' GROUP BY opens;

-- Latest comments, bug reports and ideas
SELECT id, created_day, kind, rating, lang, browser, comment FROM feedback
WHERE comment <> '' ORDER BY id DESC LIMIT 50;

-- Remove one entry (e.g. someone asks to remove a comment they recognise as theirs)
-- DELETE FROM feedback WHERE id = ?;
