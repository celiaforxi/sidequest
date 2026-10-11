// All durations, costs, zones and transit estimates are authored demo data.
export const INTERESTS = ['美食', '城市漫步', '艺术文化', '购物', '咖啡', '拍照'];
export const MOODS = ['随心逛逛', '慢慢放空', '多点探索'];
export const ENERGY = ['只想歇歇，留一个小惊喜', '轻松走走，给休息留点时间', '不赶不慢，刚刚好的节奏', '状态不错，去发现更多', '电量满格，尽情探索'];
const place = (id, title, area, category, indoor, duration, cost, zone, description, aliases = []) => ({ id, title, area, category, indoor, duration, cost, zone, description, aliases });
export const CITIES = {
  东京: { english: 'TOKYO', areas: ['涩谷','原宿','表参道'], places: [
    place('tokyo-cafe','从一杯咖啡开始','涩谷','咖啡',true,45,45,0,'找个靠窗的位置，慢慢进入今天的节奏。'),
    place('meiji','明治神宫','原宿','城市漫步',false,75,0,1,'沿着参道走走，把喧闹暂时留在城市里。',['Meiji Shrine']),
    place('omotesando','表参道街区','表参道','拍照',false,60,0,2,'看看建筑和小店，不必急着走到终点。',['Omotesando']),
    place('tokyo-lunch','街角日式定食','表参道','美食',true,60,85,2,'留出一顿认真吃饭的时间；店铺为演示占位。'),
    place('nezu','根津美术馆 · 室内展厅','表参道','艺术文化',true,90,90,2,'给展览留一点耐心；开放与购票信息请自行核实。',['根津美术馆']),
    place('shibuya','涩谷十字路口','涩谷','拍照',false,40,0,0,'在人潮交汇处，感受东京的另一种速度。',['Shibuya Crossing','涩谷路口']),
    place('shibuya-parco','涩谷 PARCO','涩谷','购物',true,70,0,0,'在室内逛逛设计和生活方式商店。',['PARCO']),
    place('tokyo-dinner','一顿暖心的晚餐','涩谷','美食',true,60,100,0,'餐厅待选择；此处只预留吃饭的时间。')
  ]},
  巴黎: { english:'PARIS', areas:['左岸','卢浮宫','玛黑区'], places:[
    place('paris-cafe','左岸咖啡时光','左岸','咖啡',true,45,60,0,'喝一杯咖啡，给旅程一个缓缓的开始。'),
    place('louvre','卢浮宫','卢浮宫','艺术文化',true,150,180,1,'示例预留两个半小时；实际预约与开放时间待核实。',['Louvre']),
    place('tuileries','杜乐丽花园','卢浮宫','城市漫步',false,60,0,1,'走走停停，留一些空白给花园。'),
    place('paris-lunch','街区小馆午餐','卢浮宫','美食',true,60,140,1,'餐馆待选择，费用为人民币演示估算。'),
    place('orsay','奥赛博物馆','左岸','艺术文化',true,100,120,0,'室内展览候选；具体开放与预约信息待核实。'),
    place('seine','塞纳河畔散步','左岸','拍照',false,60,0,0,'给河岸和沿途风景留出时间。'),
    place('marais','玛黑区小店','玛黑区','购物',true,70,0,2,'用室内小店串起一段闲逛时间。'),
    place('paris-dinner','法式小馆晚餐','左岸','美食',true,65,180,0,'餐厅为占位，消费仅供演示。')
  ]},
  首尔: { english:'SEOUL', areas:['弘大','景福宫','明洞'], places:[
    place('seoul-cafe','弘大咖啡时光','弘大','咖啡',true,45,45,0,'坐下来喝杯咖啡，今天慢慢开始。'),
    place('gyeongbok','景福宫','景福宫','艺术文化',false,90,25,1,'庭院与宫殿的示例游览，开放时间待核实。'),
    place('bukchon','北村韩屋街区','景福宫','拍照',false,60,0,1,'街巷漫步；实际参观时段与社区规则待核实。'),
    place('seoul-lunch','韩式家常午餐','景福宫','美食',true,60,70,1,'给午餐留出完整的一小时。'),
    place('seoul-museum','国立现代美术馆 · 首尔馆','景福宫','艺术文化',true,90,45,1,'雨天室内候选；具体展览与营业信息待核实。'),
    place('hongdae','弘大街区散步','弘大','城市漫步',false,60,0,0,'去街角找找让你想停下的地方。'),
    place('myeongdong','明洞室内商店','明洞','购物',true,70,0,2,'逛店为示例；实际店铺仍需选择。'),
    place('seoul-dinner','韩式烤肉晚餐','弘大','美食',true,70,110,0,'餐厅待选择，示例费用不含额外加点。')
  ]}
};
export function cityKey(city) { const key=city.trim().toLowerCase(); return ({tokyo:'东京',paris:'巴黎',seoul:'首尔'})[key] || city.trim(); }
export function catalogFor(city, hotel) {
  const known=CITIES[cityKey(city)];
  if(known) return { ...known, known:true, places:known.places.map(p=>({...p})) };
  return {known:false,english:'A NEW ADVENTURE',areas:[hotel],places:[
    place('custom-cafe','住宿附近的咖啡店（待选择）',hotel,'咖啡',true,45,40,0,'通用占位，未检索真实店铺。'),
    place('custom-walk',`${city}街区漫步（待选区域）`,hotel,'城市漫步',false,60,0,0,'通用占位，路线与可步行性待核实。'),
    place('custom-photo','城市拍照点（待选择）',hotel,'拍照',false,45,0,0,'通用占位，未核实位置。'),
    place('custom-lunch','当地风味午餐（待选店）',hotel,'美食',true,60,70,0,'通用占位，不代表真实餐厅。'),
    place('custom-art','室内展览（待选择）',hotel,'艺术文化',true,90,60,0,'通用占位，开放与票价待核实。'),
    place('custom-rest','住宿附近休息',hotel,'咖啡',true,45,0,0,'可回住宿休息，不增加餐饮开销。'),
    place('custom-shop','室内商店（待选择）',hotel,'购物',true,60,0,0,'通用占位，购物支出不计入估算。'),
    place('custom-dinner','当地晚餐（待选店）',hotel,'美食',true,60,90,0,'通用占位，具体店铺待选择。')
  ]};
}
