/**
 * Local database of popular clubs for instant search (no API calls).
 * IDs are football-data.org v4 team IDs by default.
 * For leagues not on football-data.org (MLS, Turkish, K League, J1, Belgian),
 * IDs are API Football IDs and logo is provided explicitly.
 * Squad analysis falls back to API Football by team name for those clubs.
 */

export interface LocalTeam {
  id: number
  name: string
  country: string
  aliases: string[]
  logo?: string // explicit logo URL for non-FD teams
}

export const POPULAR_TEAMS: LocalTeam[] = [
  // ── Premier League ─────────────────────────────────────────────────────────
  { id: 57,   name: 'Arsenal',                country: 'England', aliases: ['gunners', 'afc', 'ars'] },
  { id: 58,   name: 'Aston Villa',            country: 'England', aliases: ['villa', 'avfc', 'villans'] },
  { id: 1044, name: 'Bournemouth',            country: 'England', aliases: ['cherries', 'afcb'] },
  { id: 402,  name: 'Brentford',              country: 'England', aliases: ['bees', 'bfc'] },
  { id: 397,  name: 'Brighton',               country: 'England', aliases: ['seagulls', 'bha', 'brighton & hove', 'brighton and hove', 'albion'] },
  { id: 61,   name: 'Chelsea',                country: 'England', aliases: ['blues', 'cfc', 'the blues'] },
  { id: 354,  name: 'Crystal Palace',         country: 'England', aliases: ['palace', 'cpfc', 'eagles'] },
  { id: 62,   name: 'Everton',                country: 'England', aliases: ['toffees', 'efc'] },
  { id: 63,   name: 'Fulham',                 country: 'England', aliases: ['cottagers', 'ffc'] },
  { id: 349,  name: 'Ipswich Town',           country: 'England', aliases: ['ipswich', 'tractor boys', 'itfc'] },
  { id: 338,  name: 'Leicester City',         country: 'England', aliases: ['leicester', 'foxes', 'lcfc'] },
  { id: 64,   name: 'Liverpool',              country: 'England', aliases: ['reds', 'lfc', 'pool', 'the reds'] },
  { id: 65,   name: 'Manchester City',        country: 'England', aliases: ['man city', 'city', 'mcfc', 'man c', 'citizens'] },
  { id: 66,   name: 'Manchester United',      country: 'England', aliases: ['man united', 'man utd', 'united', 'mufc', 'red devils', 'man u'] },
  { id: 67,   name: 'Newcastle United',       country: 'England', aliases: ['newcastle', 'nufc', 'toon', 'magpies', 'newcastle utd'] },
  { id: 351,  name: 'Nottingham Forest',      country: 'England', aliases: ['forest', 'nffc', 'nottm forest', 'nottingham'] },
  { id: 340,  name: 'Southampton',            country: 'England', aliases: ['saints', 'scfc', 'the saints'] },
  { id: 73,   name: 'Tottenham Hotspur',      country: 'England', aliases: ['spurs', 'thfc', 'tottenham', 'totten'] },
  { id: 563,  name: 'West Ham United',        country: 'England', aliases: ['west ham', 'hammers', 'irons', 'whufc'] },
  { id: 76,   name: 'Wolverhampton Wanderers',country: 'England', aliases: ['wolves', 'wwfc', 'wolverhampton', 'wanderers'] },
  // English Football League teams (Championship, League One, etc.) are resolved live
  // via searchFDTeams from the football-data.org ELC competition endpoint.
  // Do NOT hardcode IDs here — they were guessed and caused wrong logo/data bugs.
  // ── La Liga ────────────────────────────────────────────────────────────────
  { id: 86,   name: 'Real Madrid',            country: 'Spain',   aliases: ['madrid', 'blancos', 'rmcf', 'los blancos'] },
  { id: 81,   name: 'FC Barcelona',           country: 'Spain',   aliases: ['barcelona', 'barca', 'fcb', 'blaugrana'] },
  { id: 78,   name: 'Atlético de Madrid',     country: 'Spain',   aliases: ['atletico madrid', 'atletico', 'atleti', 'atm', 'colchoneros'] },
  { id: 559,  name: 'Sevilla FC',             country: 'Spain',   aliases: ['sevilla', 'sfc', 'nervion'] },
  { id: 95,   name: 'Valencia CF',            country: 'Spain',   aliases: ['valencia', 'vcf', 'bats', 'che'] },
  { id: 94,   name: 'Villarreal CF',          country: 'Spain',   aliases: ['villarreal', 'yellow submarine'] },
  { id: 90,   name: 'Real Betis',             country: 'Spain',   aliases: ['betis', 'verdiblancos'] },
  { id: 92,   name: 'Real Sociedad',          country: 'Spain',   aliases: ['sociedad', 'la real', 'txuri urdin'] },
  { id: 77,   name: 'Athletic Club',          country: 'Spain',   aliases: ['athletic bilbao', 'bilbao', 'lions'] },
  { id: 250,  name: 'Getafe CF',              country: 'Spain',   aliases: ['getafe'] },
  // ── Serie A ────────────────────────────────────────────────────────────────
  { id: 98,   name: 'AC Milan',               country: 'Italy',   aliases: ['milan', 'rossoneri', 'acm'] },
  { id: 108,  name: 'Inter Milan',            country: 'Italy',   aliases: ['inter', 'internazionale', 'nerazzurri', 'fc internazionale'] },
  { id: 109,  name: 'Juventus FC',            country: 'Italy',   aliases: ['juve', 'bianconeri', 'old lady'] },
  { id: 100,  name: 'AS Roma',                country: 'Italy',   aliases: ['roma', 'giallorossi', 'asr'] },
  { id: 113,  name: 'SSC Napoli',             country: 'Italy',   aliases: ['napoli', 'partenopei', 'azzurri'] },
  { id: 110,  name: 'SS Lazio',               country: 'Italy',   aliases: ['lazio', 'biancocelesti', 'aquile'] },
  { id: 99,   name: 'ACF Fiorentina',         country: 'Italy',   aliases: ['fiorentina', 'viola', 'gigliati'] },
  { id: 102,  name: 'Atalanta BC',            country: 'Italy',   aliases: ['atalanta', 'la dea', 'bergamaschi'] },
  { id: 103,  name: 'Bologna FC 1909',        country: 'Italy',   aliases: ['bologna', 'rossoblu'] },
  { id: 586,  name: 'Torino FC',              country: 'Italy',   aliases: ['torino', 'toro', 'granata'] },
  // ── Bundesliga ─────────────────────────────────────────────────────────────
  { id: 5,    name: 'FC Bayern München',      country: 'Germany', aliases: ['bayern munich', 'bayern', 'fcb', 'bavarians', 'fc bayern'] },
  { id: 4,    name: 'Borussia Dortmund',      country: 'Germany', aliases: ['dortmund', 'bvb', 'black and yellow', 'bvb09'] },
  { id: 721,  name: 'RB Leipzig',             country: 'Germany', aliases: ['leipzig', 'rbl', 'red bulls'] },
  { id: 3,    name: 'Bayer 04 Leverkusen',    country: 'Germany', aliases: ['leverkusen', 'b04', 'werkself', 'bayer'] },
  { id: 9,    name: 'Eintracht Frankfurt',    country: 'Germany', aliases: ['frankfurt', 'sge', 'eintracht'] },
  { id: 11,   name: 'VfL Wolfsburg',          country: 'Germany', aliases: ['wolfsburg', 'wob'] },
  { id: 15,   name: 'Borussia Mönchengladbach', country: 'Germany', aliases: ['gladbach', 'monchengladbach', 'mgladbach', 'foals', 'bmg'] },
  { id: 10,   name: 'VfB Stuttgart',          country: 'Germany', aliases: ['stuttgart', 'vfb', 'swabians'] },
  { id: 7,    name: 'TSG 1899 Hoffenheim',    country: 'Germany', aliases: ['hoffenheim', 'tsg'] },
  { id: 17,   name: 'SC Freiburg',            country: 'Germany', aliases: ['freiburg', 'scf'] },
  { id: 28,   name: '1. FC Union Berlin',     country: 'Germany', aliases: ['union berlin', 'fc union', 'eiserne'] },
  { id: 6,    name: 'Werder Bremen',          country: 'Germany', aliases: ['werder', 'bremen', 'svw'] },
  // ── Ligue 1 ────────────────────────────────────────────────────────────────
  { id: 524,  name: 'Paris Saint-Germain FC', country: 'France',  aliases: ['psg', 'paris', 'paris sg', 'les parisiens', 'paris saint germain'] },
  { id: 516,  name: 'Olympique de Marseille', country: 'France',  aliases: ['marseille', 'om', 'phoceans'] },
  { id: 548,  name: 'AS Monaco FC',           country: 'France',  aliases: ['monaco', 'asm', 'monegasques'] },
  { id: 523,  name: 'Olympique Lyonnais',     country: 'France',  aliases: ['lyon', 'ol', 'les gones'] },
  { id: 521,  name: 'LOSC Lille',             country: 'France',  aliases: ['lille', 'losc', 'mastiffs', 'les dogues'] },
  { id: 525,  name: 'OGC Nice',               country: 'France',  aliases: ['nice', 'ogcn', 'aiglons'] },
  { id: 529,  name: 'Stade Rennais FC 1901',  country: 'France',  aliases: ['rennes', 'srfc', 'rouge et noir'] },
  { id: 546,  name: 'RC Lens',                country: 'France',  aliases: ['lens', 'sang et or', 'lensois'] },
  { id: 527,  name: 'RC Strasbourg Alsace',   country: 'France',  aliases: ['strasbourg', 'rcsa', 'alsatians'] },
  // ── Eredivisie ─────────────────────────────────────────────────────────────
  { id: 678,  name: 'AFC Ajax',               country: 'Netherlands', aliases: ['ajax', 'lancers', 'godenzonen'] },
  { id: 674,  name: 'PSV',                    country: 'Netherlands', aliases: ['psv eindhoven', 'boeren'] },
  { id: 675,  name: 'Feyenoord Rotterdam',    country: 'Netherlands', aliases: ['feyenoord', 'de club', 'legionairs'] },
  // ── Primeira Liga ──────────────────────────────────────────────────────────
  { id: 1903, name: 'SL Benfica',             country: 'Portugal', aliases: ['benfica', 'slb', 'eagles'] },
  { id: 503,  name: 'FC Porto',               country: 'Portugal', aliases: ['porto', 'fcp', 'dragoes'] },
  { id: 498,  name: 'Sporting CP',            country: 'Portugal', aliases: ['sporting', 'scp', 'leoes', 'lions'] },
  // ── Scotland ───────────────────────────────────────────────────────────────
  { id: 726,  name: 'Celtic FC',              country: 'Scotland', aliases: ['celtic', 'bhoys', 'celts'] },
  { id: 733,  name: 'Rangers FC',             country: 'Scotland', aliases: ['rangers', 'gers', 'bluenoses'] },
  // Turkish, MLS, K League, J1, Belgian and all other non-FD leagues are handled
  // by the API Football search fallback in teams/route.ts (correct IDs + logos).
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function searchLocalTeams(query: string): Array<{
  team: { id: number; name: string; country: string; logo: string }
  venue: { name: string; city: string }
}> {
  const q = normalize(query)
  if (q.length < 2) return []

  const results: Array<{ team: LocalTeam; score: number }> = []

  for (const team of POPULAR_TEAMS) {
    const normalizedName = normalize(team.name)
    let score = 0

    if (normalizedName === q)                                                     score = 100
    else if (normalizedName.startsWith(q))                                        score = 90
    else if (normalizedName.split(' ').some((w) => w.startsWith(q)))              score = 80
    else if (normalizedName.includes(q))                                          score = 70
    else {
      for (const alias of team.aliases) {
        const na = normalize(alias)
        if (na === q)                                   { score = 85; break }
        if (na.startsWith(q))                           { score = 75; break }
        if (na.includes(q))                             { score = 60; break }
        if (q.includes(na) && na.length >= 3)          { score = 55; break }
      }
    }

    if (score > 0) results.push({ team, score })
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ team }) => ({
      team: {
        id: team.id,
        name: team.name,
        country: team.country,
        logo: team.logo ?? `https://crests.football-data.org/${team.id}.png`,
      },
      venue: { name: '', city: '' },
    }))
}
