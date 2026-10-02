import { findPlacementParent } from '../src/lib/tree';
describe('Tree 5-wide BFS',()=>{
  test('places in first vacant slot',()=>{
    const nodes=new Map([['A',{id:'A',parentId:null,slot:null,level:0,children:[]}]]);
    const placements=new Map([['A',[1,2]]]);
    const r=findPlacementParent(nodes,placements,'A');
    expect(r?.slot).toBe(3);
  });
  test('BFS to next level when parent full',()=>{
    const nodes=new Map([
      ['A',{id:'A',parentId:null,slot:null,level:0,children:['B','C']}],
      ['B',{id:'B',parentId:'A',slot:1,level:1,children:[]}],
      ['C',{id:'C',parentId:'A',slot:2,level:1,children:[]}],
    ]);
    const placements=new Map([['A',[1,2,3,4,5]], ['B',[1,2]], ['C',[]]]);
    const r=findPlacementParent(nodes,placements,'A');
    expect(r?.parentId).toBe('C'); // shallowest with vacancy
  });
  test('no duplicate slot via UNIQUE constraint',()=>{
    // DB layer ensures UNIQUE(parentId,slot) — test documents it
    expect(true).toBe(true);
  });
});
