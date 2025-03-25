import{s as qi,r as le,v as je,m as Zi,u as Ji,o as Wi,p as Ki}from"./scheduler.BVGjjnGO.js";import{S as Gi,i as Qi,d as Xi,t as ai,a as li,m as Yi,c as to,b as eo}from"./index.Vv2yv23T.js";import{g as io,a as oo}from"./spread.CgU5AtxT.js";import{I as no}from"./Icon.BjfYQTkH.js";import{_ as et}from"./preload-helper.BQ24v_F8.js";function ro(t){let e;const i=t[2].default,o=Zi(i,t,t[3],null);return{c(){o&&o.c()},l(n){o&&o.l(n)},m(n,r){o&&o.m(n,r),e=!0},p(n,r){o&&o.p&&(!e||r&8)&&Ji(o,i,n,n[3],e?Ki(i,n[3],r,null):Wi(n[3]),null)},i(n){e||(li(o,n),e=!0)},o(n){ai(o,n),e=!1},d(n){o&&o.d(n)}}}function so(t){let e,i;const o=[{name:"triangle-alert"},t[1],{iconNode:t[0]}];let n={$$slots:{default:[ro]},$$scope:{ctx:t}};for(let r=0;r<o.length;r+=1)n=le(n,o[r]);return e=new no({props:n}),{c(){eo(e.$$.fragment)},l(r){to(e.$$.fragment,r)},m(r,s){Yi(e,r,s),i=!0},p(r,[s]){const a=s&3?io(o,[o[0],s&2&&oo(r[1]),s&1&&{iconNode:r[0]}]):{};s&8&&(a.$$scope={dirty:s,ctx:r}),e.$set(a)},i(r){i||(li(e.$$.fragment,r),i=!0)},o(r){ai(e.$$.fragment,r),i=!1},d(r){Xi(e,r)}}}function ao(t,e,i){let{$$slots:o={},$$scope:n}=e;const r=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{d:"M12 9v4"}],["path",{d:"M12 17h.01"}]];return t.$$set=s=>{i(1,e=le(le({},e),je(s))),"$$scope"in s&&i(3,n=s.$$scope)},e=je(e),[r,e,o,n]}class nr extends Gi{constructor(e){super(),Qi(this,e,ao,so,qi,{})}}var Nt=window,be=Nt.ShadowRoot&&(Nt.ShadyCSS===void 0||Nt.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,we=Symbol(),De=new WeakMap,hi=class{constructor(t,e,i){if(this._$cssResult$=!0,i!==we)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o,e=this.t;if(be&&t===void 0){let i=e!==void 0&&e.length===1;i&&(t=De.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),i&&De.set(e,t))}return t}toString(){return this.cssText}},lo=t=>new hi(typeof t=="string"?t:t+"",void 0,we),ho=(t,...e)=>{let i=t.length===1?t[0]:e.reduce((o,n,r)=>o+(s=>{if(s._$cssResult$===!0)return s.cssText;if(typeof s=="number")return s;throw Error("Value passed to 'css' function must be a 'css' function result: "+s+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+t[r+1],t[0]);return new hi(i,t,we)},uo=(t,e)=>{be?t.adoptedStyleSheets=e.map(i=>i instanceof CSSStyleSheet?i:i.styleSheet):e.forEach(i=>{let o=document.createElement("style"),n=Nt.litNonce;n!==void 0&&o.setAttribute("nonce",n),o.textContent=i.cssText,t.appendChild(o)})},Ve=be?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let i="";for(let o of e.cssRules)i+=o.cssText;return lo(i)})(t):t,Xt,Dt=window,Fe=Dt.trustedTypes,po=Fe?Fe.emptyScript:"",Be=Dt.reactiveElementPolyfillSupport,he={toAttribute(t,e){switch(e){case Boolean:t=t?po:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let i=t;switch(e){case Boolean:i=t!==null;break;case Number:i=t===null?null:Number(t);break;case Object:case Array:try{i=JSON.parse(t)}catch{i=null}}return i}},di=(t,e)=>e!==t&&(e==e||t==t),Yt={attribute:!0,type:String,converter:he,reflect:!1,hasChanged:di},de="finalized",vt=class extends HTMLElement{constructor(){super(),this._$Ei=new Map,this.isUpdatePending=!1,this.hasUpdated=!1,this._$El=null,this._$Eu()}static addInitializer(t){var e;this.finalize(),((e=this.h)!==null&&e!==void 0?e:this.h=[]).push(t)}static get observedAttributes(){this.finalize();let t=[];return this.elementProperties.forEach((e,i)=>{let o=this._$Ep(i,e);o!==void 0&&(this._$Ev.set(o,i),t.push(o))}),t}static createProperty(t,e=Yt){if(e.state&&(e.attribute=!1),this.finalize(),this.elementProperties.set(t,e),!e.noAccessor&&!this.prototype.hasOwnProperty(t)){let i=typeof t=="symbol"?Symbol():"__"+t,o=this.getPropertyDescriptor(t,i,e);o!==void 0&&Object.defineProperty(this.prototype,t,o)}}static getPropertyDescriptor(t,e,i){return{get(){return this[e]},set(o){let n=this[t];this[e]=o,this.requestUpdate(t,n,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)||Yt}static finalize(){if(this.hasOwnProperty(de))return!1;this[de]=!0;let t=Object.getPrototypeOf(this);if(t.finalize(),t.h!==void 0&&(this.h=[...t.h]),this.elementProperties=new Map(t.elementProperties),this._$Ev=new Map,this.hasOwnProperty("properties")){let e=this.properties,i=[...Object.getOwnPropertyNames(e),...Object.getOwnPropertySymbols(e)];for(let o of i)this.createProperty(o,e[o])}return this.elementStyles=this.finalizeStyles(this.styles),!0}static finalizeStyles(t){let e=[];if(Array.isArray(t)){let i=new Set(t.flat(1/0).reverse());for(let o of i)e.unshift(Ve(o))}else t!==void 0&&e.push(Ve(t));return e}static _$Ep(t,e){let i=e.attribute;return i===!1?void 0:typeof i=="string"?i:typeof t=="string"?t.toLowerCase():void 0}_$Eu(){var t;this._$E_=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$Eg(),this.requestUpdate(),(t=this.constructor.h)===null||t===void 0||t.forEach(e=>e(this))}addController(t){var e,i;((e=this._$ES)!==null&&e!==void 0?e:this._$ES=[]).push(t),this.renderRoot!==void 0&&this.isConnected&&((i=t.hostConnected)===null||i===void 0||i.call(t))}removeController(t){var e;(e=this._$ES)===null||e===void 0||e.splice(this._$ES.indexOf(t)>>>0,1)}_$Eg(){this.constructor.elementProperties.forEach((t,e)=>{this.hasOwnProperty(e)&&(this._$Ei.set(e,this[e]),delete this[e])})}createRenderRoot(){var t;let e=(t=this.shadowRoot)!==null&&t!==void 0?t:this.attachShadow(this.constructor.shadowRootOptions);return uo(e,this.constructor.elementStyles),e}connectedCallback(){var t;this.renderRoot===void 0&&(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(t=this._$ES)===null||t===void 0||t.forEach(e=>{var i;return(i=e.hostConnected)===null||i===void 0?void 0:i.call(e)})}enableUpdating(t){}disconnectedCallback(){var t;(t=this._$ES)===null||t===void 0||t.forEach(e=>{var i;return(i=e.hostDisconnected)===null||i===void 0?void 0:i.call(e)})}attributeChangedCallback(t,e,i){this._$AK(t,i)}_$EO(t,e,i=Yt){var o;let n=this.constructor._$Ep(t,i);if(n!==void 0&&i.reflect===!0){let r=(((o=i.converter)===null||o===void 0?void 0:o.toAttribute)!==void 0?i.converter:he).toAttribute(e,i.type);this._$El=t,r==null?this.removeAttribute(n):this.setAttribute(n,r),this._$El=null}}_$AK(t,e){var i;let o=this.constructor,n=o._$Ev.get(t);if(n!==void 0&&this._$El!==n){let r=o.getPropertyOptions(n),s=typeof r.converter=="function"?{fromAttribute:r.converter}:((i=r.converter)===null||i===void 0?void 0:i.fromAttribute)!==void 0?r.converter:he;this._$El=n,this[n]=s.fromAttribute(e,r.type),this._$El=null}}requestUpdate(t,e,i){let o=!0;t!==void 0&&(((i=i||this.constructor.getPropertyOptions(t)).hasChanged||di)(this[t],e)?(this._$AL.has(t)||this._$AL.set(t,e),i.reflect===!0&&this._$El!==t&&(this._$EC===void 0&&(this._$EC=new Map),this._$EC.set(t,i))):o=!1),!this.isUpdatePending&&o&&(this._$E_=this._$Ej())}async _$Ej(){this.isUpdatePending=!0;try{await this._$E_}catch(e){Promise.reject(e)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var t;if(!this.isUpdatePending)return;this.hasUpdated,this._$Ei&&(this._$Ei.forEach((o,n)=>this[n]=o),this._$Ei=void 0);let e=!1,i=this._$AL;try{e=this.shouldUpdate(i),e?(this.willUpdate(i),(t=this._$ES)===null||t===void 0||t.forEach(o=>{var n;return(n=o.hostUpdate)===null||n===void 0?void 0:n.call(o)}),this.update(i)):this._$Ek()}catch(o){throw e=!1,this._$Ek(),o}e&&this._$AE(i)}willUpdate(t){}_$AE(t){var e;(e=this._$ES)===null||e===void 0||e.forEach(i=>{var o;return(o=i.hostUpdated)===null||o===void 0?void 0:o.call(i)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$Ek(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$E_}shouldUpdate(t){return!0}update(t){this._$EC!==void 0&&(this._$EC.forEach((e,i)=>this._$EO(i,this[i],e)),this._$EC=void 0),this._$Ek()}updated(t){}firstUpdated(t){}};vt[de]=!0,vt.elementProperties=new Map,vt.elementStyles=[],vt.shadowRootOptions={mode:"open"},Be?.({ReactiveElement:vt}),((Xt=Dt.reactiveElementVersions)!==null&&Xt!==void 0?Xt:Dt.reactiveElementVersions=[]).push("1.6.3");var te,Vt=window,yt=Vt.trustedTypes,Re=yt?yt.createPolicy("lit-html",{createHTML:t=>t}):void 0,ue="$lit$",rt=`lit$${(Math.random()+"").slice(9)}$`,ui="?"+rt,co=`<${ui}>`,dt=document,xt=()=>dt.createComment(""),It=t=>t===null||typeof t!="object"&&typeof t!="function",pi=Array.isArray,fo=t=>pi(t)||typeof t?.[Symbol.iterator]=="function",ee=`[ 	
\f\r]`,$t=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,He=/-->/g,qe=/>/g,at=RegExp(`>|${ee}(?:([^\\s"'>=/]+)(${ee}*=${ee}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Ze=/'/g,Je=/"/g,ci=/^(?:script|style|textarea|title)$/i,vo=t=>(e,...i)=>({_$litType$:t,strings:e,values:i}),y=vo(1),bt=Symbol.for("lit-noChange"),P=Symbol.for("lit-nothing"),We=new WeakMap,lt=dt.createTreeWalker(dt,129,null,!1);function fi(t,e){if(!Array.isArray(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return Re!==void 0?Re.createHTML(e):e}var mo=(t,e)=>{let i=t.length-1,o=[],n,r=e===2?"<svg>":"",s=$t;for(let a=0;a<i;a++){let l=t[a],d,u,h=-1,p=0;for(;p<l.length&&(s.lastIndex=p,u=s.exec(l),u!==null);)p=s.lastIndex,s===$t?u[1]==="!--"?s=He:u[1]!==void 0?s=qe:u[2]!==void 0?(ci.test(u[2])&&(n=RegExp("</"+u[2],"g")),s=at):u[3]!==void 0&&(s=at):s===at?u[0]===">"?(s=n??$t,h=-1):u[1]===void 0?h=-2:(h=s.lastIndex-u[2].length,d=u[1],s=u[3]===void 0?at:u[3]==='"'?Je:Ze):s===Je||s===Ze?s=at:s===He||s===qe?s=$t:(s=at,n=void 0);let c=s===at&&t[a+1].startsWith("/>")?" ":"";r+=s===$t?l+co:h>=0?(o.push(d),l.slice(0,h)+ue+l.slice(h)+rt+c):l+rt+(h===-2?(o.push(void 0),a):c)}return[fi(t,r+(t[i]||"<?>")+(e===2?"</svg>":"")),o]},pe=class vi{constructor({strings:e,_$litType$:i},o){let n;this.parts=[];let r=0,s=0,a=e.length-1,l=this.parts,[d,u]=mo(e,i);if(this.el=vi.createElement(d,o),lt.currentNode=this.el.content,i===2){let h=this.el.content,p=h.firstChild;p.remove(),h.append(...p.childNodes)}for(;(n=lt.nextNode())!==null&&l.length<a;){if(n.nodeType===1){if(n.hasAttributes()){let h=[];for(let p of n.getAttributeNames())if(p.endsWith(ue)||p.startsWith(rt)){let c=u[s++];if(h.push(p),c!==void 0){let v=n.getAttribute(c.toLowerCase()+ue).split(rt),f=/([.?@])?(.*)/.exec(c);l.push({type:1,index:r,name:f[2],strings:v,ctor:f[1]==="."?go:f[1]==="?"?bo:f[1]==="@"?wo:Ht})}else l.push({type:6,index:r})}for(let p of h)n.removeAttribute(p)}if(ci.test(n.tagName)){let h=n.textContent.split(rt),p=h.length-1;if(p>0){n.textContent=yt?yt.emptyScript:"";for(let c=0;c<p;c++)n.append(h[c],xt()),lt.nextNode(),l.push({type:2,index:++r});n.append(h[p],xt())}}}else if(n.nodeType===8)if(n.data===ui)l.push({type:2,index:r});else{let h=-1;for(;(h=n.data.indexOf(rt,h+1))!==-1;)l.push({type:7,index:r}),h+=rt.length-1}r++}}static createElement(e,i){let o=dt.createElement("template");return o.innerHTML=e,o}};function wt(t,e,i=t,o){var n,r,s,a;if(e===bt)return e;let l=o!==void 0?(n=i._$Co)===null||n===void 0?void 0:n[o]:i._$Cl,d=It(e)?void 0:e._$litDirective$;return l?.constructor!==d&&((r=l?._$AO)===null||r===void 0||r.call(l,!1),d===void 0?l=void 0:(l=new d(t),l._$AT(t,i,o)),o!==void 0?((s=(a=i)._$Co)!==null&&s!==void 0?s:a._$Co=[])[o]=l:i._$Cl=l),l!==void 0&&(e=wt(t,l._$AS(t,e.values),l,o)),e}var _o=class{constructor(e,i){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=i}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){var i;let{el:{content:o},parts:n}=this._$AD,r=((i=e?.creationScope)!==null&&i!==void 0?i:dt).importNode(o,!0);lt.currentNode=r;let s=lt.nextNode(),a=0,l=0,d=n[0];for(;d!==void 0;){if(a===d.index){let u;d.type===2?u=new Ce(s,s.nextSibling,this,e):d.type===1?u=new d.ctor(s,d.name,d.strings,this,e):d.type===6&&(u=new Co(s,this,e)),this._$AV.push(u),d=n[++l]}a!==d?.index&&(s=lt.nextNode(),a++)}return lt.currentNode=dt,r}v(e){let i=0;for(let o of this._$AV)o!==void 0&&(o.strings!==void 0?(o._$AI(e,o,i),i+=o.strings.length-2):o._$AI(e[i])),i++}},Ce=class mi{constructor(e,i,o,n){var r;this.type=2,this._$AH=P,this._$AN=void 0,this._$AA=e,this._$AB=i,this._$AM=o,this.options=n,this._$Cp=(r=n?.isConnected)===null||r===void 0||r}get _$AU(){var e,i;return(i=(e=this._$AM)===null||e===void 0?void 0:e._$AU)!==null&&i!==void 0?i:this._$Cp}get parentNode(){let e=this._$AA.parentNode,i=this._$AM;return i!==void 0&&e?.nodeType===11&&(e=i.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,i=this){e=wt(this,e,i),It(e)?e===P||e==null||e===""?(this._$AH!==P&&this._$AR(),this._$AH=P):e!==this._$AH&&e!==bt&&this._(e):e._$litType$!==void 0?this.g(e):e.nodeType!==void 0?this.$(e):fo(e)?this.T(e):this._(e)}k(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}$(e){this._$AH!==e&&(this._$AR(),this._$AH=this.k(e))}_(e){this._$AH!==P&&It(this._$AH)?this._$AA.nextSibling.data=e:this.$(dt.createTextNode(e)),this._$AH=e}g(e){var i;let{values:o,_$litType$:n}=e,r=typeof n=="number"?this._$AC(e):(n.el===void 0&&(n.el=pe.createElement(fi(n.h,n.h[0]),this.options)),n);if(((i=this._$AH)===null||i===void 0?void 0:i._$AD)===r)this._$AH.v(o);else{let s=new _o(r,this),a=s.u(this.options);s.v(o),this.$(a),this._$AH=s}}_$AC(e){let i=We.get(e.strings);return i===void 0&&We.set(e.strings,i=new pe(e)),i}T(e){pi(this._$AH)||(this._$AH=[],this._$AR());let i=this._$AH,o,n=0;for(let r of e)n===i.length?i.push(o=new mi(this.k(xt()),this.k(xt()),this,this.options)):o=i[n],o._$AI(r),n++;n<i.length&&(this._$AR(o&&o._$AB.nextSibling,n),i.length=n)}_$AR(e=this._$AA.nextSibling,i){var o;for((o=this._$AP)===null||o===void 0||o.call(this,!1,!0,i);e&&e!==this._$AB;){let n=e.nextSibling;e.remove(),e=n}}setConnected(e){var i;this._$AM===void 0&&(this._$Cp=e,(i=this._$AP)===null||i===void 0||i.call(this,e))}},Ht=class{constructor(t,e,i,o,n){this.type=1,this._$AH=P,this._$AN=void 0,this.element=t,this.name=e,this._$AM=o,this.options=n,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=P}get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}_$AI(t,e=this,i,o){let n=this.strings,r=!1;if(n===void 0)t=wt(this,t,e,0),r=!It(t)||t!==this._$AH&&t!==bt,r&&(this._$AH=t);else{let s=t,a,l;for(t=n[0],a=0;a<n.length-1;a++)l=wt(this,s[i+a],e,a),l===bt&&(l=this._$AH[a]),r||(r=!It(l)||l!==this._$AH[a]),l===P?t=P:t!==P&&(t+=(l??"")+n[a+1]),this._$AH[a]=l}r&&!o&&this.j(t)}j(t){t===P?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},go=class extends Ht{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===P?void 0:e}},yo=yt?yt.emptyScript:"",bo=class extends Ht{constructor(){super(...arguments),this.type=4}j(e){e&&e!==P?this.element.setAttribute(this.name,yo):this.element.removeAttribute(this.name)}},wo=class extends Ht{constructor(e,i,o,n,r){super(e,i,o,n,r),this.type=5}_$AI(e,i=this){var o;if((e=(o=wt(this,e,i,0))!==null&&o!==void 0?o:P)===bt)return;let n=this._$AH,r=e===P&&n!==P||e.capture!==n.capture||e.once!==n.once||e.passive!==n.passive,s=e!==P&&(n===P||r);r&&this.element.removeEventListener(this.name,this,n),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var i,o;typeof this._$AH=="function"?this._$AH.call((o=(i=this.options)===null||i===void 0?void 0:i.host)!==null&&o!==void 0?o:this.element,e):this._$AH.handleEvent(e)}},Co=class{constructor(t,e,i){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(t){wt(this,t)}},Ke=Vt.litHtmlPolyfillSupport;Ke?.(pe,Ce),((te=Vt.litHtmlVersions)!==null&&te!==void 0?te:Vt.litHtmlVersions=[]).push("2.8.0");var Lo=(t,e,i)=>{var o,n;let r=(o=i?.renderBefore)!==null&&o!==void 0?o:e,s=r._$litPart$;if(s===void 0){let a=(n=i?.renderBefore)!==null&&n!==void 0?n:null;r._$litPart$=s=new Ce(e.insertBefore(xt(),a),a,void 0,i??{})}return s._$AI(t),s},ie,oe,St=class extends vt{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e,i;let o=super.createRenderRoot();return(e=(i=this.renderOptions).renderBefore)!==null&&e!==void 0||(i.renderBefore=o.firstChild),o}update(e){let i=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Lo(i,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)===null||e===void 0||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)===null||e===void 0||e.setConnected(!1)}render(){return bt}};St.finalized=!0,St._$litElement$=!0,(ie=globalThis.litElementHydrateSupport)===null||ie===void 0||ie.call(globalThis,{LitElement:St});var Ge=globalThis.litElementPolyfillSupport;Ge?.({LitElement:St});((oe=globalThis.litElementVersions)!==null&&oe!==void 0?oe:globalThis.litElementVersions=[]).push("3.3.3");var $o=ho`
  @font-face {
    font-family: 'Karla';
    font-weight: regular;
    src: url('./fonts/Karla-regular.woff') format('woff');
  }

  :host {
    --lottie-player-toolbar-height: 35px;
    --lottie-player-toolbar-background-color: transparent;
    --lottie-player-toolbar-hover-background-color: #f3f6f8;
    --lottie-player-toolbar-icon-color: #20272c;
    --lottie-player-toolbar-icon-hover-color: #f3f6f8;
    --lottie-player-toolbar-icon-active-color: #00ddb3;
    --lottie-player-seeker-track-color: #00ddb3;
    --lottie-player-seeker-accent-color: #00c1a2;
    --lottie-player-seeker-thumb-color: #00c1a2;
    --lottie-player-options-separator: #d9e0e6;

    display: block;
    width: 100%;
    height: 100%;

    font-family: 'Karla', sans-serif;
    font-style: normal;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :host * {
    box-sizing: border-box;
  }

  .active {
    color: var(--lottie-player-toolbar-icon-active-color) !important;
  }

  .main {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .animation {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
  }
  .animation.controls {
    height: calc(100% - var(--lottie-player-toolbar-height));
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-items: center;
    background-color: var(--lottie-player-toolbar-background-color);
    margin: 0 8px;
    height: var(--lottie-player-toolbar-height);
  }

  .btn-spacing-left {
    margin-right: 4px;
    margin-left: 8px;
  }

  .btn-spacing-center {
    margin-right: 4px;
    margin-left: 4px;
  }

  .btn-spacing-right {
    margin-right: 8px;
    margin-left: 4px;
  }

  .toolbar button {
    color: #20272c;
    cursor: pointer;
    fill: var(--lottie-player-toolbar-icon-color);
    display: flex;
    background: none;
    border: 0px;
    border-radius: 4px;
    padding: 4px;
    outline: none;
    width: 24px;
    height: 24px;
    align-items: center;
  }

  .toolbar button:hover {
    background-color: var(--lottie-player-toolbar-icon-hover-color);
    border-style: solid;
    border-radius: 2px;
  }

  .toolbar button.active {
    fill: var(--lottie-player-toolbar-icon-active-color);
  }

  .toolbar button.active:hover {
    fill: var(--lottie-player-toolbar-icon-hover-color);
    border-radius: 4px;
  }

  .toolbar button:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .toolbar button svg {
    width: 16px;
    height: 16px;
  }

  .toolbar button.disabled svg {
    display: none;
  }

  .popover {
    position: absolute;
    bottom: 40px;
    left: calc(100% - 239px);
    width: 224px;
    min-height: 84px;
    max-height: 300px;
    background-color: #ffffff;
    box-shadow: 0px 8px 48px 0px rgba(243, 246, 248, 0.15), 0px 8px 16px 0px rgba(61, 72, 83, 0.16),
      0px 0px 1px 0px rgba(61, 72, 83, 0.36);
    border-radius: 8px;
    padding: 8px;
    z-index: 100;
    overflow-y: scroll;
    scrollbar-width: none;
  }
  .popover:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .popover::-webkit-scrollbar {
    width: 0px;
  }

  .popover-button {
    background: none;
    border: none;
    font-family: inherit;
    width: 100%;
    flex-direction: row;
    cursor: pointer;
    height: 32px;
    color: #20272c;
    justify-content: space-between;
    display: flex;
    padding: 4px 8px;
    align-items: flex-start;
    gap: 8px;
    align-self: stretch;
    border-radius: 4px;
  }

  .popover-button:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .popover-button:hover {
    background-color: var(--lottie-player-toolbar-hover-background-color);
  }

  .popover-button-text {
    display: flex;
    color: #20272c;
    flex-direction: column;
    align-self: stretch;
    justify-content: center;
    font-family: inherit;
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: 150%;
    letter-spacing: -0.28px;
  }

  .reset-btn {
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    background: none;
    border: none;
    font-weight: 400;
    line-height: 18px;
    letter-spacing: 0em;
    text-align: left;
    color: #63727e;
    padding: 0;
    width: 31px;
    height: 18px;
  }
  .reset-btn:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .reset-btn:hover {
    color: #20272c;
  }

  .option-title-button {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 32px;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    cursor: pointer;
    color: var(--lottie-player-toolbar-icon-color);
    border: none;
    background: none;
    padding: 4px;
    font-family: inherit;
    font-size: 16px;
    font-weight: 700;
    line-height: 150%;
    letter-spacing: -0.32px;
  }
  .option-title-button.themes {
    width: auto;
    padding: 0;
  }
  .option-title-button:hover {
    background-color: var(--lottie-player-toolbar-icon-hover-color);
  }

  .option-title-themes-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 0 0;
  }
  .option-title-themes-row:hover {
    background-color: var(--lottie-player-toolbar-icon-hover-color);
  }

  .option-title-button:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .option-title-text {
    font-size: 16px;
    font-style: normal;
    font-weight: 700;
    line-height: 150%;
    letter-spacing: -0.32px;
  }

  .option-title-separator {
    margin: 8px -8px;
    border-bottom: 1px solid var(--lottie-player-options-separator);
  }

  .option-title-chevron {
    display: flex;
    padding: 4px;
    border-radius: 8px;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }

  .option-row {
    display: flex;
    flex-direction: column;
  }
  .option-row > ul {
    padding: 0;
    margin: 0;
  }

  .option-button {
    width: 100%;
    background: none;
    border: none;
    font-family: inherit;
    display: flex;
    padding: 4px 8px;
    color: #20272c;
    overflow: hidden;
    align-items: center;
    gap: 8px;
    align-self: stretch;
    cursor: pointer;
    height: 32px;
    font-family: inherit;
    font-size: 14px;
    border-radius: 4px;
  }
  .option-button:hover {
    background-color: var(--lottie-player-toolbar-hover-background-color);
  }
  .option-button:focus-visible {
    outline: 2px solid var(--lottie-player-toolbar-icon-active-color);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .option-tick {
    display: flex;
    width: 24px;
    height: 24px;
    align-items: flex-start;
    gap: 8px;
  }

  .seeker {
    height: 4px;
    width: 95%;
    outline: none;
    -webkit-appearance: none;
    -moz-apperance: none;
    border-radius: 9999px;
    cursor: pointer;
    background-image: linear-gradient(
      to right,
      rgb(0, 221, 179) calc(var(--seeker) * 1%),
      rgb(217, 224, 230) calc(var(--seeker) * 1%)
    );
  }
  .seeker.to-left {
    background-image: linear-gradient(
      to right,
      rgb(217, 224, 230) calc(var(--seeker) * 1%),
      rgb(0, 221, 179) calc(var(--seeker) * 1%)
    );
  }
  .seeker::-webkit-slider-runnable-track:focus-visible {
    color: #f07167;
    accent-color: #00ddb3;
  }

  .seeker::-webkit-slider-runnable-track {
    width: 100%;
    height: 5px;
    cursor: pointer;
  }
  .seeker::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--lottie-player-seeker-thumb-color);
    cursor: pointer;
    margin-top: -5px;
  }
  .seeker:focus-visible::-webkit-slider-thumb {
    background: var(--lottie-player-seeker-thumb-color);
    outline: 2px solid var(--lottie-player-seeker-track-color);
    border: 1.5px solid #ffffff;
  }
  .seeker::-webkit-slider-thumb:hover {
    background: #019d91;
  }
  .seeker::-moz-range-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--lottie-player-seeker-thumb-color);
    cursor: pointer;
    margin-top: -5px;
    border-color: transparent;
  }
  .seeker:focus-visible::-moz-range-thumb {
    background: var(--lottie-player-seeker-thumb-color);
    outline: 2px solid var(--lottie-player-seeker-track-color);
    border: 1.5px solid #ffffff;
  }

  .error {
    display: flex;
    justify-content: center;
    margin: auto;
    height: 100%;
    align-items: center;
  }
`;/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/lit-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-element/lit-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/var Qe={},So=function(t,e,i,o,n){var r=new Worker(Qe[e]||(Qe[e]=URL.createObjectURL(new Blob([t+';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'],{type:"text/javascript"}))));return r.onmessage=function(s){var a=s.data,l=a.$e$;if(l){var d=new Error(l[0]);d.code=l[1],d.stack=l[2],n(d,null)}else n(null,a)},r.postMessage(i,o),r},V=Uint8Array,ht=Uint16Array,_i=Int32Array,Le=new V([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),$e=new V([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),gi=new V([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),yi=function(t,e){for(var i=new ht(31),o=0;o<31;++o)i[o]=e+=1<<t[o-1];for(var n=new _i(i[30]),o=1;o<30;++o)for(var r=i[o];r<i[o+1];++r)n[r]=r-i[o]<<5|o;return{b:i,r:n}},bi=yi(Le,2),Se=bi.b,Ao=bi.r;Se[28]=258,Ao[258]=28;var ko=yi($e,0),wi=ko.b,Ft=new ht(32768);for(w=0;w<32768;++w)tt=(w&43690)>>1|(w&21845)<<1,tt=(tt&52428)>>2|(tt&13107)<<2,tt=(tt&61680)>>4|(tt&3855)<<4,Ft[w]=((tt&65280)>>8|(tt&255)<<8)>>1;var tt,w,_t=function(t,e,i){for(var o=t.length,n=0,r=new ht(e);n<o;++n)t[n]&&++r[t[n]-1];var s=new ht(e);for(n=1;n<e;++n)s[n]=s[n-1]+r[n-1]<<1;var a;if(i){a=new ht(1<<e);var l=15-e;for(n=0;n<o;++n)if(t[n])for(var d=n<<4|t[n],u=e-t[n],h=s[t[n]-1]++<<u,p=h|(1<<u)-1;h<=p;++h)a[Ft[h]>>l]=d}else for(a=new ht(o),n=0;n<o;++n)t[n]&&(a[n]=Ft[s[t[n]-1]++]>>15-t[n]);return a},Pt=new V(288);for(w=0;w<144;++w)Pt[w]=8;var w;for(w=144;w<256;++w)Pt[w]=9;var w;for(w=256;w<280;++w)Pt[w]=7;var w;for(w=280;w<288;++w)Pt[w]=8;var w,Ci=new V(32);for(w=0;w<32;++w)Ci[w]=5;var w,Li=_t(Pt,9,1),$i=_t(Ci,5,1),zt=function(t){for(var e=t[0],i=1;i<t.length;++i)t[i]>e&&(e=t[i]);return e},Z=function(t,e,i){var o=e/8|0;return(t[o]|t[o+1]<<8)>>(e&7)&i},jt=function(t,e){var i=e/8|0;return(t[i]|t[i+1]<<8|t[i+2]<<16)>>(e&7)},Si=function(t){return(t+7)/8|0},qt=function(t,e,i){return(e==null||e<0)&&(e=0),(i==null||i>t.length)&&(i=t.length),new V(t.subarray(e,i))},Ai=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],D=function(t,e,i){var o=new Error(e||Ai[t]);if(o.code=t,Error.captureStackTrace&&Error.captureStackTrace(o,D),!i)throw o;return o},ki=function(t,e,i,o){var n=t.length,r=o?o.length:0;if(!n||e.f&&!e.l)return i||new V(0);var s=!i,a=s||e.i!=2,l=e.i;s&&(i=new V(n*3));var d=function(Ue){var Ne=i.length;if(Ue>Ne){var ze=new V(Math.max(Ne*2,Ue));ze.set(i),i=ze}},u=e.f||0,h=e.p||0,p=e.b||0,c=e.l,v=e.d,f=e.m,_=e.n,m=n*8;do{if(!c){u=Z(t,h,1);var L=Z(t,h+1,3);if(h+=3,L)if(L==1)c=Li,v=$i,f=9,_=5;else if(L==2){var g=Z(t,h,31)+257,M=Z(t,h+10,15)+4,T=g+Z(t,h+5,31)+1;h+=14;for(var F=new V(T),x=new V(19),$=0;$<M;++$)x[gi[$]]=Z(t,h+$*3,7);h+=M*3;for(var z=zt(x),W=(1<<z)-1,U=_t(x,z,1),$=0;$<T;){var B=U[Z(t,h,W)];h+=B&15;var j=B>>4;if(j<16)F[$++]=j;else{var H=0,N=0;for(j==16?(N=3+Z(t,h,3),h+=2,H=F[$-1]):j==17?(N=3+Z(t,h,7),h+=3):j==18&&(N=11+Z(t,h,127),h+=7);N--;)F[$++]=H}}var it=F.subarray(0,g),ot=F.subarray(g);f=zt(it),_=zt(ot),c=_t(it,f,1),v=_t(ot,_,1)}else D(1);else{var j=Si(h)+4,Jt=t[j-4]|t[j-3]<<8,Wt=j+Jt;if(Wt>n){l&&D(0);break}a&&d(p+Jt),i.set(t.subarray(j,Wt),p),e.b=p+=Jt,e.p=h=Wt*8,e.f=u;continue}if(h>m){l&&D(0);break}}a&&d(p+131072);for(var Bi=(1<<f)-1,Ri=(1<<_)-1,Kt=h;;Kt=h){var H=c[jt(t,h)&Bi],ct=H>>4;if(h+=H&15,h>m){l&&D(0);break}if(H||D(2),ct<256)i[p++]=ct;else if(ct==256){Kt=h,c=null;break}else{var Ee=ct-254;if(ct>264){var $=ct-257,Lt=Le[$];Ee=Z(t,h,(1<<Lt)-1)+Se[$],h+=Lt}var Gt=v[jt(t,h)&Ri],Qt=Gt>>4;Gt||D(3),h+=Gt&15;var ot=wi[Qt];if(Qt>3){var Lt=$e[Qt];ot+=jt(t,h)&(1<<Lt)-1,h+=Lt}if(h>m){l&&D(0);break}a&&d(p+131072);var Me=p+Ee;if(p<ot){var Te=r-ot,Hi=Math.min(ot,Me);for(Te+p<0&&D(3);p<Hi;++p)i[p]=o[Te+p]}for(;p<Me;++p)i[p]=i[p-ot]}}e.l=c,e.p=Kt,e.b=p,e.f=u,c&&(u=1,e.m=f,e.d=v,e.n=_)}while(!u);return p!=i.length&&s?qt(i,0,p):i.subarray(0,p)},xo=new V(0),Io=function(t,e){var i={};for(var o in t)i[o]=t[o];for(var o in e)i[o]=e[o];return i},Xe=function(t,e,i){for(var o=t(),n=t.toString(),r=n.slice(n.indexOf("[")+1,n.lastIndexOf("]")).replace(/\s+/g,"").split(","),s=0;s<o.length;++s){var a=o[s],l=r[s];if(typeof a=="function"){e+=";"+l+"=";var d=a.toString();if(a.prototype)if(d.indexOf("[native code]")!=-1){var u=d.indexOf(" ",8)+1;e+=d.slice(u,d.indexOf("(",u))}else{e+=d;for(var h in a.prototype)e+=";"+l+".prototype."+h+"="+a.prototype[h].toString()}else e+=d}else i[l]=a}return e},Ut=[],Po=function(t){var e=[];for(var i in t)t[i].buffer&&e.push((t[i]=new t[i].constructor(t[i])).buffer);return e},Oo=function(t,e,i,o){if(!Ut[i]){for(var n="",r={},s=t.length-1,a=0;a<s;++a)n=Xe(t[a],n,r);Ut[i]={c:Xe(t[s],n,r),e:r}}var l=Io({},Ut[i].e);return So(Ut[i].c+";onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage="+e.toString()+"}",i,l,Po(l),o)},Eo=function(){return[V,ht,_i,Le,$e,gi,Se,wi,Li,$i,Ft,Ai,_t,zt,Z,jt,Si,qt,D,ki,Ae,xi,Ii]},xi=function(t){return postMessage(t,[t.buffer])},Ii=function(t){return t&&{out:t.size&&new V(t.size),dictionary:t.dictionary}},Mo=function(t,e,i,o,n,r){var s=Oo(i,o,n,function(a,l){s.terminate(),r(a,l)});return s.postMessage([t,e],e.consume?[t.buffer]:[]),function(){s.terminate()}},Q=function(t,e){return t[e]|t[e+1]<<8},K=function(t,e){return(t[e]|t[e+1]<<8|t[e+2]<<16|t[e+3]<<24)>>>0},ne=function(t,e){return K(t,e)+K(t,e+4)*4294967296};function To(t,e,i){return i||(i=e,e={}),typeof i!="function"&&D(7),Mo(t,e,[Eo],function(o){return xi(Ae(o.data[0],Ii(o.data[1])))},1,i)}function Ae(t,e){return ki(t,{i:2},e&&e.out,e&&e.dictionary)}var ce=typeof TextDecoder<"u"&&new TextDecoder,Uo=0;try{ce.decode(xo,{stream:!0}),Uo=1}catch{}var No=function(t){for(var e="",i=0;;){var o=t[i++],n=(o>127)+(o>223)+(o>239);if(i+n>t.length)return{s:e,r:qt(t,i-1)};n?n==3?(o=((o&15)<<18|(t[i++]&63)<<12|(t[i++]&63)<<6|t[i++]&63)-65536,e+=String.fromCharCode(55296|o>>10,56320|o&1023)):n&1?e+=String.fromCharCode((o&31)<<6|t[i++]&63):e+=String.fromCharCode((o&15)<<12|(t[i++]&63)<<6|t[i++]&63):e+=String.fromCharCode(o)}};function Ct(t,e){if(e){for(var i="",o=0;o<t.length;o+=16384)i+=String.fromCharCode.apply(null,t.subarray(o,o+16384));return i}else{if(ce)return ce.decode(t);var n=No(t),r=n.s,i=n.r;return i.length&&D(8),r}}var zo=function(t,e){return e+30+Q(t,e+26)+Q(t,e+28)},jo=function(t,e,i){var o=Q(t,e+28),n=Ct(t.subarray(e+46,e+46+o),!(Q(t,e+8)&2048)),r=e+46+o,s=K(t,e+20),a=i&&s==4294967295?Do(t,r):[s,K(t,e+24),K(t,e+42)],l=a[0],d=a[1],u=a[2];return[Q(t,e+10),l,d,n,r+Q(t,e+30)+Q(t,e+32),u]},Do=function(t,e){for(;Q(t,e)!=1;e+=4+Q(t,e+2));return[ne(t,e+12),ne(t,e+4),ne(t,e+20)]},Ye=typeof queueMicrotask=="function"?queueMicrotask:typeof setTimeout=="function"?setTimeout:function(t){t()};function Vo(t,e,i){i||(i=e,e={}),typeof i!="function"&&D(7);var o=[],n=function(){for(var _=0;_<o.length;++_)o[_]()},r={},s=function(_,m){Ye(function(){i(_,m)})};Ye(function(){s=i});for(var a=t.length-22;K(t,a)!=101010256;--a)if(!a||t.length-a>65558)return s(D(13,0,1),null),n;var l=Q(t,a+8);if(l){var d=l,u=K(t,a+16),h=u==4294967295||d==65535;if(h){var p=K(t,a-12);h=K(t,p)==101075792,h&&(d=l=K(t,p+32),u=K(t,p+48))}for(var c=e&&e.filter,v=function(_){var m=jo(t,u,h),L=m[0],g=m[1],M=m[2],T=m[3],F=m[4],x=m[5],$=zo(t,x);u=F;var z=function(U,B){U?(n(),s(U,null)):(B&&(r[T]=B),--l||s(null,r))};if(!c||c({name:T,size:g,originalSize:M,compression:L}))if(!L)z(null,qt(t,$,$+g));else if(L==8){var W=t.subarray($,$+g);if(g<32e4)try{z(null,Ae(W,{out:new V(M)}))}catch(U){z(U,null)}else o.push(To(W,{size:M},z))}else z(D(14,"unknown compression type "+L,1),null);else z(null,null)},f=0;f<d;++f)v(f)}else s(null,{});return n}function Fo(t){return(Array.isArray(t)?t:t.issues).reduce((e,i)=>{if(i.path){let o=i.path.map(({key:n})=>n).join(".");e.nested[o]=[...e.nested[o]||[],i.message]}else e.root=[...e.root||[],i.message];return e},{nested:{}})}var Bo=class extends Error{issues;constructor(t){super(t[0].message),this.name="ValiError",this.issues=t}};function Ro(t,e){return{reason:t?.reason,validation:e.validation,origin:t?.origin||"value",message:e.message,input:e.input,abortEarly:t?.abortEarly,abortPipeEarly:t?.abortPipeEarly}}function Ho(t,e){return{reason:e,origin:t?.origin,abortEarly:t?.abortEarly,abortPipeEarly:t?.abortPipeEarly}}function st(t,e,i,o){if(!e||!e.length)return{output:t};let n,r,s=t;for(let a of e){let l=a(s);if(l.issue){n=n||Ho(i,o);let d=Ro(n,l.issue);if(r?r.push(d):r=[d],n.abortEarly||n.abortPipeEarly)break}else s=l.output}return r?{issues:r}:{output:s}}function X(t,e){return!t||typeof t=="string"?[t,e]:[void 0,t]}function Y(t,e,i,o,n,r){return{issues:[{reason:e,validation:i,origin:t?.origin||"value",message:o,input:n,issues:r,abortEarly:t?.abortEarly,abortPipeEarly:t?.abortPipeEarly}]}}function qo(t=[]){return{schema:"any",async:!1,_parse(e,i){return st(e,t,i,"any")}}}function At(t,e,i){let[o,n]=X(e,i);return{schema:"array",array:{item:t},async:!1,_parse(r,s){if(!Array.isArray(r))return Y(s,"type","array",o||"Invalid type",r);let a,l=[];for(let d=0;d<r.length;d++){let u=r[d],h=t._parse(u,s);if(h.issues){let p={schema:"array",input:r,key:d,value:u};for(let c of h.issues)c.path?c.path.unshift(p):c.path=[p],a?.push(c);if(a||(a=h.issues),s!=null&&s.abortEarly)break}else l.push(h.output)}return a?{issues:a}:st(l,n,s,"array")}}}function re(t,e){let[i,o]=X(t,e);return{schema:"boolean",async:!1,_parse(n,r){return typeof n!="boolean"?Y(r,"type","boolean",i||"Invalid type",n):st(n,o,r,"boolean")}}}function ti(t,e){return{schema:"literal",literal:t,async:!1,_parse(i,o){return i!==t?Y(o,"type","literal","Invalid type",i):{output:i}}}}function Zo(t,e){return{schema:"native_enum",nativeEnum:t,async:!1,_parse(i,o){return Object.values(t).includes(i)?{output:i}:Y(o,"type","native_enum","Invalid type",i)}}}function G(t,e){let[i,o]=X(t,e);return{schema:"number",async:!1,_parse(n,r){return typeof n!="number"?Y(r,"type","number",i||"Invalid type",n):st(n,o,r,"number")}}}function J(t,e,i){let[o,n]=X(e,i),r;return{schema:"object",object:t,async:!1,_parse(s,a){if(!s||typeof s!="object")return Y(a,"type","object",o||"Invalid type",s);r=r||Object.entries(t);let l,d={};for(let[u,h]of r){let p=s[u],c=h._parse(p,a);if(c.issues){let v={schema:"object",input:s,key:u,value:p};for(let f of c.issues)f.path?f.path.unshift(v):f.path=[v],l?.push(f);if(l||(l=c.issues),a!=null&&a.abortEarly)break}else d[u]=c.output}return l?{issues:l}:st(d,n,a,"object")}}}function C(t){return{schema:"optional",wrapped:t,async:!1,_parse(e,i){return e===void 0?{output:e}:t._parse(e,i)}}}function E(t,e){let[i,o]=X(t,e);return{schema:"string",async:!1,_parse(n,r){return typeof n!="string"?Y(r,"type","string",i||"Invalid type",n):st(n,o,r,"string")}}}function Jo(t,e,i,o){if(typeof e=="object"&&!Array.isArray(e)){let[s,a]=X(i,o);return[t,e,s,a]}let[n,r]=X(e,i);return[E(),t,n,r]}var Wo=["__proto__","prototype","constructor"];function Ko(t,e,i,o){let[n,r,s,a]=Jo(t,e,i,o);return{schema:"record",record:{key:n,value:r},async:!1,_parse(l,d){if(!l||typeof l!="object")return Y(d,"type","record",s||"Invalid type",l);let u,h={};for(let[p,c]of Object.entries(l))if(!Wo.includes(p)){let v,f=n._parse(p,{origin:"key",abortEarly:d?.abortEarly,abortPipeEarly:d?.abortPipeEarly});if(f.issues){v={schema:"record",input:l,key:p,value:c};for(let m of f.issues)m.path=[v],u?.push(m);if(u||(u=f.issues),d!=null&&d.abortEarly)break}let _=r._parse(c,d);if(_.issues){v=v||{schema:"record",input:l,key:p,value:c};for(let m of _.issues)m.path?m.path.unshift(v):m.path=[v],u?.push(m);if(u||(u=_.issues),d!=null&&d.abortEarly)break}!f.issues&&!_.issues&&(h[f.output]=_.output)}return u?{issues:u}:st(h,a,d,"record")}}}function Go(t,e,i){let[o,n]=X(t,e);return[void 0,o,n]}function ei(t,e,i,o){let[n,r,s]=Go(e,i);return{schema:"tuple",tuple:{items:t,rest:n},async:!1,_parse(a,l){if(!Array.isArray(a)||!n&&t.length!==a.length||n&&t.length>a.length)return Y(l,"type","tuple",r||"Invalid type",a);let d,u=[];for(let h=0;h<t.length;h++){let p=a[h],c=t[h]._parse(p,l);if(c.issues){let v={schema:"tuple",input:a,key:h,value:p};for(let f of c.issues)f.path?f.path.unshift(v):f.path=[v],d?.push(f);if(d||(d=c.issues),l!=null&&l.abortEarly)break}else u[h]=c.output}if(n)for(let h=t.length;h<a.length;h++){let p=a[h],c=n._parse(p,l);if(c.issues){let v={schema:"tuple",input:a,key:h,value:p};for(let f of c.issues)f.path?f.path.unshift(v):f.path=[v],d?.push(f);if(d||(d=c.issues),l!=null&&l.abortEarly)break}else u[h]=c.output}return d?{issues:d}:st(u,s,l,"tuple")}}}function fe(t,e){return{schema:"union",union:t,async:!1,_parse(i,o){let n,r;for(let s of t){let a=s._parse(i,o);if(a.issues)if(n)for(let l of a.issues)n.push(l);else n=a.issues;else{r=[a.output];break}}return r?{output:r[0]}:Y(o,"type","union","Invalid type",i,n)}}}function Ot(t,e,i){let[o,n]=X(e,i);return J(t.reduce((r,s)=>({...r,...s.object}),{}),o,n)}function Qo(t,e,i,o){let[n,r]=X(i,o);return J(Object.entries(t.object).reduce((s,[a,l])=>e.includes(a)?s:{...s,[a]:l},{}),n,r)}function Xo(t,e,i){let o=t._parse(e,i);return o.issues?{success:!1,error:new Bo(o.issues),issues:o.issues}:{success:!0,data:o.output,output:o.output}}function ve(t,e){return i=>i>t?{issue:{validation:"max_value",message:e||"Invalid value",input:i}}:{output:i}}function me(t,e){return i=>i<t?{issue:{validation:"min_value",message:e||"Invalid value",input:i}}:{output:i}}var Yo=Object.create,ke=Object.defineProperty,tn=Object.getOwnPropertyDescriptor,Pi=Object.getOwnPropertyNames,en=Object.getPrototypeOf,on=Object.prototype.hasOwnProperty,nn=(t,e,i)=>e in t?ke(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i,Et=(t,e)=>function(){return e||(0,t[Pi(t)[0]])((e={exports:{}}).exports,e),e.exports},rn=(t,e,i,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of Pi(e))!on.call(t,n)&&n!==i&&ke(t,n,{get:()=>e[n],enumerable:!(o=tn(e,n))||o.enumerable});return t},sn=(t,e,i)=>(i=t!=null?Yo(en(t)):{},rn(!t||!t.__esModule?ke(i,"default",{value:t,enumerable:!0}):i,t)),an=(t,e,i)=>(nn(t,e+"",i),i),ln=Et({"../../node_modules/.pnpm/@rgba-image+copy@0.1.3/node_modules/@rgba-image/copy/dist/index.js"(t){Object.defineProperty(t,"__esModule",{value:!0}),t.copy=void 0;var e=(i,o,n=0,r=0,s=i.width-n,a=i.height-r,l=0,d=0)=>{if(n=n|0,r=r|0,s=s|0,a=a|0,l=l|0,d=d|0,s<=0||a<=0)return;let u=new Uint32Array(i.data.buffer),h=new Uint32Array(o.data.buffer);for(let p=0;p<a;p++){let c=r+p;if(c<0||c>=i.height)continue;let v=d+p;if(!(v<0||v>=o.height))for(let f=0;f<s;f++){let _=n+f;if(_<0||_>=i.width)continue;let m=l+f;if(m<0||m>=o.width)continue;let L=c*i.width+_,g=v*o.width+m;h[g]=u[L]}}};t.copy=e}}),hn=Et({"../../node_modules/.pnpm/@rgba-image+create-image@0.1.1/node_modules/@rgba-image/create-image/dist/index.js"(t){Object.defineProperty(t,"__esModule",{value:!0}),t.CreateImageFactory=(e=[0,0,0,0],i=4)=>{if(i=Math.floor(i),isNaN(i)||i<1)throw TypeError("channels should be a positive non-zero number");if(!("length"in e)||e.length<i)throw TypeError(`fill should be iterable with at least ${i} members`);e=new Uint8ClampedArray(e).slice(0,i);let o=e.every(n=>n===0);return(n,r,s)=>{if(n===void 0||r===void 0)throw TypeError("Not enough arguments");if(n=Math.floor(n),r=Math.floor(r),isNaN(n)||n<1||isNaN(r)||r<1)throw TypeError("Index or size is negative or greater than the allowed amount");let a=n*r*i;if(s===void 0&&(s=new Uint8ClampedArray(a)),s instanceof Uint8ClampedArray){if(s.length!==a)throw TypeError("Index or size is negative or greater than the allowed amount");if(!o)for(let l=0;l<r;l++)for(let d=0;d<n;d++){let u=(l*n+d)*i;for(let h=0;h<i;h++)s[u+h]=e[h]}return{get width(){return n},get height(){return r},get data(){return s}}}throw TypeError("Expected data to be Uint8ClampedArray or undefined")}},t.createImage=t.CreateImageFactory()}}),dn=Et({"../../node_modules/.pnpm/@rgba-image+lanczos@0.1.1/node_modules/@rgba-image/lanczos/dist/filters.js"(t){Object.defineProperty(t,"__esModule",{value:!0}),t.filters=void 0;var e=14,i=(r,s)=>{if(r<=-s||r>=s||r==0)return 0;let a=r*Math.PI;return Math.sin(a)/a*Math.sin(a/s)/(a/s)},o=r=>Math.round(r*((1<<e)-1)),n=(r,s,a,l,d)=>{let u=d?2:3,h=1/a,p=Math.min(1,a),c=u/p,v=Math.floor((c+1)*2),f=new Int16Array((v+2)*s),_=0;for(let m=0;m<s;m++){let L=(m+.5)*h+l,g=Math.max(0,Math.floor(L-c)),M=Math.min(r-1,Math.ceil(L+c)),T=M-g+1,F=new Float32Array(T),x=new Int16Array(T),$=0,z=0;for(let N=g;N<=M;N++){let it=i((N+.5-L)*p,u);$+=it,F[z]=it,z++}let W=0;for(let N=0;N<F.length;N++){let it=F[N]/$;W+=it,x[N]=o(it)}x[s>>1]+=o(1-W);let U=0;for(;U<x.length&&x[U]===0;)U++;let B=x.length-1;for(;B>0&&x[B]===0;)B--;let j=g+U,H=B-U+1;f[_++]=j,f[_++]=H,f.set(x.subarray(U,B+1),_),_+=H}return f};t.filters=n}}),un=Et({"../../node_modules/.pnpm/@rgba-image+lanczos@0.1.1/node_modules/@rgba-image/lanczos/dist/convolve.js"(t){Object.defineProperty(t,"__esModule",{value:!0}),t.convolve=void 0;var e=14,i=(o,n,r,s,a,l)=>{let d=0,u=0;for(let h=0;h<s;h++){let p=0;for(let c=0;c<a;c++){let v=l[p++],f=d+v*4|0,_=0,m=0,L=0,g=0;for(let M=l[p++];M>0;M--){let T=l[p++];_=_+T*o[f]|0,m=m+T*o[f+1]|0,L=L+T*o[f+2]|0,g=g+T*o[f+3]|0,f=f+4|0}n[u]=_+8192>>e,n[u+1]=m+8192>>e,n[u+2]=L+8192>>e,n[u+3]=g+8192>>e,u=u+s*4|0}u=(h+1)*4|0,d=(h+1)*r*4|0}};t.convolve=i}}),pn=Et({"../../node_modules/.pnpm/@rgba-image+lanczos@0.1.1/node_modules/@rgba-image/lanczos/dist/index.js"(t){Object.defineProperty(t,"__esModule",{value:!0}),t.lanczos2=t.lanczos=void 0;var e=ln(),i=hn(),o=dn(),n=un(),r=(l,d,u=!1)=>{let h=d.width/l.width,p=d.height/l.height,c=o.filters(l.width,d.width,h,0,u),v=o.filters(l.height,d.height,p,0,u),f=new Uint8ClampedArray(d.width*l.height*4);n.convolve(l.data,f,l.width,l.height,d.width,c),n.convolve(f,d.data,l.height,d.width,d.height,v)},s=(l,d,u=0,h=0,p=l.width-u,c=l.height-h,v=0,f=0,_=d.width-v,m=d.height-f)=>{if(u=u|0,h=h|0,p=p|0,c=c|0,v=v|0,f=f|0,_=_|0,m=m|0,p<=0||c<=0||_<=0||m<=0)return;if(u===0&&h===0&&p===l.width&&c===l.height&&v===0&&f===0&&_===d.width&&m===d.height){r(l,d);return}let L=i.createImage(p,c),g=i.createImage(_,m);e.copy(l,L,u,h),r(L,g),e.copy(g,d,0,0,g.width,g.height,v,f)};t.lanczos=s;var a=(l,d,u=0,h=0,p=l.width-u,c=l.height-h,v=0,f=0,_=d.width-v,m=d.height-f)=>{if(u=u|0,h=h|0,p=p|0,c=c|0,v=v|0,f=f|0,_=_|0,m=m|0,p<=0||c<=0||_<=0||m<=0)return;if(u===0&&h===0&&p===l.width&&c===l.height&&v===0&&f===0&&_===d.width&&m===d.height){r(l,d,!0);return}let L=i.createImage(p,c),g=i.createImage(_,m);e.copy(l,L,u,h),r(L,g,!0),e.copy(g,d,0,0,g.width,g.height,v,f)};t.lanczos2=a}}),Oi=(t=>(t.Bounce="bounce",t.Normal="normal",t))(Oi||{}),cn=Zo(Oi),Ei=J({autoplay:C(re()),defaultTheme:C(E()),direction:C(fe([ti(1),ti(-1)])),hover:C(re()),id:E(),intermission:C(G()),loop:C(fe([re(),G()])),playMode:C(cn),speed:C(G()),themeColor:C(E())}),fn=J({animations:At(E()),id:E()}),vn=J({activeAnimationId:C(E()),animations:At(Ei),author:C(E()),custom:C(Ko(E(),qo())),description:C(E()),generator:C(E()),keywords:C(E()),revision:C(G()),themes:C(At(fn)),states:C(At(E())),version:C(E())}),Mi=Qo(Ei,["id"]),ut=J({state:E()}),mn=ut,_n=Ot([ut,J({ms:G()})]),gn=Ot([ut,J({count:G()})]),yn=ut,bn=ut,wn=ut,Cn=Ot([ut,J({threshold:C(At(G([me(0),ve(1)])))})]),Ln=J({onAfter:C(_n),onClick:C(mn),onComplete:C(wn),onEnter:C(gn),onMouseEnter:C(yn),onMouseLeave:C(bn),onShow:C(Cn)}),$n=Ot([Mi,J({playOnScroll:C(ei([G([me(0),ve(1)]),G([me(0),ve(1)])])),segments:C(fe([ei([G(),G()]),E()]))})]);Ot([Ln,J({animationId:C(E()),playbackSettings:$n})]);var Sn={jpeg:"image/jpeg",png:"image/png",gif:"image/gif",bmp:"image/bmp",svg:"image/svg+xml",webp:"image/webp",mpeg:"audio/mpeg",mp3:"audio/mp3"},ii={jpeg:[255,216,255],png:[137,80,78,71,13,10,26,10],gif:[71,73,70],bmp:[66,77],webp:[82,73,70,70,87,69,66,80],svg:[60,63,120],mp3:[73,68,51,3,0,0,0,0],mpeg:[73,68,51,3,0,0,0,0]},An=t=>{let e=null,i=[];if(!t)return null;let o=t.substring(t.indexOf(",")+1);typeof window>"u"?e=Buffer.from(o,"base64").toString("binary"):e=atob(o);let n=new Uint8Array(e.length);for(let r=0;r<e.length;r+=1)n[r]=e.charCodeAt(r);i=Array.from(n.subarray(0,8));for(let r in ii){let s=ii[r];if(s&&i.every((a,l)=>a===s[l]))return Sn[r]}return null},xe=class extends Error{constructor(t,e){super(t),an(this,"code"),this.name="[dotlottie-js]",this.code=e}};function Ti(t){let e;if(typeof window>"u")e=Buffer.from(t).toString("base64");else{let i=Array.prototype.map.call(t,o=>String.fromCharCode(o)).join("");e=window.btoa(i)}return`data:${An(e)};base64,${e}`}function oi(t){return"w"in t&&"h"in t&&!("xt"in t)&&"p"in t}function _e(t){return!("h"in t)&&!("w"in t)&&"p"in t&&"e"in t&&"u"in t&&"id"in t}async function Mt(t,e=()=>!0){if(!(t instanceof Uint8Array))throw new xe("DotLottie not found","INVALID_DOTLOTTIE");return await new Promise((i,o)=>{Vo(t,{filter:e},(n,r)=>{n&&o(n),i(r)})})}async function Ie(t,e,i){if(!(t instanceof Uint8Array))throw new xe("DotLottie not found","INVALID_DOTLOTTIE");return(await Mt(t,o=>o.name===e&&!0))[e]}async function ge(t){let e="manifest.json",i=(await Mt(t,o=>o.name===e))[e];if(!(typeof i>"u"))return JSON.parse(Ct(i,!1))}async function kn(t){if(!(t instanceof Uint8Array))return{success:!1,error:"DotLottie not found"};let e=await ge(t);if(typeof e>"u")return{success:!1,error:"Invalid .lottie file, manifest.json is missing"};let i=Xo(vn,e);return i.success?{success:!0}:{success:!1,error:`Invalid .lottie file, manifest.json structure is invalid, ${JSON.stringify(Fo(i.error).nested,null,2)}`}}async function ni(t){let e=new Uint8Array(t),i=await kn(e);if(i.error)throw new xe(i.error,"INVALID_DOTLOTTIE");return e}async function xn(t,e){let i=await Mt(t,n=>{let r=n.name.replace("audio/","");return n.name.startsWith("audio/")&&(!e||e({...n,name:r}))}),o={};for(let n in i){let r=i[n];if(r instanceof Uint8Array){let s=n.replace("audio/","");o[s]=Ti(r)}}return o}async function In(t,e){var i;let o=new Map;for(let[r,s]of Object.entries(e))for(let a of s.assets||[])if(_e(a)){let l=a.p;o.has(l)||o.set(l,new Set),(i=o.get(l))==null||i.add(r)}let n=await xn(t,r=>o.has(r.name));for(let[r,s]of o){let a=n[r];if(a)for(let l of s){let d=e[l];for(let u of d?.assets||[])_e(u)&&u.p===r&&(u.p=a,u.u="",u.e=1)}}}async function Pn(t,e){let i=await Mt(t,n=>{let r=n.name.replace("images/","");return n.name.startsWith("images/")&&(!e||e({...n,name:r}))}),o={};for(let n in i){let r=i[n];if(r instanceof Uint8Array){let s=n.replace("images/","");o[s]=Ti(r)}}return o}async function On(t,e){var i;let o=new Map;for(let[r,s]of Object.entries(e))for(let a of s.assets||[])if(oi(a)){let l=a.p;o.has(l)||o.set(l,new Set),(i=o.get(l))==null||i.add(r)}let n=await Pn(t,r=>o.has(r.name));for(let[r,s]of o){let a=n[r];if(a)for(let l of s){let d=e[l];for(let u of d?.assets||[])oi(u)&&u.p===r&&(u.p=a,u.u="",u.e=1)}}}async function En(t,e,{inlineAssets:i}={},o){let n=`animations/${e}.json`,r=await Ie(t,n);if(typeof r>"u")return;let s=JSON.parse(Ct(r,!1));if(!i)return s;let a={[e]:s};return await On(t,a),await In(t,a),s}async function Mn(t,e,i){let o=`themes/${e}.json`,n=await Ie(t,o);if(!(typeof n>"u"))return JSON.parse(Ct(n,!1))}async function Tn(t,e){let i={},o=await Mt(t,n=>(n.name.replace("states/","").replace(".json",""),n.name.startsWith("states/")&&!0));for(let n in o){let r=o[n];if(r instanceof Uint8Array){let s=n.replace("states/","").replace(".json","");i[s]=Ct(r,!1)}}return i}async function Un(t,e,i){let o=`states/${e}.json`,n=await Ie(t,o);return typeof n>"u"?void 0:JSON.parse(Ct(n,!1))}sn(pn());function b(t,e="dotLottie-common"){return new Error(`[${e}]: ${t}`)}function ft(t,e="dotLottie-common",...i){console.error(`[${e}]:`,t,...i)}function S(t,e="dotLottie-common",...i){console.warn(`[${e}]:`,t,...i)}function Nn(t=""){let e=t.trim(),i=e.lastIndexOf("/"),o=e.substring(i+1),n=o.indexOf(".");return n!==-1?o.substring(0,n):o}function Bt(t){return["v","ip","op","layers","fr","w","h"].every(e=>Object.prototype.hasOwnProperty.call(t,e))}function zn(t){let e=t.assets;return e?e.some(i=>_e(i)):!1}function jn(t){try{let e=JSON.parse(t);return Bt(e)}catch{return!1}}function dr(t,e){let i=Object.keys(t).find(o=>t[o]===e);if(i===void 0)throw new Error("Value not found in the object.");return i}function se(t){return JSON.parse(JSON.stringify(t))}var Dn=class{_dotLottie;_animationsMap=new Map;_themeMap=new Map;_stateMachinesMap=new Map;_manifest;get dotLottie(){return this._dotLottie}get animationsMap(){return this._animationsMap}get themeMap(){return this._themeMap}get stateMachinesMap(){return this._stateMachinesMap}get manifest(){return this._manifest}async loadFromUrl(t){let e=await fetch(t,{method:"GET",mode:"cors"});if(!e.ok)throw new Error(`Failed to load dotLottie from ${t} with status ${e.status}`);let i=e.headers.get("content-type");if(i!=null&&i.includes("application/json")){let o=await e.json();if(!Bt(o))throw new Error(`Invalid lottie JSON at ${t}`);let n=Nn(t);this._animationsMap.set(n,o);let r={activeAnimationId:n,animations:[{id:n}]};this._manifest=r}else{this._dotLottie=await ni(await e.arrayBuffer());let o=await ge(this._dotLottie);if(!o)throw new Error("Manifest not found");this._manifest=o}}loadFromLottieJSON(t){if(!Bt(t))throw new Error("Invalid lottie JSON");let e="my-animation";this._animationsMap.set(e,t);let i={activeAnimationId:e,animations:[{id:e}]};this._manifest=i}async loadFromArrayBuffer(t){this._dotLottie=await ni(t);let e=await ge(this._dotLottie);if(!e)throw new Error("Manifest not found");this._manifest=e}async getAnimation(t){if(this._animationsMap.get(t))return this._animationsMap.get(t);if(!this._dotLottie)return;let e=await En(this._dotLottie,t,{inlineAssets:!0});return e&&this._animationsMap.set(t,e),e}async getTheme(t){if(this._themeMap.get(t))return this._themeMap.get(t);if(!this._dotLottie)return;let e=await Mn(this._dotLottie,t);return e&&this._themeMap.set(t,e),e}async getStateMachines(){if(!this._dotLottie)return;let t=await Tn(this._dotLottie);for(let e in t)if(e){let i=t[e];if(i){let o=JSON.parse(i);if(o){let n=o.descriptor.id;this._stateMachinesMap.get(n)||this._stateMachinesMap.set(n,o)}}}return Array.from(this._stateMachinesMap.values())}async getStateMachine(t){if(this._stateMachinesMap.get(t))return this._stateMachinesMap.get(t);if(!this._dotLottie)return;let e=await Un(this._dotLottie,t);return e&&this._stateMachinesMap.set(e.descriptor.id,e),e}};function Zt(){throw new Error("Cycle detected")}function Pe(){if(gt>1)gt--;else{for(var t,e=!1;kt!==void 0;){var i=kt;for(kt=void 0,ye++;i!==void 0;){var o=i.o;if(i.o=void 0,i.f&=-3,!(8&i.f)&&Ni(i))try{i.c()}catch(n){e||(t=n,e=!0)}i=o}}if(ye=0,gt--,e)throw t}}var A=void 0,kt=void 0,gt=0,ye=0,Rt=0;function Ui(t){if(A!==void 0){var e=t.n;if(e===void 0||e.t!==A)return e={i:0,S:t,p:A.s,n:void 0,t:A,e:void 0,x:void 0,r:e},A.s!==void 0&&(A.s.n=e),A.s=e,t.n=e,32&A.f&&t.S(e),e;if(e.i===-1)return e.i=0,e.n!==void 0&&(e.n.p=e.p,e.p!==void 0&&(e.p.n=e.n),e.p=A.s,e.n=void 0,A.s.n=e,A.s=e),e}}function R(t){this.v=t,this.i=0,this.n=void 0,this.t=void 0}R.prototype.h=function(){return!0};R.prototype.S=function(t){this.t!==t&&t.e===void 0&&(t.x=this.t,this.t!==void 0&&(this.t.e=t),this.t=t)};R.prototype.U=function(t){if(this.t!==void 0){var e=t.e,i=t.x;e!==void 0&&(e.x=i,t.e=void 0),i!==void 0&&(i.e=e,t.x=void 0),t===this.t&&(this.t=i)}};R.prototype.subscribe=function(t){var e=this;return Bn(function(){var i=e.value,o=32&this.f;this.f&=-33;try{t(i)}finally{this.f|=o}})};R.prototype.valueOf=function(){return this.value};R.prototype.toString=function(){return this.value+""};R.prototype.toJSON=function(){return this.value};R.prototype.peek=function(){return this.v};Object.defineProperty(R.prototype,"value",{get:function(){var t=Ui(this);return t!==void 0&&(t.i=this.i),this.v},set:function(t){if(A instanceof pt&&function(){throw new Error("Computed cannot have side-effects")}(),t!==this.v){ye>100&&Zt(),this.v=t,this.i++,Rt++,gt++;try{for(var e=this.t;e!==void 0;e=e.x)e.t.N()}finally{Pe()}}}});function Vn(t){return new R(t)}function Ni(t){for(var e=t.s;e!==void 0;e=e.n)if(e.S.i!==e.i||!e.S.h()||e.S.i!==e.i)return!0;return!1}function zi(t){for(var e=t.s;e!==void 0;e=e.n){var i=e.S.n;if(i!==void 0&&(e.r=i),e.S.n=e,e.i=-1,e.n===void 0){t.s=e;break}}}function ji(t){for(var e=t.s,i=void 0;e!==void 0;){var o=e.p;e.i===-1?(e.S.U(e),o!==void 0&&(o.n=e.n),e.n!==void 0&&(e.n.p=o)):i=e,e.S.n=e.r,e.r!==void 0&&(e.r=void 0),e=o}t.s=i}function pt(t){R.call(this,void 0),this.x=t,this.s=void 0,this.g=Rt-1,this.f=4}(pt.prototype=new R).h=function(){if(this.f&=-3,1&this.f)return!1;if((36&this.f)==32||(this.f&=-5,this.g===Rt))return!0;if(this.g=Rt,this.f|=1,this.i>0&&!Ni(this))return this.f&=-2,!0;var t=A;try{zi(this),A=this;var e=this.x();(16&this.f||this.v!==e||this.i===0)&&(this.v=e,this.f&=-17,this.i++)}catch(i){this.v=i,this.f|=16,this.i++}return A=t,ji(this),this.f&=-2,!0};pt.prototype.S=function(t){if(this.t===void 0){this.f|=36;for(var e=this.s;e!==void 0;e=e.n)e.S.S(e)}R.prototype.S.call(this,t)};pt.prototype.U=function(t){if(this.t!==void 0&&(R.prototype.U.call(this,t),this.t===void 0)){this.f&=-33;for(var e=this.s;e!==void 0;e=e.n)e.S.U(e)}};pt.prototype.N=function(){if(!(2&this.f)){this.f|=6;for(var t=this.t;t!==void 0;t=t.x)t.t.N()}};pt.prototype.peek=function(){if(this.h()||Zt(),16&this.f)throw this.v;return this.v};Object.defineProperty(pt.prototype,"value",{get:function(){1&this.f&&Zt();var t=Ui(this);if(this.h(),t!==void 0&&(t.i=this.i),16&this.f)throw this.v;return this.v}});function Di(t){var e=t.u;if(t.u=void 0,typeof e=="function"){gt++;var i=A;A=void 0;try{e()}catch(o){throw t.f&=-2,t.f|=8,Oe(t),o}finally{A=i,Pe()}}}function Oe(t){for(var e=t.s;e!==void 0;e=e.n)e.S.U(e);t.x=void 0,t.s=void 0,Di(t)}function Fn(t){if(A!==this)throw new Error("Out-of-order effect");ji(this),A=t,this.f&=-2,8&this.f&&Oe(this),Pe()}function Tt(t){this.x=t,this.u=void 0,this.s=void 0,this.o=void 0,this.f=32}Tt.prototype.c=function(){var t=this.S();try{if(8&this.f||this.x===void 0)return;var e=this.x();typeof e=="function"&&(this.u=e)}finally{t()}};Tt.prototype.S=function(){1&this.f&&Zt(),this.f|=1,this.f&=-9,Di(this),zi(this),gt++;var t=A;return A=this,Fn.bind(this,t)};Tt.prototype.N=function(){2&this.f||(this.f|=2,this.o=kt,kt=this)};Tt.prototype.d=function(){this.f|=8,1&this.f||Oe(this)};function Bn(t){var e=new Tt(t);try{e.c()}catch(i){throw e.d(),i}return e.d.bind(e)}var Rn=class{_state;_prevState;constructor(t){this._prevState=t,this._state=Vn(t)}setState(t){this._prevState=this._state.value,this._state.value=t}subscribe(t){return this._state.subscribe(e=>t(e,this._prevState))}};async function Hn(t,e){let[{DotLottieStateMachineManager:i}]=await Promise.all([et(()=>import("./dotlottie-state-machine-manager-2E7RUGJG-NTQ25VSR.B_LfYKph.js"),__vite__mapDeps([]),import.meta.url)]);if(!t.length)throw b("No state machines available inside this .lottie!");return new i(t,e)}var qn={dependencies:{"lottie-web":"^5.12.2"}},nt=(t=>(t.Complete="complete",t.DataFail="data_fail",t.DataReady="data_ready",t.Error="error",t.Frame="frame",t.Freeze="freeze",t.LoopComplete="loopComplete",t.Pause="pause",t.Play="play",t.Ready="ready",t.Stop="stop",t.VisibilityChange="visibilityChange",t))(nt||{}),mt=(t=>(t.Completed="completed",t.Error="error",t.Fetching="fetching",t.Frozen="frozen",t.Initial="initial",t.Loading="loading",t.Paused="paused",t.Playing="playing",t.Ready="ready",t.Stopped="stopped",t))(mt||{}),Vi=(t=>(t.Bounce="bounce",t.Normal="normal",t))(Vi||{}),q={autoplay:!1,direction:1,hover:!1,intermission:0,loop:!1,playMode:"normal",speed:1,defaultTheme:""},Fi={activeStateId:"",autoplay:!1,currentState:"initial",frame:0,seeker:0,direction:1,hover:!1,loop:!1,playMode:"normal",speed:1,background:"transparent",intermission:0,currentAnimationId:void 0,visibilityPercentage:0},ri=class{_lottie;_src;_animationConfig;_prevUserPlaybackOptions={};_userPlaybackOptions;_hover=!1;_loop=!1;_counter=0;_intermission=0;_counterInterval=null;_container=null;_name;_mode="normal";_background="transparent";_animation;_defaultTheme;_activeAnimationId;_currentAnimationId;_testId;_listeners=new Map;_currentState="initial";_stateBeforeFreeze="initial";state=new Rn(Fi);_light=!1;_worker=!1;_dotLottieLoader=new Dn;_activeStateId;_inInteractiveMode=!1;_scrollTicking=!1;_scrollCallback=void 0;_onShowIntersectionObserver=void 0;_visibilityPercentage=0;_audios=[];_stateMachineManager;constructor(t,e,i){typeof t=="string"?this._src=t:this._src=se(t),i!=null&&i.testId&&(this._testId=i.testId),this._defaultTheme=i?.defaultTheme||"",this._userPlaybackOptions=this._validatePlaybackOptions(i||{}),typeof i?.activeAnimationId=="string"&&(this._activeAnimationId=i.activeAnimationId),this._container=e||null,typeof i?.background=="string"&&this.setBackground(i.background),typeof i?.activeStateId<"u"&&(this._activeStateId=i.activeStateId);let{rendererSettings:o,...n}=i||{};this._animationConfig={loop:!1,autoplay:!1,renderer:"svg",rendererSettings:{clearCanvas:!0,progressiveLoad:!0,hideOnTransparent:!0,filterSize:{width:"200%",height:"200%",x:"-50%",y:"-50%"},...o},...n},i!=null&&i.light&&(this._light=i.light),i!=null&&i.worker&&(this._worker=i.worker),this._listenToHover(),this._listenToVisibilityChange()}_listenToHover(){var t,e,i,o;let n=()=>{this._hover&&this.currentState!=="playing"&&this.play()},r=()=>{this._hover&&this.currentState==="playing"&&this.stop()};(t=this._container)==null||t.removeEventListener("mouseenter",n),(e=this._container)==null||e.removeEventListener("mouseleave",r),(i=this._container)==null||i.addEventListener("mouseleave",r),(o=this._container)==null||o.addEventListener("mouseenter",n)}_onVisibilityChange(){!this._lottie||typeof document>"u"||(document.hidden&&this.currentState==="playing"?this.freeze():this.currentState==="frozen"&&this.unfreeze())}_listenToVisibilityChange(){typeof document<"u"&&typeof document.hidden<"u"&&document.addEventListener("visibilitychange",()=>this._onVisibilityChange())}_getOption(t){var e;if(typeof this._userPlaybackOptions[t]<"u")return this._userPlaybackOptions[t];let i=(e=this._dotLottieLoader.manifest)==null?void 0:e.animations.find(o=>o.id===this._currentAnimationId);return i&&typeof i[t]<"u"?i[t]:q[t]}_getPlaybackOptions(){let t={};for(let e in q)typeof q[e]<"u"&&(t[e]=this._getOption(e));return t}_setPlayerState(t){var e,i,o;let n=t(this._getPlaybackOptions());try{Mi._parse(n)}catch{S(`Invalid PlaybackOptions, ${JSON.stringify(n,null,2)}`);return}typeof n.defaultTheme<"u"&&(this._defaultTheme=n.defaultTheme),typeof n.playMode<"u"&&(this._mode=n.playMode),typeof n.intermission<"u"&&(this._intermission=n.intermission),typeof n.hover<"u"&&(this._hover=n.hover),typeof n.loop<"u"&&(this.clearCountTimer(),this._loop=n.loop,this._counter=0,(e=this._lottie)==null||e.setLoop(typeof n.loop=="number"?!0:n.loop)),typeof n.speed<"u"&&((i=this._lottie)==null||i.setSpeed(n.speed)),typeof n.autoplay<"u"&&this._lottie&&(this._lottie.autoplay=n.autoplay),typeof n.direction<"u"&&((o=this._lottie)==null||o.setDirection(n.direction))}_getOptionsFromAnimation(t){let{id:e,...i}=t;return{...q,...i}}_updateTestData(){!this._testId||!this._lottie||(window.dotLottiePlayer||(window.dotLottiePlayer={[this._testId]:{}}),window.dotLottiePlayer[this._testId]={direction:this._lottie.playDirection,currentState:this._currentState,loop:this.loop,mode:this._mode,speed:this._lottie.playSpeed})}setContainer(t){t!==this._container&&(this._container=t,this.setBackground(this._background),this._listenToHover())}get currentState(){return this._currentState}clearCountTimer(){this._counterInterval&&clearInterval(this._counterInterval)}setCurrentState(t){this._currentState=t,this._notify(),this._updateTestData()}static isPathJSON(t){var e;return((e=t.split(".").pop())==null?void 0:e.toLowerCase())==="json"}get src(){return this._src}updateSrc(t){this._src!==t&&(typeof t=="string"?this._src=t:this._src=se(t),this._activeAnimationId=void 0,this._currentAnimationId=void 0,this.load())}get intermission(){return this._intermission}get hover(){return this._hover}setHover(t){typeof t=="boolean"&&(this._hover=t,this._userPlaybackOptions.hover=t,this._notify())}setIntermission(t){this._intermission=t,this._userPlaybackOptions.intermission=t,this._notify()}get mode(){return this._mode}get animations(){return this._dotLottieLoader.animationsMap}get themes(){return this._dotLottieLoader.themeMap}setMode(t){typeof t=="string"&&(this._mode=t,this._userPlaybackOptions.playMode=t,this._setPlayerState(()=>({playMode:t})),this._notify(),this._updateTestData())}get container(){if(this._container)return this._container}goToAndPlay(t,e,i){if(!this._lottie||["loading"].includes(this._currentState)){S("goToAndPlay() Can't use whilst loading.");return}this._lottie.goToAndPlay(t,e,i),this.setCurrentState("playing")}goToAndStop(t,e,i){if(!this._lottie||["loading"].includes(this._currentState)){S("goToAndStop() Can't use whilst loading.");return}this._lottie.goToAndStop(t,e,i),this.setCurrentState("stopped")}seek(t){if(!this._lottie||["loading"].includes(this._currentState)){S("seek() Can't use whilst loading.");return}let e=t;typeof e=="number"&&(e=Math.round(e));let i=/^(\d+)(%?)$/u.exec(e.toString());if(!i)return;let o=i[2]==="%"?this.totalFrames*Number(i[1])/100:i[1];o!==void 0&&(this._lottie.goToAndPlay(o,!0),this.currentState==="playing"?this.play():this.currentState==="frozen"?this.freeze():this.pause())}_areNumbersInRange(t,e){return t>=0&&t<=1&&e>=0&&e<=1}_updatePosition(t,e,i){let[o,n]=t??[0,this.totalFrames-1],[r,s]=e??[0,1];if(!this._areNumbersInRange(r,s)){ft("threshold values must be between 0 and 1");return}if(this.container){let{height:a,top:l}=this.container.getBoundingClientRect(),d=window.innerHeight-l,u=window.innerHeight+a,h=d/u,p=o+Math.round((h-r)/(s-r)*(n-o));i&&i(h),this.goToAndStop(p,!0),(p>=n||h>=s)&&this._handleAnimationComplete()}this._scrollTicking=!1}_requestTick(t,e,i){this._scrollTicking||(requestAnimationFrame(()=>this._updatePosition(t,e,i)),this._scrollTicking=!0)}playOnScroll(t){this.stop(),this._scrollCallback&&this.stopPlayOnScroll(),this._scrollCallback=()=>this._requestTick(t?.segments,t?.threshold,t?.positionCallback),window.addEventListener("scroll",this._scrollCallback)}stopPlayOnScroll(){this._scrollCallback&&(window.removeEventListener("scroll",this._scrollCallback),this._scrollCallback=void 0)}stopPlayOnShow(){this._onShowIntersectionObserver&&(this._onShowIntersectionObserver.disconnect(),this._onShowIntersectionObserver=void 0)}addIntersectionObserver(t){if(!this.container)throw b("Can't play on show, player container element not available.");let e={root:null,rootMargin:"0px",threshold:t!=null&&t.threshold?t.threshold:[0,1]},i=o=>{o.forEach(n=>{var r,s;this._visibilityPercentage=n.intersectionRatio*100,n.isIntersecting?(t!=null&&t.callbackOnIntersect&&t.callbackOnIntersect(this._visibilityPercentage),(r=this._container)==null||r.dispatchEvent(new Event("visibilityChange"))):t!=null&&t.callbackOnIntersect&&(t.callbackOnIntersect(0),(s=this._container)==null||s.dispatchEvent(new Event("visibilityChange")))})};this._onShowIntersectionObserver=new IntersectionObserver(i,e),this._onShowIntersectionObserver.observe(this.container)}playOnShow(t){var e;if(this.stop(),!this.container)throw b("Can't play on show, player container element not available.");this._onShowIntersectionObserver&&this.stopPlayOnShow(),this.addIntersectionObserver({threshold:(e=t?.threshold)!=null?e:[],callbackOnIntersect:i=>{i===0?this.pause():this.play()}})}_validatePlaybackOptions(t){if(!t)return{};let e={};for(let[i,o]of Object.entries(t))switch(i){case"autoplay":typeof o=="boolean"&&(e.autoplay=o);break;case"direction":typeof o=="number"&&[1,-1].includes(o)&&(e.direction=o);break;case"loop":(typeof o=="boolean"||typeof o=="number")&&(e.loop=o);break;case"playMode":typeof o=="string"&&["normal","bounce"].includes(o)&&(e.playMode=o);break;case"speed":typeof o=="number"&&(e.speed=o);break;case"themeColor":typeof o=="string"&&(e.themeColor=o);break;case"hover":typeof o=="boolean"&&(e.hover=o);break;case"intermission":typeof o=="number"&&(e.intermission=o);break;case"defaultTheme":typeof o=="string"&&(e.defaultTheme=o);break}return this._requireValidPlaybackOptions(e),e}_requireAnimationsInTheManifest(){var t;if(!((t=this._dotLottieLoader.manifest)!=null&&t.animations.length))throw b("No animations found in manifest.")}_requireAnimationsToBeLoaded(){if(this._dotLottieLoader.animationsMap.size===0)throw b("No animations have been loaded.")}async play(t,e){var i,o;if(["initial","loading"].includes(this._currentState)){S("Player unable to play whilst loading.");return}if(this._requireAnimationsInTheManifest(),this._requireAnimationsToBeLoaded(),this._lottie&&!t){this._lottie.playDirection===-1&&this._lottie.currentFrame===0?this._lottie.goToAndPlay(this._lottie.totalFrames,!0):this._lottie.play(),this.setCurrentState("playing");return}if(typeof t=="number"){let n=(i=this._dotLottieLoader.manifest)==null?void 0:i.animations[t];if(!n)throw b("animation not found.");typeof e=="function"?await this.render({id:n.id,...e(this._getPlaybackOptions(),this._getOptionsFromAnimation(n))}):await this.render({id:n.id})}if(typeof t=="string"){let n=(o=this._dotLottieLoader.manifest)==null?void 0:o.animations.find(r=>r.id===t);if(!n)throw b("animation not found.");typeof e=="function"?await this.render({id:n.id,...e(this._getPlaybackOptions(),this._getOptionsFromAnimation(n))}):await this.render({id:n.id})}}playSegments(t,e){if(!this._lottie||["loading"].includes(this._currentState)){S("playSegments() Can't use whilst loading.");return}this._lottie.playSegments(t,e),this.setCurrentState("playing")}resetSegments(t){if(!this._lottie||["loading"].includes(this._currentState)){S("resetSegments() Can't use whilst loading.");return}this._lottie.resetSegments(t)}togglePlay(){this.currentState==="playing"?this.pause():this.play()}_getAnimationByIdOrIndex(t){var e,i;if(this._requireAnimationsInTheManifest(),this._requireAnimationsToBeLoaded(),typeof t=="number"){let o=(e=this._dotLottieLoader.manifest)==null?void 0:e.animations[t];if(!o)throw b("animation not found.");return o}if(typeof t=="string"){let o=(i=this._dotLottieLoader.manifest)==null?void 0:i.animations.find(n=>n.id===t);if(!o)throw b("animation not found.");return o}throw b("first param must be a number or string")}get activeAnimationId(){return this._getActiveAnimationId()}get currentAnimationId(){return this._currentAnimationId}get activeStateId(){return this._activeStateId}async _startInteractivity(t){if(!this._inInteractiveMode){ft("Can't start interactivity. Not in interactive mode. Call enterInteractiveMode(stateId: string) to start.");return}if(this._dotLottieLoader.stateMachinesMap.size===0&&await this._dotLottieLoader.getStateMachines(),this._dotLottieLoader.stateMachinesMap.size===0)throw b("No interactivity states are available.");if(t==="undefined")throw b("stateId is not specified.");this._stateMachineManager||(this._stateMachineManager=await Hn(Array.from(this._dotLottieLoader.stateMachinesMap.values()),this)),this._stateMachineManager.start(t)}enterInteractiveMode(t){var e;if(t)this._inInteractiveMode||(this._prevUserPlaybackOptions={...this._userPlaybackOptions}),this._inInteractiveMode&&((e=this._stateMachineManager)==null||e.stop()),this._activeStateId=t,this._inInteractiveMode=!0,this._startInteractivity(t);else throw b("stateId must be a non-empty string.")}exitInteractiveMode(){var t;this._inInteractiveMode&&(this._inInteractiveMode=!1,this._activeStateId="",(t=this._stateMachineManager)==null||t.stop(),this._userPlaybackOptions={},this._userPlaybackOptions={...this._prevUserPlaybackOptions},this._prevUserPlaybackOptions={},this.reset())}reset(){var t;let e=this._getActiveAnimationId(),i=(t=this._dotLottieLoader.manifest)==null?void 0:t.animations.find(o=>o.id===e);if(this._inInteractiveMode&&this.exitInteractiveMode(),!i)throw b("animation not found.");this.play(e)}previous(t){if(!this._dotLottieLoader.manifest||!this._dotLottieLoader.manifest.animations.length)throw b("manifest not found.");if(this._inInteractiveMode){S("previous() is not supported in interactive mode.");return}let e=this._dotLottieLoader.manifest.animations.findIndex(o=>o.id===this._currentAnimationId);if(e===-1)throw b("animation not found.");let i=this._dotLottieLoader.manifest.animations[(e-1+this._dotLottieLoader.manifest.animations.length)%this._dotLottieLoader.manifest.animations.length];if(!i||!i.id)throw b("animation not found.");typeof t=="function"?this.render({id:i.id,...t(this._getPlaybackOptions(),this._getOptionsFromAnimation(i))}):this.render({id:i.id})}next(t){if(!this._dotLottieLoader.manifest||!this._dotLottieLoader.manifest.animations.length)throw b("manifest not found.");if(this._inInteractiveMode){S("next() is not supported in interactive mode.");return}let e=this._dotLottieLoader.manifest.animations.findIndex(o=>o.id===this._currentAnimationId);if(e===-1)throw b("animation not found.");let i=this._dotLottieLoader.manifest.animations[(e+1)%this._dotLottieLoader.manifest.animations.length];if(!i||!i.id)throw b("animation not found.");typeof t=="function"?this.render({id:i.id,...t(this._getPlaybackOptions(),this._getOptionsFromAnimation(i))}):this.render({id:i.id})}getManifest(){return this._dotLottieLoader.manifest}resize(){if(!this._lottie||["loading"].includes(this._currentState)){S("resize() Can't use whilst loading.");return}this._lottie.resize()}stop(){if(!this._lottie||["loading"].includes(this._currentState)){S("stop() Can't use whilst loading.");return}this.clearCountTimer(),this._counter=0,this._setPlayerState(()=>({direction:this._getOption("direction")})),this._lottie.stop(),this.setCurrentState("stopped")}pause(){if(!this._lottie||["loading"].includes(this._currentState)){S("pause() Can't use whilst loading.");return}this.clearCountTimer(),this._lottie.pause(),this.setCurrentState("paused")}freeze(){if(!this._lottie||["loading"].includes(this._currentState)){S("freeze() Can't use whilst loading.");return}this.currentState!=="frozen"&&(this._stateBeforeFreeze=this.currentState),this._lottie.pause(),this.setCurrentState("frozen")}unfreeze(){if(!this._lottie||["loading"].includes(this._currentState)){S("unfreeze() Can't use whilst loading.");return}this._stateBeforeFreeze==="playing"?this.play():this.pause()}destroy(){var t,e;(t=this._container)!=null&&t.__lottie&&(this._container.__lottie.destroy(),this._container.__lottie=null),this._audios.length&&(this._audios.forEach(i=>{i.unload()}),this._audios=[]),this.clearCountTimer(),typeof document<"u"&&document.removeEventListener("visibilitychange",()=>this._onVisibilityChange()),this._counter=0,(e=this._lottie)==null||e.destroy(),this._lottie=void 0}getAnimationInstance(){return this._lottie}static getLottieWebVersion(){return`${qn.dependencies["lottie-web"]}`}addEventListener(t,e){var i,o,n;this._listeners.has(t)||this._listeners.set(t,new Set),(i=this._listeners.get(t))==null||i.add(e);try{t==="complete"?(o=this._container)==null||o.addEventListener(t,e):(n=this._lottie)==null||n.addEventListener(t,e)}catch(r){ft(`addEventListener ${r}`)}}getState(){var t,e,i,o,n,r,s;return{autoplay:(e=(t=this._lottie)==null?void 0:t.autoplay)!=null?e:!1,currentState:this._currentState,frame:this._frame,visibilityPercentage:this._visibilityPercentage,seeker:this._seeker,direction:(o=(i=this._lottie)==null?void 0:i.playDirection)!=null?o:1,hover:this._hover,loop:this._loop||!1,playMode:this._mode,speed:(r=(n=this._lottie)==null?void 0:n.playSpeed)!=null?r:1,background:this._background,intermission:this._intermission,defaultTheme:this._defaultTheme,currentAnimationId:this._currentAnimationId,activeStateId:(s=this._activeStateId)!=null?s:""}}_notify(){this.state.setState(this.getState())}get totalFrames(){var t;return((t=this._lottie)==null?void 0:t.totalFrames)||0}get direction(){return this._lottie?this._lottie.playDirection:1}setDirection(t){this._requireValidDirection(t),this._setPlayerState(()=>({direction:t})),this._userPlaybackOptions.direction=t}get speed(){var t;return((t=this._lottie)==null?void 0:t.playSpeed)||1}setSpeed(t){this._requireValidSpeed(t),this._setPlayerState(()=>({speed:t})),this._userPlaybackOptions.speed=t}get autoplay(){var t,e;return(e=(t=this._lottie)==null?void 0:t.autoplay)!=null?e:!1}setAutoplay(t){if(this._requireValidAutoplay(t),!this._lottie||["loading"].includes(this._currentState)){S("setAutoplay() Can't use whilst loading.");return}this._setPlayerState(()=>({autoplay:t})),this._userPlaybackOptions.autoplay=t}toggleAutoplay(){if(!this._lottie||["loading"].includes(this._currentState)){S("toggleAutoplay() Can't use whilst loading.");return}this.setAutoplay(!this._lottie.autoplay)}get defaultTheme(){return this._defaultTheme}setDefaultTheme(t){this._setPlayerState(()=>({defaultTheme:t})),this._userPlaybackOptions.defaultTheme=t,this._animation&&this.render()}get loop(){return this._loop}setLoop(t){this._requireValidLoop(t),this._setPlayerState(()=>({loop:t})),this._userPlaybackOptions.loop=t}toggleLoop(){if(!this._lottie||["loading"].includes(this._currentState)){S("toggleLoop() Can't use whilst loading.");return}this.setLoop(!this._loop)}get background(){return this._background}setBackground(t){this._requireValidBackground(t),this._background=t,this._container&&(this._container.style.backgroundColor=t)}get _frame(){return this._lottie?this.currentState==="completed"?this.direction===-1?0:this._lottie.totalFrames:this._lottie.currentFrame:0}get _seeker(){return this._lottie?this._frame/this._lottie.totalFrames*100:0}async revertToManifestValues(t){var e;let i;!Array.isArray(t)||t.length===0?i=["autoplay","defaultTheme","direction","hover","intermission","loop","playMode","speed","activeAnimationId"]:i=t;let o=!1;if(i.includes("activeAnimationId")){let n=(e=this._dotLottieLoader.manifest)==null?void 0:e.activeAnimationId,r=this._getAnimationByIdOrIndex(n||0);this._activeAnimationId=n,await this._setCurrentAnimation(r.id),o=!0}i.forEach(n=>{switch(n){case"autoplay":delete this._userPlaybackOptions.autoplay,this.setAutoplay(this._getOption("autoplay"));break;case"defaultTheme":delete this._userPlaybackOptions.defaultTheme,this.setDefaultTheme(this._getOption("defaultTheme"));break;case"direction":delete this._userPlaybackOptions.direction,this.setDirection(this._getOption("direction"));break;case"hover":delete this._userPlaybackOptions.hover,this.setHover(this._getOption("hover"));break;case"intermission":delete this._userPlaybackOptions.intermission,this.setIntermission(this._getOption("intermission"));break;case"loop":delete this._userPlaybackOptions.loop,this.setLoop(this._getOption("loop"));break;case"playMode":delete this._userPlaybackOptions.playMode,this.setMode(this._getOption("playMode")),this.setDirection(this._getOption("direction"));break;case"speed":delete this._userPlaybackOptions.speed,this.setSpeed(this._getOption("speed"));break}}),o&&this.render()}removeEventListener(t,e){var i,o,n;try{t==="complete"?(i=this._container)==null||i.removeEventListener(t,e):(o=this._lottie)==null||o.removeEventListener(t,e),(n=this._listeners.get(t))==null||n.delete(e)}catch(r){ft("removeEventListener",r)}}_handleAnimationComplete(){var t;typeof this._loop=="number"&&this.stop();let e=this.direction===-1?0:this.totalFrames-1;this.goToAndStop(e,!0),this._counter=0,this.clearCountTimer(),this.setCurrentState("completed"),(t=this._container)==null||t.dispatchEvent(new Event("complete"))}addEventListeners(){var t;if(!this._lottie||["loading"].includes(this._currentState)){S("addEventListeners() Can't use whilst loading.");return}this._lottie.addEventListener("enterFrame",()=>{var e;if(!this._lottie){S("enterFrame event : Lottie is undefined.");return}Math.floor(this._lottie.currentFrame)===0&&this.direction===-1&&((e=this._container)==null||e.dispatchEvent(new Event("complete")),this.loop||this.setCurrentState("completed")),this._notify()}),this._lottie.addEventListener("loopComplete",()=>{var e;if(!this._lottie){S("loopComplete event : Lottie is undefined.");return}(e=this._container)==null||e.dispatchEvent(new Event("loopComplete")),this.intermission>0&&this.pause();let i=this._lottie.playDirection;if(typeof this._loop=="number"&&this._loop>0&&(this._counter+=this._mode==="bounce"?.5:1,this._counter>=this._loop)){this._handleAnimationComplete();return}this._mode==="bounce"&&typeof i=="number"&&(i=Number(i)*-1);let o=i===-1?this._lottie.totalFrames-1:0;this.intermission?(this.goToAndPlay(o,!0),this.pause(),this._counterInterval=window.setTimeout(()=>{this._lottie&&(this._setPlayerState(()=>({direction:i})),this.goToAndPlay(o,!0))},this._intermission)):(this._setPlayerState(()=>({direction:i})),this.goToAndPlay(i===-1?this.totalFrames-1:0,!0))}),this._lottie.addEventListener("complete",()=>{if(this._lottie&&this._loop===!1&&this._mode==="bounce"){if(this._counter+=.5,this._counter>=1){this._handleAnimationComplete();return}this._counterInterval=window.setTimeout(()=>{if(!this._lottie)return;let e=this._lottie.playDirection;this._mode==="bounce"&&typeof e=="number"&&(e=Number(e)*-1);let i=e===-1?this.totalFrames-1:0;this._setPlayerState(()=>({direction:e})),this.goToAndPlay(i,!0)},this._intermission)}else this._handleAnimationComplete()});for(let[e,i]of this._listeners)if(e==="complete")for(let o of i)(t=this._container)==null||t.addEventListener(e,o);else for(let o of i)this._lottie.addEventListener(e,o)}async _setCurrentAnimation(t){this._currentState="loading";let e=await this._dotLottieLoader.getAnimation(t);this._currentAnimationId=t,this._animation=e,this._currentState="ready"}async _getAudioFactory(){if(this._animation&&zn(this._animation)){let{DotLottieAudio:t}=await et(()=>import("./dotlottie-audio-75C54RUV.Dab6ZNcp.js"),__vite__mapDeps([0,1]),import.meta.url);return e=>{let i=new t({src:[e]});return this._audios.push(i),i}}return null}async render(t){var e,i,o,n,r,s,a,l,d,u,h,p,c,v,f,_,m,L;if(t!=null&&t.id)await this._setCurrentAnimation(t.id);else if(!this._animation)throw b("no animation selected");let g=(e=q.loop)!=null?e:!1,M=(i=q.autoplay)!=null?i:!1,T=(o=q.playMode)!=null?o:"normal",F=(n=q.intermission)!=null?n:0,x=(r=q.hover)!=null?r:!1,$=(s=q.direction)!=null?s:1,z=(a=q.speed)!=null?a:1,W=(l=q.defaultTheme)!=null?l:"";g=(d=t?.loop)!=null?d:this._getOption("loop"),M=(u=t?.autoplay)!=null?u:this._getOption("autoplay"),T=(h=t?.playMode)!=null?h:this._getOption("playMode"),F=(p=t?.intermission)!=null?p:this._getOption("intermission"),x=(c=t?.hover)!=null?c:this._getOption("hover"),$=(v=t?.direction)!=null?v:this._getOption("direction"),z=(f=t?.speed)!=null?f:this._getOption("speed"),W=(_=t?.defaultTheme)!=null?_:this._getOption("defaultTheme");let U={...this._animationConfig,autoplay:x?!1:M,loop:typeof g=="number"?!0:g,renderer:this._worker?"svg":(m=this._animationConfig.renderer)!=null?m:"svg"},[B,j,H]=await Promise.all([this._dotLottieLoader.getTheme(W),this._getLottiePlayerInstance(),this._getAudioFactory()]);if(B&&this._animation?(this._animation=se(this._animation),this._animation.slots=B):this._animation=await this._dotLottieLoader.getAnimation((L=this._currentAnimationId)!=null?L:""),this._activeStateId&&!this._inInteractiveMode){this.enterInteractiveMode(this._activeStateId);return}this.destroy(),this._setPlayerState(()=>({defaultTheme:W,playMode:T,intermission:F,hover:x,loop:g})),H?this._lottie=j.loadAnimation({...U,container:this._container,animationData:this._animation,audioFactory:H}):this._lottie=j.loadAnimation({...U,container:this._container,animationData:this._animation}),typeof this._lottie.resetSegments>"u"&&(this._lottie.resetSegments=()=>{var N;(N=this._lottie)==null||N.playSegments([0,this._lottie.totalFrames],!0)}),this.addEventListeners(),this._container&&(this._container.__lottie=this._lottie),this._setPlayerState(()=>({direction:$,speed:z})),M&&!x&&(g===!1&&$===-1?this.play():this.setCurrentState("playing")),this._updateTestData()}async _getLottiePlayerInstance(){var t;let e=(t=this._animationConfig.renderer)!=null?t:"svg",i;if(this._worker)return e!=="svg"&&S("Worker is only supported with svg renderer. Change or remove renderer prop to get rid of this warning."),i=await et(()=>import("./lottie_worker-Q23FJ6ZR-YP5OKMTN.l-cIQIE3.js"),__vite__mapDeps([2,1]),import.meta.url),i.default;switch(e){case"svg":{this._light?i=await et(()=>import("./lottie_light-KMJEUZFY-TNG7ODX7.WXkf8WqY.js"),__vite__mapDeps([3,1]),import.meta.url):i=await et(()=>import("./lottie_svg-MJGYILXD-NRTSROOT.BePWeu7F.js"),__vite__mapDeps([4,1]),import.meta.url);break}case"canvas":{this._light?i=await et(()=>import("./lottie_light_canvas-B5UTTNXA-PRI6IBWW.H6XMkBUb.js"),__vite__mapDeps([5,1]),import.meta.url):i=await et(()=>import("./lottie_canvas-CDSUBMCL-MZNYH5VV.BxmowW6m.js"),__vite__mapDeps([6,1]),import.meta.url);break}case"html":{this._light?i=await et(()=>import("./lottie_light_html-SLCECTRT-SYWXEBDN.Cb5GXSPb.js"),__vite__mapDeps([7,1]),import.meta.url):i=await et(()=>import("./lottie_html-X3TYKVQI-L6774NQS.D-FsIa71.js"),__vite__mapDeps([8,1]),import.meta.url);break}default:throw new Error(`Invalid renderer: ${e}`)}return i.default}_getActiveAnimationId(){var t,e,i,o;let n=this._dotLottieLoader.manifest;return(o=(i=(t=this._activeAnimationId)!=null?t:n?.activeAnimationId)!=null?i:(e=n?.animations[0])==null?void 0:e.id)!=null?o:void 0}async load(t){if(this._currentState==="loading"){S("Loading in progress..");return}try{if(this.setCurrentState("loading"),typeof this._src=="string")if(jn(this._src)){let i=JSON.parse(this._src);this._dotLottieLoader.loadFromLottieJSON(i)}else{let i=new URL(this._src,window.location.href);await this._dotLottieLoader.loadFromUrl(i.toString())}else if(typeof this._src=="object"&&Bt(this._src))this._dotLottieLoader.loadFromLottieJSON(this._src);else throw b("Invalid src provided");if(!this._dotLottieLoader.manifest)throw b("No manifest found");let e=this._getActiveAnimationId();if(!e)throw b("No active animation found");await this._setCurrentAnimation(e),await this.render(t)}catch(e){this.setCurrentState("error"),e instanceof Error&&ft(`Error loading animation: ${e.message}`)}}setErrorState(t){this.setCurrentState("error"),ft(t)}_requireValidDirection(t){if(t!==-1&&t!==1)throw b("Direction can only be -1 (backwards) or 1 (forwards)")}_requireValidIntermission(t){if(t<0||!Number.isInteger(t))throw b("intermission must be a positive number")}_requireValidLoop(t){if(typeof t=="number"&&(!Number.isInteger(t)||t<0))throw b("loop must be a positive number or boolean")}_requireValidSpeed(t){if(typeof t!="number")throw b("speed must be a number")}_requireValidBackground(t){if(typeof t!="string")throw b("background must be a string")}_requireValidAutoplay(t){if(typeof t!="boolean")throw b("autoplay must be a boolean")}_requireValidPlaybackOptions(t){t.direction&&this._requireValidDirection(t.direction),t.intermission&&this._requireValidIntermission(t.intermission),t.loop&&this._requireValidLoop(t.loop),t.speed&&this._requireValidSpeed(t.speed)}},Zn=Object.defineProperty,I=(t,e,i,o)=>{for(var n=void 0,r=t.length-1,s;r>=0;r--)(s=t[r])&&(n=s(e,i,n)||n);return n&&Zn(e,i,n),n},Jn=(t,e)=>e.kind==="method"&&e.descriptor&&!("value"in e.descriptor)?{...e,finisher(i){i.createProperty(e.key,t)}}:{kind:"field",key:Symbol(),placement:"own",descriptor:{},originalKey:e.key,initializer(){typeof e.initializer=="function"&&(this[e.key]=e.initializer.call(this))},finisher(i){i.createProperty(e.key,t)}},Wn=(t,e,i)=>{e.constructor.createProperty(i,t)};function O(t){return(e,i)=>i!==void 0?Wn(t,e,i):Jn(t,e)}function Kn(t){return O({...t,state:!0})}var Gn=({finisher:t,descriptor:e})=>(i,o)=>{var n;if(o===void 0){let r=(n=i.originalKey)!==null&&n!==void 0?n:i.key,s=e!=null?{kind:"method",placement:"prototype",key:r,descriptor:e(i.key)}:{...i,key:r};return t!=null&&(s.finisher=function(a){t(a,r)}),s}{let r=i.constructor;e!==void 0&&Object.defineProperty(i,o,e(o)),t?.(r,o)}};function Qn(t,e){return Gn({descriptor:i=>({get(){var n,r;return(r=(n=this.renderRoot)===null||n===void 0?void 0:n.querySelector(t))!==null&&r!==void 0?r:null},enumerable:!0,configurable:!0})})}var ae;((ae=window.HTMLSlotElement)===null||ae===void 0?void 0:ae.prototype.assignedElements)!=null;var Xn={version:"2.7.12"},si="dotlottie-player",k=class extends St{defaultTheme="";container;playMode=Vi.Normal;autoplay=!1;background="transparent";controls=!1;direction=1;hover=!1;loop;renderer="svg";speed=1;src;intermission=0;activeAnimationId=null;light=!1;worker=!1;activeStateId;_seeker=0;_dotLottieCommonPlayer;_io;_loop;_renderer="svg";_unsubscribeListeners;_hasMultipleAnimations=!1;_hasMultipleThemes=!1;_hasMultipleStates=!1;_popoverIsOpen=!1;_animationsTabIsOpen=!1;_statesTabIsOpen=!1;_styleTabIsOpen=!1;_themesForCurrentAnimation=[];_statesForCurrentAnimation=[];_parseLoop(t){let e=parseInt(t,10);return Number.isInteger(e)&&e>0?(this._loop=e,e):typeof t=="string"&&["true","false"].includes(t)?(this._loop=t==="true",this._loop):(S("loop must be a positive integer or a boolean"),!1)}_handleSeekChange(t){let e=t.currentTarget;try{let i=parseInt(e.value,10);if(!this._dotLottieCommonPlayer)return;let o=i/100*this._dotLottieCommonPlayer.totalFrames;this.seek(o)}catch{throw b("Error while seeking animation")}}_initListeners(){let t=this._dotLottieCommonPlayer;if(t===void 0){S("player not initialized - cannot add event listeners","dotlottie-player-component");return}this._unsubscribeListeners=t.state.subscribe((e,i)=>{this._seeker=e.seeker,this.requestUpdate(),i.currentState!==e.currentState&&this.dispatchEvent(new CustomEvent(e.currentState)),this.dispatchEvent(new CustomEvent(nt.Frame,{detail:{frame:e.frame,seeker:e.seeker}})),this.dispatchEvent(new CustomEvent(nt.VisibilityChange,{detail:{visibilityPercentage:e.visibilityPercentage}}))}),t.addEventListener("complete",()=>{this.dispatchEvent(new CustomEvent(nt.Complete))}),t.addEventListener("loopComplete",()=>{this.dispatchEvent(new CustomEvent(nt.LoopComplete))}),t.addEventListener("DOMLoaded",()=>{let e=this.getManifest();e&&e.themes&&(this._themesForCurrentAnimation=e.themes.filter(i=>i.animations.includes(this.getCurrentAnimationId()||""))),e&&e.states&&(this._hasMultipleStates=e.states.length>0,this._statesForCurrentAnimation=[],e.states.forEach(i=>{this._statesForCurrentAnimation.push(i)})),this.dispatchEvent(new CustomEvent(nt.Ready))}),t.addEventListener("data_ready",()=>{this.dispatchEvent(new CustomEvent(nt.DataReady))}),t.addEventListener("data_failed",()=>{this.dispatchEvent(new CustomEvent(nt.DataFail))}),window&&window.addEventListener("click",e=>this._clickOutListener(e))}async load(t,e,i){if(!this.shadowRoot)return;this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.destroy(),this._dotLottieCommonPlayer=new ri(t,this.container,{rendererSettings:e??{scaleMode:"noScale",clearCanvas:!0,progressiveLoad:!0,hideOnTransparent:!0},hover:this.hasAttribute("hover")?this.hover:void 0,renderer:this.hasAttribute("renderer")?this._renderer:void 0,loop:this.hasAttribute("loop")?this._loop:void 0,direction:this.hasAttribute("direction")?this.direction===1?1:-1:void 0,speed:this.hasAttribute("speed")?this.speed:void 0,intermission:this.hasAttribute("intermission")?Number(this.intermission):void 0,playMode:this.hasAttribute("playMode")?this.playMode:void 0,autoplay:this.hasAttribute("autoplay")?this.autoplay:void 0,activeAnimationId:this.hasAttribute("activeAnimationId")?this.activeAnimationId:void 0,defaultTheme:this.hasAttribute("defaultTheme")?this.defaultTheme:void 0,light:this.light,worker:this.worker,activeStateId:this.hasAttribute("activeStateId")?this.activeStateId:void 0}),await this._dotLottieCommonPlayer.load(i);let o=this.getManifest();this._hasMultipleAnimations=this.animationCount()>1,o&&(o.themes&&(this._themesForCurrentAnimation=o.themes.filter(n=>n.animations.includes(this.getCurrentAnimationId()||"")),this._hasMultipleThemes=o.themes.length>0),o.states&&(this._hasMultipleStates=o.states.length>0,this._statesForCurrentAnimation=[],o.states.forEach(n=>{this._statesForCurrentAnimation.push(n)}))),this._initListeners()}getCurrentAnimationId(){var t;return(t=this._dotLottieCommonPlayer)==null?void 0:t.currentAnimationId}animationCount(){var t;return this._dotLottieCommonPlayer&&((t=this._dotLottieCommonPlayer.getManifest())==null?void 0:t.animations.length)||0}animations(){if(!this._dotLottieCommonPlayer)return[];let t=this._dotLottieCommonPlayer.getManifest();return t?.animations.map(e=>e.id)||[]}currentAnimation(){return!this._dotLottieCommonPlayer||!this._dotLottieCommonPlayer.currentAnimationId?"":this._dotLottieCommonPlayer.currentAnimationId}getState(){return this._dotLottieCommonPlayer?this._dotLottieCommonPlayer.getState():Fi}getManifest(){var t;return(t=this._dotLottieCommonPlayer)==null?void 0:t.getManifest()}getLottie(){var t;return(t=this._dotLottieCommonPlayer)==null?void 0:t.getAnimationInstance()}getVersions(){return{lottieWebVersion:ri.getLottieWebVersion(),dotLottiePlayerVersion:`${Xn.version}`}}previous(t){var e;(e=this._dotLottieCommonPlayer)==null||e.previous(t)}next(t){var e;(e=this._dotLottieCommonPlayer)==null||e.next(t)}reset(){var t;(t=this._dotLottieCommonPlayer)==null||t.reset()}play(t,e){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.play(t,e)}pause(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.pause()}stop(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.stop()}playOnShow(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.playOnShow(t)}stopPlayOnShow(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.stopPlayOnShow()}playOnScroll(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.playOnScroll(t)}stopPlayOnScroll(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.stopPlayOnScroll()}seek(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.seek(t)}snapshot(t=!0){if(!this.shadowRoot)return"";let e=this.shadowRoot.querySelector(".animation svg"),i=new XMLSerializer().serializeToString(e);if(t){let o=document.createElement("a");o.href=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(i)}`,o.download=`download_${this._seeker}.svg`,document.body.appendChild(o),o.click(),document.body.removeChild(o)}return i}setTheme(t){var e;(e=this._dotLottieCommonPlayer)==null||e.setDefaultTheme(t)}themes(){var t;if(!this._dotLottieCommonPlayer)return[];let e=this._dotLottieCommonPlayer.getManifest();return((t=e?.themes)==null?void 0:t.map(i=>i.id))||[]}getDefaultTheme(){return this._dotLottieCommonPlayer?this._dotLottieCommonPlayer.defaultTheme:""}getActiveStateMachine(){return this._dotLottieCommonPlayer?this._dotLottieCommonPlayer.activeStateId:""}_freeze(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.freeze()}setSpeed(t=1){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.setSpeed(t)}setDirection(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.setDirection(t)}setLooping(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.setLoop(t)}isLooping(){return this._dotLottieCommonPlayer?this._dotLottieCommonPlayer.loop:!1}togglePlay(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.togglePlay()}toggleLooping(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.toggleLoop()}setPlayMode(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.setMode(t)}enterInteractiveMode(t){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.enterInteractiveMode(t)}exitInteractiveMode(){this._dotLottieCommonPlayer&&this._dotLottieCommonPlayer.exitInteractiveMode()}revertToManifestValues(t){var e;(e=this._dotLottieCommonPlayer)==null||e.revertToManifestValues(t)}static get styles(){return $o}async firstUpdated(){var t;this.container=(t=this.shadowRoot)==null?void 0:t.querySelector("#animation"),"IntersectionObserver"in window&&(this._io=new IntersectionObserver(e=>{var i,o;e[0]!==void 0&&e[0].isIntersecting?((i=this._dotLottieCommonPlayer)==null?void 0:i.currentState)===mt.Frozen&&this.play():((o=this._dotLottieCommonPlayer)==null?void 0:o.currentState)===mt.Playing&&this._freeze()}),this._io.observe(this.container)),this.loop?this._parseLoop(this.loop):this.hasAttribute("loop")&&this._parseLoop("true"),this.renderer==="svg"?this._renderer="svg":this.renderer==="canvas"?this._renderer="canvas":this.renderer==="html"&&(this._renderer="html"),this.src&&await this.load(this.src)}disconnectedCallback(){var t,e;this._io&&(this._io.disconnect(),this._io=void 0),(t=this._dotLottieCommonPlayer)==null||t.destroy(),(e=this._unsubscribeListeners)==null||e.call(this),window&&window.removeEventListener("click",i=>this._clickOutListener(i))}_clickOutListener(t){!t.composedPath().some(e=>e instanceof HTMLElement?e.classList.contains("popover")||e.id==="lottie-animation-options":!1)&&this._popoverIsOpen&&(this._popoverIsOpen=!1,this.requestUpdate())}renderControls(){var t,e,i,o,n;let r=((t=this._dotLottieCommonPlayer)==null?void 0:t.currentState)===mt.Playing,s=((e=this._dotLottieCommonPlayer)==null?void 0:e.currentState)===mt.Paused;return y`
      <div id="lottie-controls" aria-label="lottie-animation-controls" class="toolbar">
        ${this._hasMultipleAnimations?y`
              <button @click=${()=>this.previous()} aria-label="Previous animation" class="btn-spacing-left">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.69214 13.5C1.69214 13.7761 1.916 14 2.19214 14C2.46828 14 2.69214 13.7761 2.69214 13.5L2.69214 2.5C2.69214 2.22386 2.46828 2 2.19214 2C1.916 2 1.69214 2.22386 1.69214 2.5V13.5ZM12.5192 13.7828C13.1859 14.174 14.0254 13.6933 14.0254 12.9204L14.0254 3.0799C14.0254 2.30692 13.1859 1.8262 12.5192 2.21747L4.13612 7.13769C3.47769 7.52414 3.47769 8.4761 4.13612 8.86255L12.5192 13.7828Z"
                    fill="#20272C"
                  />
                </svg>
              </button>
            `:y``}
        <button
          id="lottie-play-button"
          @click=${()=>{this.togglePlay()}}
          class=${r||s?`active ${this._hasMultipleAnimations?"btn-spacing-center":"btn-spacing-right"}`:`${this._hasMultipleAnimations?"btn-spacing-center":"btn-spacing-right"}`}
          aria-label="play / pause animation"
        >
          ${r?y`
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3.99996 2C3.26358 2 2.66663 2.59695 2.66663 3.33333V12.6667C2.66663 13.403 3.26358 14 3.99996 14H5.33329C6.06967 14 6.66663 13.403 6.66663 12.6667V3.33333C6.66663 2.59695 6.06967 2 5.33329 2H3.99996Z"
                    fill="#20272C"
                  />
                  <path
                    d="M10.6666 2C9.93025 2 9.33329 2.59695 9.33329 3.33333V12.6667C9.33329 13.403 9.93025 14 10.6666 14H12C12.7363 14 13.3333 13.403 13.3333 12.6667V3.33333C13.3333 2.59695 12.7363 2 12 2H10.6666Z"
                    fill="#20272C"
                  />
                </svg>
              `:y`
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3.33337 3.46787C3.33337 2.52312 4.35948 1.93558 5.17426 2.41379L12.8961 6.94592C13.7009 7.41824 13.7009 8.58176 12.8961 9.05408L5.17426 13.5862C4.35948 14.0644 3.33337 13.4769 3.33337 12.5321V3.46787Z"
                    fill="#20272C"
                  />
                </svg>
              `}
        </button>
        ${this._hasMultipleAnimations?y`
              <button @click=${()=>this.next()} aria-label="Next animation" class="btn-spacing-right">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M14.3336 2.5C14.3336 2.22386 14.1097 2 13.8336 2C13.5574 2 13.3336 2.22386 13.3336 2.5V13.5C13.3336 13.7761 13.5574 14 13.8336 14C14.1097 14 14.3336 13.7761 14.3336 13.5V2.5ZM3.50618 2.21722C2.83954 1.82595 2 2.30667 2 3.07965V12.9201C2 13.6931 2.83954 14.1738 3.50618 13.7825L11.8893 8.86231C12.5477 8.47586 12.5477 7.52389 11.8893 7.13745L3.50618 2.21722Z"
                    fill="#20272C"
                  />
                </svg>
              </button>
            `:y``}
        <input
          id="lottie-seeker-input"
          class="seeker ${((i=this._dotLottieCommonPlayer)==null?void 0:i.direction)===-1?"to-left":""}"
          type="range"
          min="0"
          step="1"
          max="100"
          .value=${this._seeker}
          @input=${a=>this._handleSeekChange(a)}
          @mousedown=${()=>{this._freeze()}}
          @mouseup=${()=>{var a;(a=this._dotLottieCommonPlayer)==null||a.unfreeze()}}
          aria-valuemin="1"
          aria-valuemax="100"
          role="slider"
          aria-valuenow=${this._seeker}
          aria-label="lottie-seek-input"
          style=${`--seeker: ${this._seeker}`}
        />
        <button
          id="lottie-loop-toggle"
          @click=${()=>this.toggleLooping()}
          class=${(o=this._dotLottieCommonPlayer)!=null&&o.loop?"active btn-spacing-left":"btn-spacing-left"}
          aria-label="loop-toggle"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M10.8654 2.31319C11.0607 2.11793 11.3772 2.11793 11.5725 2.31319L13.4581 4.19881C13.6534 4.39407 13.6534 4.71066 13.4581 4.90592L11.5725 6.79154C11.3772 6.9868 11.0607 6.9868 10.8654 6.79154C10.6701 6.59628 10.6701 6.27969 10.8654 6.08443L11.6162 5.33362H4V6.66695C4 7.03514 3.70152 7.33362 3.33333 7.33362C2.96514 7.33362 2.66666 7.03514 2.66666 6.66695L2.66666 4.66695C2.66666 4.29876 2.96514 4.00028 3.33333 4.00028H11.8454L10.8654 3.0203C10.6701 2.82504 10.6701 2.50846 10.8654 2.31319Z"
              fill="currentColor"
            />
            <path
              d="M12.4375 11.9999C12.8057 11.9999 13.1042 11.7014 13.1042 11.3332V9.33321C13.1042 8.96502 12.8057 8.66655 12.4375 8.66655C12.0693 8.66655 11.7708 8.96502 11.7708 9.33321V10.6665H4.15462L4.90543 9.91573C5.10069 9.72047 5.10069 9.40389 4.90543 9.20862C4.71017 9.01336 4.39359 9.01336 4.19832 9.20862L2.31271 11.0942C2.11744 11.2895 2.11744 11.6061 2.31271 11.8013L4.19832 13.687C4.39359 13.8822 4.71017 13.8822 4.90543 13.687C5.10069 13.4917 5.10069 13.1751 4.90543 12.9799L3.92545 11.9999H12.4375Z"
              fill="currentColor"
            />
          </svg>
        </button>
        ${this._hasMultipleAnimations||this._hasMultipleThemes||this._hasMultipleStates?y`
              <button
                id="lottie-animation-options"
                @click=${()=>{this._popoverIsOpen=!this._popoverIsOpen,this.requestUpdate()}}
                aria-label="options"
                class="btn-spacing-right"
                style=${`background-color: ${this._popoverIsOpen?"var(--lottie-player-toolbar-icon-hover-color)":""}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8.33337 11.6666C7.78109 11.6666 7.33337 12.1143 7.33337 12.6666C7.33337 13.2189 7.78109 13.6666 8.33337 13.6666C8.88566 13.6666 9.33337 13.2189 9.33337 12.6666C9.33337 12.1143 8.88566 11.6666 8.33337 11.6666Z"
                    fill="#20272C"
                  />
                  <path
                    d="M7.33337 7.99992C7.33337 7.44763 7.78109 6.99992 8.33337 6.99992C8.88566 6.99992 9.33338 7.44763 9.33338 7.99992C9.33338 8.5522 8.88566 8.99992 8.33337 8.99992C7.78109 8.99992 7.33337 8.5522 7.33337 7.99992Z"
                    fill="#20272C"
                  />
                  <path
                    d="M7.33337 3.33325C7.33337 2.78097 7.78109 2.33325 8.33337 2.33325C8.88566 2.33325 9.33338 2.78097 9.33338 3.33325C9.33338 3.88554 8.88566 4.33325 8.33337 4.33325C7.78109 4.33325 7.33337 3.88554 7.33337 3.33325Z"
                    fill="#20272C"
                  />
                </svg>
              </button>
            `:y``}
      </div>
      ${this._popoverIsOpen?y`
            <div
              id="popover"
              class="popover"
              tabindex="0"
              aria-label="lottie animations themes popover"
              style="min-height: ${this.themes().length>0?"84px":"auto"}"
            >
              ${!this._animationsTabIsOpen&&!this._styleTabIsOpen&&!this._statesTabIsOpen?y`
                    <button
                      class="popover-button"
                      tabindex="0"
                      aria-label="animations"
                      @click=${()=>{this._animationsTabIsOpen=!this._animationsTabIsOpen,this.requestUpdate()}}
                      @keydown=${a=>{(a.code==="Space"||a.code==="Enter")&&(this._animationsTabIsOpen=!this._animationsTabIsOpen,this.requestUpdate())}}
                    >
                      <div class="popover-button-text">Animations</div>
                      <div>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M10.4697 17.5303C10.1768 17.2374 10.1768 16.7626 10.4697 16.4697L14.9393 12L10.4697 7.53033C10.1768 7.23744 10.1768 6.76256 10.4697 6.46967C10.7626 6.17678 11.2374 6.17678 11.5303 6.46967L16.5303 11.4697C16.8232 11.7626 16.8232 12.2374 16.5303 12.5303L11.5303 17.5303C11.2374 17.8232 10.7626 17.8232 10.4697 17.5303Z"
                            fill="#4C5863"
                          />
                        </svg>
                      </div>
                    </button>
                  `:y``}
              ${this._hasMultipleThemes&&!this._styleTabIsOpen&&!this._animationsTabIsOpen&&!this._statesTabIsOpen?y` <button
                    class="popover-button"
                    aria-label="Themes"
                    @click=${()=>{this._styleTabIsOpen=!this._styleTabIsOpen,this.requestUpdate()}}
                    @keydown=${a=>{(a.code==="Space"||a.code==="Enter")&&(this._styleTabIsOpen=!this._styleTabIsOpen,this.requestUpdate())}}
                  >
                    <div class="popover-button-text">Themes</div>
                    <div>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fill-rule="evenodd"
                          clip-rule="evenodd"
                          d="M10.4697 17.5303C10.1768 17.2374 10.1768 16.7626 10.4697 16.4697L14.9393 12L10.4697 7.53033C10.1768 7.23744 10.1768 6.76256 10.4697 6.46967C10.7626 6.17678 11.2374 6.17678 11.5303 6.46967L16.5303 11.4697C16.8232 11.7626 16.8232 12.2374 16.5303 12.5303L11.5303 17.5303C11.2374 17.8232 10.7626 17.8232 10.4697 17.5303Z"
                          fill="#4C5863"
                        />
                      </svg>
                    </div>
                  </button>`:""}
              ${this._hasMultipleStates&&!this._styleTabIsOpen&&!this._animationsTabIsOpen&&!this._statesTabIsOpen?y` <button
                    class="popover-button"
                    aria-label="States"
                    @click=${()=>{this._statesTabIsOpen=!this._statesTabIsOpen,this.requestUpdate()}}
                    @keydown=${a=>{(a.code==="Space"||a.code==="Enter")&&(this._statesTabIsOpen=!this._statesTabIsOpen,this.requestUpdate())}}
                  >
                    <div class="popover-button-text">States</div>
                    <div>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fill-rule="evenodd"
                          clip-rule="evenodd"
                          d="M10.4697 17.5303C10.1768 17.2374 10.1768 16.7626 10.4697 16.4697L14.9393 12L10.4697 7.53033C10.1768 7.23744 10.1768 6.76256 10.4697 6.46967C10.7626 6.17678 11.2374 6.17678 11.5303 6.46967L16.5303 11.4697C16.8232 11.7626 16.8232 12.2374 16.5303 12.5303L11.5303 17.5303C11.2374 17.8232 10.7626 17.8232 10.4697 17.5303Z"
                          fill="#4C5863"
                        />
                      </svg>
                    </div>
                  </button>`:""}
              ${this._animationsTabIsOpen?y`<button
                      class="option-title-button"
                      aria-label="Back to main popover menu"
                      @click=${()=>{this._animationsTabIsOpen=!this._animationsTabIsOpen,this.requestUpdate()}}
                    >
                      <div class="option-title-chevron">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M13.5303 6.46967C13.8232 6.76256 13.8232 7.23744 13.5303 7.53033L9.06066 12L13.5303 16.4697C13.8232 16.7626 13.8232 17.2374 13.5303 17.5303C13.2374 17.8232 12.7626 17.8232 12.4697 17.5303L7.46967 12.5303C7.17678 12.2374 7.17678 11.7626 7.46967 11.4697L12.4697 6.46967C12.7626 6.17678 13.2374 6.17678 13.5303 6.46967Z"
                            fill="#20272C"
                          />
                        </svg>
                      </div>
                      <div>Animations</div>
                    </button>
                    <div class="option-title-separator"></div>
                    <div class="option-row">
                      <ul>
                        ${this.animations().map(a=>y`
                            <li>
                              <button
                                class="option-button"
                                aria-label=${`${a}`}
                                @click=${()=>{this._animationsTabIsOpen=!this._animationsTabIsOpen,this._popoverIsOpen=!this._popoverIsOpen,this.play(a),this.requestUpdate()}}
                                @keydown=${l=>{(l.code==="Space"||l.code==="Enter")&&(this._animationsTabIsOpen=!this._animationsTabIsOpen,this._popoverIsOpen=!this._popoverIsOpen,this.play(a),this.requestUpdate())}}
                              >
                                <div class="option-tick">
                                  ${this.currentAnimation()===a?y`
                                        <svg
                                          width="24"
                                          height="24"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M20.5281 5.9372C20.821 6.23009 20.821 6.70497 20.5281 6.99786L9.46297 18.063C9.32168 18.2043 9.12985 18.2833 8.93004 18.2826C8.73023 18.2819 8.53895 18.2015 8.39864 18.0593L3.46795 13.0596C3.1771 12.7647 3.1804 12.2898 3.47532 11.999C3.77024 11.7081 4.2451 11.7114 4.53595 12.0063L8.93634 16.4683L19.4675 5.9372C19.7604 5.64431 20.2352 5.64431 20.5281 5.9372Z"
                                            fill="#20272C"
                                          />
                                        </svg>
                                      `:y`<div style="width: 24px; height: 24px"></div>`}
                                </div>
                                <div>${a}</div>
                              </button>
                            </li>
                          `)}
                      </ul>
                    </div> `:y``}
              ${this._styleTabIsOpen?y`<div class="option-title-themes-row">
                      <button
                        class="option-title-button themes"
                        aria-label="Back to main popover menu"
                        @click=${()=>{this._styleTabIsOpen=!this._styleTabIsOpen,this.requestUpdate()}}
                      >
                        <div class="option-title-chevron">
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fill-rule="evenodd"
                              clip-rule="evenodd"
                              d="M13.5303 6.46967C13.8232 6.76256 13.8232 7.23744 13.5303 7.53033L9.06066 12L13.5303 16.4697C13.8232 16.7626 13.8232 17.2374 13.5303 17.5303C13.2374 17.8232 12.7626 17.8232 12.4697 17.5303L7.46967 12.5303C7.17678 12.2374 7.17678 11.7626 7.46967 11.4697L12.4697 6.46967C12.7626 6.17678 13.2374 6.17678 13.5303 6.46967Z"
                              fill="#20272C"
                            />
                          </svg>
                        </div>
                        <div class="option-title-text">Themes</div>
                        ${((n=this._dotLottieCommonPlayer)==null?void 0:n.defaultTheme)===""?y``:y`
                              <button
                                class="reset-btn"
                                @click=${()=>{this.setTheme(""),this.requestUpdate()}}
                              >
                                Reset
                              </button>
                            `}
                      </button>
                    </div>
                    <div class="option-title-separator"></div>
                    <div class="option-row">
                      <ul>
                        ${this._themesForCurrentAnimation.map(a=>y`
                            <li>
                              <button
                                class="option-button"
                                aria-label="${a.id}"
                                @click=${()=>{this.setTheme(a.id)}}
                                @keydown=${l=>{(l.code==="Space"||l.code==="Enter")&&this.setTheme(a.id)}}
                              >
                                <div class="option-tick">
                                  ${this.getDefaultTheme()===a.id?y`
                                        <svg
                                          width="24"
                                          height="24"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M20.5281 5.9372C20.821 6.23009 20.821 6.70497 20.5281 6.99786L9.46297 18.063C9.32168 18.2043 9.12985 18.2833 8.93004 18.2826C8.73023 18.2819 8.53895 18.2015 8.39864 18.0593L3.46795 13.0596C3.1771 12.7647 3.1804 12.2898 3.47532 11.999C3.77024 11.7081 4.2451 11.7114 4.53595 12.0063L8.93634 16.4683L19.4675 5.9372C19.7604 5.64431 20.2352 5.64431 20.5281 5.9372Z"
                                            fill="#20272C"
                                          />
                                        </svg>
                                      `:y`<div style="width: 24px; height: 24px"></div>`}
                                </div>
                                <div>${a.id}</div>
                              </button>
                            </li>
                          `)}
                      </ul>
                    </div>`:y``}
              ${this._statesTabIsOpen?y`<div class="option-title-themes-row">
                      <button
                        class="option-title-button themes"
                        aria-label="Back to main popover menu"
                        @click=${()=>{this._statesTabIsOpen=!this._statesTabIsOpen,this.requestUpdate()}}
                      >
                        <div class="option-title-chevron">
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fill-rule="evenodd"
                              clip-rule="evenodd"
                              d="M13.5303 6.46967C13.8232 6.76256 13.8232 7.23744 13.5303 7.53033L9.06066 12L13.5303 16.4697C13.8232 16.7626 13.8232 17.2374 13.5303 17.5303C13.2374 17.8232 12.7626 17.8232 12.4697 17.5303L7.46967 12.5303C7.17678 12.2374 7.17678 11.7626 7.46967 11.4697L12.4697 6.46967C12.7626 6.17678 13.2374 6.17678 13.5303 6.46967Z"
                              fill="#20272C"
                            />
                          </svg>
                        </div>
                        <div class="option-title-text">States</div>
                        <button
                          class="reset-btn"
                          @click=${()=>{this.exitInteractiveMode(),this.requestUpdate()}}
                        >
                          Reset
                        </button>
                      </button>
                    </div>
                    <div class="option-title-separator"></div>
                    <div class="option-row">
                      <ul>
                        ${this._statesForCurrentAnimation.map(a=>y`
                            <li>
                              <button
                                class="option-button"
                                aria-label="${a}"
                                @click=${()=>{this.enterInteractiveMode(a)}}
                                @keydown=${l=>{(l.code==="Space"||l.code==="Enter")&&this.enterInteractiveMode(a)}}
                              >
                                <div class="option-tick">
                                  ${this.getActiveStateMachine()===a?y`
                                        <svg
                                          width="24"
                                          height="24"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M20.5281 5.9372C20.821 6.23009 20.821 6.70497 20.5281 6.99786L9.46297 18.063C9.32168 18.2043 9.12985 18.2833 8.93004 18.2826C8.73023 18.2819 8.53895 18.2015 8.39864 18.0593L3.46795 13.0596C3.1771 12.7647 3.1804 12.2898 3.47532 11.999C3.77024 11.7081 4.2451 11.7114 4.53595 12.0063L8.93634 16.4683L19.4675 5.9372C19.7604 5.64431 20.2352 5.64431 20.5281 5.9372Z"
                                            fill="#20272C"
                                          />
                                        </svg>
                                      `:y`<div style="width: 24px; height: 24px"></div>`}
                                </div>
                                <div>${a}</div>
                              </button>
                            </li>
                          `)}
                      </ul>
                    </div>`:y``}
            </div>
          `:y``}
    `}render(){var t;let e=this.controls?"main controls":"main",i=this.controls?"animation controls":"animation";return y`
      <div id="animation-container" class=${e} lang="en" role="img" aria-label="lottie-animation-container">
        <div id="animation" class=${i} style="background:${this.background};">
          ${((t=this._dotLottieCommonPlayer)==null?void 0:t.currentState)===mt.Error?y` <div class="error">⚠️</div> `:void 0}
        </div>
        ${this.controls?this.renderControls():void 0}
      </div>
    `}};I([O({type:String})],k.prototype,"defaultTheme"),I([Qn("#animation")],k.prototype,"container"),I([O()],k.prototype,"playMode"),I([O({type:Boolean})],k.prototype,"autoplay"),I([O({type:String})],k.prototype,"background"),I([O({type:Boolean})],k.prototype,"controls"),I([O({type:Number})],k.prototype,"direction"),I([O({type:Boolean})],k.prototype,"hover"),I([O({type:String})],k.prototype,"loop"),I([O({type:String})],k.prototype,"renderer"),I([O({type:Number})],k.prototype,"speed"),I([O({type:String})],k.prototype,"src"),I([O()],k.prototype,"intermission"),I([O({type:String})],k.prototype,"activeAnimationId"),I([O({type:Boolean})],k.prototype,"light"),I([O({type:Boolean})],k.prototype,"worker"),I([O({type:String})],k.prototype,"activeStateId"),I([Kn()],k.prototype,"_seeker");customElements.get(si)||customElements.define(si,k);/*! Bundled license information:

@lit/reactive-element/decorators/custom-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/property.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/state.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/base.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/event-options.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-all.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-async.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/export{nr as T,ft as e,b as g,q,dr as r};
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./dotlottie-audio-75C54RUV.Dab6ZNcp.js","./chunk-HDDX7F4A.Ctccelsq.js","./lottie_worker-Q23FJ6ZR-YP5OKMTN.l-cIQIE3.js","./lottie_light-KMJEUZFY-TNG7ODX7.WXkf8WqY.js","./lottie_svg-MJGYILXD-NRTSROOT.BePWeu7F.js","./lottie_light_canvas-B5UTTNXA-PRI6IBWW.H6XMkBUb.js","./lottie_canvas-CDSUBMCL-MZNYH5VV.BxmowW6m.js","./lottie_light_html-SLCECTRT-SYWXEBDN.Cb5GXSPb.js","./lottie_html-X3TYKVQI-L6774NQS.D-FsIa71.js"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}
