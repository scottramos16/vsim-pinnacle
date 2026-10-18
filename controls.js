export const CONTROL_ACTIONS = {
  forward: 'Drive forward', backward: 'Drive backward', raise: 'Raise lift', lower: 'Lower lift',
  grab: 'Pick up / drop (toggle)', release: 'Drop / place (alternate key)', flip: 'Flip held object / stack',
  roller: 'Turn roller with rear bumper', loader: 'Select next loader', intake:'Run rear intake (hold)',pause: 'Pause',
  turnLeft:'Keyboard turn left',turnRight:'Keyboard turn right',precision:'Precision driving (hold)',
};
export const DEFAULT_BINDINGS = { forward:'KeyW', backward:'KeyS', raise:'KeyA', lower:'KeyD', grab:'KeyQ', release:'KeyE', flip:'KeyR', roller:'KeyF', loader:'KeyL', intake:'KeyI',pause:'Escape',turnLeft:'ArrowLeft',turnRight:'ArrowRight',precision:'ShiftLeft' };
export const SETTINGS_KEY = 'pinnacle-controls-v1';
export function keyName(code) {
  return code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : ({Space:'Space',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Left Shift',ShiftRight:'Right Shift'}[code] || code);
}
export function allowedKey(code) { return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Escape)$/.test(code); }
export const DECOR_COLORS={lime:'#c6f36b',purple:'#b18aff',orange:'#f2a24a',white:'#e5eee8',teal:'#51ccb7',pink:'#ef92c5',graphite:'#59646c'};
export function defaultSettings() { return {bindings:{...DEFAULT_BINDINGS},sensitivity:.003,invertMouse:false,driveSpeed:38,liftSpeed:23,acceleration:10,turnSpeed:1.8,cameraDistance:64,robotType:'cascade',decorColor:'lime',topper:'none'}; }
export function readSettings(storage) {
  const defaults=defaultSettings();
  try {
    const saved=JSON.parse(storage.getItem(SETTINGS_KEY));
    if(!saved || typeof saved!=='object')return defaults;
    const bindings={...DEFAULT_BINDINGS,...saved.bindings};
    // Add the new intake action without discarding older custom bindings that
    // already used I for driving, lifting, or another action.
    if(saved.bindings&&!Object.hasOwn(saved.bindings,'intake')){
      const used=new Set(Object.entries(bindings).filter(([name])=>name!=='intake').map(([,code])=>code));
      if(used.has(bindings.intake))bindings.intake=['KeyI','KeyU','KeyO','Digit0'].find(code=>!used.has(code))||'KeyW';
    }
    for(const action of ['turnLeft','turnRight','precision'])if(saved.bindings&&!Object.hasOwn(saved.bindings,action)){
      const used=new Set(Object.entries(bindings).filter(([name])=>name!==action).map(([,code])=>code));
      if(used.has(bindings[action]))bindings[action]=['KeyU','KeyO','ShiftRight','Digit0',...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`)].find(code=>!used.has(code));
    }
    const codes=Object.keys(CONTROL_ACTIONS).map(a=>bindings[a]);
    if(codes.every(allowedKey)&&new Set(codes).size===codes.length&&Object.keys(bindings).length===codes.length)defaults.bindings=bindings;
    if(Number.isFinite(saved.sensitivity)&&saved.sensitivity>=.001&&saved.sensitivity<=.008)defaults.sensitivity=saved.sensitivity;
    if(typeof saved.invertMouse==='boolean')defaults.invertMouse=saved.invertMouse;
    for(const [key,min,max] of [['driveSpeed',15,50],['liftSpeed',8,35],['acceleration',3,18],['turnSpeed',.5,3],['cameraDistance',45,100]])if(Number.isFinite(saved[key])&&saved[key]>=min&&saved[key]<=max)defaults[key]=saved[key];
    if(['cascade','dr4b'].includes(saved.robotType))defaults.robotType=saved.robotType;
    if(Object.hasOwn(DECOR_COLORS,saved.decorColor))defaults.decorColor=saved.decorColor;
    if(['none','beacon','crown','duck'].includes(saved.topper))defaults.topper=saved.topper;
  } catch { /* Unavailable/corrupt browser storage falls back to playable controls. */ }
  return defaults;
}
export function rebind(settings,action,code) {
  if(!Object.hasOwn(CONTROL_ACTIONS,action)||!allowedKey(code))return 'Choose a letter, number, arrow, Space, or Shift key.';
  if(code==='Escape'&&action!=='pause')return 'Escape is reserved for pausing and releasing the cursor.';
  const conflict=Object.keys(settings.bindings).find(a=>a!==action&&settings.bindings[a]===code);
  if(conflict)return `${keyName(code)} is already assigned to ${CONTROL_ACTIONS[conflict].toLowerCase()}.`;
  settings.bindings[action]=code;return null;
}
