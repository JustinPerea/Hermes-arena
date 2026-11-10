import math
F={'Hermes':(0.92,0.72),'Aethon':(1.08,0.78),'Kairos':(0.86,0.52),'Iris':(0.78,0.60)}
B=dict(l=-320,r=1600,t=-480,b=1100)
def ko(dmg,kb,ang,w,g,pct,x0,y0=452,mode='hitstun'):
    D=pct+dmg
    L=(kb*0.75+kb*D/55)/w
    a=math.radians(ang)
    vx=math.cos(a)*L; vy=-math.sin(a)*L
    hs=round(L*2.6+6)
    x,y=x0,y0
    n=hs if mode=='hitstun' else 600
    for i in range(n+1):
        vy+=g; vy=min(vy,20); vx*=0.985
        y+=vy; x+=vx
        if x>B['r'] or y<B['t']: return True
        if mode!='hitstun' and y>B['b']: return False
    return False
def kop(dmg,kb,ang,w,g,x0,y0=452):
    for p in range(0,400):
        if ko(dmg,kb,ang,w,g,p,x0,y0): return p
    return None
moves={
 'H fsmash 16/9/35':(16,9,35),'H bthrow 10/7/150->mirror':(10,7,30),'H bair 13/7/145->mirror':(13,7,35),'H usmash fin 8/8/90':(8,8,90),'H counter 12/8/40':(12,8,40),'H dsmash back 13/8/160->20':(13,8,20),'H fthrow 8/6/35':(8,6,35),'H uthrow 7/7/90':(7,7,90),
 'A fsmash tip 19/10/33':(19,10,33),'A fsmash 17/10/33':(17,10,33),'A bthrow 11/7.5/150':(11,7.5,30),'A usmash 17/9.5/88':(17,9.5,88),'A bair 12/7/145':(12,7,35),'A sideB 9/6.5/40':(9,6.5,40),
 'K fsmash tip 17/9.5/35':(17,9.5,35),'K uthrow 9/7.5/90':(9,7.5,90),'K bair 12/7/145':(12,7,35),'K bolt full 20/9/35':(20,9,35),
 'I fsmash 14/8.5/38':(14,8.5,38),'I bair 11/6.5/145':(11,6.5,35),'I bthrow 8/6/140':(8,6,40),
}
print('KO% (pre-hit), victim at x0; KO = crosses side/top blast before hitstun ends')
for x0,lab in ((960,'ledge'),(640,'center')):
  print('==',lab)
  print('%-28s'%'move'+''.join('%8s'%k for k in F))
  for m,(d,k,a) in moves.items():
    print('%-28s'%m+''.join('%8s'%kop(d,k,a,*F[v],x0) for v in F))
# airtime
def air(j,g,fall):
    vy=-j;y=0;t=0
    while True:
        vy+=g; vy=min(vy,fall); y+=vy; t+=1
        if y>=0: return t
for n,(j,g,fa) in {'H':(16.6,.72,12.5),'A':(15.5,.78,13.5),'K':(15,.52,9.5),'I':(16,.6,11)}.items():
    print(n,'airtime',air(j,g,fa),'height',round(j*j/2/g))
