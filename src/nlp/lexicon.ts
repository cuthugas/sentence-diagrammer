// Curated word lists. compromise's statistical tagger is good but inconsistent
// on short function words (e.g. it sometimes tags "over" or "after" as an
// adjective instead of a preposition). For a teaching tool, predictable,
// explainable tagging of these closed word classes matters more than
// handling rare ambiguous usages, so we override with dictionaries.

export const PREPOSITIONS = new Set([
  'aboard', 'about', 'above', 'across', 'after', 'against', 'along', 'amid',
  'among', 'around', 'as', 'at', 'atop', 'before', 'behind', 'below',
  'beneath', 'beside', 'besides', 'between', 'beyond', 'but', 'by',
  'concerning', 'despite', 'down', 'during', 'except', 'following', 'for',
  'from', 'in', 'inside', 'into', 'like', 'near', 'of', 'off', 'on', 'onto',
  'opposite', 'out', 'outside', 'over', 'past', 'per', 'regarding', 'round',
  'since', 'through', 'throughout', 'till', 'to', 'toward', 'towards',
  'under', 'underneath', 'unlike', 'until', 'unto', 'up', 'upon', 'via',
  'with', 'within', 'without',
])

export const COORDINATING_CONJUNCTIONS = new Set(['and', 'but', 'or', 'nor', 'yet', 'so'])

export const SUBORDINATING_CONJUNCTIONS = new Set([
  'although', 'because', 'since', 'unless', 'while', 'whereas', 'though',
  'if', 'when', 'whenever', 'wherever', 'after', 'before', 'until', 'once',
  'as', 'even though', 'so that', 'provided that',
])

export const DETERMINERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
  'her', 'its', 'our', 'their', 'some', 'any', 'no', 'every', 'each',
  'either', 'neither', 'all', 'both', 'few', 'many', 'much', 'several',
  'such', 'what', 'which', 'whose',
])

export const AUXILIARIES = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'being', 'been',
  'do', 'does', 'did',
  'have', 'has', 'had',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'ought',
])

export const LINKING_VERB_LEMMAS = new Set([
  'be',
  'seem', 'seems', 'seemed', 'seeming',
  'become', 'becomes', 'became', 'becoming',
  'feel', 'feels', 'felt', 'feeling',
  'look', 'looks', 'looked', 'looking',
  'appear', 'appears', 'appeared', 'appearing',
  'grow', 'grows', 'grew', 'growing', 'grown',
  'remain', 'remains', 'remained', 'remaining',
  'taste', 'tastes', 'tasted', 'tasting',
  'smell', 'smells', 'smelled', 'smelling',
  'sound', 'sounds', 'sounded', 'sounding',
  'stay', 'stays', 'stayed', 'staying',
  'turn', 'turns', 'turned', 'turning',
  'prove', 'proves', 'proved', 'proving',
])

export const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'being', 'been'])

export const PRONOUNS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves',
  'who', 'whom', 'whoever', 'whomever', 'this', 'that', 'these', 'those',
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything',
  'everyone', 'everybody', 'everything', 'no one', 'nobody', 'nothing',
])
