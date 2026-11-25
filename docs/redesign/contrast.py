def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
L=dict(bg='#F5F5F2',surface='#FCFCFA',raised='#FFFFFF',text='#1A1A1C',text2='#55565C',text3='#6E6F76',border='#E3E3DE',accent='#F28C18',accentText='#A3570A',onAccent='#1A1A1C',ink='#1A1A1C')
D=dict(bg='#111113',surface='#18181B',raised='#202024',text='#EDEDEA',text2='#A8A8AE',text3='#8B8B92',border='#2C2C31',accent='#F59A2E',accentText='#F7A645',onAccent='#141416',ink='#EDEDEA')
S={ # name: (light fg, light tint, dark fg, dark tint)
 'pending':   ('#8A5300','#FBF0DC','#F2C063','#2B2214'),
 'confirmed': ('#1F5FB8','#E6EEFA','#8DB6F2','#16202F'),
 'dispatched':('#5B45B0','#EEEAF9','#B5A6F0','#211D30'),
 'delivered': ('#1E7A47','#E3F3EA','#7FD3A2','#14261C'),
 'overdue':   ('#B42318','#FBE9E7','#F59B92','#2E1714'),
 'short':     ('#B42318','#FBE9E7','#F59B92','#2E1714'),
}
for name,t in (('LIGHT',L),('DARK',D)):
    print(name)
    for k in ('text','text2','text3','accentText'):
        print(f"  {k:10} on bg {cr(t[k],t['bg']):.2f}  on surface {cr(t[k],t['surface']):.2f}")
    print(f"  onAccent on accent {cr(t['onAccent'],t['accent']):.2f}; accent vs bg (non-text ≥3) {cr(t['accent'],t['bg']):.2f}; border vs surface {cr(t['border'],t['surface']):.2f}")
for k,(lf,lt,df,dt) in S.items():
    print(f"{k:10} L fg/tint {cr(lf,lt):.2f} fg/surface {cr(lf,L['surface']):.2f} | D fg/tint {cr(df,dt):.2f} fg/surface {cr(df,D['surface']):.2f}")
