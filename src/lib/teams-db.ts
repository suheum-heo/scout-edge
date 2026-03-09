/**
 * Local database of popular clubs for instant search (no API calls).
 * IDs are football-data.org v4 team IDs by default.
 * For leagues not on football-data.org (MLS, Turkish, K League, J1, Belgian),
 * IDs are API Football IDs and logo is provided explicitly.
 * Squad analysis falls back to API Football by team name for those clubs.
 */

export interface LocalTeam {
  id: number
  name: string        // official full display name
  country: string
  aliases: string[]
  logo?: string       // fallback logo URL for non-FD teams (shown if FotMob enrichment fails)
  source?: 'af'       // ID is an API Football ID (not football-data.org)
  fotmobSearch?: string // override FotMob search query when full name doesn't find the right team
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
  // ── Turkish Süper Lig (API Football IDs, source: 'af') ────────────────────
  { id: 611,  name: 'Fenerbahçe',             country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/611.png',  aliases: ['fenerbahce', 'fenerbahce sk', 'fener', 'fb', 'sarikanaryalar'] },
  { id: 645,  name: 'Galatasaray',            country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/645.png',  aliases: ['galatasaray sk', 'cimbom', 'gs', 'aslanlar'] },
  { id: 549,  name: 'Beşiktaş',              country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/549.png',  aliases: ['besiktas', 'besiktas jk', 'bjk', 'kartallar'] },
  { id: 998,  name: 'Trabzonspor',            country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/998.png',  aliases: ['trabzon', 'ts', 'firtina'] },
  { id: 564,  name: 'Başakşehir',            country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/564.png',  aliases: ['basaksehir', 'istanbul basaksehir', 'ibfk'] },
  { id: 994,  name: 'Göztepe',               country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/994.png',  aliases: ['goztepe'] },
  { id: 1002, name: 'Sivasspor',              country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/1002.png', aliases: ['sivas'] },
  { id: 3563, name: 'Adana Demirspor',        country: 'Türkiye', source: 'af', logo: 'https://media.api-sports.io/football/teams/3563.png', aliases: ['adana', 'demirspor'] },
  // ── MLS (API Football IDs, source: 'af') ───────────────────────────────────
  { id: 1616, name: 'Los Angeles FC',         country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1616.png', aliases: ['lafc', 'la fc', 'black and gold'] },
  { id: 1605, name: 'LA Galaxy',              country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1605.png', aliases: ['galaxy', 'la galaxy', 'los angeles galaxy', 'lag'] },
  { id: 9568, name: 'Inter Miami CF',         country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/9568.png', aliases: ['inter miami', 'miami', 'imcf', 'herons'] },
  { id: 1608, name: 'Atlanta United FC',      country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1608.png', aliases: ['atlanta united', 'atlanta', 'aufc', 'five stripes'] },
  { id: 1604, name: 'New York City FC',       country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1604.png', aliases: ['nycfc', 'nyc fc', 'new york city'] },
  { id: 1602, name: 'New York Red Bulls',     country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1602.png', aliases: ['ny red bulls', 'nyrb', 'red bulls'] },
  { id: 1595, name: 'Seattle Sounders',       country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1595.png', aliases: ['seattle sounders fc', 'sounders', 'ssfc'] },
  { id: 1617, name: 'Portland Timbers',       country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1617.png', aliases: ['portland', 'timbers', 'ptfc'] },
  { id: 1607, name: 'Chicago Fire',           country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1607.png', aliases: ['chicago fire fc', 'chicago', 'fire', 'cffc'] },
  { id: 1601, name: 'Toronto FC',             country: 'Canada', source: 'af', logo: 'https://media.api-sports.io/football/teams/1601.png', aliases: ['toronto', 'tfc', 'reds'] },
  { id: 1614, name: 'CF Montréal',            country: 'Canada', source: 'af', logo: 'https://media.api-sports.io/football/teams/1614.png', aliases: ['montreal', 'cf montreal', 'cfm', 'impact'] },
  { id: 1613, name: 'Columbus Crew',          country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1613.png', aliases: ['columbus', 'crew'] },
  { id: 1609, name: 'New England Revolution', country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1609.png', aliases: ['new england', 'revs', 'revolution', 'ne revs'] },
  { id: 1599, name: 'Philadelphia Union',     country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1599.png', aliases: ['philly union', 'philadelphia', 'union', 'phfu'] },
  { id: 1615, name: 'DC United',              country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1615.png', aliases: ['dc united', 'dcu', 'dc'] },
  { id: 2242, name: 'FC Cincinnati',          country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/2242.png', aliases: ['cincinnati', 'fcc', 'fc cincy'] },
  { id: 1606, name: 'Real Salt Lake',         country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1606.png', aliases: ['salt lake', 'rsl'] },
  { id: 1610, name: 'Colorado Rapids',        country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1610.png', aliases: ['colorado', 'rapids'] },
  { id: 1611, name: 'Sporting Kansas City',   country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1611.png', aliases: ['sporting kc', 'skc', 'kansas city'] },
  { id: 1612, name: 'Minnesota United FC',    country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1612.png', aliases: ['minnesota united', 'minnesota', 'mnufc', 'loons'] },
  { id: 1603, name: 'Vancouver Whitecaps',    country: 'Canada', source: 'af', logo: 'https://media.api-sports.io/football/teams/1603.png', aliases: ['vancouver whitecaps fc', 'whitecaps', 'caps', 'vwfc'] },
  { id: 1598, name: 'Orlando City SC',        country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1598.png', aliases: ['orlando city', 'orlando', 'ocsc', 'lions'] },
  { id: 9569, name: 'Nashville SC',           country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/9569.png', aliases: ['nashville', 'nsc', 'boys in gold'] },
  { id: 1596, name: 'San Jose Earthquakes',   country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1596.png', aliases: ['san jose', 'earthquakes', 'quakes', 'sjeq'] },
  { id: 16489,name: 'Austin FC',              country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/16489.png', aliases: ['austin', 'verde'] },
  { id: 18310,name: 'Charlotte FC',           country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/18310.png', aliases: ['charlotte', 'clt fc'] },
  { id: 20787,name: 'St. Louis City SC',      country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/20787.png', aliases: ['st louis city', 'stlcsc', 'st. louis'] },
  { id: 1600, name: 'Houston Dynamo',         country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1600.png', aliases: ['houston', 'dynamo'] },
  { id: 1597, name: 'FC Dallas',              country: 'USA',    source: 'af', logo: 'https://media.api-sports.io/football/teams/1597.png', aliases: ['dallas', 'fc dallas', 'burn'] },
  // ── K League 1 (API Football IDs, source: 'af') ────────────────────────────
  // name = full official display name; fotmobSearch = short query that FotMob can actually find
  { id: 2762, name: 'Jeonbuk Hyundai Motors FC', country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2762.png', fotmobSearch: 'Jeonbuk', aliases: ['jeonbuk', 'jeonbuk motors', 'jeonbuk fc', 'green warriors'] },
  { id: 2767, name: 'Ulsan HD FC',           country: 'South Korea', source: 'af', logo: 'https://images.fotmob.com/image_resources/logo/teamlogo/133896_small.png', fotmobSearch: 'Ulsan HD', aliases: ['ulsan', 'ulsan hd fc', 'ulsan hyundai', 'tigers'] },
  { id: 2766, name: 'FC Seoul',              country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2766.png', aliases: ['seoul', 'super match'] },
  { id: 2764, name: 'Pohang Steelers',       country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2764.png', aliases: ['pohang', 'steelers'] },
  { id: 2747, name: 'Daegu FC',              country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2747.png', aliases: ['daegu'] },
  { id: 2746, name: 'Gangwon FC',            country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2746.png', aliases: ['gangwon'] },
  { id: 2763, name: 'Incheon United FC',     country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2763.png', fotmobSearch: 'Incheon United', aliases: ['incheon', 'incheon united'] },
  { id: 2750, name: 'Daejeon Hana Citizen',  country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2750.png', fotmobSearch: 'Daejeon', aliases: ['daejeon', 'daejeon citizen', 'hana citizen'] },
  { id: 2759, name: 'Gwangju FC',            country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2759.png', aliases: ['gwangju'] },
  { id: 2761, name: 'Jeju SK',               country: 'South Korea', source: 'af', logo: 'https://images.fotmob.com/image_resources/logo/teamlogo/133898_small.png', fotmobSearch: 'Jeju SK', aliases: ['jeju', 'jeju united', 'jeju united fc', 'jeju sk'] },
  { id: 2765, name: 'Suwon Samsung Bluewings', country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2765.png', fotmobSearch: 'Suwon Bluewings', aliases: ['suwon bluewings', 'suwon samsung', 'bluewings'] },
  { id: 2768, name: 'Gimcheon Sangmu FC',    country: 'South Korea', source: 'af', logo: 'https://media.api-sports.io/football/teams/2768.png', fotmobSearch: 'Gimcheon Sangmu', aliases: ['gimcheon', 'sangmu', 'gimcheon sangmu'] },
  { id: 0,    name: 'Suwon FC',              country: 'South Korea', source: 'af', logo: 'https://images.fotmob.com/image_resources/logo/teamlogo/187951_small.png', fotmobSearch: 'Suwon FC', aliases: ['suwon', 'suwon city', 'suwon city fc'] },
  { id: 0,    name: 'Bucheon FC 1995',       country: 'South Korea', source: 'af', logo: 'https://images.fotmob.com/image_resources/logo/teamlogo/429441_small.png', fotmobSearch: 'Bucheon FC', aliases: ['bucheon', 'bucheon 1995', 'bucheon fc'] },
  { id: 0,    name: 'FC Anyang',             country: 'South Korea', source: 'af', logo: 'https://images.fotmob.com/image_resources/logo/teamlogo/429440_small.png', fotmobSearch: 'FC Anyang', aliases: ['anyang'] },
  // ── J1 League (API Football IDs, source: 'af') ─────────────────────────────
  { id: 289,  name: 'Vissel Kobe',            country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/289.png',  aliases: ['kobe', 'vissel'] },
  { id: 287,  name: 'Urawa Red Diamonds',     country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/287.png',  aliases: ['urawa', 'red diamonds', 'urawa reds'] },
  { id: 293,  name: 'Gamba Osaka',            country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/293.png',  aliases: ['gamba', 'gamba osaka'] },
  { id: 290,  name: 'Kashima Antlers',        country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/290.png',  aliases: ['kashima', 'antlers'] },
  { id: 291,  name: 'Cerezo Osaka',           country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/291.png',  aliases: ['cerezo'] },
  { id: 294,  name: 'Kawasaki Frontale',      country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/294.png',  aliases: ['kawasaki', 'frontale'] },
  { id: 296,  name: 'Yokohama F. Marinos',    country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/296.png',  aliases: ['yokohama', 'marinos', 'f marinos'] },
  { id: 282,  name: 'Sanfrecce Hiroshima',    country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/282.png',  aliases: ['hiroshima', 'sanfrecce'] },
  { id: 288,  name: 'Nagoya Grampus',         country: 'Japan', source: 'af', logo: 'https://media.api-sports.io/football/teams/288.png',  aliases: ['nagoya', 'grampus'] },
  // ── Belgian Pro League (API Football IDs, source: 'af') ────────────────────
  { id: 569,  name: 'Club Brugge KV',         country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/569.png',  aliases: ['club brugge', 'brugge', 'blauw-zwart'] },
  { id: 554,  name: 'RSC Anderlecht',         country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/554.png',  aliases: ['anderlecht', 'rsca', 'paars-wit'] },
  { id: 733,  name: 'Standard Liège',         country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/733.png',  aliases: ['standard', 'standard liege', 'les rouches'] },
  { id: 631,  name: 'KAA Gent',               country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/631.png',  aliases: ['gent', 'aa gent', 'buffalo'] },
  { id: 1393, name: 'Union Saint-Gilloise',   country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/1393.png', aliases: ['union', 'saint-gilloise', 'usg', 'union st gilloise'] },
  { id: 742,  name: 'KRC Genk',               country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/742.png',  aliases: ['genk', 'racing genk'] },
  { id: 740,  name: 'Antwerp',                country: 'Belgium', source: 'af', logo: 'https://media.api-sports.io/football/teams/740.png',  aliases: ['royal antwerp', 'rafc'] },
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function searchLocalTeams(query: string): Array<{
  team: { id: number; name: string; country: string; logo: string; source?: 'af'; fotmobSearch?: string }
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
        ...(team.source ? { source: team.source } : {}),
        ...(team.fotmobSearch ? { fotmobSearch: team.fotmobSearch } : {}),
      },
      venue: { name: '', city: '' },
    }))
}
