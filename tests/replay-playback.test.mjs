import test from 'node:test';
import assert from 'node:assert/strict';
import {ReplayPlayback} from '../replay-playback.js';
test('automatic replay advances, pauses, changes speed and stops at the buzzer',()=>{const r=new ReplayPlayback();r.play(120,0);assert.equal(r.tick(2),2);r.pause();assert.equal(r.tick(5),2);r.play(120);r.rate=2;assert.equal(r.tick(3),8);assert.equal(r.tick(100),120);assert.equal(r.playing,false);assert.equal(r.play(120,120),0);});
test('looping wraps within the available recording rather than running live physics',()=>{const r=new ReplayPlayback();r.loop=true;r.play(600,599,420);assert.equal(r.tick(2),421);assert.equal(r.playing,true);r.pause();assert.equal(r.tick(1),421);});
test('empty recordings do not play and invalid time increments do not advance',()=>{const r=new ReplayPlayback();r.play(0);assert.equal(r.playing,false);r.play(15,5);assert.equal(r.tick(-1),5);assert.equal(r.tick(NaN),5);});
