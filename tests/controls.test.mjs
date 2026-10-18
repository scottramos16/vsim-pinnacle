import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,readSettings,rebind,keyName,SETTINGS_KEY} from '../controls.js';

test('settings load defaults, survive storage errors, and validate corrupt content',()=>{
  assert.deepEqual(readSettings({getItem:()=>null}),defaultSettings());
  assert.deepEqual(readSettings({getItem:()=>{throw Error('blocked');}}),defaultSettings());
  assert.deepEqual(readSettings({getItem:()=>'{invalid'}),defaultSettings());
  const bad={...defaultSettings(),bindings:{...defaultSettings().bindings,grab:'KeyW'},sensitivity:100};
  assert.deepEqual(readSettings({getItem:()=>JSON.stringify(bad)}),defaultSettings());
});
test('rebindings reject conflicts and browser shortcuts, preserve Escape as emergency pause',()=>{
  const s=defaultSettings();assert.equal(rebind(s,'forward','ArrowUp'),null);assert.equal(s.bindings.forward,'ArrowUp');
  assert.match(rebind(s,'grab','ArrowUp'),/already assigned/);assert.equal(s.bindings.grab,'KeyQ');
  assert.match(rebind(s,'grab','Escape'),/reserved/);assert.match(rebind(s,'grab','F5'),/Choose/);
  assert.equal(rebind(s,'pause','KeyP'),null);assert.equal(rebind(s,'pause','Escape'),null);
});
test('custom keybindings, steering sensitivity and inversion persist on load',()=>{
  const s=defaultSettings();rebind(s,'grab','Space');s.sensitivity=.006;s.invertMouse=true;
  const loaded=readSettings({getItem:key=>{assert.equal(key,SETTINGS_KEY);return JSON.stringify(s);}});
  assert.deepEqual(loaded,s);assert.equal(keyName(loaded.bindings.grab),'Space');assert.equal(keyName('ArrowUp'),'↑');
});
test('adding intake preserves older custom controls even when I was already used',()=>{
  const old=defaultSettings();delete old.bindings.intake;old.bindings.forward='KeyI';
  const loaded=readSettings({getItem:()=>JSON.stringify(old)});
  assert.equal(loaded.bindings.forward,'KeyI');assert.equal(loaded.bindings.intake,'KeyU');
});
