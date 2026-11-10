# slice.py sheet.png outdir name expected_frames rows
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
src,out,name,n,rows=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5])
im=Image.open(src).convert('RGBA'); a=np.array(im)
alpha=a[...,3]>40
# merge nearby fragments (staff tips, feathers) into one blob per figure
grown=ndimage.binary_dilation(alpha,iterations=14)
lab,k=ndimage.label(grown)
objs=ndimage.find_objects(lab)
blobs=[]
for i,sl in enumerate(objs):
    m=(lab[sl]==i+1)&alpha[sl]
    if m.sum()<4000: continue
    blobs.append((sl,m.sum()))
blobs.sort(key=lambda b:-b[1]); blobs=blobs[:n]
# merged neighbours: split the widest blob at its emptiest column until we have n
while len(blobs)<n:
    blobs.sort(key=lambda b:-(b[0][1].stop-b[0][1].start))
    sl,_=blobs.pop(0); x0,x1=sl[1].start,sl[1].stop; w=x1-x0
    cols=alpha[sl[0],x0:x1].sum(0)
    lo,hi=int(w*0.3),int(w*0.7); cut=x0+lo+int(np.argmin(cols[lo:hi]))
    for a0,a1 in((x0,cut),(cut,x1)):
        ys=np.nonzero(alpha[sl[0],a0:a1].any(1))[0]
        nsl=(slice(sl[0].start+ys.min(),sl[0].start+ys.max()+1),slice(a0,a1))
        lab[nsl][alpha[nsl]]=lab.max()+1; objs.append(nsl)
        blobs.append((nsl,int(alpha[nsl].sum())))
H=a.shape[0]
blobs.sort(key=lambda b:(int((b[0][0].start+b[0][0].stop)/2/(H/rows)), b[0][1].start))
frames=[]
for j,(sl,_) in enumerate(blobs):
    y0,y1,x0,x1=sl[0].start,sl[0].stop,sl[1].start,sl[1].stop
    crop=a[y0:y1,x0:x1].copy()
    lm=lab[y0:y1,x0:x1]; idx=np.bincount(lm[alpha[y0:y1,x0:x1]]).argmax()
    crop[lm!=idx]=0
    al=crop[...,3]>40
    ys,xs=np.nonzero(al)
    top=ys.min(); hh=ys.max()-top
    band=al[top:top+int(hh*0.45)]   # head+torso band for horizontal anchor
    cx=np.nonzero(band)[1].mean()
    Image.fromarray(crop).save(f"{out}/{name}-{j}.png")
    frames.append({"file":f"{name}-{j}.png","w":int(x1-x0),"h":int(y1-y0),"ax":float(cx),"foot":int(ys.max())})
json.dump({"name":name,"frames":frames},open(f"{out}/{name}.json","w"))
print(name,len(frames),[ (f['w'],f['h']) for f in frames])
