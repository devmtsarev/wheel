import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardVariance} from './variance.mjs';
test('zero-value outcomes are included, not dropped and renormalized',()=>{const r=rewardVariance([{value:100,weight:80},{value:0,weight:20}]);assert.equal(r.ev,80);assert.equal(r.variance,1600);assert.equal(r.sd,40);assert.equal(r.cv,0.5);assert.equal(r.passes,true);});
test('scaling all prices scales variance but not CV',()=>{const rows=[{value:5,weight:80},{value:500,weight:1},{value:0,weight:19}],a=rewardVariance(rows),b=rewardVariance(rows.map(p=>({...p,value:p.value*10000})));assert.ok(Math.abs(a.cv-b.cv)<1e-12);assert.ok(Math.abs(b.variance/a.variance-1e8)<1e-6);assert.equal(a.passes,false);});
test('CV boundary is inclusive and zero EV cannot pass',()=>{const r=rewardVariance([{value:100,weight:20},{value:0,weight:80}]);assert.equal(r.cv,2);assert.equal(r.passes,true);assert.equal(rewardVariance([{value:0,weight:100}]).passes,false);});
test('incomplete and invalid distributions are rejected',()=>{for(const rows of [[],[{value:100,weight:80}],[{value:-1,weight:100}],[{value:1,weight:NaN}]])assert.throws(()=>rewardVariance(rows));});
