// Keep lock-screen messages readable even when team names or provider text are long.
const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const sportName = sport => sport === 'football' ? '⚽ Fußball' : sport === 'del' ? '🏒 DEL' : '🏒 NHL';
const match = game => `${text(game.teams?.home?.name)} – ${text(game.teams?.away?.name)}`;
const score = game => `${game.goals?.home ?? '–'}:${game.goals?.away ?? '–'}`;

export function eventMessage(game, sport, event) {
  const parts = text(event.label).split(' · ');
  let heading = parts[0];
  let detail = parts.slice(1).join(' · ');
  if(event.type==='lineup')return {title:`${sportName(sport)} · ${heading}`,body:[match(game),detail,sport==='nhl'?'Spielkader bestätigt · Reihen weiterhin offen':'Startelf veröffentlicht'].filter(Boolean).join('\n')};
  if (event.type === 'goal') {
    heading = 'Tor';
    const team = [game.teams?.home, game.teams?.away].find(t => event.teamId != null && String(t?.id) === String(event.teamId));
    const scorer = text(event.scorer);
    // The label also carries the provider's event time. Never treat the latest
    // fixture score as the score at an earlier goal when several arrive together.
    const timing = text(event.time);
    heading += timing ? ` · ${timing}` : '';
    detail = scorer ? `Torschütze: ${scorer}${team ? ` (${text(team.name)})` : ''}` : 'Torschütze noch nicht gemeldet';
  } else if (event.type === 'finished') {
    heading = sport === 'football' ? 'Abpfiff' : 'Spielende';
    detail = '';
  }
  return {
    title: `${sportName(sport)} · ${heading}`,
    body: [match(game), `${event.type === 'finished' ? 'Endstand' : 'Aktuell'}: ${score(game)}`, detail].filter(Boolean).join('\n')
  };
}

export function liveTipMessage(game, sport, label) {
  const parts = text(label).split(' · ');
  return {
    title: `${sportName(sport)} · Live-Tipp`,
    body: [`${match(game)} · ${score(game)}`, parts.slice(2).join(' · '), parts[1]].filter(Boolean).join('\n')
  };
}
