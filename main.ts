// Tiny stack VM: a byte-exact interpreter for make.fun's tiny stack ISA.
import{mkdirSync as A,readFileSync as B,readdirSync as C,writeFileSync as D}from'node:fs';
import{join as J}from'node:path';
let I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
function run(P,Q){
let S=new Int32Array(256),K=new Int32Array(64),M=new Int32Array(256),s=0,c=0,p=0,t=0,q=0,o='',n=P.length;
let u=k=>{if(s<k)throw 2},f=()=>{if(s>255)throw 3},X=()=>{throw 4};
try{for(;;){
if(t>=1e6)return[o,10];
if(p<0||p>=n)return[o,9];
let v=P[p],m=v==1?1:v==2?4:v>=48&&v<=51?2:0;
if(p+m>=n)return[o,9];
t++;let x=p+1+m;p=x;
let g=()=>P[x-2]|P[x-1]<<8;
switch(v){
case 0:return[o,0];
case 1:f();S[s++]=(P[x-1]<<24)>>24;break;
case 2:f();S[s++]=P[x-4]|P[x-3]<<8|P[x-2]<<16|P[x-1]<<24;break;
case 3:u(1);s--;break;
case 4:u(1);f();S[s]=S[s-1];s++;break;
case 5:{u(2);let z=S[s-1];S[s-1]=S[s-2];S[s-2]=z;break}
case 6:u(2);f();S[s]=S[s-2];s++;break;
case 7:{u(3);let z=S[s-3];S[s-3]=S[s-2];S[s-2]=S[s-1];S[s-1]=z;break}
case 23:u(1);S[s-1]=-S[s-1];break;
case 27:u(1);S[s-1]=~S[s-1];break;
case 48:case 49:case 50:{let r=(g()<<16)>>16,h=1;
if(v!=48){u(1);let w=S[--s];h=v==49?w==0:w!=0}
if(h)p=x+r;break}
case 51:if(c>63)throw 7;K[c++]=x;p=g();break;
case 52:if(!c)throw 8;p=K[--c];break;
case 64:{u(1);let a=S[s-1];if(a<0||a>255)throw 6;S[s-1]=M[a];break}
case 65:{u(2);let a=S[s-1];if(a<0||a>255)throw 6;M[a]=S[s-2];s-=2;break}
case 80:{u(1);let w=''+S[s-1];if(o.length+w.length>65536)throw 11;s--;o+=w;break}
case 81:u(1);if(o.length>65535)throw 11;o+=String.fromCharCode(S[--s]&255);break;
case 82:f();S[s++]=q<Q.length?Q[q++]:-1;break;
case 83:u(1);return[o,S[--s]&255];
default:{
if(v<16||v>34||v==31)throw 5;
u(2);let b=S[s-1],a=S[s-2];
let r=v==16?a+b:v==17?a-b:v==18?Math.imul(a,b):v<23?(b?v==19?(a==-2147483648&&b==-1?a:(a/b)|0):v==20?(b==-1?0:a%b):v==21?Math.floor((a>>>0)/(b>>>0)):(a>>>0)%(b>>>0):X()):v==24?a&b:v==25?a|b:v==26?a^b:v==28?a<<b:v==29?a>>b:v==30?a>>>b:v==32?a==b?1:0:v==33?a<b?1:0:(a>>>0)<(b>>>0)?1:0;
S[s-2]=r;s--;
}}}
}catch(e){return[o,e]}}
for(let id of C(I).sort()){
let[o,e]=run(B(J(I,id,'program.bin')),B(J(I,id,'input.bin')));
A(J(O,id),{recursive:true});
D(J(O,id,'stdout.bin'),Buffer.from(o,'latin1'));
D(J(O,id,'exit.txt'),e+'\n');
}
