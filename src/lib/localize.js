/**
 * Row localisation.
 *
 * Views across the app print plain fields (`row.title`, `row.caption`, `row.headline`),
 * so instead of editing dozens of templates we overwrite those fields in place with the
 * best value for the active locale before rendering.
 *
 * Falls back to the authoring value when a translation is missing, so a partially
 * translated catalogue degrades to readable text rather than blanks.
 */

/** Fields we localise, by convention `<field>_<locale>`. */
const FIELDS = ['title', 'description', 'caption', 'headline', 'subtext', 'excerpt', 'name', 'body'];

function localizeRow(row, locale, fields = FIELDS) {
  if (!row || !locale) return row;
  for (const f of fields) {
    const v = row[`${f}_${locale}`];
    if (v != null && String(v).trim() !== '') row[f] = v;
  }
  return row;
}

/** Localise a single row or an array of rows in place. */
function localize(rows, locale, fields) {
  if (!rows) return rows;
  if (Array.isArray(rows)) {
    for (const r of rows) localizeRow(r, locale, fields);
    return rows;
  }
  return localizeRow(rows, locale, fields);
}

module.exports = { localize, localizeRow, FIELDS };
