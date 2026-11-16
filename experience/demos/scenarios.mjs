export const SCENARIOS = [
  {id:'standard',name:'Evening room',prices:[5,15,20,40,60,100,200,500],markup:20,description:'The current player menu, with low-cost actions and a rare special request.'},
  {id:'equal',name:'Equal-price actions',prices:[100,100,100,100],markup:20,description:'Equal direct prices produce equal chances.'},
  {id:'premium',name:'Premium menu',prices:[10000,20000,50000,100000],markup:30,description:'Prices above 5,000 work without an arbitrary price cap.'},
  {id:'two',name:'Simple 1:2 ratio',prices:[100,200],markup:20,description:'The 200-token action has half the chance of the 100-token action, before ppm rounding.'}
];
