import os
WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
import re
ENDE_STIL = re.search(r"<style>.*?</style>", open(os.path.join(WEB, 'ende.html')).read(), re.S).group(0)
KOPF='''<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' file: http://absolute; script-src 'self' file: http://absolute; style-src 'self' file: http://absolute 'unsafe-inline'; img-src * data: blob:; media-src 'self' file: http://absolute blob: data:; font-src 'self' file: http://absolute data:; frame-src 'self' file: http://absolute https:; connect-src 'self' http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>{titel}</title>
<link rel="stylesheet" href="cast.css">
{stil}
</head>
<body data-szene="{szene}">
{hg}{marke}'''
FUSS='''
<script src="themes.js"></script>
<script src="verbindung.js"></script>
<script src="cast-kern.js"></script>
<script src="cast.js"></script>
</body>
</html>
'''
MUSIK='<div class="musik" data-teil="musik"></div>\n'
def timerbox(x,y,label,d,w=228): return f'''<div class="box rein" data-teil="timer" style="left:{x}px;top:{y}px;width:{w}px;height:126px;--d:{d}s">
  <div class="box-kopf" data-t="texte.{label}"></div>
  <div class="box-feld timer"></div>
</div>
'''
def titelbox(x,y,w,d,h=126,tf=66,feld='<span data-t="texte.titel" data-passend></span>'):
    return f'''<div class="box rein" data-teil="titel" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-kopf ticker" style="--kh:46px;--kf:23px"></div>
  <div class="box-feld" style="font-size:{tf}px">{feld}</div>
</div>
'''
def kopfbox(x,y,w,d,kopf,feld,h=126,tf=58):
    return f'''<div class="box rein" data-teil="kopf" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-kopf" data-t="texte.{kopf}"></div>
  <div class="box-feld" style="font-size:{tf}px">{feld}</div>
</div>
'''
def matchup(x,y,w,d,h=126):
    return f'''<div class="box rein" data-teil="matchup" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="box-kopf" data-t="texte.matchUp"></div>
  <div class="box-feld" style="padding:0"><div class="matchup"><div class="team-logo a"></div><div class="vs">vs</div><div class="team-logo b"></div></div></div>
</div>
'''
def schild(wer,gast=False):
    rolle='    <div class="rolle" data-t="texte.interview"></div>\n' if gast else ''
    return f'''  <div class="box schild">
{rolle}    <div class="box-kopf" data-t="caster.{wer}.name"></div>
    <div class="box-feld" data-t="caster.{wer}.zusatz"></div>
  </div>
'''
def kam(x,y,w,h,name,d,wer=None,gast=False):
    innen = schild(wer,gast) if wer else ''
    quelle = wer or 'inhalt'
    return f'''<div class="kam rein" data-quelle="{quelle}" data-teil="kam-{quelle}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;--d:{d}s">
  <div class="kam-info"><b>{name}</b>{w} × {h} · X {x} · Y {y}</div>
{innen}</div>
'''
def bottom_cast(d=.5): return titelbox(254,868,1100,d)+matchup(1386,868,280,d+.1)
def sponsor(x,y,w,h,d=.6, rechts=None):
    pos = f"right:{rechts}px" if rechts is not None else f"left:{x}px"
    return f'''<div class="box sponsor" data-teil="sponsor" style="{pos};top:{y}px;width:{w}px;height:{h}px"><div class="box-kopf" data-t="texte.sponsorLabel"></div><div class="sponsor-feld"></div></div>
'''
SP_OBEN = None
def szene(datei,titel,inhalt,stil='',maxb=None,ohne_hg=False,ohne_marke=False):
    maxattr = f' data-max="{maxb}"' if maxb else ''
    hg = '' if ohne_hg else '<div class="hg"><div class="hg-leer"><img alt=""></div><div class="hg-dunkel"></div><div class="hg-schleier"></div></div>\n'
    marke = '' if ohne_marke else f'<div class="marke rein" data-teil="marke" style="--d:.1s"{maxattr}></div>\n'
    open(os.path.join(WEB, datei),'w').write(KOPF.format(titel=titel,stil=stil,szene=datei[:-5],maxattr=maxattr,hg=hg,marke=marke)+inhalt+FUSS)

szene('intro.html','Intro', MUSIK+sponsor(0,190,520,116,rechts=57)+timerbox(315,868,'startIn',.3)+titelbox(564,868,792,.4)+matchup(1377,868,228,.5))
szene('cast-duo.html','Cast Duo',
  kam(120,230,800,450,'Caster 1',.2,'c1')+kam(1000,230,800,450,'Caster 2',.3,'c2')+bottom_cast(.7)+sponsor(0,47,440,125,rechts=57))
szene('cast-solo.html','Cast Solo', kam(448,200,1024,576,'Caster',.2,'c1')+bottom_cast(.6)+sponsor(0,47,400,125,rechts=57))
szene('cast-duo-clips.html','Cast Duo + Clips',
  titelbox(482,47,919,.2)+matchup(1433,47,430,.3)+
  kam(57,212,1344,756,'Clips / Browser',.4)+
  kam(1433,212,430,242,'Caster 1',.5,'c1')+kam(1433,586,430,242,'Caster 2',.6,'c2'), maxb=400)
szene('cast-solo-clips.html','Cast Solo + Clips',
  titelbox(482,47,1381,.2)+kam(57,212,1344,756,'Clips / Browser',.3)+
  kam(1433,212,430,242,'Caster',.4,'c1')+matchup(1433,600,430,.6,h=150), maxb=400)
szene('cast-duo-interview.html','Cast Duo + Interview',
  kam(48,290,592,333,'Caster 1',.2,'c1')+kam(664,290,592,333,'Caster 2',.3,'c2')+kam(1280,290,592,333,'Gast',.4,'gast',True)+bottom_cast(.8)+sponsor(0,47,440,125,rechts=57))
szene('cast-solo-interview.html','Cast Solo + Interview',
  kam(120,230,800,450,'Caster',.2,'c1')+kam(1000,230,800,450,'Gast',.3,'gast',True)+bottom_cast(.7)+sponsor(0,47,440,125,rechts=57))
szene('pause.html','Pause', MUSIK+sponsor(0,190,520,116,rechts=57)+'''<div data-teil="gross" style="left:0;right:0;top:330px;display:flex;justify-content:center">
  <div class="box gross rein" style="--d:.2s">
    <div class="box-kopf" data-t="texte.pauseTitel"></div>
    <div class="box-feld" data-t="texte.pauseUnter"></div>
  </div>
</div>
'''+timerbox(315,868,'weiterIn',.4)+titelbox(564,868,792,.5)+matchup(1377,868,228,.6))
szene('ende.html','Ende', MUSIK+'''<div data-teil="gross" style="left:0;right:0;top:230px;display:flex;justify-content:center">
  <div class="box gross rein" style="--d:.2s">
    <div class="box-kopf" data-t="texte.endeTitel"></div>
    <div class="box-feld" data-t="texte.endeUnter"></div>
  </div>
</div>
<div data-teil="endstand" style="left:0;right:0;top:560px;display:flex;justify-content:center">
  <div class="box endstand rein" style="--d:.45s">
    <div class="box-kopf" data-t="texte.endstand"></div>
    <div class="box-feld"><div class="end-reihe">
      <div class="team-logo a"></div><div class="end-name a" data-team-name="a"></div>
      <div class="end-score"><span data-team-score="a"></span><span class="dp">:</span><span data-team-score="b"></span></div>
      <div class="end-name b" data-team-name="b"></div><div class="team-logo b"></div>
    </div></div>
  </div>
</div>
'''+'<div class="serie-mini rein" data-teil="serie-mini" style="left:0;right:0;top:772px;--d:.55s"></div>\n'+titelbox(564,868,792,.6)+sponsor(1377,868,280,126), stil=ENDE_STIL)

VS_FELD='<span data-team-name="a"></span>&nbsp;<span class="vs-klein">vs</span>&nbsp;<span data-team-name="b"></span>'
# Map-Veto
szene('map-veto.html','Map-Veto',
  kopfbox(482,47,1381,.2,'mapVeto',VS_FELD)+
  '<div class="veto rein" data-teil="veto" style="left:57px;right:57px;top:236px;height:590px;--d:.35s"></div>\n'+
  bottom_cast(.6), maxb=400)
# Spieler / Line-ups
szene('spieler.html','Line-ups',
  kopfbox(482,47,1381,.2,'lineups',VS_FELD)+
  '<div class="lineup rein" data-team="a" data-teil="lineup-a" style="left:57px;top:222px;--d:.35s"></div>\n'+
  '<div class="lineup rein" data-team="b" data-teil="lineup-b" style="left:57px;top:530px;--d:.5s"></div>\n'+
  bottom_cast(.7), maxb=400)
print("ok")

# Serie
SERIE_FELD='<span data-team-name="a"></span><span class="serie-stand"></span><span data-team-name="b"></span>'
szene('serie.html','Serie',
  kopfbox(482,47,1381,.2,'serie',SERIE_FELD)+
  '<div class="serie-karten rein" data-teil="serie-karten" style="left:57px;right:57px;top:236px;height:590px;--d:.35s"></div>\n'+
  bottom_cast(.6), maxb=400)
# Sponsoren
szene('sponsoren.html','Sponsoren',
  kopfbox(482,47,1381,.2,'sponsorenTitel','<span data-team-name="a"></span>&nbsp;<span class="vs-klein">vs</span>&nbsp;<span data-team-name="b"></span>')+
  '<div class="sponsor-raster rein" data-teil="sponsor-raster" style="left:57px;right:57px;top:230px;height:600px;--d:.35s"></div>\n'+
  bottom_cast(.6), maxb=400)

# Ingame: fast leer – das Spiel-HUD bleibt frei. Nur Sponsor + Einblendungen.
szene('ingame.html','Ingame', sponsor(0,480,340,100,rechts=30), ohne_hg=True, ohne_marke=True)

# CS2-Livedaten: Scoreboard (beide Teams), Team A, Team B, Head-to-Head
def livekopf(kopf, d=.2): return kopfbox(482,47,956,d,kopf,'<span class="live-info"></span>',h=126,tf=46)
szene('scoreboard.html','Scoreboard', livekopf('scoreboard')+
  '<div class="live-tabelle rein" data-team="a" data-teil="lt-a" style="left:100px;top:232px;width:840px;--d:.3s"></div>\n'+
  '<div class="live-tabelle rein" data-team="b" data-teil="lt-b" style="left:980px;top:232px;width:840px;--d:.4s"></div>\n', maxb=400)
for t in ('a','b'):
    szene(f'team-{t}.html','Team '+t.upper(), kopfbox(482,47,956,.2,'teamStats',f'<span data-team-name="{t}"></span>',h=126,tf=58)+
      f'<div class="live-team rein" data-team="{t}" data-teil="live-team" style="left:0;right:0;top:300px;--d:.3s"></div>\n', maxb=400)
szene('h2h.html','Head-to-Head', livekopf('h2h')+
  '<div class="live-h2h rein" data-teil="live-h2h" style="left:200px;width:1520px;top:250px;--d:.3s"></div>\n', maxb=400)

# Turnierbaum (Single/Double Elimination, Swiss, GSL)
szene('bracket.html','Turnierbaum', kopfbox(482,47,956,.2,'turnier','<span class="turnier-name"></span>',h=126,tf=50)+
  '<div class="turnier-baum rein" data-teil="turnier" style="left:60px;right:60px;top:210px;bottom:40px;--d:.3s"></div>\n', maxb=400)
