export interface PositionalRequirement {
  position: string
  positionCode: string // API Football position code: Goalkeeper, Defender, Midfielder, Attacker
  profileLabel: string
  tacticalDescription: string
  keyStats: string[]
  mustHave: string[]
  niceToHave: string[]
  avoidIf: string[]
}

export interface ManagerProfile {
  id: string
  name: string
  nationality: string
  currentClub: string
  formations: string[]
  style: {
    pressing: 'low' | 'medium' | 'high' | 'gegenpressing'
    defensiveLine: 'deep' | 'medium' | 'high' | 'very_high'
    buildUp: 'direct' | 'short_passing' | 'positional' | 'counter_attack' | 'possession'
    width: 'narrow' | 'balanced' | 'wide'
    tempo: 'slow' | 'medium' | 'fast' | 'very_fast'
    attackingMentality: 'defensive' | 'balanced' | 'attacking' | 'very_attacking'
  }
  tacticalSummary: string
  keyPrinciples: string[]
  positionalRequirements: PositionalRequirement[]
}

const managers: ManagerProfile[] = [
  {
    id: 'ange-postecoglou',
    name: 'Ange Postecoglou',
    nationality: 'Australian',
    currentClub: 'Free Agent',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'very_high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'Ange plays a relentless, high-energy, high-line system. His teams press aggressively from the front, defend incredibly high up the pitch, and attack with speed and directness through wide areas. The high defensive line means center-backs must be extremely fast to cover the space in behind. His teams accept the risk of being countered and compensate with pace, intensity, and smart pressing triggers. Midfielders are expected to cover enormous ground in both directions.',
    keyPrinciples: [
      'Permanent high defensive line — pace in CB is non-negotiable',
      'Aggressive press from the front, initiated by the striker and wingers',
      'Fast vertical transitions — attack quickly after winning the ball',
      'Wide, attacking fullbacks who push high and overlap',
      'Midfield trio must cover ground — at least one box-to-box engine',
      'Wingers cut inside to shoot; fullbacks provide the width',
      'goalkeeper must be comfortable playing out from the back',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Pace-First Ball-Playing CB',
        tacticalDescription:
          'The most critical position in Ange\'s system. With the defensive line pushed extremely high, the CB must have elite pace to sprint back and cover the space in behind when opponents play over the top. They also need to be calm on the ball as they are regularly pressed in build-up. Think Micky van de Ven — explosive recovery speed combined with composure.',
        keyStats: ['pace', 'acceleration', 'aerial_duels', 'interceptions', 'long_balls'],
        mustHave: ['Elite sprint speed (85+ pace equivalent)', 'Good 1v1 defending', 'Comfortable on the ball under pressure', 'Strong positional awareness'],
        niceToHave: ['Left-foot ability for left CB', 'Ability to carry ball forward', 'Leadership qualities'],
        avoidIf: ['Slow recovery speed', 'Poor under pressure in build-up', 'Hesitant in 1v1 situations'],
      },
      {
        position: 'Fullback',
        positionCode: 'Defender',
        profileLabel: 'Attacking Overlapping Fullback',
        tacticalDescription:
          'Ange\'s fullbacks are essentially wide midfielders who also defend. They push extremely high, provide width, deliver crosses, and are expected to get into the box. They need the stamina to cover 90 minutes of relentless up-and-down running. Defensively, they need to be alert to transitions given the high line.',
        keyStats: ['stamina', 'crossing', 'pace', 'dribbling', 'defensive_work_rate'],
        mustHave: ['High stamina and work rate', 'Good crossing ability', 'Pace to get forward and track back', 'Defensive discipline in 1v1s'],
        niceToHave: ['Ability to cut inside and shoot', 'Good link-up play in tight spaces', 'Set piece delivery'],
        avoidIf: ['Low stamina or work rate', 'Poor defensively in 1v1s', 'Slow recovery pace'],
      },
      {
        position: 'Central Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Engine',
        tacticalDescription:
          'Ange\'s midfield trio needs at least one box-to-box midfielder who can cover enormous ground, press relentlessly, support attacks, and also track back to help defensively. They don\'t need to be creative — they need to be a dynamo of work rate and intelligent positioning.',
        keyStats: ['stamina', 'work_rate', 'interceptions', 'passing', 'pressing_intensity'],
        mustHave: ['Elite stamina', 'High defensive contribution (tackles/interceptions)', 'Good short passing', 'Ability to press for 90 minutes'],
        niceToHave: ['Goals from midfield runs', 'Progressive carrying', 'Leadership on the pitch'],
        avoidIf: ['Low work rate', 'Inability to press', 'Poor defensive contribution'],
      },
      {
        position: 'Attacking Midfielder / #10',
        positionCode: 'Midfielder',
        profileLabel: 'Creative Progressive Midfielder',
        tacticalDescription:
          'In a 4-3-3, Ange needs a midfielder who provides creativity and forward runs between the lines. This player links midfield to attack, finds pockets of space, and drives the team\'s attacking play with incisive passing and late runs into the box.',
        keyStats: ['key_passes', 'through_balls', 'dribbles', 'assists', 'progressive_passes'],
        mustHave: ['Creative passing ability', 'Good movement between the lines', 'Technical quality under pressure', 'Decent work rate (must be willing to press)'],
        niceToHave: ['Goals from late runs', 'Set piece ability', 'Vision for killer through-balls'],
        avoidIf: ['Low work rate / unwilling to press', 'Purely defensive profile', 'Slow in tight spaces'],
      },
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Direct Cutting Inside Winger',
        tacticalDescription:
          'Ange\'s wingers are asked to run at defenders, cut inside onto their stronger foot, and either shoot or play through the middle. They also contribute to pressing from the front. Pace and directness are essential — this is not a system for slow, technical wingers who hold the ball.',
        keyStats: ['pace', 'dribbling', 'goals', 'shots_on_target', 'pressing_duels'],
        mustHave: ['High pace and acceleration', 'Direct dribbling style', 'Willingness to shoot', 'Press from the front'],
        niceToHave: ['Strong finishing (for goals from inside the box)', 'Ability to play both wings', 'Set piece delivery'],
        avoidIf: ['Slow or ponderous in possession', 'Low pressing contribution', 'Purely wide / crossing profile (Ange prefers cutters)'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Press-Initiating Mobile Striker',
        tacticalDescription:
          'The striker in Ange\'s system sets the tone for the whole team\'s press. They must be the first to hunt the ball when the opposition has it, close down CBs, and force mistakes. They also need to be a goal threat. A big, slow target man is the wrong fit — Ange needs a mobile striker who works hard and combines the press with goalscoring.',
        keyStats: ['goals', 'pressing_duels', 'pace', 'shots', 'off_ball_movement'],
        mustHave: ['Willingness to press and work without the ball', 'Mobility and pace', 'Decent finishing'],
        niceToHave: ['Hold-up play for quick combinations', 'Link-up with wingers', 'Heading ability for set pieces'],
        avoidIf: ['Static / non-pressing striker', 'Very slow or lacking mobility', 'Purely aerial / target man profile'],
      },
    ],
  },
  {
    id: 'pep-guardiola',
    name: 'Pep Guardiola',
    nationality: 'Spanish',
    currentClub: 'Manchester City',
    formations: ['4-3-3', '3-2-4-1', '4-2-3-1', '3-4-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Guardiola\'s positional play (juego de posición) is about controlling space, not just the ball. His teams manipulate the opposition\'s defensive structure by creating overloads, exploiting half-spaces, and using rotations to confuse the press. Every player must be technically excellent, tactically intelligent, and capable of playing in multiple positions. The system demands high footballing IQ above all else.',
    keyPrinciples: [
      'Control half-spaces with inverted wingers and attacking midfielders',
      'Fullbacks invert into midfield to create overloads (false fullbacks)',
      'Goalkeeper is the 11th outfield player — must be elite with their feet',
      'Slow, deliberate build-up to draw the press, then quick vertical pass',
      'High defensive line — CB pace required but footballing IQ is the priority',
      'Striker drops deep to link play or holds to create space for runners',
      'Positional rotations — all players must understand spatial relationships',
    ],
    positionalRequirements: [
      {
        position: 'Goalkeeper',
        positionCode: 'Goalkeeper',
        profileLabel: 'Sweeper Keeper / Elite Ball-Player',
        tacticalDescription:
          'Guardiola\'s goalkeeper is almost a third center-back. They must be comfortable as the first building block of every attack, capable of playing sharp passes under pressure, reading the game to sweep behind the high defensive line, and distributing precisely to the correct feet. Shot-stopping is secondary to technical and positional attributes.',
        keyStats: ['passes_completed', 'long_balls', 'sweeping', 'distribution_accuracy'],
        mustHave: ['Elite ball distribution (both short and long)', 'Commanding presence in sweeping', 'High footballing IQ', 'Comfort under pressing'],
        niceToHave: ['Leadership to organize the defensive line', 'Good shot-stopping for 1v1 situations'],
        avoidIf: ['Poor with feet', 'Uncomfortable when pressed on the ball', 'Does not sweep proactively'],
      },
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Ball-Playing Intelligent CB',
        tacticalDescription:
          'Guardiola\'s CBs are expected to be the first playmakers — comfortable receiving under pressure, playing through the press with short passes, and occasionally carrying the ball forward. Footballing intelligence and composure on the ball are prioritized over pace (though pace helps). They must read the game excellently to hold the high line.',
        keyStats: ['pass_accuracy', 'progressive_passes', 'aerial_duels', 'interceptions', 'tackles'],
        mustHave: ['Excellent passing range and accuracy', 'High footballing IQ', 'Composure under pressure', 'Strong aerial presence'],
        niceToHave: ['Pace for high defensive line', 'Ability to carry ball forward', 'Leadership and communication'],
        avoidIf: ['Poor technical ability on the ball', 'Panics under press', 'Low footballing intelligence'],
      },
      {
        position: 'Fullback (False / Inverted)',
        positionCode: 'Defender',
        profileLabel: 'Inverted / False Fullback',
        tacticalDescription:
          'One of the most unique positions in Guardiola\'s system. The fullbacks often invert into central midfield to create numerical overloads, rather than overlapping wide. They need to be technically excellent, understand spacing, and act almost as a central midfielder. Exceptional footballing IQ required.',
        keyStats: ['pass_accuracy', 'key_passes', 'interceptions', 'progressive_passes', 'dribbles'],
        mustHave: ['Elite technical quality', 'High positional intelligence', 'Comfortable in tight central spaces', 'Good pressing and defensive work rate'],
        niceToHave: ['Ability to play as CM if needed', 'Late runs into the box', 'Set piece delivery'],
        avoidIf: ['Purely traditional wide fullback', 'Low footballing IQ', 'Uncomfortable in central spaces'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Pivot / Regista',
        tacticalDescription:
          'The pivot sits at the base of midfield and is the conductor of City\'s build-up. They receive the ball constantly between the lines, distribute quickly and accurately, protect the defense, and maintain positional discipline. Rodri is the archetype — dominant physically, elite passer, excellent reader of the game.',
        keyStats: ['pass_accuracy', 'progressive_passes', 'interceptions', 'tackles', 'aerial_duels'],
        mustHave: ['Elite passing ability (short and long)', 'Excellent positional discipline', 'Strong in duels and defensive contribution', 'High footballing IQ'],
        niceToHave: ['Ability to progress the ball by carrying', 'Long-range shooting', 'Leadership'],
        avoidIf: ['Poor passer under pressure', 'Lacks discipline positionally', 'Low defensive contribution'],
      },
      {
        position: 'Attacking Midfielder / #8',
        positionCode: 'Midfielder',
        profileLabel: 'Half-Space Exploiter',
        tacticalDescription:
          'Guardiola\'s #8s are some of the most complex players in football. They must understand spacing, make late runs into the box, press high, carry the ball, link play, and score. They occupy the half-spaces between fullback and center-back to create overloads. KDB and Gündogan were the blueprint.',
        keyStats: ['key_passes', 'progressive_carries', 'goals', 'assists', 'dribbles'],
        mustHave: ['Elite footballing intelligence', 'Technical quality in tight spaces', 'Goals and assists from midfield', 'High work rate'],
        niceToHave: ['Long-range shooting', 'Set piece delivery', 'Versatility across multiple positions'],
        avoidIf: ['Low footballing IQ', 'Poor technical ability under pressure', 'Does not contribute defensively'],
      },
      {
        position: 'Winger (Inverted)',
        positionCode: 'Attacker',
        profileLabel: 'Inverted Winger / Inside Forward',
        tacticalDescription:
          'Guardiola\'s wingers cut inside to occupy the half-spaces, shoot, and create overloads centrally. They drift inside rather than running the line. Think Sané, Mahrez, Bernardo — technically brilliant, can play in tight spaces, and are a constant goal/assist threat from inside the opposition\'s defensive block.',
        keyStats: ['goals', 'assists', 'dribbles', 'shots', 'key_passes'],
        mustHave: ['High technical quality', 'Ability to play in tight central spaces', 'Goals and assists output', 'Good pressing work rate'],
        niceToHave: ['Versatility across multiple attacking positions', 'Set piece delivery', 'Pace to beat defenders'],
        avoidIf: ['Purely wide / crossing profile', 'Low technical ability', 'Does not track back / press'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Physical Goal Machine / False Nine',
        tacticalDescription:
          'Guardiola can play with a false nine (dropping deep to create space) or a true striker. With Haaland, the system adapted to use a physically dominant goal-scorer who holds the line and attacks the box. Without Haaland, Guardiola prefers a false nine who disrupts defensive lines by dropping. Either way, finishing is non-negotiable.',
        keyStats: ['goals', 'shots_on_target', 'aerial_duels', 'hold_up_play', 'movement'],
        mustHave: ['Elite finishing', 'Intelligent movement in the box', 'Willingness to press when needed'],
        niceToHave: ['Hold-up play for link play', 'Aerial threat at set pieces', 'Versatility to play as false nine'],
        avoidIf: ['Poor finishing', 'Unwilling to work without the ball', 'Static movement'],
      },
    ],
  },
  {
    id: 'mikel-arteta',
    name: 'Mikel Arteta',
    nationality: 'Spanish',
    currentClub: 'Arsenal',
    formations: ['4-3-3', '4-2-3-1', '3-4-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Arteta\'s Arsenal plays a structured positional game with intense pressing and a very high defensive line. The system is built on intelligent build-up from the back, overloading wide areas with overlapping fullbacks, and converting possession into direct, incisive attacks. He demands high footballing IQ, technical quality, and relentless pressing from every player. Set pieces are also a major weapon.',
    keyPrinciples: [
      'High defensive line and aggressive pressing to win the ball high up the pitch',
      'Fullbacks push high and wide to create overloads on the flanks',
      'Inverted wingers cut inside to shoot from the half-space',
      'Deep pivot protects the high defensive line and recycles possession',
      'Build-up from the back — GK and CBs start every attack',
      'Structured positional play in attack — no individualism without purpose',
      'Deadly from set pieces — major source of goals',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Dominant Ball-Playing CB',
        tacticalDescription:
          'Arteta needs CBs who can play out from the back, handle pressure in tight spaces, and dominate aerially. The high line demands reasonable pace, but composure and leadership are equally important. White and Gabriel set the standard — different profiles but both technically excellent.',
        keyStats: ['pass_accuracy', 'aerial_duels', 'interceptions', 'tackles', 'progressive_passes'],
        mustHave: ['Technical quality on the ball', 'Physical presence in aerial duels', 'Composure under pressure', 'Good positioning for the high line'],
        niceToHave: ['Pace to cover behind', 'Leadership and organizing ability', 'Ability to carry the ball'],
        avoidIf: ['Poor under pressure in build-up', 'Weak aerial ability', 'Low defensive contribution'],
      },
      {
        position: 'Left Back (Attacking)',
        positionCode: 'Defender',
        profileLabel: 'Attacking Overlapping Left Back',
        tacticalDescription:
          'Arsenal\'s left back (Zinchenko / Tierney profile) is one of the most active players in the system. They push high, provide width, deliver crosses, and sometimes invert into midfield (Zinchenko\'s role). Technical quality, stamina, and the ability to play in multiple positions is key.',
        keyStats: ['crossing', 'progressive_carries', 'stamina', 'key_passes', 'tackles'],
        mustHave: ['High work rate and stamina', 'Good crossing and delivery', 'Comfortable on the ball', 'Decent defensive 1v1s'],
        niceToHave: ['Ability to invert into midfield', 'Set piece delivery', 'Leadership'],
        avoidIf: ['Low stamina', 'Poor crossing', 'Uncomfortable on the ball under pressure'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Deep-Lying Playmaker / Protector',
        tacticalDescription:
          'Arteta\'s pivot (Thomas Partey model) needs to protect the defense when the fullbacks push forward, recycle possession intelligently, and occasionally drive the team forward with progressive passing. Physicality and ball-winning alongside technical quality.',
        keyStats: ['interceptions', 'tackles', 'pass_accuracy', 'progressive_passes', 'aerial_duels'],
        mustHave: ['Elite defensive contribution (tackles/interceptions)', 'Good passing accuracy', 'Physical presence in duels', 'Positional discipline'],
        niceToHave: ['Ability to progress the ball by carrying', 'Long-range shooting', 'Leadership'],
        avoidIf: ['Poor defensive work rate', 'Gets caught out of position', 'Poor passer under pressure'],
      },
      {
        position: 'Attacking Midfielder / #8',
        positionCode: 'Midfielder',
        profileLabel: 'Dynamic Goal-Scoring Midfielder',
        tacticalDescription:
          'Arteta\'s #8s (Odegaard, Rice) combine creative quality with significant defensive contribution. They need to score, assist, press, and cover ground. Odegaard as the creative playmaker and Rice as the all-action engine are the ideal combination. Need both profiles covered.',
        keyStats: ['goals', 'assists', 'key_passes', 'interceptions', 'progressive_carries'],
        mustHave: ['Goals and assists from midfield', 'High work rate and pressing', 'Technical quality', 'Late runs into the box'],
        niceToHave: ['Set piece delivery', 'Long-range shooting', 'Versatility across positions'],
        avoidIf: ['Does not contribute defensively', 'Low work rate', 'Poor under pressure'],
      },
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Inverted Wide Forward',
        tacticalDescription:
          'Saka and Martinelli set the template for Arsenal wingers — direct, hard-working, direct dribblers who cut inside, shoot, and also track back to press. They need to contribute defensively, not just attack. Pace and directness are essential; technical quality and end product are critical.',
        keyStats: ['goals', 'assists', 'dribbles', 'pace', 'key_passes'],
        mustHave: ['Pace and directness', 'Goals and assists output', 'Defensive work rate', 'Technical quality to cut inside'],
        niceToHave: ['Set piece delivery', 'Versatility (can play either wing)', 'Good crossing for wider moments'],
        avoidIf: ['Low work rate / defensive contribution', 'Slow', 'Purely holding wide without cutting inside'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Intelligent Striker',
        tacticalDescription:
          'Arteta wants a striker who occupies defenders cleverly, moves intelligently to create space for arriving midfielders, and scores reliably. Havertz showed that a technically gifted, mobile striker suits this system. A pure target man is a bad fit — needs movement and link-up play.',
        keyStats: ['goals', 'hold_up_play', 'shots_on_target', 'key_passes', 'aerial_duels'],
        mustHave: ['Intelligent movement to create space', 'Clinical finishing', 'Hold-up play to link with midfielders', 'Willingness to press'],
        niceToHave: ['Aerial threat for set pieces', 'Assists / creative contribution', 'Pace to run in behind'],
        avoidIf: ['Static / non-mobile', 'Unwilling to press', 'Poor link-up ability'],
      },
    ],
  },
  {
    id: 'arne-slot',
    name: 'Arne Slot',
    nationality: 'Dutch',
    currentClub: 'Liverpool',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Slot has maintained much of Klopp\'s high-energy identity at Liverpool while adding more tactical structure and positional discipline. His system is built on compact shape, intelligent pressing triggers, and fast transitions. He values technical quality slightly more than pure intensity compared to Klopp, and his teams tend to be more defensively organized.',
    keyPrinciples: [
      'Organized press with clear triggers — not wild chasing but structured hunting',
      'High defensive line requires pace in defense',
      'Quick vertical transitions after winning possession',
      'Midfielders must contribute both defensively and in attack',
      'Wide forwards press the opposition fullbacks aggressively',
      'Build-up from the back — technically competent defenders required',
      'Compact shape out of possession — difficult to play through',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Composed Pacey CB',
        tacticalDescription:
          'Liverpool\'s CBs need pace to cover the high line and the technical ability to play out from the back. They must be calm under pressure, dominant in aerial duels, and capable of reading the game intelligently. Van Dijk\'s aerial dominance combined with pace is the ideal profile.',
        keyStats: ['aerial_duels', 'pace', 'interceptions', 'pass_accuracy', 'tackles'],
        mustHave: ['Good pace for high defensive line', 'Excellent aerial ability', 'Comfortable building from the back', 'Strong in 1v1 defending'],
        niceToHave: ['Leadership and organization', 'Ability to carry ball forward', 'Long-range distribution'],
        avoidIf: ['Slow recovery pace', 'Poor aerial ability', 'Weak under pressure on the ball'],
      },
      {
        position: 'Fullback',
        positionCode: 'Defender',
        profileLabel: 'Dynamic Attacking Fullback',
        tacticalDescription:
          'Like Klopp before him, Slot\'s fullbacks (Trent / Robertson profile) are crucial attacking outlets. They push high, deliver crosses and through balls, and are expected to contribute significantly to the team\'s creativity. Trent Alexander-Arnold moves into midfield, which is a defining feature.',
        keyStats: ['assists', 'crossing', 'progressive_passes', 'pace', 'stamina'],
        mustHave: ['High creative output (assists/key passes)', 'Stamina to cover the flank', 'Quality delivery from wide areas', 'Defensive awareness'],
        niceToHave: ['Ability to invert into midfield', 'Set piece delivery', 'Long-range shooting'],
        avoidIf: ['Low creative contribution', 'Purely defensive profile', 'Low stamina'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Press-Resistant Pivot',
        tacticalDescription:
          'Slot\'s midfield needs a player who can control the tempo from deep, protect the defense, and press intelligently. They need to be press-resistant — able to receive the ball in tight spaces and play out. Physically strong with excellent awareness.',
        keyStats: ['pass_accuracy', 'interceptions', 'tackles', 'progressive_passes', 'dribbles'],
        mustHave: ['Good passing under pressure', 'Strong defensive contribution', 'Ability to control tempo', 'High work rate'],
        niceToHave: ['Carrying ability to break lines', 'Late runs into the box', 'Leadership'],
        avoidIf: ['Gives the ball away under pressure', 'Low defensive work rate', 'Gets caught out of position'],
      },
      {
        position: 'Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Direct Press-Winning Winger',
        tacticalDescription:
          'Liverpool\'s wide forwards (Salah / Diaz / Gakpo profile) must press relentlessly, track back, and be a constant goal threat. They need direct pace and an end product. Salah\'s goal and assist record combined with pressing is the gold standard, but also versatility across both wings is valued.',
        keyStats: ['goals', 'assists', 'pace', 'pressing_duels', 'dribbles'],
        mustHave: ['High goal/assist output', 'Pace and directness', 'Pressing contribution', 'Defensive tracking back'],
        niceToHave: ['Versatility across both wings', 'Hold-up play for link-up', 'Set piece ability'],
        avoidIf: ['Low defensive work rate', 'Slow', 'Poor end product'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Pressing Intelligent Striker',
        tacticalDescription:
          'Liverpool\'s striker initiates the press and must be a constant threat in behind. They need to combine pressing intensity with clinical finishing. Nuñez is the current example — explosive pace, willing worker, directness. A slow or passive striker doesn\'t fit.',
        keyStats: ['goals', 'pace', 'pressing_duels', 'shots', 'runs_in_behind'],
        mustHave: ['Pace and explosive movement', 'Willingness to press from the front', 'Clinical finishing', 'Good off-ball movement'],
        niceToHave: ['Aerial ability for set pieces', 'Link-up with wingers', 'Dribbling in tight areas'],
        avoidIf: ['Slow or passive off the ball', 'Unwilling to press', 'Low goal contribution'],
      },
    ],
  },
  {
    id: 'ruben-amorim',
    name: 'Ruben Amorim',
    nationality: 'Portuguese',
    currentClub: 'Free Agent',
    formations: ['3-4-2-1', '3-5-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Amorim is married to his 3-4-2-1 system. It\'s a structured, defensively organized system that transitions quickly into attack through the wing-backs. The three center-backs provide security while two #10-style players support the striker. Wing-backs are absolutely central to the system — they provide width, crosses, and defensive cover simultaneously. Players who can\'t adapt to this shape will not be used.',
    keyPrinciples: [
      'Non-negotiable 3-4-2-1 or 3-5-2 — every signing must fit this shape',
      'Wing-backs are the engine of the team — must have elite stamina and quality',
      'Three CBs allow more security but require three ball-playing defenders',
      'Two #10s operate between the lines, linking midfield to attack',
      'Single pivot protects the three CBs and distributes play',
      'Striker must hold the line and create space for the #10s',
      'Quick pressing to win the ball and transition fast',
    ],
    positionalRequirements: [
      {
        position: 'Wing-Back',
        positionCode: 'Defender',
        profileLabel: 'Elite Stamina Wing-Back',
        tacticalDescription:
          'The most important signing for any team playing Amorim\'s system. Wing-backs must run the entire flank for 90 minutes — defending as a back five, then instantly becoming wide midfielders and attackers when in possession. They need elite stamina, crossing ability, defensive quality, and pace. This is the hardest position to find.',
        keyStats: ['stamina', 'crossing', 'pace', 'tackles', 'assists'],
        mustHave: ['Elite stamina (must last 90 minutes at high intensity)', 'Good crossing and delivery', 'Defensive quality in 1v1s', 'Pace to get forward and track back'],
        niceToHave: ['Goals from forward runs', 'Set piece delivery', 'Ability to invert and shoot'],
        avoidIf: ['Low stamina or work rate', 'Poor crossing', 'Weak defensively', 'Does not want to track back'],
      },
      {
        position: 'Center Back (3-Back)',
        positionCode: 'Defender',
        profileLabel: 'Dominant CB for Three-Back',
        tacticalDescription:
          'Three center-backs are the defensive foundation. The central CB must be the dominant aerial presence and organizer. The two wide CBs need to be comfortable driving forward and covering wide areas when the wing-backs push up. All three need decent technical ability.',
        keyStats: ['aerial_duels', 'interceptions', 'tackles', 'pass_accuracy', 'pace'],
        mustHave: ['Strong in aerial duels', 'Good defensive positioning', 'Composure on the ball', 'Communication and leadership'],
        niceToHave: ['Pace for the wide CB positions', 'Ability to carry ball forward (wide CB)', 'Long distribution'],
        avoidIf: ['Poor aerial ability', 'Uncomfortable on the ball', 'Weak defensive positioning'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Single Pivot / Ball Winner',
        tacticalDescription:
          'In Amorim\'s 3-4-2-1, the single pivot is exposed if they are not disciplined. They must be a physical presence, excellent positional reader, and good enough on the ball to distribute quickly. They cover the space between the defense and the #10s.',
        keyStats: ['interceptions', 'tackles', 'pass_accuracy', 'aerial_duels', 'positional_discipline'],
        mustHave: ['Elite defensive work rate', 'Excellent positional discipline', 'Good passing under pressure', 'Physical presence'],
        niceToHave: ['Carries the ball to relieve pressure', 'Long-range shooting', 'Leadership'],
        avoidIf: ['Gets caught out of position', 'Poor defensive work rate', 'Bad passer under pressure'],
      },
      {
        position: 'Attacking Midfielder / #10',
        positionCode: 'Midfielder',
        profileLabel: 'Creative Linking #10',
        tacticalDescription:
          'Amorim plays two #10 positions behind the striker. These players need to be creative, find space between the lines, and be a constant link between midfield and attack. They must also contribute defensively when the team is without the ball. Goals from these positions are a bonus but the creativity is mandatory.',
        keyStats: ['key_passes', 'assists', 'dribbles', 'through_balls', 'goals'],
        mustHave: ['Creative passing and through balls', 'Good movement between the lines', 'Technical quality', 'Defensive work when out of possession'],
        niceToHave: ['Goals from late runs', 'Set piece involvement', 'Versatility to play wider'],
        avoidIf: ['No defensive contribution', 'Poor technical quality', 'Slow in tight spaces'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Hold-Up and Link Striker',
        tacticalDescription:
          'The lone striker in Amorim\'s system needs to hold the ball effectively to bring the #10s into play, score goals, and also join the press. They should be physically strong enough to hold up the ball, technically good enough to link play, and clinical enough to convert the chances they get.',
        keyStats: ['goals', 'hold_up_play', 'shots_on_target', 'aerial_duels', 'pressing_duels'],
        mustHave: ['Clinical finishing', 'Good hold-up play', 'Physical strength', 'Willingness to press'],
        niceToHave: ['Pace to run in behind', 'Link-up play with #10s', 'Aerial threat for set pieces'],
        avoidIf: ['Poor hold-up play', 'Unwilling to work hard without the ball', 'Low finishing quality'],
      },
    ],
  },
  {
    id: 'carlo-ancelotti',
    name: 'Carlo Ancelotti',
    nationality: 'Italian',
    currentClub: 'Brazil',
    formations: ['4-3-1-2', '4-4-2', '4-3-3'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'balanced',
      tempo: 'medium',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Ancelotti is a player-centric manager — he builds his system around his best players rather than imposing a rigid style. His teams are pragmatic, experienced, and dangerous on the counter. He trusts his elite players to make decisions, maintains a solid defensive shape, and creates chances through individual brilliance. Managing egos and getting the best from stars is his superpower.',
    keyPrinciples: [
      'System adapts to the players, not the other way around',
      'Trust elite players to perform — minimal rigid tactical constraints',
      'Solid defensive shape that transitions quickly into attack',
      'Counter-attack is a primary weapon — pace in forward positions critical',
      'Set pieces are important scoring opportunities',
      'Experienced, winner\'s mentality in the squad is valued',
      'Modric-style deep midfielder who controls tempo is central',
    ],
    positionalRequirements: [
      {
        position: 'Central Midfielder (Controller)',
        positionCode: 'Midfielder',
        profileLabel: 'Elegant Tempo Controller',
        tacticalDescription:
          'Real Madrid under Ancelotti needs a maestro in midfield — a player who controls the game\'s tempo, distributes with precision, and reads the game intelligently. Modric is the model. Not necessarily the most physical, but technically and mentally elite.',
        keyStats: ['pass_accuracy', 'key_passes', 'dribbles', 'vision', 'progressive_passes'],
        mustHave: ['Elite technical quality', 'Intelligent game reading', 'Excellent short and medium passing', 'Experience at the highest level'],
        niceToHave: ['Long-range shooting', 'Late runs into the box', 'Leadership'],
        avoidIf: ['Low footballing IQ', 'Poor under pressure technically', 'Lacks experience at top level'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'World-Class Goal Scorer',
        tacticalDescription:
          'Ancelotti needs a striker who scores goals consistently at the highest level. The system doesn\'t create huge volumes of chances — so conversion rate is critical. Benzema was the perfect model: goals, assists, intelligence, and ability to link. A pure poacher or a pure presser won\'t be enough.',
        keyStats: ['goals', 'shots_on_target', 'assists', 'hold_up_play', 'movement'],
        mustHave: ['Elite finishing', 'Good movement in the box', 'Experience in big games', 'Link-up play'],
        niceToHave: ['Assists and creative contribution', 'Aerial threat', 'Leadership in big moments'],
        avoidIf: ['Poor finishing rate', 'No experience at elite level', 'Purely pressing profile with low end product'],
      },
    ],
  },
  {
    id: 'diego-simeone',
    name: 'Diego Simeone',
    nationality: 'Argentine',
    currentClub: 'Atletico Madrid',
    formations: ['4-4-2', '5-3-2', '4-2-3-1'],
    style: {
      pressing: 'medium',
      defensiveLine: 'deep',
      buildUp: 'direct',
      width: 'narrow',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Simeone builds teams that are defensively unbreakable and dangerous on the counter. His teams are compact, physically ferocious, and mentally stronger than any opponent. They concede very little, defend their lead with organized aggression, and punish opposition mistakes with direct, fast counter-attacks. Individual talent matters less than collective mentality and physical commitment.',
    keyPrinciples: [
      'Defensive solidity first — shape before everything',
      'Compact mid/low defensive block — hard to break down',
      'Transition moments are the biggest attacking opportunity',
      'Direct vertical passing to counter-attack quickly',
      'Physical and mental toughness — winning duels is everything',
      'Striker holds the line to anchor counter-attacks',
      'Wide players track back and defend — no luxury of pure attackers',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Dominant Physical CB',
        tacticalDescription:
          'Simeone\'s CBs need to win every duel, dominate aerially, and defend with aggression. The high defensive line is not used here — so pace is less critical than physical dominance and defensive intelligence. Leadership and winning mentality are non-negotiable.',
        keyStats: ['aerial_duels', 'tackles', 'interceptions', 'clearances', 'blocks'],
        mustHave: ['Physical dominance in duels', 'Excellent aerial ability', 'Defensive intelligence', 'Strong mentality'],
        niceToHave: ['Reasonable passing to start counters', 'Leadership and communication', 'Experience under pressure'],
        avoidIf: ['Weak in physical duels', 'Poor aerial ability', 'Slow decision-making under pressure'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Warrior Midfielder',
        tacticalDescription:
          'The engine of Simeone\'s defensive machine. This player must win the ball, cover relentlessly, and protect the defensive structure. Koke and Herrera were key examples. Not necessarily creative — but their defensive contribution is elite.',
        keyStats: ['tackles', 'interceptions', 'aerial_duels', 'work_rate', 'clearances'],
        mustHave: ['Elite ball-winning ability', 'Relentless work rate', 'Physical presence', 'Defensive intelligence'],
        niceToHave: ['Simple passing to keep the ball', 'Pressing ability', 'Leadership'],
        avoidIf: ['Low work rate', 'Poor defensive contribution', 'Unwilling to fight for every ball'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Physical Counter-Attacking Striker',
        tacticalDescription:
          'Simeone\'s strikers need to hold the line for long periods, win duels against elite CBs, and then punish defenses on the counter. Suárez was the original — physical, direct, clinical when the chance comes. Must be mentally resilient and willing to fight.',
        keyStats: ['goals', 'aerial_duels', 'hold_up_play', 'shots_on_target', 'pace'],
        mustHave: ['Physical strength to hold the ball', 'Clinical finishing', 'Resilience and fighting mentality', 'Good counter-attack pace'],
        niceToHave: ['Aerial threat for set pieces', 'Link-up with wide players', 'Experience in high-pressure games'],
        avoidIf: ['Purely technical, non-physical profile', 'Low work rate', 'Mentally fragile'],
      },
    ],
  },
  {
    id: 'xabi-alonso',
    name: 'Xabi Alonso',
    nationality: 'Spanish',
    currentClub: 'Real Madrid',
    formations: ['3-4-3', '4-2-3-1', '3-5-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Alonso\'s Leverkusen became champions of Germany with a system that combines positional intelligence, quick transitions, and devastating late goals. His teams press intelligently, build from the back with composure, and attack with speed and variety. The system is flexible — able to switch between formations mid-game. Players need high footballing intelligence and the ability to execute under pressure.',
    keyPrinciples: [
      'Positional play — control the field, not just the ball',
      'Quick vertical transitions after winning possession',
      'Three-back system provides defensive security and wing-back dominance',
      'Flexible formations — players must understand multiple shapes',
      'Pressing in organized waves — not chaotic but structured',
      'Attacking threat from multiple positions, not just the striker',
      'Never give up mentally — famous for late goals',
    ],
    positionalRequirements: [
      {
        position: 'Wing-Back',
        positionCode: 'Defender',
        profileLabel: 'Dynamic Creative Wing-Back',
        tacticalDescription:
          'Leverkusen\'s wing-backs are vital to the system\'s width and attacking threat. Grimaldo on the left is the archetype — technically elite, dangerous with crosses and shots, and capable of covering the flank defensively. High stamina, creativity, and pace required.',
        keyStats: ['assists', 'crossing', 'pace', 'stamina', 'key_passes'],
        mustHave: ['High creative output', 'Elite stamina', 'Good pace', 'Solid defensive work'],
        niceToHave: ['Goals from forward runs', 'Set piece delivery', 'Versatility between full-back and midfielder'],
        avoidIf: ['Low stamina', 'Poor creative output', 'Weak defensively'],
      },
      {
        position: 'Attacking Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Creative Deep Attacker',
        tacticalDescription:
          'Granit Xhaka reinvented himself under Alonso — a deep-lying creator who drives the team forward with passing and presence. The role demands a player who can connect defense to attack, press when needed, and contribute to goals. High football intelligence is the core requirement.',
        keyStats: ['progressive_passes', 'key_passes', 'interceptions', 'dribbles', 'work_rate'],
        mustHave: ['High footballing intelligence', 'Excellent passing range', 'Good defensive contribution', 'Experience and composure'],
        niceToHave: ['Goals from late runs', 'Leadership', 'Long-range shooting'],
        avoidIf: ['Low footballing IQ', 'Poor passer under pressure', 'Weak defensive contribution'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Clinical Striker',
        tacticalDescription:
          'Boniface / Schick showed the type Alonso needs — mobile, clinical, and able to play in a system that doesn\'t always flood the box with support. Must be dangerous in the channels, good in the air for set pieces, and contribute to pressing.',
        keyStats: ['goals', 'shots_on_target', 'pace', 'hold_up_play', 'aerial_duels'],
        mustHave: ['Clinical finishing', 'Good movement in and around the box', 'Willingness to press', 'Physical presence'],
        niceToHave: ['Aerial threat', 'Assist contribution', 'Pace for counter-attacks'],
        avoidIf: ['Static striker', 'Unwilling to press', 'Poor finishing rate'],
      },
    ],
  },
  {
    id: 'roberto-de-zerbi',
    name: 'Roberto De Zerbi',
    nationality: 'Italian',
    currentClub: 'Free Agent',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'De Zerbi is one of the most exciting and demanding tacticians in the world. His system is pure positional play with extremely high pressing intensity. Players must be technically exceptional — he expects every player, including defenders, to be comfortable building from the back under intense pressure. His teams are thrilling to watch but require very specific technical profiles.',
    keyPrinciples: [
      'Positional superiority — always maintain a passing triangle nearby',
      'Goalkeeper plays as a fielder — elite distribution is mandatory',
      'Build from the back through short passes — direct play is not accepted',
      'Gegenpressing — immediately win the ball back after losing it',
      'Midfield and wide players make complex positional rotations',
      'Wing-backs/fullbacks are essential creators',
      'Very high defensive line — pace and intelligence in defense',
    ],
    positionalRequirements: [
      {
        position: 'Goalkeeper',
        positionCode: 'Goalkeeper',
        profileLabel: 'Technical Sweeper-Keeper',
        tacticalDescription:
          'De Zerbi\'s goalkeeper must be the best technical GK available. They play as an outfield player in build-up — receiving the ball in tight spaces, distributing with accuracy, and sweeping aggressively behind the high line. Shot-stopping is needed but the technical profile is the priority.',
        keyStats: ['distribution_accuracy', 'sweeping_actions', 'passes_completed', 'long_balls'],
        mustHave: ['Elite ball distribution', 'Aggressive sweeping behind the line', 'Comfort under pressing', 'High footballing IQ'],
        niceToHave: ['Good shot-stopping', 'Leadership and communication', 'Long-range distribution'],
        avoidIf: ['Poor with feet', 'Does not sweep proactively', 'Uncomfortable under pressure'],
      },
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Technical Ball-Playing CB',
        tacticalDescription:
          'Every CB in a De Zerbi system must be a footballer first, defender second. They will be regularly asked to receive the ball under pressure, play through it, and even drive forward. Pace is needed for the high line. Technical quality is non-negotiable.',
        keyStats: ['pass_accuracy', 'progressive_carries', 'interceptions', 'pace', 'dribbles'],
        mustHave: ['Elite technical quality on the ball', 'Comfortable under intense pressure', 'Good pace for high line', 'Defensive solidity'],
        niceToHave: ['Ability to carry ball into midfield', 'Long-range distribution', 'Leadership'],
        avoidIf: ['Poor technical quality', 'Uncomfortable under pressure', 'Slow recovery pace'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Technically Elite Pressing Midfielder',
        tacticalDescription:
          'De Zerbi\'s midfielders are the most technically demanding players in his system. They must understand spatial relationships, execute positional rotations, press immediately after losing the ball, and maintain quality under intense pressure. Low technical quality means no game time.',
        keyStats: ['pass_accuracy', 'key_passes', 'pressing_duels', 'dribbles', 'progressive_carries'],
        mustHave: ['Elite technical quality', 'Excellent positional understanding', 'Relentless pressing', 'Composure under pressure'],
        niceToHave: ['Goals and assists', 'Long-range shooting', 'Versatility across midfield positions'],
        avoidIf: ['Poor technical ability', 'Does not press', 'Low footballing IQ'],
      },
    ],
  },
  {
    id: 'antonio-conte',
    name: 'Antonio Conte',
    nationality: 'Italian',
    currentClub: 'Napoli',
    formations: ['3-5-2', '3-4-3', '5-3-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Conte is the master of the 3-5-2 and 3-4-3. His teams are physically imposing, extremely well-organized, and hard to beat. The wing-backs are central to his system — they must be among the best in the world at their job. Conte demands absolute commitment to his methods and his intensity is legendary. The system is rigid and well-rehearsed.',
    keyPrinciples: [
      'Non-negotiable 3-5-2 / 3-4-3 — players must fit the shape exactly',
      'Wing-backs are key to both attack and defense — elite required',
      'Double striker system — link-up between them is critical',
      'Three CBs are the defensive foundation — physical dominance required',
      'High work rate from every single player — no exceptions',
      'Quick direct counter-attacks through the wing-backs',
      'Strong defensive shape — very difficult to score against',
    ],
    positionalRequirements: [
      {
        position: 'Wing-Back',
        positionCode: 'Defender',
        profileLabel: 'World-Class Wing-Back',
        tacticalDescription:
          'Conte demands the best wing-backs available. They must excel in both defense and attack, run the entire flank for 90 minutes, and deliver quality crosses and assists. Perisic, Darmian, Hakimi — all showed different but equally elite profiles. This is non-negotiable.',
        keyStats: ['assists', 'crossing', 'tackles', 'stamina', 'pace'],
        mustHave: ['Elite stamina', 'High quality crossing and delivery', 'Strong 1v1 defensive ability', 'Pace and power'],
        niceToHave: ['Goals from forward runs', 'Set piece delivery', 'Leadership'],
        avoidIf: ['Low stamina', 'Weak crossing', 'Poor defensive quality', 'Low work rate'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Physical Link-Up Striker',
        tacticalDescription:
          'Conte\'s double striker system needs players who link up well together, work hard without the ball, and combine directness with hold-up play. Lukaku (power) + Lautaro (movement) was his ideal combination. They need to complement each other in physical profile.',
        keyStats: ['goals', 'hold_up_play', 'pace', 'aerial_duels', 'link_up_play'],
        mustHave: ['Strong hold-up play', 'Clinical finishing', 'Physical strength or pace', 'Willingness to press'],
        niceToHave: ['Aerial threat', 'Link-up with the second striker', 'Experience in high-pressure systems'],
        avoidIf: ['Purely technical non-physical profile', 'Low work rate', 'Unwilling to press'],
      },
      {
        position: 'Central Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'High-Energy Central Midfielder',
        tacticalDescription:
          'Conte\'s central midfielders must combine box-to-box energy with defensive responsibility. The team plays with narrow midfield, so these players need to cover enormous ground. Brozovic (distributor) and Barella (energy) showed the ideal combination of profiles.',
        keyStats: ['stamina', 'tackles', 'key_passes', 'progressive_carries', 'interceptions'],
        mustHave: ['High stamina and work rate', 'Good defensive contribution', 'Reasonable passing quality', 'Physical presence'],
        niceToHave: ['Goals from late runs', 'Creative passing', 'Leadership'],
        avoidIf: ['Low work rate', 'Poor defensive contribution', 'Inability to cover ground'],
      },
    ],
  },
  {
    id: 'unai-emery',
    name: 'Unai Emery',
    nationality: 'Spanish',
    currentClub: 'Aston Villa',
    formations: ['4-2-3-1', '4-3-3', '4-4-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'balanced',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Emery is one of the most detail-oriented managers in football. His teams are incredibly well-prepared tactically for every opponent, using specific pressing triggers and positional traps. He is a master of European football with a trophy cabinet of Europa Leagues to prove it. His teams are organized, technically competent, and dangerous from set pieces.',
    keyPrinciples: [
      'Extreme tactical detail — teams prepared specifically for each opponent',
      'Intelligent pressing with specific triggers rather than wild chasing',
      'Set pieces are a major attacking weapon',
      'Flexible enough to change shape depending on the opponent',
      'Technical quality across the squad — no weak technical links',
      'Good defensive organization — compact and hard to play through',
      'Wide players must track back and contribute defensively',
    ],
    positionalRequirements: [
      {
        position: 'Midfielder (All-Round)',
        positionCode: 'Midfielder',
        profileLabel: 'Intelligent All-Round Midfielder',
        tacticalDescription:
          'Emery\'s midfielders need to be tactically smart above all else. They must understand pressing triggers, spatial positioning, and be technically competent in all areas. Marcos Senesi, Youri Tielemans — versatile, intelligent players who understand the game. Athleticism and IQ in equal measure.',
        keyStats: ['pass_accuracy', 'interceptions', 'key_passes', 'tackles', 'work_rate'],
        mustHave: ['High tactical intelligence', 'Good technical quality', 'Defensive contribution', 'Versatility across positions'],
        niceToHave: ['Goals and assists', 'Set piece involvement', 'Leadership'],
        avoidIf: ['Low tactical IQ', 'Poor defensive work rate', 'Inflexible in terms of position'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Intelligent Striker',
        tacticalDescription:
          'Emery values strikers who understand movement, work for the team, and can contribute to the press. Watkins is the model — relentless work rate, intelligent movement, good finishing. Not a static striker who waits for the ball.',
        keyStats: ['goals', 'pressing_duels', 'movement', 'shots_on_target', 'hold_up_play'],
        mustHave: ['Good goal return', 'High work rate and pressing', 'Intelligent movement', 'Clinical finishing'],
        niceToHave: ['Assist contribution', 'Aerial threat for set pieces', 'Experience in European competition'],
        avoidIf: ['Static and non-pressing', 'Low work rate', 'Poor conversion rate'],
      },
    ],
  },
  {
    id: 'hansi-flick',
    name: 'Hansi Flick',
    nationality: 'German',
    currentClub: 'Barcelona',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'very_high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'Flick at Barcelona has revived gegenpressing with a very high line and attacking mindset. Like his Bayern days, his teams press relentlessly from the front, defend extremely high, and attack at speed. The young Barça players thrive in the system because it gives them freedom to express themselves within a structured high-intensity framework.',
    keyPrinciples: [
      'Gegenpressing — win the ball back within seconds of losing it',
      'Extremely high defensive line — pace in every defensive position required',
      'Quick vertical transitions — attack before the opposition sets up',
      'Technical quality expected from every player including defenders',
      'Wide forwards are the primary attacking outlets',
      'Goalkeeper must be a ball-player to build from the back',
      'Youth and athleticism embraced — pace and energy valued',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Pace-First Technical CB',
        tacticalDescription:
          'Flick\'s high line at Barcelona demands CBs who can sprint back constantly. They must also be comfortable on the ball as part of build-up. A slow CB in this system is exposed immediately. Araújo\'s pace and physicality combined with passing is the ideal profile.',
        keyStats: ['pace', 'acceleration', 'pass_accuracy', 'interceptions', 'tackles'],
        mustHave: ['Elite pace for the high line', 'Good on the ball', 'Strong 1v1 defending', 'Aggressive pressing'],
        niceToHave: ['Leadership and organization', 'Aerial ability', 'Long-range distribution'],
        avoidIf: ['Slow recovery pace', 'Poor under pressure on the ball', 'Hesitant in 1v1s'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Press-Resistant Playmaker',
        tacticalDescription:
          'Barcelona\'s midfielders need to combine Barça DNA (technical quality, positional intelligence) with Flick\'s physical demands (press, cover ground, win the ball). Pedri and Gavi showed this is possible — technically elite but also relentless workers.',
        keyStats: ['pass_accuracy', 'dribbles', 'progressive_carries', 'pressing_duels', 'key_passes'],
        mustHave: ['Elite technical quality', 'High work rate and pressing', 'Ability to carry the ball', 'Composure under pressure'],
        niceToHave: ['Goals from midfield', 'Long-range shooting', 'Versatility'],
        avoidIf: ['Low work rate', 'Poor pressing contribution', 'Uncomfortable under intense pressure'],
      },
    ],
  },
  {
    id: 'eddie-howe',
    name: 'Eddie Howe',
    nationality: 'English',
    currentClub: 'Newcastle United',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Howe\'s Newcastle plays an energetic, direct style that prioritizes winning the ball high and attacking with pace and purpose. His system is not as positionally complex as Guardiola\'s but is extremely effective — based on hard work, clinical finishing, and excellent team spirit. Isak has been the focal point of a system that values mobility and directness.',
    keyPrinciples: [
      'High energy pressing to win the ball in the opponent\'s half',
      'Direct, fast transitions from defense to attack',
      'Wide players run in behind and stretch the defense',
      'Strong set piece threat — both attacking and defensive',
      'Collective team spirit and hard work — no passengers allowed',
      'Striker is the focal point — must be mobile and clinical',
      'Fullbacks push forward to create 2v1s on the flanks',
    ],
    positionalRequirements: [
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Clinical Striker',
        tacticalDescription:
          'Howe\'s striker (Isak profile) needs elite movement, pace in behind, and the clinical quality to score from few chances. Newcastle doesn\'t dominate possession, so the striker must make the most of the chances they get. Hold-up play to bring others into the game is also important.',
        keyStats: ['goals', 'pace', 'dribbles', 'shots_on_target', 'movement'],
        mustHave: ['Elite pace and movement', 'Clinical finishing', 'Intelligent runs in behind', 'Willingness to work without the ball'],
        niceToHave: ['Hold-up play', 'Technical dribbling in tight spaces', 'Aerial threat'],
        avoidIf: ['Slow or static', 'Poor conversion rate', 'Does not track back / press'],
      },
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Direct Pacey Winger',
        tacticalDescription:
          'Newcastle\'s wingers need to run at defenders, get in behind, and deliver crosses or cut inside to shoot. They need to be direct and dangerous — Gordon is the profile, using pace, directness, and energy to constantly threaten.',
        keyStats: ['pace', 'dribbles', 'goals', 'assists', 'work_rate'],
        mustHave: ['High pace', 'Directness and willingness to run at defenders', 'Good end product (goals/assists)', 'Defensive work rate'],
        niceToHave: ['Set piece delivery', 'Versatility between wings', 'Aerial ability for crosses'],
        avoidIf: ['Slow or non-direct', 'Low defensive contribution', 'Poor end product'],
      },
    ],
  },
  {
    id: 'vincent-kompany',
    name: 'Vincent Kompany',
    nationality: 'Belgian',
    currentClub: 'Bayern Munich',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Kompany has brought a Guardiola-influenced positional style to Bayern. His teams build from the back with technical quality, press with intensity, and attack with precision. Being a former Man City player under Guardiola, his tactical blueprint carries that DNA. At Burnley he showed he could implement it with average players — at Bayern, the quality is there to execute it at the highest level.',
    keyPrinciples: [
      'Build from the back — technical defenders are essential',
      'High defensive line requires pace in the CB position',
      'Positional play — find space, maintain triangles, control the game',
      'High pressing triggers — organized, not chaotic',
      'Wide players central to attacking threat',
      'Midfield must combine pressing with positional intelligence',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Technical Pacey CB',
        tacticalDescription:
          'Kompany demands CBs who can play out from the back (his own former profile) but with pace for the high line. They must be comfortable under pressure, read the game well, and be strong aerially. A technically poor CB is a liability in his system.',
        keyStats: ['pass_accuracy', 'pace', 'aerial_duels', 'interceptions', 'progressive_carries'],
        mustHave: ['Good technical quality on the ball', 'Decent pace for high line', 'Strong in duels', 'Composure under pressure'],
        niceToHave: ['Leadership', 'Ability to carry ball forward', 'Long distribution'],
        avoidIf: ['Poor technical quality', 'Slow', 'Panics under pressure'],
      },
    ],
  },
  {
    id: 'enzo-maresca',
    name: 'Enzo Maresca',
    nationality: 'Italian',
    currentClub: 'Chelsea',
    formations: ['4-2-3-1', '4-1-4-1', '3-4-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Maresca is a Guardiola disciple who implemented a possession-based positional style at Leicester before taking over Chelsea. His teams build from the back, control space intelligently, and press with organized triggers. He values technical quality and positional intelligence over physicality. His Chelsea system adapts to the squad\'s wide array of talent, using flexible formations with positional rotations.',
    keyPrinciples: [
      'Positional play — control space, maintain passing triangles',
      'Build from the back through technically capable defenders',
      'High press with clear triggers, not chaotic chasing',
      'Flexible formations — players must understand multiple shapes',
      'Inverted wingers cutting into half-spaces',
      'Full-backs push high and contribute to build-up',
      'Goalkeeper must be comfortable with the ball',
    ],
    positionalRequirements: [
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Positional Pivot / Ball-Progressor',
        tacticalDescription:
          'Maresca\'s midfield pivot must control the tempo, protect the defense when fullbacks push high, and progress the ball efficiently. Press-resistance and intelligence are the key requirements. The player acts as the link between defense and attack.',
        keyStats: ['pass_accuracy', 'progressive_passes', 'interceptions', 'tackles', 'dribbles'],
        mustHave: ['Elite positional awareness', 'High pass accuracy under pressure', 'Good defensive contribution', 'Intelligence to read the game'],
        niceToHave: ['Carrying ability to break lines', 'Long-range passing', 'Leadership'],
        avoidIf: ['Gets caught out of position', 'Poor passer under pressure', 'Low football IQ'],
      },
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Technical Inverted Winger',
        tacticalDescription:
          'Maresca\'s wingers need high technical quality to play in tight spaces, cut inside, and contribute to the positional play system. They must press well and have an end product. Unlike pure pace merchants, these players need football intelligence alongside their athletic attributes.',
        keyStats: ['goals', 'assists', 'dribbles', 'key_passes', 'pressing_duels'],
        mustHave: ['High technical quality', 'Goals and assists output', 'Pressing contribution', 'Positional intelligence'],
        niceToHave: ['Pace to beat defenders', 'Versatility across both wings', 'Set piece delivery'],
        avoidIf: ['Low work rate', 'Poor technical quality in tight spaces', 'Does not track back'],
      },
    ],
  },
  {
    id: 'fabian-hurzeler',
    name: 'Fabian Hürzeler',
    nationality: 'German',
    currentClub: 'Brighton',
    formations: ['4-2-3-1', '4-3-3', '3-4-3'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Hürzeler continues Brighton\'s identity of progressive, data-driven football. His system combines high pressing, positional play, and quick transitions. Technically gifted players who press relentlessly and understand spatial relationships are essential. He has developed a reputation for improving young players and building cohesive, high-energy teams.',
    keyPrinciples: [
      'Intense gegenpressing — win the ball back immediately after losing it',
      'Technical quality expected from every outfield player',
      'High defensive line requires athleticism and intelligence in defense',
      'Quick transitions from defense to attack',
      'Wide players are direct and contribute to pressing',
      'Data-informed decisions — every signing has a tactical purpose',
    ],
    positionalRequirements: [
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Press-Resistant Technical Midfielder',
        tacticalDescription:
          'Brighton\'s midfielders need to combine technical quality with relentless pressing. They must be comfortable in tight spaces, make intelligent decisions quickly, and cover ground defensively. The profile blends the creative with the industrious.',
        keyStats: ['pass_accuracy', 'pressing_duels', 'progressive_carries', 'key_passes', 'interceptions'],
        mustHave: ['High technical quality', 'Elite pressing work rate', 'Good passing under pressure', 'Intelligent positioning'],
        niceToHave: ['Goals from midfield', 'Long-range shooting', 'Versatility'],
        avoidIf: ['Low work rate', 'Poor pressing contribution', 'Uncomfortable under pressure'],
      },
    ],
  },
  {
    id: 'oliver-glasner',
    name: 'Oliver Glasner',
    nationality: 'Austrian',
    currentClub: 'Crystal Palace',
    formations: ['4-2-3-1', '3-4-3', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Glasner revived Crystal Palace with an energetic, direct attacking style that made the most of their talented forwards. His system is flexible but built around fast wide play, clinical finishing, and organized pressing. He is pragmatic — willing to adapt his setup to exploit the opposition\'s weaknesses. He transformed Palace into an exciting, fast-paced team.',
    keyPrinciples: [
      'Fast, direct attack through wide forwards — Saka/Olise style players valued',
      'Organized pressing that is pragmatic, not chaotic',
      'Flexible shape — able to switch between 3-back and 4-back',
      'Clinical wide forwards who can both cut inside and deliver crosses',
      'Physical presence in central positions',
      'Set pieces as an important attacking weapon',
    ],
    positionalRequirements: [
      {
        position: 'Winger / Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Explosive Direct Wide Forward',
        tacticalDescription:
          'Glasner\'s system at Palace was built around explosive, direct wide forwards. The perfect profile combines pace, directness, end product, and the technical ability to play in tight spaces. Eberechi Eze and Michael Olise set the benchmark — technical, fast, and decisive.',
        keyStats: ['pace', 'dribbles', 'goals', 'assists', 'key_passes'],
        mustHave: ['High pace and directness', 'Good goals/assists output', 'Technical quality one-on-one', 'Defensive awareness'],
        niceToHave: ['Versatility across both wings', 'Set piece delivery', 'Ability to play as a #10'],
        avoidIf: ['Slow or passive', 'Low end product', 'Poor defensive contribution'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Physical Mobile Striker',
        tacticalDescription:
          'Glasner\'s strikers need to be physically strong enough to hold the line, mobile enough to press, and clinical enough to convert the chances created by the wide players. Jean-Philippe Mateta showed the ideal combination of physicality, pace, and finishing.',
        keyStats: ['goals', 'pace', 'aerial_duels', 'shots_on_target', 'hold_up_play'],
        mustHave: ['Clinical finishing', 'Physical strength and pace', 'Willingness to press', 'Good aerial ability'],
        niceToHave: ['Link-up with wide forwards', 'Assist contribution', 'International experience'],
        avoidIf: ['Purely technical non-physical striker', 'Unwilling to press', 'Low goal return'],
      },
    ],
  },
  {
    id: 'kieran-mckenna',
    name: 'Kieran McKenna',
    nationality: 'Irish',
    currentClub: 'Ipswich Town',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'McKenna built Ipswich from League One to the Premier League in two seasons using an aggressive pressing, high-tempo system. His teams are fearless, organized, and incredibly hard-working. He has shown an ability to develop players significantly and build a clear tactical identity quickly. A rising star in management.',
    keyPrinciples: [
      'Relentless gegenpressing — win the ball in the opponent\'s half',
      'Very high defensive line — pace in CB is essential',
      'Quick vertical transitions after winning possession',
      'Direct wide play — wingers make runs in behind',
      'High tempo at all times — no passive periods',
      'Strong team identity — every player buys into the system',
    ],
    positionalRequirements: [
      {
        position: 'Center Back',
        positionCode: 'Defender',
        profileLabel: 'Pacey Aggressive CB',
        tacticalDescription:
          'McKenna\'s very high line demands CBs with genuine pace and the courage to defend aggressively. They must be comfortable in 1v1 situations when caught exposed, and good on the ball to play through the press.',
        keyStats: ['pace', 'interceptions', 'tackles', 'aerial_duels', 'pass_accuracy'],
        mustHave: ['Good pace for high defensive line', 'Aggressive defending in 1v1s', 'Composure on the ball', 'High work rate'],
        niceToHave: ['Leadership', 'Aerial ability', 'Ability to carry ball forward'],
        avoidIf: ['Slow', 'Uncomfortable under press', 'Passive in 1v1 defending'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Hard-Working Pressing Striker',
        tacticalDescription:
          'McKenna\'s strikers must work incredibly hard, press from the front, and be a constant threat. Goals are important but the work without the ball is equally essential. The striker sets the tone for the whole team\'s press.',
        keyStats: ['goals', 'pressing_duels', 'pace', 'shots_on_target', 'off_ball_movement'],
        mustHave: ['High work rate and pressing', 'Good pace and movement', 'Clinical finishing', 'Team-first mentality'],
        niceToHave: ['Aerial ability', 'Link-up play', 'Experience at top level'],
        avoidIf: ['Lazy without the ball', 'Unwilling to press', 'Static movement'],
      },
    ],
  },
  {
    id: 'thiago-motta',
    name: 'Thiago Motta',
    nationality: 'Italian',
    currentClub: 'Free Agent',
    formations: ['4-2-3-1', '4-3-3', '3-5-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'balanced',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Thiago Motta impressed enormously at Bologna before moving to Juventus. His system is built on fluid positional play, intelligent pressing, and collective movement. Players are expected to be versatile and able to play in multiple positions. He values football intelligence and technical quality, and his teams are difficult to play through.',
    keyPrinciples: [
      'Fluid positional play — players rotate intelligently across positions',
      'High press with organized triggers',
      'Build from the back with composure',
      'Versatility demanded from all players',
      'Attacking full-backs who contribute to build-up',
      'Technical quality as the primary selection criterion',
    ],
    positionalRequirements: [
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Versatile Intelligent Midfielder',
        tacticalDescription:
          'Motta\'s midfielders need to be versatile enough to play in different roles within the same system. Technical quality, positional intelligence, and the ability to press and recover are all required. Players who can only do one thing don\'t fit.',
        keyStats: ['pass_accuracy', 'key_passes', 'interceptions', 'dribbles', 'work_rate'],
        mustHave: ['High technical quality', 'Tactical versatility', 'Good pressing work rate', 'Intelligent positioning'],
        niceToHave: ['Goals and assists', 'Leadership', 'Long-range shooting'],
        avoidIf: ['One-dimensional profile', 'Low work rate', 'Poor positioning'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Technical Mobile Striker',
        tacticalDescription:
          'Motta prefers a mobile striker who links play, creates space for arriving midfielders, and is clinical when chances arrive. A static target man is a poor fit — the striker must be active, intelligent, and technically proficient.',
        keyStats: ['goals', 'hold_up_play', 'movement', 'shots_on_target', 'key_passes'],
        mustHave: ['Intelligent movement', 'Technical link-up play', 'Clinical finishing', 'Willingness to press'],
        niceToHave: ['Pace to run in behind', 'Assist contribution', 'Aerial presence for set pieces'],
        avoidIf: ['Static profile', 'Poor link-up play', 'Unwilling to work off the ball'],
      },
    ],
  },
  {
    id: 'julen-lopetegui',
    name: 'Julen Lopetegui',
    nationality: 'Spanish',
    currentClub: 'Free Agent',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'balanced',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Lopetegui is an experienced Spanish coach who values structured, organized football. His teams are defensively solid, technically competent, and dangerous on the counter. He has managed at the highest level with Real Madrid and Spain, and his experience shows in his tactical preparation and game management.',
    keyPrinciples: [
      'Organized defensive structure — compact and hard to break down',
      'Technical build-up from the back',
      'Counter-attack as a primary weapon when defending',
      'Experienced players valued for big game situations',
      'Set pieces are well-organized and important',
      'Collective discipline over individual flair',
    ],
    positionalRequirements: [
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Ball-Winning Anchor',
        tacticalDescription:
          'Lopetegui needs a physical, disciplined midfielder who protects the defense and distributes cleanly. Not flashy — reliable, strong in duels, and positionally excellent. The engine room of his defensive structure.',
        keyStats: ['interceptions', 'tackles', 'pass_accuracy', 'aerial_duels', 'work_rate'],
        mustHave: ['Strong ball-winning ability', 'Excellent positional discipline', 'Reliable passing', 'Physical presence'],
        niceToHave: ['Driving runs into attack', 'Long-range passing', 'Leadership'],
        avoidIf: ['Gets caught out of position', 'Low defensive work rate', 'Unreliable passer'],
      },
    ],
  },
  {
    id: 'andoni-iraola',
    name: 'Andoni Iraola',
    nationality: 'Spanish',
    currentClub: 'Bournemouth',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Iraola demands relentless pressing and high energy from every player. His Bournemouth teams are tactically disciplined and surprisingly sophisticated — pressing in organized waves, transitioning quickly, and attacking vertically with purpose. A former full-back himself, he obsesses over wide areas and positional structure. He has consistently overperformed with limited resources through collective effort and tactical clarity.',
    keyPrinciples: [
      'Structured high press — organized pressing traps, not chaotic',
      'Quick vertical transitions after winning possession',
      'Wide full-backs who push high and overlap',
      'Compact defensive block that shifts collectively',
      'Physical intensity sustained across all 90 minutes',
    ],
    positionalRequirements: [
      {
        position: 'Wide Midfielder / Winger',
        positionCode: 'Midfielder',
        profileLabel: 'Press-Trigger Wide Player',
        tacticalDescription:
          'Iraola needs wide players who press relentlessly from the front, track back hard, and still provide quality in attack. They are the start of his pressing machine — hard-working, energetic, and technically competent.',
        keyStats: ['pressing_duels', 'defensive_contributions', 'dribbles', 'crosses'],
        mustHave: ['High pressing intensity', 'Defensive tracking back', 'Pace and stamina', 'Technical ability on the ball'],
        niceToHave: ['Direct dribbling', 'Crossing ability', 'Cutting inside to shoot'],
        avoidIf: ['Low defensive work rate', 'Doesn\'t press without the ball', 'Poor stamina'],
      },
      {
        position: 'Central Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Engine',
        tacticalDescription:
          'Iraola\'s midfielders are workhorses who must cover every blade of grass. Expected to press, win second balls, transition quickly, and contribute in attack. Tactical awareness and physical output are paramount.',
        keyStats: ['tackles', 'interceptions', 'distance_covered', 'pass_accuracy', 'key_passes'],
        mustHave: ['Elite work rate', 'Ball-winning ability', 'Composure in possession', 'High defensive contribution'],
        niceToHave: ['Through balls', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Low energy', 'Poor pressing', 'Static in transitions'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Press-Leading Forward',
        tacticalDescription:
          'The striker in Iraola\'s system leads the press from the front and must work hard without the ball. A functional footballer who links play, applies pressure, and finishes when chances come.',
        keyStats: ['pressing_duels', 'goals', 'link_up_play', 'work_rate'],
        mustHave: ['Leads the press from the front', 'Work rate without the ball', 'Movement in behind', 'Clinical finishing'],
        niceToHave: ['Hold-up play', 'Pace in behind', 'Technical skill'],
        avoidIf: ['Ball-watching striker', 'Low work rate', 'Refuses to press'],
      },
    ],
  },
  {
    id: 'thomas-frank',
    name: 'Thomas Frank',
    nationality: 'Danish',
    currentClub: 'Free Agent',
    formations: ['4-3-3', '3-5-2'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Thomas Frank is one of the most pragmatic and underrated managers in the Premier League. Brentford under Frank are direct, physical, and extremely dangerous from set-pieces — which they treat as a genuine tactical weapon. His system emphasizes second balls, physical duels, and direct play forward, but he has evolved to incorporate more possession football. Data and analytics are central to his recruitment and tactical approach.',
    keyPrinciples: [
      'Set-pieces as a genuine tactical weapon — both attacking and defending',
      'Direct, vertical play — limited passing phases before going forward',
      'Physical duels and second-ball dominance',
      'High energy pressing that disrupts opponents',
      'Data-driven recruitment — overlooked players who fit the system',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Forward',
        positionCode: 'Attacker',
        profileLabel: 'Aerial Target / Set-Piece Threat',
        tacticalDescription:
          'Frank loves a physically dominant centre-forward who wins headers, fights defenders, and is dangerous at set-pieces. The striker must lead the press and be a reference point for direct balls. Ivan Toney is the archetype — physical, intelligent, and a set-piece threat.',
        keyStats: ['aerial_duels', 'goals', 'hold_up_play', 'set_piece_goals'],
        mustHave: ['Aerial dominance', 'Physical presence', 'Set-piece threat', 'Leads the press'],
        niceToHave: ['Technical skill in tight spaces', 'Link-up play', 'Long-range shooting'],
        avoidIf: ['Small and lightweight', 'No aerial ability', 'Avoids physical duels'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Dominant Aerial Defender',
        tacticalDescription:
          'Frank\'s defenders must be excellent in the air at both ends — winning headers in defense and attacking set-pieces. Ball-playing ability is valued but physicality and aerial dominance come first.',
        keyStats: ['aerial_duels', 'clearances', 'blocks', 'set_piece_goals'],
        mustHave: ['Aerial dominance', 'Physical strength', 'Set-piece attacking threat', 'Defensive solidity'],
        niceToHave: ['Ball-playing ability', 'Pace to recover', 'Leadership'],
        avoidIf: ['Poor in aerial duels', 'Afraid of physical contact', 'Short or slight build'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Physical Midfield Engine',
        tacticalDescription:
          'Frank needs midfielders who win second balls after direct play forward, press hard, and support the physical style. Strong in duels, contributes defensively, and reliable in possession.',
        keyStats: ['tackles', 'interceptions', 'aerial_duels', 'pass_accuracy', 'distance_covered'],
        mustHave: ['Physical strength in duels', 'Second-ball wins', 'Pressing contribution', 'Ball retention'],
        niceToHave: ['Goal threat from midfield', 'Key passes', 'Set-piece delivery'],
        avoidIf: ['Too lightweight for physical battles', 'Poor second-ball ability', 'Can\'t cope with direct style'],
      },
    ],
  },
  {
    id: 'marco-silva',
    name: 'Marco Silva',
    nationality: 'Portuguese',
    currentClub: 'Fulham',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Marco Silva has transformed Fulham into an attractive, possession-based team that punches above their weight in the Premier League. His system involves patient build-up from the back, high pressing, and attacking football through technical players. He values technique and intelligence over raw physicality, and his teams are well-organized, difficult to beat, and pleasant to watch.',
    keyPrinciples: [
      'Patient possession build-up from the goalkeeper',
      'High defensive line with organized pressing — squeeze midfield space',
      'Technical quality valued over pure physicality',
      'Fluid attacking patterns with attacking full-backs',
      'Consistent tactical identity regardless of opponent',
    ],
    positionalRequirements: [
      {
        position: 'Attacking Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Creative Playmaker',
        tacticalDescription:
          'Silva\'s system is built around a creative number 10 who links play and controls tempo. Must have excellent technique, vision, and the ability to play in tight spaces. The conductor of his attacking system.',
        keyStats: ['key_passes', 'through_balls', 'pass_accuracy', 'dribbles', 'assists'],
        mustHave: ['Elite technical ability', 'Creative passing and vision', 'Intelligence in tight spaces', 'Press resistance'],
        niceToHave: ['Goal scoring from deep', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Poor technical quality', 'Slow decision-making', 'Low pressing contribution'],
      },
      {
        position: 'Full-Back',
        positionCode: 'Defender',
        profileLabel: 'Attacking Full-Back',
        tacticalDescription:
          'Silva\'s full-backs are key to his attacking structure — push high, overlap, provide width, and create chances. Must be equally dangerous in attack and disciplined in defense.',
        keyStats: ['crosses', 'assists', 'dribbles', 'tackles', 'key_passes'],
        mustHave: ['Attacking quality — crossing and overlapping', 'Technical ability', 'Defensive discipline', 'Stamina to cover the full pitch'],
        niceToHave: ['Direct dribbling and cutting inside', 'Set-piece delivery', 'Long-range shooting'],
        avoidIf: ['Pure defensive full-back with no attacking quality', 'Poor crossing', 'Low fitness'],
      },
      {
        position: 'Centre-Forward',
        positionCode: 'Attacker',
        profileLabel: 'Technical Focal Point',
        tacticalDescription:
          'Silva needs a striker who can hold up play, link with midfielders, and finish with quality. Movement off the ball and technical ability are prioritized. Not purely a target man — must contribute to possession play.',
        keyStats: ['goals', 'hold_up_play', 'link_up_play', 'pressing_duels'],
        mustHave: ['Good technical quality', 'Link-up play with midfielders', 'Movement and finishing', 'Leads the press'],
        niceToHave: ['Pace in behind', 'Aerial ability', 'Hold-up play under pressure'],
        avoidIf: ['Can\'t link play', 'Low pressing contribution', 'Technical limitations'],
      },
    ],
  },
  {
    id: 'nuno-espirito-santo',
    name: 'Nuno Espírito Santo',
    nationality: 'Portuguese',
    currentClub: 'Nottingham Forest',
    formations: ['4-2-3-1', '4-4-2'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'counter_attack',
      width: 'balanced',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Nuno is a master of organized defensive structure and devastating counter-attacks. His Nottingham Forest side are difficult to break down, compact, and dangerous on the break. He lets the opponent have the ball and exploits space on transitions with fast, direct play. Clinical efficiency and defensive solidity over aesthetic football.',
    keyPrinciples: [
      'Compact defensive block — organized two-bank structure',
      'Clinical on counter-attacks — fast and direct when winning possession',
      'Defensive resilience before offensive ambition',
      'Set-pieces as a scoring source',
      'Discipline and organization over individual brilliance',
    ],
    positionalRequirements: [
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Defensive Shield',
        tacticalDescription:
          'Nuno\'s defensive midfielder is the protective wall in front of the back four. Must be excellent at intercepting, blocking, winning duels, and protecting the defense. Positional intelligence and defensive reading are the priority.',
        keyStats: ['interceptions', 'tackles', 'aerial_duels', 'clearances', 'pass_accuracy'],
        mustHave: ['Elite defensive positioning', 'Ball-winning in transition', 'Physical presence', 'Composure in possession'],
        niceToHave: ['Driving runs forward', 'Long distribution', 'Leadership'],
        avoidIf: ['Gets caught out of position', 'Poor tackling', 'Not disciplined defensively'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Counter-Attack Finisher',
        tacticalDescription:
          'Nuno needs a striker who thrives in transition — explosive pace, direct running, and clinical finishing. The target for fast balls played in behind when Forest win possession.',
        keyStats: ['goals', 'pace', 'runs_behind_defense', 'finishing'],
        mustHave: ['Pace to run in behind', 'Clinical finishing', 'Intelligent movement', 'Physical presence'],
        niceToHave: ['Hold-up play when needed', 'Aerial ability', 'Pressing from the front'],
        avoidIf: ['Slow striker who can\'t threaten in behind', 'Low goal rate', 'Struggles in direct football'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Organized Defensive Leader',
        tacticalDescription:
          'Nuno\'s center-backs must be excellent defenders first — strong in the air, composed under pressure, and leaders who organize the backline. Ball-playing is secondary to defensive reliability.',
        keyStats: ['aerial_duels', 'interceptions', 'clearances', 'tackles'],
        mustHave: ['Defensive leadership and communication', 'Aerial strength', 'Positional discipline', 'Composure under pressure'],
        niceToHave: ['Ball-playing ability for longer distribution', 'Pace to cover in behind', 'Set-piece threat'],
        avoidIf: ['Easily beaten by physical strikers', 'Poor positioning', 'Rash in challenges'],
      },
    ],
  },
  {
    id: 'jurgen-klopp',
    name: 'Jürgen Klopp',
    nationality: 'German',
    currentClub: 'Red Bull',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'Jürgen Klopp is the architect of gegenpressing — the philosophy of winning the ball back immediately after losing it using coordinated, ferocious pressing. His Liverpool teams became global icons of modern football: electric, intense, emotional, and devastating. Klopp turns the transition moment into an attacking weapon. His players must be physically elite, tactically intelligent, and mentally resilient.',
    keyPrinciples: [
      'Gegenpressing — win the ball back within 5 seconds of losing it',
      'Intense high press from the front, triggered by the striker',
      'Fast, direct vertical attacks — never slow the game down',
      'Wide forwards cutting inside to combine with overlapping full-backs',
      'Midfielders with elite fitness — enormous territory covered per game',
      'Emotional intensity — culture and mentality are crucial',
    ],
    positionalRequirements: [
      {
        position: 'Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Electric Press-and-Attack Winger',
        tacticalDescription:
          'Think Salah or Mané. Klopp\'s wide forwards press at maximum intensity, cut inside to attack, and score goals. Explosively fast, press relentlessly, and have the technical quality to finish. Tireless workers who also happen to be match-winners.',
        keyStats: ['pressing_duels', 'goals', 'dribbles', 'pace', 'assists'],
        mustHave: ['Elite pace and pressing intensity', 'Goal and assist output', 'Cutting inside ability', 'Physical stamina'],
        niceToHave: ['Crossing from wide', 'Leadership on the pitch', 'Set-piece threat'],
        avoidIf: ['Low pressing output', 'Doesn\'t track back', 'Poor finishing', 'Low stamina'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Running Machine',
        tacticalDescription:
          'Klopp\'s midfielders cover enormous territory — pressing, defending, supporting, and arriving into attack. Must have elite fitness, tactical intelligence, and the ability to contribute in all phases.',
        keyStats: ['distance_covered', 'tackles', 'interceptions', 'pass_accuracy', 'key_passes'],
        mustHave: ['Extraordinary fitness and stamina', 'Pressing contribution', 'Defensive discipline', 'Technical quality'],
        niceToHave: ['Goal scoring from midfield', 'Leadership and experience', 'Set-piece delivery'],
        avoidIf: ['Static midfielder who walks', 'Low defensive contribution', 'Poor fitness'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Aggressive High-Line Defender',
        tacticalDescription:
          'Klopp plays a high defensive line, so center-backs must have real pace to recover when beaten. Must also be dominant in the air, organized, and capable of playing from the back. Van Dijk is the prototype.',
        keyStats: ['pace', 'aerial_duels', 'interceptions', 'pass_accuracy', 'clearances'],
        mustHave: ['Real pace to cover the high line', 'Aerial dominance', 'Composure and ball-playing', 'Leadership and organization'],
        niceToHave: ['Aggressive pressing', 'Distribution to trigger attacks', 'Physicality in duels'],
        avoidIf: ['Slow center-back who can\'t cover space', 'Poor under aerial pressure', 'Nervous in possession'],
      },
      {
        position: 'Goalkeeper',
        positionCode: 'Goalkeeper',
        profileLabel: 'Sweeper-Keeper',
        tacticalDescription:
          'Klopp\'s high line demands a goalkeeper who comes off their line aggressively, sweeps behind the defense, and distributes quickly to trigger fast attacks. Shot-stopping is important but sweeping ability and distribution are equally valued.',
        keyStats: ['sweeping', 'distribution', 'shot_stopping', 'claim_rate'],
        mustHave: ['Aggressive sweeping off the line', 'Quick and accurate distribution', 'Commanding presence in the box', 'Confident shot-stopping'],
        niceToHave: ['Long distribution to set attacks', 'Penalty saving', 'Communication and leadership'],
        avoidIf: ['Stays on the line with no sweeping', 'Slow distribution', 'Uncomfortable with the ball at feet'],
      },
    ],
  },
  {
    id: 'ernesto-valverde',
    name: 'Ernesto Valverde',
    nationality: 'Spanish',
    currentClub: 'Athletic Bilbao',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Valverde has Athletic Bilbao playing some of the most vibrant football in La Liga — intense pressing, dynamic wide play, and a clear identity built on the club\'s unique Basque philosophy. His teams are tactically disciplined, physically aggressive, and technically smart. He favors direct pressing and quick transitions, with wide forwards who are willing workers and technically gifted.',
    keyPrinciples: [
      'High press to disrupt opponent build-up',
      'Direct, vertical play in transition — attack quickly',
      'Wide forwards who run at defenders with pace',
      'Midfield compactness and defensive work rate',
      'Strong team cohesion and collective effort',
    ],
    positionalRequirements: [
      {
        position: 'Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Dynamic Wide Attacker',
        tacticalDescription:
          'Valverde\'s wide attackers need to be fast, direct, and willing to press. Run at defenders repeatedly, deliver crosses, and score goals. Hard-working and technically capable with high defensive output.',
        keyStats: ['dribbles', 'crosses', 'goals', 'pressing_duels', 'pace'],
        mustHave: ['Pace and directness', 'Defensive tracking', 'Crossing or cutting inside', 'Pressing contribution'],
        niceToHave: ['Set-piece delivery', 'Long-range shooting', 'Hold-up play'],
        avoidIf: ['No defensive work rate', 'Slow in transition', 'Avoids pressure'],
      },
      {
        position: 'Defensive Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Combative Midfield Destroyer',
        tacticalDescription:
          'The engine of Valverde\'s pressing machine. Must win duels, press relentlessly, protect the backline, and quickly recycle possession. Physical and intelligent — the defensive anchor of the team.',
        keyStats: ['tackles', 'interceptions', 'aerial_duels', 'work_rate', 'pass_accuracy'],
        mustHave: ['Physical presence and ball-winning', 'High pressing contribution', 'Positional awareness', 'Reliable distribution'],
        niceToHave: ['Driving runs forward', 'Leadership and communication', 'Long-range shooting'],
        avoidIf: ['Avoids physical duels', 'Poor positioning', 'Doesn\'t press'],
      },
    ],
  },
  {
    id: 'manuel-pellegrini',
    name: 'Manuel Pellegrini',
    nationality: 'Chilean',
    currentClub: 'Real Betis',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'balanced',
      tempo: 'medium',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Pellegrini is a refined tactician who favors elegant, possession-based football with attacking intent. His Betis teams play beautiful football — patient build-up, technical quality, and fluid attacking combinations. He values technical players with high IQ, and his teams are well-organized across the pitch. A classic possession coach who wants to control games through quality.',
    keyPrinciples: [
      'Patient build-up and ball retention',
      'Technical quality prioritized in every position',
      'Attacking football through fluid combinations',
      'Moderate pressing — organized rather than intense',
      'Structural balance between attack and defense',
    ],
    positionalRequirements: [
      {
        position: 'Attacking Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Technical Number 10',
        tacticalDescription:
          'Pellegrini loves a classic number 10 who controls the tempo of the game. Excellent technical ability, vision, and composure under pressure. The creative heart of his system.',
        keyStats: ['key_passes', 'assists', 'pass_accuracy', 'through_balls', 'dribbles'],
        mustHave: ['Exceptional technical quality', 'Creative vision and passing', 'Composure in tight spaces', 'Intelligence in movement'],
        niceToHave: ['Goal scoring from deep', 'Set-piece delivery', 'Leadership'],
        avoidIf: ['Physically dominant but technically limited', 'Slow decision-making', 'Poor under pressure'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Ball-Playing Defender',
        tacticalDescription:
          'Pellegrini\'s center-backs must be comfortable with the ball — his system builds from the back. They need to read the game excellently, distribute well, and be defensively reliable.',
        keyStats: ['pass_accuracy', 'aerial_duels', 'interceptions', 'long_balls'],
        mustHave: ['Comfortable in possession', 'Good distribution', 'Defensive intelligence', 'Positional awareness'],
        niceToHave: ['Pace', 'Leadership', 'Set-piece threat'],
        avoidIf: ['Nervous in possession', 'Can\'t play short passes under pressure', 'Poor reading of the game'],
      },
    ],
  },
  {
    id: 'imanol-alguacil',
    name: 'Imanol Alguacil',
    nationality: 'Spanish',
    currentClub: 'Al-Shabab',
    formations: ['4-3-3', '4-1-4-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Alguacil has Real Sociedad playing some of the most sophisticated football in La Liga — positional, pressing-intensive, and technically demanding. His system rewards intelligent, technical players who understand space and movement. Real Sociedad rotate well, press from defined positions, and combine through clever patterns. A complete tactical operator who demands both quality and intelligence.',
    keyPrinciples: [
      'Positional play — players occupy specific zones and maintain structure',
      'High press with organized triggers from defined positions',
      'Technical quality with quick short passes in tight spaces',
      'Wide players with freedom to combine and create',
      'Intelligent movement and rotation across the team',
    ],
    positionalRequirements: [
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Positional Intelligence Midfielder',
        tacticalDescription:
          'Alguacil\'s midfielders must understand positional play — occupying correct zones, rotating intelligently, pressing from structured positions, and moving the ball quickly. Technical quality and tactical intelligence are as important as athleticism.',
        keyStats: ['pass_accuracy', 'key_passes', 'pressing_duels', 'dribbles', 'interceptions'],
        mustHave: ['Positional intelligence', 'Technical quality', 'Structured pressing', 'Quick combination passing'],
        niceToHave: ['Goal scoring from midfield', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Poor positional awareness', 'Not comfortable in positional play', 'Low technical standard'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Link-Up Forward',
        tacticalDescription:
          'Alguacil\'s strikers are not pure target men — they must move intelligently, link play with midfielders, and create space for runners. Mobile, technical, and capable of holding and releasing quickly.',
        keyStats: ['goals', 'link_up_play', 'movement', 'key_passes', 'pressing_duels'],
        mustHave: ['Technical quality', 'Intelligent movement', 'Link-up play', 'Pressing from front'],
        niceToHave: ['Aerial ability', 'Pace in behind', 'Finishing power'],
        avoidIf: ['Static target man with no movement', 'Poor technical quality', 'Doesn\'t contribute to build-up'],
      },
    ],
  },
  {
    id: 'simone-inzaghi',
    name: 'Simone Inzaghi',
    nationality: 'Italian',
    currentClub: 'Inter Milan',
    formations: ['3-5-2', '3-4-1-2'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'medium',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Simone Inzaghi is a specialist of the 3-5-2 system — a structure he has mastered to near perfection at Inter. His teams are extremely well-organized, using the five-man midfield to dominate central areas and wing-backs to provide width and crossing. The two strikers work in tandem, pressing high and combining in close quarters. Inzaghi\'s Inter are tactical masters — compact, creative, and very difficult to break down.',
    keyPrinciples: [
      '3-5-2 structure — five in midfield to control central space',
      'Wing-backs who sprint up and down the entire flank',
      'Two strikers who press together and combine closely',
      'Build-up through the three center-backs with good distribution',
      'Compact defensive block — organized and resilient',
    ],
    positionalRequirements: [
      {
        position: 'Wing-Back',
        positionCode: 'Defender',
        profileLabel: 'Elite Wing-Back',
        tacticalDescription:
          'The wing-backs are the most important players in Inzaghi\'s system. They must bomb forward to provide width and crosses in attack, then sprint back to form the defensive block. Elite stamina and both defensive and attacking quality are essential.',
        keyStats: ['crosses', 'assists', 'tackles', 'distance_covered', 'dribbles'],
        mustHave: ['Elite stamina to cover the full flank', 'Crossing and delivery quality', 'Defensive ability to track back', 'Tactical positioning in a 3-5-2'],
        niceToHave: ['Shooting from distance', 'Set-piece delivery', 'Direct dribbling'],
        avoidIf: ['Pure defender with no attacking output', 'Low stamina', 'Poor crossing'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Dual-Striker Partner',
        tacticalDescription:
          'Inzaghi\'s two strikers work as a unit — one leads the line while the other drops slightly. They press high together, combine in tight spaces, and both contribute goals. Think Lautaro and Thuram — a physical-technical partnership.',
        keyStats: ['goals', 'pressing_duels', 'link_up_play', 'movement', 'assists'],
        mustHave: ['Chemistry in two-striker combination', 'Pressing together from the front', 'Goal and assist contribution', 'Movement and intelligence'],
        niceToHave: ['Aerial ability', 'Hold-up play', 'Versatility to lead or support'],
        avoidIf: ['Lone striker who doesn\'t combine', 'Static in combination play', 'Low pressing output'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Ball-Playing Centre-Back in a Three',
        tacticalDescription:
          'Inzaghi\'s three center-backs must all be comfortable in possession since they form the foundation of his build-up. The wider center-backs often step into midfield when wing-backs push up, so positional intelligence and passing quality are crucial.',
        keyStats: ['pass_accuracy', 'long_balls', 'aerial_duels', 'interceptions'],
        mustHave: ['Comfortable in possession', 'Good distribution under pressure', 'Positional intelligence in a back three', 'Defensive leadership'],
        niceToHave: ['Stepping into midfield', 'Set-piece threat', 'Pace'],
        avoidIf: ['Uncomfortable as ball-playing CB', 'Poor positioning in a three', 'Nervous under pressure'],
      },
    ],
  },
  {
    id: 'gian-piero-gasperini',
    name: 'Gian Piero Gasperini',
    nationality: 'Italian',
    currentClub: 'AS Roma',
    formations: ['3-4-3', '3-4-1-2'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'Gian Piero Gasperini has built one of the most unique and exciting systems in European football at Atalanta. His three-at-the-back, aggressive pressing, all-out attacking style has consistently overperformed expectations — including winning the Europa League. His teams press with maximum intensity, attack with speed and overloads, and have extremely high fitness demands. Versatile, aggressive players who can play multiple roles are essential.',
    keyPrinciples: [
      'Aggressive gegenpressing immediately after losing the ball',
      'Three center-backs split wide — wing-backs push very high',
      'Attacking overloads through wing-backs and interior midfielders',
      'Fast vertical play — attack at maximum speed',
      'Players must be versatile across multiple positions in the system',
    ],
    positionalRequirements: [
      {
        position: 'Wing-Back',
        positionCode: 'Defender',
        profileLabel: 'Attack-Minded Wing-Back',
        tacticalDescription:
          'Gasperini\'s wing-backs are effectively wide midfielders who also defend. Must provide width in attack, deliver crosses, press high, and sprint back to defend in a back five. Absolutely elite fitness required — they cover more ground than almost anyone in European football.',
        keyStats: ['crosses', 'assists', 'dribbles', 'distance_covered', 'tackles'],
        mustHave: ['Elite fitness and stamina', 'Attacking quality and crossing', 'Pressing contribution', 'Defensive ability'],
        niceToHave: ['Goal threat from wide', 'Direct dribbling', 'Versatility to play inside or outside'],
        avoidIf: ['Low stamina', 'One-dimensional — can\'t attack and defend', 'Poor crossing'],
      },
      {
        position: 'Interior Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Goal-Scoring Interior',
        tacticalDescription:
          'Gasperini uses dynamic interior midfielders who attack into the box, score goals, and press ferociously. Not traditional defensive midfielders — athletic box-to-box players with goal threat, often registering double-figure goal contributions.',
        keyStats: ['goals', 'assists', 'pressing_duels', 'distance_covered', 'key_passes'],
        mustHave: ['Goal and assist contribution from midfield', 'Elite fitness', 'Pressing intensity', 'Runs into the box'],
        niceToHave: ['Technical skill in tight spaces', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Defensive midfielder who stays back', 'Low goal contribution', 'Poor fitness'],
      },
      {
        position: 'Centre-Forward',
        positionCode: 'Attacker',
        profileLabel: 'Mobile Pressing Forward',
        tacticalDescription:
          'Gasperini\'s striker leads the press at tremendous intensity and must combine with interior midfielders in tight spaces. Mobile, technically skilled, and a clinical finisher. Not a static target man.',
        keyStats: ['goals', 'pressing_duels', 'movement', 'link_up_play'],
        mustHave: ['Mobile — active in pressing', 'Technical quality to combine', 'Goal scoring', 'Elite fitness'],
        niceToHave: ['Hold-up ability when needed', 'Aerial threat', 'Versatility to play wide'],
        avoidIf: ['Lazy target man', 'Low fitness', 'Doesn\'t press from front'],
      },
    ],
  },
  {
    id: 'raffaele-palladino',
    name: 'Raffaele Palladino',
    nationality: 'Italian',
    currentClub: 'Fiorentina',
    formations: ['3-4-2-1', '4-2-3-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Palladino is one of the most exciting young coaches in Italy — tactically flexible with success in both three-back and four-back systems. His Fiorentina are technically driven, press well, and have an attractive attacking identity. He demands high energy, tactical discipline, and technical quality from his players. A versatile modern manager who adapts his system to the players available.',
    keyPrinciples: [
      'Flexible formation — adapts between 3-4-2-1 and four-back systems',
      'High pressing and organized defensive block',
      'Technical quality in all areas of the pitch',
      'Attacking width through wing-backs or full-backs',
      'Creative midfield to support the striker',
    ],
    positionalRequirements: [
      {
        position: 'Attacking Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Creative Shadow Striker',
        tacticalDescription:
          'In Palladino\'s 3-4-2-1, the two attacking midfielders behind the striker must create chances, press high, and threaten goal. Effectively shadow strikers — combining creativity with defensive contribution.',
        keyStats: ['key_passes', 'goals', 'assists', 'pressing_duels', 'dribbles'],
        mustHave: ['Creative quality in final third', 'Goal and assist contribution', 'Pressing from high areas', 'Technical quality'],
        niceToHave: ['Versatility to play multiple positions', 'Direct dribbling', 'Long-range shooting'],
        avoidIf: ['Passive in defensive phase', 'Low output in final third', 'Poor technical standard'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Composed Three-Back Defender',
        tacticalDescription:
          'Palladino\'s three center-backs need to be comfortable in possession, read the game intelligently, and provide a stable base. The central defender in particular must be an organizer and leader.',
        keyStats: ['aerial_duels', 'pass_accuracy', 'interceptions', 'clearances'],
        mustHave: ['Defensive reliability', 'Composure in possession', 'Positional intelligence', 'Leadership'],
        niceToHave: ['Pace', 'Set-piece threat', 'Long-range passing'],
        avoidIf: ['Nervous in possession', 'Poor positioning in a back three', 'Lacks leadership'],
      },
    ],
  },
  {
    id: 'claudio-ranieri',
    name: 'Claudio Ranieri',
    nationality: 'Italian',
    currentClub: 'Retired',
    formations: ['4-4-2', '4-2-3-1', '3-4-1-2'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'balanced',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Claudio Ranieri is a legendary pragmatist who adapts his system to the players and opponent. Famous for his miracle with Leicester City in 2015/16, he prioritizes organization, team spirit, and collective effort over aesthetic football. His teams are hard to beat, well-organized, and dangerous on transitions. He brings stability and experience to any club through man-management and tactical clarity.',
    keyPrinciples: [
      'Organized defensive shape — difficult to score against',
      'Team spirit and collective effort above individual quality',
      'Tactical flexibility — adapts to available players',
      'Set-pieces and transitions as primary attacking weapons',
      'Experienced leadership and pragmatic decision-making',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Reliable Defensive Leader',
        tacticalDescription:
          'Ranieri needs experienced, defensively solid center-backs who can organize the back line, win duels, and keep the team compact. Leadership and positional discipline are more important than ball-playing ability.',
        keyStats: ['aerial_duels', 'interceptions', 'tackles', 'clearances'],
        mustHave: ['Defensive reliability and organization', 'Leadership', 'Physical presence', 'Experience in high-pressure situations'],
        niceToHave: ['Ball-playing ability', 'Pace', 'Set-piece threat'],
        avoidIf: ['Positionally unreliable', 'Lacks leadership', 'Prone to errors'],
      },
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'Functional Finisher',
        tacticalDescription:
          'Ranieri\'s strikers must be reliable and contribute to the team\'s work rate. Doesn\'t need a superstar — needs a striker who works hard, creates chances, and takes them. Functional over flashy.',
        keyStats: ['goals', 'work_rate', 'pressing_duels', 'hold_up_play'],
        mustHave: ['Consistent goal contribution', 'Work rate and pressing', 'Hold-up play to relieve pressure', 'Reliability'],
        niceToHave: ['Aerial ability for set-pieces', 'Pace on transition', 'Technical skill'],
        avoidIf: ['Selfish or uncooperative player', 'Low work rate', 'Poor pressing'],
      },
    ],
  },
  {
    id: 'luis-enrique',
    name: 'Luis Enrique',
    nationality: 'Spanish',
    currentClub: 'Paris Saint-Germain',
    formations: ['4-3-3', '4-2-3-1', '3-4-3'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'very_high',
      buildUp: 'positional',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'very_attacking',
    },
    tacticalSummary:
      'Luis Enrique is one of the most progressive and demanding coaches in world football. His PSG has completely transformed from the Galácticos era to a pressing, collective, positional machine. Ruthlessly committed to his system — no individual is above the collective. His teams press extremely high, build through positional principles, and attack with devastating speed and variety. Technical quality, intelligence, and physical commitment are all simultaneously required.',
    keyPrinciples: [
      'Very high defensive line — brave and aggressive with space management',
      'Positional play combined with high-intensity gegenpressing',
      'All players must press — no exceptions regardless of profile',
      'Versatile attackers — wide players must be comfortable centrally too',
      'Technical quality and tactical intelligence are non-negotiable',
      'Collective over individual — system supremacy',
    ],
    positionalRequirements: [
      {
        position: 'Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Dynamic Versatile Attacker',
        tacticalDescription:
          'Luis Enrique\'s wide attackers must be complete players — able to play across the front line, press at the highest level, and create and score. Not positionally fixed; they must be comfortable switching and rotating, creating confusion for defenses.',
        keyStats: ['goals', 'assists', 'pressing_duels', 'dribbles', 'key_passes'],
        mustHave: ['Versatility to play across the attack', 'Elite pressing commitment', 'Goal and assist production', 'Technical excellence'],
        niceToHave: ['Pace and direct dribbling', 'Cutting inside', 'Leadership'],
        avoidIf: ['Positionally rigid — only plays one spot', 'Low pressing output', 'Inconsistent or unreliable'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Complete Positional Midfielder',
        tacticalDescription:
          'Luis Enrique demands complete midfielders who press, defend, control tempo, and contribute in attack. Must understand positional play deeply and execute under pressure. High technical standard and extraordinary fitness.',
        keyStats: ['pass_accuracy', 'pressing_duels', 'key_passes', 'interceptions', 'distance_covered'],
        mustHave: ['Positional intelligence', 'Elite pressing', 'Technical quality in possession', 'Extraordinary fitness'],
        niceToHave: ['Goal scoring', 'Long-range shooting', 'Leadership'],
        avoidIf: ['Poor pressing commitment', 'Limited technically', 'Low tactical intelligence'],
      },
      {
        position: 'Goalkeeper',
        positionCode: 'Goalkeeper',
        profileLabel: 'Elite Sweeper-Keeper',
        tacticalDescription:
          'With Luis Enrique\'s very high defensive line, the goalkeeper must be exceptional with their feet and comfortable sweeping — almost a libero. Distribution to restart attacks quickly and shot-stopping quality are both essential.',
        keyStats: ['sweeping', 'distribution', 'pass_accuracy', 'shot_stopping'],
        mustHave: ['Elite distribution with both feet', 'Aggressive sweeping behind high line', 'Shot-stopping quality', 'Comfort in possession under pressure'],
        niceToHave: ['Aerial command', 'Long-range distribution', 'Leadership'],
        avoidIf: ['Stays on line with no sweeping', 'Poor with feet', 'Panics in possession'],
      },
    ],
  },
  {
    id: 'adi-hutter',
    name: 'Adi Hütter',
    nationality: 'Austrian',
    currentClub: 'AS Monaco',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Adi Hütter is an attack-minded Austrian coach who has built a successful Monaco side around high pressing, dynamic wide play, and quick transitions. His teams are proactive, energetic, and always looking to attack. He favors technical players who can press and attack simultaneously, and his Monaco have competed at the top of Ligue 1 with exciting football.',
    keyPrinciples: [
      'High press to disrupt opponents and win the ball high up the pitch',
      'Fast, wide attacking through dynamic wingers',
      'Quick transitions from defense to attack',
      'High defensive line requiring pace from all defenders',
      'Technical quality throughout the squad',
    ],
    positionalRequirements: [
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Dynamic Goal-Scoring Winger',
        tacticalDescription:
          'Hütter\'s wingers must be direct, fast, and productive in attack while also pressing from the front. Take on defenders, deliver end product, and cover ground defensively. High output in both attacking and defensive phases.',
        keyStats: ['goals', 'assists', 'dribbles', 'pace', 'pressing_duels'],
        mustHave: ['Pace and directness', 'Goal and assist contribution', 'Pressing from wide', 'Stamina to press and attack'],
        niceToHave: ['Cutting inside to shoot', 'Crossing quality', 'Set-piece delivery'],
        avoidIf: ['Low defensive work rate', 'Inconsistent attacking output', 'Slow in transition'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Creative Midfielder',
        tacticalDescription:
          'Hütter needs midfielders who cover ground, contribute to pressing, and provide creative quality to link defense and attack. Technically capable and physically energetic.',
        keyStats: ['key_passes', 'tackles', 'distance_covered', 'pass_accuracy', 'assists'],
        mustHave: ['Physical energy and work rate', 'Pressing contribution', 'Creative passing', 'Tactical intelligence'],
        niceToHave: ['Goal scoring', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Static and passive', 'Low pressing output', 'Poor creativity in possession'],
      },
    ],
  },
  {
    id: 'sebastian-hoeness',
    name: 'Sebastian Hoeneß',
    nationality: 'German',
    currentClub: 'VfB Stuttgart',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Sebastian Hoeneß has Stuttgart playing exceptional football — among the most intense pressing teams in the Bundesliga. His system is high energy, technically demanding, and incredibly exciting. His teams press at an extraordinary rate, create huge numbers of chances, and play at a relentless pace. A leading figure in the next generation of German tactical thinking.',
    keyPrinciples: [
      'Gegenpressing at maximum intensity across the entire team',
      'Very high defensive line — requires pace in all defenders',
      'Fast, technical build-up under pressure',
      'Wide attacking play with direct, skillful wingers',
      'Midfield that covers enormous distances in both directions',
    ],
    positionalRequirements: [
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Technical Press-and-Dribble Winger',
        tacticalDescription:
          'Stuttgart\'s wingers combine elite pressing with outstanding technical ability. They initiate pressing, cut inside, dribble at pace, and create chances. High intelligence and physical intensity combined with genuine technical skill.',
        keyStats: ['dribbles', 'goals', 'pressing_duels', 'assists', 'pace'],
        mustHave: ['Elite technical dribbling', 'High pressing intensity', 'Goal and assist production', 'Physical pace and stamina'],
        niceToHave: ['Cutting inside from wide', 'Set-piece delivery', 'Long-range shooting'],
        avoidIf: ['Low pressing', 'Limited technically', 'Poor stamina'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Pace-Equipped Ball-Playing CB',
        tacticalDescription:
          'Hoeneß plays an extremely high line, so center-backs must have real pace to handle through balls. Ball-playing ability is also crucial for the high-intensity build-up. A rare combination of speed and technical quality is required.',
        keyStats: ['pace', 'pass_accuracy', 'interceptions', 'aerial_duels'],
        mustHave: ['Genuine pace to cover the high line', 'Comfortable with the ball', 'Good distribution', 'Defensive intelligence'],
        niceToHave: ['Aerial dominance', 'Leadership', 'Stepping up into midfield'],
        avoidIf: ['Slow center-back', 'Nervous in possession', 'Can\'t play out from the back'],
      },
    ],
  },
  {
    id: 'niko-kovac',
    name: 'Niko Kovač',
    nationality: 'Croatian',
    currentClub: 'Borussia Dortmund',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'balanced',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Niko Kovač is a technically sound, organized manager who favors direct, attacking football with clear defensive structure. His Borussia Dortmund are built on fast transitions and individual quality in the final third. He values hard-working, physically capable players who understand their roles within a structured framework.',
    keyPrinciples: [
      'Organized defensive shape before transitioning quickly',
      'Direct play — use individual quality to create and score',
      'Physical intensity and discipline across all positions',
      'Quick counter-attacks using pace of forward players',
      'Solid defensive structure — difficult to break down centrally',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Forward',
        positionCode: 'Attacker',
        profileLabel: 'Clinical Transition Striker',
        tacticalDescription:
          'Kovač needs a striker who can hold up play, link with attacking midfielders, and finish clinically in transition. Physical presence and goal scoring are the priority.',
        keyStats: ['goals', 'hold_up_play', 'link_up_play', 'finishing'],
        mustHave: ['Clinical finishing', 'Physical presence', 'Link-up in transition', 'Movement off the ball'],
        niceToHave: ['Pace in behind', 'Aerial ability', 'Technical skill'],
        avoidIf: ['Poor finishing', 'Can\'t hold up play', 'Not physical enough'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Disciplined Creative Midfielder',
        tacticalDescription:
          'Kovač values midfielders who are tactically disciplined, creative in passing, and physically capable of pressing and recovering. A balance of defensive contribution and attacking creativity.',
        keyStats: ['pass_accuracy', 'key_passes', 'tackles', 'pressing_duels', 'assists'],
        mustHave: ['Tactical discipline', 'Creative passing', 'Defensive contribution', 'Physical capability'],
        niceToHave: ['Goal scoring from midfield', 'Leadership', 'Set-piece delivery'],
        avoidIf: ['Defensively neglectful', 'Poor decision-making', 'Limited physically'],
      },
    ],
  },
  {
    id: 'marco-rose',
    name: 'Marco Rose',
    nationality: 'German',
    currentClub: 'RB Leipzig',
    formations: ['4-3-3', '4-2-2-2'],
    style: {
      pressing: 'gegenpressing',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'very_fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Marco Rose embodies the RB Leipzig pressing philosophy — intense gegenpressing, high defensive line, and rapid vertical attacks. His teams are among the most physically demanding to face in European football, using organized pressing traps and fast transitions with the classic RB energy.',
    keyPrinciples: [
      'Intense gegenpressing — coordinated pressing traps',
      'High line that compresses space against the opponent',
      'Rapid vertical attacks after winning possession',
      'High pressing output from every player on the pitch',
      'Technical quality to execute at very high speed',
    ],
    positionalRequirements: [
      {
        position: 'Striker',
        positionCode: 'Attacker',
        profileLabel: 'High-Pressing Vertical Striker',
        tacticalDescription:
          'Rose needs a striker in the RB mold — presses ferociously, runs in behind, and finishes at pace. Think Werner or Openda — explosive, direct, and constantly threatening in behind. Must lead the press from the front.',
        keyStats: ['pace', 'pressing_duels', 'goals', 'runs_behind_defense'],
        mustHave: ['Elite pressing from the front', 'Pace to exploit space in behind', 'Goal scoring', 'Physical stamina'],
        niceToHave: ['Technical quality for link-up', 'Versatility to play wide', 'Dribbling ability'],
        avoidIf: ['Doesn\'t press', 'Can\'t exploit space in behind', 'Low stamina'],
      },
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Athletic High-Line Defender',
        tacticalDescription:
          'Rose\'s high line demands athletic, fast center-backs who can press forward and recover quickly. Must also be technically capable to play out from the back under pressure in the RB system.',
        keyStats: ['pace', 'aerial_duels', 'interceptions', 'pass_accuracy', 'pressing_duels'],
        mustHave: ['Pace to defend the high line', 'Comfortable pressing forward', 'Ball-playing quality', 'Aggressive defensive action'],
        niceToHave: ['Aerial dominance', 'Leadership', 'Long-range distribution'],
        avoidIf: ['Slow defender', 'Poor in possession', 'Passive in defense'],
      },
    ],
  },
  {
    id: 'franck-haise',
    name: 'Franck Haise',
    nationality: 'French',
    currentClub: 'OGC Nice',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Franck Haise is one of the most respected coaches in French football — building exciting, pressing-oriented teams at Lens before moving to Nice. His teams are disciplined, hard-working, and tactically organized, always pressing at a high level with clear attacking patterns. He develops young players well and creates a positive, energetic team environment.',
    keyPrinciples: [
      'Organized high press — team-based pressing with clear triggers',
      'Wide attacking play with direct wingers',
      'Compact defensive shape when not pressing',
      'Quick combination play in the final third',
      'Developing collective team identity and team spirit',
    ],
    positionalRequirements: [
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Dynamic Attacking Winger',
        tacticalDescription:
          'Haise\'s wingers are the key to his attacking system — direct, fast, and hard-working. They press from wide, run at defenders, and deliver end product in goals and assists. Must contribute defensively as well.',
        keyStats: ['goals', 'assists', 'dribbles', 'pressing_duels', 'crosses'],
        mustHave: ['Directness and pace', 'Goal and assist output', 'Defensive tracking', 'Pressing from wide areas'],
        niceToHave: ['Cutting inside to shoot', 'Set-piece delivery', 'Versatility'],
        avoidIf: ['Low defensive work rate', 'Inconsistent output', 'Avoids pressing'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Pressing Midfielder',
        tacticalDescription:
          'Haise needs midfielders who contribute in both defensive and attacking phases — covering ground, pressing, and creating. A complete midfielder with physical attributes and technical quality.',
        keyStats: ['tackles', 'key_passes', 'distance_covered', 'pass_accuracy', 'assists'],
        mustHave: ['Work rate and pressing', 'Technical passing', 'Ball-winning', 'Tactical discipline'],
        niceToHave: ['Goal scoring', 'Long-range shooting', 'Leadership'],
        avoidIf: ['One-dimensional', 'Poor pressing', 'Low physical output'],
      },
    ],
  },
  {
    id: 'marco-baroni',
    name: 'Marco Baroni',
    nationality: 'Italian',
    currentClub: 'Lazio',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Marco Baroni has Lazio playing attractive, attacking football — organized pressing, technical build-up, and creative play in the final third. He values technically gifted players who work hard without the ball and is known for developing young talent. His teams are progressive and entertaining.',
    keyPrinciples: [
      'Organized pressing from front to back',
      'Technical build-up with short passing',
      'Wide attacking play with creative input',
      'Balanced structure — disciplined but attacking',
      'Young player development and team cohesion',
    ],
    positionalRequirements: [
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Technical Creative Winger',
        tacticalDescription:
          'Baroni loves wingers who are creative, technically gifted, and capable of both creating and scoring. Must also contribute to pressing and defensive work.',
        keyStats: ['key_passes', 'dribbles', 'assists', 'goals', 'pressing_duels'],
        mustHave: ['Technical creativity', 'Goal and assist contribution', 'Pressing from wide', 'Pace and directness'],
        niceToHave: ['Set-piece delivery', 'Cutting inside', 'Versatility across the attack'],
        avoidIf: ['Low work rate', 'Technically limited', 'Passive without the ball'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Dynamic Creative Midfielder',
        tacticalDescription:
          'Baroni\'s midfielders must be creative in possession, contribute to pressing, and cover ground. A combination of creativity and work ethic.',
        keyStats: ['key_passes', 'assists', 'pressing_duels', 'pass_accuracy', 'distance_covered'],
        mustHave: ['Creative passing quality', 'Pressing contribution', 'Work rate', 'Technical reliability'],
        niceToHave: ['Goal scoring', 'Leadership', 'Long-range shooting'],
        avoidIf: ['Low creativity', 'Poor defensive contribution', 'Limited work rate'],
      },
    ],
  },
  {
    id: 'paulo-fonseca',
    name: 'Paulo Fonseca',
    nationality: 'Portuguese',
    currentClub: 'Olympique Lyonnais',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Paulo Fonseca is an attack-minded coach who builds proactive, technically sophisticated teams. His system involves high pressing, organized attacking patterns, and technical demands throughout the squad. He prefers technical players who can execute his positional concepts, and his teams aim to control games through pressing and possession rather than sitting deep.',
    keyPrinciples: [
      'High defensive line with organized pressing',
      'Technical build-up from the back',
      'Attacking patterns through midfield and wide areas',
      'Compact shape that presses as a unit',
      'Full-backs involved heavily in attack',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Forward',
        positionCode: 'Attacker',
        profileLabel: 'Technical Pressing Striker',
        tacticalDescription:
          'Fonseca needs a striker who leads the press and participates actively in tactical structure. Not just a goal scorer — a tactical player who holds, links, runs, and presses. Technical quality and intelligence over pure physicality.',
        keyStats: ['goals', 'pressing_duels', 'link_up_play', 'key_passes'],
        mustHave: ['Press from the front', 'Link-up play', 'Technical quality', 'Goal scoring'],
        niceToHave: ['Pace in behind', 'Aerial ability', 'Hold-up under pressure'],
        avoidIf: ['Static goal hanger', 'Low pressing contribution', 'Technical limitations'],
      },
      {
        position: 'Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Technically Gifted Midfield Controller',
        tacticalDescription:
          'Fonseca values midfielders who control tempo, press effectively, and contribute to build-up. Technical quality, composure under pressure, and tactical intelligence are the markers of his ideal midfielder.',
        keyStats: ['pass_accuracy', 'key_passes', 'pressing_duels', 'dribbles', 'interceptions'],
        mustHave: ['Technical passing quality', 'Pressing contribution', 'Composure in possession', 'Positioning intelligence'],
        niceToHave: ['Goal scoring from deep', 'Long-range shooting', 'Set-piece delivery'],
        avoidIf: ['Limited technically', 'Doesn\'t press', 'Poor decision-making'],
      },
    ],
  },
  {
    id: 'scott-parker',
    name: 'Scott Parker',
    nationality: 'English',
    currentClub: 'Burnley',
    formations: ['4-2-3-1', '4-4-2'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Scott Parker is a pragmatic, well-organised coach who builds compact, disciplined sides that are hard to beat. His teams are structured in and out of possession, using a defined shape and transitioning quickly on the break. A strong defensive record is the foundation, with direct, purposeful attacking play layered on top. Physical, energetic players who press and work the channels thrive under him.',
    keyPrinciples: [
      'Organised, compact defensive shape',
      'Fast vertical transitions on turnovers',
      'Physical and energetic pressing',
      'Wide areas used to stretch play',
      'Pragmatic approach — results-driven',
    ],
    positionalRequirements: [
      {
        position: 'Winger / Wide Forward',
        positionCode: 'Attacker',
        profileLabel: 'Direct, High-Energy Wide Player',
        tacticalDescription:
          'Parker needs wide players who are direct, pace-driven, and capable of running the channels. They must also contribute defensively and be willing to press.',
        keyStats: ['dribbles', 'goals', 'assists', 'pressing_duels', 'distance_covered'],
        mustHave: ['Pace and directness', 'Defensive work rate', 'Channel running', 'Goal threat'],
        niceToHave: ['Set-piece delivery', 'Cut inside ability', 'Aerial contribution'],
        avoidIf: ['Low work rate', 'Slow on the counter', 'Unwilling to defend'],
      },
      {
        position: 'Central Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Box-to-Box Engine',
        tacticalDescription:
          'Parker favours midfielders who cover ground, break up play, and drive the team forward in transition. Physicality, energy, and tactical discipline are key.',
        keyStats: ['tackles', 'interceptions', 'distance_covered', 'pass_accuracy', 'duels_won'],
        mustHave: ['Physicality and energy', 'Defensive solidity', 'Work rate', 'Transition speed'],
        niceToHave: ['Goal scoring from deep', 'Creative passing', 'Leadership'],
        avoidIf: ['Physically lightweight', 'Low pressing output', 'Slow in transitions'],
      },
    ],
  },
  {
    id: 'daniel-farke',
    name: 'Daniel Farke',
    nationality: 'German',
    currentClub: 'Leeds United',
    formations: ['4-2-3-1', '4-3-3'],
    style: {
      pressing: 'high',
      defensiveLine: 'high',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Daniel Farke has a clear footballing identity: progressive, possession-based football with high pressing and an attacking mindset. His teams build from the back with composure, press intensely to win the ball high, and attack with width and movement. Technical quality throughout the squad is essential. He has a strong track record of organising promoted sides to play attractive football.',
    keyPrinciples: [
      'High pressing and aggressive ball-winning',
      'Technical build-up from the goalkeeper up',
      'Width and movement to stretch defences',
      'High defensive line with coordinated pressing',
      'Progressive, attacking football with clear structure',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Ball-Playing Defender',
        tacticalDescription:
          'Farke requires centre-backs who are comfortable on the ball and can initiate the build-up. They must be calm under pressure, capable of playing out from the back, and confident stepping into midfield.',
        keyStats: ['pass_accuracy', 'long_balls', 'duels_won', 'interceptions', 'dribbles'],
        mustHave: ['Comfortable in possession', 'High defensive line ability', 'Pass accuracy', 'Composure under pressure'],
        niceToHave: ['Left-foot ability', 'Set-piece threat', 'Leadership'],
        avoidIf: ['Doesn\'t play from the back', 'Uncomfortable under high press', 'Limited with the ball'],
      },
      {
        position: 'Winger',
        positionCode: 'Attacker',
        profileLabel: 'Dynamic Technical Winger',
        tacticalDescription:
          'Farke\'s wide players must be dynamic, technically skilled, and capable of both creative play and defensive contribution. Pace, dribbling, and end product are key in his attacking system.',
        keyStats: ['dribbles', 'key_passes', 'assists', 'goals', 'pressing_duels'],
        mustHave: ['Technical quality', 'Pace and directness', 'End product', 'Pressing contribution'],
        niceToHave: ['Cutting inside', 'Set-piece delivery', 'Link-up play'],
        avoidIf: ['Technically limited', 'Poor defensive effort', 'Static play'],
      },
    ],
  },
  {
    id: 'regis-le-bris',
    name: 'Régis Le Bris',
    nationality: 'French',
    currentClub: 'Sunderland',
    formations: ['4-3-3', '4-2-3-1'],
    style: {
      pressing: 'high',
      defensiveLine: 'medium',
      buildUp: 'short_passing',
      width: 'wide',
      tempo: 'fast',
      attackingMentality: 'attacking',
    },
    tacticalSummary:
      'Régis Le Bris is a progressive French coach who built his reputation at Lorient before guiding Sunderland back to the Premier League. His teams play with intensity, structured pressing, and technical ambition. He values collective organisation, intelligent movement, and technical players who contribute both in and out of possession. His progressive approach has drawn comparisons with the French coaching school.',
    keyPrinciples: [
      'High-intensity pressing as a collective unit',
      'Structured positional play with technical demands',
      'Dynamic attacking movement and width',
      'Intelligence and adaptability on and off the ball',
      'Team-first mentality with high energy',
    ],
    positionalRequirements: [
      {
        position: 'Forward / Striker',
        positionCode: 'Attacker',
        profileLabel: 'Press-Led Mobile Striker',
        tacticalDescription:
          'Le Bris needs forwards who press from the front, offer movement in behind, and contribute to the team structure. Goal scoring combined with high work rate and pressing is the ideal profile.',
        keyStats: ['goals', 'pressing_duels', 'dribbles', 'key_passes', 'distance_covered'],
        mustHave: ['Pressing commitment', 'Movement in behind', 'Goal scoring', 'Work rate'],
        niceToHave: ['Link-up play', 'Pace to exploit space', 'Set-piece threat'],
        avoidIf: ['Static striker profile', 'Low pressing output', 'Poor work rate'],
      },
      {
        position: 'Central Midfielder',
        positionCode: 'Midfielder',
        profileLabel: 'Technical Pressing Midfielder',
        tacticalDescription:
          'Le Bris\'s midfielders must combine technical quality with pressing intensity. They need to control tempo, contribute defensively, and drive the team forward in possession.',
        keyStats: ['pass_accuracy', 'pressing_duels', 'key_passes', 'interceptions', 'distance_covered'],
        mustHave: ['Technical passing quality', 'Pressing commitment', 'Positional intelligence', 'Work rate'],
        niceToHave: ['Goal threat from deep', 'Set-piece delivery', 'Leadership qualities'],
        avoidIf: ['Limited technically', 'Doesn\'t press', 'Poor positioning off the ball'],
      },
    ],
  },
  {
    id: 'vitor-pereira',
    name: 'Vitor Pereira',
    nationality: 'Portuguese',
    currentClub: 'Nottingham Forest',
    formations: ['4-2-3-1', '4-4-2', '4-1-4-1'],
    style: {
      pressing: 'medium',
      defensiveLine: 'medium',
      buildUp: 'direct',
      width: 'wide',
      tempo: 'medium',
      attackingMentality: 'balanced',
    },
    tacticalSummary:
      'Vitor Pereira is a pragmatic, experienced Portuguese coach who builds compact, well-organised sides. His teams are hard to break down, disciplined in shape, and dangerous on the counter. He values defensive solidity as the foundation, with direct, physical attacking play through wide areas and set-pieces. At Nottingham Forest, he has built a resilient side that is difficult to play against and capable of beating top teams.',
    keyPrinciples: [
      'Defensive compactness and organisation',
      'Quick, direct counter-attacks',
      'Physical duels and winning second balls',
      'Set-piece threat at both ends',
      'Hard-working players who sacrifice for the team',
    ],
    positionalRequirements: [
      {
        position: 'Centre-Back',
        positionCode: 'Defender',
        profileLabel: 'Commanding Physical Defender',
        tacticalDescription:
          'Pereira needs centre-backs who are dominant in the air, strong in duels, and reliable in a compact defensive block. Leadership and defensive intelligence are key.',
        keyStats: ['duels_won', 'aerial_duels', 'interceptions', 'clearances', 'tackles'],
        mustHave: ['Aerial dominance', 'Physical strength', 'Defensive positioning', 'Leadership'],
        niceToHave: ['Ball-playing ability', 'Set-piece threat', 'Left-foot option'],
        avoidIf: ['Vulnerable aerially', 'Poor in duels', 'Slow positioning'],
      },
      {
        position: 'Winger / Wide Midfielder',
        positionCode: 'Attacker',
        profileLabel: 'Direct, Hard-Working Wide Player',
        tacticalDescription:
          'Pereira\'s wide players need to work tirelessly in both directions — tracking back defensively and driving forward on the counter. Pace, directness, and defensive contribution are essential.',
        keyStats: ['dribbles', 'pressing_duels', 'goals', 'assists', 'distance_covered'],
        mustHave: ['Pace and directness', 'Defensive work rate', 'Physical stamina', 'Counter-attack threat'],
        niceToHave: ['Set-piece delivery', 'Crossing ability', 'Goal contribution'],
        avoidIf: ['Doesn\'t track back', 'Physically lightweight', 'Slow in transitions'],
      },
    ],
  },
]

export function getManagerByName(name: string): ManagerProfile | undefined {
  const lower = name.toLowerCase().trim()

  // 1. Exact full-name match
  const exact = managers.find((m) => m.name.toLowerCase() === lower)
  if (exact) return exact

  // 2. Normalised match — strip diacritics for names like "Jürgen" vs "Jurgen"
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const normLower = normalize(lower)
  const normMatch = managers.find((m) => normalize(m.name) === normLower)
  if (normMatch) return normMatch

  // 3. Exact last-name-only match (API sometimes returns just the surname)
  //    Requires the last name to be at least 4 chars and an exact word match —
  //    NOT a substring — to prevent "Rosenior" matching "Rose" or "Frank" matching "T. Frank"
  const parts = lower.split(/\s+/)
  const lastWord = parts[parts.length - 1]
  if (lastWord.length >= 4 && !lastWord.includes('.')) {
    const lastNameMatch = managers.find((m) => {
      const dbLastName = m.name.split(' ').pop()?.toLowerCase() || ''
      return dbLastName === lastWord
    })
    if (lastNameMatch) return lastNameMatch
  }

  return undefined
}

export function getAllManagers(): ManagerProfile[] {
  return managers
}

export function getManagerById(id: string): ManagerProfile | undefined {
  return managers.find((m) => m.id === id)
}

export default managers
