"""Generates the scene templates web/<scene>.html (one browser source per scene, also embedded in overlay.html).

    python3 tools/generate_scenes.py

The scene files are generated – change the layout here, then run this script. The style block of
end.html is kept (it is edited in end.html itself).

Building blocks (all positions in px on the 1920 × 1080 canvas, d = delay of the entry animation in s):
    box …            framed box with a head line (texts.<key>) and a field
    cam …            camera/content window (VDO.Ninja, clips) with a name badge
    sponsor …        sponsor box (top right or bottom)
    data-part        stable name of a part: scene switches keep and move parts with the same name
"""

import os
import re

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
END_STYLE = re.search(r"<style>.*?</style>", open(os.path.join(WEB, "end.html"), encoding="utf-8").read(), re.S).group(0)

HEAD = '''<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' file: http://absolute; script-src 'self' file: http://absolute; style-src 'self' file: http://absolute 'unsafe-inline'; img-src * data: blob:; media-src 'self' file: http://absolute blob: data:; font-src 'self' file: http://absolute data:; frame-src 'self' file: http://absolute https:; connect-src 'self' http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>{title}</title>
<link rel="stylesheet" href="cast.css">
{style}
</head>
<body data-scene="{scene}">
{backdrop}{brand}'''
FOOT = '''
<script src="themes.js"></script>
<script src="connection.js"></script>
<script src="cast-core.js"></script>
<script src="cast.js"></script>
</body>
</html>
'''
MUSIC = '<div class="music" data-part="music"></div>\n'
VS_FIELD = '<span data-matching><span data-team-name="a"></span>&nbsp;<span class="vs-small">vs</span>&nbsp;<span data-team-name="b"></span></span>'


def timer_box(x, y, label, d, w=228):
    """Box with a countdown (head line texts.<label>), e.g. „START IN“."""
    return f'''<div class="box enter" data-part="timer" style="left:{x}px;top:{y}px;width:{w}px;height:126px;--d:{d}s">
  <div class="box-head" data-t="texts.{label}"></div>
  <div class="box-field timer"></div>
</div>
'''


def title_box(x, y, w, d, h=126, font_size=66, field='<span data-t="texts.title" data-matching></span>'):
    """Box with the big title (texts.title) under a ticker head line."""
    return f'''<div class="box enter" data-part="title" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-head ticker" style="--kh:46px;--kf:23px"></div>
  <div class="box-field" style="font-size:{font_size}px">{field}</div>
</div>
'''


def head_box(x, y, w, d, head, field, h=126, font_size=58):
    """Box with a head line texts.<head> and any field content (e.g. team names)."""
    return f'''<div class="box enter" data-part="head" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-head" data-t="texts.{head}"></div>
  <div class="box-field" style="font-size:{font_size}px">{field}</div>
</div>
'''


def matchup(x, y, w, d, h=126):
    """Box with both team logos and „vs“."""
    return f'''<div class="box enter" data-part="matchup" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-head" data-t="texts.matchUp"></div>
  <div class="box-field" style="padding:0"><div class="matchup"><div class="team-logo a"></div><div class="vs">vs</div><div class="team-logo b"></div></div></div>
</div>
'''


def badge(who, guest=False):
    """Name badge of a caster or guest (name and addition from the state)."""
    role = '    <div class="role" data-t="texts.interview"></div>\n' if guest else ''
    return f'''  <div class="box badge">
{role}    <div class="box-head" data-t="caster.{who}.name"></div>
    <div class="box-field" data-t="caster.{who}.addition"></div>
  </div>
'''


def cam(x, y, w, h, name, d, who=None, guest=False, small=False):
    """Camera window; without `who` it is the content window (clips, browser).

    `small`: small name tag inside the window (name only) – for many windows, e.g. viewer cams."""
    inside = badge(who, guest) if who else ''
    source = who or 'content'
    tag = ' data-tag="small"' if small else ''
    return f'''<div class="cam enter"{tag} data-source="{source}" data-part="cam-{source}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="cam-info"><b>{name}</b>{w} × {h} · X {x} · Y {y}</div>
{inside}</div>
'''


def bottom_cast(d=.5, with_sponsor=False):
    """Title and match-up at the bottom – the usual footer of the cast scenes.

    With `with_sponsor` the sponsor is the fourth box of the bar (same height, the whole bar centered)."""
    if with_sponsor:
        return title_box(194, 868, 1000, d) + matchup(1215, 868, 250, d + .1) + bar_sponsor(1486, d + .2)
    return title_box(254, 868, 1100, d) + matchup(1386, 868, 280, d + .1)


def sponsor(x, y, w, h, d=.6, right=None):
    """Sponsor box at `x` (or `right` px from the right edge)."""
    position = f"right:{right}px" if right is not None else f"left:{x}px"
    return f'''<div class="box sponsor" data-part="sponsor" style="{position};top:{y}px;width:{w}px;height:{h}px"><div class="box-head" data-t="texts.sponsorLabel"></div><div class="sponsor-field"></div></div>
'''


def bar_sponsor(x, d=.6, w=240):
    """Sponsor as a box of the bottom bar: as high as the other boxes, logo centered (3.0 – no longer floating top right)."""
    return f'''<div class="box sponsor in-bar" data-part="sponsor" style="left:{x}px;top:868px;width:{w}px;height:126px"><div class="box-head" data-t="texts.sponsorLabel"></div><div class="sponsor-field"></div></div>
'''


# the bottom bar of intro and pause: timer · title · match-up · sponsor, 21 px apart and centered on the screen
BAR = dict(timer=184, title=433, matchup=1246, sponsor=1495)


def scene(file_name, title, content, style='', max_brand=None, without_backdrop=False, without_brand=False):
    """Write one scene file."""
    max_attribute = f' data-max="{max_brand}"' if max_brand else ''
    backdrop = '' if without_backdrop else '<div class="backdrop"><div class="bg-empty"><img alt=""></div><div class="bg-dark"></div><div class="bg-veil"></div></div>\n'
    brand = '' if without_brand else f'<div class="brand enter" data-part="brand" style="--d:.1s"{max_attribute}></div>\n'
    with open(os.path.join(WEB, file_name), "w", encoding="utf-8") as f:
        f.write(HEAD.format(title=title, style=style, scene=file_name[:-5], backdrop=backdrop, brand=brand) + content + FOOT)


scene('intro.html', 'Intro', MUSIC + timer_box(BAR['timer'], 868, 'startIn', .3) + title_box(BAR['title'], 868, 792, .4) +
      matchup(BAR['matchup'], 868, 228, .5) + bar_sponsor(BAR['sponsor']))
scene('cast-duo.html', 'Cast Duo',
      cam(120, 230, 800, 450, 'Caster 1', .2, 'c1') + cam(1000, 230, 800, 450, 'Caster 2', .3, 'c2') + bottom_cast(.7, with_sponsor=True))
scene('cast-solo.html', 'Cast Solo', cam(448, 200, 1024, 576, 'Caster', .2, 'c1') + bottom_cast(.6, with_sponsor=True))
scene('cast-duo-clips.html', 'Cast Duo + Clips',
      title_box(482, 47, 919, .2) + matchup(1433, 47, 430, .3) +
      cam(57, 212, 1344, 756, 'Clips / Browser', .4) +
      cam(1433, 212, 430, 242, 'Caster 1', .5, 'c1') + cam(1433, 586, 430, 242, 'Caster 2', .6, 'c2'), max_brand=400)
scene('cast-solo-clips.html', 'Cast Solo + Clips',
      title_box(482, 47, 1381, .2) + cam(57, 212, 1344, 756, 'Clips / Browser', .3) +
      cam(1433, 212, 430, 242, 'Caster', .4, 'c1') + matchup(1433, 600, 430, .6, h=150), max_brand=400)
scene('cast-duo-interview.html', 'Cast Duo + Interview',
      cam(48, 290, 592, 333, 'Caster 1', .2, 'c1') + cam(664, 290, 592, 333, 'Caster 2', .3, 'c2') + cam(1280, 290, 592, 333, 'Gast', .4, 'guest', True) + bottom_cast(.8, with_sponsor=True))
scene('cast-solo-interview.html', 'Cast Solo + Interview',
      cam(120, 230, 800, 450, 'Caster', .2, 'c1') + cam(1000, 230, 800, 450, 'Gast', .3, 'guest', True) + bottom_cast(.7, with_sponsor=True))
# 3 casters: side by side (like the interview) or the host large with two co-casters stacked on the right
scene('cast-trio.html', 'Cast Trio',
      cam(48, 290, 592, 333, 'Caster 1', .2, 'c1') + cam(664, 290, 592, 333, 'Caster 2', .3, 'c2') + cam(1280, 290, 592, 333, 'Caster 3', .4, 'c3') +
      bottom_cast(.8, with_sponsor=True))
scene('cast-trio-host.html', 'Cast Trio – Moderator groß',
      cam(120, 162, 1088, 612, 'Caster 1', .2, 'c1') + cam(1320, 162, 480, 270, 'Caster 2', .3, 'c2') + cam(1320, 516, 480, 270, 'Caster 3', .4, 'c3') +
      bottom_cast(.8, with_sponsor=True))
# 4 persons: both casters and two more people (guest, analyst, tournament admin …) in a 2 × 2 grid
scene('cast-quad.html', 'Cast 4 Personen',
      cam(371, 50, 569, 320, 'Caster 1', .2, 'c1') + cam(980, 50, 569, 320, 'Caster 2', .3, 'c2') +
      cam(371, 462, 569, 320, 'Person 3', .4, 'p3') + cam(980, 462, 569, 320, 'Person 4', .5, 'p4') + bottom_cast(.8, with_sponsor=True))
# viewer cams: a wall of six tiles, or four tiles with both casters on the right (like the clips scene)
scene('viewers.html', 'Zuschauer-Cams',
      head_box(482, 47, 1381, .2, 'viewersTitle', VS_FIELD) +
      ''.join(cam(175 + (i % 3) * 531, 236 + (i // 3) * 305, 507, 285, f'Zuschauer {i + 1}', .3 + i * .05, f'v{i + 1}', small=True) for i in range(6)) +
      bottom_cast(.7), max_brand=400)
scene('viewers-cast.html', 'Zuschauer + Caster',
      title_box(482, 47, 919, .2) + matchup(1433, 47, 430, .3) +
      ''.join(cam(57 + (i % 2) * 684, 212 + (i // 2) * 384, 660, 372, f'Zuschauer {i + 1}', .3 + i * .05, f'v{i + 1}', small=True) for i in range(4)) +
      cam(1433, 212, 430, 242, 'Caster 1', .5, 'c1') + cam(1433, 586, 430, 242, 'Caster 2', .6, 'c2'), max_brand=400)
scene('pause.html', 'Pause', MUSIC + '''<div data-part="large" style="left:0;right:0;top:330px;display:flex;justify-content:center">
  <div class="box large enter" style="--d:.2s">
    <div class="box-head" data-t="texts.pauseTitle"></div>
    <div class="box-field" data-t="texts.pauseBelow"></div>
  </div>
</div>
''' + timer_box(BAR['timer'], 868, 'nextIn', .4) + title_box(BAR['title'], 868, 792, .5) + matchup(BAR['matchup'], 868, 228, .6) +
      bar_sponsor(BAR['sponsor'], .7))
scene('end.html', 'Ende', MUSIC + '''<div data-part="large" style="left:0;right:0;top:230px;display:flex;justify-content:center">
  <div class="box large enter" style="--d:.2s">
    <div class="box-head" data-t="texts.endTitle"></div>
    <div class="box-field" data-t="texts.endBelow"></div>
  </div>
</div>
<div data-part="finalscore" style="left:0;right:0;top:560px;display:flex;justify-content:center">
  <div class="box finalscore enter" style="--d:.45s">
    <div class="box-head" data-t="texts.finalscore"></div>
    <div class="box-field"><div class="end-row">
      <div class="team-logo a"></div><div class="end-name a" data-team-name="a"></div>
      <div class="end-score"><span data-team-score="a"></span><span class="dp">:</span><span data-team-score="b"></span></div>
      <div class="end-name b" data-team-name="b"></div><div class="team-logo b"></div>
    </div></div>
  </div>
</div>
''' + '<div class="series-mini enter" data-part="series-mini" style="left:0;right:0;top:772px;--d:.55s"></div>\n' + title_box(BAR['title'], 868, 792, .6) + bar_sponsor(BAR['matchup'], .7), style=END_STYLE)

scene('map-veto.html', 'Map-Veto',
      head_box(482, 47, 1381, .2, 'mapVeto', VS_FIELD) +
      '<div class="veto enter" data-part="veto" style="left:57px;right:57px;top:236px;height:590px;--d:.35s"></div>\n' +
      bottom_cast(.6), max_brand=400)
scene('players.html', 'Line-ups',
      head_box(482, 47, 1381, .2, 'lineups', VS_FIELD) +
      '<div class="lineup enter" data-team="a" data-part="lineup-a" style="left:57px;top:222px;--d:.35s"></div>\n' +
      '<div class="lineup enter" data-team="b" data-part="lineup-b" style="left:57px;top:530px;--d:.5s"></div>\n' +
      bottom_cast(.7), max_brand=400)

SERIES_FIELD = '<span data-matching><span data-team-name="a"></span><span class="series-total"></span><span data-team-name="b"></span></span>'
scene('series.html', 'Serie',
      head_box(482, 47, 1381, .2, 'series', SERIES_FIELD) +
      '<div class="series-cards enter" data-part="series-cards" style="left:57px;right:57px;top:236px;height:590px;--d:.35s"></div>\n' +
      bottom_cast(.6), max_brand=400)
scene('sponsors.html', 'Sponsoren',
      head_box(482, 47, 1381, .2, 'sponsorsTitle', VS_FIELD) +
      '<div class="sponsor-grid enter" data-part="sponsor-grid" style="left:57px;right:57px;top:230px;height:600px;--d:.35s"></div>\n' +
      bottom_cast(.6), max_brand=400)

# Team introduction: one scene, three slides (team A, team B, comparison) – shown one after another (by hand or automatically);
# cast.js fills players and values and sets data-tislide on the scene. Head and bottom bar stay, the slides fade.
def ti_team(k, d):
    """Slide of one team: logo box, five player cards, four values."""
    vals = ''.join(f'<div class="box enter" style="left:{530 + i * 339}px;top:646px;width:316px;height:166px;--d:{d + .2 + i * .05}s">'
                   f'<div class="box-head" data-ti-word="{w}"></div><div class="box-field ti-value" data-ti="{k}.{f}"></div></div>\n'
                   for i, (w, f) in enumerate([('winRate', 'winrate'), ('matches', 'matches'), ('streak', 'streak'), ('lastFive', 'last')]))
    return (f'<div class="ti-slide" data-slide="{k}">\n'
            f'<div class="box lineup-team ti-logo enter" style="left:57px;top:212px;width:440px;height:600px;--d:{d}s">'
            f'<div class="box-head" data-ti="{k}.head"></div><div class="team-logo {k}"></div>'
            f'<div class="box-field"><span data-team-name="{k}" data-matching></span></div></div>\n'
            f'<div class="lineup ti-players enter" data-ti-players="{k}" style="left:530px;top:212px;width:1333px;height:400px;--d:{d + .1}s"></div>\n'
            + vals + '</div>\n')


TI_HEAD = ('<span data-only="a"><span data-team-name="a" data-matching></span></span>'
           '<span data-only="b"><span data-team-name="b" data-matching></span></span>'
           f'<span data-only="compare">{VS_FIELD}</span>')
scene('teams.html', 'Teams-Vorstellung',
      head_box(482, 47, 1381, .2, 'teamIntro', TI_HEAD) +
      '<div class="ti-slides" data-part="ti-slides">\n' + ti_team('a', .3) + ti_team('b', .3) +
      '<div class="ti-slide" data-slide="compare">\n' +
      ''.join(f'<div class="box lineup-team ti-logo enter" style="left:{x}px;top:212px;width:420px;height:600px;--d:.3s">'
              f'<div class="box-head" data-ti="{k}.head"></div><div class="team-logo {k}"></div>'
              f'<div class="box-field"><span data-team-name="{k}" data-matching></span></div></div>\n' for k, x in (('a', 57), ('b', 1443))) +
      '<div class="box ti-compare enter" style="left:500px;top:212px;width:920px;height:600px;--d:.4s">'
      '<div class="box-head" data-ti-word="compare"></div><div class="box-field ti-tape" data-ti-tape></div></div>\n'
      '</div>\n</div>\n' + bottom_cast(.7), max_brand=400)

# Ingame: almost empty – the game HUD stays free. Only sponsor and graphics.
scene('ingame.html', 'Ingame', sponsor(0, 480, 340, 100, right=30), without_backdrop=True, without_brand=True)


# CS2 live data: scoreboard (both teams), team A, team B, head-to-head
def live_head(head, d=.2):
    """Head box of the CS2 live scenes (shows map and round while live data arrives)."""
    return head_box(482, 47, 956, d, head, '<span class="live-info"></span>', h=126, font_size=46)


scene('scoreboard.html', 'Scoreboard', live_head('scoreboard') +
      '<div class="live-table enter" data-team="a" data-part="stat-a" style="left:100px;top:232px;width:840px;--d:.3s"></div>\n' +
      '<div class="live-table enter" data-team="b" data-part="stat-b" style="left:980px;top:232px;width:840px;--d:.4s"></div>\n', max_brand=400)
for team in ('a', 'b'):
    scene(f'team-{team}.html', 'Team ' + team.upper(), head_box(482, 47, 956, .2, 'teamStats', f'<span data-team-name="{team}"></span>', h=126, font_size=58) +
          f'<div class="live-team enter" data-team="{team}" data-part="live-team" style="left:0;right:0;top:300px;--d:.3s"></div>\n', max_brand=400)
scene('h2h.html', 'Head-to-Head', live_head('h2h') +
      '<div class="live-h2h enter" data-part="live-h2h" style="left:200px;width:1520px;top:250px;--d:.3s"></div>\n', max_brand=400)

# Tournament bracket (single/double elimination, Swiss, GSL)
scene('bracket.html', 'Turnierbaum', head_box(482, 47, 956, .2, 'tournament', '<span class="tournament-name"></span>', h=126, font_size=50) +
      '<div class="tournament-tree enter" data-part="tournament" style="left:60px;right:60px;top:210px;bottom:40px;--d:.3s"></div>\n', max_brand=400)
print("ok")
